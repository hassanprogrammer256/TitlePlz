import React, { useState } from 'react';
import { ClueComment, User } from '../types';
import { MessageSquare, ThumbsUp, Send, UserCheck, ShieldCheck } from 'lucide-react';

interface DeconstructionChatProps {
  comments: ClueComment[];
  currentUser: User | null;
  onPostComment: (content: string, timestamp?: string) => Promise<any>;
  onAgreeComment: (commentId: string) => Promise<any>;
  onOpenAuth: () => void;
}

export const DeconstructionChat: React.FC<DeconstructionChatProps> = ({
  comments,
  currentUser,
  onPostComment,
  onAgreeComment,
  onOpenAuth,
}) => {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onOpenAuth();
      return;
    }

    if (!content.trim()) return;

    try {
      setIsSubmitting(true);
      await onPostComment(content.trim(), '00:42');
      setContent('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-[#0e131b] border border-cyan-900/60 rounded-lg p-4 font-mono text-xs shadow-lg">
      <div className="flex items-center justify-between mb-3 border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-sm text-cyan-300">Recon Evidence & Clue Log</span>
        </div>
        <span className="text-[11px] text-zinc-500 font-mono">
          {comments.length} Logged Observations
        </span>
      </div>

      {/* Comments list */}
      <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1 mb-4">
        {comments.map((com, idx) => (
          <div
            key={com.id || idx}
            className="p-3 rounded bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 transition-colors"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-cyan-950 border border-cyan-600/60 flex items-center justify-center text-[10px] font-bold text-cyan-300">
                  {com.authorInitials || 'AG'}
                </span>
                <span className="font-bold text-zinc-200">{com.authorHandle}</span>
                {com.authorBadge && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-cyan-400 border border-cyan-900">
                    {com.authorBadge}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                <span>{com.timeAgo}</span>
              </div>
            </div>

            <p className="text-zinc-300 text-xs mb-2 leading-relaxed">
              {com.content}
            </p>

            <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60 text-[10px]">
              <span className="text-zinc-500">Frame mark: {com.timestamp}</span>
              <button
                onClick={() => onAgreeComment(com.id)}
                className="flex items-center gap-1 text-zinc-400 hover:text-cyan-300 transition-colors cursor-pointer"
              >
                <ThumbsUp className="w-3 h-3" />
                <span>Agree ({com.agreedCount})</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Log visual clue, camera lens, director motif or sound cue..."
          className="flex-1 bg-black/60 border border-zinc-800 rounded px-3 py-2 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 text-xs"
        />
        <button
          type="submit"
          disabled={isSubmitting || !content.trim()}
          className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Post</span>
        </button>
      </form>
    </div>
  );
};
