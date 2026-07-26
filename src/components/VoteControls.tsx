import { useAuth } from '../context/AuthContext';
import { useDofus } from '../context/DofusContext';
import { ThumbsUp, ThumbsDown, LogIn, AlertTriangle } from 'lucide-react';

interface VoteControlsProps {
  itemKey: string;
  authorId?: string | null;
}

export default function VoteControls({ itemKey, authorId }: VoteControlsProps) {
  const { user, signInWithDiscord } = useAuth();
  const { votes, toggleVote } = useDofus();

  const voteData = votes[itemKey];
  const upCount = voteData?.up ?? 0;
  const downCount = voteData?.down ?? 0;
  const myVote = voteData?.myVote ?? null;
  const score = upCount - downCount;
  const needsAlert = score <= -3;

  // Ne pas pouvoir voter sur ses propres prix
  if (user && authorId && authorId === user.id) {
    return (
      <span className="text-[9px] text-slate-600 italic" title="Vous ne pouvez pas voter sur vos propres prix">
        Votre prix
      </span>
    );
  }

  if (!user) {
    return (
      <button
        onClick={signInWithDiscord}
        className="flex items-center gap-1 text-[9px] text-slate-500 hover:text-white transition-colors"
        title="Connectez-vous pour voter"
      >
        <LogIn className="h-3 w-3" /> Voter
      </button>
    );
  }

  const handleVote = (vote: 'up' | 'down') => {
    toggleVote(itemKey, vote);
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => handleVote('up')}
        className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
          myVote === 'up'
            ? 'text-emerald-400 bg-emerald-500/15'
            : 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10'
        }`}
        title="Valider le prix"
      >
        <ThumbsUp className={`h-3 w-3 ${myVote === 'up' ? 'fill-emerald-400' : ''}`} />
        {upCount > 0 && <span>{upCount}</span>}
      </button>

      <button
        onClick={() => handleVote('down')}
        className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
          myVote === 'down'
            ? 'text-rose-400 bg-rose-500/15'
            : 'text-slate-400 hover:text-rose-400 hover:bg-rose-500/10'
        }`}
        title="Signaler comme incorrect"
      >
        <ThumbsDown className={`h-3 w-3 ${myVote === 'down' ? 'fill-rose-400' : ''}`} />
        {downCount > 0 && <span>{downCount}</span>}
      </button>

      {needsAlert && (
        <span className="flex items-center gap-0.5 text-[9px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full font-bold">
          <AlertTriangle className="h-3 w-3" /> Prix signalé
        </span>
      )}
    </div>
  );
}
