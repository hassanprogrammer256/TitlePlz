import React, { useState } from 'react';
import { MysteryDrop, User, UserGuessTrial } from '../types';
import {
  Send,
  AlertCircle,
  CheckCircle2,
  Lock,
  Coins,
  ShieldAlert,
  Award,
  Sparkles,
  RefreshCw,
} from 'lucide-react';

interface GuessSubmissionFormProps {
  drop: MysteryDrop;
  currentUser: User | null;
  onGuessSubmit: (title: string) => Promise<any>;
  onOpenCreditsModal: () => void;
  onOpenAuth: () => void;
}

export const GuessSubmissionForm: React.FC<GuessSubmissionFormProps> = ({
  drop,
  currentUser,
  onGuessSubmit,
  onOpenCreditsModal,
  onOpenAuth,
}) => {
  const [guessTitle, setGuessTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'already_guessed';
    message: string;
    reward?: number;
    pointsDelta?: number;
  } | null>(null);

  // Check if current user already attempted a guess on this drop (One trial allowed)
  const existingTrial: UserGuessTrial | undefined =
    currentUser && drop.userTrials ? drop.userTrials[currentUser.id] : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onOpenAuth();
      return;
    }

    if (existingTrial) {
      setFeedback({
        type: 'already_guessed',
        message: 'Strict single trial rule: You have already used your 1 trial attempt on this mystery clip.',
      });
      return;
    }

    if (currentUser.credits < 20) {
      setFeedback({
        type: 'error',
        message: 'Insufficient credits: $20 required to stake a guess trial.',
      });
      return;
    }

    const cleanTitle = guessTitle.trim();
    if (!cleanTitle) return;

    try {
      setIsSubmitting(true);
      setFeedback(null);
      const res = await onGuessSubmit(cleanTitle);

      if (res.isCorrect) {
        setFeedback({
          type: 'success',
          message: `🎯 CORRECT! You identified "${cleanTitle}"! Won +$${res.rewardAwarded} ($20 stake refund + $${drop.bountyPts} bounty) and +5 points!`,
          reward: res.rewardAwarded,
          pointsDelta: 5,
        });
      } else {
        setFeedback({
          type: 'error',
          message: `❌ INCORRECT: "${cleanTitle}" does not match. -$20 wager deducted, -3 points on leaderboard.`,
          pointsDelta: -3,
        });
      }
      setGuessTitle('');
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to submit trial guess.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-[#0e131b] border border-cyan-900/60 rounded-lg p-4 font-mono text-xs shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-sm text-cyan-300">Submit Single Film Title Trial</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-950/80 border border-amber-500/40 text-amber-300 text-[11px]">
          <Coins className="w-3.5 h-3.5 text-amber-400" />
          <span>Wager Fee: $20 / Attempt</span>
        </div>
      </div>

      <p className="text-zinc-400 text-[11px] mb-3 leading-relaxed">
        <strong className="text-zinc-200">Reconnaissance Rule:</strong> Each detective has strictly{' '}
        <span className="text-cyan-300 underline font-bold">ONE TRIAL</span> per mystery drop. If correct, you receive both your{' '}
        <span className="text-emerald-400 font-bold">$20 stake + ${drop.bountyPts} bounty pot</span> and{' '}
        <span className="text-emerald-400 font-bold">+5 MovieKing points</span>. If wrong, you lose the $20 stake and{' '}
        <span className="text-red-400 font-bold">-3 points</span> are deducted.
      </p>

      {/* Trial status banner if already attempted */}
      {existingTrial ? (
        <div
          className={`p-3 rounded border mb-3 flex items-start gap-2.5 ${
            existingTrial.isCorrect
              ? 'bg-emerald-950/50 border-emerald-500/80 text-emerald-300'
              : 'bg-zinc-900 border-zinc-700 text-zinc-300'
          }`}
        >
          {existingTrial.isCorrect ? (
            <Award className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <div className="font-bold flex items-center justify-between text-xs mb-1">
              <span>Your Single Trial Attempt is Recorded</span>
              <span
                className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                  existingTrial.isCorrect ? 'bg-emerald-500 text-black' : 'bg-red-950 text-red-400 border border-red-800'
                }`}
              >
                {existingTrial.isCorrect ? 'SOLVED' : 'TRIAL EXHAUSTED'}
              </span>
            </div>
            <div className="text-[11px] text-zinc-400">
              Guessed Title: <strong className="text-white">"{existingTrial.guessedTitle}"</strong>
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              Outcome:{' '}
              {existingTrial.isCorrect ? (
                <span className="text-emerald-400 font-bold">
                  Correct (+${existingTrial.rewardAwarded} credits won, +5 pts)
                </span>
              ) : (
                <span className="text-red-400 font-bold">
                  Incorrect (-$20 wager deducted, -3 pts)
                </span>
              )}
            </div>
          </div>
        </div>
      ) : drop.status === 'solved' ? (
        <div className="p-3 rounded bg-emerald-950/40 border border-emerald-500/60 text-emerald-300 text-xs mb-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <div>
            <strong>Mystery Drop Solved!</strong> Bounty was claimed by{' '}
            <span className="font-bold text-white">{drop.solvedBy || 'another detective'}</span>.
          </div>
        </div>
      ) : drop.status === 'expired' ? (
        <div className="p-3 rounded bg-zinc-900 border border-zinc-700 text-zinc-400 text-xs mb-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-zinc-500 shrink-0" />
          <span>The betting window for this mystery drop has expired.</span>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={guessTitle}
              onChange={e => setGuessTitle(e.target.value)}
              placeholder="Enter exact movie title (e.g. Blade Runner 2049, The Conversation)..."
              disabled={isSubmitting}
              className="flex-1 bg-black/60 border border-cyan-800/80 rounded px-3 py-2 text-cyan-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-400 text-xs"
            />
            <button
              type="submit"
              disabled={isSubmitting || !guessTitle.trim()}
              className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_12px_rgba(6,182,212,0.3)]"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Stake $20 & Submit</span>
                </>
              )}
            </button>
          </div>

          <div className="flex items-center justify-between text-[10px] text-zinc-500">
            <span>
              Your Balance: <strong className="text-amber-300 font-mono">${currentUser?.credits || 0}</strong>
            </span>
            {currentUser && currentUser.credits < 20 && (
              <button
                type="button"
                onClick={onOpenCreditsModal}
                className="text-amber-400 hover:underline font-bold"
              >
                Refill or purchase credits &rarr;
              </button>
            )}
          </div>
        </form>
      )}

      {/* Feedback Toast */}
      {feedback && (
        <div
          className={`mt-3 p-2.5 rounded border text-xs flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300'
              : 'bg-red-950/60 border-red-500 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};
