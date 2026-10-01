// Encryption at rest for everything sensitive this browser keeps: device chat
// keys and the local message history.
//
// A random 32-byte "data key" seals that data (XSalsa20-Poly1305). The data
// key is stored wrapped with a key only the wallet can produce:
// - built-in wallet: derived from the wallet secret (itself password-protected);
// - external wallet: derived from a wallet signature over a fixed message
//   (ed25519 signatures are deterministic, so the same wallet always yields
//   the same key and nothing else needs remembering).

import nacl from "tweetnacl";
import { fromBase64, fromUtf8, toBase64, utf8, type DeviceKeys, type SessionState } from "@nodexchange/core";
import type { Account } from "./store.ts";
import type { Wallet } from "./wallet.ts";

export interface Sealed {
  nonce: string;
  box: string;
}

/** The data key, sealed with the wallet-derived key. */
export type WrappedKey = Sealed & { v: 1 };

export interface Unlocked {
  state: SessionState;
  dataKey: Uint8Array;
}

export function seal(key: Uint8Array, value: unknown): Sealed {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  return { nonce: toBase64(nonce), box: toBase64(nacl.secretbox(utf8(JSON.stringify(value)), nonce, key)) };
}

/** Returns the value, or null if the key is wrong or the data was tampered with. */
export function open<T>(key: Uint8Array, sealed: Sealed): T | null {
  try {
    const plain = nacl.secretbox.open(fromBase64(sealed.box), fromBase64(sealed.nonce), key);
    return plain ? (JSON.parse(fromUtf8(plain)) as T) : null;
  } catch {
    return null;
  }
}

export const isSealed = (v: unknown): v is Sealed =>
  typeof v === "object" && v !== null && typeof (v as Sealed).nonce === "string" && typeof (v as Sealed).box === "string";

/** Message an external wallet signs to unlock this device. Must never change. */
export const unlockMessage = (address: string) =>
  `NodeXchange: unlock the chat keys stored on this device.\nAccount: ${address}\nOnly sign this inside the NodeXchange app.`;

export async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

function wrap(walletKey: Uint8Array, dataKey: Uint8Array): WrappedKey {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  return { v: 1, nonce: toBase64(nonce), box: toBase64(nacl.secretbox(dataKey, nonce, walletKey)) };
}

function unwrap(walletKey: Uint8Array, wrapped: WrappedKey): Uint8Array | null {
  return nacl.secretbox.open(fromBase64(wrapped.box), fromBase64(wrapped.nonce), walletKey);
}

/** Builds the encrypted account record for a freshly registered device. */
export async function createVault(
  session: SessionState,
  wallet: Wallet,
  walletRecord: Account["wallet"],
): Promise<{ account: Account; unlocked: Unlocked }> {
  const dataKey = nacl.randomBytes(32);
  const { keys, ...publicSession } = session;
  const account: Account = {
    session: publicSession,
    vault: wrap(await wallet.vaultKey(), dataKey),
    sealedKeys: seal(dataKey, keys),
    wallet: walletRecord,
  };
  return { account, unlocked: { state: session, dataKey } };
}

/**
 * Opens the vault with the wallet. Accounts saved before encryption existed
 * are migrated here: their plaintext keys get sealed and removed.
 * Returns null when the wallet can't open this vault.
 */
export async function unlockVault(
  account: Account,
  wallet: Wallet,
): Promise<{ unlocked: Unlocked; migrated: Account | null } | null> {
  const { keys: legacyKeys, ...publicSession } = account.session as Account["session"] & { keys?: DeviceKeys };

  if (account.vault && account.sealedKeys) {
    const dataKey = unwrap(await wallet.vaultKey(), account.vault);
    if (!dataKey) return null;
    const keys = open<DeviceKeys>(dataKey, account.sealedKeys);
    if (!keys) return null;
    return { unlocked: { state: { ...publicSession, keys }, dataKey }, migrated: null };
  }

  if (!legacyKeys) return null;
  const { account: sealedAccount, unlocked } = await createVault(
    { ...publicSession, keys: legacyKeys },
    wallet,
    account.wallet,
  );
  return { unlocked, migrated: sealedAccount };
}
