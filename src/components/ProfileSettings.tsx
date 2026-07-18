import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { Save, ArrowLeft, User, CheckCircle, AlertCircle } from 'lucide-react';

export default function ProfileSettings() {
  const { user, profile, updatePseudo } = useAuth();
  const { setActiveView } = useNavigation();
  const [pseudo, setPseudo] = useState(profile?.pseudo ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-slate-500">Veuillez vous connecter pour accéder à vos paramètres.</p>
      </div>
    );
  }

  const handleSave = async () => {
    if (!pseudo.trim()) {
      setMessage({ type: 'error', text: 'Le pseudo ne peut pas être vide.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    const result = await updatePseudo(pseudo);
    if (result.error) {
      setMessage({ type: 'error', text: result.error });
    } else {
      setMessage({ type: 'success', text: 'Pseudo mis à jour avec succès !' });
    }
    setSaving(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button
        onClick={() => setActiveView('hdv')}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Retour
      </button>

      <div className="glass-panel rounded-xl p-6 border border-white/5 shadow-xl">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/5">
          <div className="h-10 w-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <User className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Paramètres du compte</h2>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Pseudo public
            </label>
            <input
              type="text"
              value={pseudo}
              onChange={e => { setPseudo(e.target.value); setMessage(null); }}
              placeholder="Choisissez un pseudo"
              maxLength={30}
              className="w-full bg-[#070a12] border border-white/10 rounded-lg py-2 px-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/40 transition-colors"
            />
            <p className="text-[10px] text-slate-600 mt-1">
              Ce pseudo sera visible par les autres utilisateurs (auteur des prix, etc.).
            </p>
          </div>

          {message && (
            <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
              message.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}>
              {message.type === 'success' ? (
                <CheckCircle className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              )}
              {message.text}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !pseudo.trim()}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 px-4 py-2 rounded-lg transition-all"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}