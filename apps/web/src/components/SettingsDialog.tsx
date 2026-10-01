import { useState, type ReactNode } from "react";
import { MAX_ALIAS_CHARS } from "@nodexchange/core";
import { t, useLang } from "../lib/i18n.ts";
import type { Account, Settings } from "../lib/store.ts";
import { decryptSecret } from "../lib/wallet.ts";
import { Button, ErrorText, Field, Input, LangToggle, Modal, PeerName, errorMessage } from "./ui.tsx";

function Section({ children }: { children: ReactNode }) {
  return <section className="space-y-2 border-t border-white/10 pt-4 first:border-0 first:pt-0">{children}</section>;
}

export function SettingsDialog({
  account,
  settings,
  onSettings,
  onClearHistory,
  myAlias,
  onSetAlias,
  blocked,
  onUnblock,
  onPublishNode,
  onLogout,
  onClose,
}: {
  account: Account;
  settings: Settings;
  onSettings: (s: Settings) => void;
  onClearHistory: () => void;
  myAlias: string | null;
  onSetAlias: (alias: string | null) => Promise<void>;
  blocked: { address: string; alias: string | null }[];
  onUnblock: (address: string) => void;
  onPublishNode: () => Promise<string>;
  onLogout: () => void;
  onClose: () => void;
}) {
  useLang();
  const [alias, setAlias] = useState(myAlias ?? "");
  const [savingAlias, setSavingAlias] = useState(false);
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
    } else setError(t("wrongPassword"));
  }

  async function saveAlias() {
    setSavingAlias(true);
    setError(null);
    try {
      await onSetAlias(alias.trim() || null);
      setNote(alias.trim() ? t("aliasUpdated") : t("aliasRemoved"));
    } catch (e) {
      setError(/bad_alias|visible/.test(String(e)) ? t("aliasInvalid", { max: MAX_ALIAS_CHARS }) : errorMessage(e));
    } finally {
      setSavingAlias(false);
    }
  }

  async function publish() {
    setError(null);
    try {
      await onPublishNode();
      setNote(t("nodePublished"));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Modal title={t("settings")} onClose={onClose}>
      <Section>
        <Field label={t("aliasLabel")} hint={t("aliasHint")}>
          <div className="flex gap-2">
            <Input
              value={alias}
              maxLength={MAX_ALIAS_CHARS * 2}
              onChange={(e) => setAlias(e.target.value)}
              placeholder={t("aliasPlaceholder")}
            />
            <Button onClick={saveAlias} disabled={savingAlias || alias.trim() === (myAlias ?? "")}>
              {t("save")}
            </Button>
          </div>
        </Field>
      </Section>

      <Section>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-white">{t("language")}</span>
          <LangToggle />
        </div>
      </Section>

      <Section>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={settings.volatile}
            onChange={(e) => onSettings({ ...settings, volatile: e.target.checked })}
          />
          <span>
            <span className="font-medium text-white">{t("volatileTitle")}</span>
            <span className="block text-xs text-ink-400">{t("volatileBody")}</span>
          </span>
        </label>
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => {
            onClearHistory();
            setNote(t("historyCleared"));
          }}
        >
          {t("clearHistory")}
        </Button>
      </Section>

      {blocked.length > 0 && (
        <Section>
          <p className="text-xs font-medium text-ink-300">{t("blockedUsers")}</p>
          {blocked.map((b) => (
            <div key={b.address} className="flex items-center justify-between gap-2">
              <PeerName address={b.address} alias={b.alias} />
              <Button variant="ghost" onClick={() => onUnblock(b.address)}>
                {t("unblock")}
              </Button>
            </div>
          ))}
        </Section>
      )}

      <Section>
        <p className="text-sm text-ink-300">
          {t("node")}: <span className="break-all text-white">{account.session.homeNode}</span>
        </p>
        <p className="text-xs text-ink-500">{t("publishNodeHelp")}</p>
        <Button variant="ghost" className="w-full" onClick={publish}>
          {t("publishNode")}
        </Button>
      </Section>

      {local && (
        <Section>
          {secret ? (
            <code className="block break-all rounded-xl border border-cyan-400/20 bg-black/40 p-3 text-sm text-cyan-200">
              {secret}
            </code>
          ) : (
            <>
              <Field label={t("revealSecret")}>
                <Input
                  type="password"
                  placeholder={t("password")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Button variant="ghost" className="w-full" onClick={reveal}>
                {t("showSecret")}
              </Button>
            </>
          )}
        </Section>
      )}

      <Section>
        {confirmLogout ? (
          <>
            <p className="text-sm text-ruby-300">
              {t("logoutWarn")} {local && t("logoutWarnLocal")}
            </p>
            <Button variant="danger" className="w-full" onClick={onLogout}>
              {t("confirmLogout")}
            </Button>
          </>
        ) : (
          <Button variant="danger" className="w-full" onClick={() => setConfirmLogout(true)}>
            {t("logout")}
          </Button>
        )}
      </Section>

      {note && <p className="text-sm text-emerald-300">{note}</p>}
      <ErrorText error={error} />
    </Modal>
  );
}
