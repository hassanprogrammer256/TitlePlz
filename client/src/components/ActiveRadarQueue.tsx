import React, { useState } from 'react';
import { MysteryDrop } from '../types';
import { Radio, Film, Camera, Clock, Coins, CheckCircle, Flame, Search, X } from 'lucide-react';

interface ActiveRadarQueueProps {
  drops: MysteryDrop[];
  selectedDropId: string;
  onSelectDrop: (dropId: string) => void;
  onOpenDropModal: () => void;
}

export const ActiveRadarQueue: React.FC<ActiveRadarQueueProps> = ({
  drops,
  selectedDropId,
  onSelectDrop,
  onOpenDropModal,
}) => {
  const [filter, setFilter] = useState<'all' | 'clips' | 'photos' | 'solved'>('all');
  const [query, setQuery] = useState('');

  const normalizedQuery = query.trim().toLowerCase();

  const filteredDrops = drops.filter(d => {
    if (filter === 'clips' && d.mediaType !== 'clip') return false;
    if (filter === 'photos' && d.mediaType !== 'photo') return false;
    if (filter === 'solved' && d.status !== 'solved') return false;

    if (!normalizedQuery) return true;

    // Only surface the hidden correct title once a drop is solved — search
    // still checks already-guessed candidate titles so it can catch
    // duplicates without spoiling unsolved mysteries.
    const searchableText = [
      d.dropNumber,
      d.uploaderHandle,
      ...d.tags,
      ...d.candidates.map(c => c.title),
      d.status === 'solved' ? d.correctTitle : '',
    ]
      .join(' ')
      .toLowerCase();

    return searchableText.includes(normalizedQuery);
  });

  return (
    <div className="bg-[#0e131b] border border-cyan-900/60 rounded-lg p-4 font-mono text-xs shadow-lg">
      <div className="flex items-center justify-between mb-3 border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span className="font-bold text-sm text-cyan-300">Active Radar Drops</span>
        </div>
        <button
          onClick={onOpenDropModal}
          className="text-cyan-400 hover:text-cyan-300 font-bold text-[11px] underline"
        >
          + Drop Reel
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-2 text-[11px]">
        {(['all', 'clips', 'photos', 'solved'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-2 py-0.5 rounded capitalize transition-colors ${
              filter === tab
                ? 'bg-cyan-950 border border-cyan-500 text-cyan-300 font-bold'
                : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Movie / drop search — checks tags, uploader, already-guessed candidate titles, and revealed titles of solved drops */}
      <div className="relative mb-3">
        <Search className="w-3.5 h-3.5 text-zinc-600 absolute left-2 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search movie / drop # / uploader..."
          className="w-full pl-7 pr-7 py-1.5 rounded bg-black/60 border border-zinc-800 text-zinc-300 placeholder:text-zinc-600 text-[11px] focus:outline-none focus:border-cyan-500"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Queue items */}
      <div className="space-y-2 max-h-115 overflow-y-auto pr-1">
        {filteredDrops.length === 0 && (
          <div className="text-center text-zinc-600 text-[11px] py-6">
            No drops match "{query}". Consider staking this title yourself.
          </div>
        )}
        {filteredDrops.map(drop => {
          const isSelected = drop.id === selectedDropId;
          return (
            <div
              key={drop.id}
              onClick={() => onSelectDrop(drop.id)}
              className={`p-2.5 rounded border cursor-pointer transition-all flex items-center justify-between ${
                isSelected
                  ? 'bg-cyan-950/50 border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                  : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <img
                  src={drop.imageUrl}
                  alt={drop.dropNumber}
                  className="w-12 h-9 rounded object-cover border border-zinc-700"
                />
                <div>
                  <div className="font-bold text-zinc-200 flex items-center gap-1.5">
                    <span>{drop.dropNumber}</span>
                    {drop.mediaType === 'clip' ? (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-800 text-cyan-300">
                        Clip &lt;10m
                      </span>
                    ) : (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-800 text-zinc-400">
                        Photo
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-zinc-500 flex items-center gap-2 mt-0.5">
                    <span>{drop.releaseYear ? `${drop.releaseYear}` : 'Year ?'}</span>
                    <span>•</span>
                    <span>{drop.uploaderHandle}</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="flex items-center justify-end gap-1 text-amber-300 font-bold">
                  <Coins className="w-3 h-3 text-amber-400" />
                  <span>${drop.bountyPts}</span>
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5 flex items-center justify-end gap-1">
                  {drop.status === 'solved' ? (
                    <span className="text-emerald-400 flex items-center gap-0.5">
                      <CheckCircle className="w-2.5 h-2.5" /> Solved
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5 text-cyan-400">
                      <Clock className="w-2.5 h-2.5" /> {drop.lockTimeRemaining || 'Active'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
