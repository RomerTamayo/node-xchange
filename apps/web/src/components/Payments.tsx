import { useEffect, useState } from "react";
import {
  MAX_DEAL_DAYS,
  MAX_TRANSFER_FEE_BPS,
  dealStatus,
  feeOf,
  fromStroops,
  type AssetCode,
  type Deal,
  type NodeInfo,
  type Payload,
} from "@nodexchange/core";
import { stellar } from "../lib/config.ts";
import { downloadReceipt, printReceipt } from "../lib/receipt.ts";
import { short, type Wallet } from "../lib/wallet.ts";
import { Button, ErrorText, Field, Input, Modal, PeerName, errorMessage } from "./ui.tsx";

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
  // Never trust the node's fee blindly: above the cap we refuse to pay.
  const feeTooHigh = feeBps > MAX_TRANSFER_FEE_BPS;
  const valid = AMOUNT_RE.test(amount) && Number(amount) > 0 && memo.length <= 28 && !feeTooHigh;
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
      {feeTooHigh && (
        <p className="text-sm text-rose-400">
          Este nodo pide {feeBps / 100}% de comisión, más del máximo permitido ({MAX_TRANSFER_FEE_BPS / 100}%). Por
          seguridad no se puede pagar a través de él.
        </p>
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

  const valid =
    AMOUNT_RE.test(amount) && Number(amount) > 0 && /^\d+$/.test(days) && Number(days) >= 1 && Number(days) <= MAX_DEAL_DAYS;

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
      <Field
        label={`Plazo (días, máximo ${MAX_DEAL_DAYS})`}
        hint="Después de este plazo puedes recuperar tu dinero si nadie liberó el pago."
      >
        <Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
      </Field>
      <div className="rounded-lg bg-slate-950 p-3 text-xs text-slate-400">
        <span className="text-slate-300">Árbitro en caso de disputa:</span>{" "}
        {node?.operator ? (
          <>
            <PeerName address={node.operator} alias={null} /> (operador de «{node.name}»). Puede decidir a
            favor de cualquiera de los dos si no se ponen de acuerdo.
          </>
        ) : (
          "este nodo no tiene árbitro configurado."
        )}
      </div>
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

export function assetOfToken(token: string): string {
  if (token === stellar.net.xlmSac) return "XLM";
  if (token === stellar.net.usdc.sac) return "USDC";
  return "token";
}

type SettleAction = "release" | "cancel" | "reclaim";

/**
 * Live view of a deal read from the contract, with the actions the viewer may
 * take. Used in chat cards and in the "Mis pagos protegidos" panel.
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
  const [deal, setDeal] = useState<Deal | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

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
      setNote(
        action === "release"
          ? "Pago liberado. No se pudo avisar al vendedor por chat, pero lo verá en sus pagos protegidos."
          : "Fondos devueltos. No se pudo avisar por chat, pero se verá en los pagos protegidos.",
      );
    }
    await load();
    setBusy(false);
  }

  const counterpart = deal ? (iAmBuyer ? deal.seller : deal.buyer) : null;

  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-amber-300">
        Pago protegido #{dealId}
        {deal && <span className="text-slate-500"> · {iAmBuyer ? "compras" : iAmSeller ? "vendes" : "árbitro"}</span>}
      </div>
      {showParties && counterpart && (
        <div className="text-sm">
          {iAmBuyer ? "Vendedor: " : "Comprador: "}
          <PeerName address={counterpart} alias={aliasOf?.(counterpart) ?? null} />
        </div>
      )}
      <div className="text-lg font-semibold">
        {deal ? `${fromStroops(deal.amount)} ${assetOfToken(deal.token)}` : "…"}
      </div>
      <div className="text-sm text-slate-300">
        {status ? STATUS_LABEL[status] : error ? "" : "Consultando contrato…"}
        {deal && status === "Funded" && (
          <span className="text-slate-500"> · vence {new Date(Number(deal.deadline) * 1000).toLocaleDateString()}</span>
        )}
      </div>
      {deal && (
        <div className="text-xs text-slate-500">
          Árbitro: <PeerName address={deal.arbiter} alias={null} />
        </div>
      )}
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
      {note && <p className="text-xs text-amber-300">{note}</p>}
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
  if (payload.contract !== stellar.net.escrow) {
    return (
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-wide text-amber-300">Pago protegido #{payload.dealId}</div>
        <p className="text-sm text-slate-400">
          {payload.amount} {payload.asset} en una versión anterior del contrato.
        </p>
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
  const [deals, setDeals] = useState<{ id: string; deal: Deal }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    stellar
      .dealsOf(me)
      .then(setDeals)
      .catch((e) => setError(errorMessage(e)));
  }, [me]);

  return (
    <Modal title="Mis pagos protegidos" onClose={onClose}>
      <p className="text-xs text-slate-400">
        Leídos directamente del contrato en la red: aparecen aunque se hayan borrado los mensajes, hayas cambiado
        de dispositivo o bloqueado a alguien.
      </p>
      {!deals && !error && <p className="text-sm text-slate-400">Consultando contrato…</p>}
      {deals?.length === 0 && <p className="text-sm text-slate-400">Aún no tienes pagos protegidos.</p>}
      <div className="space-y-3">
        {deals?.map(({ id, deal }) => (
          <div key={id} className="rounded-xl border border-slate-800 p-3">
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
