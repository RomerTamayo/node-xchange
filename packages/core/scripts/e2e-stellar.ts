// Payments, escrow and receipts against testnet.
//   node --experimental-strip-types scripts/e2e-stellar.ts

import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";
import { MAX_TRANSFER_FEE_BPS, Stellar, dealStatus, keypairTxSigner } from "../src/index.ts";

const stellar = new Stellar();
const buyer = Keypair.random();
const seller = Keypair.random();
const operator = "GBDUJIASCL2T34EWQJQY6E5AA7HEFFDQQI22D7YPJVDYUW35PRMRUWQT";
await Promise.all([stellar.fund(buyer.publicKey()), stellar.fund(seller.publicKey())]);
const sign = keypairTxSigner(buyer.secret());

const before = Number((await stellar.balances(seller.publicKey())).XLM);
const pay = await stellar.pay({
  from: buyer.publicKey(),
  to: seller.publicKey(),
  amount: "10",
  asset: "XLM",
  signer: sign,
  memo: "nx test",
  fee: { to: operator, bps: 50 },
});
assert.equal(pay.fee, "0.05");
assert.equal(Number((await stellar.balances(seller.publicKey())).XLM), before + 10);
console.log(`✔ direct payment with 0.5% fee in one transaction: ${stellar.txUrl(pay.hash)}`);

await assert.rejects(
  stellar.pay({
    from: buyer.publicKey(),
    to: seller.publicKey(),
    amount: "10",
    asset: "XLM",
    signer: sign,
    fee: { to: operator, bps: MAX_TRANSFER_FEE_BPS + 1 },
  }),
  /exceeds/,
);
console.log("✔ a node fee above 1% is refused before signing");

const receipt = await stellar.receipt(pay.hash);
assert.equal(receipt.operations.length, 2);
assert.equal(receipt.operations[1].to, operator);
assert.equal(receipt.memo, "nx test");
console.log("✔ receipt:", JSON.stringify(receipt.operations));

const deal = await stellar.createDeal({
  buyer: buyer.publicKey(),
  seller: seller.publicKey(),
  arbiter: operator,
  amount: "20",
  asset: "XLM",
  days: 7,
  signer: sign,
});
let d = await stellar.getDeal(deal.dealId, buyer.publicKey());
assert.equal(dealStatus(d), "Funded");
assert.equal(d.amount, 200_000_000n);
console.log(`✔ escrow deal #${deal.dealId} funded: ${stellar.txUrl(deal.hash)}`);

const sellerBefore = Number((await stellar.balances(seller.publicKey())).XLM);
const rel = await stellar.settleDeal("release", deal.dealId, buyer.publicKey(), sign);
d = await stellar.getDeal(deal.dealId, buyer.publicKey());
assert.equal(dealStatus(d), "Released");
assert.equal(Number((await stellar.balances(seller.publicKey())).XLM), sellerBefore + 19.9);
console.log(`✔ released: seller got 19.9 XLM, operator 0.1 XLM: ${stellar.txUrl(rel)}`);

const [mine] = await stellar.dealsOf(seller.publicKey());
assert.equal(mine.id, deal.dealId);
assert.equal(dealStatus(mine.deal), "Released");
assert.equal((await stellar.dealsOf(buyer.publicKey()))[0].id, deal.dealId);
console.log("✔ both parties find the deal on-chain via deals_of");

await assert.rejects(
  stellar.createDeal({ buyer: buyer.publicKey(), seller: seller.publicKey(), arbiter: operator, amount: "1", asset: "XLM", days: 31, signer: sign }),
  /30 days/,
);
console.log("✔ terms over 30 days are refused");
