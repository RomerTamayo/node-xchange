import type { Receipt } from "@nodexchange/core";
import { stellar } from "./config.ts";

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

function receiptHtml(r: Receipt): string {
  const rows = r.operations
    .map(
      (op) =>
        `<tr><td>${esc(op.type)}</td><td class="mono">${esc(op.from)}</td><td class="mono">${esc(op.to)}</td><td>${esc(op.amount)} ${esc(op.asset)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comprobante ${esc(r.hash.slice(0, 10))}</title>
<style>
body{font-family:system-ui,sans-serif;color:#111;max-width:760px;margin:32px auto;padding:0 16px}
h1{font-size:20px;margin:0}.muted{color:#555;font-size:13px}
table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left;vertical-align:top}
.mono{font-family:ui-monospace,monospace;word-break:break-all;font-size:12px}
.note{margin-top:24px;font-size:12px;color:#555;border-top:1px solid #ddd;padding-top:12px}
</style></head><body>
<h1>NodeXchange · Comprobante de transacción</h1>
<p class="muted">Red Stellar ${esc(r.network)} · ${r.successful ? "Exitosa" : "Fallida"}</p>
<table>
<tr><th>Hash</th><td class="mono">${esc(r.hash)}</td></tr>
<tr><th>Fecha</th><td>${esc(new Date(r.createdAt).toLocaleString())}</td></tr>
<tr><th>Ledger</th><td>${esc(r.ledger)}</td></tr>
<tr><th>Origen</th><td class="mono">${esc(r.source)}</td></tr>
<tr><th>Memo</th><td>${esc(r.memo)}</td></tr>
<tr><th>Comisión de red</th><td>${esc(r.feeCharged)} XLM</td></tr>
</table>
<table><tr><th>Operación</th><th>De</th><th>Para</th><th>Monto</th></tr>${rows}</table>
<p class="note">La fuente de verdad es la red Stellar: verifica este comprobante en
<span class="mono">${esc(r.explorerUrl)}</span></p>
</body></html>`;
}

/** Opens a printable receipt; the browser's print dialog can save it as PDF. */
export async function printReceipt(hash: string) {
  const win = window.open("", "_blank");
  if (!win) throw new Error("El navegador bloqueó la ventana del comprobante.");
  win.document.write("<p style='font-family:sans-serif'>Cargando comprobante…</p>");
  const receipt = await stellar.receipt(hash);
  win.document.open();
  win.document.write(receiptHtml(receipt));
  win.document.close();
  win.focus();
  win.print();
}
