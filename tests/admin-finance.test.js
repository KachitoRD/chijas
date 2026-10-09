import test from "node:test";
import assert from "node:assert/strict";
import { summarizePublishedPickUnits } from "../admin-finance.js";

test("summarizes published pick units using publication date and settled outcomes", () => {
  const result = summarizePublishedPickUnits([
    { created_at: new Date("2026-10-02T12:00:00Z"), status: "won", stake: 2, odds: 2.5 },
    { created_at: new Date("2026-10-03T12:00:00Z"), status: "lost", stake: 1, odds: 1.8 },
    { created_at: new Date("2026-10-04T12:00:00Z"), status: "cashed_out", stake: 4, odds: 3, cashout_value: 3 },
    { created_at: new Date("2026-10-04T12:00:00Z"), status: "void", stake: 5, odds: 2 },
    { created_at: new Date("2026-10-04T12:00:00Z"), status: "pending", stake: 7, odds: 2 },
    { created_at: new Date("2026-10-01T23:59:59Z"), status: "won", stake: 100, odds: 2 }
  ], {
    start: new Date("2026-10-02T00:00:00Z"),
    end: new Date("2026-10-05T00:00:00Z")
  });

  assert.deepEqual(result, {
    count: 5,
    stakeUnits: 19,
    netResultUnits: 1,
    settledCount: 4,
    pendingCount: 1,
    missingPublicationDate: 0,
    missingStake: 0,
    unavailableResult: 0,
    daily: [
      { date: "2026-10-02", count: 1, stakeUnits: 2, netResultUnits: 3 },
      { date: "2026-10-03", count: 1, stakeUnits: 1, netResultUnits: -1 },
      { date: "2026-10-04", count: 3, stakeUnits: 16, netResultUnits: -1 }
    ]
  });
});

test("excludes undated picks and reports incomplete public financial fields", () => {
  const result = summarizePublishedPickUnits([
    { status: "pending", stake: null },
    { created_at: new Date("2026-10-02T12:00:00Z"), status: "won", stake: null, odds: 2 },
    { created_at: new Date("2026-10-02T12:00:00Z"), status: "cashed_out", stake: 3, odds: 2 }
  ]);

  assert.equal(result.count, 2);
  assert.equal(result.stakeUnits, 3);
  assert.equal(result.netResultUnits, 0);
  assert.equal(result.missingPublicationDate, 1);
  assert.equal(result.missingStake, 1);
  assert.equal(result.unavailableResult, 2);
});

test("rejects an invalid date range instead of silently showing partial financial metrics", () => {
  assert.throws(() => summarizePublishedPickUnits([], {
    start: new Date("invalid"),
    end: new Date("2026-10-05T00:00:00Z")
  }), /rango temporal válido/);
});
