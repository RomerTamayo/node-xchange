// End-to-end check of external payment methods against a running node and testnet.
//   node --experimental-strip-types scripts/e2e-extpay.ts [nodeUrl]

import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";
import {
  Session,
  Stellar,
  extDataKey,
  extMethodHash,
  extMethodMessage,
  keypairSigner,
  keypairTxSigner,
  newExtMethodId,
  verifyExtRecord,
  type ExtMethod,
  type ExtMethodRecord,
} from "../src/index.ts";

const NODE = process.argv[2] ?? "http://127.0.0.1:54321/functions/v1/nx";
const stellar = new Stellar();
const dataEntry = (a: string, k: string) => stellar.dataEntry(a, k);
const step = (s: string) => console.log(`✔ ${s}`);

const kp = Keypair.random();
await stellar.fund(kp.publicKey());
const alice = await Session.create(kp.publicKey(), NODE, keypairSigner(kp.secret()), stellar);
await alice.register();
const bobKp = Keypair.random();
const bob = await Session.create(bobKp.publicKey(), NODE, keypairSigner(bobKp.secret()), stellar);
await bob.register();

const method = (address: string): ExtMethod => ({
  v: 1,
  id: newExtMethodId(),
  owner: alice.address,
  network: "bep20",
  asset: "USDT",
  address,
  label: "Binance",
  iat: Date.now(),
});

const unsigned: ExtMethodRecord = { method: method("0x52908400098527886E0F7030069857D2E4169EE7"), security: "none" };
const signedM = method("0x8ba1f109551bD432803012645Ac136ddd64DBA72");
const signed: ExtMethodRecord = {
  method: signedM,
  security: "signed",
  sig: await keypairSigner(kp.secret())(extMethodMessage(signedM)),
};
const chainM = method("0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B");
await stellar.anchorExtMethod(alice.address, extDataKey(chainM.id), await extMethodHash(chainM), keypairTxSigner(kp.secret()));
const chain: ExtMethodRecord = { method: chainM, security: "chain" };
step("anchored a method hash on testnet");

await alice.setMethods([unsigned, signed, chain]);
const seen = (await bob.peer(alice.address)).methods;
assert.equal(seen.length, 3);
assert.deepEqual(
  await Promise.all(seen.map((r) => verifyExtRecord(r, alice.address, dataEntry))),
  ["unsigned", "signed", "chain"],
);
step("another user reads the public methods with the right verdicts");

const tampered = { ...chain, method: { ...chainM, address: "0x0000000000000000000000000000000000000001" } };
assert.equal(await verifyExtRecord(tampered, alice.address, dataEntry), "invalid");
step("a swapped anchored address is flagged");

await alice.send(bob.address, { t: "method", rec: signed });
const inbox = await bob.inbox();
assert.equal(inbox[0].payload.t, "method");
step("a private method travels encrypted in the chat");

await stellar.anchorExtMethod(alice.address, extDataKey(chainM.id), null, keypairTxSigner(kp.secret()));
assert.equal(await verifyExtRecord(chain, alice.address, dataEntry), "invalid");
await alice.setMethods([]);
assert.equal((await bob.peer(alice.address)).methods.length, 0);
step("removing releases the data entry and clears the profile");
