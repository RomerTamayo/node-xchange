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

export interface Wallet {
  kind: "local" | "external";
  address: string;
  signMessage: WalletSigner;
  signTx: TxSigner;
}

export interface EncryptedSecret {
  salt: string;
  nonce: string;
  box: string;
}

const PBKDF2_ROUNDS = 250_000;

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey("raw", utf8(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ROUNDS },
    base,
    256,
  );
  return new Uint8Array(bits);
}

export async function encryptSecret(secret: string, password: string): Promise<EncryptedSecret> {
  const salt = nacl.randomBytes(16);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const key = await deriveKey(password, salt as Uint8Array<ArrayBuffer>);
  return {
    salt: toBase64(salt),
    nonce: toBase64(nonce),
    box: toBase64(nacl.secretbox(utf8(secret), nonce, key)),
  };
}

/** Returns the secret, or null when the password is wrong. */
export async function decryptSecret(enc: EncryptedSecret, password: string): Promise<string | null> {
  const key = await deriveKey(password, fromBase64(enc.salt) as Uint8Array<ArrayBuffer>);
  const plain = nacl.secretbox.open(fromBase64(enc.box), fromBase64(enc.nonce), key);
  return plain ? new TextDecoder().decode(plain) : null;
}

export function localWallet(secret: string): Wallet {
  return {
    kind: "local",
    address: Keypair.fromSecret(secret).publicKey(),
    signMessage: keypairSigner(secret),
    signTx: keypairTxSigner(secret),
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
  return {
    kind: "external",
    address,
    signMessage: async (message) => {
      const { signedMessage } = await StellarWalletsKit.signMessage(message, {
        address,
        networkPassphrase: passphrase,
      });
      const sig = normalizeSignature(signedMessage);
      if (!(await verifyWalletSignature(address, message, sig))) {
        throw new Error("Tu billetera devolvió una firma que no se pudo verificar (SEP-53).");
      }
      return sig;
    },
    signTx: async (xdr, networkPassphrase) => {
      const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
        address,
        networkPassphrase,
      });
      return signedTxXdr;
    },
  };
}

/** Opens the wallet picker. When `expected` is given, the account must match. */
export async function connectExternal(expected?: string): Promise<Wallet> {
  initKit();
  const { address } = await StellarWalletsKit.authModal();
  if (expected && address !== expected) {
    throw new Error(`Conecta la cuenta ${short(expected)}; elegiste ${short(address)}.`);
  }
  return externalWallet(address);
}

export const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;
