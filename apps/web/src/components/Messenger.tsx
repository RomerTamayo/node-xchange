import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_MESSAGE_CHARS,
  NodeClient,
  Session,
  isAddress,
  type NodeInfo,
  type Payload,
} from "@nodexchange/core";
import { stellar } from "../lib/config.ts";
import { clearAll, loadSettings, saveSettings, type Account, type LocalMessage } from "../lib/store.ts";
import { useChats } from "../lib/useChats.ts";
import { connectExternal, short, type Wallet } from "../lib/wallet.ts";
import { DealCard, DealDialog, PayDialog, ReceiptLinks } from "./Payments.tsx";
import { SettingsDialog } from "./SettingsDialog.tsx";
import { Button, ConfirmDialog, ErrorText, Input, PeerName, errorMessage } from "./ui.tsx";

export interface Confirmation {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
}

export function Messenger({
  account,
  wallet: initialWallet,
  onLogout,
}: {
  account: Account;
  wallet: Wallet | null;
  onLogout: () => void;
}) {
  const session = useMemo(() => new Session(account.session, stellar), [account]);
  const me = session.address;
  const [settings, setSettings] = useState(loadSettings);
  const [peer, setPeer] = useState<string | null>(null);
  const chats = useChats(session, settings.volatile, peer);
  const [wallet, setWallet] = useState<Wallet | null>(initialWallet);
  const [node, setNode] = useState<NodeInfo | null>(null);
  const [balances, setBalances] = useState<{ XLM: string; USDC: string | null } | null>(null);
  const [dialog, setDialog] = useState<"pay" | "deal" | "settings" | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [newPeer, setNewPeer] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refreshBalances = useCallback(() => {
    stellar.balances(me).then(setBalances).catch(() => {});
  }, [me]);

  useEffect(() => {
    new NodeClient(account.session.homeNode).info().then(setNode).catch(() => {});
    refreshBalances();
    const t = setInterval(refreshBalances, 15_000);
    return () => clearInterval(t);
  }, [account, refreshBalances]);

  /** External wallets are reconnected lazily, only when something needs signing. */
  const getWallet = useCallback(async () => {
    if (wallet) return wallet;
    const w = await connectExternal(me);
    setWallet(w);
    return w;
  }, [wallet, me]);

  const run = (fn: () => Promise<unknown>) => {
    setError(null);
    fn().catch((e) => setError(errorMessage(e)));
  };

  const openChat = () =>
    run(async () => {
      const addr = newPeer.trim();
      if (!isAddress(addr)) throw new Error("Dirección Stellar inválida (empieza con G, 56 caracteres).");
      if (addr === me) throw new Error("Esa es tu propia dirección.");
      // A blocked user opens straight away, showing the "blocked" notice.
      if (!chats.blocked.includes(addr)) await chats.lookup(addr);
      setPeer(addr);
      setNewPeer("");
    });

  const sendPayload = useCallback(
    async (payload: Payload) => {
      if (!peer) return;
      await chats.send(peer, payload);
      refreshBalances();
    },
    [peer, chats, refreshBalances],
  );

  const confirmBlock = (target: string) =>
    setConfirmation({
      title: "¿Bloquear a este usuario?",
      message: (
        <>
          <PeerName address={target} alias={chats.aliasOf(target)} /> no podrá enviarte mensajes y se borrará
          esta conversación de tu dispositivo y de tu nodo. Podrás desbloquearlo después.
        </>
      ),
      confirmLabel: "Bloquear",
      danger: true,
      onConfirm: async () => {
        await chats.block(target);
        if (peer === target) setPeer(null);
      },
    });

  const confirmUnblock = (target: string) =>
    setConfirmation({
      title: "¿Desbloquear a este usuario?",
      message: (
        <>
          <PeerName address={target} alias={chats.aliasOf(target)} /> podrá volver a escribirte. Su primer mensaje
          llegará como solicitud.
        </>
      ),
      confirmLabel: "Desbloquear",
      onConfirm: () => chats.unblock(target),
    });

  const conversation = chats.conversations.find((c) => c.peer === peer);
  const requests = chats.conversations.filter((c) => c.request);
  const normal = chats.conversations.filter((c) => !c.request);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3">
        <h1 className="text-lg font-bold">
          Node<span className="text-emerald-400">X</span>change
        </h1>
        <button
          onClick={() => navigator.clipboard.writeText(me)}
          title="Copiar mi dirección"
          className="rounded-md bg-slate-900 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
        >
          {chats.myAlias && <span className="mr-1.5 font-medium text-slate-100">{chats.myAlias}</span>}
          <span className="font-mono">{short(me)}</span> ⧉
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
          {balances && (
            <>
              <span>{Number(balances.XLM).toFixed(2)} XLM</span>
              {balances.USDC !== null ? (
                <span>{Number(balances.USDC).toFixed(2)} USDC</span>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => run(async () => { await stellar.enableUsdc(me, (await getWallet()).signTx); refreshBalances(); })}
                >
                  Activar USDC
                </Button>
              )}
              {Number(balances.XLM) < 5 && (
                <Button variant="ghost" onClick={() => run(async () => { await stellar.fund(me); refreshBalances(); })}>
                  Fondear (testnet)
                </Button>
              )}
            </>
          )}
          <Button variant="ghost" onClick={() => setDialog("settings")}>
            Ajustes
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className={`w-full shrink-0 flex-col border-r border-slate-800 md:flex md:w-80 ${peer ? "hidden" : "flex"}`}>
          <div className="space-y-2 border-b border-slate-800 p-3">
            <Input value={newPeer} onChange={(e) => setNewPeer(e.target.value)} placeholder="Dirección G… para chatear" />
            <Button onClick={openChat} disabled={!newPeer} className="w-full">
              Nuevo chat
            </Button>
            <ErrorText error={error} />
            {chats.error && <p className="text-xs text-amber-400">Sin conexión con el nodo: {chats.error}</p>}
          </div>
          <div className="flex-1 overflow-y-auto">
            {requests.length > 0 && (
              <div className="px-3 pt-3 text-xs uppercase tracking-wide text-amber-300">Solicitudes</div>
            )}
            {requests.map((c) => (
              <ConversationItem key={c.peer} peer={c.peer} alias={chats.aliasOf(c.peer)} last={c.messages.at(-1)} unread={c.unread} active={peer === c.peer} onClick={() => setPeer(c.peer)} />
            ))}
            {normal.length > 0 && <div className="px-3 pt-3 text-xs uppercase tracking-wide text-slate-500">Chats</div>}
            {normal.map((c) => (
              <ConversationItem key={c.peer} peer={c.peer} alias={chats.aliasOf(c.peer)} last={c.messages.at(-1)} unread={c.unread} active={peer === c.peer} onClick={() => setPeer(c.peer)} />
            ))}
            {chats.conversations.length === 0 && (
              <p className="p-4 text-sm text-slate-500">
                Aún no tienes chats. Comparte tu dirección o pega la de alguien arriba.
              </p>
            )}
          </div>
        </aside>

        <main className={`min-w-0 flex-1 flex-col ${peer ? "flex" : "hidden md:flex"}`}>
          {peer ? (
            <ChatPane
              me={me}
              peer={peer}
              alias={chats.aliasOf(peer)}
              blocked={chats.blocked.includes(peer)}
              messages={conversation?.messages ?? []}
              request={conversation?.request ?? false}
              getWallet={getWallet}
              onBack={() => setPeer(null)}
              onSend={(text) => sendPayload({ t: "text", body: text })}
              onPayload={sendPayload}
              onAccept={() => chats.accept(peer)}
              onBlock={() => confirmBlock(peer)}
              onUnblock={() => confirmUnblock(peer)}
              onDelete={(ids) => chats.remove(peer, ids)}
              onPay={() => setDialog("pay")}
              onDeal={() => setDialog("deal")}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-slate-500">
              Mensajes cifrados de extremo a extremo · se borran del nodo 48 h después de leerlos
            </div>
          )}
        </main>
      </div>

      {dialog === "pay" && peer && (
        <PayDialog me={me} peer={peer} node={node} getWallet={getWallet} onDone={sendPayload} onClose={() => setDialog(null)} />
      )}
      {dialog === "deal" && peer && (
        <DealDialog me={me} peer={peer} node={node} getWallet={getWallet} onDone={sendPayload} onClose={() => setDialog(null)} />
      )}
      {dialog === "settings" && (
        <SettingsDialog
          account={account}
          settings={settings}
          onSettings={(s) => { setSettings(s); saveSettings(s); }}
          onClearHistory={chats.clearHistory}
          myAlias={chats.myAlias}
          onSetAlias={chats.setMyAlias}
          blocked={chats.blocked.map((b) => ({ address: b, alias: chats.aliasOf(b) }))}
          onUnblock={(b) => { setDialog(null); confirmUnblock(b); }}
          onPublishNode={async () => stellar.publishNode(me, account.session.homeNode, (await getWallet()).signTx)}
          onLogout={() => { clearAll(); onLogout(); }}
          onClose={() => setDialog(null)}
        />
      )}
      {confirmation && <ConfirmDialog {...confirmation} onClose={() => setConfirmation(null)} />}
    </div>
  );
}

function preview(m?: LocalMessage): string {
  if (!m) return "";
  const p = m.payload;
  if (p.t === "text") return p.body;
  if (p.t === "pay") return `💸 ${p.amount} ${p.asset}`;
  if (p.status === "released") return `🔓 Pago protegido #${p.dealId} liberado`;
  if (p.status === "refunded") return `↩ Pago protegido #${p.dealId} devuelto`;
  return `🔒 Pago protegido ${p.amount} ${p.asset}`;
}

function ConversationItem({
  peer,
  alias,
  last,
  unread,
  active,
  onClick,
}: {
  peer: string;
  alias: string | null;
  last?: LocalMessage;
  unread: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-900 ${active ? "bg-slate-900" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <PeerName address={peer} alias={alias} className="max-w-full text-sm" />
        <div className="truncate text-xs text-slate-500">{preview(last)}</div>
      </div>
      {unread > 0 && <span className="rounded-full bg-emerald-500 px-2 text-xs text-slate-950">{unread}</span>}
    </button>
  );
}

function ChatPane(props: {
  me: string;
  peer: string;
  alias: string | null;
  blocked: boolean;
  messages: LocalMessage[];
  request: boolean;
  getWallet: () => Promise<Wallet>;
  onBack: () => void;
  onSend: (text: string) => Promise<void>;
  onPayload: (p: Payload) => Promise<void>;
  onAccept: () => Promise<void>;
  onBlock: () => void;
  onUnblock: () => void;
  onDelete: (ids: string[]) => Promise<{ unsent: number; kept: number }>;
  onPay: () => void;
  onDeal: () => void;
}) {
  const { me, peer, messages, request, blocked } = props;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const chars = [...text].length;
  // Status notices per deal, so the original deal card re-reads the contract.
  const dealUpdates = new Map<string, number>();
  for (const m of messages) {
    if (m.payload.t === "deal" && m.payload.status !== "funded") {
      dealUpdates.set(m.payload.dealId, (dealUpdates.get(m.payload.dealId) ?? 0) + 1);
    }
  }

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const msg = errorMessage(e);
      setError(
        /request_pending|wait until/.test(msg)
          ? "Ya enviaste tu solicitud. Podrás escribir más cuando la acepte."
          : /blocked/.test(msg)
            ? "Este usuario te bloqueó."
            : msg,
      );
    } finally {
      setBusy(false);
    }
  }

  async function del(m: LocalMessage) {
    const res = await props.onDelete([m.id]);
    if (m.dir === "out") {
      setNote(res.unsent ? "Eliminado para todos." : "Borrado aquí. Ya lo había leído, así que él aún lo tiene.");
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
        <button onClick={props.onBack} className="text-slate-400 md:hidden">
          ←
        </button>
        <PeerName address={peer} alias={props.alias} />
        <button onClick={() => navigator.clipboard.writeText(peer)} className="text-xs text-slate-500 hover:text-slate-300">
          copiar
        </button>
        {!blocked && (
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={props.onPay}>Pagar</Button>
            <Button variant="ghost" onClick={props.onDeal}>Pago protegido</Button>
            <Button variant="ghost" onClick={props.onBlock} title="Bloquear">⛔</Button>
          </div>
        )}
      </div>

      {blocked && (
        <div className="flex flex-wrap items-center gap-2 border-b border-rose-900/50 bg-rose-950/30 px-4 py-2 text-sm">
          <span className="text-rose-200">⛔ Tienes bloqueado a este usuario. No puede escribirte.</span>
          <Button className="ml-auto" variant="ghost" onClick={props.onUnblock}>Desbloquear</Button>
        </div>
      )}

      {request && !blocked && (
        <div className="flex flex-wrap items-center gap-2 border-b border-amber-900/50 bg-amber-950/30 px-4 py-2 text-sm">
          <span className="text-amber-200">Solicitud de mensaje de alguien que no conoces.</span>
          <Button className="ml-auto" disabled={busy} onClick={() => run(props.onAccept)}>Aceptar</Button>
          <Button variant="danger" disabled={busy} onClick={props.onBlock}>Bloquear</Button>
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((m) => (
          <div key={m.id} className={`group flex ${m.dir === "out" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                m.dir === "out" ? "bg-emerald-600/20 text-emerald-50" : "bg-slate-800"
              }`}
            >
              {m.payload.t === "text" && <p className="whitespace-pre-wrap break-words">{m.payload.body}</p>}
              {m.payload.t === "pay" && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-emerald-300">
                    {m.dir === "out" ? "Enviaste" : "Recibiste"}
                  </div>
                  <div className="text-lg font-semibold">
                    {m.payload.amount} {m.payload.asset}
                  </div>
                  <ReceiptLinks hash={m.payload.hash} />
                </div>
              )}
              {m.payload.t === "deal" && m.payload.status === "funded" && (
                <DealCard
                  payload={m.payload}
                  me={me}
                  refreshKey={dealUpdates.get(m.payload.dealId) ?? 0}
                  getWallet={props.getWallet}
                  onUpdate={props.onPayload}
                />
              )}
              {m.payload.t === "deal" && m.payload.status !== "funded" && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-amber-300">
                    Pago protegido #{m.payload.dealId}{" "}
                    {m.payload.status === "released" ? "liberado al vendedor" : "devuelto al comprador"}
                  </div>
                  <ReceiptLinks hash={m.payload.hash} />
                </div>
              )}
              <div className="mt-1 flex gap-2 text-[10px] text-slate-500">
                <span>{new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <button onClick={() => del(m)} className="hidden hover:text-rose-400 group-hover:inline">
                  borrar
                </button>
              </div>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form
        className="space-y-1 border-t border-slate-800 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim() || chars > MAX_MESSAGE_CHARS) return;
          void run(async () => {
            await props.onSend(text.trim());
            setText("");
            setNote(null);
          });
        }}
      >
        <div className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={blocked ? "Desbloquea para escribir" : "Mensaje"}
            disabled={busy || blocked}
          />
          <Button type="submit" disabled={busy || blocked || !text.trim() || chars > MAX_MESSAGE_CHARS}>
            Enviar
          </Button>
        </div>
        <div className="flex justify-between text-xs">
          <span>
            <ErrorText error={error} />
            {note && <span className="text-slate-400">{note}</span>}
          </span>
          <span className={chars > MAX_MESSAGE_CHARS ? "text-rose-400" : "text-slate-500"}>
            {chars}/{MAX_MESSAGE_CHARS}
          </span>
        </div>
      </form>
    </>
  );
}
