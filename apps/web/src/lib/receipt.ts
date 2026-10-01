import type { Receipt } from "@nodexchange/core";
import { stellar } from "./config.ts";
import { getLang, locale, t } from "./i18n.ts";

export async function downloadReceipt(hash: string) {
  const receipt = await stellar.receipt(hash);
  const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nodexchange-${hash.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

const esc = (s: unknown) =>
  String(s ?? "—").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function movementLabel(op: Receipt["operations"][number]): string {
  const escrow = stellar.net.escrow;
  if (op.to === escrow) return t("mvDeposit");
  if (op.from === escrow) return t("mvRelease");
  if (op.type === "payment") return t("mvPayment");
  if (op.type === "change_trust") return t("mvTrust");
  if (op.type === "manage_data") return t("mvData");
  return op.type;
}

const party = (address: string | null) =>
  address === stellar.net.escrow
    ? `${esc(t("escrowContract"))}<br><span class="mono">${esc(address)}</span>`
    : `<span class="mono">${esc(address)}</span>`;

export function receiptHtml(r: Receipt): string {
  const movements = r.operations
    .map(
      (op) => `<div class="move">
  <div class="move-head"><span>${esc(movementLabel(op))}</span>
  <span class="amount">${op.amount ? `${esc(Number(op.amount).toString())} ${esc(op.asset)}` : "—"}</span></div>
  <div class="row"><span class="label">${esc(t("from"))}</span><span>${party(op.from)}</span></div>
  <div class="row"><span class="label">${esc(t("to"))}</span><span>${party(op.to)}</span></div>
</div>`,
    )
    .join("");
  return `<!doctype html><html lang="${getLang()}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t("receiptTitle"))} ${esc(r.hash.slice(0, 10))}</title>
<style>
*{box-sizing:border-box}
body{font-family:system-ui,sans-serif;color:#111;max-width:720px;margin:24px auto;padding:0 16px;font-size:14px}
h1{font-size:20px;margin:0 0 4px}.muted{color:#555;font-size:13px;margin:0 0 16px}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;background:${r.successful ? "#d9f7e8" : "#fde2e7"}}
.mono{font-family:ui-monospace,monospace;word-break:break-all;font-size:12px}
.row{display:flex;gap:12px;padding:6px 0;border-bottom:1px solid #eee}
.label{flex:0 0 110px;color:#555}
.row>span:last-child{flex:1;min-width:0}
h2{font-size:15px;margin:20px 0 8px}
.move{border:1px solid #ddd;border-radius:10px;padding:10px 12px;margin-bottom:10px;break-inside:avoid}
.move-head{display:flex;justify-content:space-between;gap:12px;font-weight:600;margin-bottom:4px}
.amount{font-size:16px;white-space:nowrap}
.move .label{flex-basis:50px}
.note{margin-top:20px;font-size:12px;color:#555;border-top:1px solid #ddd;padding-top:12px}
</style></head><body>
<h1>${esc(t("receiptTitle"))}</h1>
<p class="muted">${esc(t("receiptNetwork", { network: r.network }))} · <span class="badge">${esc(r.successful ? t("receiptOk") : t("receiptFailed"))}</span></p>
<h2>${esc(t("movements"))}</h2>
${movements}
<h2>${esc(t("transaction"))}</h2>
<div class="row"><span class="label">${esc(t("date"))}</span><span>${esc(new Date(r.createdAt).toLocaleString(locale()))}</span></div>
<div class="row"><span class="label">Hash</span><span class="mono">${esc(r.hash)}</span></div>
<div class="row"><span class="label">${esc(t("signedBy"))}</span><span class="mono">${esc(r.source)}</span></div>
<div class="row"><span class="label">Memo</span><span>${esc(r.memo)}</span></div>
<div class="row"><span class="label">Ledger</span><span>${esc(r.ledger)}</span></div>
<div class="row"><span class="label">${esc(t("networkCost"))}</span><span>${esc(r.feeCharged)} XLM</span></div>
<p class="note">${esc(t("receiptNote"))}
<span class="mono">${esc(r.explorerUrl)}</span></p>
</body></html>`;
}

/** Opens a printable receipt; the browser's print dialog can save it as PDF. */
export async function printReceipt(hash: string) {
  const win = window.open("", "_blank");
  if (!win) throw new Error(t("popupBlocked"));
  win.document.write(`<p style='font-family:sans-serif'>${esc(t("receiptLoading"))}</p>`);
  const receipt = await stellar.receipt(hash);
  win.document.open();
  win.document.write(receiptHtml(receipt));
  win.document.close();
  win.focus();
  win.print();
}
