import type { VaultStatus } from "@ironrein/shared";

const MS_PER_DAY = 86_400_000;

/**
 * What the vault has really spent in the current UTC day. The contract only resets
 * `spent_today` when the next spend arrives, so after a quiet day the stored value is stale.
 * The contract's own check rolls the day first, so this matches what it will enforce.
 */
export function spentToday(status: Pick<VaultStatus, "spent_today" | "day_index">, nowMs = Date.now()): string {
  const today = Math.floor(nowMs / MS_PER_DAY);
  return Number(status.day_index) === today ? status.spent_today : "0";
}
