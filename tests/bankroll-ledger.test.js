import test from "node:test";
import assert from "node:assert/strict";
import * as bankroll from "../bankroll.js";

const opened = new Date("2026-10-10T12:00:00Z");
const published = new Date("2026-10-10T13:00:00Z");
const account = { currency: "PEN", initialMinorUnits: 10000, created_at: opened };

test("apertura permite cero, exige moneda e importe decimal exacto", () => {
  assert.equal(typeof bankroll.parseBankrollOpening, "function");
  assert.equal(bankroll.parseBankrollOpening("0", "PEN"), 0);
  assert.equal(bankroll.parseBankrollOpening("0.29", "USD"), 29);
  for (const value of ["", "-1", "0.001", "Infinity", "1000000000.01"]) {
    assert.throws(() => bankroll.parseBankrollOpening(value, "PEN"));
  }
  assert.throws(() => bankroll.parseBankrollOpening("0", "GBP"));
});

test("saldo combina movimientos, ganancias cerradas y riesgo sin mezclar monedas", () => {
  assert.equal(typeof bankroll.bankrollAccountBalance, "function");
  const picks = [
    { id: "won", created_at: published, status: "won", odds: 2 },
    { id: "lost", created_at: published, status: "lost" },
    { id: "pending", created_at: published, status: "pending" },
    { id: "void", created_at: published, status: "void" },
    { id: "cash", created_at: published, status: "cashed_out" },
    { id: "usd", created_at: published, status: "won", odds: 5 }
  ];
  const records = new Map([
    ["won", { currency: "PEN", stakeMinorUnits: 2000 }],
    ["lost", { currency: "PEN", stakeMinorUnits: 500 }],
    ["pending", { currency: "PEN", stakeMinorUnits: 3000 }],
    ["void", { currency: "PEN", stakeMinorUnits: 800 }],
    ["cash", { currency: "PEN", stakeMinorUnits: 1000, returnMinorUnits: 700 }],
    ["usd", { currency: "USD", stakeMinorUnits: 10000 }]
  ]);
  assert.deepEqual(bankroll.bankrollAccountBalance(account, [
    { type: "deposit", amountMinorUnits: 5000 },
    { type: "withdrawal", amountMinorUnits: 1000 }
  ], picks, records), {
    deposits: 5000, withdrawals: 1000, profit: 1200, risk: 3000,
    equity: 15200, available: 12200, financialCount: 5, withoutAmount: 0
  });
});

test("excluye publicación anterior o igual a apertura; no depende de fecha de evento", () => {
  assert.equal(typeof bankroll.bankrollAccountBalance, "function");
  const picks = [
    { id: "old", created_at: new Date("2026-10-09"), status: "lost", event_date: published },
    { id: "same", created_at: opened, status: "lost" },
    { id: "new", created_at: published, status: "pending", event_date: new Date("2026-11-01") },
    { id: "no-money", created_at: published, status: "won", odds: 2 }
  ];
  const records = new Map(picks.map(pick => [pick.id, pick.id === "no-money" ? null : {
    currency: "PEN", stakeMinorUnits: 2000
  }]));
  assert.deepEqual(bankroll.bankrollAccountBalance(account, [], picks, records), {
    deposits: 0, withdrawals: 0, profit: 0, risk: 2000,
    equity: 10000, available: 8000, financialCount: 1, withoutAmount: 1
  });
});

test("no muestra saldo parcial cuando falta registro privado o hay datos inválidos", () => {
  assert.equal(typeof bankroll.bankrollAccountBalance, "function");
  const picks = [{ id: "pending", status: "pending", created_at: published }];
  assert.throws(() => bankroll.bankrollAccountBalance(account, [], picks, new Map()), /cargar/i);
  for (const movement of [
    { type: "deposit", amountMinorUnits: -1 },
    { type: "deposit", amountMinorUnits: 0.1 },
    { type: "transfer", amountMinorUnits: 1 }
  ]) assert.throws(() => bankroll.bankrollAccountBalance(account, [movement], [], new Map()));
  assert.throws(() => bankroll.bankrollAccountBalance({ ...account, initialMinorUnits: -1 }, [], [], new Map()));
  assert.throws(() => bankroll.bankrollAccountBalance(account, [], picks,
    new Map([["pending", { currency: "PEN", stakeMinorUnits: NaN }]])));
  assert.throws(() => bankroll.bankrollAccountBalance(account, [], [
    { id: "unknown", status: "won", odds: 2 }
  ], new Map()));
});

test("un retiro mayor al estimado conserva el saldo negativo sin inventar fondos", () => {
  assert.equal(typeof bankroll.bankrollAccountBalance, "function");
  const balance = bankroll.bankrollAccountBalance(account, [
    { type: "withdrawal", amountMinorUnits: 15000 }
  ], [], new Map());
  assert.equal(balance.equity, -5000);
  assert.equal(balance.available, -5000);
});
