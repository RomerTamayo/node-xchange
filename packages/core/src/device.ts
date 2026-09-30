// Client-side identity: device keys, certificates, request signing, encryption.

import nacl from "tweetnacl";
import { Keypair } from "@stellar/stellar-sdk";
import { fromBase64, fromUtf8, toBase64, utf8 } from "./encoding.ts";
import {
  MAX_BOX_BYTES,
  MAX_MESSAGE_CHARS,
  ProtocolError,
  sep53Hash,
  verifyCert,
  type Action,
  type CertBody,
  type DeviceCert,
  type Envelope,
  type Payload,
  type SignedRequest,
} from "./protocol.ts";

/** Serializable device secrets (keep them in local storage / a local file). */
export interface DeviceKeys {
  signSecret: string; // base64, 64 bytes
  boxSecret: string; // base64, 32 bytes
}

/** Signs a SEP-53 message with the wallet; returns a base64 signature. */
export type WalletSigner = (message: string) => Promise<string>;

export function createDeviceKeys(): DeviceKeys {
  return {
    signSecret: toBase64(nacl.sign.keyPair().secretKey),
    boxSecret: toBase64(nacl.box.keyPair().secretKey),
  };
}

export function devicePublicKeys(keys: DeviceKeys) {
  const sign = nacl.sign.keyPair.fromSecretKey(fromBase64(keys.signSecret));
  const box = nacl.box.keyPair.fromSecretKey(fromBase64(keys.boxSecret));
  return { signPub: toBase64(sign.publicKey), boxPub: toBase64(box.publicKey) };
}

/** Signer for wallets whose secret we hold (built-in wallet, CLI). */
export function keypairSigner(secret: string): WalletSigner {
  const seed = Keypair.fromSecret(secret).rawSecretKey();
  const { secretKey } = nacl.sign.keyPair.fromSeed(Uint8Array.from(seed));
  return async (message) => toBase64(nacl.sign.detached(await sep53Hash(message), secretKey));
}

/** The wallet authorises this device to chat on its behalf. */
export async function issueCert(
  address: string,
  keys: DeviceKeys,
  node: string,
  signWithWallet: WalletSigner,
): Promise<DeviceCert> {
  const body: CertBody = { v: 1, address, ...devicePublicKeys(keys), node, iat: Date.now() };
  const text = JSON.stringify(body);
  return { body: text, sig: await signWithWallet(text) };
}

export function signRequest(
  keys: DeviceKeys,
  cert: DeviceCert,
  node: string,
  action: Action,
): SignedRequest {
  const req = JSON.stringify({ ...action, ts: Date.now(), node });
  const sig = nacl.sign.detached(utf8(req), fromBase64(keys.signSecret));
  return { cert, req, sig: toBase64(sig) };
}

export function sealPayload(
  keys: DeviceKeys,
  from: string,
  to: CertBody,
  payload: Payload,
): Envelope {
  if (payload.t === "text" && [...payload.body].length > MAX_MESSAGE_CHARS) {
    throw new ProtocolError("too_long", `messages are limited to ${MAX_MESSAGE_CHARS} characters`);
  }
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const box = nacl.box(
    utf8(JSON.stringify(payload)),
    nonce,
    fromBase64(to.boxPub),
    fromBase64(keys.boxSecret),
  );
  if (box.length > MAX_BOX_BYTES) throw new ProtocolError("too_long", "payload too large");
  return {
    id: crypto.randomUUID(),
    from,
    to: to.address,
    ts: Date.now(),
    nonce: toBase64(nonce),
    box: toBase64(box),
  };
}

/** Decrypts an envelope; verifies the sender's cert first (never trust the node). */
export async function openEnvelope(
  keys: DeviceKeys,
  envelope: Envelope,
  senderCert: DeviceCert,
): Promise<Payload> {
  const sender = await verifyCert(senderCert);
  if (sender.address !== envelope.from) {
    throw new ProtocolError("bad_envelope", "sender certificate does not match");
  }
  const plain = nacl.box.open(
    fromBase64(envelope.box),
    fromBase64(envelope.nonce),
    fromBase64(sender.boxPub),
    fromBase64(keys.boxSecret),
  );
  if (!plain) throw new ProtocolError("bad_envelope", "cannot decrypt message");
  return JSON.parse(fromUtf8(plain)) as Payload;
}
