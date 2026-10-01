// NodeXchange wire protocol. Shared by the node (Deno) and clients, so it must
// only depend on tweetnacl and Web APIs.
//
// Identity model:
// - The wallet key (Stellar account) owns the identity and signs payments.
// - A device key pair (ed25519 for signing, x25519 for encryption) does the
//   chatting. The wallet authorises it once by signing a DeviceCert (SEP-53).
// - Every request to a node is signed by the device key and carries the cert,
//   so any node can verify any sender without a shared directory.

import nacl from "tweetnacl";
import { decodeAddress, fromBase64, isAddress, utf8 } from "./encoding.ts";

export const PROTOCOL_VERSION = 1;
/** Maximum characters of a text message. */
export const MAX_MESSAGE_CHARS = 100;
/** Upper bound for an encrypted payload (text, payment or deal notice). */
export const MAX_BOX_BYTES = 1024;
/** Signed requests older/newer than this are rejected. */
export const REQUEST_MAX_SKEW_MS = 120_000;
/** Unread messages expire after 15 days, read ones 48 hours after reading. */
export const UNREAD_TTL_MS = 15 * 24 * 60 * 60 * 1000;
export const READ_TTL_MS = 48 * 60 * 60 * 1000;
/** Stellar account data entry where a user publishes their node URL. */
export const NODE_DATA_KEY = "nx.node";
/** Display alias chosen by the user. Not unique and not searchable. */
export const MAX_ALIAS_CHARS = 24;

const SEP53_PREFIX = "Stellar Signed Message:\n";

export interface CertBody {
  v: 1;
  address: string;
  signPub: string; // base64 ed25519
  boxPub: string; // base64 x25519
  node: string; // URL of the user's home node
  iat: number;
}

/** A device authorisation: `sig` is the wallet's SEP-53 signature over `body`. */
export interface DeviceCert {
  body: string;
  sig: string;
}

export interface Envelope {
  id: string;
  from: string;
  to: string;
  ts: number;
  nonce: string; // base64
  box: string; // base64 nacl.box ciphertext
}

export type Payload =
  | { t: "text"; body: string }
  | { t: "pay"; hash: string; amount: string; asset: string; fee?: string }
  | {
      t: "deal";
      contract: string;
      dealId: string;
      amount: string;
      asset: string;
      status: "funded" | "released" | "refunded";
      hash: string;
    };

export type Action =
  | { action: "register"; data: Record<string, never> }
  | { action: "send"; data: { envelope: Envelope } }
  | { action: "inbox"; data: { since?: number } }
  | { action: "ack"; data: { ids: string[] } }
  | { action: "delete"; data: { ids: string[] } }
  | { action: "unsend"; data: { id: string } }
  | { action: "contact"; data: { peer: string; status: "accepted" | "blocked" | "none" } }
  | { action: "profile"; data: { alias: string | null } };

export type RequestBody = Action & { ts: number; node: string };

/** What actually travels over HTTP: `sig` is the device's signature over `req`. */
export interface SignedRequest {
  cert: DeviceCert;
  req: string;
  sig: string;
}

export class ProtocolError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function sep53Hash(message: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", utf8(SEP53_PREFIX + message));
  return new Uint8Array(digest);
}

/** Verifies a SEP-53 signature (Freighter `signMessage`, or `Keypair.sign`). */
export async function verifyWalletSignature(
  address: string,
  message: string,
  signature: string,
): Promise<boolean> {
  try {
    const sig = fromBase64(signature);
    if (sig.length !== 64) return false;
    return nacl.sign.detached.verify(await sep53Hash(message), sig, decodeAddress(address));
  } catch {
    return false;
  }
}

function isB64Key(v: unknown): v is string {
  try {
    return typeof v === "string" && fromBase64(v).length === 32;
  } catch {
    return false;
  }
}

export function parseCertBody(body: string): CertBody {
  let c: CertBody;
  try {
    c = JSON.parse(body);
  } catch {
    throw new ProtocolError("bad_cert", "certificate is not JSON");
  }
  if (
    c?.v !== 1 ||
    !isAddress(c.address) ||
    !isB64Key(c.signPub) ||
    !isB64Key(c.boxPub) ||
    typeof c.node !== "string" ||
    typeof c.iat !== "number"
  ) {
    throw new ProtocolError("bad_cert", "malformed certificate");
  }
  return c;
}

export async function verifyCert(cert: DeviceCert): Promise<CertBody> {
  const body = parseCertBody(cert?.body);
  if (!(await verifyWalletSignature(body.address, cert.body, cert.sig))) {
    throw new ProtocolError("bad_cert", "certificate not signed by the wallet", 401);
  }
  return body;
}

/**
 * Checks the cert, the device signature, freshness and target node.
 * `node` is the verifying node's own URL; omit to skip that check.
 */
/**
 * A user's public profile as a node stores it: the signed "profile" request
 * itself, so clients can check it came from the user's device.
 */
export interface SignedProfile {
  req: string;
  sig: string;
}

/** Trims and validates an alias; null clears it. */
export function normalizeAlias(alias: string | null): string | null {
  if (alias === null) return null;
  const clean = alias.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  if ([...clean].length > MAX_ALIAS_CHARS || /[\p{Cc}​‪-‮⁦-⁩﻿]/u.test(clean)) {
    throw new ProtocolError("bad_alias", `alias must be 1-${MAX_ALIAS_CHARS} visible characters`);
  }
  return clean;
}

/** Returns the alias in a profile signed by the device in `cert`, or null. */
export function verifyProfile(cert: CertBody, profile: SignedProfile | null | undefined): string | null {
  if (!profile) return null;
  try {
    const ok = nacl.sign.detached.verify(
      utf8(profile.req),
      fromBase64(profile.sig),
      fromBase64(cert.signPub),
    );
    if (!ok) return null;
    const body = JSON.parse(profile.req) as RequestBody;
    if (body.action !== "profile") return null;
    return normalizeAlias(body.data.alias);
  } catch {
    return null;
  }
}

export async function verifyRequest(
  signed: SignedRequest,
  opts: { node?: string; now?: number } = {},
): Promise<{ cert: CertBody; body: RequestBody }> {
  if (typeof signed?.req !== "string" || typeof signed?.sig !== "string") {
    throw new ProtocolError("bad_request", "missing req or sig");
  }
  const cert = await verifyCert(signed.cert);

  let sigOk = false;
  try {
    sigOk = nacl.sign.detached.verify(
      utf8(signed.req),
      fromBase64(signed.sig),
      fromBase64(cert.signPub),
    );
  } catch {
    sigOk = false;
  }
  if (!sigOk) throw new ProtocolError("bad_signature", "request signature invalid", 401);

  let body: RequestBody;
  try {
    body = JSON.parse(signed.req);
  } catch {
    throw new ProtocolError("bad_request", "req is not JSON");
  }
  const now = opts.now ?? Date.now();
  if (typeof body.ts !== "number" || Math.abs(now - body.ts) > REQUEST_MAX_SKEW_MS) {
    throw new ProtocolError("stale_request", "request timestamp out of range", 401);
  }
  if (opts.node && body.node !== opts.node) {
    throw new ProtocolError("wrong_node", "request addressed to another node", 401);
  }
  return { cert, body };
}

export function validateEnvelope(env: Envelope, from: string): void {
  if (
    typeof env?.id !== "string" ||
    !/^[0-9a-f-]{36}$/.test(env.id) ||
    env.from !== from ||
    !isAddress(env.to) ||
    typeof env.ts !== "number"
  ) {
    throw new ProtocolError("bad_envelope", "malformed envelope");
  }
  let nonceLen = 0;
  let boxLen = 0;
  try {
    nonceLen = fromBase64(env.nonce).length;
    boxLen = fromBase64(env.box).length;
  } catch {
    throw new ProtocolError("bad_envelope", "envelope is not base64");
  }
  if (nonceLen !== nacl.box.nonceLength || boxLen === 0 || boxLen > MAX_BOX_BYTES) {
    throw new ProtocolError("bad_envelope", "envelope size out of range");
  }
}
