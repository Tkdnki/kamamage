import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useServer } from '../context/ServerContext';
import PriceVoteButtons from './PriceVoteButtons';
import { Clock } from 'lucide-react';

interface SubmissionRow {
  id: string;
  item_key: string;
  category: string;
  lot: string | null;
  price: number;
  status: string;
  created_at: string;
  profiles: { pseudo: string } | null;
}

export default function PendingSubmissions() {
  const { selectedServer } = useServer();
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('price_submissions')
      .select('id, item_key, category, lot, price, status, created_at, profiles!inner(pseudo)')
      .eq('server_name', selectedServer)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20);

    if (!error && data) setSubmissions(data as unknown as SubmissionRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [selectedServer]);

  if (loading) {
    return <div className="text-xs text-slate-500 text-center py-4">Chargement...</div>;
  }

  if (submissions.length === 0) {
    return (
      <div className="text-xs text-slate-500 text-center py-4">
        Aucune soumission en attente de validation.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
        Soumissions en attente ({submissions.length})
      </h4>
      {submissions.map(sub => (
        <div
          key={sub.id}
          className="flex items-center justify-between bg-[#090d16]/40 rounded-lg px-3 py-2 border border-white/5"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-white truncate">{sub.item_key}</p>
            <p className="text-[10px] text-slate-500">
              {sub.price} K · par {sub.profiles?.pseudo ?? '?'}
              {sub.lot && ` · Lot ${sub.lot}`}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-2">
            <span className="flex items-center gap-1 text-[9px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
              <Clock className="h-2.5 w-2.5" /> En attente
            </span>
            <PriceVoteButtons submissionId={sub.id} onVote={load} />
          </div>
        </div>
      ))}
    </div>
  );
}
