import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";
import {
  createDeviceKeys,
  extDataKey,
  extMethodHash,
  extMethodMessage,
  issueCert,
  keypairSigner,
  newExtMethodId,
  parseCertBody,
  signRequest,
  toBase64,
  validateExtMethod,
  verifyExtRecord,
  verifyMethods,
  type ExtMethod,
  type ExtMethodRecord,
} from "../src/index.ts";

const NODE = "https://node.example/functions/v1/nx";
const BEP20 = "0x52908400098527886E0F7030069857D2E4169EE7";

function method(owner: string, extra: Partial<ExtMethod> = {}): ExtMethod {
  return { v: 1, id: newExtMethodId(), owner, network: "bep20", asset: "USDT", address: BEP20, iat: Date.now(), ...extra };
}

const noChain = async () => null;

test("rejects malformed methods", () => {
  const owner = Keypair.random().publicKey();
  assert.doesNotThrow(() => validateExtMethod(method(owner)));
  assert.throws(() => validateExtMethod(method(owner, { address: "0x123" })));
  assert.throws(() => validateExtMethod(method(owner, { address: "bc1qxyz" })));
  assert.throws(() => validateExtMethod(method(owner, { asset: "DOGE" })));
  assert.throws(() => validateExtMethod(method(owner, { network: "erc20" as never })));
  assert.throws(() => validateExtMethod(method(owner, { label: "x".repeat(25) })));
});

test("unsigned methods are only 'unsigned', and must belong to the owner", async () => {
  const owner = Keypair.random().publicKey();
  const rec: ExtMethodRecord = { method: method(owner), security: "none" };
  assert.equal(await verifyExtRecord(rec, owner, noChain), "unsigned");
  assert.equal(await verifyExtRecord(rec, Keypair.random().publicKey(), noChain), "invalid");
});

test("wallet-signed methods verify, and any change breaks them", async () => {
  const kp = Keypair.random();
  const m = method(kp.publicKey());
  const rec: ExtMethodRecord = { method: m, security: "signed", sig: await keypairSigner(kp.secret())(extMethodMessage(m)) };
  assert.equal(await verifyExtRecord(rec, kp.publicKey(), noChain), "signed");

  const swapped = { ...rec, method: { ...m, address: "0x0000000000000000000000000000000000000001" } };
  assert.equal(await verifyExtRecord(swapped, kp.publicKey(), noChain), "invalid");

  const other = Keypair.random();
  const forged = { ...rec, sig: await keypairSigner(other.secret())(extMethodMessage(m)) };
  assert.equal(await verifyExtRecord(forged, kp.publicKey(), noChain), "invalid");
});

test("anchored methods must match the hash on the owner's account", async () => {
  const owner = Keypair.random().publicKey();
  const m = method(owner);
  const ledger = new Map([[`${owner}/${extDataKey(m.id)}`, toBase64(await extMethodHash(m))]]);
  const dataEntry = async (acc: string, key: string) => ledger.get(`${acc}/${key}`) ?? null;

  assert.equal(await verifyExtRecord({ method: m, security: "chain" }, owner, dataEntry), "chain");
  const swapped = { ...m, address: "0x0000000000000000000000000000000000000001" };
  assert.equal(await verifyExtRecord({ method: swapped, security: "chain" }, owner, dataEntry), "invalid");
  assert.equal(await verifyExtRecord({ method: method(owner), security: "chain" }, owner, dataEntry), "invalid");
});

test("public method lists are accepted only when signed by the device", async () => {
  const kp = Keypair.random();
  const keys = createDeviceKeys();
  const cert = await issueCert(kp.publicKey(), keys, NODE, keypairSigner(kp.secret()));
  const body = parseCertBody(cert.body);
  const methods: ExtMethodRecord[] = [{ method: method(kp.publicKey()), security: "none" }];
  const { req, sig } = signRequest(keys, cert, NODE, { action: "methods", data: { methods } });

  assert.deepEqual(verifyMethods(body, { req, sig }), methods);
  assert.deepEqual(verifyMethods(body, { req: req.replace(BEP20, BEP20.toLowerCase()), sig }), []);
  // A list naming someone else as owner is dropped.
  const foreign: ExtMethodRecord[] = [{ method: method(Keypair.random().publicKey()), security: "none" }];
  const signedForeign = signRequest(keys, cert, NODE, { action: "methods", data: { methods: foreign } });
  assert.deepEqual(verifyMethods(body, signedForeign), []);
});
