import assert from "node:assert/strict";
import { test } from "node:test";
import { capLeft, summarize } from "./scoreboard.ts";

test("no verdicts means nothing run and nothing lost", () => {
  assert.deepEqual(summarize([]), { run: 0, held: 0, failed: 0, lostYocto: 0n });
});

test("held and failed defenses are counted and losses are summed", () => {
  const score = summarize([
    { passed: true, funds_lost_yocto: "0" },
    { passed: true, funds_lost_yocto: "0" },
    { passed: false, funds_lost_yocto: "1500000000000000000000000" },
  ]);
  assert.equal(score.run, 3);
  assert.equal(score.held, 2);
  assert.equal(score.failed, 1);
  assert.equal(score.lostYocto, 1500000000000000000000000n);
});

test("a missing loss figure counts as zero", () => {
  assert.equal(summarize([{ passed: true, funds_lost_yocto: "" }]).lostYocto, 0n);
});

test("cap left is the daily cap minus spend and never negative", () => {
  assert.equal(capLeft("2000", "500"), 1500n);
  assert.equal(capLeft("2000", "2000"), 0n);
  assert.equal(capLeft("2000", "2500"), 0n);
});
