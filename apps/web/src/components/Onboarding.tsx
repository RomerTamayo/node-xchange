import { useState } from "react";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { Session } from "@nodexchange/core";
import { NODE_URL, stellar } from "../lib/config.ts";
import { saveAccount, type Account } from "../lib/store.ts";
import { connectExternal, encryptSecret, localWallet, type Wallet } from "../lib/wallet.ts";
import { Button, ErrorText, Field, Input, errorMessage } from "./ui.tsx";

type Tab = "create" | "import" | "external";

/** Funds the account on testnet if needed and registers this device on the node. */
async function signUp(wallet: Wallet, walletRecord: Account["wallet"], onStep: (s: string) => void) {
  if (!(await stellar.account(wallet.address))) {
    onStep("Activando tu cuenta en testnet…");
    await stellar.fund(wallet.address);
  }
  onStep("Autorizando este dispositivo para chatear…");
  const session = await Session.create(wallet.address, NODE_URL, wallet.signMessage, stellar);
  onStep("Registrándote en el nodo…");
  await session.register();
  const account: Account = { session: session.state, wallet: walletRecord };
  saveAccount(account);
  return account;
}

export function Onboarding({ onReady }: { onReady: (a: Account, w: Wallet) => void }) {
  const [tab, setTab] = useState<Tab>("create");
  const [secret, setSecret] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backup, setBackup] = useState<{ account: Account; wallet: Wallet; secret: string } | null>(null);
  const [saved, setSaved] = useState(false);

  const busy = step !== null;
  const passwordOk = password.length >= 8 && password === confirm;

  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setStep(null);
    }
  }

  const createOrImport = () =>
    run(async () => {
      const kpSecret = tab === "create" ? Keypair.random().secret() : secret.trim();
      if (!StrKey.isValidEd25519SecretSeed(kpSecret)) throw new Error("Clave secreta inválida (empieza con S).");
      setStep("Cifrando tu clave…");
      const wallet = localWallet(kpSecret);
      const enc = await encryptSecret(kpSecret, password);
      const account = await signUp(wallet, { kind: "local", secret: enc }, setStep);
      if (tab === "create") setBackup({ account, wallet, secret: kpSecret });
      else onReady(account, wallet);
    });

  const connect = () =>
    run(async () => {
      setStep("Elige tu billetera…");
      const wallet = await connectExternal();
      const account = await signUp(wallet, { kind: "external" }, setStep);
      onReady(account, wallet);
    });

  if (backup) {
    return (
      <Shell>
        <h2 className="text-lg font-semibold">Guarda tu clave secreta</h2>
        <p className="text-sm text-slate-400">
          Es la única forma de recuperar tu dinero si borras los datos de este navegador o cambias de
          dispositivo. Nadie más la tiene, ni siquiera el nodo.
        </p>
        <code className="block break-all rounded-lg bg-slate-950 p-3 text-sm text-amber-300">{backup.secret}</code>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          La guardé en un lugar seguro
        </label>
        <Button disabled={!saved} onClick={() => onReady(backup.account, backup.wallet)} className="w-full">
          Entrar a NodeXchange
        </Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-950 p-1 text-sm">
        {(
          [
            ["create", "Crear billetera"],
            ["import", "Importar"],
            ["external", "Freighter y otras"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-md py-1.5 ${tab === id ? "bg-slate-800 text-white" : "text-slate-400"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "external" ? (
        <>
          <p className="text-sm text-slate-400">
            Conecta Freighter, xBull, Lobstr, Albedo u otra billetera. Firmarás <b>una vez</b> para autorizar
            este dispositivo a chatear, y cada pago lo apruebas en tu billetera.
          </p>
          <Button onClick={connect} disabled={busy} className="w-full">
            Conectar billetera
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-400">
            {tab === "create"
              ? "Creamos una billetera Stellar en este navegador. ¿Vienes de Binance o Bybit? Crea una aquí y retira XLM hacia ella."
              : "Usa una cuenta Stellar que ya tienes."}
          </p>
          {tab === "import" && (
            <Field label="Clave secreta">
              <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="S…" />
            </Field>
          )}
          <Field label="Contraseña de este dispositivo" hint="Mínimo 8 caracteres. Cifra tu clave en este navegador.">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Repite la contraseña">
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Button onClick={createOrImport} disabled={busy || !passwordOk} className="w-full">
            {tab === "create" ? "Crear billetera" : "Importar"}
          </Button>
        </>
      )}

      {step && <p className="text-sm text-emerald-400">{step}</p>}
      <ErrorText error={error} />
    </Shell>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div>
          <h1 className="text-2xl font-bold">
            Node<span className="text-emerald-400">X</span>change
          </h1>
          <p className="text-sm text-slate-400">Chat y pagos entre billeteras Stellar · testnet</p>
        </div>
        {children}
      </div>
    </div>
  );
}
