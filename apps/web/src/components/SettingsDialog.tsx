import { useState } from "react";
import type { Account, Settings } from "../lib/store.ts";
import { decryptSecret } from "../lib/wallet.ts";
import { Button, ErrorText, Field, Input, Modal } from "./ui.tsx";

export function SettingsDialog({
  account,
  settings,
  onSettings,
  onClearHistory,
  onPublishNode,
  onLogout,
  onClose,
}: {
  account: Account;
  settings: Settings;
  onSettings: (s: Settings) => void;
  onClearHistory: () => void;
  onPublishNode: () => Promise<string>;
  onLogout: () => void;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const local = account.wallet.kind === "local" ? account.wallet : null;

  async function reveal() {
    if (!local) return;
    const s = await decryptSecret(local.secret, password);
    if (s) {
      setSecret(s);
      setError(null);
    } else setError("Contraseña incorrecta.");
  }

  async function publish() {
    setError(null);
    try {
      await onPublishNode();
      setNote("Tu nodo quedó publicado en tu cuenta Stellar. Cualquiera puede encontrarte con tu dirección.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Modal title="Ajustes" onClose={onClose}>
      <section className="space-y-2">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={settings.volatile}
            onChange={(e) => onSettings({ ...settings, volatile: e.target.checked })}
          />
          <span>
            <b>Mensajes volátiles en este dispositivo</b>
            <span className="block text-slate-400">
              Las copias locales se borran 48 horas después de verlas. Desactívalo para conservarlas hasta que
              las borres tú.
            </span>
          </span>
        </label>
        <Button variant="ghost" className="w-full" onClick={() => { onClearHistory(); setNote("Historial local borrado."); }}>
          Borrar todo el historial local
        </Button>
      </section>

      <section className="space-y-2 border-t border-slate-800 pt-4">
        <p className="text-sm text-slate-400">
          Nodo: <span className="break-all text-slate-300">{account.session.homeNode}</span>
        </p>
        <Button variant="ghost" className="w-full" onClick={publish}>
          Publicar mi nodo en mi cuenta Stellar
        </Button>
      </section>

      {local && (
        <section className="space-y-2 border-t border-slate-800 pt-4">
          {secret ? (
            <code className="block break-all rounded-lg bg-slate-950 p-3 text-sm text-amber-300">{secret}</code>
          ) : (
            <>
              <Field label="Ver mi clave secreta">
                <Input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <Button variant="ghost" className="w-full" onClick={reveal}>
                Mostrar clave
              </Button>
            </>
          )}
        </section>
      )}

      <section className="space-y-2 border-t border-slate-800 pt-4">
        {confirmLogout ? (
          <>
            <p className="text-sm text-rose-300">
              Se borrarán tus mensajes, tus llaves de chat
              {local && " y tu billetera"} de este navegador.
              {local && " Si no guardaste tu clave secreta, perderás tus fondos."}
            </p>
            <Button variant="danger" className="w-full" onClick={onLogout}>
              Sí, borrar todo de este dispositivo
            </Button>
          </>
        ) : (
          <Button variant="danger" className="w-full" onClick={() => setConfirmLogout(true)}>
            Cerrar sesión y borrar datos locales
          </Button>
        )}
      </section>

      {note && <p className="text-sm text-emerald-400">{note}</p>}
      <ErrorText error={error} />
    </Modal>
  );
}
