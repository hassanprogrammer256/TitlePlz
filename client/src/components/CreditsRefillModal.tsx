import React, { useState, useEffect } from 'react';
import { User } from '../types';
import {
  Coins,
  Clock,
  Sparkles,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  X,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface CreditsRefillModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onClaimDailyRefill: () => Promise<void>;
  onPurchaseCredits: (amount: number, packageId: string) => Promise<void>;
}

export const CreditsRefillModal: React.FC<CreditsRefillModalProps> = ({
  isOpen,
  onClose,
  user,
  onClaimDailyRefill,
  onPurchaseCredits,
}) => {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [countdownText, setCountdownText] = useState<string>('');
  const [isEligibleForRefill, setIsEligibleForRefill] = useState<boolean>(false);

  useEffect(() => {
    if (!user) return;

    const checkRefill = () => {
      const now = Date.now();
      const last = user.lastDailyRefillAt || 0;
      const twentyFourHours = 24 * 3600 * 1000;
      const diff = now - last;

      if (diff >= twentyFourHours) {
        setIsEligibleForRefill(true);
        setCountdownText('Ready to claim now!');
      } else {
        setIsEligibleForRefill(false);
        const rem = twentyFourHours - diff;
        const hours = Math.floor(rem / (3600 * 1000));
        const mins = Math.floor((rem % (3600 * 1000)) / (60 * 1000));
        const secs = Math.floor((rem % (60 * 1000)) / 1000);
        setCountdownText(
          `${hours.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`
        );
      }
    };

    checkRefill();
    const timer = setInterval(checkRefill, 1000);
    return () => clearInterval(timer);
  }, [user?.lastDailyRefillAt]);

  if (!isOpen) return null;

  const handleClaim = async () => {
    try {
      setLoadingAction('refill');
      setErrorMessage(null);
      setSuccessMessage(null);
      await onClaimDailyRefill();
      setSuccessMessage('Successfully claimed your daily $20 credits refill!');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to claim daily refill.');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleBuy = async (amount: number, packageId: string) => {
    try {
      setLoadingAction(packageId);
      setErrorMessage(null);
      setSuccessMessage(null);
      await onPurchaseCredits(amount, packageId);
      setSuccessMessage(`Payment approved! +$${amount} credits loaded to your account.`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Payment simulation failed.');
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0e131b] border border-cyan-800/80 rounded-lg max-w-xl w-full p-6 text-zinc-200 shadow-2xl relative max-h-[90vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5 border-b border-zinc-800 pb-4 shrink-0">
          <div className="w-10 h-10 rounded bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-mono font-bold text-white tracking-wide flex items-center gap-2">
              <span>Recon Agent Credits Bank</span>
              <span className="text-xs px-2 py-0.5 rounded bg-amber-950 border border-amber-500/50 text-amber-400">
                Current: ${user?.credits || 0}
              </span>
            </h2>
            <p className="text-xs text-zinc-400 font-mono">
              Wager on film mystery titles, stake drop bounties, or claim daily rations.
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">

        {/* Status Alerts */}
        {successMessage && (
          <div className="mb-4 p-3 rounded bg-emerald-950/60 border border-emerald-500/80 text-emerald-300 font-mono text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 p-3 rounded bg-red-950/60 border border-red-500/80 text-red-300 font-mono text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Daily Refill Section */}
        <div className="p-4 rounded-lg bg-zinc-900/90 border border-zinc-700/80 mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span className="font-mono font-bold text-sm text-cyan-300">Daily 24-Hour Credit Refill</span>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
              +$20 Free / 24h
            </span>
          </div>
          <p className="text-xs text-zinc-400 mb-3">
            Every 24 hours, the reconnaissance agency dispenses $20 credits to ensure detectives can continue decoding mysterious film titles.
          </p>

          <div className="flex items-center justify-between bg-black/50 p-3 rounded border border-zinc-800">
            <div className="text-xs font-mono">
              <span className="text-zinc-500">Cooldown status: </span>
              <span className={`font-bold ${isEligibleForRefill ? 'text-emerald-400' : 'text-amber-400'}`}>
                {countdownText}
              </span>
            </div>
            <button
              onClick={handleClaim}
              disabled={!isEligibleForRefill || loadingAction === 'refill'}
              className={`px-4 py-1.5 rounded font-mono text-xs font-bold transition-all ${
                isEligibleForRefill
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-black shadow-[0_0_12px_rgba(16,185,129,0.4)] cursor-pointer'
                  : 'bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed'
              }`}
            >
              {loadingAction === 'refill' ? 'Claiming...' : 'Claim Free $20'}
            </button>
          </div>
        </div>

        {/* Purchase Packages Section (Simulated Checkout) */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-amber-400" />
              <h3 className="font-mono font-bold text-sm text-zinc-200">Instant Credit Packages</h3>
            </div>
            <span className="text-[10px] font-mono text-zinc-500">
              Instant Gateway Simulation
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Tier 1 */}
            <div className="p-3 rounded border border-zinc-700 bg-zinc-900/60 hover:border-amber-500/60 transition-all flex flex-col justify-between">
              <div>
                <div className="font-mono font-bold text-amber-300 text-sm mb-1">Spotter Pack</div>
                <div className="text-2xl font-bold font-mono text-white mb-1">$20</div>
                <div className="text-[11px] text-zinc-400 mb-3">1 single trial attempt or small drop stake</div>
              </div>
              <button
                onClick={() => handleBuy(20, 'tier_20')}
                disabled={loadingAction === 'tier_20'}
                className="w-full py-1.5 rounded bg-zinc-800 hover:bg-amber-600 hover:text-black border border-zinc-600 font-mono text-xs text-zinc-200 transition-colors"
              >
                {loadingAction === 'tier_20' ? 'Processing...' : 'Get $20 Credits'}
              </button>
            </div>

            {/* Tier 2 (Popular) */}
            <div className="p-3 rounded border border-amber-500 bg-amber-950/20 relative shadow-[0_0_15px_rgba(245,158,11,0.15)] flex flex-col justify-between">
              <div className="absolute -top-2.5 right-3 px-1.5 py-0.2 rounded bg-amber-500 text-black font-mono font-bold text-[9px]">
                BEST VALUE
              </div>
              <div>
                <div className="font-mono font-bold text-amber-300 text-sm mb-1">Detective Roll</div>
                <div className="text-2xl font-bold font-mono text-white mb-1">$50</div>
                <div className="text-[11px] text-zinc-400 mb-3">2+ trial attempts or medium bounty stake</div>
              </div>
              <button
                onClick={() => handleBuy(50, 'tier_50')}
                disabled={loadingAction === 'tier_50'}
                className="w-full py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs transition-colors"
              >
                {loadingAction === 'tier_50' ? 'Processing...' : 'Get $50 Credits'}
              </button>
            </div>

            {/* Tier 3 */}
            <div className="p-3 rounded border border-zinc-700 bg-zinc-900/60 hover:border-cyan-500/60 transition-all flex flex-col justify-between">
              <div>
                <div className="font-mono font-bold text-cyan-300 text-sm mb-1">Cine-God Vault</div>
                <div className="text-2xl font-bold font-mono text-white mb-1">$100</div>
                <div className="text-[11px] text-zinc-400 mb-3">5 trials + high-roller bounty posts</div>
              </div>
              <button
                onClick={() => handleBuy(100, 'tier_100')}
                disabled={loadingAction === 'tier_100'}
                className="w-full py-1.5 rounded bg-cyan-700 hover:bg-cyan-600 text-white font-mono font-bold text-xs transition-colors"
              >
                {loadingAction === 'tier_100' ? 'Processing...' : 'Get $100 Credits'}
              </button>
            </div>
          </div>
        </div>

        {/* Game Rules Summary Footer */}
        <div className="bg-black/40 border border-zinc-800/80 p-3 rounded text-[11px] font-mono text-zinc-400 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <span className="text-cyan-300 font-bold">Recon Protocol: </span>
            Every detective starts with <span className="text-amber-300">$100</span>. Answering any mystery clip costs <span className="text-amber-300">$20</span> (strictly one trial per detective). A correct identification awards both your <span className="text-emerald-400">$20 wager stake and the entire bounty</span> pot + 5 points on the 31-day leaderboard!
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};
