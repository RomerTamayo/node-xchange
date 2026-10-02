// Everything this browser remembers. The node is only a temporary mailbox;
// history lives here, and by default it is volatile too (see `purge`).

import { READ_TTL_MS, UNREAD_TTL_MS, type ExtMethodRecord, type Payload, type SessionState } from "@nodexchange/core";
import { isSealed, open, seal, type Sealed, type WrappedKey } from "./vault.ts";
import type { EncryptedSecret } from "./wallet.ts";

const PREFIX = "nx:v1";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${PREFIX}:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(`${PREFIX}:${key}`, JSON.stringify(value));
  } catch {
    // storage full or blocked: the app keeps working in memory
  }
}

// --- account ----------------------------------------------------------------

export interface Account {
  /** Public part of the session; the device keys live sealed in `sealedKeys`. */
  session: Omit<SessionState, "keys">;
  /** Data key wrapped by the wallet (see vault.ts). Absent on legacy accounts. */
  vault?: WrappedKey;
  sealedKeys?: Sealed;
  wallet: { kind: "local"; secret: EncryptedSecret } | { kind: "external" };
}

export const loadAccount = () => read<Account | null>("account", null);
export const saveAccount = (a: Account) => write("account", a);

// --- settings ---------------------------------------------------------------

export interface Settings {
  /** Local copies disappear 48h after being seen (same rule as the node). */
  volatile: boolean;
}

export const loadSettings = () => read<Settings>("settings", { volatile: true });
export const saveSettings = (s: Settings) => write("settings", s);

// --- messages ---------------------------------------------------------------

export interface LocalMessage {
  id: string;
  peer: string;
  dir: "in" | "out";
  ts: number;
  payload: Payload;
  request?: boolean;
  /** When the user saw it (outgoing: when sent). Drives local expiry. */
  seenAt?: number;
}

/** One of our external payment methods. Public ones are published on the node. */
export interface MyMethod {
  rec: ExtMethodRecord;
  public: boolean;
}

/** Someone we saved, with the name we gave them (theirs is the alias). */
export interface Contact {
  name: string | null;
  addedAt: number;
}

export interface Chats {
  messages: Record<string, LocalMessage[]>; // by peer
  /** Ids the user deleted locally, so the inbox poll doesn't bring them back. */
  deleted: Record<string, number>;
  accepted: string[];
  blocked: string[];
  /** Aliases others chose for themselves, verified and cached. */
  aliases: Record<string, { alias: string | null; at: number }>;
  /** The alias we published for ourselves. */
  myAlias: string | null;
  myMethods: MyMethod[];
  /** Saved contacts: unlike chats, they never expire. */
  contacts: Record<string, Contact>;
}

const emptyChats = (): Chats => ({
  messages: {},
  deleted: {},
  accepted: [],
  blocked: [],
  aliases: {},
  myAlias: null,
  myMethods: [],
  contacts: {},
});

/**
 * Chats are stored sealed with the vault's data key. Plaintext data written by
 * versions before encryption is still read, and gets sealed on the next save.
 * Spread over defaults so data saved by older versions gains new fields.
 */
export function loadChats(address: string, dataKey: Uint8Array): Chats {
  const raw = read<unknown>(`chats:${address}`, null);
  const stored = isSealed(raw) ? open<Partial<Chats>>(dataKey, raw) : (raw as Partial<Chats> | null);
  return { ...emptyChats(), ...(stored ?? {}) };
}

export const saveChats = (address: string, dataKey: Uint8Array, c: Chats) =>
  write(`chats:${address}`, seal(dataKey, c));

/** Drops expired local copies (when volatile) and old tombstones. */
export function purge(chats: Chats, volatile: boolean, now = Date.now()): Chats {
  const messages: Chats["messages"] = {};
  for (const [peer, list] of Object.entries(chats.messages)) {
    const kept = volatile ? list.filter((m) => !m.seenAt || m.seenAt + READ_TTL_MS > now) : list;
    if (kept.length) messages[peer] = kept;
  }
  const deleted = Object.fromEntries(
    Object.entries(chats.deleted).filter(([, at]) => at + UNREAD_TTL_MS > now),
  );
  return { ...chats, messages, deleted };
}

export function clearAll() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(PREFIX)) localStorage.removeItem(key);
  }
}
