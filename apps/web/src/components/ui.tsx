import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-mint-400 text-ink-950 hover:bg-mint-300",
  ghost: "bg-ink-800 text-ink-100 hover:bg-ink-700",
  danger: "bg-pink-400 text-ink-950 hover:bg-pink-300",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-40 ${variants[variant]} ${className}`}
    />
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-base outline-none focus:border-lilac-400 sm:text-sm ${className}`}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-ink-400">{label}</span>
      {children}
      {hint && <span className="block text-xs text-ink-500">{hint}</span>}
    </label>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl border border-ink-800 bg-ink-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-300" aria-label="Cerrar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? <p className="text-sm text-pink-400">{error}</p> : null;
}

export function errorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/reject|denied|cancel/i.test(msg)) return "Cancelaste la firma en tu billetera.";
  if (/op_underfunded|underfunded/i.test(msg)) return "Saldo insuficiente.";
  if (/op_no_trust|trustline/i.test(msg)) return "El destinatario no tiene activado ese activo.";
  if (/op_no_destination/i.test(msg)) return "La cuenta de destino no existe todavía.";
  return msg;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="text-sm text-ink-300">{message}</div>
      <ErrorText error={error} />
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button variant={danger ? "danger" : "primary"} className="flex-1" onClick={confirm} disabled={busy}>
          {busy ? "Un momento…" : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/** Alias (if any) always next to the short address: aliases aren't unique. */
export function PeerName({ address, alias, className = "" }: { address: string; alias: string | null; className?: string }) {
  const short = `${address.slice(0, 4)}…${address.slice(-4)}`;
  return (
    <span className={`inline-flex min-w-0 items-baseline gap-1.5 ${className}`}>
      {alias && <span className="truncate font-medium">{alias}</span>}
      <span className={`shrink-0 font-mono ${alias ? "text-xs text-ink-500" : "text-sm"}`}>{short}</span>
    </span>
  );
}
