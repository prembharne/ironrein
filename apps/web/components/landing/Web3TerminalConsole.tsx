"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Terminal, Shield, Cpu, Activity, CheckCircle2, ChevronRight, Lock, Database } from 'lucide-react';

interface LogEntry {
  id: number;
  time: string;
  source: string;
  type: 'proof' | 'consensus' | 'settlement' | 'enclave';
  message: string;
  hash: string;
}

interface Web3TerminalConsoleProps {
  scale?: number;
}

export const Web3TerminalConsole: React.FC<Web3TerminalConsoleProps> = ({ scale = 1.0 }) => {
  const [activeTab, setActiveTab] = useState<'pipeline' | 'validators' | 'security'>('pipeline');
  const [blockHeight, setBlockHeight] = useState(19482930);
  const [tps, setTps] = useState(4892);
  const [proofsVerified, setProofsVerified] = useState(384910);
  const [isVerifying, setIsVerifying] = useState(false);

  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 1,
      time: '11:22:01.842',
      source: 'ZK_PROVER',
      type: 'proof',
      message: 'Batch #84,218 state transition proved · 4,210 txs',
      hash: '0x9a8f...3c41',
    },
    {
      id: 2,
      time: '11:22:03.110',
      source: 'BFT_QUORUM',
      type: 'consensus',
      message: 'Threshold signature aggregate (67/67 validators)',
      hash: '0x71e2...90ab',
    },
    {
      id: 3,
      time: '11:22:04.920',
      source: 'L1_SETTLE',
      type: 'settlement',
      message: 'Merkle state commitment finalized on Ethereum L1',
      hash: '0x3f5d...82c0',
    },
    {
      id: 4,
      time: '11:22:06.405',
      source: 'ENCLAVE_SGX',
      type: 'enclave',
      message: 'Hardware enclave integrity attested · Quote verified',
      hash: '0x12b4...ee98',
    },
  ]);

  // Live log stream
  useEffect(() => {
    const templates = [
      {
        source: 'ZK_PROVER',
        type: 'proof' as const,
        msg: (h: number) => `STARK proof batch #${h.toLocaleString()} verified in 128ms`,
      },
      {
        source: 'CONSENSUS',
        type: 'consensus' as const,
        msg: () => 'Ed25519 multi-signature validated across 128 nodes',
      },
      {
        source: 'L1_BRIDGE',
        type: 'settlement' as const,
        msg: () => 'Rollup state root committed to contract 0xHaldenCore',
      },
      {
        source: 'MPC_VAULT',
        type: 'enclave' as const,
        msg: () => 'Zero-knowledge manifest verification complete · SLA 99.999%',
      },
    ];

    const interval = setInterval(() => {
      setBlockHeight((prev) => {
        const next = prev + 1;
        setProofsVerified((p) => p + Math.floor(Math.random() * 20) + 10);
        setTps(4800 + Math.floor(Math.random() * 280));

        const tmpl = templates[Math.floor(Math.random() * templates.length)];
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now
          .getMinutes()
          .toString()
          .padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now
          .getMilliseconds()
          .toString()
          .padStart(3, '0')}`;
        const hex = '0x' + Math.random().toString(16).substring(2, 6) + '...' + Math.random().toString(16).substring(2, 6);

        setLogs((prevLogs) => [
          ...prevLogs.slice(-5),
          {
            id: Date.now(),
            time: timeStr,
            source: tmpl.source,
            type: tmpl.type,
            message: tmpl.msg(next),
            hash: hex,
          },
        ]);
        return next;
      });
    }, 2400);

    return () => clearInterval(interval);
  }, []);

  const triggerVerification = () => {
    setIsVerifying(true);
    setTimeout(() => {
      setIsVerifying(false);
      setProofsVerified((p) => p + 100);
      setBlockHeight((b) => b + 1);
    }, 900);
  };

  return (
    <div
      className="web3-terminal w-full h-full relative overflow-hidden flex flex-col justify-between p-6 select-none rounded-2xl border border-white/10 shadow-2xl"
      style={{
        background: 'linear-gradient(145deg, #0d121f 0%, #060810 100%)',
        transform: `scale(${scale})`,
        transformOrigin: '50% 50%',
        transition: 'transform 0.1s linear',
      }}
    >
      {/* Top Header & Architecture Selector */}
      <div className="border-b border-white/10 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold text-sm tracking-wide">
                  HALDEN ZERO-KNOWLEDGE INFRASTRUCTURE
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                  MAINNET VERIFIED
                </span>
              </div>
              <p className="text-white/40 text-xs font-mono">
                Decentralized State Pipeline · Institutional SLA 99.999%
              </p>
            </div>
          </div>

          {/* Architecture Tabs */}
          <div className="flex items-center bg-white/5 border border-white/10 rounded-lg p-0.5 text-xs font-mono">
            <button
              onClick={() => setActiveTab('pipeline')}
              className={`px-3 py-1.5 rounded transition-all cursor-pointer ${
                activeTab === 'pipeline'
                  ? 'bg-white/15 text-white font-medium shadow-sm'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              ZK Pipeline
            </button>
            <button
              onClick={() => setActiveTab('validators')}
              className={`px-3 py-1.5 rounded transition-all cursor-pointer ${
                activeTab === 'validators'
                  ? 'bg-white/15 text-white font-medium shadow-sm'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              Validators
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`px-3 py-1.5 rounded transition-all cursor-pointer ${
                activeTab === 'security'
                  ? 'bg-white/15 text-white font-medium shadow-sm'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              Enclave Security
            </button>
          </div>
        </div>
      </div>

      {/* Main Terminal Viewport */}
      <div className="my-4 flex-1 flex flex-col justify-between">
        {activeTab === 'pipeline' && (
          <div className="space-y-4">
            {/* Real-time Telemetry Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-white/5 border border-white/10 font-mono">
                <div className="text-white/40 text-[10px]">VERIFIED PROOFS</div>
                <div className="text-emerald-400 font-bold text-base mt-0.5">
                  {proofsVerified.toLocaleString()}
                </div>
                <div className="text-[10px] text-white/50 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>100% Validated</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-white/5 border border-white/10 font-mono">
                <div className="text-white/40 text-[10px]">SETTLEMENT FINALITY</div>
                <div className="text-cyan-300 font-bold text-base mt-0.5">240 ms</div>
                <div className="text-[10px] text-white/50 mt-1">Sub-second L1 Sync</div>
              </div>

              <div className="p-3 rounded-lg bg-white/5 border border-white/10 font-mono">
                <div className="text-white/40 text-[10px]">NETWORK THROUGHPUT</div>
                <div className="text-indigo-300 font-bold text-base mt-0.5">
                  {tps.toLocaleString()} TPS
                </div>
                <div className="text-[10px] text-white/50 mt-1">Zero Congestion</div>
              </div>

              <div className="p-3 rounded-lg bg-white/5 border border-white/10 font-mono">
                <div className="text-white/40 text-[10px]">ACTIVE QUORUM</div>
                <div className="text-white font-bold text-base mt-0.5">128 / 128</div>
                <div className="text-[10px] text-emerald-400 mt-1">BFT Supermajority</div>
              </div>
            </div>

            {/* Cryptographic Execution Stream Console */}
            <div className="rounded-lg bg-[#070913] border border-white/10 p-3 font-mono text-xs overflow-hidden">
              <div className="flex items-center justify-between pb-2 border-b border-white/10 text-[11px] text-white/50">
                <span className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                  <span>TRANSACTION VERIFICATION STREAM</span>
                </span>
                <span className="text-emerald-400 font-medium">LIVE STREAMING</span>
              </div>

              <div className="mt-2.5 space-y-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start justify-between gap-3 text-[11px] hover:bg-white/5 p-1 rounded transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-white/30 text-[10px]">{log.time}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${
                          log.type === 'proof'
                            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                            : log.type === 'consensus'
                            ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
                            : log.type === 'settlement'
                            ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                            : 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                        }`}
                      >
                        {log.source}
                      </span>
                      <span className="text-white/80 truncate">{log.message}</span>
                    </div>
                    <span className="text-white/40 font-mono text-[10px] shrink-0">
                      {log.hash}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'validators' && (
          <div className="p-4 rounded-lg bg-[#070913] border border-white/10 font-mono text-xs space-y-4">
            <div className="flex justify-between items-center text-white/70">
              <span className="font-semibold text-white">INSTITUTIONAL VALIDATOR CLUSTER</span>
              <span className="text-emerald-400">All 128 Nodes Online</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div className="p-3 bg-white/5 rounded border border-white/5">
                <div className="text-white/40">CONSENSUS CLIENT</div>
                <div className="text-white font-bold mt-1">Halden-Prysm v3.4.1</div>
                <div className="text-white/50 text-[10px] mt-0.5">Dual-homed fiber interconnect</div>
              </div>
              <div className="p-3 bg-white/5 rounded border border-white/5">
                <div className="text-white/40">SIGNING LATENCY</div>
                <div className="text-cyan-300 font-bold mt-1">11.4 ms (P99.9)</div>
                <div className="text-white/50 text-[10px] mt-0.5">Threshold ed25519 MPC</div>
              </div>
            </div>
            <div className="p-3 bg-white/5 rounded border border-white/5">
              <div className="flex justify-between text-[11px] mb-1.5">
                <span className="text-white/60">Epoch Consensus Progress</span>
                <span className="text-emerald-400 font-bold">100% Attested</span>
              </div>
              <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-400 h-full w-full" />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="p-4 rounded-lg bg-[#070913] border border-white/10 font-mono text-xs space-y-3">
            <div className="flex items-center gap-2 text-white font-semibold">
              <Lock className="w-4 h-4 text-purple-400" />
              <span>HARDWARE-ENCLAVE ATTESTATION (CONFIDENTIAL COMPUTING)</span>
            </div>
            <p className="text-white/60 text-[11px] leading-relaxed">
              Every maritime manifest, customs declaration, and port dispatch contract is verified inside
              isolated hardware enclaves with cryptographically verifiable proofs.
            </p>
            <div className="grid grid-cols-3 gap-2 pt-2 text-[10px]">
              <div className="p-2 bg-white/5 rounded border border-white/10">
                <div className="text-white/40">ENCLAVE TYPE</div>
                <div className="text-purple-300 font-bold mt-0.5">AWS Nitro / SGX</div>
              </div>
              <div className="p-2 bg-white/5 rounded border border-white/10">
                <div className="text-white/40">TAMPER DETECTION</div>
                <div className="text-emerald-400 font-bold mt-0.5">Zero Breaches</div>
              </div>
              <div className="p-2 bg-white/5 rounded border border-white/10">
                <div className="text-white/40">REMOTE AUDIT</div>
                <div className="text-cyan-300 font-bold mt-0.5">Real-time Verified</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Metrics & Action Bar */}
      <div className="border-t border-white/10 pt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs font-mono">
          <div>
            <div className="text-white/40 text-[10px]">CURRENT BLOCK</div>
            <div className="text-white font-bold text-sm tracking-wide">
              #{blockHeight.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-white/40 text-[10px]">NETWORK HEALTH</div>
            <div className="text-emerald-400 font-bold text-sm flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>100.0% OPTIMAL</span>
            </div>
          </div>
        </div>

        <button
          onClick={triggerVerification}
          disabled={isVerifying}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-medium transition-all cursor-pointer shadow-lg shadow-emerald-500/10 disabled:opacity-50"
        >
          <Activity className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
          <span>{isVerifying ? 'Verifying ZK Proof...' : 'Verify Cryptographic State'}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
