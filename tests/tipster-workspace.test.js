import { test } from "node:test";
import assert from "node:assert/strict";
import { filterTipsterHistory } from "../tipster-workspace.js";

const picks = [
  { id: "future", event: "Clásico", selection: "Goles", league: "Liga", market: "Total", status: "pending", event_date: new Date(3000) },
  { id: "started", event: "Final", status: "pending", event_date: { toDate: () => new Date(1000) } },
  { id: "closed", event: "Final", status: "won", event_date: new Date(1000) }
];
const inOBS = pick => pick.id === "closed";
test("atajos distinguen pendientes, pendientes iniciados, cerrados y OBS sin mutar datos", () => {
  const options = { now: 2000, inOBS };
  assert.deepEqual(filterTipsterHistory(picks, { ...options, mode: "pending" }).map(p => p.id), ["future", "started"]);
  assert.deepEqual(filterTipsterHistory(picks, { ...options, mode: "needs-result" }).map(p => p.id), ["started"]);
  assert.deepEqual(filterTipsterHistory(picks, { ...options, mode: "closed" }).map(p => p.id), ["closed"]);
  assert.deepEqual(filterTipsterHistory(picks, { ...options, mode: "obs" }).map(p => p.id), ["closed"]);
  assert.equal(picks.length, 3);
});
test("búsqueda ignora tildes/mayúsculas y combina evento, selección, liga y mercado", () => {
  assert.deepEqual(filterTipsterHistory(picks, { search: " CLASICO " }).map(p => p.id), ["future"]);
  assert.deepEqual(filterTipsterHistory(picks, { search: "goles liga" }).map(p => p.id), ["future"]);
  assert.deepEqual(filterTipsterHistory(picks, { mode: "pending", search: "final" }).map(p => p.id), ["started"]);
  assert.deepEqual(filterTipsterHistory(picks, { search: "ausente" }), []);
});
test("bandeja de resultados excluye fechas ausentes e inválidas", () => {
  assert.deepEqual(filterTipsterHistory([{ status: "pending" }, { status: "pending", event_date: "invalid" }], { mode: "needs-result" }), []);
});
