import React from 'react';
import { AnalyticsTelemetry } from '../types';
import { Activity, Radio, Cpu, Zap, CheckCircle2 } from 'lucide-react';

interface TelemetryHudProps {
  telemetry: AnalyticsTelemetry | null;
}

export const TelemetryHud: React.FC<TelemetryHudProps> = ({ telemetry }) => {
  if (!telemetry) return null;

  return (
    <div className="bg-[#0b0f14] border-b border-cyan-900/40 px-4 py-2 flex items-center justify-between text-[11px] font-mono text-zinc-400 overflow-x-auto whitespace-nowrap">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span>Active Solvers: <strong className="text-cyan-300">{telemetry.activeSolvers}</strong></span>
        </div>

        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-emerald-400" />
          <span>Radar Scanning: <strong className="text-emerald-300">{telemetry.radarDropsScanning} drops</strong></span>
        </div>

        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>Solve Velocity: <strong className="text-amber-300">{telemetry.solverVelocity} / min</strong></span>
        </div>

        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
          <span>Recognition Rate: <strong className="text-purple-300">{telemetry.recognitionRate}%</strong></span>
        </div>
      </div>

      <div className="hidden lg:flex items-center gap-2 text-zinc-500">
        <Cpu className="w-3.5 h-3.5" />
        <span>ENGINE: {telemetry.consensusEngineVersion} // STREAM LIVE</span>
      </div>
    </div>
  );
};
