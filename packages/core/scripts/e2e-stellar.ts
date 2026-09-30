// Payments, escrow and receipts against testnet.
//   node --experimental-strip-types scripts/e2e-stellar.ts

import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";
import { Stellar, dealStatus, keypairTxSigner } from "../src/index.ts";

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
