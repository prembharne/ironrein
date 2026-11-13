"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { yoctoToNear, type Policy } from '@ironrein/shared';
import { LetterRevealText, TextToken, tokensFromLines } from './LetterRevealText';
import { RGB, SlideState } from '@/lib/glowMath';

const SLIDE_1_TOKENS: TextToken[] = tokensFromLines([
  'Ironrein is a vault contract on NEAR',
  "that holds your agent's money,",
  'checks every payment against your policy,',
  "and refuses anything you didn't allow",
]);

/** Slide 2 quotes the vault's live policy once it has loaded. */
function policySlide(policy: Policy | null): TextToken[] {
  if (!policy) {
    return tokensFromLines([
      'Built for agents that can be fooled,',
      'with a payee allowlist, a per-payment cap,',
      'a daily cap, an expiry and a reserve',
      'enforced on-chain, never by the model',
    ]);
  }
  const payees = policy.allowlist.length;
  const expiry =
    policy.expires_at === '0'
      ? 'no expiry'
      : `expiry on ${new Date(Number(BigInt(policy.expires_at) / 1_000_000n)).toLocaleDateString()}`;
  return tokensFromLines([
    'Right now this vault allows',
    `${payees} payee${payees === 1 ? '' : 's'}, at most *${yoctoToNear(policy.per_tx_cap)}* NEAR a payment`,
    `and *${yoctoToNear(policy.daily_cap)}* NEAR a day, with ${expiry},`,
    'enforced on-chain, never by the model',
  ]);
}

const SLIDE_3_TOKENS: TextToken[] = tokensFromLines([
  'The agent key is a function-call key',
  'that can only reach one method,',
  'so even a stolen key is bounded by your policy',
  'and revoked the moment you sign',
]);

const SLIDE_4_TOKENS: TextToken[] = tokensFromLines([
  'Every payment carries a hash of the',
  'TEE-signed inference behind it.',
  'Verify why the agent paid,',
  'long after the money has moved',
]);

const SLIDE_5_TOKENS: TextToken[] = tokensFromLines([
  'Prompt injection. A stolen key. Q-Day.',
  'Red Team Mode runs all three live',
  'and shows each one fail on-chain,',
  'while your ML-DSA key holds the kill switch',
]);

const ALL_SLIDES_TOKENS = [
  SLIDE_1_TOKENS,
  null, // live policy, built per render
  SLIDE_3_TOKENS,
  SLIDE_4_TOKENS,
  SLIDE_5_TOKENS,
];

const GHOST_SLATE: RGB = [70, 80, 105];
const ACCENT_GLACIER: RGB = [56, 189, 248]; // #38bdf8 soft glacier cyan
const FINAL_WHITE: RGB = [255, 255, 255];   // bright white text on greyish black

interface StatementSectionProps {
  slides: SlideState[];
  policy: Policy | null;
}

export const StatementSection: React.FC<StatementSectionProps> = ({ slides, policy }) => {
  const slide2 = useMemo(() => policySlide(policy), [policy]);
  return (
    <section className="statement" id="statement" aria-label="Statement Slides">
      <div className="pin">
        {slides.map((slide, i) => {
          if (!slide.isActive) return null;
          const tokens = (i === 1 ? slide2 : ALL_SLIDES_TOKENS[i]) ?? SLIDE_1_TOKENS;
          return (
            <div
              key={`slide-${i}`}
              className="stmt-slide"
              style={{
                opacity: slide.opacity,
                transform: `translateY(${slide.translateY.toFixed(1)}px)`,
                transition: 'opacity 0.12s ease-out',
              }}
            >
              <p id={i === 0 ? 'stmt' : undefined} className="stmt-text">
                <LetterRevealText
                  tokens={tokens}
                  progress={slide.revealP}
                  spread={0.16}
                  ghostRgb={GHOST_SLATE}
                  accentRgb={ACCENT_GLACIER}
                  finalRgb={FINAL_WHITE}
                />
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
};
