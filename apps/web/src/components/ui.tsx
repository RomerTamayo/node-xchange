import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { ChevronDown, X } from "lucide-react";
import { setLang, t, useLang } from "../lib/i18n.ts";

type Variant = "primary" | "ghost" | "danger" | "plain";

const variants: Record<Variant, string> = {
  primary:
    "nx-gloss bg-gradient-to-b from-emerald-300 to-emerald-500 text-ink-950 hover:from-emerald-200 hover:to-emerald-400 [--gloss-glow:rgb(16_185_129/0.55)]",
  ghost: "nx-glass text-ink-100 hover:bg-white/10",
  danger:
    "nx-gloss bg-gradient-to-b from-ruby-500 to-ruby-700 text-white hover:from-ruby-400 hover:to-ruby-600 [--gloss-glow:rgb(224_17_95/0.55)]",
  plain: "text-ink-300 hover:bg-white/5 hover:text-white",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition disabled:opacity-40 ${variants[variant]} ${className}`}
    />
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-base text-white outline-none placeholder:text-ink-500 focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/20 sm:text-sm ${className}`}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-ink-300">{label}</span>
      {children}
      {hint && <span className="block text-xs text-ink-500">{hint}</span>}
    </label>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    // Bottom sheet on phones, centred card from `sm` up.
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="nx-glass max-h-[92dvh] w-full min-w-0 max-w-md space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain rounded-t-2xl rounded-b-none bg-ink-950/90 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-2xl sm:bg-ink-950/70 sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="min-w-0 font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-400 hover:bg-white/10 hover:text-white" aria-label={t("close")}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? <p className="text-sm text-ruby-400">{error}</p> : null;
}

export function errorMessage(e: unknown): string {
  // Wallet libraries sometimes reject with plain objects ({ code, message }).
  const msg =
    e instanceof Error
      ? e.message
      : typeof (e as { message?: unknown })?.message === "string"
        ? (e as { message: string }).message
        : String(e);
  if (/closed the modal/i.test(msg)) return t("errPickerClosed");
  if (/reject|denied|cancel/i.test(msg)) return t("errCancelled");
  if (/op_underfunded|underfunded/i.test(msg)) return t("errUnderfunded");
  if (/op_no_trust|trustline/i.test(msg)) return t("errNoTrust");
  if (/op_no_destination/i.test(msg)) return t("errNoDestination");
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
      <div className="text-sm text-ink-200">{message}</div>
      <ErrorText error={error} />
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>
          {t("cancel")}
        </Button>
        <Button variant={danger ? "danger" : "primary"} className="flex-1" onClick={confirm} disabled={busy}>
          {busy ? t("busy") : confirmLabel}
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
      {alias && <span className="truncate font-medium text-white">{alias}</span>}
      <span className={`shrink-0 font-mono ${alias ? "text-xs text-ink-400" : "text-sm"}`}>{short}</span>
    </span>
  );
}

// --- dropdown menu ------------------------------------------------------------

export interface MenuItem {
  label: string;
  hint?: string;
  icon?: ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

/** A button that opens a small glass menu below it. */
export function Menu({
  label,
  trigger,
  items,
  align = "right",
  header,
  triggerClassName = "",
  variant = "ghost",
  chevron = true,
}: {
  /** Accessible name of the trigger. */
  label: string;
  trigger: ReactNode;
  items: MenuItem[];
  align?: "left" | "right";
  header?: ReactNode;
  triggerClassName?: string;
  variant?: Variant;
  chevron?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button
        variant={variant}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        className={triggerClassName}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
        {chevron && <ChevronDown size={14} className={`transition ${open ? "rotate-180" : ""}`} />}
      </Button>
      {open && (
        <div
          role="menu"
          className={`nx-glass absolute z-40 mt-2 w-64 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl bg-ink-950/85 p-1.5 ${align === "right" ? "right-0" : "left-0"}`}
        >
          {header && <div className="border-b border-white/10 px-3 py-2">{header}</div>}
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/10 ${
                item.danger ? "text-ruby-300" : "text-ink-100"
              }`}
            >
              {item.icon && <span className="mt-0.5 shrink-0 opacity-90">{item.icon}</span>}
              <span>
                {item.label}
                {item.hint && <span className="block text-xs text-ink-400">{item.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function LangToggle() {
  const lang = useLang();
  return (
    <div className="nx-glass flex rounded-xl p-0.5 text-xs font-semibold" role="group" aria-label={t("language")}>
      {(["es", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`rounded-lg px-2 py-1.5 uppercase transition ${
            lang === l ? "bg-gradient-to-b from-violet-400 to-violet-600 text-white" : "text-ink-400 hover:text-white"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`font-bold tracking-tight text-white ${className}`}>
      Node
      <span className="bg-gradient-to-br from-violet-400 via-cyan-300 to-emerald-300 bg-clip-text text-transparent">X</span>
      change
    </span>
  );
}
