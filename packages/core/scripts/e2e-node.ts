// End-to-end check against a running node (default: local Supabase).
//   node --experimental-strip-types scripts/e2e-node.ts [nodeUrl]
// Creates fresh testnet accounts, so it needs internet (Horizon + Friendbot).

import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";
import { Session, Stellar, keypairSigner, signRequest, NodeClient, type ProtocolError } from "../src/index.ts";

const NODE = process.argv[2] ?? "http://127.0.0.1:54321/functions/v1/nx";
const stellar = new Stellar();

async function newUser(name: string, fund = true) {
  const kp = Keypair.random();
  if (fund) await stellar.fund(kp.publicKey());
  const session = await Session.create(kp.publicKey(), NODE, keypairSigner(kp.secret()), stellar);
  await session.register();
  console.log(`  ${name}: ${kp.publicKey()}`);
  return session;
}

async function expectCode(p: Promise<unknown>, code: string) {
  await assert.rejects(p, (e: ProtocolError) => {
    assert.equal(e.code, code);
    return true;
  });
}

const step = (s: string) => console.log(`✔ ${s}`);

console.log(`node: ${NODE}`);
console.log(JSON.stringify(await new NodeClient(NODE).info()));
const [alice, bob, carol] = await Promise.all([newUser("alice"), newUser("bob"), newUser("carol", false)]);

// 1. A stranger's first message arrives as a request.
await alice.send(bob.address, { t: "text", body: "Hola, ¿sigue disponible la guitarra?" });
let inbox = await bob.inbox();
assert.equal(inbox.length, 1);
assert.equal(inbox[0].request, true);
assert.deepEqual(inbox[0].payload, { t: "text", body: "Hola, ¿sigue disponible la guitarra?" });
step("first message from a stranger arrives decrypted, flagged as request");

// 2. Only one message until accepted.
await expectCode(alice.send(bob.address, { t: "text", body: "¿hola?" }), "request_pending");
step("second message before acceptance is refused");

// 3. Unfunded accounts can't message strangers.
await expectCode(carol.send(bob.address, { t: "text", body: "spam" }), "no_account");
step("sender without a Stellar account cannot message strangers");

// 4. Accepting lets the conversation flow.
await bob.setContact(alice.address, "accepted");
await alice.send(bob.address, { t: "text", body: "¡Genial! te pago por escrow" });
inbox = await bob.inbox();
assert.equal(inbox.length, 2);
assert.ok(inbox.every((m) => !m.request));
step("after accepting, messages flow and are no longer requests");

// 5. Alice wrote to bob first, so bob's replies are not requests for her.
await bob.send(alice.address, { t: "text", body: "Dale, te espero" });
const aliceInbox = await alice.inbox();
assert.equal(aliceInbox.length, 1);
assert.equal(aliceInbox[0].request, false);
step("replies are not requests (writing to someone accepts their replies)");

// 6. Reading shortens the lifetime to 48 hours.
await bob.ack(inbox.map((m) => m.id));
inbox = await bob.inbox();
const hours = (inbox[0].expiresAt - Date.now()) / 3_600_000;
assert.ok(inbox[0].readAt && hours > 47 && hours <= 48, `expires in ${hours}h`);
step("read messages now expire in 48 hours");

// 7. Unsend works only while unread.
const env = await alice.send(bob.address, { t: "text", body: "ups, número equivocado" });
assert.deepEqual(await alice.unsend(bob.address, env.id), { deleted: true });
assert.deepEqual(await alice.unsend(bob.address, inbox[0].id), { deleted: false });
step("unsend deletes unread messages only");

// 8. The 100-character limit is enforced client-side.
await assert.rejects(alice.send(bob.address, { t: "text", body: "x".repeat(101) }), /100/);
step("messages over 100 characters are rejected");

// 9. Forged requests are rejected by the node.
const signed = signRequest(alice.state.keys, alice.state.cert, NODE, { action: "inbox", data: {} });
const tampered = { ...signed, cert: bob.state.cert };
await expectCode(new NodeClient(NODE).post(tampered), "bad_signature");
step("a request signed by someone else's device is rejected");

// 10. Blocking stops messages and wipes pending ones.
await bob.setContact(alice.address, "blocked");
await expectCode(alice.send(bob.address, { t: "text", body: "?" }), "blocked");
assert.equal((await bob.inbox()).length, 0);
step("blocked senders are refused and their messages removed");

// 11. Deleting from the node.
await bob.setContact(alice.address, "none");
await bob.send(alice.address, { t: "text", body: "borra esto" });
const [msg] = (await alice.inbox()).filter((m) => m.payload.t === "text" && m.payload.body === "borra esto");
await alice.deleteFromNode([msg.id]);
assert.ok(!(await alice.inbox()).some((m) => m.id === msg.id));
step("recipients can delete messages from their node");

console.log("\nall node checks passed");
