import test from "node:test";
import assert from "node:assert/strict";
import { normalizePick, summarizePerformance, canonicalPick } from "../pick-schema.js";

test("legacy adapter preserves dates/results without inventing public money or stake", () => {
  const legacy = {
    id: "old", user_id: "u", fecha_evento: new Date(), deporte: "futbol",
    evento: "A vs B", seleccion: "A", cuota: 2.5, estado: "cash_out", nota: "Análisis",
    casa_de_apuestas: "betano", stakeAmount: 100, returnMinorUnits: 7000
  };
  const pick = normalizePick(legacy);
  assert.equal(pick.status, "cashed_out");
  assert.equal(pick.event_date, legacy.fecha_evento);
  assert.equal(pick.odds, 2.5);
  assert.equal(pick.stake, null);
  assert.equal(pick.cashout_value, undefined);
  const write = canonicalPick(pick);
  for (const key of ["fecha_evento", "estado", "cuota", "deporte", "stakeAmount", "returnMinorUnits", "id"]) {
    assert.equal(Object.hasOwn(write, key), false);
  }
  assert.equal(legacy.estado, "cash_out");
});

test("cashout uses actual gross return and stake-weighted yield, not artificial wins", () => {
  const result = summarizePerformance([
    { status: "won", odds: 2, stake: 2 },
    { status: "lost", odds: 3, stake: 1 },
    { status: "cashed_out", odds: 4, stake: 4, cashout_value: 3 },
    { status: "cashed_out", odds: 2, stake: 2, cashout_odds: 1.5 },
    { status: "void", odds: 2, stake: 100 },
    { status: "pending", odds: 2, stake: 100 },
    { estado: "cash_out", cuota: 2 }
  ]);
  assert.equal(result.active, 1);
  assert.equal(result.winRate, 50);
  assert.equal(result.settledStake, 9);
  assert.equal(result.profit, 1);
  assert.equal(result.yield, 100 / 9);
  assert.equal(result.excludedFinancial, 1);
});

test("zero cashout is a full loss; incomplete data cannot masquerade as success", () => {
  assert.equal(summarizePerformance([{ status: "cashed_out", odds: 2, stake: 3, cashout_value: 0 }]).yield, -100);
  assert.throws(() => summarizePerformance([{ status: "cashed_out", odds: 2, stake: 3, cashout_odds: -1 }]));
  assert.throws(() => normalizePick({ status: "anything" }));
});
