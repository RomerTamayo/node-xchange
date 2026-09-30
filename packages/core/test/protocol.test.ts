import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";
import {
  ProtocolError,
  createDeviceKeys,
  decodeAddress,
  issueCert,
  keypairSigner,
  openEnvelope,
  parseCertBody,
  sealPayload,
  signRequest,
  toBase64,
  verifyCert,
  verifyRequest,
  verifyWalletSignature,
} from "../src/index.ts";

const NODE = "https://node.example/functions/v1/nx";

async function user() {
  const kp = Keypair.random();
  const keys = createDeviceKeys();
  const cert = await issueCert(kp.publicKey(), keys, NODE, keypairSigner(kp.secret()));
  return { kp, keys, cert, address: kp.publicKey() };
}

test("decodeAddress matches the SDK and rejects bad checksums", () => {
  const kp = Keypair.random();
  assert.deepEqual(decodeAddress(kp.publicKey()), Uint8Array.from(kp.rawPublicKey()));
  const bad = kp.publicKey().slice(0, 55) + (kp.publicKey()[55] === "A" ? "B" : "A");
  assert.throws(() => decodeAddress(bad));
});

test("SEP-53 signatures verify and bind to the message", async () => {
  const kp = Keypair.random();
  const sig = await keypairSigner(kp.secret())("hola NodeXchange");
  assert.equal(await verifyWalletSignature(kp.publicKey(), "hola NodeXchange", sig), true);
  assert.equal(await verifyWalletSignature(kp.publicKey(), "otro mensaje", sig), false);
  assert.equal(await verifyWalletSignature(Keypair.random().publicKey(), "hola NodeXchange", sig), false);
});

test("SEP-53 matches the spec's reference vector", async () => {
  // Test vector from SEP-53 ("Hello, World!").
  const kp = Keypair.fromSecret("SAKICEVQLYWGSOJS4WW7HZJWAHZVEEBS527LHK5V4MLJALYKICQCJXMW");
  const sig = await keypairSigner(kp.secret())("Hello, World!");
  assert.equal(
    sig,
    "fO5dbYhXUhBMhe6kId/cuVq/AfEnHRHEvsP8vXh03M1uLpi5e46yO2Q8rEBzu3feXQewcQE5GArp88u6ePK6BA==",
  );
});

test("cert signed by the wallet verifies; tampered cert does not", async () => {
  const u = await user();
  assert.equal((await verifyCert(u.cert)).address, u.address);

  const body = parseCertBody(u.cert.body);
  const forged = { ...u.cert, body: JSON.stringify({ ...body, node: "https://evil.example" }) };
  await assert.rejects(verifyCert(forged), ProtocolError);
});

test("signed requests verify, and stale/wrong-node/forged ones fail", async () => {
  const u = await user();
  const signed = signRequest(u.keys, u.cert, NODE, { action: "inbox", data: {} });
  const { cert, body } = await verifyRequest(signed, { node: NODE });
  assert.equal(cert.address, u.address);
  assert.equal(body.action, "inbox");

  await assert.rejects(verifyRequest(signed, { node: NODE, now: Date.now() + 10 * 60_000 }), /timestamp/);
  await assert.rejects(verifyRequest(signed, { node: "https://other.example" }), /another node/);

  const other = await user();
  const stolen = { ...signed, cert: other.cert }; // someone else's cert, my signature
  await assert.rejects(verifyRequest(stolen), /signature/);
});

test("messages are end-to-end encrypted between devices", async () => {
  const alice = await user();
  const bob = await user();
  const env = sealPayload(alice.keys, alice.address, parseCertBody(bob.cert.body), {
    t: "text",
    body: "¿Sigue disponible?",
  });
  assert.equal(env.to, bob.address);

  const payload = await openEnvelope(bob.keys, env, alice.cert);
  assert.deepEqual(payload, { t: "text", body: "¿Sigue disponible?" });

  const eve = await user();
  await assert.rejects(openEnvelope(eve.keys, env, alice.cert), /decrypt/);
  // Node swaps the sender cert: rejected because the address doesn't match.
  await assert.rejects(openEnvelope(bob.keys, env, eve.cert), /does not match/);
});

test("text messages are capped at 100 characters", async () => {
  const a = await user();
  const b = parseCertBody((await user()).cert.body);
  assert.doesNotThrow(() => sealPayload(a.keys, a.address, b, { t: "text", body: "ñ".repeat(100) }));
  assert.throws(() => sealPayload(a.keys, a.address, b, { t: "text", body: "x".repeat(101) }), /100/);
});

test("base64 helper round-trips binary", () => {
  assert.equal(toBase64(Uint8Array.from([0, 255, 128])), "AP+A");
});
