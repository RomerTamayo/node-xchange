import { useEffect, useState } from "react";
import {
  dealStatus,
  feeOf,
  fromStroops,
  type AssetCode,
  type NodeInfo,
  type Payload,
} from "@nodexchange/core";
import { stellar } from "../lib/config.ts";
import { downloadReceipt, printReceipt } from "../lib/receipt.ts";
import { short, type Wallet } from "../lib/wallet.ts";
import { Button, ErrorText, Field, Input, Modal, errorMessage } from "./ui.tsx";

const AMOUNT_RE = /^\d+(\.\d{1,7})?$/;

function AssetPicker({ value, onChange }: { value: AssetCode; onChange: (a: AssetCode) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-950 p-1 text-sm">
      {(["XLM", "USDC"] as const).map((a) => (
        <button
          key={a}
          onClick={() => onChange(a)}
          className={`rounded-md py-1.5 ${value === a ? "bg-slate-800 text-white" : "text-slate-400"}`}
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
  const [asset, setAsset] = useState<AssetCode>("XLM");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const feeBps = node?.transferFeeBps ?? 0;
  const valid = AMOUNT_RE.test(amount) && Number(amount) > 0 && memo.length <= 28;
  const fee = valid && feeBps ? feeOf(amount, feeBps) : "0";

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (!(await stellar.canReceive(peer, asset))) {
        throw new Error(
          asset === "USDC"
            ? "Este usuario todavía no activó USDC. Pídele que lo active, o envía XLM."
            : "La cuenta de destino no existe todavía.",
        );
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
    <Modal title={`Enviar a ${short(peer)}`} onClose={onClose}>
      <AssetPicker value={asset} onChange={setAsset} />
      <Field label="Monto">
        <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
      </Field>
      <Field label="Memo (opcional)" hint="Obligatorio si envías a un exchange como Binance o Bybit.">
        <Input value={memo} maxLength={28} onChange={(e) => setMemo(e.target.value)} />
      </Field>
      {valid && (
        <div className="rounded-lg bg-slate-950 p-3 text-sm text-slate-300">
          Recibe <b>{amount} {asset}</b>
          {fee !== "0" && (
            <>
              {" "}· comisión del nodo {fee} {asset} ({feeBps / 100}%)
            </>
          )}
        </div>
      )}
      <ErrorText error={error} />
      <Button onClick={submit} disabled={!valid || busy} className="w-full">
        {busy ? "Firmando y enviando…" : "Enviar pago"}
      </Button>
    </Modal>
  );
}

export function DealDialog({ me, peer, node, getWallet, onDone, onClose }: DialogProps) {
  const [asset, setAsset] = useState<AssetCode>("XLM");
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState("7");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = AMOUNT_RE.test(amount) && Number(amount) > 0 && Number(days) >= 1 && Number(days) <= 90;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (!node?.operator) throw new Error("Este nodo no tiene árbitro configurado.");
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
    <Modal title="Pago protegido (escrow)" onClose={onClose}>
      <p className="text-sm text-slate-400">
        El dinero queda retenido en un contrato Soroban. {short(peer)} cobra cuando confirmes que recibiste el
        producto. Si no cumple, te lo devuelve o lo recuperas al vencer el plazo. La comisión solo se cobra si
        el vendedor recibe el pago.
      </p>
      <AssetPicker value={asset} onChange={setAsset} />
      <Field label="Monto">
        <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
      </Field>
      <Field label="Plazo (días)" hint="Después de este plazo puedes recuperar tu dinero si nadie liberó el pago.">
        <Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
      </Field>
      <ErrorText error={error} />
      <Button onClick={submit} disabled={!valid || busy} className="w-full">
        {busy ? "Firmando y bloqueando fondos…" : "Bloquear fondos"}
      </Button>
    </Modal>
  );
}

export function ReceiptLinks({ hash }: { hash: string }) {
  const [error, setError] = useState<string | null>(null);
  const wrap = (fn: () => Promise<void>) => () => fn().catch((e) => setError(errorMessage(e)));
  return (
    <div className="mt-2 flex flex-wrap gap-2 text-xs">
      <a className="text-emerald-400 hover:underline" href={stellar.txUrl(hash)} target="_blank" rel="noreferrer">
        Ver en la red
      </a>
      <button className="text-emerald-400 hover:underline" onClick={wrap(() => printReceipt(hash))}>
        Imprimir / PDF
      </button>
      <button className="text-emerald-400 hover:underline" onClick={wrap(() => downloadReceipt(hash))}>
        JSON
      </button>
      {error && <span className="text-rose-400">{error}</span>}
    </div>
  );
}

const STATUS_LABEL = { Funded: "Fondos retenidos", Released: "Pagado al vendedor", Refunded: "Devuelto al comprador" };

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
  const [deal, setDeal] = useState<Awaited<ReturnType<typeof stellar.getDeal>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    stellar
      .getDeal(payload.dealId, me)
      .then(setDeal)
      .catch((e) => setError(errorMessage(e)));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload.dealId, refreshKey]);

  const status = deal ? dealStatus(deal) : null;
  const iAmBuyer = deal?.buyer === me;
  const iAmSeller = deal?.seller === me;
  const expired = deal ? Date.now() / 1000 >= Number(deal.deadline) : false;

  async function act(action: "release" | "cancel" | "reclaim") {
    setBusy(true);
    setError(null);
    try {
      const wallet = await getWallet();
      const hash = await stellar.settleDeal(action, payload.dealId, me, wallet.signTx);
      await onUpdate({ ...payload, status: action === "release" ? "released" : "refunded", hash });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-amber-300">Pago protegido #{payload.dealId}</div>
      <div className="text-lg font-semibold">
        {deal ? fromStroops(deal.amount) : payload.amount} {payload.asset}
      </div>
      <div className="text-sm text-slate-300">
        {status ? STATUS_LABEL[status] : "Consultando contrato…"}
        {deal && status === "Funded" && (
          <span className="text-slate-500"> · vence {new Date(Number(deal.deadline) * 1000).toLocaleDateString()}</span>
        )}
      </div>
      {status === "Funded" && (
        <div className="flex flex-wrap gap-2">
          {iAmBuyer && (
            <Button disabled={busy} onClick={() => act("release")}>
              Recibí el producto: liberar pago
            </Button>
          )}
          {iAmBuyer && expired && (
            <Button variant="ghost" disabled={busy} onClick={() => act("reclaim")}>
              Recuperar fondos
            </Button>
          )}
          {iAmSeller && (
            <Button variant="ghost" disabled={busy} onClick={() => act("cancel")}>
              Cancelar y devolver
            </Button>
          )}
        </div>
      )}
      <ErrorText error={error} />
      <ReceiptLinks hash={payload.hash} />
    </div>
  );
}
