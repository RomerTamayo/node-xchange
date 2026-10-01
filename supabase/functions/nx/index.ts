// NodeXchange node: a public, signature-authenticated mailbox.
//
//   GET  /nx/info             node metadata
//   GET  /nx/keys/:address    device certificate of a registered user
//   POST /nx                  signed request (register, send, inbox, ack, ...)
//
// Anyone may call it (no API key): every POST is verified against the sender's
// wallet-signed device certificate, and message contents are end-to-end
// encrypted, so the node only ever sees ciphertext.

import { createClient } from "@supabase/supabase-js";
import {
  MAX_MESSAGE_CHARS,
  PROTOCOL_VERSION,
  ProtocolError,
  READ_TTL_MS,
  UNREAD_TTL_MS,
  normalizeAlias,
  validateEnvelope,
  verifyRequest,
  type CertBody,
  type RequestBody,
  type SignedRequest,
} from "../../../packages/core/src/protocol.ts";
import { isAddress } from "../../../packages/core/src/encoding.ts";

const NODE_URL = Deno.env.get("NX_NODE_URL") ?? "";
const NODE_NAME = Deno.env.get("NX_NODE_NAME") ?? "NodeXchange node";
const OPERATOR = Deno.env.get("NX_OPERATOR") ?? "";
const TRANSFER_FEE_BPS = Number(Deno.env.get("NX_TRANSFER_FEE_BPS") ?? "0");
const HORIZON_URL = Deno.env.get("NX_HORIZON_URL") ?? "https://horizon-testnet.stellar.org";
/** Max messages a sender may push to one recipient per minute. */
const RATE_PER_MINUTE = 20;
const INBOX_LIMIT = 200;

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });

const fail = (code: string, error: string, status: number) => json({ code, error }, status);

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  // Pathname looks like /nx/..., or /functions/v1/nx/... behind some proxies.
  const path = new URL(req.url).pathname.replace(/^.*?\/nx(?=\/|$)/, "") || "/";

  try {
    if (req.method === "GET" && path === "/info") return info();
    if (req.method === "GET" && path.startsWith("/keys/")) return await keys(path.slice(6));
    if (req.method === "POST" && path === "/") return await handle(await req.json());
    return fail("not_found", "no such route", 404);
  } catch (e) {
    if (e instanceof ProtocolError) return fail(e.code, e.message, e.status);
    console.error(e);
    return fail("internal", "internal error", 500);
  }
});

function info() {
  return json({
    name: NODE_NAME,
    version: PROTOCOL_VERSION,
    maxChars: MAX_MESSAGE_CHARS,
    operator: OPERATOR,
    transferFeeBps: TRANSFER_FEE_BPS,
  });
}

async function keys(address: string) {
  if (!isAddress(address)) return fail("bad_address", "invalid address", 400);
  const row = check(
    await db
      .from("nx_devices")
      .select("cert_body, cert_sig, profile_req, profile_sig")
      .eq("address", address)
      .maybeSingle(),
  );
  if (!row) return fail("unknown_peer", "address not registered on this node", 404);
  return json({
    cert: { body: row.cert_body, sig: row.cert_sig },
    profile: row.profile_req ? { req: row.profile_req, sig: row.profile_sig } : null,
  });
}

async function handle(signed: SignedRequest) {
  const { cert, body } = await verifyRequest(signed, { node: NODE_URL || undefined });
  if (body.action === "register") return await register(signed, cert);
  if (body.action === "send") return await send(signed, cert, body);
  // The sender of a message may live on another node.
  if (body.action === "unsend") return await unsend(cert.address, body.data.id);

  // Everything else acts on the caller's own mailbox: the device must be the
  // one currently registered here (re-registering revokes older devices).
  await requireRegistered(signed, cert);
  switch (body.action) {
    case "inbox":
      return await inbox(cert.address);
    case "ack":
      return await ack(cert.address, ids(body.data.ids));
    case "delete":
      check(await db.from("nx_messages").delete().eq("recipient", cert.address).in("id", ids(body.data.ids)));
      return json({ ok: true });
    case "contact":
      return await contact(cert.address, body.data.peer, body.data.status);
    case "profile":
      return await profile(signed, cert.address, body.data.alias);
  }
  return fail("bad_request", "unknown action", 400);
}

async function requireRegistered(signed: SignedRequest, cert: CertBody) {
  const row = check(
    await db.from("nx_devices").select("cert_body").eq("address", cert.address).maybeSingle(),
  );
  if (row?.cert_body !== signed.cert.body) {
    throw new ProtocolError("not_registered", "this device is not registered on this node", 403);
  }
}

function ids(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > INBOX_LIMIT || !value.every((v) => typeof v === "string")) {
    throw new ProtocolError("bad_request", "ids must be a list of message ids");
  }
  return value;
}

async function register(signed: SignedRequest, cert: CertBody) {
  if (NODE_URL && cert.node !== NODE_URL) {
    throw new ProtocolError("wrong_node", "certificate names another home node", 400);
  }
  check(
    await db.from("nx_devices").upsert({
      address: cert.address,
      cert_body: signed.cert.body,
      cert_sig: signed.cert.sig,
      // A new device can't vouch for a profile signed by the previous one.
      profile_req: null,
      profile_sig: null,
      updated_at: new Date().toISOString(),
    }),
  );
  return json({ ok: true });
}

/** Stores the signed request itself; clients verify it with the device key. */
async function profile(signed: SignedRequest, address: string, alias: string | null) {
  const clean = normalizeAlias(alias);
  check(
    await db
      .from("nx_devices")
      .update({
        profile_req: clean ? signed.req : null,
        profile_sig: clean ? signed.sig : null,
        updated_at: new Date().toISOString(),
      })
      .eq("address", address),
  );
  return json({ ok: true, alias: clean });
}

async function contactStatus(owner: string, peer: string): Promise<string | null> {
  const row = check(
    await db.from("nx_contacts").select("status").eq("owner", owner).eq("peer", peer).maybeSingle(),
  );
  return row?.status ?? null;
}

async function accountExists(address: string): Promise<boolean> {
  const res = await fetch(`${HORIZON_URL}/accounts/${address}`);
  await res.body?.cancel();
  return res.ok;
}

async function send(signed: SignedRequest, cert: CertBody, body: RequestBody & { action: "send" }) {
  const envelope = body.data.envelope;
  validateEnvelope(envelope, cert.address);
  const recipient = envelope.to;

  const known = check(
    await db.from("nx_devices").select("address").eq("address", recipient).maybeSingle(),
  );
  if (!known) throw new ProtocolError("unknown_peer", "recipient is not registered on this node", 404);

  const status = await contactStatus(recipient, cert.address);
  if (status === "blocked") throw new ProtocolError("blocked", "the recipient blocked you", 403);

  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await db
    .from("nx_messages")
    .select("id", { count: "exact", head: true })
    .eq("recipient", recipient)
    .eq("sender", cert.address)
    .gte("created_at", since);
  if ((count ?? 0) >= RATE_PER_MINUTE) {
    throw new ProtocolError("rate_limited", "too many messages, slow down", 429);
  }

  // Strangers get a single message until the recipient accepts them.
  const isRequest = status !== "accepted";
  if (isRequest) {
    const pending = await db
      .from("nx_messages")
      .select("id", { count: "exact", head: true })
      .eq("recipient", recipient)
      .eq("sender", cert.address)
      .gt("expires_at", new Date().toISOString());
    if ((pending.count ?? 0) > 0) {
      throw new ProtocolError("request_pending", "wait until the recipient accepts your request", 429);
    }
    if (!(await accountExists(cert.address))) {
      throw new ProtocolError("no_account", "your Stellar account must exist to message strangers", 403);
    }
  }

  const insert = await db.from("nx_messages").insert({
    id: envelope.id,
    recipient,
    sender: cert.address,
    envelope,
    sender_cert: signed.cert,
    is_request: isRequest,
    expires_at: new Date(Date.now() + UNREAD_TTL_MS).toISOString(),
  });
  if (insert.error?.code === "23505") throw new ProtocolError("duplicate", "message already delivered", 409);
  check(insert);

  // Writing to someone means you accept their replies (when you live here too).
  const senderHere = check(
    await db.from("nx_devices").select("address").eq("address", cert.address).maybeSingle(),
  );
  if (senderHere && (await contactStatus(cert.address, recipient)) === null) {
    check(await db.from("nx_contacts").upsert({ owner: cert.address, peer: recipient, status: "accepted" }));
  }

  return json({ ok: true, id: envelope.id, request: isRequest });
}

async function inbox(address: string) {
  const rows = check(
    await db
      .from("nx_messages")
      .select("sender, envelope, sender_cert, is_request, read_at, expires_at")
      .eq("recipient", address)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(INBOX_LIMIT),
  );
  const accepted = new Set(
    check(await db.from("nx_contacts").select("peer").eq("owner", address).eq("status", "accepted"))
      .map((c: { peer: string }) => c.peer),
  );
  return json({
    items: rows.map((r) => ({
      envelope: r.envelope,
      senderCert: r.sender_cert,
      request: r.is_request && !accepted.has(r.sender),
      readAt: r.read_at ? Date.parse(r.read_at) : null,
      expiresAt: Date.parse(r.expires_at),
    })),
  });
}

async function ack(address: string, messageIds: string[]) {
  const now = Date.now();
  check(
    await db
      .from("nx_messages")
      .update({
        read_at: new Date(now).toISOString(),
        expires_at: new Date(now + READ_TTL_MS).toISOString(),
      })
      .eq("recipient", address)
      .is("read_at", null)
      .in("id", messageIds),
  );
  return json({ ok: true });
}

async function contact(owner: string, peer: string, status: string) {
  if (!isAddress(peer) || peer === owner) throw new ProtocolError("bad_address", "invalid peer");
  if (status === "none") {
    check(await db.from("nx_contacts").delete().eq("owner", owner).eq("peer", peer));
  } else if (status === "accepted" || status === "blocked") {
    check(
      await db.from("nx_contacts").upsert({ owner, peer, status, updated_at: new Date().toISOString() }),
    );
    if (status === "blocked") {
      check(await db.from("nx_messages").delete().eq("recipient", owner).eq("sender", peer));
    }
  } else {
    throw new ProtocolError("bad_request", "unknown contact status");
  }
  return json({ ok: true });
}

/** Sender takes back a message the recipient has not read yet. */
async function unsend(sender: string, id: string) {
  const deleted = check(
    await db.from("nx_messages").delete().eq("id", id).eq("sender", sender).is("read_at", null).select("id"),
  );
  return json({ deleted: deleted.length > 0 });
}
