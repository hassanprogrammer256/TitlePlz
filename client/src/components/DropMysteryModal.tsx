import React, { useState, useEffect } from 'react';
import { User } from '../types';
import {
  Film,
  Camera,
  Coins,
  Clock,
  Calendar,
  AlertTriangle,
  X,
  Radio,
  Sparkles,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { CinematicFileDropzone } from './CinematicFileDropzone';
import { captureVideoPosterFrame } from '../utils/videoFrame';

interface DropMysteryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onDropCreated: (dropData: any) => Promise<void>;
  onOpenCreditsModal: () => void;
}

export const DropMysteryModal: React.FC<DropMysteryModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onDropCreated,
  onOpenCreditsModal,
}) => {
  const [mediaType, setMediaType] = useState<'photo' | 'clip'>('clip');
  const [clipMinutes, setClipMinutes] = useState<number>(3);
  const [clipSeconds, setClipSeconds] = useState<number>(30);
  const [releaseYear, setReleaseYear] = useState<number>(2017);
  const [correctTitle, setCorrectTitle] = useState<string>('');
  const [bountyStake, setBountyStake] = useState<number>(100);
  const [validityDays, setValidityDays] = useState<number>(3); // between 1 day (24h) and 7 days (1 week / 168h)
  const [validityHours, setValidityHours] = useState<number>(0);
  const [sourceNote, setSourceNote] = useState<string>('35mm Scan Rip');
  const [aspectRatio, setAspectRatio] = useState<string>('2.39:1 ANAMORPHIC');
  const [specimenFile, setSpecimenFile] = useState<File | null>(null);
  const [specimenPreviewUrl, setSpecimenPreviewUrl] = useState<string | null>(null);
  const [targetPropNote, setTargetPropNote] = useState<string>('Focus on vehicle model or architectural cues');
  const [audioStem, setAudioStem] = useState<string>('Analog Synthesizer Sub-Bass & Tape Hiss');
  const [tagsInput, setTagsInput] = useState<string>('#NeoNoir, #CinemaMystery, #SciFi');

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // Calculate total duration in seconds
  const totalClipDurationSeconds = clipMinutes * 60 + clipSeconds;

  // Calculate total validity hours: min 24h (1 day), max 168h (1 week)
  const totalValidityHours = validityDays * 24 + validityHours;
  const isValidityValid = totalValidityHours >= 24 && totalValidityHours <= 168;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!currentUser) {
      setErrorMessage('You must be authenticated to drop a mystery reel.');
      return;
    }

    if (!correctTitle.trim()) {
      setErrorMessage('Please specify the correct movie title. This is used by the consensus engine to validate answers.');
      return;
    }

    if (!specimenFile || !specimenPreviewUrl) {
      setErrorMessage('Please drop or select a media specimen before deploying this mystery.');
      return;
    }

    if (mediaType === 'clip' && totalClipDurationSeconds > 600) {
      setErrorMessage('Movie clip duration cannot exceed 10 minutes (600 seconds).');
      return;
    }

    if (!isValidityValid) {
      setErrorMessage('Validity duration must be at least 1 day (24 hours) and at most 1 week (168 hours).');
      return;
    }

    if (currentUser.credits < bountyStake) {
      setErrorMessage(`Insufficient credits to stake $${bountyStake}. You have $${currentUser.credits}. Please reload credits.`);
      return;
    }

    try {
      setLoading(true);
      const tags = tagsInput
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0)
        .map(t => (t.startsWith('#') ? t : `#${t}`));

      // The radar/leaderboard thumbnails render media through <img>, so a clip
      // still needs a poster frame extracted from the video for those spots —
      // the Drop Inspector itself plays the real video (see videoUrl below).
      let displayImageUrl = specimenPreviewUrl!;
      if (mediaType === 'clip' && specimenFile) {
        try {
          displayImageUrl = await captureVideoPosterFrame(specimenFile);
        } catch {
          // Fall back to the raw video URL rather than blocking submission.
        }
      }

      await onDropCreated({
        title: correctTitle.trim(),
        releaseYear: Number(releaseYear),
        mediaType,
        clipDurationSeconds: mediaType === 'clip' ? totalClipDurationSeconds : undefined,
        validityDurationHours: totalValidityHours,
        bountyPts: Number(bountyStake),
        timecode: '01:14:22:04',
        source: sourceNote,
        aspectRatioLabel: `ASPECT: ${aspectRatio}`,
        spectralLabel: 'SPECTRAL: 512nm // SPECTRUM: ANALOG',
        fpsLabel: 'FPS: 23.976',
        audioStemLabel: audioStem,
        targetPropNote,
        tags,
        imageUrl: displayImageUrl,
        videoUrl: mediaType === 'clip' ? specimenPreviewUrl! : undefined,
      });

      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to initialize mystery drop.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0e131b] border border-cyan-800/80 rounded-lg max-w-2xl w-full p-6 text-zinc-200 shadow-2xl relative max-h-[92vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-4 border-b border-zinc-800 pb-3">
          <div className="w-10 h-10 rounded bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-mono font-bold text-white tracking-wide flex items-center gap-2">
              <span>Post Mystery Reel / Photo Drop</span>
              <span className="text-xs px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/60 text-cyan-300 font-mono">
                ESCROW SYSTEM
              </span>
            </h2>
            <p className="text-xs text-zinc-400 font-mono">
              Upload a movie clip (&lt;10m) or photo frame. Stake a bounty pot from your account credits.
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 rounded bg-red-950/60 border border-red-500/80 text-red-300 font-mono text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            {currentUser && currentUser.credits < bountyStake && (
              <button
                type="button"
                onClick={onOpenCreditsModal}
                className="underline text-amber-300 hover:text-amber-200 text-xs font-bold"
              >
                Reload Credits &rarr;
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs font-mono">
          {/* Media Type Selector */}
          <div>
            <label className="block text-zinc-400 font-bold mb-1.5 uppercase text-[11px]">
              1. Media Recon Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setMediaType('clip');
                  setSpecimenFile(null);
                  setSpecimenPreviewUrl(null);
                }}
                className={`p-3 rounded border text-left flex items-center gap-3 transition-all ${
                  mediaType === 'clip'
                    ? 'border-cyan-500 bg-cyan-950/30 text-cyan-300'
                    : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <Film className="w-5 h-5 text-cyan-400" />
                <div>
                  <div className="font-bold">Movie Clip (&lt; 10 min)</div>
                  <div className="text-[10px] text-zinc-500">Video excerpt with audio track</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMediaType('photo');
                  setSpecimenFile(null);
                  setSpecimenPreviewUrl(null);
                }}
                className={`p-3 rounded border text-left flex items-center gap-3 transition-all ${
                  mediaType === 'photo'
                    ? 'border-cyan-500 bg-cyan-950/30 text-cyan-300'
                    : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <Camera className="w-5 h-5 text-cyan-400" />
                <div>
                  <div className="font-bold">High-Res Photo Frame</div>
                  <div className="text-[10px] text-zinc-500">Still 35mm / 70mm cell scan</div>
                </div>
              </button>
            </div>
          </div>

          {/* If Clip: Clip duration (< 10 mins) */}
          {mediaType === 'clip' && (
            <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800 flex items-center justify-between">
              <div>
                <span className="text-zinc-300 font-bold block">Clip Duration (Max 10:00)</span>
                <span className="text-[10px] text-zinc-500">Must be strictly less than 10 minutes</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={9}
                  value={clipMinutes}
                  onChange={e => setClipMinutes(Number(e.target.value))}
                  className="w-16 px-2 py-1 rounded bg-black border border-zinc-700 text-center text-cyan-300 font-bold"
                />
                <span className="text-zinc-500">min</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={clipSeconds}
                  onChange={e => setClipSeconds(Number(e.target.value))}
                  className="w-16 px-2 py-1 rounded bg-black border border-zinc-700 text-center text-cyan-300 font-bold"
                />
                <span className="text-zinc-500">sec</span>
              </div>
            </div>
          )}

          {/* Correct Movie Title (Verified Answer) & Release Year */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-zinc-400 font-bold mb-1 uppercase text-[11px]">
                2. Correct Movie Title (Secret Solution)
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="e.g. Blade Runner 2049"
                  value={correctTitle}
                  onChange={e => setCorrectTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-black/60 border border-cyan-800/80 text-cyan-300 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500"
                />
                <Lock className="w-3.5 h-3.5 text-zinc-500 absolute right-3 top-3" />
              </div>
              <span className="text-[10px] text-zinc-500 block mt-0.5">
                Stored in escrow cipher; validated automatically when detectives make trial guesses.
              </span>
            </div>

            <div>
              <label className="block text-zinc-400 font-bold mb-1 uppercase text-[11px]">
                Release Year
              </label>
              <input
                type="number"
                min={1895}
                max={2030}
                required
                value={releaseYear}
                onChange={e => setReleaseYear(Number(e.target.value))}
                className="w-full px-3 py-2 rounded bg-black/60 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Bounty Stake & Bet Validity Duration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded bg-zinc-900/80 border border-amber-500/30">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-amber-400 font-bold uppercase text-[11px] flex items-center gap-1.5">
                  <Coins className="w-4 h-4" />
                  <span>3. Bounty Stake ($ Deducted)</span>
                </label>
                <span className="text-[10px] text-zinc-400">
                  Your balance: <strong className="text-amber-300">${currentUser?.credits || 0}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-amber-400 text-base font-bold">$</span>
                <input
                  type="number"
                  min={20}
                  max={currentUser ? currentUser.credits : 1000}
                  step={10}
                  value={bountyStake}
                  onChange={e => setBountyStake(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded bg-black border border-amber-600/60 text-amber-300 font-bold text-sm focus:outline-none focus:border-amber-400"
                />
              </div>
              <span className="text-[10px] text-zinc-400 block mt-1">
                This amount is deducted from your account. The first detective with the correct answer wins this bounty + their $20 entry stake!
              </span>
            </div>

            <div>
              <label className="text-cyan-400 font-bold uppercase text-[11px] flex items-center gap-1.5 mb-1">
                <Clock className="w-4 h-4" />
                <span>4. Bet Validity Window (1d - 7d)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={7}
                  value={validityDays}
                  onChange={e => setValidityDays(Number(e.target.value))}
                  className="w-16 px-2 py-1.5 rounded bg-black border border-zinc-700 text-center text-cyan-300 font-bold"
                />
                <span className="text-zinc-400">Days</span>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={validityHours}
                  onChange={e => setValidityHours(Number(e.target.value))}
                  className="w-16 px-2 py-1.5 rounded bg-black border border-zinc-700 text-center text-cyan-300 font-bold"
                />
                <span className="text-zinc-400">Hours</span>
              </div>
              <div className="text-[10px] mt-1 text-zinc-400">
                Total: <strong className="text-cyan-300">{totalValidityHours} hours</strong> (Min 24h, Max 168h / 1 week).
              </div>
            </div>
          </div>

          {/* Media Specimen Upload */}
          <div>
            <label className="block text-zinc-400 font-bold mb-1 uppercase text-[11px]">
              Frame Visual Specimen
            </label>
            <CinematicFileDropzone
              mediaType={mediaType}
              file={specimenFile}
              previewUrl={specimenPreviewUrl}
              onFileSelected={(file, previewUrl) => {
                setSpecimenFile(file);
                setSpecimenPreviewUrl(previewUrl);
              }}
              onClear={() => {
                setSpecimenFile(null);
                setSpecimenPreviewUrl(null);
              }}
            />
          </div>

          {/* Clues & Technical Attributes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-bold mb-1 uppercase text-[11px]">
                Target Prop / Visual Clue Note
              </label>
              <input
                type="text"
                value={targetPropNote}
                onChange={e => setTargetPropNote(e.target.value)}
                className="w-full px-3 py-1.5 rounded bg-black/60 border border-zinc-800 text-zinc-300"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-bold mb-1 uppercase text-[11px]">
                Audio Stem Description
              </label>
              <input
                type="text"
                value={audioStem}
                onChange={e => setAudioStem(e.target.value)}
                className="w-full px-3 py-1.5 rounded bg-black/60 border border-zinc-800 text-zinc-300"
              />
            </div>
          </div>

          <div>
            <label className="block text-zinc-400 font-bold mb-1 uppercase text-[11px]">
              Recon Tags
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={e => setTagsInput(e.target.value)}
              className="w-full px-3 py-1.5 rounded bg-black/60 border border-zinc-800 text-zinc-300"
            />
          </div>

          {/* Submit Action */}
          <div className="pt-3 border-t border-zinc-800 flex items-center justify-between">
            <div className="text-[11px] text-zinc-400">
              Stake Cost: <strong className="text-amber-400 font-mono">${bountyStake}</strong> from credits
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  loading ||
                  !isValidityValid ||
                  !specimenFile ||
                  (currentUser ? currentUser.credits < bountyStake : true)
                }
                className="px-5 py-2 rounded bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-mono font-bold text-xs shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all cursor-pointer"
              >
                {loading ? 'Staking & Deploying...' : `Stake $${bountyStake} & Post Drop`}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
