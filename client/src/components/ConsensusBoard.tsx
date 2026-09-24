import React from 'react';
import { CandidateTitle } from '../types';
import { Award, ThumbsUp, CheckCircle, BarChart3 } from 'lucide-react';

interface ConsensusBoardProps {
  candidates: CandidateTitle[];
  totalVotes: number;
  onVoteCandidate: (candidateId: string) => Promise<any>;
}

export const ConsensusBoard: React.FC<ConsensusBoardProps> = ({
  candidates,
  totalVotes,
  onVoteCandidate,
}) => {
  return (
    <div className="bg-[#0e131b] border border-cyan-900/60 rounded-lg p-4 font-mono text-xs shadow-lg">
      <div className="flex items-center justify-between mb-3 border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-sm text-cyan-300">Hivemind Consensus Matrix</span>
        </div>
        <span className="text-[11px] text-zinc-500 font-mono">
          {totalVotes} Total Community Votes Cast
        </span>
      </div>

      {candidates.length === 0 ? (
        <div className="text-center py-6 text-zinc-500 text-xs font-mono">
          No candidate titles proposed yet. Be the first detective to stake a trial guess!
        </div>
      ) : (
        <div className="space-y-2.5">
          {candidates.map((cand, idx) => (
            <div
              key={cand.id || idx}
              className={`p-3 rounded border transition-all ${
                cand.isLeader
                  ? 'bg-cyan-950/30 border-cyan-500/80 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                  : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  {cand.isLeader && (
                    <span className="p-0.5 rounded bg-cyan-500 text-black">
                      <Award className="w-3.5 h-3.5" />
                    </span>
                  )}
                  <span className="font-bold text-sm text-white">
                    {cand.title}
                  </span>
                  {cand.year && (
                    <span className="text-[10px] text-zinc-400">({cand.year})</span>
                  )}
                  {cand.isLeader && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-700 font-bold">
                      CONSENSUS LEADER
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-bold text-sm text-cyan-300">
                    {cand.percentage}%
                  </span>
                  <button
                    onClick={() => onVoteCandidate(cand.id)}
                    className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-cyan-900/60 hover:text-cyan-300 text-zinc-300 border border-zinc-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Vote to agree with this candidate film"
                  >
                    <ThumbsUp className="w-3 h-3 text-cyan-400" />
                    <span>{cand.votes}</span>
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    cand.isLeader ? 'bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]' : 'bg-zinc-600'
                  }`}
                  style={{ width: `${cand.percentage}%` }}
                ></div>
              </div>

              {cand.notes && (
                <div className="text-[10px] text-zinc-500 mt-1.5">
                  {cand.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
