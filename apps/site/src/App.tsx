// NodeXchange product page. Built to be presented live in a few minutes:
// one idea per section, real screenshots of the app, a QR to the demo at the end.
//
// Shape rule: buttons are pills, panels are rounded-3xl, phones rounded-[2.25rem].

import { useEffect, useState } from "react";
import {
  ArrowRight,
  EyeOff,
  HandCoins,
  KeyRound,
  LockKeyhole,
  QrCode,
  Send,
  Server,
  ShieldCheck,
  TimerReset,
  TriangleAlert,
} from "lucide-react";
import { DEMO_URL, ESCROW_URL, REPO_URL, content, type Lang } from "./content.ts";
import { Reveal } from "./Reveal.tsx";

const LANG_KEY = "nx-site:lang";

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "es" || saved === "en") return saved;
  } catch {
    // storage blocked: fall through to the browser language
  }
  return navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
}

function Phone({ src, alt, className = "", eager = false }: { src: string; alt: string; className?: string; eager?: boolean }) {
  return (
    <div className={`rounded-[2.25rem] border border-white/10 bg-ink-900 p-2 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.8)] ${className}`}>
      <img
        src={src}
        alt={alt}
        width={585}
        height={1266}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        className="block h-auto w-full rounded-[1.75rem]"
      />
    </div>
  );
}

/** A cropped part of a real screen (the bit that matters for the section). */
function Screen({ src, alt, w, h, className = "" }: { src: string; alt: string; w: number; h: number; className?: string }) {
  return (
    <img
      src={src}
      alt={alt}
      width={w}
      height={h}
      loading="lazy"
      className={`block h-auto w-full rounded-3xl border border-white/10 shadow-[0_24px_48px_-28px_rgb(0_0_0/0.8)] ${className}`}
    />
  );
}

const CROPS: Record<string, [number, number]> = {
  "/screens/my-qr-crop.webp": [585, 690],
  "/screens/request-crop.webp": [585, 392],
  "/screens/pay-menu-crop.webp": [585, 493],
};

function PrimaryButton({ label }: { label: string }) {
  return (
    <a
      href={DEMO_URL}
      className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-ink-950 transition hover:bg-emerald-300 active:scale-[0.98]"
    >
      {label}
      <ArrowRight size={16} strokeWidth={2} />
    </a>
  );
}

function CodeButton({ label }: { label: string }) {
  return (
    <a
      href={REPO_URL}
      className="nx-glass inline-flex items-center gap-2 whitespace-nowrap rounded-full px-5 py-3 text-sm font-medium text-ink-50 transition hover:bg-white/10 active:scale-[0.98]"
    >
      <img src="/logos/github.svg" alt="" width={16} height={16} />
      {label}
    </a>
  );
}

export function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const c = content[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // not critical
    }
  }, [lang]);

  return (
    <>
      <header className="nx-glass sticky top-0 z-20 border-x-0 border-t-0">
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <a href="#top" className="flex items-center gap-2.5 font-semibold tracking-tight text-ink-50">
            <img src="/logoNodeXchange.png" alt="" width={28} height={28} className="rounded-lg bg-ink-50 p-0.5" />
            NodeXchange
          </a>
          <div className="ml-auto hidden items-center gap-6 text-sm text-ink-300 md:flex">
            <a href="#how" className="hover:text-ink-50">{c.nav.how}</a>
            <a href="#payments" className="hover:text-ink-50">{c.nav.payments}</a>
            <a href="#privacy" className="hover:text-ink-50">{c.nav.privacy}</a>
          </div>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <button
              onClick={() => setLang(lang === "es" ? "en" : "es")}
              className="rounded-full px-3 py-1.5 text-xs font-semibold uppercase text-ink-300 hover:text-ink-50"
              aria-label={lang === "es" ? "Switch to English" : "Cambiar a español"}
            >
              {lang === "es" ? "EN" : "ES"}
            </button>
            <a
              href={DEMO_URL}
              className="whitespace-nowrap rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-emerald-300 active:scale-[0.98]"
            >
              {c.cta}
            </a>
          </div>
        </nav>
      </header>

      <main id="top">
        {/* Hero: split, copy left, real app screens right. */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-12 sm:px-6 md:grid-cols-[1.05fr_1fr] md:pt-20">
          <div>
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-tighter text-ink-50 md:text-6xl">{c.hero.title}</h1>
            <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-ink-300">{c.hero.body}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <PrimaryButton label={c.cta} />
              <CodeButton label={c.code} />
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-[22rem] md:max-w-none">
            <Phone
              src="/screens/request.webp"
              alt={c.how.steps[1].alt}
              className="absolute left-0 top-12 hidden w-[44%] -rotate-6 opacity-70 md:block"
            />
            <Phone src="/screens/chat-deal.webp" alt={c.payments.protected.alt} eager className="relative mx-auto w-[80%] md:ml-auto md:mr-0 md:w-[52%]" />
          </div>
        </section>

        {/* Problem: one statement, full width. */}
        <section className="border-y border-white/5 bg-ink-900/40">
          <Reveal className="mx-auto max-w-4xl px-4 py-24 sm:px-6 md:py-28">
            <p className="text-3xl font-medium leading-tight tracking-tight text-ink-50 md:text-5xl">{c.problem.title}</p>
            <p className="mt-6 max-w-[60ch] text-lg leading-relaxed text-emerald-200/90">{c.problem.body}</p>
          </Reveal>
        </section>

        {/* How it works: sticky title, three rows with a screen each. */}
        <section id="how" className="mx-auto grid max-w-6xl gap-12 px-4 py-24 sm:px-6 md:grid-cols-[0.8fr_1.2fr]">
          <div className="md:sticky md:top-28 md:self-start">
            <h2 className="text-3xl font-semibold tracking-tight text-ink-50 md:text-4xl">{c.how.title}</h2>
          </div>
          <ol className="space-y-16">
            {c.how.steps.map((step, i) => {
              const Icon = [QrCode, LockKeyhole, HandCoins][i];
              return (
                <Reveal as="li" key={step.name} index={i} className="grid items-center gap-6 sm:grid-cols-[1fr_17rem]">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                        <Icon size={20} strokeWidth={1.75} />
                      </span>
                      <h3 className="text-2xl font-semibold text-ink-50">{step.name}</h3>
                    </div>
                    <p className="mt-3 max-w-[48ch] leading-relaxed text-ink-300">{step.body}</p>
                  </div>
                  <Screen src={step.img} alt={step.alt} w={CROPS[step.img][0]} h={CROPS[step.img][1]} />
                </Reveal>
              );
            })}
          </ol>
        </section>

        {/* Payments: bento of exactly three cells. */}
        <section id="payments" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <h2 className="max-w-[22ch] text-3xl font-semibold tracking-tight text-ink-50 md:text-4xl">{c.payments.title}</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-2 md:grid-rows-2">
            <Reveal className="overflow-hidden rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/15 via-ink-900 to-cyan-500/10 p-6 md:row-span-2 md:p-8">
              <ShieldCheck className="text-emerald-300" size={28} strokeWidth={1.75} />
              <h3 className="mt-4 text-2xl font-semibold text-ink-50">{c.payments.protected.name}</h3>
              <p className="mt-2 max-w-[44ch] leading-relaxed text-ink-200">{c.payments.protected.body}</p>
              <a href={ESCROW_URL} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-300 hover:text-emerald-200">
                {c.stellar.contract}
                <ArrowRight size={14} />
              </a>
              <Screen src="/screens/chat-deal-crop.webp" alt={c.payments.protected.alt} w={585} h={810} className="mx-auto mt-8 max-w-sm" />
            </Reveal>
            <Reveal index={1} className="nx-glass flex flex-col rounded-3xl p-6 md:p-8">
              <Send className="text-emerald-300" size={26} strokeWidth={1.75} />
              <h3 className="mt-4 text-xl font-semibold text-ink-50">{c.payments.direct.name}</h3>
              <p className="mt-2 max-w-[44ch] leading-relaxed text-ink-300">{c.payments.direct.body}</p>
              <p className="mt-auto pt-8 text-5xl font-semibold tracking-tighter text-ink-50 md:text-6xl">
                XLM <span className="text-ink-500">/</span> USDC
              </p>
            </Reveal>
            <Reveal index={2} className="grid gap-5 overflow-hidden rounded-3xl border border-white/10 bg-ink-900/70 p-6 md:p-8">
              <div>
                <TriangleAlert className="text-ink-300" size={26} strokeWidth={1.75} />
                <h3 className="mt-4 text-xl font-semibold text-ink-50">{c.payments.external.name}</h3>
                <p className="mt-2 leading-relaxed text-ink-300">{c.payments.external.body}</p>
              </div>
              <Screen src="/screens/external-crop.webp" alt={c.payments.external.alt} w={585} h={551} className="max-w-sm" />
            </Reveal>
          </div>
        </section>

        {/* Privacy: plain 2x2, no cards. */}
        <section id="privacy" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight text-ink-50 md:text-4xl">{c.privacy.title}</h2>
          <div className="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2">
            {c.privacy.items.map((item, i) => {
              const Icon = [LockKeyhole, TimerReset, EyeOff, Server][i];
              return (
                <Reveal key={item.name} index={i} className="border-t border-white/10 pt-6">
                  <Icon className="text-emerald-300" size={22} strokeWidth={1.75} />
                  <h3 className="mt-3 text-lg font-semibold text-ink-50">{item.name}</h3>
                  <p className="mt-1.5 max-w-[42ch] leading-relaxed text-ink-300">{item.body}</p>
                </Reveal>
              );
            })}
          </div>
        </section>

        {/* Stellar: centred statement with the network mark. */}
        <section className="border-y border-white/5 bg-ink-900/40">
          <Reveal className="mx-auto flex max-w-3xl flex-col items-center px-4 py-20 text-center sm:px-6">
            <img src="/logos/stellar.svg" alt="Stellar" width={44} height={44} />
            <h2 className="mt-5 text-3xl font-semibold tracking-tight text-ink-50 md:text-4xl">{c.stellar.title}</h2>
            <p className="mt-4 max-w-[56ch] leading-relaxed text-ink-300">{c.stellar.body}</p>
            <div className="mt-6 flex items-center gap-2 text-sm text-ink-400">
              <KeyRound size={16} />
              <a href={ESCROW_URL} className="underline decoration-white/20 underline-offset-4 hover:text-ink-100">
                {c.stellar.contract}
              </a>
            </div>
          </Reveal>
        </section>

        {/* Final call: QR so the audience can open the demo on their phones. */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-24 sm:px-6 md:grid-cols-[1fr_auto]">
          <Reveal>
            <h2 className="text-4xl font-semibold leading-[1.05] tracking-tighter text-ink-50 md:text-5xl">{c.final.title}</h2>
            <p className="mt-4 max-w-[48ch] text-lg leading-relaxed text-ink-300">{c.final.body}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <PrimaryButton label={c.cta} />
              <CodeButton label={c.code} />
            </div>
          </Reveal>
          <Reveal index={1} className="justify-self-center">
            <div className="rounded-3xl bg-ink-50 p-4">
              <img src="/demo-qr.png" alt={`QR: ${DEMO_URL}`} width={240} height={240} className="block h-60 w-60" />
            </div>
            <p className="mt-3 text-center font-mono text-sm text-ink-400">nodexchange.pages.dev</p>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-8 text-sm text-ink-400 sm:px-6">
          <span className="flex items-center gap-2 font-semibold text-ink-200">
            <img src="/logoNodeXchange.png" alt="" width={20} height={20} className="rounded bg-ink-50 p-0.5" />
            NodeXchange
          </span>
          <span>{c.footer}</span>
          <a href={REPO_URL} className="ml-auto flex items-center gap-2 hover:text-ink-100">
            <img src="/logos/github.svg" alt="" width={16} height={16} />
            GitHub
          </a>
        </div>
      </footer>
    </>
  );
}
