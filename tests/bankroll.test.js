import test from "node:test";
import assert from "node:assert/strict";
import { executiveBankrollHTML } from "../bankroll-report.js";
import { bankrollCurrencies, parseBankrollStake, parseCashOutReturn, pickFinancialResult, summarizeBankroll, eventDateRange, filterBankrollPicks, bankrollCSV, bankrollReportData } from "../bankroll.js";

test("importe opcional sin registro financiero", () => {
  assert.equal(parseBankrollStake("", "PEN"), null);
  assert.equal(parseBankrollStake(" ", "PEN"), null);
});

test("importe decimal y unidades menores consistentes en cada moneda", () => {
  for (const { code } of bankrollCurrencies) {
    assert.deepEqual(parseBankrollStake("12.34", code), {
      stakeAmount: 12.34, stakeMinorUnits: 1234, currency: code
    });
    assert.equal(parseBankrollStake("0.01", code).stakeMinorUnits, 1);
    assert.equal(parseBankrollStake("1000000000", code).stakeMinorUnits, 100000000000);
    assert.equal(parseBankrollStake("0.29", code).stakeMinorUnits, 29);
  }
});

test("rechaza importes inválidos sin redondear silenciosamente", () => {
  for (const value of ["0", "-1", "0.001", "1.234", "NaN", "Infinity", "abc", "1000000000.01"]) {
    assert.throws(() => parseBankrollStake(value, "PEN"));
  }
  assert.throws(() => parseBankrollStake("10", "XXX"));
});

test("cierre anticipado total admite retorno cero, ganancia y pérdida", () => {
  assert.deepEqual(parseCashOutReturn("0", "PEN"), { returnAmount: 0, returnMinorUnits: 0 });
  assert.deepEqual(parseCashOutReturn("105.50", "USD"), { returnAmount: 105.5, returnMinorUnits: 10550 });
  for (const value of ["", "-1", "1.234", "Infinity"]) assert.throws(() => parseCashOutReturn(value, "PEN"));
  const bankroll = { stakeMinorUnits: 10000, currency: "PEN", returnMinorUnits: 10550 };
  assert.equal(pickFinancialResult({ estado: "cash_out" }, bankroll).profit, 550);
  assert.equal(pickFinancialResult({ estado: "cash_out" }, { ...bankroll, returnMinorUnits: 8000 }).profit, -2000);
  assert.equal(pickFinancialResult({ estado: "cash_out" }, { ...bankroll, returnMinorUnits: 0 }).profit, -10000);
});

test("resultados y resumen no mezclan monedas ni ganancias pendientes", () => {
  const picks = [
    { id: "a", estado: "ganada", cuota: 1.85 },
    { id: "b", estado: "pendiente", cuota: 2 },
    { id: "c", estado: "cash_out" },
    { id: "d", estado: "perdida" },
    { id: "e", estado: "anulada" },
    { id: "f", estado: "pendiente" }
  ];
  const records = new Map([
    ["a", { stakeMinorUnits: 1000, currency: "PEN" }],
    ["b", { stakeMinorUnits: 2000, currency: "PEN" }],
    ["c", { stakeMinorUnits: 1000, currency: "USD", returnMinorUnits: 1200 }],
    ["d", { stakeMinorUnits: 500, currency: "USD" }],
    ["e", { stakeMinorUnits: 800, currency: "USD" }]
  ]);
  assert.deepEqual(summarizeBankroll(picks, records), [
    { currency: "PEN", count: 2, risk: 2000, returned: 1850, profit: 850, settledStake: 1000, yield: 85 },
    { currency: "USD", count: 3, risk: 0, returned: 2000, profit: -300, settledStake: 1500, yield: -20 }
  ]);
  assert.throws(() => pickFinancialResult({ estado: "cash_out" }, { stakeMinorUnits: 100, currency: "EUR" }));
});

test("rango local incluye todo Hasta, cruza meses y rechaza fechas inválidas", () => {
  const { start, end } = eventDateRange("2026-10-01", "2026-10-31");
  assert.equal(start.getDate(), 1);
  assert.equal(start.getMonth(), 9);
  assert.equal(start.getHours(), 0);
  assert.equal(end.getMonth(), 10);
  assert.equal(end.getDate(), 1);
  assert.equal(end.getHours(), 0);
  for (const [from, through] of [["", ""], ["2026-02-30", "2026-03-01"], ["2026-10-05", "2026-10-04"]]) {
    assert.throws(() => eventDateRange(from, through));
  }
});

test("combina estado, deporte y casa sin limitar los resultados a 50", () => {
  const picks = Array.from({ length: 125 }, (_, index) => ({
    id: String(index), estado: "cash_out", deporte: "futbol", casa_apuestas: "betano"
  }));
  assert.equal(filterBankrollPicks(picks).length, 125);
  assert.equal(filterBankrollPicks(picks, { status: "cash_out", sport: "futbol", bookmaker: "betano" }).length, 125);
  assert.equal(filterBankrollPicks(picks, { status: "ganada" }).length, 0);
  assert.equal(filterBankrollPicks(picks, { sport: "tenis" }).length, 0);
  assert.equal(filterBankrollPicks(picks, { bookmaker: "bet365" }).length, 0);
});

test("Yield sin stake cerrado queda indefinido, no cero ficticio", () => {
  const picks = [{ id: "pending", estado: "pendiente" }, { id: "void", estado: "anulada" }];
  const records = new Map(picks.map(pick => [pick.id, { stakeMinorUnits: 1000, currency: "PEN" }]));
  const [total] = summarizeBankroll(picks, records);
  assert.equal(total.settledStake, 0);
  assert.equal(total.yield, null);
  assert.equal(total.profit, 0);
  assert.equal(pickFinancialResult(picks[0], records.get("pending")).yield, null);
  assert.equal(pickFinancialResult(picks[1], records.get("void")).yield, null);
  assert.equal(pickFinancialResult({ estado: "ganada", cuota: 1.85 }, records.get("pending")).yield, 85);
  assert.equal(pickFinancialResult({ estado: "perdida" }, records.get("pending")).yield, -100);
  assert.equal(pickFinancialResult({ estado: "cash_out" }, { ...records.get("pending"), returnMinorUnits: 1050 }).yield, 5);
});

test("CSV exporta detalle completo, filtros, resumen y escapa fórmulas y comillas", () => {
  const picks = Array.from({ length: 125 }, (_, index) => ({
    id: `csv-${index}`, estado: "ganada", cuota: 2, deporte: "futbol", casa_de_apuestas: "betano",
    evento: '=HYPERLINK("bad")', seleccion: 'Texto, "citado"\nsegunda línea',
    nota: " \t+SUM(1,2)", fecha_evento: new Date(2026, 9, 4)
  }));
  const records = new Map(picks.map(pick => [pick.id, { stakeMinorUnits: 100, currency: "PEN" }]));
  const filters = { from: "2026-10-01", through: "2026-10-04", status: "ganada", sport: "futbol", bookmaker: "betano" };
  const csv = bankrollCSV(picks, records, filters);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"csv-124"'));
  assert.ok(csv.includes('"2026-10-01","hasta (inclusive)","2026-10-04"'));
  assert.ok(csv.includes('"PEN","125","0","250","125","125","100"'));
  assert.ok(csv.includes(`"'=HYPERLINK(""bad"")"`));
  assert.ok(csv.includes(`"' \t+SUM(1,2)"`));
  assert.ok(csv.includes('"Texto, ""citado""\nsegunda línea"'));
  const report = bankrollCSV(picks, records, filters, true);
  assert.ok(!report.includes('"csv-124"'));
  assert.ok(report.includes('"Yield (%)"'));
  assert.throws(() => bankrollCSV(picks, new Map(), filters));
});

test("CSV y PDF comparten filtros de fecha/estado/deporte/casa y métricas por moneda", () => {
  const filters = { from: "2026-10-01", through: "2026-10-04", status: "", sport: "tenis", bookmaker: "bet365" };
  const base = { fecha_evento: new Date(2026, 9, 4, 23, 59), deporte: "tenis", casa_apuestas: "bet365", cuota: 2 };
  const picks = [
    { ...base, id: "won", estado: "ganada" },
    { ...base, id: "lost", estado: "perdida" },
    { ...base, id: "cash", estado: "cash_out" },
    { ...base, id: "pending", estado: "pendiente" },
    { ...base, id: "void", estado: "anulada" },
    { ...base, id: "no-money", estado: "ganada" },
    { ...base, id: "date-out", estado: "ganada", fecha_evento: new Date(2026, 9, 5) },
    { ...base, id: "sport-out", estado: "ganada", deporte: "futbol" },
    { ...base, id: "house-out", estado: "ganada", casa_apuestas: "betano" }
  ];
  const records = new Map([
    ["won", { currency: "PEN", stakeMinorUnits: 1000 }],
    ["lost", { currency: "PEN", stakeMinorUnits: 1000 }],
    ["cash", { currency: "USD", stakeMinorUnits: 1000, returnMinorUnits: 1200 }],
    ["pending", { currency: "USD", stakeMinorUnits: 1000 }],
    ["void", { currency: "EUR", stakeMinorUnits: 1000 }],
    ["no-money", null]
  ]);
  const report = bankrollReportData(picks, records, filters);
  assert.equal(report.count, 6);
  assert.equal(report.financialCount, 5);
  assert.equal(report.effectiveness, 2 / 3 * 100);
  assert.deepEqual(report.totals.map(total => [total.currency, total.profit, total.yield]), [
    ["PEN", 0, 0], ["USD", 200, 20], ["EUR", 0, null]
  ]);
  const cashOnly = { ...filters, status: "cash_out" };
  const csv = bankrollCSV(picks, records, cashOnly);
  assert.ok(csv.includes('"cash"'));
  for (const id of ["won", "lost", "pending", "void", "no-money", "date-out", "sport-out", "house-out"]) {
    assert.ok(!csv.includes(`"${id}"`));
  }
  assert.equal(bankrollReportData(picks, records, cashOnly).effectiveness, null);
  const content = executiveBankrollHTML(report, { tipster: "Tipster de prueba", generatedAt: new Date(2026, 9, 4) });
  assert.ok(content.startsWith("<!doctype html>"));
  assert.ok(content.includes("<dt>Total de picks</dt><dd class=\"value\">6</dd>"));
  assert.ok(content.includes("PEN 0.00"));
  assert.ok(content.includes("USD 2.00"));
  assert.ok(content.includes("20.00%"));
  assert.ok(content.includes("66.67%"));
  assert.ok(content.includes("<dt>Ganadas</dt>"));
  assert.ok(content.includes("<dt>Pérdidas</dt>"));
});

test("plantilla HTML privada escapa datos y define tarjetas y footer de impresión", () => {
  const report = {
    filters: { from: "2026-10-01", through: "2026-10-04" },
    count: 100000, financialCount: 100000, won: 50000, lost: 50000, effectiveness: 50,
    totals: ["PEN", "USD", "EUR"].map(currency => ({
      currency, count: 33333, profit: -99999999999999, settledStake: 999999999999999,
      risk: 999999999999999, returned: 999999999999999, yield: -10
    }))
  };
  const content = executiveBankrollHTML(report, {
    tipster: '<script>alert("privado")</script>' + "Nombre público muy largo ".repeat(4),
    labels: { status: "Ganadas y perdidas con cierre anticipado", sport: "Deporte con categoría de nombre extenso", bookmaker: "Casa de apuestas de nombre extenso" }
  });
  assert.equal((content.match(/class="card currency"/g) || []).length, 3);
  assert.ok(content.includes("break-inside: avoid"));
  assert.ok(content.includes("position: fixed"));
  assert.ok(content.includes("height: 34mm"));
  assert.ok(content.includes("display: table-footer-group"));
  assert.ok(content.includes("bottom: 0"));
  assert.ok(content.includes('&lt;script&gt;alert(&quot;privado&quot;)&lt;/script&gt;'));
  assert.ok(!content.includes("<script>"));
  assert.ok(content.indexOf("<footer>") > content.indexOf("</main>"));
  for (const currency of ["PEN", "USD", "EUR"]) assert.ok(content.includes(currency));
  assert.ok(content.includes("Profit neto"));
  assert.ok(content.includes("Documento privado"));
});
