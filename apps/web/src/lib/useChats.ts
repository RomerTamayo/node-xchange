import { useCallback, useEffect, useRef, useState } from "react";
import type { ExtMethodRecord, Payload, Session } from "@nodexchange/core";
import { loadChats, purge, saveChats, type Chats, type LocalMessage, type MyMethod } from "./store.ts";

const POLL_MS = 4000;
const ALIAS_TTL_MS = 60 * 1000;

export interface Conversation {
  peer: string;
  messages: LocalMessage[];
  last: number;
  unread: number;
  /** A stranger wrote and we haven't accepted or answered yet. */
  request: boolean;
}

export const MAX_CONTACT_NAME_CHARS = 32;

/** Keeps a contact (adding it if needed); `name` undefined keeps the current one. */
function withContact(c: Chats, peer: string, name?: string | null): Chats {
  const current = c.contacts[peer];
  if (current && name === undefined) return c;
  const clean = name?.trim().slice(0, MAX_CONTACT_NAME_CHARS) || null;
  return {
    ...c,
    contacts: { ...c.contacts, [peer]: { name: name === undefined ? (current?.name ?? null) : clean, addedAt: current?.addedAt ?? Date.now() } },
  };
}

export function useChats(session: Session, dataKey: Uint8Array, volatile: boolean, openPeer: string | null) {
  const me = session.address;
  const [chats, setChats] = useState<Chats>(() => {
    const loaded = purge(loadChats(me, dataKey), volatile);
    saveChats(me, dataKey, loaded); // seals data left in plaintext by older versions
    return loaded;
  });
  const [error, setError] = useState<string | null>(null);
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const aliasInFlight = useRef(new Set<string>());
  /** Public external payment methods of peers, as their node returned them. */
  const [peerMethods, setPeerMethods] = useState<Record<string, ExtMethodRecord[]>>({});

  const update = useCallback(
    (fn: (c: Chats) => Chats) => {
      setChats((prev) => {
        const next = fn(prev);
        saveChats(me, dataKey, next);
        return next;
      });
    },
    [me, dataKey],
  );

  // Poll the inbox and merge new messages.
  const poll = useCallback(async () => {
    try {
      const inbox = await session.inbox();
      setError(null);
      update((c) => {
        const messages = { ...c.messages };
        for (const m of inbox) {
          if (c.deleted[m.id] || c.blocked.includes(m.from)) continue;
          const list = messages[m.from] ?? [];
          const existing = list.find((x) => x.id === m.id);
          if (existing) {
            if (existing.request !== m.request) {
              messages[m.from] = list.map((x) => (x.id === m.id ? { ...x, request: m.request } : x));
            }
            continue;
          }
          messages[m.from] = [
            ...list,
            { id: m.id, peer: m.from, dir: "in" as const, ts: m.ts, payload: m.payload, request: m.request },
          ].sort((a, b) => a.ts - b.ts);
        }
        return purge({ ...c, messages }, volatile);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [session, update, volatile]);

  useEffect(() => {
    void poll();
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  // Mark the open conversation as seen: the node then keeps it 48 more hours.
  useEffect(() => {
    if (!openPeer || document.visibilityState !== "visible") return;
    const unseen = (chats.messages[openPeer] ?? []).filter((m) => m.dir === "in" && !m.seenAt);
    if (!unseen.length) return;
    const now = Date.now();
    const ids = new Set(unseen.map((m) => m.id));
    update((c) => ({
      ...c,
      messages: {
        ...c.messages,
        [openPeer]: (c.messages[openPeer] ?? []).map((m) => (ids.has(m.id) ? { ...m, seenAt: now } : m)),
      },
    }));
    session.ack([...ids]).catch(() => {});
  }, [openPeer, chats, session, update]);

  /** Fetches the alias of `peer` from their node; throws if they aren't on NodeXchange. */
  const lookup = useCallback(
    async (peer: string) => {
      const { alias, methods } = await session.peer(peer);
      update((c) => ({ ...c, aliases: { ...c.aliases, [peer]: { alias, at: Date.now() } } }));
      setPeerMethods((m) => ({ ...m, [peer]: methods }));
      return alias;
    },
    [session, update],
  );

  // Keep aliases of the people we talk to reasonably fresh.
  const peers = [...new Set([...Object.keys(chats.messages), ...Object.keys(chats.contacts), ...(openPeer ? [openPeer] : [])])];
  const stalePeers = peers.filter((p) => {
    const cached = chats.aliases[p];
    return (!cached || cached.at + ALIAS_TTL_MS < Date.now()) && !aliasInFlight.current.has(p);
  });
  useEffect(() => {
    for (const p of stalePeers) {
      aliasInFlight.current.add(p);
      lookup(p)
        .catch(() =>
          // Back off: keep whatever we had and retry after the TTL.
          update((c) => ({
            ...c,
            aliases: { ...c.aliases, [p]: { alias: c.aliases[p]?.alias ?? null, at: Date.now() } },
          })),
        )
        .finally(() => aliasInFlight.current.delete(p));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stalePeers.join(","), lookup, update]);

  // Opening a chat always refreshes that person's alias.
  useEffect(() => {
    if (openPeer) lookup(openPeer).catch(() => {});
  }, [openPeer, lookup]);

  const aliasOf = useCallback((peer: string) => chats.aliases[peer]?.alias ?? null, [chats.aliases]);
  /** What we show for someone: the name we saved, else the alias they chose. */
  const nameOf = useCallback(
    (peer: string) => chats.contacts[peer]?.name ?? chats.aliases[peer]?.alias ?? null,
    [chats.contacts, chats.aliases],
  );

  const saveContact = useCallback(
    (peer: string, name: string | null) => update((c) => withContact(c, peer, name)),
    [update],
  );

  const removeContact = useCallback(
    (peer: string) =>
      update((c) => {
        const contacts = { ...c.contacts };
        delete contacts[peer];
        return { ...c, contacts };
      }),
    [update],
  );

  const setMyAlias = useCallback(
    async (alias: string | null) => {
      const res = await session.setAlias(alias);
      update((c) => ({ ...c, myAlias: res.alias }));
    },
    [session, update],
  );

  /** Saves our method list and republishes the public ones when they change. */
  const setMyMethods = useCallback(
    async (next: MyMethod[]) => {
      const publicOf = (list: MyMethod[]) => list.filter((m) => m.public).map((m) => m.rec);
      const before = JSON.stringify(publicOf(chatsRef.current.myMethods));
      if (JSON.stringify(publicOf(next)) !== before) await session.setMethods(publicOf(next));
      update((c) => ({ ...c, myMethods: next }));
    },
    [session, update],
  );

  const addOutgoing = useCallback(
    (peer: string, id: string, ts: number, payload: Payload) =>
      update((c) => ({
        ...c,
        messages: {
          ...c.messages,
          [peer]: [...(c.messages[peer] ?? []), { id, peer, dir: "out", ts, payload, seenAt: Date.now() }],
        },
      })),
    [update],
  );

  const send = useCallback(
    async (peer: string, payload: Payload) => {
      // Writing to someone accepts their replies, even if they live on another node
      // (but never silently lifts a block: e.g. an automatic escrow notice).
      const { accepted, blocked } = chatsRef.current;
      if (!accepted.includes(peer) && !blocked.includes(peer)) {
        await session.setContact(peer, "accepted");
        update((c) => ({ ...c, accepted: [...c.accepted, peer] }));
      }
      const env = await session.send(peer, payload);
      addOutgoing(peer, env.id, env.ts, payload);
      // People we write to are kept as contacts, so they survive expired chats.
      if (!blocked.includes(peer)) update((c) => withContact(c, peer));
    },
    [session, update, addOutgoing],
  );

  const accept = useCallback(
    async (peer: string) => {
      await session.setContact(peer, "accepted");
      update((c) =>
        withContact(
          {
            ...c,
            accepted: [...new Set([...c.accepted, peer])],
            messages: { ...c.messages, [peer]: (c.messages[peer] ?? []).map((m) => ({ ...m, request: false })) },
          },
          peer,
        ),
      );
    },
    [session, update],
  );

  const block = useCallback(
    async (peer: string) => {
      await session.setContact(peer, "blocked");
      update((c) => {
        const messages = { ...c.messages };
        delete messages[peer];
        const contacts = { ...c.contacts };
        delete contacts[peer];
        return { ...c, messages, contacts, blocked: [...c.blocked, peer], accepted: c.accepted.filter((p) => p !== peer) };
      });
    },
    [session, update],
  );

  const unblock = useCallback(
    async (peer: string) => {
      await session.setContact(peer, "none");
      update((c) => ({ ...c, blocked: c.blocked.filter((p) => p !== peer) }));
    },
    [session, update],
  );

  /** Deletes locally and on the node. For our own messages, tries "unsend". */
  const remove = useCallback(
    async (peer: string, ids: string[]): Promise<{ unsent: number; kept: number }> => {
      const list = chatsRef.current.messages[peer] ?? [];
      const targets = list.filter((m) => ids.includes(m.id));
      const now = Date.now();
      update((c) => ({
        ...c,
        messages: { ...c.messages, [peer]: (c.messages[peer] ?? []).filter((m) => !ids.includes(m.id)) },
        deleted: { ...c.deleted, ...Object.fromEntries(ids.map((id) => [id, now])) },
      }));
      const incoming = targets.filter((m) => m.dir === "in").map((m) => m.id);
      if (incoming.length) await session.deleteFromNode(incoming).catch(() => {});
      let unsent = 0;
      let kept = 0;
      for (const m of targets.filter((t) => t.dir === "out")) {
        const res = await session.unsend(peer, m.id).catch(() => ({ deleted: false }));
        if (res.deleted) unsent++;
        else kept++;
      }
      return { unsent, kept };
    },
    [session, update],
  );

  const clearHistory = useCallback(() => {
    const now = Date.now();
    update((c) => {
      const deleted = { ...c.deleted };
      for (const list of Object.values(c.messages)) for (const m of list) deleted[m.id] = now;
      return { ...c, messages: {}, deleted };
    });
  }, [update]);

  const conversations: Conversation[] = Object.entries(chats.messages)
    .map(([peer, messages]) => ({
      peer,
      messages,
      last: messages[messages.length - 1]?.ts ?? 0,
      unread: messages.filter((m) => m.dir === "in" && !m.seenAt).length,
      request:
        !chats.accepted.includes(peer) &&
        messages.every((m) => m.dir === "in") &&
        messages.some((m) => m.request),
    }))
    .sort((a, b) => b.last - a.last);

  /** Saved contacts without an open conversation, by name. */
  const idleContacts = Object.entries(chats.contacts)
    .filter(([peer]) => !chats.messages[peer]?.length)
    .map(([peer, contact]) => ({ peer, ...contact }))
    .sort((a, b) => (nameOf(a.peer) ?? a.peer).localeCompare(nameOf(b.peer) ?? b.peer));

  return {
    conversations,
    error,
    blocked: chats.blocked,
    myAlias: chats.myAlias,
    myMethods: chats.myMethods,
    setMyMethods,
    peerMethods,
    contacts: chats.contacts,
    idleContacts,
    saveContact,
    removeContact,
    nameOf,
    aliasOf,
    lookup,
    setMyAlias,
    send,
    addOutgoing,
    accept,
    block,
    unblock,
    remove,
    clearHistory,
    poll,
  };
}
