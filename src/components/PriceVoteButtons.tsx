import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { ThumbsUp, ThumbsDown, LogIn } from 'lucide-react';

interface PriceVoteButtonsProps {
  submissionId: string;
  onVote?: () => void;
}

export default function PriceVoteButtons({ submissionId, onVote }: PriceVoteButtonsProps) {
  const { user, signInWithDiscord } = useAuth();
  const [voting, setVoting] = useState(false);

  if (!user) {
    return (
      <button
        onClick={signInWithDiscord}
        className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-white"
        title="Connectez-vous pour voter"
      >
        <LogIn className="h-3 w-3" /> Voter
      </button>
    );
  }

  const handleVote = async (voteType: boolean) => {
    setVoting(true);
    const { error } = await supabase.rpc('handle_vote', {
      p_submission_id: submissionId,
      p_vote_type: voteType,
    });
    setVoting(false);
    if (error) {
      console.warn('[Vote] error:', error.message);
      return;
    }
    onVote?.();
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => handleVote(true)}
        disabled={voting}
        className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40 px-1.5 py-1 rounded transition-colors"
        title="Approuver"
      >
        <ThumbsUp className={`h-3 w-3 ${voting ? 'animate-pulse' : ''}`} />
      </button>
      <button
        onClick={() => handleVote(false)}
        disabled={voting}
        className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-40 px-1.5 py-1 rounded transition-colors"
        title="Désapprouver"
      >
        <ThumbsDown className={`h-3 w-3 ${voting ? 'animate-pulse' : ''}`} />
      </button>
    </div>
  );
}
