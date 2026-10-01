// Stellar side of NodeXchange: payments, node discovery, escrow deals, receipts.

import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Networks,
  NotFoundError,
  Operation,
  TransactionBuilder,
  contract,
} from "@stellar/stellar-sdk";
import { fromBase64, fromUtf8 } from "./encoding.ts";
import { NODE_DATA_KEY } from "./protocol.ts";

export interface NetworkConfig {
  name: "testnet" | "mainnet";
  horizonUrl: string;
  rpcUrl: string;
  passphrase: string;
  friendbotUrl: string | null;
  usdc: { code: "USDC"; issuer: string; sac: string };
  xlmSac: string;
  escrow: string;
  /** Transaction page of a block explorer; the hash is appended. */
  explorerTx: string;
}

export const TESTNET: NetworkConfig = {
  name: "testnet",
  horizonUrl: "https://horizon-testnet.stellar.org",
  rpcUrl: "https://soroban-testnet.stellar.org",
  passphrase: Networks.TESTNET,
  friendbotUrl: "https://friendbot.stellar.org",
  // Circle's testnet USDC
  usdc: {
    code: "USDC",
    issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    sac: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  },
  xlmSac: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  escrow: "CCQ5IBINEVNEYAHRENMIEPQFPXM2Q7TLUSFCKRXGHODLAIV6AWGR4KCB",
  // stellar.expert's testnet index is lagging (Oct 2026); stellarchain shows new txs.
  explorerTx: "https://testnet.stellarchain.io/transactions/",
};

export type AssetCode = "XLM" | "USDC";

/** Signs a transaction XDR and returns the signed XDR (wallet or keypair). */
export type TxSigner = (xdr: string, passphrase: string) => Promise<string>;

export function keypairTxSigner(secret: string): TxSigner {
  const kp = Keypair.fromSecret(secret);
  return async (xdr, passphrase) => {
    const tx = TransactionBuilder.fromXDR(xdr, passphrase);
    tx.sign(kp);
    return tx.toXDR();
  };
}

/** Operator fee on direct transfers (0 by default: fees come from escrow deals). */
export interface TransferFee {
  to: string;
  bps: number;
}

export class Stellar {
  readonly net: NetworkConfig;
  readonly horizon: Horizon.Server;

  constructor(net: NetworkConfig = TESTNET) {
    this.net = net;
    this.horizon = new Horizon.Server(net.horizonUrl);
  }

  asset(code: AssetCode): Asset {
    return code === "XLM" ? Asset.native() : new Asset(this.net.usdc.code, this.net.usdc.issuer);
  }

  sac(code: AssetCode): string {
    return code === "XLM" ? this.net.xlmSac : this.net.usdc.sac;
  }

  txUrl(hash: string): string {
    return `${this.net.explorerTx}${hash}`;
  }

  async fund(address: string): Promise<void> {
    if (!this.net.friendbotUrl) throw new Error("friendbot only exists on testnet");
    const res = await fetch(`${this.net.friendbotUrl}?addr=${encodeURIComponent(address)}`);
    if (!res.ok && res.status !== 400) throw new Error(`friendbot failed (${res.status})`);
  }

  async account(address: string): Promise<Horizon.AccountResponse | null> {
    try {
      return await this.horizon.loadAccount(address);
    } catch (e) {
      if (e instanceof NotFoundError) return null;
      throw e;
    }
  }

  async balances(address: string): Promise<{ XLM: string; USDC: string | null }> {
    const acc = await this.account(address);
    if (!acc) return { XLM: "0", USDC: null };
    let xlm = "0";
    let usdc: string | null = null;
    for (const b of acc.balances) {
      if (b.asset_type === "native") xlm = b.balance;
      else if ("asset_code" in b && b.asset_code === "USDC" && b.asset_issuer === this.net.usdc.issuer) {
        usdc = b.balance;
      }
    }
    return { XLM: xlm, USDC: usdc };
  }

  /** Home node URL published in the account's data entries, if any. */
  async nodeOf(address: string): Promise<string | null> {
    const acc = await this.account(address);
    const raw = acc?.data_attr?.[NODE_DATA_KEY];
    return raw ? fromUtf8(fromBase64(raw)) : null;
  }

  private async submit(
    source: string,
    signer: TxSigner,
    build: (b: TransactionBuilder) => TransactionBuilder,
    memo?: string,
  ): Promise<string> {
    const acc = await this.horizon.loadAccount(source);
    let b = new TransactionBuilder(acc, { fee: BASE_FEE, networkPassphrase: this.net.passphrase });
    if (memo) b = b.addMemo(Memo.text(memo));
    const xdr = build(b).setTimeout(180).build().toXDR();
    const signed = TransactionBuilder.fromXDR(await signer(xdr, this.net.passphrase), this.net.passphrase);
    const res = await this.horizon.submitTransaction(signed);
    return res.hash;
  }

  /** Publishes (or clears) the user's home node URL. Max 64 bytes. */
  async publishNode(address: string, nodeUrl: string | null, signer: TxSigner): Promise<string> {
    if (nodeUrl && new TextEncoder().encode(nodeUrl).length > 64) {
      throw new Error("node URL must fit in 64 bytes");
    }
    return this.submit(address, signer, (b) =>
      b.addOperation(Operation.manageData({ name: NODE_DATA_KEY, value: nodeUrl })),
    );
  }

  /** Adds the USDC trustline so the account can hold USDC. */
  async enableUsdc(address: string, signer: TxSigner): Promise<string> {
    return this.submit(address, signer, (b) =>
      b.addOperation(Operation.changeTrust({ asset: this.asset("USDC") })),
    );
  }

  /** Can `address` receive this asset? (account exists, and trustline for USDC). */
  async canReceive(address: string, code: AssetCode): Promise<boolean> {
    const bal = await this.balances(address);
    const exists = (await this.account(address)) !== null;
    return code === "XLM" ? exists : bal.USDC !== null;
  }

  /**
   * Direct payment. When `fee` is set, the fee goes out in the same
   * transaction, so either both payments happen or neither does.
   */
  async pay(opts: {
    from: string;
    to: string;
    amount: string;
    asset: AssetCode;
    signer: TxSigner;
    memo?: string;
    fee?: TransferFee;
  }): Promise<{ hash: string; fee: string }> {
    const asset = this.asset(opts.asset);
    const feeAmount = opts.fee?.bps ? feeOf(opts.amount, opts.fee.bps) : "0";
    const hash = await this.submit(
      opts.from,
      opts.signer,
      (b) => {
        b.addOperation(Operation.payment({ destination: opts.to, asset, amount: opts.amount }));
        if (opts.fee && feeAmount !== "0") {
          b.addOperation(Operation.payment({ destination: opts.fee.to, asset, amount: feeAmount }));
        }
        return b;
      },
      opts.memo,
    );
    return { hash, fee: feeAmount };
  }

  // --- escrow ---------------------------------------------------------------

  private escrowClient(source: string, signer: TxSigner) {
    return contract.Client.from<EscrowContract>({
      contractId: this.net.escrow,
      rpcUrl: this.net.rpcUrl,
      networkPassphrase: this.net.passphrase,
      publicKey: source,
      signTransaction: async (xdr: string) => ({
        signedTxXdr: await signer(xdr, this.net.passphrase),
        signerAddress: source,
      }),
    });
  }

  /** Buyer locks funds for a seller. The operator arbitrates disputes. */
  async createDeal(opts: {
    buyer: string;
    seller: string;
    arbiter: string;
    amount: string;
    asset: AssetCode;
    days: number;
    signer: TxSigner;
  }): Promise<{ dealId: string; hash: string }> {
    const client = await this.escrowClient(opts.buyer, opts.signer);
    const tx = await client.create({
      buyer: opts.buyer,
      seller: opts.seller,
      arbiter: opts.arbiter,
      token: this.sac(opts.asset),
      amount: toStroops(opts.amount),
      deadline: BigInt(Math.floor(Date.now() / 1000) + opts.days * 86_400),
    });
    const sent = await tx.signAndSend();
    return {
      dealId: unwrap(sent.result).toString(),
      hash: sent.sendTransactionResponse?.hash ?? "",
    };
  }

  async settleDeal(
    action: "release" | "cancel" | "reclaim",
    dealId: string,
    caller: string,
    signer: TxSigner,
  ): Promise<string> {
    const client = await this.escrowClient(caller, signer);
    const tx = await client[action]({ id: BigInt(dealId) });
    const sent = await tx.signAndSend();
    unwrap(sent.result);
    return sent.sendTransactionResponse?.hash ?? "";
  }

  async getDeal(dealId: string, viewer: string): Promise<Deal> {
    const client = await this.escrowClient(viewer, async () => {
      throw new Error("read-only");
    });
    const tx = await client.get_deal({ id: BigInt(dealId) });
    return unwrap(tx.result);
  }

  // --- receipts -------------------------------------------------------------

  /** A printable/downloadable receipt built from what the ledger recorded. */
  async receipt(hash: string): Promise<Receipt> {
    const tx = await this.horizon.transactions().transaction(hash).call();
    const ops = await this.horizon.operations().forTransaction(hash).call();
    return {
      network: this.net.name,
      hash,
      ledger: tx.ledger_attr,
      createdAt: tx.created_at,
      source: tx.source_account,
      successful: tx.successful,
      memo: tx.memo ?? null,
      feeCharged: stroopsToXlm(tx.fee_charged),
      operations: ops.records.map((op) => {
        const o = op as unknown as Record<string, string>;
        return {
          type: op.type,
          from: o.from ?? o.source_account,
          to: o.to ?? null,
          amount: o.amount ?? null,
          asset: o.asset_type === "native" ? "XLM" : (o.asset_code ?? null),
        };
      }),
      explorerUrl: this.txUrl(hash),
    };
  }
}

export interface Deal {
  buyer: string;
  seller: string;
  arbiter: string;
  token: string;
  amount: bigint;
  deadline: bigint;
  status: { tag: "Funded" | "Released" | "Refunded" } | ["Funded" | "Released" | "Refunded"];
}

export interface Receipt {
  network: string;
  hash: string;
  ledger: number;
  createdAt: string;
  source: string;
  successful: boolean;
  memo: string | null;
  feeCharged: string;
  operations: { type: string; from: string; to: string | null; amount: string | null; asset: string | null }[];
  explorerUrl: string;
}

type Tx<T> = Promise<contract.AssembledTransaction<T>>;
type Res<T> = contract.Result<T>;

interface EscrowContract {
  create(args: {
    buyer: string;
    seller: string;
    arbiter: string;
    token: string;
    amount: bigint;
    deadline: bigint;
  }): Tx<Res<bigint>>;
  release(args: { id: bigint }): Tx<Res<void>>;
  cancel(args: { id: bigint }): Tx<Res<void>>;
  reclaim(args: { id: bigint }): Tx<Res<void>>;
  get_deal(args: { id: bigint }): Tx<Res<Deal>>;
}

function unwrap<T>(r: Res<T>): T {
  if (r.isErr()) throw new Error(`escrow error: ${r.unwrapErr().message}`);
  return r.unwrap();
}

/** Deal status regardless of how the SDK decodes the enum. */
export function dealStatus(deal: Deal): "Funded" | "Released" | "Refunded" {
  return Array.isArray(deal.status) ? deal.status[0] : deal.status.tag;
}

const STROOPS = 10_000_000n;

export function toStroops(amount: string): bigint {
  if (!/^\d+(\.\d{1,7})?$/.test(amount)) throw new Error(`invalid amount: ${amount}`);
  const [whole, frac = ""] = amount.split(".");
  return BigInt(whole) * STROOPS + BigInt(frac.padEnd(7, "0"));
}

export function fromStroops(stroops: bigint): string {
  const whole = stroops / STROOPS;
  const frac = (stroops % STROOPS).toString().padStart(7, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

const stroopsToXlm = (s: string | number) => fromStroops(BigInt(s));

/** Fee in the same 7-decimal units Stellar uses, rounded down. */
export function feeOf(amount: string, bps: number): string {
  return fromStroops((toStroops(amount) * BigInt(bps)) / 10_000n);
}
