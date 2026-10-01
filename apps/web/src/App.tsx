import { useState } from "react";
import { Messenger } from "./components/Messenger.tsx";
import { Onboarding, Shell } from "./components/Onboarding.tsx";
import { Button, ErrorText, Field, Input, errorMessage } from "./components/ui.tsx";
import { t, useLang } from "./lib/i18n.ts";
import { clearAll, isLocked, loadAccount, setLocked, type Account } from "./lib/store.ts";
import { connectExternal, decryptSecret, localWallet, short, type Wallet } from "./lib/wallet.ts";

type Phase =
  | { k: "onboarding" }
  | { k: "locked"; account: Account }
  | { k: "ready"; account: Account; wallet: Wallet | null };

function initialPhase(): Phase {
  const account = loadAccount();
  if (!account) return { k: "onboarding" };
  // A built-in wallet always starts locked (its secret is only kept in memory).
  // External wallets reconnect only when a payment needs signing, unless the
  // user locked the session.
  if (account.wallet.kind === "external" && !isLocked()) return { k: "ready", account, wallet: null };
  return { k: "locked", account };
}

export function App() {
  useLang();
  const [phase, setPhase] = useState<Phase>(initialPhase);

  if (phase.k === "onboarding") {
    return <Onboarding onReady={(account, wallet) => setPhase({ k: "ready", account, wallet })} />;
  }
  if (phase.k === "locked") {
    return (
      <Unlock
        account={phase.account}
        onUnlock={(wallet) => {
          setLocked(false);
          setPhase({ k: "ready", account: phase.account, wallet });
        }}
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
      onLock={() => {
        setLocked(true);
        setPhase({ k: "locked", account: phase.account });
      }}
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
  const external = account.wallet.kind === "external";

  async function unlock() {
    setBusy(true);
    setError(null);
    try {
      if (account.wallet.kind === "local") {
        const secret = await decryptSecret(account.wallet.secret, password);
        if (secret) onUnlock(localWallet(secret));
        else setError(t("wrongPassword"));
      } else {
        // Proves the person at the keyboard controls the account's wallet.
        onUnlock(await connectExternal(account.session.address));
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <p className="text-sm text-ink-300">
        {external ? t("unlockExternal") : t("unlockPrompt")}{" "}
        <span className="font-mono text-white">{short(account.session.address)}</span>
      </p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void unlock();
        }}
      >
        {!external && (
          <Field label={t("password")}>
            <Input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        )}
        <Button type="submit" disabled={busy || (!external && !password)} className="w-full">
          {busy ? t("decrypting") : external ? t("connectWallet") : t("unlock")}
        </Button>
      </form>
      <ErrorText error={error} />
      {!external &&
        (confirmReset ? (
          <Button variant="danger" className="w-full" onClick={onReset}>
            {t("resetWallet")}
          </Button>
        ) : (
          <button className="text-xs text-ink-500 hover:text-ink-300" onClick={() => setConfirmReset(true)}>
            {t("forgotPassword")}
          </button>
        ))}
    </Shell>
  );
}
