import { useEffect, useState } from "react";
import { ExternalLink, FileJson, Printer, Send, ShieldCheck } from "lucide-react";
import {
  MAX_DEAL_DAYS,
  MAX_TRANSFER_FEE_BPS,
  WithdrawError,
  dealStatus,
  isAddress,
  feeOf,
  fromStroops,
  type AssetCode,
  type Deal,
  type NodeInfo,
  type Payload,
} from "@nodexchange/core";
import { stellar } from "../lib/config.ts";
import { locale, t, useLang, type Key } from "../lib/i18n.ts";
import { downloadReceipt, printReceipt } from "../lib/receipt.ts";
import { short, type Wallet } from "../lib/wallet.ts";
import { Button, ErrorText, Field, Input, Modal, PeerName, errorMessage } from "./ui.tsx";

const AMOUNT_RE = /^\d+(\.\d{1,7})?$/;

function AssetPicker({ value, onChange }: { value: AssetCode; onChange: (a: AssetCode) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/30 p-1 text-sm">
      {(["XLM", "USDC"] as const).map((a) => (
        <button
          key={a}
          onClick={() => onChange(a)}
          className={`rounded-lg py-1.5 transition ${value === a ? "glass text-white" : "text-ink-400 hover:text-white"}`}
        >
          {a}
        </button>
      ))}
    </div>
  );
}

interface DialogProps {
  me: string;
  peer: string;
  node: NodeInfo | null;
  getWallet: () => Promise<Wallet>;
  onDone: (payload: Payload) => Promise<void>;
  onClose: () => void;
}

export function PayDialog({ me, peer, node, getWallet, onDone, onClose }: DialogProps) {
  useLang();
  const [asset, setAsset] = useState<AssetCode>("XLM");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const feeBps = node?.transferFeeBps ?? 0;
  // Never trust the node's fee blindly: above the cap we refuse to pay.
  const feeTooHigh = feeBps > MAX_TRANSFER_FEE_BPS;
  const valid = AMOUNT_RE.test(amount) && Number(amount) > 0 && memo.length <= 28 && !feeTooHigh;
  const fee = valid && feeBps ? feeOf(amount, feeBps) : "0";

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (!(await stellar.canReceive(peer, asset))) {
        throw new Error(asset === "USDC" ? t("errNoUsdc") : t("errNoAccount"));
      }
      const wallet = await getWallet();
      const res = await stellar.pay({
        from: me,
        to: peer,
        amount,
        asset,
        memo: memo || undefined,
        signer: wallet.signTx,
        fee: feeBps && node?.operator ? { to: node.operator, bps: feeBps } : undefined,
      });
      await onDone({ t: "pay", hash: res.hash, amount, asset, fee: res.fee });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t("sendTo", { name: short(peer) })} onClose={onClose}>
      <AssetPicker value={asset} onChange={setAsset} />
      <Field label={t("amount")}>
        <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
      </Field>
      <Field label={t("memoOptional")} hint={t("memoHint")}>
        <Input value={memo} maxLength={28} onChange={(e) => setMemo(e.target.value)} />
      </Field>
      {valid && (
        <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-ink-200">
          {t("receives")}{" "}
          <b className="text-white">
            {amount} {asset}
          </b>
          {fee !== "0" && <> · {t("nodeFee", { fee, asset, pct: feeBps / 100 })}</>}
        </div>
      )}
      {feeTooHigh && (
        <p className="text-sm text-ruby-400">
          {t("feeTooHigh", { pct: feeBps / 100, max: MAX_TRANSFER_FEE_BPS / 100 })}
        </p>
      )}
      <ErrorText error={error} />
      <Button onClick={submit} disabled={!valid || busy} className="w-full">
        {busy ? t("sendingPayment") : t("sendPayment")}
      </Button>
    </Modal>
  );
}

export function DealDialog({ me, peer, node, getWallet, onDone, onClose }: DialogProps) {
  useLang();
  const [asset, setAsset] = useState<AssetCode>("XLM");
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState("7");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    AMOUNT_RE.test(amount) && Number(amount) > 0 && /^\d+$/.test(days) && Number(days) >= 1 && Number(days) <= MAX_DEAL_DAYS;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (!node?.operator) throw new Error(t("errNoArbiter"));
      const wallet = await getWallet();
      const res = await stellar.createDeal({
        buyer: me,
        seller: peer,
        arbiter: node.operator,
        amount,
        asset,
        days: Number(days),
        signer: wallet.signTx,
      });
      await onDone({
        t: "deal",
        contract: stellar.net.escrow,
        dealId: res.dealId,
        amount,
        asset,
        status: "funded",
        hash: res.hash,
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t("dealTitle")} onClose={onClose}>
      <p className="text-sm text-ink-300">{t("dealIntro", { name: short(peer) })}</p>
      <AssetPicker value={asset} onChange={setAsset} />
      <Field label={t("amount")}>
        <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
      </Field>
      <Field label={t("term", { max: MAX_DEAL_DAYS })} hint={t("termHint")}>
        <Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
      </Field>
      <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3 text-xs text-ink-300">
        <span className="font-medium text-cyan-200">{t("arbiterLabel")}</span>{" "}
        {node?.operator ? (
          <>
            <PeerName address={node.operator} alias={null} /> {t("arbiterBody", { node: node.name })}
          </>
        ) : (
          t("noArbiter")
        )}
      </div>
      <ErrorText error={error} />
      <Button onClick={submit} disabled={!valid || busy} className="w-full">
        <ShieldCheck size={16} />
        {busy ? t("lockingFunds") : t("lockFunds")}
      </Button>
    </Modal>
  );
}

export function ReceiptLinks({ hash }: { hash: string }) {
  useLang();
  const [error, setError] = useState<string | null>(null);
  const wrap = (fn: () => Promise<void>) => () => fn().catch((e) => setError(errorMessage(e)));
  const link = "inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200 hover:underline";
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
      <a className={link} href={stellar.txUrl(hash)} target="_blank" rel="noreferrer">
        <ExternalLink size={12} />
        {t("viewOnChain")}
      </a>
      <button className={link} onClick={wrap(() => printReceipt(hash))}>
        <Printer size={12} />
        {t("printPdf")}
      </button>
      <button className={link} onClick={wrap(() => downloadReceipt(hash))}>
        <FileJson size={12} />
        JSON
      </button>
      {error && <span className="text-ruby-400">{error}</span>}
    </div>
  );
}

const STATUS_LABEL: Record<"Funded" | "Released" | "Refunded", Key> = {
  Funded: "statusFunded",
  Released: "statusReleased",
  Refunded: "statusRefunded",
};

const STATUS_COLOR = { Funded: "text-cyan-200", Released: "text-emerald-300", Refunded: "text-violet-300" };

export function assetOfToken(token: string): string {
  if (token === stellar.net.xlmSac) return "XLM";
  if (token === stellar.net.usdc.sac) return "USDC";
  return "token";
}

type SettleAction = "release" | "cancel" | "reclaim";

/**
 * Live view of a deal read from the contract, with the actions the viewer may
 * take. Used in chat cards and in the protected payments panel.
 */
export function DealView({
  dealId,
  me,
  refreshKey = 0,
  initial,
  getWallet,
  notify,
  showParties = false,
  aliasOf,
}: {
  dealId: string;
  me: string;
  refreshKey?: number;
  initial?: Deal;
  getWallet: () => Promise<Wallet>;
  /** Tells the other party; failures don't undo the on-chain settlement. */
  notify: (action: SettleAction, hash: string, deal: Deal) => Promise<void>;
  showParties?: boolean;
  aliasOf?: (address: string) => string | null;
}) {
  useLang();
  const [deal, setDeal] = useState<Deal | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<Key | null>(null);

  const load = () =>
    stellar
      .getDeal(dealId, me)
      .then(setDeal)
      .catch((e) => setError(errorMessage(e)));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId, refreshKey]);

  const status = deal ? dealStatus(deal) : null;
  const iAmBuyer = deal?.buyer === me;
  const iAmSeller = deal?.seller === me;
  const expired = deal ? Date.now() / 1000 >= Number(deal.deadline) : false;

  async function act(action: SettleAction) {
    if (!deal) return;
    setBusy(true);
    setError(null);
    setNote(null);
    let hash: string;
    try {
      const wallet = await getWallet();
      hash = await stellar.settleDeal(action, dealId, me, wallet.signTx);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
      return;
    }
    // The money already moved; a failed notice must not look like a failed payment.
    try {
      await notify(action, hash, deal);
    } catch {
      setNote(action === "release" ? "notifyFailRelease" : "notifyFailRefund");
    }
    await load();
    setBusy(false);
  }

  const counterpart = deal ? (iAmBuyer ? deal.seller : deal.buyer) : null;
  const role = iAmBuyer ? t("roleBuyer") : iAmSeller ? t("roleSeller") : t("roleArbiter");

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-cyan-300">
        <ShieldCheck size={14} />
        {t("protectedPaymentNo", { id: dealId })}
        {deal && <span className="font-normal text-ink-400">· {role}</span>}
      </div>
      {showParties && counterpart && (
        <div className="text-sm text-ink-200">
          {iAmBuyer ? t("seller") : t("buyer")}: <PeerName address={counterpart} alias={aliasOf?.(counterpart) ?? null} />
        </div>
      )}
      <div className="text-lg font-semibold text-white">
        {deal ? `${fromStroops(deal.amount)} ${assetOfToken(deal.token)}` : "…"}
      </div>
      <div className="text-sm">
        {status ? (
          <span className={STATUS_COLOR[status]}>{t(STATUS_LABEL[status])}</span>
        ) : (
          !error && <span className="text-ink-400">{t("queryingContract")}</span>
        )}
        {deal && status === "Funded" && (
          <span className="text-ink-400">
            {" "}
            · {t("dueOn", { date: new Date(Number(deal.deadline) * 1000).toLocaleDateString(locale()) })}
          </span>
        )}
      </div>
      {deal && (
        <div className="text-xs text-ink-400">
          {t("arbiter")}: <PeerName address={deal.arbiter} alias={null} />
        </div>
      )}
      {status === "Funded" && (
        <div className="flex flex-wrap gap-2 pt-1">
          {iAmBuyer && (
            <Button disabled={busy} onClick={() => act("release")}>
              {t("releasePayment")}
            </Button>
          )}
          {iAmBuyer && expired && (
            <Button variant="ghost" disabled={busy} onClick={() => act("reclaim")}>
              {t("reclaimFunds")}
            </Button>
          )}
          {iAmSeller && (
            <Button variant="ghost" disabled={busy} onClick={() => act("cancel")}>
              {t("cancelAndRefund")}
            </Button>
          )}
        </div>
      )}
      {note && <p className="text-xs text-cyan-200">{t(note)}</p>}
      <ErrorText error={error} />
    </div>
  );
}

/** Deal notice inside a chat. */
export function DealCard({
  payload,
  me,
  refreshKey,
  getWallet,
  onUpdate,
}: {
  payload: Extract<Payload, { t: "deal" }>;
  me: string;
  /** Changes when a status notice for this deal arrives. */
  refreshKey: number;
  getWallet: () => Promise<Wallet>;
  onUpdate: (p: Payload) => Promise<void>;
}) {
  useLang();
  if (payload.contract !== stellar.net.escrow) {
    return (
      <div className="space-y-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-cyan-300">
          {t("protectedPaymentNo", { id: payload.dealId })}
        </div>
        <p className="text-sm text-ink-400">{t("oldContract", { amount: payload.amount, asset: payload.asset })}</p>
        <ReceiptLinks hash={payload.hash} />
      </div>
    );
  }
  return (
    <div>
      <DealView
        dealId={payload.dealId}
        me={me}
        refreshKey={refreshKey}
        getWallet={getWallet}
        notify={(action, hash) =>
          onUpdate({ ...payload, status: action === "release" ? "released" : "refunded", hash })
        }
      />
      <ReceiptLinks hash={payload.hash} />
    </div>
  );
}

/** Every deal of the user, read from the contract: survives logouts, blocks and expired chats. */
export function DealsPanel({
  me,
  getWallet,
  notify,
  aliasOf,
  onClose,
}: {
  me: string;
  getWallet: () => Promise<Wallet>;
  notify: (peer: string, payload: Payload) => Promise<void>;
  aliasOf: (address: string) => string | null;
  onClose: () => void;
}) {
  useLang();
  const [deals, setDeals] = useState<{ id: string; deal: Deal }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    stellar
      .dealsOf(me)
      .then(setDeals)
      .catch((e) => setError(errorMessage(e)));
  }, [me]);

  return (
    <Modal title={t("dealsTitle")} onClose={onClose}>
      <p className="text-xs text-ink-400">{t("dealsIntro")}</p>
      {!deals && !error && <p className="text-sm text-ink-400">{t("queryingContract")}</p>}
      {deals?.length === 0 && <p className="text-sm text-ink-400">{t("noDeals")}</p>}
      <div className="space-y-3">
        {deals?.map(({ id, deal }) => (
          <div key={id} className="glass rounded-2xl p-3">
            <DealView
              dealId={id}
              me={me}
              initial={deal}
              showParties
              aliasOf={aliasOf}
              getWallet={getWallet}
              notify={async (action, hash, d) => {
                const peer = d.buyer === me ? d.seller : d.buyer;
                const asset = assetOfToken(d.token);
                await notify(peer, {
                  t: "deal",
                  contract: stellar.net.escrow,
                  dealId: id,
                  amount: fromStroops(d.amount),
                  asset: asset === "token" ? "XLM" : asset,
                  status: action === "release" ? "released" : "refunded",
                  hash,
                });
              }}
            />
          </div>
        ))}
      </div>
      <ErrorText error={error} />
    </Modal>
  );
}

const WITHDRAW_ERRORS: Record<string, Key> = {
  same_account: "wdSameAccount",
  no_account_usdc: "wdNoAccountUsdc",
  min_create: "wdMinCreate",
  no_trustline: "wdNoTrustline",
  bad_memo: "wdBadMemo",
};

/** Send XLM or USDC to any Stellar address: another wallet or an exchange. */
export function WithdrawDialog({
  me,
  getWallet,
  onDone,
  onClose,
}: {
  me: string;
  getWallet: () => Promise<Wallet>;
  onDone: () => void;
  onClose: () => void;
}) {
  useLang();
  const [asset, setAsset] = useState<AssetCode>("XLM");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [isExchange, setIsExchange] = useState(false);
  const [max, setMax] = useState<string | null>(null);
  const [dest, setDest] = useState<{ exists: boolean; usdc: boolean; homeDomain: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ hash: string; created: boolean } | null>(null);

  const target = to.trim();
  const validTo = isAddress(target) && target !== me;

  useEffect(() => {
    setMax(null);
    stellar.maxSendable(me, asset).then(setMax).catch(() => {});
  }, [me, asset, sent]);

  useEffect(() => {
    setDest(null);
    if (!validTo) return;
    let live = true;
    stellar
      .inspect(target)
      .then((d) => live && setDest(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [target, validTo]);

  const amountOk = AMOUNT_RE.test(amount) && Number(amount) > 0 && (max === null || Number(amount) <= Number(max));
  const memoOk = !isExchange || memo.trim().length > 0;
  const valid = validTo && amountOk && memoOk;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const wallet = await getWallet();
      const res = await stellar.withdraw({
        from: me,
        to: target,
        amount,
        asset,
        memo: memo.trim() || undefined,
        signer: wallet.signTx,
      });
      setSent(res);
      onDone();
    } catch (e) {
      setError(e instanceof WithdrawError ? t(WITHDRAW_ERRORS[e.code]) : errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Modal title={t("withdraw")} onClose={onClose}>
        <p className="text-sm text-emerald-300">{sent.created ? t("withdrawCreated") : t("withdrawDone")}</p>
        <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm">
          <div className="text-lg font-semibold text-white">
            {amount} {asset}
          </div>
          <div className="break-all font-mono text-xs text-ink-400">{target}</div>
          <ReceiptLinks hash={sent.hash} />
        </div>
        <Button className="w-full" onClick={onClose}>
          {t("close")}
        </Button>
      </Modal>
    );
  }

  return (
    <Modal title={t("withdraw")} onClose={onClose}>
      {stellar.net.friendbotUrl && (
        <p className="rounded-xl border border-violet-400/30 bg-violet-950/40 p-3 text-xs text-violet-200">{t("testnetWarning")}</p>
      )}
      <AssetPicker value={asset} onChange={setAsset} />
      <Field label={t("destination")}>
        <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="G…" spellCheck={false} />
      </Field>
      {dest && !dest.exists && asset === "XLM" && <p className="text-xs text-cyan-200">{t("willCreate")}</p>}
      {dest && !dest.exists && asset === "USDC" && <p className="text-xs text-ruby-300">{t("wdNoAccountUsdc")}</p>}
      {dest?.exists && asset === "USDC" && !dest.usdc && <p className="text-xs text-ruby-300">{t("wdNoTrustline")}</p>}
      {dest?.homeDomain && <p className="text-xs text-cyan-200">{t("homeDomainHint", { domain: dest.homeDomain })}</p>}

      <Field label={t("amount")} hint={max !== null ? t("available", { amount: max, asset }) : undefined}>
        <div className="flex gap-2">
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          <Button variant="ghost" onClick={() => max && setAmount(max)} disabled={!max || max === "0"}>
            {t("maxAmount")}
          </Button>
        </div>
      </Field>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={isExchange} onChange={(e) => setIsExchange(e.target.checked)} />
        <span>
          {t("exchangeCheck")}
          {isExchange && <span className="block text-xs text-ruby-300">{t("exchangeMemoWarning")}</span>}
        </span>
      </label>
      <Field label={isExchange ? t("memoRequired") : t("memoOptional")}>
        <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
      </Field>

      <ErrorText error={error} />
      <Button onClick={submit} disabled={!valid || busy} className="w-full">
        <Send size={16} />
        {busy ? t("sendingPayment") : valid ? t("sendAmount", { amount, asset }) : t("sendPayment")}
      </Button>
    </Modal>
  );
}
