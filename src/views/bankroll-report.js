export function executiveBankrollHTML(report, { tipster = "", labels = {}, generatedAt = new Date() } = {}) {
  const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  const percent = value => value === null ? "Sin base" : `${value.toFixed(2)}%`;
  const money = (minor, currency) => `${currency} ${(minor / 100).toFixed(2)}`;
  const field = (label, value) => `<div class="field"><dt>${escape(label)}</dt><dd title="${escape(value)}">${escape(value)}</dd></div>`;
  const currencies = report.totals.map(total => `
    <article class="card currency">
      <div class="section-heading"><h3>${escape(total.currency)}</h3><span>${escape(total.count)} picks con importe</span></div>
      <dl class="grid key-values">
        <div class="field"><dt>Profit neto</dt><dd class="value ${total.profit < 0 ? "negative" : ""}">${escape(money(total.profit, total.currency))}</dd></div>
        <div class="field"><dt>Yield</dt><dd class="value ${total.yield < 0 ? "negative" : ""}">${escape(percent(total.yield))}</dd></div>
      </dl>
      <dl class="grid secondary">${field("Stake cerrado", money(total.settledStake, total.currency))}${field("En riesgo", money(total.risk, total.currency))}${field("Retorno cerrado", money(total.returned, total.currency))}</dl>
    </article>`).join("");
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fijas en vivo - Resumen financiero privado</title>
<style>
  :root { color-scheme: dark; font-family: Arial, Helvetica, sans-serif; color: #f4f4f5; background: #09090b; }
  * { box-sizing: border-box; }
  body { margin: 0; font-size: 12px; line-height: 1.5; }
  .toolbar { max-width: 794px; margin: 20px auto; padding: 0 24px; display: flex; flex-wrap: wrap; align-items: center; gap: 12px; color: #d4d4d8; }
  button { border: 0; border-radius: 8px; background: #6ee7b7; color: #09090b; padding: 12px 18px; font: inherit; font-weight: 700; cursor: pointer; }
  button:focus-visible { outline: 2px solid #f4f4f5; outline-offset: 3px; }
  .sheet { max-width: 794px; min-height: 1123px; margin: 0 auto 24px; padding: 36px; background: #09090b; display: flex; flex-direction: column; }
  .report-layout { width: 100%; table-layout: fixed; border-collapse: collapse; }
  .report-layout td { padding: 0; vertical-align: top; }
  .footer-space { display: none; }
  main { flex: 1; }
  h1,h2,h3,p,dl,dd { margin: 0; }
  h1 { font-size: 28px; line-height: 1.2; letter-spacing: -.5px; margin: 20px 0 16px; }
  h2 { font-size: 16px; margin-bottom: 12px; }
  h3 { font-size: 15px; color: #6ee7b7; }
  .card { border: 1px solid #2c2c32; border-radius: 12px; background: #111114; padding: 20px; break-inside: avoid; }
  header.card { margin-bottom: 20px; }
  .brand { display: flex; align-items: center; gap: 12px; font-size: 16px; font-weight: 700; }
  .logo { display: grid; place-items: center; width: 36px; height: 36px; background: #6ee7b7; color: #09090b; border-radius: 9px; }
  .grid { display: grid; gap: 16px; grid-template-columns: repeat(2,minmax(0,1fr)); }
  .grid > *, .counts > *, .field { min-width: 0; max-width: 100%; }
  .filters { margin-bottom: 20px; }
  .filters dl { grid-template-columns: repeat(3,minmax(0,1fr)); }
  dt,.section-heading span { font-size: 11px; color: #a1a1aa; }
  dt,dd { max-width: 100%; overflow-wrap: anywhere; word-break: break-word; }
  dd { font-weight: 600; margin-top: 4px; }
  header .field dd, .filters .field dd { text-overflow: ellipsis; white-space: nowrap; overflow: hidden; }
  .period { margin-bottom: 14px; }
  .metrics { margin-bottom: 24px; }
  .value { color: #6ee7b7; font-size: 30px; line-height: 1.25; letter-spacing: -.5px; font-variant-numeric: tabular-nums; }
  .negative { color: #fda4af; }
  .counts { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; margin-top: 16px; }
  .section-heading { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; align-items: baseline; margin-bottom: 12px; }
  .section-heading > * { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
  .currency { margin-bottom: 12px; }
  .secondary { grid-template-columns: repeat(3,minmax(0,1fr)); margin-top: 16px; padding-top: 12px; border-top: 1px solid #2c2c32; }
  footer { margin-top: 28px; border-top: 1px solid #2c2c32; padding-top: 12px; color: #a1a1aa; font-size: 9px; line-height: 1.5; }
  footer p + p { margin-top: 4px; }
  .footer-brand { color: #d4d4d8; margin-top: 10px; font-weight: 700; }
  @page { size: A4; margin: 12mm; }
  @media print {
    :root,body { background: #09090b; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .toolbar { display: none; }
    .sheet { margin: 0; padding: 0; min-height: 0; max-width: none; display: block; }
    main { padding-bottom: 4mm; }
    .footer-space { display: block; height: 34mm; }
    tfoot { display: table-footer-group; }
    h1 { font-size: 25px; }
    h2 { break-after: avoid; }
    .card { padding: 16px; }
    .value { font-size: 26px; }
    footer { position: fixed; left: 0; right: 0; bottom: 0; height: 28mm; margin: 0; font-size: 8px; }
  }
  @media screen and (max-width: 600px) {
    .sheet { padding: 20px; min-height: 100dvh; }
    .grid,.filters dl { grid-template-columns: 1fr; }
    .secondary { grid-template-columns: 1fr; }
    .value { font-size: 27px; }
    h1 { font-size: 24px; }
  }
</style></head><body>
<div class="toolbar"><button id="printReport" type="button">Imprimir / Guardar como PDF</button><span>Documento privado. Activa gráficos de fondo y desactiva cabeceras y pies del navegador.</span></div>
<div class="sheet"><table class="report-layout" role="presentation"><tbody><tr><td><main>
  <header class="card"><div class="brand"><span class="logo">F.</span>Fijas en vivo</div><h1>Resumen financiero privado</h1>
    <dl class="grid">${field("Tipster", tipster || "Reporte privado del tipster")}${field("Emitido", generatedAt.toLocaleString("es-PE"))}</dl>
  </header>
  <section class="card filters"><h2>Filtros aplicados</h2><dl class="period">${field("Fecha del evento (ambos días incluidos)", `${report.filters.from} a ${report.filters.through}`)}</dl>
    <dl class="grid">${field("Estado", labels.status || report.filters.status || "Todas")}${field("Deporte", labels.sport || report.filters.sport || "Todos")}${field("Casa de apuestas", labels.bookmaker || report.filters.bookmaker || "Todas")}</dl>
  </section>
  <section class="metrics"><h2>Métricas de rendimiento</h2><div class="grid">
    <article class="card"><dl><dt>Efectividad global</dt><dd class="value">${escape(percent(report.effectiveness))}</dd></dl>
      <dl class="counts">${field("Ganadas", report.won)}${field("Pérdidas", report.lost)}${field("Base", report.won + report.lost)}</dl>
    </article>
    <article class="card"><dl><dt>Total de picks</dt><dd class="value">${escape(report.count)}</dd></dl><dl class="counts">${field("Con importe privado", report.financialCount)}</dl></article>
  </div></section>
  <section><h2>Balance por moneda</h2>${currencies || '<article class="card">Sin importes privados en los picks seleccionados. No hay base financiera para Profit ni Yield.</article>'}</section>
</main></td></tr></tbody><tfoot><tr><td><div class="footer-space" aria-hidden="true"></div></td></tr></tfoot></table><footer>
  <p>Período por fecha del evento, en zona horaria local. Efectividad = ganadas / (ganadas + pérdidas); excluye pendientes, anuladas y Cash out.</p>
  <p>Yield = profit / stake cerrado × 100; excluye pendientes y anuladas e incluye Cash out. Sin conversiones ni Yield global entre monedas.</p>
  <p>Ganadas: retorno teórico por cuota. Pérdidas: cero. Anuladas: stake devuelto. Cash out: retorno real con capital. Sin comisiones; no representa saldo de cuenta.</p>
  <p>Documento privado con información financiera personal. Compártelo únicamente si lo deseas.</p><p class="footer-brand">Fijas en vivo / Reporte privado</p>
</footer></div></body></html>`;
}

export function openExecutiveBankrollReport(report, options) {
  const html = executiveBankrollHTML(report, options);
  const preview = window.open("", "_blank");
  if (!preview) throw new Error("El navegador bloqueó la vista previa. Permite ventanas emergentes para abrir el reporte.");
  preview.opener = null;
  preview.document.open();
  preview.document.write(html);
  preview.document.close();
  const print = () => { preview.focus(); preview.print(); };
  preview.document.getElementById("printReport").addEventListener("click", print);
  preview.document.fonts.ready.then(() => {
    if (!preview.closed) preview.requestAnimationFrame(() => preview.requestAnimationFrame(print));
  });
  return preview;
}
