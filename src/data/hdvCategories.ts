import { DOFUS_MOCK_ITEMS, DOFUS_RUNES } from './mockData';

export interface HdvSubCategoryDef {
  id: string;
  label: string;
  match: (type: string) => boolean;
  /** DofusDB type name(s) to fetch items for this subcategory (defaults to label) */
  queryType?: string | string[];
}

export interface HdvDef {
  id: string;
  label: string;
  icon: string;
  subCategories: HdvSubCategoryDef[];
}

function exact(value: string): (type: string) => boolean {
  const lower = value.toLowerCase();
  return (type: string) => type.toLowerCase() === lower;
}

function prefix(value: string): (type: string) => boolean {
  const lower = value.toLowerCase();
  return (type: string) => type.toLowerCase().startsWith(lower);
}

function includes(value: string): (type: string) => boolean {
  const lower = value.toLowerCase();
  return (type: string) => type.toLowerCase().includes(lower);
}

function any(values: string[]): (type: string) => boolean {
  const lower = values.map(v => v.toLowerCase());
  return (type: string) => {
    const t = type.toLowerCase();
    return lower.some(v => t.includes(v));
  };
}

export const HDV_DEFINITIONS: HdvDef[] = [
  {
    id: 'equipement',
    label: 'HDV Équipement',
    icon: 'Sword',
    subCategories: [
      { id: 'equip_amulette', label: 'Amulette', match: exact('Amulette') },
      { id: 'equip_anneau', label: 'Anneau', match: exact('Anneau') },
      { id: 'equip_arc', label: 'Arc', match: exact('Arc') },
      { id: 'equip_baguette', label: 'Baguette', match: exact('Baguette') },
      { id: 'equip_baton', label: 'Bâton', match: exact('Bâton') },
      { id: 'equip_dague', label: 'Dague', match: exact('Dague') },
      { id: 'equip_epee', label: 'Épée', match: exact('Épée') },
      { id: 'equip_faux', label: 'Faux', match: exact('Faux') },
      { id: 'equip_hache', label: 'Hache', match: exact('Hache') },
      { id: 'equip_lance', label: 'Lance', match: exact('Lance') },
      { id: 'equip_marteau', label: 'Marteau', match: exact('Marteau') },
      { id: 'equip_pelle', label: 'Pelle', match: exact('Pelle') },
      { id: 'equip_pioche', label: 'Pioche', match: exact('Pioche') },
      { id: 'equip_bottes', label: 'Bottes', match: exact('Bottes') },
      { id: 'equip_bouclier', label: 'Bouclier', match: exact('Bouclier') },
      { id: 'equip_cape', label: 'Cape', match: exact('Cape') },
      { id: 'equip_ceinture', label: 'Ceinture', match: exact('Ceinture') },
      { id: 'equip_chapeau', label: 'Chapeau', match: exact('Chapeau') },
      { id: 'equip_compagnon', label: 'Compagnon', match: includes('Compagnon') },
      { id: 'equip_dofus', label: 'Dofus', match: exact('Dofus') },
      { id: 'equip_trophee', label: 'Trophée', match: exact('Trophée') },
      { id: 'equip_prysmaradite', label: 'Prysmaradite', match: includes('Prysmaradite') },
      { id: 'equip_percepteur', label: 'Équipement de percepteur', match: includes('Percepteur'), queryType: ['Fers de Percepteur', 'Cuirasses de Percepteur', 'Bannière de Percepteur', 'Poignards de Percepteur', 'Tunique de Percepteur', 'Coffres de Percepteur', 'Sacoches de Percepteur', 'Ressource de Percepteur'] },
    ],
  },
  {
    id: 'consommable',
    label: 'HDV Consommable',
    icon: 'FlaskConical',
    subCategories: [
      { id: 'conso_ballon', label: 'Ballon', match: exact('Ballon') },
      { id: 'conso_biere', label: 'Bière', match: exact('Bière') },
      { id: 'conso_boisson', label: 'Boisson', match: exact('Boisson') },
      { id: 'conso_boite_fragments', label: 'Boîte de fragments', match: includes('Boîte de fragments') },
      { id: 'conso_bourse', label: 'Bourse', match: includes('Bourse') },
      { id: 'conso_cadeau', label: 'Cadeau', match: exact('Cadeau') },
      { id: 'conso_coffre', label: 'Coffre', match: exact('Coffre') },
      { id: 'conso_conteneur', label: 'Conteneur', match: includes('Conteneur') },
      { id: 'conso_document', label: 'Document', match: exact('Document') },
      { id: 'conso_eklame', label: 'Éklâme', match: includes('Éklâme') },
      { id: 'conso_fee_artifice', label: "Fée d'artifice", match: includes("Fée d'artifice") },
      { id: 'conso_friandise', label: 'Friandise', match: exact('Friandise') },
      { id: 'conso_mimibiote', label: 'Mimibiote', match: includes('Mimibiote') },
      { id: 'conso_mots_haiku', label: 'Mots de haïku', match: includes('Haïku') },
      { id: 'conso_objet_utilisable', label: 'Objet utilisable', match: exact('Objet utilisable') },
      { id: 'conso_objet_temporis', label: 'Objet utilisable de Temporis', match: includes('Temporis') },
      { id: 'conso_pain', label: 'Pain', match: exact('Pain') },
      { id: 'conso_parchemin_attitude', label: "Parchemin d'attitude", match: includes("Parchemin d'attitude") },
      { id: 'conso_parchemin_carac', label: 'Parchemin de caractéristique', match: includes('Parchemin de Caractéristique') },
      { id: 'conso_parchemin_sort', label: 'Parchemin de sortilège', match: includes('Parchemin de Sortilège') },
      { id: 'conso_parchemin_titre', label: 'Parchemin de titre', match: includes('Parchemin de Titre') },
      { id: 'conso_parchemin_emoji', label: "Parchemin d'émoticônes", match: includes("Parchemin d'émoticônes") },
      { id: 'conso_parchemin_xp', label: "Parchemin d'expérience", match: includes("Parchemin d'Expérience") },
      { id: 'conso_poisson', label: 'Poisson comestible', match: any(['Poisson']) },
      { id: 'conso_popoche', label: 'Popoche de Havre-Sac', match: includes('Popoche') },
      { id: 'conso_potion', label: 'Potion', match: prefix('Potion') },
      { id: 'conso_potion_attitude', label: "Potion d'attitude", match: includes("Potion d'Attitude") },
      { id: 'conso_potion_conquete', label: 'Potion de conquête', match: includes('Potion de Conquête') },
      { id: 'conso_potion_teleportation', label: 'Potion de téléportation', match: includes('Potion de Téléportation') },
      { id: 'conso_prisme', label: 'Prisme', match: exact('Prisme') },
      { id: 'conso_sac_ressources', label: 'Sac de ressources', match: includes('Sac de ressources') },
      { id: 'conso_tatouage_trool', label: 'Tatouage de la Foire du Trool', match: includes('Tatouage') },
      { id: 'conso_viande', label: 'Viande comestible', match: any(['Viande']) },
    ],
  },
  {
    id: 'runes',
    label: 'HDV Runes',
    icon: 'Gem',
    subCategories: [
      { id: 'rune_gravure', label: 'Gravure de forgemagie', match: includes('Gravure de forgemagie') },
      { id: 'rune_orbe', label: 'Orbe de forgemagie', match: includes('Orbe de forgemagie') },
      { id: 'rune_potion_fm', label: 'Potion de forgemagie', match: includes('Potion de forgemagie') },
      { id: 'rune_astrale', label: 'Rune astrale', match: includes('Rune astrale') },
      { id: 'rune_fm', label: 'Rune de forgemagie', match: includes('Rune de forgemagie') },
      { id: 'rune_transcendance', label: 'Rune de transcendance', match: includes('Rune de transcendance') },
    ],
  },
  {
    id: 'ressources',
    label: 'HDV Ressources',
    icon: 'Box',
    subCategories: [
      { id: 'res_aille', label: 'Aile', match: exact('Aile') },
      { id: 'res_alliage', label: 'Alliage', match: exact('Alliage') },
      { id: 'res_bois', label: 'Bois', match: exact('Bois') },
      { id: 'res_bourgeon', label: 'Bourgeon', match: exact('Bourgeon') },
      { id: 'res_carapace', label: 'Carapace', match: exact('Carapace') },
      { id: 'res_carte', label: 'Carte', match: exact('Carte') },
      { id: 'res_cereale', label: 'Céréale', match: exact('Céréale') },
      { id: 'res_champignon', label: 'Champignon', match: exact('Champignon') },
      { id: 'res_clef', label: 'Clef', match: exact('Clef') },
      { id: 'res_coquille', label: 'Coquille', match: exact('Coquille') },
      { id: 'res_cuir', label: 'Cuir', match: exact('Cuir') },
      { id: 'res_ecorce', label: 'Écorce', match: exact('Écorce') },
      { id: 'res_essence_gardien', label: 'Essence de gardien de donjon', match: includes('Essence') },
      { id: 'res_etoffe', label: 'Étoffe', match: exact('Étoffe') },
      { id: 'res_fleur', label: 'Fleur', match: exact('Fleur') },
      { id: 'res_fragment_carte', label: 'Fragment de carte', match: includes('Fragment de carte') },
      { id: 'res_fruit', label: 'Fruit', match: exact('Fruit') },
      { id: 'res_galet', label: 'Galet', match: exact('Galet') },
      { id: 'res_gelee', label: 'Gelée', match: exact('Gelée') },
      { id: 'res_graine', label: 'Graine', match: exact('Graine') },
      { id: 'res_haiku', label: 'Haïku', match: exact('Haïku') },
      { id: 'res_huile', label: 'Huile', match: exact('Huile') },
      { id: 'res_laine', label: 'Laine', match: exact('Laine') },
      { id: 'res_legume', label: 'Légume', match: exact('Légume') },
      { id: 'res_liquide', label: 'Liquide', match: exact('Liquide') },
      { id: 'res_materiel_alchimie', label: 'Matériel d\'alchimie', match: includes('Alchimie') },
      { id: 'res_materiel_exploration', label: 'Matériel d\'exploration', match: includes('Exploration') },
      { id: 'res_metaria', label: 'Métaria', match: includes('Métaria') },
      { id: 'res_minerai', label: 'Minerai', match: exact('Minerai') },
      { id: 'res_nowel', label: 'Nowel', match: includes('Nowel') },
      { id: 'res_oeil', label: 'Œil', match: exact('Œil') },
      { id: 'res_oeuf', label: 'Œuf', match: exact('Œuf') },
      { id: 'res_oreille', label: 'Oreille', match: exact('Oreille') },
      { id: 'res_os', label: 'Os', match: exact('Os') },
      { id: 'res_patte', label: 'Patte', match: exact('Patte') },
      { id: 'res_peau', label: 'Peau', match: exact('Peau') },
      { id: 'res_pierre_brute', label: 'Pierre brute', match: exact('Pierre brute') },
      { id: 'res_pierre_precieuse', label: 'Pierre précieuse', match: includes('Pierre précieuse') },
      { id: 'res_planche', label: 'Planche', match: exact('Planche') },
      { id: 'res_plante', label: 'Plante', match: exact('Plante') },
      { id: 'res_plume', label: 'Plume', match: exact('Plume') },
      { id: 'res_poil', label: 'Poil', match: exact('Poil') },
      { id: 'res_poisson', label: 'Poisson', match: exact('Poisson') },
      { id: 'res_poudre', label: 'Poudre', match: exact('Poudre') },
      { id: 'res_preparation', label: 'Préparation', match: exact('Préparation') },
      { id: 'res_queue', label: 'Queue', match: exact('Queue') },
      { id: 'res_rabmablague', label: 'Rabmablague', match: includes('Rabmablague') },
      { id: 'res_racine', label: 'Racine', match: exact('Racine') },
      { id: 'res_ressource_combat', label: 'Ressource de combat', match: includes('Ressource de combat') },
      { id: 'res_ressource_at', label: 'Ressource des Anomalies Temporelles', match: includes('Anomalies Temporelles') },
      { id: 'res_ressource_songes', label: 'Ressource des Songes', match: includes('Songes') },
      { id: 'res_ressource_diverse', label: 'Ressource diverse', match: includes('Ressource diverse') },
      { id: 'res_seve', label: 'Sève', match: exact('Sève') },
      { id: 'res_substrat', label: 'Substrat', match: exact('Substrat') },
      { id: 'res_teinture', label: 'Teinture', match: exact('Teinture') },
      { id: 'res_vetement', label: 'Vêtement', match: exact('Vêtement') },
      { id: 'res_viande', label: 'Viande', match: exact('Viande') },
    ],
  },
  {
    id: 'ames',
    label: "HDV des âmes",
    icon: 'Ghost',
    subCategories: [
      { id: 'ame_archi', label: "Âme d'archimonstre", match: includes("Âme d'archimonstre") },
      { id: 'ame_gardien', label: 'Âme de gardien de donjon', match: includes('Âme de gardien') },
      { id: 'ame_bouataklone', label: 'Bouataklône', match: includes('Bouataklône') },
      { id: 'ame_pierre', label: "Pierre d'âme", match: includes("Pierre d'âme") },
    ],
  },
  {
    id: 'creature',
    label: 'HDV Créature',
    icon: 'PawPrint',
    subCategories: [
      { id: 'crea_dragodinde', label: 'Dragodinde', match: exact('Dragodinde') },
      { id: 'crea_familier', label: 'Familier', match: exact('Familier') },
      { id: 'crea_montilier', label: 'Montilier', match: exact('Montilier') },
      { id: 'crea_muldo', label: 'Muldo', match: exact('Muldo') },
      { id: 'crea_volkorne', label: 'Volkorne', match: exact('Volkorne') },
      { id: 'crea_filet_capture', label: 'Filet de capture', match: exact('Filet de capture') },
      { id: 'crea_carburant', label: "Carburant d'enclos", match: exact("Carburant d'enclos") },
      { id: 'crea_caution', label: 'Caution', match: exact('Caution') },
      { id: 'crea_makina', label: 'Makina', match: exact('Makina') },
      { id: 'crea_nourriture', label: 'Nourriture pour familier', match: exact('Nourriture pour familier') },
      { id: 'crea_monture_domptee', label: 'Monture domptée', match: exact('Monture domptée') },
      { id: 'crea_potion_monture', label: 'Potion de monture', match: exact('Potion de monture') },
    ],
  },
];

export function getHdvByItemType(type: string): string | null {
  const t = type.toLowerCase();
  for (const hdv of HDV_DEFINITIONS) {
    for (const sub of hdv.subCategories) {
      if (sub.match(type)) return hdv.id;
    }
  }
  return null;
}

export function getSubCategoriesByItemType(type: string): { hdvId: string; subId: string }[] {
  const result: { hdvId: string; subId: string }[] = [];
  for (const hdv of HDV_DEFINITIONS) {
    for (const sub of hdv.subCategories) {
      if (sub.match(type)) {
        result.push({ hdvId: hdv.id, subId: sub.id });
      }
    }
  }
  return result;
}

export function matchesHdv(
  item: { type: string },
  hdvId: string | null,
  selectedSubs: Set<string>,
): boolean {
  if (!hdvId) return true;
  if (selectedSubs.size === 0) return false;
  const hdv = HDV_DEFINITIONS.find(h => h.id === hdvId);
  if (!hdv) return false;
  for (const sub of hdv.subCategories) {
    if (selectedSubs.has(sub.id) && sub.match(item.type)) {
      return true;
    }
  }
  return false;
}

export function matchesSubCategory(item: { type: string }, subId: string): boolean {
  for (const hdv of HDV_DEFINITIONS) {
    for (const sub of hdv.subCategories) {
      if (sub.id === subId) return sub.match(item.type);
    }
  }
  return false;
}

const HDV_LABELS: Record<string, string> = {};
for (const hdv of HDV_DEFINITIONS) HDV_LABELS[hdv.id] = hdv.label;

/**
 * Dictionnaire de mapping : types génériques / super-types DofusDB → HDV officielle.
 * Les types précis (Armes, Chapeaux, Capes, Minerais, Bois, Plantes, Pains,
 * Potions, Parchemins, Runes, Familiers, Dragodindes…) sont résolus par
 * `HDV_DEFINITIONS` via `getHdvByItemType` ; ce dictionnaire couvre les types
 * qui n'apparaissent pas dans les sous-catégories.
 */
const GENERIC_HDV_BY_TYPE: Record<string, string> = {
  'Équipement': 'HDV Équipement',
  'Ressource': 'HDV Ressources',
  'Consommable': 'HDV Consommable',
  'Rune': 'HDV Runes',
  'Créature': 'HDV Créature',
};

/**
 * Retourne le nom de l'HDV officielle correspondant au type/catégorie d'un item.
 * Utilise le dictionnaire générique puis les définitions HDV (sous-catégories).
 *
 * @param itemType - Type DofusDB de l'item (ex: "Épée", "Minerai", "Potion").
 * @returns Le libellé d'HDV (ex: "HDV Équipement") ou null si introuvable.
 */
export function getHdvName(itemType: string | null | undefined): string | null {
  if (!itemType) return null;
  const t = itemType.trim();
  if (!t) return null;

  const generic = GENERIC_HDV_BY_TYPE[t];
  if (generic) return generic;

  const hdvId = getHdvByItemType(t);
  if (hdvId && HDV_LABELS[hdvId]) return HDV_LABELS[hdvId];

  return null;
}

/**
 * Détermine le libellé d'HDV d'un item de file de scan (par ID connu en base,
 * sinon par fallback textuel sur le nom).
 */
export function getHdvCategoryForItem(expectedName: string, expectedId: string): string | null {
  let type: string | null = null;

  if (DOFUS_RUNES.some(r => r.id === expectedId)) {
    type = 'Rune de forgemagie';
  } else {
    const item = DOFUS_MOCK_ITEMS.find(i => i._id === expectedId);
    if (item) type = item.type;
  }

  if (type) {
    const name = getHdvName(type);
    if (name) return name;
  }

  // Fallback textuel : toute rune doit s'acheter à l'HDV Runes.
  if (expectedName.includes('Rune')) return HDV_LABELS['runes'] ?? 'HDV Runes';

  return null;
}
