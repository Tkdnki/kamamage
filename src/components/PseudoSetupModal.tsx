import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { AlertCircle, CheckCircle, User } from 'lucide-react';

export default function PseudoSetupModal() {
  const { needsPseudo, updatePseudo } = useAuth();
  const [pseudo, setPseudo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!needsPseudo) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pseudo.trim()) {
      setError('Le pseudo ne peut pas être vide.');
      return;
    }
    setSaving(true);
    setError(null);
    const result = await updatePseudo(pseudo);
    if (result.error) setError(result.error);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0c101d] border border-white/10 rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <User className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Bienvenue !</h2>
            <p className="text-[11px] text-slate-400">Choisissez un pseudo public</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={pseudo}
            onChange={e => { setPseudo(e.target.value); setError(null); }}
            placeholder="Votre pseudo"
            maxLength={30}
            autoFocus
            className="w-full bg-[#070a12] border border-white/10 rounded-lg py-2 px-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/40 transition-colors"
          />

          {error && (
            <div className="flex items-center gap-1.5 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-lg">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          <p className="text-[10px] text-slate-600">
            Ce pseudo sera affiché à côté de vos prix (ex: "Modifié par ...").
          </p>

          <button
            type="submit"
            disabled={saving || !pseudo.trim()}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 px-4 py-2.5 rounded-lg transition-all"
          >
            {saving ? 'Enregistrement...' : 'Confirmer'}
          </button>
        </form>
      </div>
    </div>
  );
}