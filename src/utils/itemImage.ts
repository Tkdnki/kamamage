const DOFUSDB_IMG_BASE = 'https://api.dofusdb.fr/img/items/';

export function getItemImageUrl(item: { imgUrl?: string; dofusdbId?: number; _id?: string }): string {
  if (item.imgUrl) {
    if (item.imgUrl.startsWith('http')) return item.imgUrl;
    if (item.imgUrl.startsWith('items/')) return `${DOFUSDB_IMG_BASE}${item.imgUrl.replace('items/', '')}`;
    return `${DOFUSDB_IMG_BASE}${item.imgUrl}`;
  }
  if (item.dofusdbId) return `${DOFUSDB_IMG_BASE}${item.dofusdbId}.png`;
  return '';
}

type ItemTheme = {
  icon: string;
  bg: string;
  text: string;
  border: string;
};

// Cache thématique par nom/type pour éviter de rescanner à chaque render
const THEME_CACHE = new Map<string, ItemTheme>();

function buildTheme(candidate: string): ItemTheme {
  const lower = candidate.toLowerCase();
  if (/plume|feather/i.test(lower)) return { icon: 'Feather', bg: 'bg-sky-500/15', text: 'text-sky-400', border: 'border-sky-500/20' };
  if (/minerai|fer|roche|pierre|mineral|metal|silicate|bauxite|etain|cuivre|bronze|or/i.test(lower)) return { icon: 'Mountain', bg: 'bg-stone-500/15', text: 'text-stone-400', border: 'border-stone-500/20' };
  if (/bois|bucheron|log|wood|frene|arbre|chêne|if|ebene/i.test(lower)) return { icon: 'TreePine', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/20' };
  if (/laine|tissu|toile|coton|soie|textile/i.test(lower)) return { icon: 'Heart', bg: 'bg-pink-500/15', text: 'text-pink-400', border: 'border-pink-500/20' };
  if (/ble|wheat|cereale|grain|plante|graine|semence|ortie|chanvre|lin/i.test(lower)) return { icon: 'Wheat', bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/20' };
  if (/poisson|fish|poiscaille|pêche|peche/i.test(lower)) return { icon: 'Fish', bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/20' };
  if (/os|bone|dent|croc|griffe|oeil|prunelle|aile|cervelle|sang|sabot|corne|plume|poil|peau|cuir|fourrure/i.test(lower)) return { icon: 'Bone', bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/20' };
  if (/potion|fiole|elixir|sève|suc|goutte|larme|poudre/i.test(lower)) return { icon: 'FlaskConical', bg: 'bg-violet-500/15', text: 'text-violet-400', border: 'border-violet-500/20' };
  if (/bijou|bague|anneau|amulette|collier|ceinture|cape|sac|chapeau|casque|coiffe|bottes|sandales/.test(lower)) return { icon: 'Gem', bg: 'bg-yellow-500/15', text: 'text-yellow-400', border: 'border-yellow-500/20' };
  if (/arme|epee|épée|arc|baton|bâton|dague|marteau|hache|pelle|pioche|tronconneuse|tronçonneuse|marte/i.test(lower)) return { icon: 'Sword', bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/20' };
  return { icon: 'Package', bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/20' };
}

export function getItemTheme(name?: string, type?: string): ItemTheme {
  const key = `${name ?? ''}|${type ?? ''}`;
  const cached = THEME_CACHE.get(key);
  if (cached) return cached;
  const theme = buildTheme(`${name ?? ''} ${type ?? ''}`);
  THEME_CACHE.set(key, theme);
  return theme;
}
