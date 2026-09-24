import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Film, ImageIcon, UploadCloud, XCircle, ScanLine, CheckCircle2 } from 'lucide-react';

interface CinematicFileDropzoneProps {
  mediaType: 'photo' | 'clip';
  file: File | null;
  previewUrl: string | null;
  onFileSelected: (file: File, previewUrl: string) => void;
  onClear: () => void;
}

const CORNER_BASE = 'absolute w-5 h-5 border-cyan-500/70 transition-colors duration-300';

export const CinematicFileDropzone: React.FC<CinematicFileDropzoneProps> = ({
  mediaType,
  file,
  previewUrl,
  onFileSelected,
  onClear,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const dragCounter = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, []);

  const accept = mediaType === 'clip' ? 'video/mp4' : 'image/png';
  const MAX_CLIP_BYTES = 100 * 1024 * 1024;
  const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

  const ingestFile = useCallback(
    (candidate: File | undefined | null) => {
      setError(null);
      if (!candidate) return;

      const name = candidate.name.toLowerCase();
      const isMp4 = candidate.type === 'video/mp4' || name.endsWith('.mp4');
      const isPng = candidate.type === 'image/png' || name.endsWith('.png');

      if (mediaType === 'clip' && !isMp4) {
        setError('SPECIMEN REJECTED // Only .mp4 video files are accepted for a movie clip drop.');
        return;
      }
      if (mediaType === 'photo' && !isPng) {
        setError('SPECIMEN REJECTED // Only .png image files are accepted for a photo frame drop.');
        return;
      }
      if (mediaType === 'clip' && candidate.size > MAX_CLIP_BYTES) {
        setError('SPECIMEN REJECTED // Clip exceeds the 100MB size limit.');
        return;
      }
      if (mediaType === 'photo' && candidate.size > MAX_PHOTO_BYTES) {
        setError('SPECIMEN REJECTED // Image exceeds the 10MB size limit.');
        return;
      }

      const objectUrl = URL.createObjectURL(candidate);
      setIsProcessing(true);
      setScanProgress(0);

      let progress = 0;
      progressTimer.current = setInterval(() => {
        progress += Math.random() * 26 + 12;
        if (progress >= 100) {
          if (progressTimer.current) clearInterval(progressTimer.current);
          setScanProgress(100);
          setIsProcessing(false);
          onFileSelected(candidate, objectUrl);
          return;
        }
        setScanProgress(progress);
      }, 160);
    },
    [mediaType, onFileSelected]
  );

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    ingestFile(e.dataTransfer.files?.[0]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    ingestFile(e.target.files?.[0]);
    e.target.value = '';
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setError(null);
    onClear();
  };

  const Corners = () => (
    <>
      <span className={`${CORNER_BASE} top-2 left-2 border-t-2 border-l-2`} />
      <span className={`${CORNER_BASE} top-2 right-2 border-t-2 border-r-2`} />
      <span className={`${CORNER_BASE} bottom-2 left-2 border-b-2 border-l-2`} />
      <span className={`${CORNER_BASE} bottom-2 right-2 border-b-2 border-r-2`} />
    </>
  );

  // ---- Filled state: specimen locked in ----
  if (file && previewUrl && !isProcessing) {
    return (
      <div>
        <div className="relative rounded overflow-hidden border border-cyan-500/70 bg-black border-glow-cyan group">
          <Corners />
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/70 border border-cyan-500/60 text-cyan-300 text-[9px] font-mono tracking-widest uppercase">
            <CheckCircle2 className="w-3 h-3" />
            Specimen Locked
          </div>

          {mediaType === 'clip' ? (
            <video
              src={previewUrl}
              className="w-full h-44 object-cover bg-zinc-950"
              muted
              loop
              autoPlay
              playsInline
            />
          ) : (
            <img src={previewUrl} alt="Specimen preview" className="w-full h-44 object-cover" />
          )}

          <div className="absolute inset-0 recon-scanlines pointer-events-none opacity-40" />

          <button
            type="button"
            onClick={handleClear}
            className="absolute top-2 right-2 z-10 p-1 rounded-full bg-black/70 border border-red-500/60 text-red-400 hover:bg-red-950 hover:text-red-300 transition-colors cursor-pointer"
            aria-label="Remove specimen"
          >
            <XCircle className="w-4 h-4" />
          </button>

          <div className="absolute bottom-0 inset-x-0 bg-black/80 backdrop-blur-sm px-3 py-1.5 flex items-center justify-between text-[10px]">
            <span className="text-cyan-300 truncate max-w-[70%]">{file.name}</span>
            <span className="text-zinc-500">{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-1.5 text-[10px] text-zinc-500 hover:text-cyan-300 transition-colors uppercase tracking-wide"
        >
          Replace specimen &rarr;
        </button>
        <input ref={inputRef} type="file" accept={accept} onChange={handleInputChange} className="hidden" />
      </div>
    );
  }

  // ---- Processing state: analyzing specimen ----
  if (isProcessing) {
    return (
      <div className="relative rounded border border-cyan-500/70 bg-black h-44 overflow-hidden border-glow-cyan">
        <Corners />
        <div className="absolute inset-x-0 h-16 bg-linear-to-b from-cyan-400/0 via-cyan-400/20 to-cyan-400/0 animate-scan-sweep" />
        <div className="h-full flex flex-col items-center justify-center gap-3 text-cyan-300 font-mono">
          <ScanLine className="w-7 h-7 animate-pulse" />
          <span className="text-[11px] tracking-[0.2em] uppercase">Analyzing Specimen...</span>
          <div className="w-2/3 h-1 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-cyan-400 transition-all duration-150 ease-linear"
              style={{ width: `${Math.min(scanProgress, 100)}%` }}
            />
          </div>
          <span className="text-[10px] text-zinc-500">{Math.min(Math.round(scanProgress), 100)}%</span>
        </div>
      </div>
    );
  }

  // ---- Empty state: awaiting specimen ----
  return (
    <div>
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative rounded border-2 border-dashed h-44 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all duration-200 ${
          isDragging
            ? 'border-cyan-400 bg-cyan-950/30 animate-dropzone-pulse'
            : 'border-zinc-700 bg-zinc-950/60 hover:border-cyan-700 hover:bg-zinc-900/60'
        }`}
      >
        <Corners />
        <div
          className={`w-11 h-11 rounded-full flex items-center justify-center border transition-colors ${
            isDragging ? 'border-cyan-400 text-cyan-300 bg-cyan-950/60' : 'border-zinc-700 text-zinc-500'
          }`}
        >
          {isDragging ? (
            <UploadCloud className="w-5 h-5" />
          ) : mediaType === 'clip' ? (
            <Film className="w-5 h-5" />
          ) : (
            <ImageIcon className="w-5 h-5" />
          )}
        </div>
        <div className="text-center px-4">
          <div className={`font-mono text-xs font-bold uppercase tracking-wide ${isDragging ? 'text-cyan-300' : 'text-zinc-300'}`}>
            {isDragging ? 'Release To Ingest' : 'Drag & Drop Specimen'}
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">
            or click to browse local archive &middot; {mediaType === 'clip' ? '.mp4 only, max 100MB' : '.png only, max 10MB'}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-1.5 text-[10px] text-red-400 font-mono flex items-center gap-1">
          <XCircle className="w-3 h-3 shrink-0" />
          {error}
        </div>
      )}

      <input ref={inputRef} type="file" accept={accept} onChange={handleInputChange} className="hidden" />
    </div>
  );
};
