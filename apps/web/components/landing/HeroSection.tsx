"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Button } from './Button';
import { LogosGrid } from './LogosGrid';
import { LetterRevealText, TextToken, tokensFromLines } from './LetterRevealText';
import { RGB } from '@/lib/glowMath';

const HERO_TOKENS: TextToken[] = tokensFromLines([
  'Even if your AI is *tricked*,',
  'your money stays safe',
]);

const GHOST_SLATE: RGB = [95, 105, 130];
const ACCENT_GLACIER: RGB = [56, 189, 248]; // #38bdf8 soft glacier cyan
const FINAL_WHITE: RGB = [255, 255, 255];   // bright white text for dark bowl

export const HeroSection: React.FC<{ trust: string }> = ({ trust }) => {
  const [headlineProgress, setHeadlineProgress] = useState(0);

  useEffect(() => {
    let animId: number;
    const duration = 1250; // 1.25s
    let startTime: number | null = null;

    const tick = (now: number) => {
      if (startTime === null) startTime = now;
      const elapsed = now - startTime;
      const p = Math.min(1, elapsed / duration);
      setHeadlineProgress(p);
      if (p < 1) {
        animId = requestAnimationFrame(tick);
      }
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <section className="hero" id="hero" aria-label="Introduction">
      <h1 id="h1">
        <LetterRevealText
          tokens={HERO_TOKENS}
          progress={headlineProgress}
          spread={0.35}
          ghostRgb={GHOST_SLATE}
          accentRgb={ACCENT_GLACIER}
          finalRgb={FINAL_WHITE}
        />
      </h1>

      <p className="trust fade-up" style={{ ['--d' as string]: '1.15s' }}>
        {trust}
      </p>

      <div className="hero-cta fade-up" style={{ ['--d' as string]: '1.3s' }}>
        <Button label="Run Red Team" href="/redteam" isLarge />
      </div>

      <LogosGrid />
    </section>
  );
};
