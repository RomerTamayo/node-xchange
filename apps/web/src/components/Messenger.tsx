import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Ban,
  Coins,
  Copy,
  Droplets,
  HandCoins,
  MoreVertical,
  Plus,
  Send,
  Settings as SettingsIcon,
  ShieldCheck,
  Trash2,
  Wallet as WalletIcon,
} from "lucide-react";
import {
  MAX_MESSAGE_CHARS,
  NodeClient,
  Session,
  isAddress,
  type NodeInfo,
  type Payload,
} from "@nodexchange/core";
import { stellar } from "../lib/config.ts";
import { locale, t, useLang } from "../lib/i18n.ts";
import { clearAll, loadSettings, saveSettings, type Account, type LocalMessage } from "../lib/store.ts";
import { useChats } from "../lib/useChats.ts";
import { connectExternal, short, type Wallet } from "../lib/wallet.ts";
import { DealCard, DealDialog, DealsPanel, PayDialog, ReceiptLinks } from "./Payments.tsx";
import { SettingsDialog } from "./SettingsDialog.tsx";
import {
  Button,
  ConfirmDialog,
  ErrorText,
  Input,
  LangToggle,
  Logo,
  Menu,
  PeerName,
  errorMessage,
  type MenuItem,
} from "./ui.tsx";

export interface Confirmation {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
}

const AVATAR_GRADIENTS = [
  "from-violet-400 to-violet-700",
  "from-cyan-300 to-cyan-600",
  "from-emerald-300 to-emerald-600",
  "from-ruby-400 to-ruby-700",
  "from-violet-400 to-cyan-500",
  "from-cyan-300 to-emerald-500",
];

function Avatar({ address, alias, size = "md" }: { address: string; alias: string | null; size?: "sm" | "md" }) {
  let hash = 0;
  for (const ch of address) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const letters = (alias?.trim() || address.slice(1, 3)).slice(0, 2).toUpperCase();
  const dim = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  return (
    <span
      aria-hidden
      className={`gloss inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white ${dim} ${AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]}`}
    >
      {letters}
    </span>
  );
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
  useLang();
  const session = useMemo(() => new Session(account.session, stellar), [account]);
  const me = session.address;
  const [settings, setSettings] = useState(loadSettings);
  const [peer, setPeer] = useState<string | null>(null);
  const chats = useChats(session, settings.volatile, peer);
  const [wallet, setWallet] = useState<Wallet | null>(initialWallet);
  const [node, setNode] = useState<NodeInfo | null>(null);
  const [balances, setBalances] = useState<{ XLM: string; USDC: string | null } | null>(null);
  const [dialog, setDialog] = useState<"pay" | "deal" | "deals" | "settings" | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [newPeer, setNewPeer] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refreshBalances = useCallback(() => {
    stellar.balances(me).then(setBalances).catch(() => {});
  }, [me]);

  useEffect(() => {
    new NodeClient(account.session.homeNode).info().then(setNode).catch(() => {});
    refreshBalances();
    const timer = setInterval(refreshBalances, 15_000);
    return () => clearInterval(timer);
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
      if (!isAddress(addr)) throw new Error(t("invalidAddress"));
      if (addr === me) throw new Error(t("ownAddress"));
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
      title: t("blockTitle"),
      message: (
        <>
          <PeerName address={target} alias={chats.aliasOf(target)} /> {t("blockBody")}
        </>
      ),
      confirmLabel: t("block"),
      danger: true,
      onConfirm: async () => {
        await chats.block(target);
        if (peer === target) setPeer(null);
      },
    });

  const confirmUnblock = (target: string) =>
    setConfirmation({
      title: t("unblockTitle"),
      message: (
        <>
          <PeerName address={target} alias={chats.aliasOf(target)} /> {t("unblockBody")}
        </>
      ),
      confirmLabel: t("unblock"),
      onConfirm: () => chats.unblock(target),
    });

  const conversation = chats.conversations.find((c) => c.peer === peer);
  const requests = chats.conversations.filter((c) => c.request);
  const normal = chats.conversations.filter((c) => !c.request);

  const walletItems: MenuItem[] = [
    { label: t("copyMyAddress"), icon: <Copy size={16} />, onSelect: () => navigator.clipboard.writeText(me) },
  ];
  if (balances && balances.USDC === null) {
    walletItems.push({
      label: t("enableUsdc"),
      icon: <Coins size={16} />,
      onSelect: () =>
        run(async () => {
          await stellar.enableUsdc(me, (await getWallet()).signTx);
          refreshBalances();
        }),
    });
  }
  if (stellar.net.friendbotUrl) {
    walletItems.push({
      label: t("fundTestnet"),
      icon: <Droplets size={16} />,
      onSelect: () =>
        run(async () => {
          await stellar.fund(me);
          refreshBalances();
        }),
    });
  }
  const xlm = balances ? Number(balances.XLM).toLocaleString(locale(), { maximumFractionDigits: 2 }) : "…";

  return (
    <div className="flex h-dvh flex-col">
      <header className="glass relative z-30 flex items-center gap-2 rounded-none border-x-0 border-t-0 px-3 py-2 sm:gap-3 sm:px-4">
        <h1 className="text-lg">
          <Logo />
        </h1>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <Menu
            label={t("wallet")}
            trigger={
              <>
                <WalletIcon size={16} className="text-cyan-300" />
                <span className="max-w-[7rem] truncate">{chats.myAlias ?? short(me)}</span>
                <span className="hidden text-ink-300 sm:inline">· {xlm} XLM</span>
              </>
            }
            header={
              <div className="space-y-1">
                <PeerName address={me} alias={chats.myAlias} />
                <div className="flex gap-4 pt-1 text-sm">
                  <span>
                    <b className="text-white">{xlm}</b> <span className="text-ink-400">XLM</span>
                  </span>
                  {balances?.USDC != null && (
                    <span>
                      <b className="text-white">{Number(balances.USDC).toLocaleString(locale(), { maximumFractionDigits: 2 })}</b>{" "}
                      <span className="text-ink-400">USDC</span>
                    </span>
                  )}
                </div>
              </div>
            }
            items={walletItems}
          />
          <Button variant="ghost" aria-label={t("deals")} title={t("deals")} onClick={() => setDialog("deals")}>
            <ShieldCheck size={16} className="text-cyan-300" />
            <span className="hidden lg:inline">{t("deals")}</span>
          </Button>
          <Button variant="ghost" aria-label={t("settings")} title={t("settings")} onClick={() => setDialog("settings")}>
            <SettingsIcon size={16} />
          </Button>
          <div className="hidden sm:block">
            <LangToggle />
          </div>
        </div>
      </header>
      {error && (
        <div className="border-b border-ruby-500/30 bg-ruby-950/40 px-4 py-2">
          <ErrorText error={error} />
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside
          className={`w-full shrink-0 flex-col border-r border-white/10 bg-black/20 md:flex md:w-80 ${peer ? "hidden" : "flex"}`}
        >
          <div className="space-y-2 border-b border-white/10 p-3">
            <div className="flex gap-2">
              <Input value={newPeer} onChange={(e) => setNewPeer(e.target.value)} placeholder={t("newChatPlaceholder")} />
              <Button onClick={openChat} disabled={!newPeer} aria-label={t("newChat")} title={t("newChat")}>
                <Plus size={18} />
              </Button>
            </div>
            {chats.error && <p className="text-xs text-ruby-300">{t("nodeOffline", { error: chats.error })}</p>}
          </div>
          <div className="flex-1 overflow-y-auto p-1.5">
            {requests.length > 0 && <SectionLabel className="text-violet-300">{t("requests")}</SectionLabel>}
            {requests.map((c) => (
              <ConversationItem key={c.peer} peer={c.peer} alias={chats.aliasOf(c.peer)} last={c.messages.at(-1)} unread={c.unread} active={peer === c.peer} onClick={() => setPeer(c.peer)} />
            ))}
            {normal.length > 0 && <SectionLabel>{t("chats")}</SectionLabel>}
            {normal.map((c) => (
              <ConversationItem key={c.peer} peer={c.peer} alias={chats.aliasOf(c.peer)} last={c.messages.at(-1)} unread={c.unread} active={peer === c.peer} onClick={() => setPeer(c.peer)} />
            ))}
            {chats.conversations.length === 0 && <p className="p-4 text-sm text-ink-400">{t("noChats")}</p>}
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
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-ink-400">
              <div className="glass max-w-sm rounded-2xl p-6">
                <ShieldCheck className="mx-auto mb-3 text-cyan-300" size={28} />
                {t("emptyPane")}
              </div>
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
      {dialog === "deals" && (
        <DealsPanel
          me={me}
          getWallet={getWallet}
          aliasOf={chats.aliasOf}
          notify={async (to, payload) => {
            await chats.send(to, payload);
            refreshBalances();
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "settings" && (
        <SettingsDialog
          account={account}
          settings={settings}
          onSettings={(s) => {
            setSettings(s);
            saveSettings(s);
          }}
          onClearHistory={chats.clearHistory}
          myAlias={chats.myAlias}
          onSetAlias={chats.setMyAlias}
          blocked={chats.blocked.map((b) => ({ address: b, alias: chats.aliasOf(b) }))}
          onUnblock={(b) => {
            setDialog(null);
            confirmUnblock(b);
          }}
          onPublishNode={async () => stellar.publishNode(me, account.session.homeNode, (await getWallet()).signTx)}
          onLogout={() => {
            clearAll();
            onLogout();
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {confirmation && <ConfirmDialog {...confirmation} onClose={() => setConfirmation(null)} />}
    </div>
  );
}

function SectionLabel({ children, className = "text-ink-400" }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider ${className}`}>{children}</div>;
}

function preview(m?: LocalMessage): string {
  if (!m) return "";
  const p = m.payload;
  if (p.t === "text") return p.body;
  if (p.t === "pay") return t("previewPay", { amount: p.amount, asset: p.asset });
  if (p.status === "released") return t("previewDealReleased", { id: p.dealId });
  if (p.status === "refunded") return t("previewDealRefunded", { id: p.dealId });
  return t("previewDeal", { amount: p.amount, asset: p.asset });
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
      className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${active ? "glass" : "hover:bg-white/5"}`}
    >
      <Avatar address={peer} alias={alias} />
      <div className="min-w-0 flex-1">
        <PeerName address={peer} alias={alias} className="max-w-full text-sm" />
        <div className="truncate text-xs text-ink-400">{preview(last)}</div>
      </div>
      {unread > 0 && (
        <span className="gloss rounded-full bg-gradient-to-b from-emerald-300 to-emerald-500 px-2 text-xs font-semibold text-ink-950">
          {unread}
        </span>
      )}
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
          ? t("errRequestPending")
          : /blocked/.test(msg)
            ? t("errBlockedByPeer")
            : msg,
      );
    } finally {
      setBusy(false);
    }
  }

  async function del(m: LocalMessage) {
    const res = await props.onDelete([m.id]);
    if (m.dir === "out") setNote(res.unsent ? t("unsentForAll") : t("keptByPeer"));
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b border-white/10 bg-black/10 px-2 py-2 sm:px-4">
        <button onClick={props.onBack} className="rounded-lg p-1.5 text-ink-300 hover:bg-white/10 md:hidden" aria-label={t("back")}>
          <ArrowLeft size={18} />
        </button>
        <Avatar address={peer} alias={props.alias} size="sm" />
        <PeerName address={peer} alias={props.alias} className="min-w-0 flex-1" />
        {!blocked && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Menu
              label={t("pay")}
              variant="primary"
              trigger={
                <>
                  <HandCoins size={16} />
                  <span className="hidden sm:inline">{t("pay")}</span>
                </>
              }
              items={[
                { label: t("directPayment"), hint: t("directPaymentHint"), icon: <Send size={16} className="text-emerald-300" />, onSelect: props.onPay },
                { label: t("protectedPayment"), hint: t("protectedPaymentHint"), icon: <ShieldCheck size={16} className="text-cyan-300" />, onSelect: props.onDeal },
              ]}
            />
            <Menu
              label={t("moreOptions")}
              chevron={false}
              trigger={<MoreVertical size={16} />}
              items={[
                { label: t("copyAddress"), icon: <Copy size={16} />, onSelect: () => navigator.clipboard.writeText(peer) },
                { label: t("block"), icon: <Ban size={16} />, danger: true, onSelect: props.onBlock },
              ]}
            />
          </div>
        )}
      </div>

      {blocked && (
        <div className="flex flex-wrap items-center gap-2 border-b border-ruby-500/30 bg-ruby-950/40 px-4 py-2 text-sm">
          <Ban size={16} className="text-ruby-300" />
          <span className="text-ruby-200">{t("blockedBanner")}</span>
          <Button className="ml-auto" variant="ghost" onClick={props.onUnblock}>
            {t("unblock")}
          </Button>
        </div>
      )}

      {request && !blocked && (
        <div className="flex flex-wrap items-center gap-2 border-b border-violet-400/30 bg-violet-950/40 px-4 py-2 text-sm">
          <span className="text-violet-200">{t("requestBanner")}</span>
          <div className="ml-auto flex gap-2">
            <Button disabled={busy} onClick={() => run(props.onAccept)}>
              {t("accept")}
            </Button>
            <Button variant="danger" disabled={busy} onClick={props.onBlock}>
              {t("block")}
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto p-3 sm:p-4">
        {messages.map((m) => (
          <div key={m.id} className={`group flex ${m.dir === "out" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm sm:max-w-[70%] ${
                m.dir === "out"
                  ? "rounded-br-md border border-violet-300/25 bg-gradient-to-br from-violet-500/40 to-cyan-500/25 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]"
                  : "glass rounded-bl-md"
              }`}
            >
              {m.payload.t === "text" && <p className="whitespace-pre-wrap break-words">{m.payload.body}</p>}
              {m.payload.t === "pay" && (
                <div>
                  <div className={`text-xs font-semibold uppercase tracking-wide ${m.dir === "out" ? "text-violet-200" : "text-emerald-300"}`}>
                    {m.dir === "out" ? t("youSent") : t("youReceived")}
                  </div>
                  <div className="text-lg font-semibold text-white">
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
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-cyan-300">
                    <ShieldCheck size={14} />
                    {m.payload.status === "released"
                      ? t("dealReleasedNotice", { id: m.payload.dealId })
                      : t("dealRefundedNotice", { id: m.payload.dealId })}
                  </div>
                  <ReceiptLinks hash={m.payload.hash} />
                </div>
              )}
              <div className="mt-1 flex items-center gap-2 text-[10px] text-ink-400">
                <span>{new Date(m.ts).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })}</span>
                <button
                  onClick={() => del(m)}
                  className="hidden items-center gap-0.5 hover:text-ruby-300 group-hover:inline-flex"
                  aria-label={t("deleteMessage")}
                >
                  <Trash2 size={11} />
                  {t("deleteMessage")}
                </button>
              </div>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form
        className="space-y-1 border-t border-white/10 bg-black/20 p-2 sm:p-3"
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
            placeholder={blocked ? t("unblockToWrite") : t("messagePlaceholder")}
            disabled={busy || blocked}
          />
          <Button
            type="submit"
            aria-label={t("send")}
            title={t("send")}
            disabled={busy || blocked || !text.trim() || chars > MAX_MESSAGE_CHARS}
          >
            <Send size={16} />
            <span className="hidden sm:inline">{t("send")}</span>
          </Button>
        </div>
        <div className="flex justify-between gap-2 px-1 text-xs">
          <span>
            <ErrorText error={error} />
            {note && <span className="text-ink-300">{note}</span>}
          </span>
          <span className={chars > MAX_MESSAGE_CHARS ? "text-ruby-400" : "text-ink-500"}>
            {chars}/{MAX_MESSAGE_CHARS}
          </span>
        </div>
      </form>
    </>
  );
}
