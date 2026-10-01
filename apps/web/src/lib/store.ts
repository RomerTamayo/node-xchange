// Everything this browser remembers. The node is only a temporary mailbox;
// history lives here, and by default it is volatile too (see `purge`).

import { READ_TTL_MS, UNREAD_TTL_MS, type Payload, type SessionState } from "@nodexchange/core";
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
  session: SessionState;
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
}

const emptyChats = (): Chats => ({
  messages: {},
  deleted: {},
  accepted: [],
  blocked: [],
  aliases: {},
  myAlias: null,
});

// Spread over defaults so data saved by older versions gains new fields.
export const loadChats = (address: string): Chats => ({
  ...emptyChats(),
  ...read<Partial<Chats>>(`chats:${address}`, {}),
});
export const saveChats = (address: string, c: Chats) => write(`chats:${address}`, c);

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
