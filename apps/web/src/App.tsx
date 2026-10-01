import { useState } from "react";
import { Messenger } from "./components/Messenger.tsx";
import { Onboarding, Shell } from "./components/Onboarding.tsx";
import { Button, ErrorText, Field, Input, errorMessage } from "./components/ui.tsx";
import { t, useLang } from "./lib/i18n.ts";
import { clearAll, loadAccount, saveAccount, type Account } from "./lib/store.ts";
import { unlockVault, type Unlocked } from "./lib/vault.ts";
import { PBKDF2_ROUNDS, connectExternal, decryptSecret, encryptSecret, localWallet, short, type Wallet } from "./lib/wallet.ts";

type Phase =
  | { k: "onboarding" }
  | { k: "locked"; account: Account }
  | { k: "ready"; account: Account; unlocked: Unlocked; wallet: Wallet | null };

// Keys and history are encrypted at rest, so every visit starts locked.
function initialPhase(): Phase {
  const account = loadAccount();
  return account ? { k: "locked", account } : { k: "onboarding" };
}

export function App() {
  useLang();
  const [phase, setPhase] = useState<Phase>(initialPhase);

  if (phase.k === "onboarding") {
    return <Onboarding onReady={(account, wallet, unlocked) => setPhase({ k: "ready", account, wallet, unlocked })} />;
  }
  if (phase.k === "locked") {
    return (
      <Unlock
        account={phase.account}
        onUnlock={(account, wallet, unlocked) => setPhase({ k: "ready", account, wallet, unlocked })}
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
      unlocked={phase.unlocked}
      wallet={phase.wallet}
      onLogout={() => setPhase({ k: "onboarding" })}
      // Dropping `unlocked` from state forgets the decrypted keys.
      onLock={() => setPhase({ k: "locked", account: phase.account })}
    />
  );
}

function Unlock({
  account,
  onUnlock,
  onReset,
}: {
  account: Account;
  onUnlock: (account: Account, wallet: Wallet, unlocked: Unlocked) => void;
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
      let current = account;
      let wallet: Wallet;
      if (current.wallet.kind === "local") {
        const secret = await decryptSecret(current.wallet.secret, password);
        if (!secret) {
          setError(t("wrongPassword"));
          return;
        }
        wallet = localWallet(secret);
        // Re-encrypt secrets saved with the old, weaker key derivation.
        if ((current.wallet.secret.iter ?? 0) < PBKDF2_ROUNDS) {
          current = { ...current, wallet: { kind: "local", secret: await encryptSecret(secret, password) } };
          saveAccount(current);
        }
      } else {
        // Proves the person at the keyboard controls the account's wallet.
        wallet = await connectExternal(current.session.address);
      }

      const opened = await unlockVault(current, wallet);
      if (!opened) {
        setError(t("vaultError"));
        return;
      }
      if (opened.migrated) {
        // Legacy plaintext keys are replaced by the sealed record.
        current = opened.migrated;
        saveAccount(current);
      }
      onUnlock(current, wallet, opened.unlocked);
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
