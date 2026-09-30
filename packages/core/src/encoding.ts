// Small, dependency-free encoders shared by the node (Deno) and clients.

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const utf8 = (s: string): Uint8Array<ArrayBuffer> => textEncoder.encode(s);
export const fromUtf8 = (b: Uint8Array): string => textDecoder.decode(b);

export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// --- Stellar StrKey (only ed25519 public keys, "G...") -----------------------

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ED25519_PUBLIC_VERSION = 6 << 3; // 'G'

function crc16xmodem(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function base32Decode(s: string): Uint8Array {
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of s) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new Error("invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

/** Returns the 32-byte ed25519 public key of a Stellar "G..." address. */
export function decodeAddress(address: string): Uint8Array {
  if (typeof address !== "string" || address.length !== 56 || address[0] !== "G") {
    throw new Error("invalid Stellar address");
  }
  const raw = base32Decode(address);
  if (raw.length !== 35 || raw[0] !== ED25519_PUBLIC_VERSION) {
    throw new Error("invalid Stellar address");
  }
  const payload = raw.subarray(0, 33);
  const checksum = raw[33] | (raw[34] << 8);
  if (crc16xmodem(payload) !== checksum) throw new Error("invalid Stellar address checksum");
  return raw.slice(1, 33);
}

export function isAddress(address: unknown): address is string {
  try {
    decodeAddress(address as string);
    return true;
  } catch {
    return false;
  }
}
