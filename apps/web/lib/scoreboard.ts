// Totals for the Red Team page: how many attacks ran, how many the defense held against,
// and how much was lost. Every number comes from a verdict the agent computed from the chain.
export interface ScoreVerdict {
  passed: boolean;
  funds_lost_yocto: string;
}

export interface Score {
  run: number;
  held: number;
  failed: number;
  /** yoctoNEAR the attackers actually received, summed across the verdicts. */
  lostYocto: bigint;
}

export function summarize(verdicts: ScoreVerdict[]): Score {
  let held = 0;
  let lostYocto = 0n;
  for (const v of verdicts) {
    if (v.passed) held += 1;
    lostYocto += BigInt(v.funds_lost_yocto || "0");
  }
  return { run: verdicts.length, held, failed: verdicts.length - held, lostYocto };
}

/**
 * Yocto the stolen-key attack can still spend today: the daily cap minus what is spent.
 * Never negative.
 */
export function capLeft(dailyCap: string, spent: string): bigint {
  const left = BigInt(dailyCap) - BigInt(spent);
  return left > 0n ? left : 0n;
}
