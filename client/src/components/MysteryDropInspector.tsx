import React, { useState } from 'react';
import { MysteryDrop, User } from '../types';
import {
  Film,
  Camera,
  Coins,
  Clock,
  Volume2,
  VolumeX,
  Share2,
  Eye,
  CheckCircle,
  AlertTriangle,
  UserPlus,
  UserCheck,
  ShieldCheck,
  Calendar,
} from 'lucide-react';
import { GuessSubmissionForm } from './GuessSubmissionForm';
import { ConsensusBoard } from './ConsensusBoard';
import { CinematicVideoPlayer } from './CinematicVideoPlayer';
import { playDroneSynth } from '../utils/audioSynth';

interface MysteryDropInspectorProps {
  drop: MysteryDrop;
  currentUser: User | null;
  onGuessSubmit: (title: string) => Promise<any>;
  onVoteCandidate: (candidateId: string) => Promise<any>;
  onOpenCreditsModal: () => void;
  onOpenAuth: () => void;
  onFollowUser: (handle: string) => Promise<void>;
  onUnfollowUser: (handle: string) => Promise<void>;
}

export const MysteryDropInspector: React.FC<MysteryDropInspectorProps> = ({
  drop,
  currentUser,
  onGuessSubmit,
  onVoteCandidate,
  onOpenCreditsModal,
  onOpenAuth,
  onFollowUser,
  onUnfollowUser,
}) => {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const isUploaderScouted = currentUser?.following?.includes(drop.uploaderHandle);
  const hasRealVideo = drop.mediaType === 'clip' && !!drop.videoUrl;

  const toggleAudio = () => {
    const next = !isPlayingAudio;
    setIsPlayingAudio(next);
    playDroneSynth(next);
  };

  const handleScoutToggle = async () => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    try {
      if (isUploaderScouted) {
        await onUnfollowUser(drop.uploaderHandle);
      } else {
        await onFollowUser(drop.uploaderHandle);
      }
    } catch {
      // the app already showed the reason as a toast
    }
  };

  return (
    <div className="space-y-4">
      {/* Frame Visual Deck */}
      <div className="relative rounded-lg overflow-hidden border border-cyan-800/80 bg-black shadow-2xl">
        <div className="relative aspect-video w-full overflow-hidden bg-zinc-950">
          {hasRealVideo ? (
            <CinematicVideoPlayer src={drop.videoUrl!} poster={drop.imageUrl} />
          ) : (
            <img
              src={drop.imageUrl}
              alt={drop.dropNumber}
              className="w-full h-full object-cover select-none"
            />
          )}

          {/* CRT scanlines overlay */}
          <div className="recon-scanlines absolute inset-0 pointer-events-none opacity-40"></div>

          {/* Top HUD Badges */}
          <div className="absolute top-2 sm:top-3 inset-x-2 sm:inset-x-3 flex flex-wrap items-start justify-between gap-1.5 text-[10px] sm:text-xs font-mono pointer-events-none">
            <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
              <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded bg-black/80 border border-cyan-500/60 text-cyan-300 font-bold backdrop-blur-md shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                {drop.dropNumber}
              </span>

              {/* Media Type Badge */}
              <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded bg-zinc-900/90 border border-zinc-700 text-zinc-300 flex items-center gap-1 sm:gap-1.5 backdrop-blur-md">
                {drop.mediaType === 'photo' ? (
                  <>
                    <Camera className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-cyan-400" />
                    <span>Photo Still</span>
                  </>
                ) : (
                  <>
                    <Film className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-cyan-400" />
                    <span>Clip ({Math.floor((drop.clipDurationSeconds || 180) / 60)}:{(drop.clipDurationSeconds || 180) % 60 < 10 ? '0' : ''}{(drop.clipDurationSeconds || 180) % 60})</span>
                  </>
                )}
              </span>

              {/* Release Year */}
              <span className="hidden sm:flex px-1.5 sm:px-2 py-0.5 sm:py-1 rounded bg-zinc-900/90 border border-zinc-700 text-zinc-300 items-center gap-1 backdrop-blur-md">
                <Calendar className="w-3 h-3 text-cyan-400" />
                <span>Year: {drop.releaseYear || 'Unknown'}</span>
              </span>
            </div>

            {/* Bounty Pot & Status */}
            <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
              <span className="px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded bg-amber-950/90 border border-amber-500/80 text-amber-300 font-bold flex items-center gap-1 sm:gap-1.5 backdrop-blur-md shadow-[0_0_12px_rgba(245,158,11,0.3)]">
                <Coins className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400" />
                <span>Bounty: ${drop.bountyPts}</span>
              </span>

              {drop.status === 'solved' ? (
                <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded bg-emerald-950/90 border border-emerald-500 text-emerald-300 font-bold flex items-center gap-1 backdrop-blur-md">
                  <CheckCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>SOLVED</span>
                </span>
              ) : (
                <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded bg-cyan-950/90 border border-cyan-500 text-cyan-300 flex items-center gap-1 backdrop-blur-md">
                  <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-pulse" />
                  <span>{drop.lockTimeRemaining || 'Active'}</span>
                </span>
              )}
            </div>
          </div>

          {/* Bottom HUD metadata (hidden when the real video player's control bar occupies this space) */}
          {!hasRealVideo && (
          <div className="absolute bottom-2 sm:bottom-3 inset-x-2 sm:inset-x-3 flex flex-wrap items-center justify-between gap-1.5 text-[10px] sm:text-[11px] font-mono pointer-events-none">
            <div className="hidden sm:flex items-center gap-2 pointer-events-auto bg-black/80 px-2 py-1 rounded border border-zinc-800 backdrop-blur-md">
              <span className="text-zinc-500">{drop.aspectRatioLabel}</span>
              <span className="text-zinc-700">|</span>
              <span className="text-cyan-400/90">{drop.fpsLabel}</span>
            </div>

            {/* Audio Stem synthesizer toggle */}
            <button
              onClick={toggleAudio}
              className={`pointer-events-auto px-2 sm:px-3 py-1 rounded font-mono text-[10px] sm:text-[11px] flex items-center gap-1.5 sm:gap-2 border transition-all ${
                isPlayingAudio
                  ? 'bg-cyan-500 text-black border-cyan-400 font-bold shadow-[0_0_12px_rgba(6,182,212,0.5)]'
                  : 'bg-black/80 hover:bg-zinc-800 text-cyan-300 border-cyan-800 backdrop-blur-md'
              }`}
            >
              {isPlayingAudio ? <Volume2 className="w-3.5 h-3.5 animate-pulse" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span>{isPlayingAudio ? 'Audio Stem Playing' : 'Audition Stem Drone'}</span>
            </button>
          </div>
          )}
        </div>

        {/* Uploader Meta & Scouting bar */}
        <div className="p-3 bg-[#0d1219] border-t border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="text-zinc-400">
              Uploader: <strong className="text-cyan-300">{drop.uploaderHandle}</strong> ({drop.uploaderRole})
            </div>
            {currentUser && currentUser.handle !== drop.uploaderHandle && (
              <button
                onClick={handleScoutToggle}
                className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 border transition-colors ${
                  isUploaderScouted
                    ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                    : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                }`}
              >
                {isUploaderScouted ? (
                  <>
                    <UserCheck className="w-3 h-3 text-cyan-400" />
                    <span>Scouting (Followed)</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-3 h-3" />
                    <span>Scout Detective</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="text-zinc-500 flex items-center gap-3 text-[11px]">
            <span>Bet Window: {drop.validityDurationHours || 24} hours</span>
            <span>{drop.detectivesExamining} Detectives on Target</span>
          </div>
        </div>
      </div>

      {/* Target Clue Prop Banner */}
      {drop.targetPropNote && (
        <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800 font-mono text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="text-zinc-300 font-bold">Investigation Note:</span>
            <span className="text-zinc-400">{drop.targetPropNote}</span>
          </div>
          <div className="flex gap-1.5">
            {drop.tags.map((t, idx) => (
              <span key={idx} className="px-1.5 py-0.2 rounded bg-zinc-800 text-[10px] text-zinc-400">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Submission Form (1 trial per detective rule) */}
      <GuessSubmissionForm
        drop={drop}
        currentUser={currentUser}
        onGuessSubmit={onGuessSubmit}
        onOpenCreditsModal={onOpenCreditsModal}
        onOpenAuth={onOpenAuth}
      />

      {/* Consensus Board of candidate films */}
      <ConsensusBoard
        candidates={drop.candidates}
        totalVotes={drop.totalGuessesCast}
        onVoteCandidate={onVoteCandidate}
      />
    </div>
  );
};
