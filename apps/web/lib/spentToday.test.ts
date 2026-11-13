import assert from "node:assert/strict";
import { test } from "node:test";
import { spentToday } from "./spentToday.ts";

const DAY = 86_400_000;
const nov5 = Date.UTC(2026, 10, 5, 22, 0);
const status = { spent_today: "200000000000000000000000", day_index: String(Math.floor(nov5 / DAY)) };

test("same UTC day keeps the stored spend", () => {
  assert.equal(spentToday(status, nov5 + 60_000), status.spent_today);
});

test("a later day reads as nothing spent, as the contract will enforce", () => {
  assert.equal(spentToday(status, Date.UTC(2026, 10, 9, 10, 0)), "0");
});

test("the day turns at UTC midnight, not local midnight", () => {
  assert.equal(spentToday(status, Date.UTC(2026, 10, 5, 23, 59, 59)), status.spent_today);
  assert.equal(spentToday(status, Date.UTC(2026, 10, 6, 0, 0, 0)), "0");
});
