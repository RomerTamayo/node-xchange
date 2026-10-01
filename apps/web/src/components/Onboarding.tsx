import { useState, type ReactNode } from "react";
import { KeyRound, PlusCircle, Wallet as WalletIcon } from "lucide-react";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { Session } from "@nodexchange/core";
import { NODE_URL, stellar } from "../lib/config.ts";
import { t, useLang, type Key } from "../lib/i18n.ts";
import { saveAccount, type Account } from "../lib/store.ts";
import { connectExternal, encryptSecret, localWallet, type Wallet } from "../lib/wallet.ts";
import { Button, ErrorText, Field, Input, LangToggle, Logo, errorMessage } from "./ui.tsx";

type Tab = "create" | "import" | "external";

/** Funds the account on testnet if needed and registers this device on the node. */
async function signUp(wallet: Wallet, walletRecord: Account["wallet"], onStep: (s: Key) => void) {
  if (!(await stellar.account(wallet.address))) {
    onStep("stepFund");
    await stellar.fund(wallet.address);
  }
  onStep("stepAuthorize");
  const session = await Session.create(wallet.address, NODE_URL, wallet.signMessage, stellar);
  onStep("stepRegister");
  await session.register();
  const account: Account = { session: session.state, wallet: walletRecord };
  saveAccount(account);
  return account;
}

const TABS: { id: Tab; label: Key; icon: ReactNode }[] = [
  { id: "create", label: "tabCreate", icon: <PlusCircle size={15} /> },
  { id: "import", label: "tabImport", icon: <KeyRound size={15} /> },
  { id: "external", label: "tabExternal", icon: <WalletIcon size={15} /> },
];

export function Onboarding({ onReady }: { onReady: (a: Account, w: Wallet) => void }) {
  useLang();
  const [tab, setTab] = useState<Tab>("create");
  const [secret, setSecret] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [step, setStep] = useState<Key | null>(null);
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
      if (!StrKey.isValidEd25519SecretSeed(kpSecret)) throw new Error(t("invalidSecret"));
      setStep("stepEncrypt");
      const wallet = localWallet(kpSecret);
      const enc = await encryptSecret(kpSecret, password);
      const account = await signUp(wallet, { kind: "local", secret: enc }, setStep);
      if (tab === "create") setBackup({ account, wallet, secret: kpSecret });
      else onReady(account, wallet);
    });

  const connect = () =>
    run(async () => {
      setStep("stepPickWallet");
      const wallet = await connectExternal();
      const account = await signUp(wallet, { kind: "external" }, setStep);
      onReady(account, wallet);
    });

  if (backup) {
    return (
      <Shell>
        <h2 className="text-lg font-semibold text-white">{t("backupTitle")}</h2>
        <p className="text-sm text-ink-300">{t("backupBody")}</p>
        <code className="block break-all rounded-xl border border-cyan-400/20 bg-black/40 p-3 text-sm text-cyan-200">
          {backup.secret}
        </code>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          {t("backupSaved")}
        </label>
        <Button disabled={!saved} onClick={() => onReady(backup.account, backup.wallet)} className="w-full">
          {t("enter")}
        </Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/30 p-1 text-xs sm:text-sm">
        {TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-1 py-2 transition ${
              tab === id ? "glass text-white" : "text-ink-400 hover:text-white"
            }`}
          >
            <span className="hidden sm:inline">{icon}</span>
            {t(label)}
          </button>
        ))}
      </div>

      {tab === "external" ? (
        <>
          <p className="text-sm text-ink-300">{t("externalIntro")}</p>
          <Button onClick={connect} disabled={busy} className="w-full">
            {t("connectWallet")}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-ink-300">{tab === "create" ? t("createIntro") : t("importIntro")}</p>
          {tab === "import" && (
            <Field label={t("secretKey")}>
              <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="S…" />
            </Field>
          )}
          <Field label={t("devicePassword")} hint={t("devicePasswordHint")}>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label={t("repeatPassword")}>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Button onClick={createOrImport} disabled={busy || !passwordOk} className="w-full">
            {tab === "create" ? t("createWallet") : t("importWallet")}
          </Button>
        </>
      )}

      {step && <p className="text-sm text-emerald-300">{t(step)}</p>}
      <ErrorText error={error} />
    </Shell>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  useLang();
  return (
    <div className="flex min-h-dvh items-center justify-center p-3 sm:p-4">
      <div className="glass w-full max-w-md space-y-4 rounded-3xl p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl">
              <Logo />
            </h1>
            <p className="text-sm text-ink-400">{t("tagline")}</p>
          </div>
          <LangToggle />
        </div>
        {children}
      </div>
    </div>
  );
}
