import test from "node:test";
import assert from "node:assert/strict";
import * as bankroll from "../bankroll.js";

const account = { currency: "PEN", initialMinorUnits: 10000, created_at: new Date("2026-10-10T12:00:00Z") };
const movements = [
  { id: "withdrawal", type: "withdrawal", amountMinorUnits: 15000, note: 'Retiro, "manual"', created_at: new Date("2026-10-10T14:00:00Z") },
  { id: "deposit", type: "deposit", amountMinorUnits: 1234, note: "=HYPERLINK(1)", created_at: new Date("2026-10-10T13:00:00Z") }
];

test("CSV cronológico incluye apertura, centavos exactos y flujo negativo sin confundirlo con saldo de picks", () => {
  assert.equal(typeof bankroll.bankrollMovementsCSV, "function");
  const csv = bankroll.bankrollMovementsCSV(account, movements);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /No incluye resultados ni riesgo de picks/);
  assert.match(csv, /"apertura","2026-10-10T12:00:00.000Z","Apertura","PEN","100.00","100.00",""/);
  assert.match(csv, /"deposit","2026-10-10T13:00:00.000Z","Depósito","PEN","12.34","112.34","'=HYPERLINK\(1\)"/);
  assert.match(csv, /"withdrawal","2026-10-10T14:00:00.000Z","Retiro","PEN","-150.00","-37.66","Retiro, ""manual"""/);
  assert.ok(csv.indexOf('"deposit",') < csv.indexOf('"withdrawal",'));
  assert.equal(movements[0].id, "withdrawal");
});

test("CSV acepta apertura cero sin movimientos y distingue USD y EUR", () => {
  assert.equal(typeof bankroll.bankrollMovementsCSV, "function");
  for (const currency of ["USD", "EUR"]) {
    const csv = bankroll.bankrollMovementsCSV({ ...account, currency, initialMinorUnits: 0 }, []);
    assert.ok(csv.includes(`"Apertura","${currency}","0.00","0.00"`));
    assert.ok(!csv.includes('"PEN"'));
  }
});

test("CSV rechaza datos incompletos, timestamps pendientes y movimientos corruptos sin exportar parcialmente", () => {
  assert.equal(typeof bankroll.bankrollMovementsCSV, "function");
  for (const patch of [
    { id: "" }, { note: "x".repeat(201) }, { created_at: null },
    { created_at: new Date("2026-10-09") }, { amountMinorUnits: 1.5 }, { type: "transfer" }
  ]) assert.throws(() => bankroll.bankrollMovementsCSV(account, [{ ...movements[0], ...patch }]));
  assert.throws(() => bankroll.bankrollMovementsCSV({ ...account, currency: "GBP" }, []));
  assert.throws(() => bankroll.bankrollMovementsCSV({ ...account, created_at: null }, []));
});

test("CSV neutraliza fórmulas de notas e IDs y desempata por ID en la misma fecha", () => {
  assert.equal(typeof bankroll.bankrollMovementsCSV, "function");
  const entries = [
    { ...movements[1], id: "z", note: " \t+SUM(A1)" },
    { ...movements[1], id: "a", note: "@SUM(A1)" }
  ];
  const csv = bankroll.bankrollMovementsCSV(account, entries);
  assert.ok(csv.indexOf('"a",') < csv.indexOf('"z",'));
  assert.ok(csv.includes('"\'@SUM(A1)"'));
  assert.ok(csv.includes('"\' \t+SUM(A1)"'));
  assert.ok(bankroll.bankrollMovementsCSV(account, [{ ...movements[1], id: "=formula" }]).includes('"\'=formula",'));
});
