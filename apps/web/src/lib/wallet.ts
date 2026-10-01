// Two kinds of wallet: a built-in one (secret kept encrypted in this browser)
// or an external one (Freighter, xBull, Lobstr...) through Stellar Wallets Kit.

import nacl from "tweetnacl";
import { Keypair } from "@stellar/stellar-sdk";
import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";
import { Networks } from "@creit.tech/stellar-wallets-kit/types";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";
import {
  fromBase64,
  keypairSigner,
  keypairTxSigner,
  toBase64,
  utf8,
  verifyWalletSignature,
  type TxSigner,
  type WalletSigner,
} from "@nodexchange/core";
import { stellar } from "./config.ts";
import { t } from "./i18n.ts";
import { sha256, unlockMessage } from "./vault.ts";

export interface Wallet {
  kind: "local" | "external";
  address: string;
  signMessage: WalletSigner;
  signTx: TxSigner;
  /** Key that wraps this device's vault; only this wallet can produce it. */
  vaultKey: () => Promise<Uint8Array>;
}

export interface EncryptedSecret {
  salt: string;
  nonce: string;
  box: string;
  /** PBKDF2 rounds; absent on secrets saved by the first version (250k). */
  iter?: number;
}

/** OWASP's current recommendation for PBKDF2-HMAC-SHA256. */
export const PBKDF2_ROUNDS = 600_000;
const LEGACY_PBKDF2_ROUNDS = 250_000;

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey("raw", utf8(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, 256);
  return new Uint8Array(bits);
}

export async function encryptSecret(secret: string, password: string): Promise<EncryptedSecret> {
  const salt = nacl.randomBytes(16);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const key = await deriveKey(password, salt as Uint8Array<ArrayBuffer>, PBKDF2_ROUNDS);
  return {
    salt: toBase64(salt),
    nonce: toBase64(nonce),
    box: toBase64(nacl.secretbox(utf8(secret), nonce, key)),
    iter: PBKDF2_ROUNDS,
  };
}

/** Returns the secret, or null when the password is wrong. */
export async function decryptSecret(enc: EncryptedSecret, password: string): Promise<string | null> {
  const key = await deriveKey(password, fromBase64(enc.salt) as Uint8Array<ArrayBuffer>, enc.iter ?? LEGACY_PBKDF2_ROUNDS);
  const plain = nacl.secretbox.open(fromBase64(enc.box), fromBase64(enc.nonce), key);
  return plain ? new TextDecoder().decode(plain) : null;
}

export function localWallet(secret: string): Wallet {
  const kp = Keypair.fromSecret(secret);
  return {
    kind: "local",
    address: kp.publicKey(),
    signMessage: keypairSigner(secret),
    signTx: keypairTxSigner(secret),
    // Domain-separated hash of the seed: unlocking needs the password anyway.
    vaultKey: () => sha256(Uint8Array.from([...utf8("NodeXchange vault v1\n"), ...kp.rawSecretKey()])),
  };
}

let kitReady = false;
function initKit() {
  if (kitReady) return;
  StellarWalletsKit.init({ modules: defaultModules(), network: Networks.TESTNET });
  kitReady = true;
}

// Wallets return SEP-53 signatures as base64, but some return hex.
function normalizeSignature(sig: string): string {
  if (/^[0-9a-f]{128}$/i.test(sig)) {
    return toBase64(Uint8Array.from(sig.match(/../g)!.map((h) => parseInt(h, 16))));
  }
  return sig;
}

function externalWallet(address: string): Wallet {
  const passphrase = stellar.net.passphrase;
  const wallet: Wallet = {
    kind: "external",
    address,
    signMessage: async (message) => {
      const { signedMessage } = await StellarWalletsKit.signMessage(message, {
        address,
        networkPassphrase: passphrase,
      });
      const sig = normalizeSignature(signedMessage);
      if (!(await verifyWalletSignature(address, message, sig))) {
        throw new Error(t("badWalletSignature"));
      }
      return sig;
    },
    vaultKey: async () => {
      // Throws if the wallet's signature doesn't verify (see signMessage above).
      const sig = await wallet.signMessage(unlockMessage(address));
      return sha256(fromBase64(sig) as Uint8Array<ArrayBuffer>);
    },
    signTx: async (xdr, networkPassphrase) => {
      const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
        address,
        networkPassphrase,
      });
      return signedTxXdr;
    },
  };
  return wallet;
}

/** Opens the wallet picker. When `expected` is given, the account must match. */
export async function connectExternal(expected?: string): Promise<Wallet> {
  initKit();
  const { address } = await StellarWalletsKit.authModal();
  if (expected && address !== expected) {
    throw new Error(t("wrongAccount", { expected: short(expected), chosen: short(address) }));
  }
  return externalWallet(address);
}

export const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;
