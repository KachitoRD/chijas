import test from "node:test";
import assert from "node:assert/strict";
import { groupPicksByTipster } from "../admin-dashboard-models.js";

test("groupPicksByTipster indexes each public pick once and retains tipster order", () => {
  const first = { id: "p1", user_id: "tipster-a" };
  const second = { id: "p2", user_id: "tipster-b" };
  const third = { id: "p3", user_id: "tipster-a" };
  const index = groupPicksByTipster([first, second, third, { id: "orphan" }]);

  assert.deepEqual(index.get("tipster-a"), [first, third]);
  assert.deepEqual(index.get("tipster-b"), [second]);
  assert.equal(index.has(undefined), false);
  assert.equal([...index.values()].reduce((count, picks) => count + picks.length, 0), 3);
});

test("groupPicksByTipster handles an empty public-pick collection", () => {
  assert.deepEqual(groupPicksByTipster([]), new Map());
});
