import { useState } from "react";
import { Messenger } from "./components/Messenger.tsx";
import { Onboarding, Shell } from "./components/Onboarding.tsx";
import { Button, ErrorText, Field, Input } from "./components/ui.tsx";
import { clearAll, loadAccount, type Account } from "./lib/store.ts";
import { decryptSecret, localWallet, short, type Wallet } from "./lib/wallet.ts";

type Phase =
  | { k: "onboarding" }
  | { k: "locked"; account: Account }
  | { k: "ready"; account: Account; wallet: Wallet | null };

function initialPhase(): Phase {
  const account = loadAccount();
  if (!account) return { k: "onboarding" };
  // External wallets reconnect only when a payment needs signing.
  if (account.wallet.kind === "external") return { k: "ready", account, wallet: null };
  return { k: "locked", account };
}

export function App() {
  const [phase, setPhase] = useState<Phase>(initialPhase);

  if (phase.k === "onboarding") {
    return <Onboarding onReady={(account, wallet) => setPhase({ k: "ready", account, wallet })} />;
  }
  if (phase.k === "locked") {
    return (
      <Unlock
        account={phase.account}
        onUnlock={(wallet) => setPhase({ k: "ready", account: phase.account, wallet })}
        onReset={() => {
          clearAll();
          setPhase({ k: "onboarding" });
        }}
      />
    );
  }
  return (
    <Messenger
      key={phase.account.session.address}
      account={phase.account}
      wallet={phase.wallet}
      onLogout={() => setPhase({ k: "onboarding" })}
    />
  );
}

function Unlock({
  account,
  onUnlock,
  onReset,
}: {
  account: Account;
  onUnlock: (w: Wallet) => void;
  onReset: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  async function unlock() {
    if (account.wallet.kind !== "local") return;
    setBusy(true);
    const secret = await decryptSecret(account.wallet.secret, password);
    setBusy(false);
    if (secret) onUnlock(localWallet(secret));
    else setError("Contraseña incorrecta.");
  }

  return (
    <Shell>
      <p className="text-sm text-ink-400">
        Desbloquea la billetera <span className="font-mono text-ink-200">{short(account.session.address)}</span>
      </p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void unlock();
        }}
      >
        <Field label="Contraseña">
          <Input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" disabled={busy || !password} className="w-full">
          {busy ? "Descifrando…" : "Desbloquear"}
        </Button>
      </form>
      <ErrorText error={error} />
      {confirmReset ? (
        <Button variant="danger" className="w-full" onClick={onReset}>
          Borrar esta billetera de este navegador (necesitarás tu clave secreta)
        </Button>
      ) : (
        <button className="text-xs text-ink-500 hover:text-ink-300" onClick={() => setConfirmReset(true)}>
          ¿Olvidaste la contraseña?
        </button>
      )}
    </Shell>
  );
}
