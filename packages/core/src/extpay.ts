// External payment methods: addresses on other chains (e.g. a Binance deposit
// address on BNB Smart Chain) where a user accepts direct, unprotected
// payments. NodeXchange never moves these funds; it only shows the address.
//
// Each method chooses how much it can be trusted:
// - "none":   just stored; the payer must double-check it with the owner.
// - "signed": the owner's Stellar wallet signed it (SEP-53, free).
// - "chain":  its hash is written to the owner's Stellar account as a data
//             entry (costs a 0.5 XLM reserve, returned when removed).
// Neither the node nor anyone without the wallet can alter a signed or
// anchored method without clients noticing.

import { isAddress, toBase64, utf8 } from "./encoding.ts";
import { ProtocolError, verifyWalletSignature } from "./protocol.ts";

export interface ExtNetwork {
  label: string;
  /** Short name exchanges show next to the network (what users look for). */
  tag: string;
  assets: readonly string[];
  address: RegExp;
  /** Example shown as placeholder. */
  example: string;
  /** Whether a memo/tag is needed to credit the deposit. */
  memo: boolean;
}

/** Supported networks. Add entries here to support more chains. */
export const EXT_NETWORKS = {
  bep20: {
    label: "BNB Smart Chain",
    tag: "BEP20",
    assets: ["USDT", "USDC", "BNB"],
    address: /^0x[0-9a-fA-F]{40}$/,
    example: "0x1234…abcd",
    memo: false,
  },
} as const satisfies Record<string, ExtNetwork>;

export type ExtNetworkId = keyof typeof EXT_NETWORKS;
export type ExtSecurity = "none" | "signed" | "chain";

export const MAX_EXT_LABEL_CHARS = 24;
/** Methods a user may publish on their node profile. */
export const MAX_PUBLIC_EXT_METHODS = 5;
const DATA_PREFIX = "nx.pay.";
const MESSAGE_PREFIX = "NodeXchange external payment method\n";

export interface ExtMethod {
  v: 1;
  /** 8 hex chars; also names the on-chain data entry. */
  id: string;
  /** Stellar account of the person who receives. */
  owner: string;
  network: ExtNetworkId;
  asset: string;
  address: string;
  label?: string;
  iat: number;
}

export interface ExtMethodRecord {
  method: ExtMethod;
  security: ExtSecurity;
  /** SEP-53 signature by `method.owner` when security is "signed". */
  sig?: string;
}

/** What a payer can rely on after checking a record. */
export type ExtVerdict = "signed" | "chain" | "unsigned" | "invalid";

export const isExtNetwork = (n: unknown): n is ExtNetworkId =>
  typeof n === "string" && Object.hasOwn(EXT_NETWORKS, n);

export const extDataKey = (id: string) => DATA_PREFIX + id;

export function newExtMethodId(): string {
  return [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Throws a ProtocolError unless `m` is a well-formed method. */
export function validateExtMethod(m: ExtMethod): void {
  const net = isExtNetwork(m?.network) ? EXT_NETWORKS[m.network] : null;
  if (
    m?.v !== 1 ||
    typeof m.id !== "string" ||
    !/^[0-9a-f]{8}$/.test(m.id) ||
    !isAddress(m.owner) ||
    !net ||
    !net.assets.includes(m.asset as never) ||
    typeof m.address !== "string" ||
    !net.address.test(m.address) ||
    typeof m.iat !== "number" ||
    (m.label !== undefined &&
      (typeof m.label !== "string" || !m.label.trim() || [...m.label].length > MAX_EXT_LABEL_CHARS))
  ) {
    throw new ProtocolError("bad_method", "malformed external payment method");
  }
}

/** The exact text a wallet signs; fixed field order so it is reproducible. */
export function extMethodMessage(m: ExtMethod): string {
  const { v, id, owner, network, asset, address, label, iat } = m;
  return MESSAGE_PREFIX + JSON.stringify({ v, id, owner, network, asset, address, label: label ?? null, iat });
}

/** SHA-256 of the signed text: the 32-byte value stored on-chain. */
export async function extMethodHash(m: ExtMethod): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(extMethodMessage(m))));
}

/** Validates the shape of a record received from a node or a chat. */
export function parseExtRecord(r: unknown): ExtMethodRecord | null {
  const rec = r as ExtMethodRecord;
  try {
    validateExtMethod(rec?.method);
  } catch {
    return null;
  }
  if (rec.security !== "none" && rec.security !== "signed" && rec.security !== "chain") return null;
  if (rec.security === "signed" && typeof rec.sig !== "string") return null;
  return { method: rec.method, security: rec.security, ...(rec.sig ? { sig: rec.sig } : {}) };
}

/**
 * Checks a record claimed to belong to `owner`. `dataEntry` reads a data entry
 * (base64) of a Stellar account, e.g. `Stellar.dataEntry`.
 */
export async function verifyExtRecord(
  rec: ExtMethodRecord,
  owner: string,
  dataEntry: (account: string, key: string) => Promise<string | null>,
): Promise<ExtVerdict> {
  const parsed = parseExtRecord(rec);
  if (!parsed || parsed.method.owner !== owner) return "invalid";
  if (parsed.security === "signed") {
    return (await verifyWalletSignature(owner, extMethodMessage(parsed.method), parsed.sig!)) ? "signed" : "invalid";
  }
  if (parsed.security === "chain") {
    const stored = await dataEntry(owner, extDataKey(parsed.method.id));
    if (!stored) return "invalid";
    return stored === toBase64(await extMethodHash(parsed.method)) ? "chain" : "invalid";
  }
  return "unsigned";
}
