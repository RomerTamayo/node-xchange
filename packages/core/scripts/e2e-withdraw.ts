// Withdrawals to arbitrary addresses on testnet.
//   node --experimental-strip-types scripts/e2e-withdraw.ts

import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";
import { Stellar, WithdrawError, keypairTxSigner } from "../src/index.ts";

const stellar = new Stellar();
const me = Keypair.random();
await stellar.fund(me.publicKey());
const sign = keypairTxSigner(me.secret());
const code = (e: unknown) => (e as WithdrawError).code;

// 1. XLM to an address that doesn't exist yet creates it.
const fresh = Keypair.random().publicKey();
const res = await stellar.withdraw({ from: me.publicKey(), to: fresh, amount: "2.5", asset: "XLM", signer: sign });
assert.equal(res.created, true);
assert.equal((await stellar.balances(fresh)).XLM, "2.5000000");
console.log("✔ XLM to a brand-new address creates the account");

// 2. Less than 1 XLM can't create an account; USDC can't go to a missing account.
const other = Keypair.random().publicKey();
await assert.rejects(stellar.withdraw({ from: me.publicKey(), to: other, amount: "0.5", asset: "XLM", signer: sign }), (e) => code(e) === "min_create");
await assert.rejects(stellar.withdraw({ from: me.publicKey(), to: other, amount: "1", asset: "USDC", signer: sign }), (e) => code(e) === "no_account_usdc");
console.log("✔ refuses <1 XLM to a missing account and USDC to a missing account");

// 3. USDC to an existing account without trustline is refused before signing.
await assert.rejects(stellar.withdraw({ from: me.publicKey(), to: fresh, amount: "1", asset: "USDC", signer: sign }), (e) => code(e) === "no_trustline");
console.log("✔ refuses USDC to an account that hasn't enabled it");

// 4. Numeric memo goes as MEMO_ID (exchange style), text memo as MEMO_TEXT.
const idTx = await stellar.withdraw({ from: me.publicKey(), to: fresh, amount: "1", asset: "XLM", memo: "123456789", signer: sign });
const textTx = await stellar.withdraw({ from: me.publicKey(), to: fresh, amount: "1", asset: "XLM", memo: "pago bici", signer: sign });
const [a, b] = await Promise.all([idTx.hash, textTx.hash].map((h) => stellar.horizon.transactions().transaction(h).call()));
assert.equal(a.memo_type, "id");
assert.equal(a.memo, "123456789");
assert.equal(b.memo_type, "text");
console.log("✔ numeric memos are sent as MEMO_ID, others as MEMO_TEXT");

// 5. "Send all" leaves exactly the reserve (plus fee buffer) and succeeds.
const max = await stellar.maxSendable(me.publicKey(), "XLM");
await stellar.withdraw({ from: me.publicKey(), to: fresh, amount: max, asset: "XLM", signer: sign });
const left = Number((await stellar.balances(me.publicKey())).XLM);
assert.ok(left >= 1 && left < 1.02, `left ${left}`);
console.log(`✔ send-all of ${max} XLM succeeded, ${left} XLM left as reserve`);
