import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';

interface CinematicVideoPlayerProps {
  src: string;
  poster?: string;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export const CinematicVideoPlayer: React.FC<CinematicVideoPlayerProps> = ({ src, poster }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const audioGraphRef = useRef<{ ctx: AudioContext; analyser: AnalyserNode } | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  // Lazily wire the video element into a Web Audio analyser so we can draw a
  // real waveform from the actual audio track (only ever done once per element).
  const ensureAudioGraph = () => {
    if (audioGraphRef.current || !videoRef.current) return audioGraphRef.current;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      const source = ctx.createMediaElementSource(videoRef.current);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      audioGraphRef.current = { ctx, analyser };
    } catch {
      audioGraphRef.current = null;
    }
    return audioGraphRef.current;
  };

  const drawWaveform = () => {
    const canvas = canvasRef.current;
    const graph = audioGraphRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx2d.clearRect(0, 0, width, height);

    const barCount = 48;
    const barWidth = width / barCount;
    let data: Uint8Array | null = null;

    if (graph) {
      data = new Uint8Array(new ArrayBuffer(graph.analyser.frequencyBinCount));
      graph.analyser.getByteFrequencyData(data as Uint8Array<ArrayBuffer>);
    }

    for (let i = 0; i < barCount; i++) {
      let amplitude: number;
      if (data && isPlaying) {
        const idx = Math.floor((i / barCount) * data.length);
        amplitude = data[idx] / 255;
      } else {
        amplitude = 0.06 + Math.sin(i * 0.6) * 0.02;
      }
      const barHeight = Math.max(2, amplitude * height);
      const x = i * barWidth + barWidth * 0.15;
      const w = barWidth * 0.7;
      const y = (height - barHeight) / 2;

      ctx2d.fillStyle = isPlaying ? 'rgba(0, 242, 254, 0.85)' : 'rgba(0, 242, 254, 0.25)';
      ctx2d.fillRect(x, y, w, barHeight);
    }

    rafRef.current = requestAnimationFrame(drawWaveform);
  };

  useEffect(() => {
    rafRef.current = requestAnimationFrame(drawWaveform);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      audioGraphRef.current?.ctx.close().catch(() => {});
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    const graph = ensureAudioGraph();
    if (graph && graph.ctx.state === 'suspended') graph.ctx.resume().catch(() => {});

    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const bar = progressBarRef.current;
    if (!video || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    video.currentTime = ratio * duration;
    setCurrentTime(video.currentTime);
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div>
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className="w-full h-full object-cover select-none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
        playsInline
      />

      {/* Control bar */}
      <div
        className="absolute bottom-0 inset-x-0 bg-black/85 backdrop-blur-md border-t border-cyan-900/60 px-3 py-2 flex items-center gap-3 pointer-events-auto"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={togglePlay}
          className="shrink-0 w-7 h-7 rounded bg-cyan-500 hover:bg-cyan-400 text-black flex items-center justify-center transition-colors"
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
        </button>

        <span className="text-[10px] font-mono text-cyan-300 shrink-0 tabular-nums">
          {formatTime(currentTime)}
        </span>

        <div
          ref={progressBarRef}
          onClick={handleSeek}
          className="relative flex-1 h-6 flex items-center cursor-pointer group"
        >
          <canvas ref={canvasRef} width={320} height={24} className="absolute inset-0 w-full h-full" />
          <div className="relative w-full h-1 rounded-full bg-zinc-800/80 overflow-hidden">
            <div
              className="h-full bg-cyan-400 shadow-[0_0_6px_rgba(0,242,254,0.6)]"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <span className="text-[10px] font-mono text-zinc-500 shrink-0 tabular-nums">
          {formatTime(duration)}
        </span>

        <button
          onClick={toggleMute}
          className="shrink-0 w-6 h-6 rounded text-cyan-300 hover:text-cyan-200 flex items-center justify-center"
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
};
