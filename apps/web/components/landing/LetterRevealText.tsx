"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import {
  computeLetterStyle,
  getLetterProgress,
  RGB,
} from '@/lib/glowMath';

export interface WordChar {
  char: string;
  isHighlight?: boolean;
}

export interface TextToken {
  type: 'word' | 'space' | 'br';
  text?: string;
  isHighlight?: boolean;
  chars?: WordChar[];
  className?: string;
}

interface LetterRevealTextProps {
  tokens: TextToken[];
  progress: number;
  spread: number;
  ghostRgb: RGB;
  accentRgb: RGB;
  finalRgb: RGB;
  className?: string;
}

export const LetterRevealText: React.FC<LetterRevealTextProps> = ({
  tokens,
  progress,
  spread,
  ghostRgb,
  accentRgb,
  finalRgb,
  className = '',
}) => {
  // Count total characters across all words
  const totalChars = useMemo(() => {
    let count = 0;
    for (const token of tokens) {
      if (token.type === 'word') {
        if (token.chars) {
          count += token.chars.length;
        } else if (token.text) {
          count += token.text.length;
        }
      }
    }
    return count;
  }, [tokens]);

  let globalCharIndex = 0;

  return (
    <span className={className}>
      {tokens.map((token, tokenIdx) => {
        if (token.type === 'br') {
          return (
            <React.Fragment key={`br-${tokenIdx}`}>
              <br className={token.className} />{' '}
            </React.Fragment>
          );
        }
        if (token.type === 'space') {
          return ' ';
        }
        if (token.type === 'word') {
          const charList: WordChar[] = token.chars
            ? token.chars
            : (token.text || '').split('').map((c) => ({
                char: c,
                isHighlight: !!token.isHighlight,
              }));

          return (
            <span key={`word-${tokenIdx}`} className="reveal-word">
              {charList.map((item, charIdx) => {
                const charI = globalCharIndex++;
                const t = getLetterProgress(progress, charI, totalChars, spread);
                const style = computeLetterStyle(t, !!item.isHighlight, ghostRgb, accentRgb, finalRgb);

                return (
                  <span
                    key={`c-${charIdx}`}
                    className={`reveal-char ${item.isHighlight ? 'hl' : ''}`}
                    style={{
                      opacity: style.opacity,
                      color: style.color,
                      filter: style.blur > 0.05 ? `blur(${style.blur.toFixed(2)}px)` : 'none',
                    }}
                  >
                    {item.char}
                  </span>
                );
              })}
            </span>
          );
        }
        return null;
      })}
    </span>
  );
};

/**
 * Build reveal tokens from plain text, one string per line. Wrap a part of a word in *asterisks*
 * to highlight it, e.g. "Even if your AI is *tricked*,".
 */
export function tokensFromLines(lines: string[]): TextToken[] {
  const tokens: TextToken[] = [];
  lines.forEach((line, li) => {
    if (li > 0) tokens.push({ type: 'br' });
    line.split(' ').forEach((word, wi) => {
      if (wi > 0) tokens.push({ type: 'space' });
      if (!word.includes('*')) {
        tokens.push({ type: 'word', text: word });
        return;
      }
      const chars: WordChar[] = [];
      for (const m of word.matchAll(/\*([^*]+)\*|([^*]+)/g)) {
        const highlighted = m[1] !== undefined;
        for (const char of m[1] ?? m[2]) chars.push({ char, isHighlight: highlighted });
      }
      tokens.push({ type: 'word', chars });
    });
  });
  return tokens;
}
