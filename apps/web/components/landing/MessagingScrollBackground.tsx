"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { yoctoToNear, type Activity } from '@leash/shared';
import { clamp, lerp } from '@/lib/glowMath';
import { VAULT_ID } from '@/lib/config';

interface MessageItem {
  id: string;
  sender: string;
  role: 'dispatcher' | 'ai' | 'pilot' | 'system' | 'audio';
  avatar: string;
  content: string;
  meta: string;
  side: 'left' | 'right';
  baseY: number; // relative position along scroll
  depth: number; // 0.8 to 1.2
  audioDuration?: string;
}

// Where each card sits along the scroll (the template's layout). Content comes from the chain.
const SLOTS: Array<Pick<MessageItem, 'side' | 'baseY' | 'depth'>> = [
  { side: 'left', baseY: 0.8, depth: 1.0 },
  { side: 'right', baseY: 1.3, depth: 1.15 },
  { side: 'left', baseY: 2.1, depth: 0.95 },
  { side: 'right', baseY: 2.9, depth: 1.05 },
  { side: 'left', baseY: 3.7, depth: 1.0 },
  { side: 'right', baseY: 4.5, depth: 1.1 },
  { side: 'left', baseY: 5.3, depth: 0.9 },
];

const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;
const when = (ts: string) =>
  new Date(Number(BigInt(ts) / 1_000_000n)).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Turn one on-chain vault event into a card. */
function toMessage(a: Activity, i: number, tx: string | null): MessageItem {
  const slot = SLOTS[i];
  const txNote = tx ? ` · tx ${tx.slice(0, 6)}…${tx.slice(-4)}` : '';
  const amount = a.amount ? `${yoctoToNear(a.amount)} NEAR` : '';
  const base = { id: `${a.ts}-${i}`, ...slot };
  switch (a.kind) {
    case 'spend':
      return {
        ...base,
        sender: 'Agent payment approved',
        role: 'ai',
        avatar: '✅',
        content: `Paid ${amount} to ${a.payee}.${a.memo ? ` "${a.memo}"` : ''}`,
        meta: `${when(a.ts)} · nonce ${a.nonce ?? '?'}${txNote}${a.receipt_hash ? ` · receipt ${short(a.receipt_hash)}` : ''}`,
      };
    case 'rejected':
      return {
        ...base,
        sender: 'Vault blocked a payment',
        role: 'system',
        avatar: '🛑',
        content: `Refused ${amount} to ${a.payee}: ${a.reason ?? 'policy violation'}.`,
        meta: `${when(a.ts)} · rejected on-chain${txNote}`,
      };
    default: {
      const labels: Record<string, [string, string, string]> = {
        policy_set: ['🧭', 'Owner updated the policy', 'New caps and allowlist are now enforced by the vault.'],
        paused: ['⏸️', 'Owner paused the vault', 'Kill switch: every agent payment is refused until unpaused.'],
        unpaused: ['▶️', 'Owner unpaused the vault', 'Agent payments are allowed again, within the policy.'],
        agent_key_rotated: ['🔁', 'Agent key rotated', 'A fresh function-call key that can only call agent_spend.'],
        agent_key_revoked: ['🔑', 'Agent key revoked', 'The old agent key no longer works on NEAR.'],
        withdraw: ['🏦', 'Owner withdrew funds', `${amount} moved back to the owner.`],
      };
      const [avatar, sender, content] = labels[a.kind] ?? ['•', a.kind, ''];
      return { ...base, sender, role: 'dispatcher', avatar, content, meta: `${when(a.ts)} · owner action${txNote}` };
    }
  }
}

interface MessagingScrollBackgroundProps {
  scrollY: number;
  /** Recent vault events, newest first. */
  activity: Activity[];
  txHashes: Array<string | null>;
}

export const MessagingScrollBackground: React.FC<MessagingScrollBackgroundProps> = ({ scrollY, activity, txHashes }) => {
  const messages = activity.slice(0, SLOTS.length).map((a, i) => toMessage(a, i, txHashes[i] ?? null));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Background kinetic canvas for high-fps particles and glowing cyber packet lines
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const onResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    // Particle nodes representing network messages
    const nodes = Array.from({ length: 36 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      size: Math.random() * 2 + 1,
      color: Math.random() > 0.4 ? 'rgba(56, 189, 248, 0.45)' : 'rgba(255, 255, 255, 0.35)',
    }));

    const render = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      // Subtle cyber grid
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.04)';
      ctx.lineWidth = 1;
      const gridSize = 80;
      const offsetX = (time * 0.01) % gridSize;
      const offsetY = (scrollY * 0.2) % gridSize;

      for (let x = -gridSize; x < width + gridSize; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x + offsetX, 0);
        ctx.lineTo(x + offsetX, height);
        ctx.stroke();
      }
      for (let y = -gridSize; y < height + gridSize; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y + offsetY);
        ctx.lineTo(width, y + offsetY);
        ctx.stroke();
      }

      // Draw floating nodes & connections
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0) n.x = width;
        if (n.x > width) n.x = 0;
        if (n.y < 0) n.y = height;
        if (n.y > height) n.y = 0;

        ctx.fillStyle = n.color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.size, 0, Math.PI * 2);
        ctx.fill();

        for (let j = i + 1; j < nodes.length; j++) {
          const n2 = nodes[j];
          const dx = n.x - n2.x;
          const dy = n.y - n2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.strokeStyle = `rgba(56, 189, 248, ${0.15 * (1 - dist / 120)})`;
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(n2.x, n2.y);
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
    };
  }, [scrollY]);

  const innerHeight = typeof window !== 'undefined' ? window.innerHeight : 900;
  const q = scrollY / (innerHeight || 1);

  return (
    <div className="messaging-bg" aria-hidden="true">
      {/* 4K Vector Particle Canvas */}
      <canvas ref={canvasRef} className="messaging-canvas" />

      {/* Floating 3D Message Cards configured to scrolling behavior */}
      <div className="messaging-track">
        {messages.map((msg) => {
          // Dynamic scroll calculation
          const relPos = q - msg.baseY;
          // Visible only when scrolling into statement slides (q >= 0.45)
          const isVisible = q >= 0.45 && relPos > -1.2 && relPos < 1.6;
          if (!isVisible) return null;

          const translateY = relPos * -260; // Parallax glide upward
          // Smooth fade in as user scrolls down from hero
          const entryFade = clamp((q - 0.45) / 0.35, 0, 1);
          const opacity = clamp(1 - Math.abs(relPos) * 0.75, 0, 1) * entryFade;
          const scale = clamp(1 - Math.abs(relPos) * 0.12, 0.85, 1.05) * msg.depth;
          const isAi = msg.role === 'ai';

          return (
            <div
              key={msg.id}
              className={`message-card ${msg.side} ${isAi ? 'ai-card' : ''}`}
              style={{
                transform: `translate3d(0, ${translateY.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`,
                opacity: opacity.toFixed(3),
                top: `${(msg.baseY * 60) % 75 + 12}%`,
              }}
            >
              {/* Header */}
              <div className="message-header">
                <span className={`message-avatar ${isAi ? 'ai-avatar' : ''}`}>
                  {msg.avatar}
                </span>
                <div className="message-sender-wrap">
                  <span className="message-sender">{msg.sender}</span>
                  <span className="message-meta">{msg.meta}</span>
                </div>
                {isAi && (
                  <span className="ai-badge">AGENT</span>
                )}
              </div>

              {/* Body */}
              <div className="message-body">
                {msg.role === 'audio' ? (
                  <div className="audio-bubble">
                    <button className="audio-play" aria-label="Play voice note">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                        <polygon points="2,1 10,6 2,11" />
                      </svg>
                    </button>
                    <div className="audio-wave">
                      {[40, 75, 55, 90, 60, 100, 45, 80, 65, 95, 30, 85, 50, 70].map((h, k) => (
                        <span
                          key={k}
                          className="wave-bar"
                          style={{
                            height: `${h}%`,
                            animationDelay: `${k * 0.08}s`,
                          }}
                        />
                      ))}
                    </div>
                    <span className="audio-time">{msg.audioDuration}</span>
                  </div>
                ) : null}
                <p className="message-text">{msg.content}</p>
              </div>

              {/* Status footer with cyber glow */}
              <div className="message-footer">
                <span className="live-dot" />
                <span className="encryption-label">Read live from {VAULT_ID}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
