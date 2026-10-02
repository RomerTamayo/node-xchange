// External payment methods (BEP20 and future networks): direct payments that
// leave NodeXchange, so they carry no escrow. We only show and verify addresses.

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { AlertTriangle, BadgeCheck, Check, Copy, Info, Link2, QrCode, ShieldAlert, ShieldQuestion, Trash2 } from "lucide-react";
import {
  EXT_NETWORKS,
  MAX_EXT_LABEL_CHARS,
  MAX_PUBLIC_EXT_METHODS,
  extDataKey,
  extMethodHash,
  extMethodMessage,
  newExtMethodId,
  verifyExtRecord,
  type ExtMethod,
  type ExtMethodRecord,
  type ExtNetworkId,
  type ExtSecurity,
  type ExtVerdict,
} from "@nodexchange/core";
import { stellar } from "../lib/config.ts";
import { t, useLang, type Key } from "../lib/i18n.ts";
import type { MyMethod } from "../lib/store.ts";
import type { Wallet } from "../lib/wallet.ts";
import { Button, ErrorText, Field, Input, Modal, errorMessage } from "./ui.tsx";

const CHAIN_RESERVE_XLM = 0.5;
const dataEntry = (account: string, key: string) => stellar.dataEntry(account, key);
const net = (rec: ExtMethodRecord) => EXT_NETWORKS[rec.method.network];

/** Verifies a record against its claimed owner (signature or on-chain hash). */
function useVerdict(rec: ExtMethodRecord, owner: string): ExtVerdict | null {
  const [verdict, setVerdict] = useState<ExtVerdict | null>(null);
  const key = JSON.stringify(rec);
  useEffect(() => {
    let live = true;
    setVerdict(null);
    verifyExtRecord(rec, owner, dataEntry)
      .then((v) => live && setVerdict(v))
      .catch(() => live && setVerdict("invalid"));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, owner]);
  return verdict;
}

const VERDICTS: Record<ExtVerdict, { key: Key; className: string; icon: React.ReactNode }> = {
  signed: { key: "extVerdictSigned", className: "text-emerald-300", icon: <BadgeCheck size={14} /> },
  chain: { key: "extVerdictChain", className: "text-cyan-300", icon: <Link2 size={14} /> },
  unsigned: { key: "extVerdictUnsigned", className: "text-amber-300", icon: <ShieldQuestion size={14} /> },
  invalid: { key: "extVerdictInvalid", className: "text-ruby-400", icon: <ShieldAlert size={14} /> },
};

function VerdictBadge({ verdict }: { verdict: ExtVerdict | null }) {
  if (!verdict) return <span className="text-xs text-ink-400">{t("extVerdictChecking")}</span>;
  const v = VERDICTS[verdict];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${v.className}`}>
      {v.icon}
      {t(v.key)}
    </span>
  );
}

function Qr({ text }: { text: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(text, { margin: 1, width: 220 }).then(setSrc).catch(() => setSrc(null));
  }, [text]);
  return src ? <img src={src} alt="QR" className="mx-auto rounded-lg bg-white p-1" width={180} height={180} /> : null;
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="ghost"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
      {done ? t("copied") : t("extCopyAddress")}
    </Button>
  );
}

/** A method as a payer sees it: who signed it, the address, copy and QR. */
export function MethodCard({ rec, owner }: { rec: ExtMethodRecord; owner: string }) {
  useLang();
  const verdict = useVerdict(rec, owner);
  const [qr, setQr] = useState(false);
  const n = net(rec);
  const unusable = verdict === "invalid";
  return (
    <div className={`space-y-2 rounded-xl border p-3 ${unusable ? "border-ruby-500/40 bg-ruby-950/30" : "border-white/10 bg-black/30"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-white">
          {rec.method.asset} · {n.tag}
          {rec.method.label && <span className="ml-1.5 font-normal text-ink-300">{rec.method.label}</span>}
        </span>
        <VerdictBadge verdict={verdict} />
      </div>
      {!unusable && (
        <>
          <code className="block break-all rounded-lg bg-black/40 p-2 font-mono text-xs text-cyan-100">{rec.method.address}</code>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={rec.method.address} />
            <Button variant="ghost" onClick={() => setQr(!qr)}>
              <QrCode size={14} />
              {qr ? t("extHideQr") : t("extShowQr")}
            </Button>
          </div>
          {qr && <Qr text={rec.method.address} />}
        </>
      )}
    </div>
  );
}

/** The small "risks and benefits" explainer. */
export function RiskInfo() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200">
        <Info size={14} />
        {t("extInfoButton")}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-xl border border-cyan-400/20 bg-black/40 p-3 text-xs">
          <p className="font-semibold text-white">{t("extInfoTitle")}</p>
          <p className="whitespace-pre-line text-ruby-200">{t("extInfoRisks")}</p>
          <p className="whitespace-pre-line text-emerald-200">{t("extInfoBenefits")}</p>
        </div>
      )}
    </div>
  );
}

function Warning({ tag }: { tag: string }) {
  return (
    <div className="flex gap-2 rounded-xl border border-amber-400/30 bg-amber-950/30 p-3 text-xs text-amber-100">
      <AlertTriangle size={16} className="shrink-0 text-amber-300" />
      <span>{t("extNoProtection", { tag })}</span>
    </div>
  );
}

/** Payer side: the peer's public methods plus the ones they shared in the chat. */
export function ExtPayDialog({
  peer,
  publicMethods,
  sharedMethods,
  onClose,
}: {
  peer: string;
  publicMethods: ExtMethodRecord[];
  sharedMethods: ExtMethodRecord[];
  onClose: () => void;
}) {
  useLang();
  const publicIds = new Set(publicMethods.map((r) => r.method.id));
  const shared = sharedMethods.filter((r) => !publicIds.has(r.method.id));
  return (
    <Modal title={t("extPayment")} onClose={onClose}>
      <Warning tag={EXT_NETWORKS.bep20.tag} />
      <RiskInfo />
      {publicMethods.length === 0 && shared.length === 0 && <p className="text-sm text-ink-300">{t("extPeerNone")}</p>}
      {publicMethods.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-ink-300">{t("extPeerPublic")}</p>
          {publicMethods.map((r) => (
            <MethodCard key={r.method.id} rec={r} owner={peer} />
          ))}
        </div>
      )}
      {shared.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-ink-300">{t("extPeerShared")}</p>
          {shared.map((r) => (
            <MethodCard key={r.method.id} rec={r} owner={peer} />
          ))}
        </div>
      )}
    </Modal>
  );
}

/** Picks one of our methods to send as an encrypted card in the chat. */
export function ShareMethodDialog({
  methods,
  onShare,
  onClose,
}: {
  methods: MyMethod[];
  onShare: (rec: ExtMethodRecord) => Promise<void>;
  onClose: () => void;
}) {
  useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function share(rec: ExtMethodRecord) {
    setBusy(true);
    setError(null);
    try {
      await onShare(rec);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Modal title={t("shareExtMethod")} onClose={onClose}>
      {methods.length === 0 && <p className="text-sm text-ink-300">{t("extShareNone")}</p>}
      {methods.map(({ rec }) => (
        <div key={rec.method.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/30 p-3">
          <MethodSummary rec={rec} />
          <Button disabled={busy} onClick={() => share(rec)}>
            {t("extShare")}
          </Button>
        </div>
      ))}
      <ErrorText error={error} />
    </Modal>
  );
}

const SECURITY_LABEL: Record<ExtSecurity, Key> = { none: "extSecNone", signed: "extSecSigned", chain: "extSecChain" };

function MethodSummary({ rec, isPublic }: { rec: ExtMethodRecord; isPublic?: boolean }) {
  return (
    <div className="min-w-0 text-sm">
      <div className="font-semibold text-white">
        {rec.method.asset} · {net(rec).tag}
        {rec.method.label && <span className="ml-1.5 font-normal text-ink-300">{rec.method.label}</span>}
      </div>
      <div className="truncate font-mono text-xs text-ink-400">{rec.method.address}</div>
      <div className="text-xs text-ink-400">
        {t(SECURITY_LABEL[rec.security])}
        {isPublic !== undefined && <> · {isPublic ? t("extPublicTag") : t("extPrivateTag")}</>}
      </div>
    </div>
  );
}

function Choice<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; title: string; body: string }[];
}) {
  return (
    <div className="space-y-1.5">
      {options.map((o) => (
        <label
          key={o.value}
          className={`flex cursor-pointer items-start gap-2 rounded-xl border p-2.5 text-sm transition ${
            value === o.value ? "border-cyan-400/60 bg-cyan-500/10" : "border-white/10 bg-black/20 hover:bg-white/5"
          }`}
        >
          <input type="radio" className="mt-1" checked={value === o.value} onChange={() => onChange(o.value)} />
          <span>
            <span className="font-medium text-white">{o.title}</span>
            <span className="block text-xs text-ink-400">{o.body}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

/** Owner side: list, add and delete our external payment methods. */
export function MyMethodsDialog({
  me,
  methods,
  getWallet,
  onSave,
  onClose,
}: {
  me: string;
  methods: MyMethod[];
  getWallet: () => Promise<Wallet>;
  onSave: (next: MyMethod[]) => Promise<void>;
  onClose: () => void;
}) {
  useLang();
  const [adding, setAdding] = useState(methods.length === 0);
  const [network] = useState<ExtNetworkId>("bep20");
  const n = EXT_NETWORKS[network];
  const [asset, setAsset] = useState<string>(n.assets[0]);
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [checked, setChecked] = useState(false);
  const [security, setSecurity] = useState<ExtSecurity>("signed");
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addr = address.trim();
  const addrOk = n.address.test(addr);
  const labelOk = [...label.trim()].length <= MAX_EXT_LABEL_CHARS;
  const valid = addrOk && labelOk && checked;

  async function add() {
    setError(null);
    try {
      if (isPublic && methods.filter((m) => m.public).length >= MAX_PUBLIC_EXT_METHODS) {
        throw new Error(t("extTooManyPublic", { max: MAX_PUBLIC_EXT_METHODS }));
      }
      const method: ExtMethod = {
        v: 1,
        id: newExtMethodId(),
        owner: me,
        network,
        asset,
        address: addr,
        ...(label.trim() ? { label: label.trim() } : {}),
        iat: Date.now(),
      };
      let rec: ExtMethodRecord = { method, security };
      if (security === "signed") {
        setBusy(t("extSigning"));
        rec = { ...rec, sig: await (await getWallet()).signMessage(extMethodMessage(method)) };
      } else if (security === "chain") {
        if (Number(await stellar.maxSendable(me, "XLM")) < CHAIN_RESERVE_XLM) throw new Error(t("extNeedReserve"));
        setBusy(t("extSigning"));
        const wallet = await getWallet();
        await stellar.anchorExtMethod(me, extDataKey(method.id), await extMethodHash(method), wallet.signTx);
      }
      setBusy(t("extSaving"));
      await onSave([...methods, { rec, public: isPublic }]);
      setAdding(false);
      setAddress("");
      setLabel("");
      setChecked(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove(target: MyMethod) {
    setError(null);
    setBusy(t("extRemoving"));
    try {
      if (target.rec.security === "chain") {
        const wallet = await getWallet();
        await stellar.anchorExtMethod(me, extDataKey(target.rec.method.id), null, wallet.signTx);
      }
      await onSave(methods.filter((m) => m.rec.method.id !== target.rec.method.id));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal title={t("extMethods")} onClose={onClose}>
      <RiskInfo />
      {methods.length === 0 && !adding && <p className="text-sm text-ink-300">{t("extNoMethods")}</p>}
      {methods.map((m) => (
        <div key={m.rec.method.id} className="space-y-1 rounded-xl border border-white/10 bg-black/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <MethodSummary rec={m.rec} isPublic={m.public} />
            <Button variant="ghost" disabled={!!busy} onClick={() => remove(m)} aria-label={t("extRemove")} title={t("extRemove")}>
              <Trash2 size={14} />
            </Button>
          </div>
          {m.rec.security === "chain" && <p className="text-[11px] text-ink-500">{t("extRemoveChainNote")}</p>}
        </div>
      ))}

      {adding ? (
        <div className="space-y-3 border-t border-white/10 pt-3">
          <Field label={t("extNetwork")} hint={t("extMoreNetworks")}>
            <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
              {n.label} ({n.tag})
            </div>
          </Field>
          <Field label={t("extAsset")}>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/30 p-1 text-sm">
              {n.assets.map((a) => (
                <button
                  key={a}
                  onClick={() => setAsset(a)}
                  className={`rounded-lg py-1.5 transition ${asset === a ? "nx-glass text-white" : "text-ink-400 hover:text-white"}`}
                >
                  {a}
                </button>
              ))}
            </div>
          </Field>
          <p className="rounded-xl border border-cyan-400/20 bg-black/30 p-2.5 text-xs text-cyan-100">{t("extRequired", { tag: n.tag })}</p>
          <Field label={t("extAddress")} hint={t("extAddressHint", { asset, network: n.label, tag: n.tag })}>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={n.example} spellCheck={false} autoComplete="off" />
          </Field>
          {addr && !addrOk && <p className="text-xs text-ruby-300">{t("extAddressInvalid", { tag: n.tag })}</p>}
          <Field label={t("extLabel")}>
            <Input value={label} maxLength={MAX_EXT_LABEL_CHARS} onChange={(e) => setLabel(e.target.value)} placeholder={t("extLabelPlaceholder")} />
          </Field>

          <div className="space-y-1">
            <p className="text-xs font-medium text-ink-300">{t("extSecurity")}</p>
            <Choice
              value={security}
              onChange={setSecurity}
              options={[
                { value: "none", title: t("extSecNone"), body: t("extSecNoneBody") },
                { value: "signed", title: t("extSecSigned"), body: t("extSecSignedBody") },
                { value: "chain", title: t("extSecChain"), body: t("extSecChainBody") },
              ]}
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-ink-300">{t("extVisibility")}</p>
            <Choice
              value={isPublic ? "public" : "private"}
              onChange={(v) => setIsPublic(v === "public")}
              options={[
                { value: "public", title: t("extPublic"), body: t("extPublicBody") },
                { value: "private", title: t("extPrivate"), body: t("extPrivateBody") },
              ]}
            />
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span className="text-ink-100">{t("extVerifyCheck", { tag: n.tag })}</span>
          </label>

          <div className="flex gap-2">
            {methods.length > 0 && (
              <Button variant="ghost" className="flex-1" onClick={() => setAdding(false)} disabled={!!busy}>
                {t("cancel")}
              </Button>
            )}
            <Button className="flex-1" onClick={add} disabled={!valid || !!busy}>
              {busy ?? t("save")}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" className="w-full" onClick={() => setAdding(true)} disabled={!!busy}>
          {busy ?? t("extAdd")}
        </Button>
      )}
      <ErrorText error={error} />
    </Modal>
  );
}
