export interface DofusItem {
  _id: string;
  name: string;
  type: string;
  level: number;
  imgUrl: string;

  /**
   * ID numérique DofusDB. Présent uniquement sur les items provenant de l'API DofusDB.
   * Utilisé pour récupérer la recette via `fetchRecipeForItem(dofusdbId)`.
   */
  dofusdbId?: number;

  /** Nom du métier qui craft cet item (uniquement dans mockData) */
  job?: string;

  /**
   * Recette en format interne (mockData).
   * Format hérité de Dofapi — conservé pour la compatibilité des items mockés.
   * Pour les items DofusDB, la recette est chargée à la demande via `fetchRecipeForItem()`.
   */
  recipe?: Array<{
    [ingredientName: string]: {
      id: string;
      url?: string;
      imgUrl?: string;
      type?: string;
      lvl?: string;
      quantity: string;
    }
  }>;
}

export interface Rune {
  id: string;
  name: string;
  code: string;
  weight: number;
  statEffect: string;
  category: 'Carac' | 'VigSagesse' | 'Dommages' | 'Resistances' | 'Utilitaires' | 'Exotiques';
  imgUrl?: string;
  /**
   * ID officiel DofusDB de la rune (item_key utilisé comme clé des prix HDV).
   * Identique à l'`_id` renvoyé par DofusDB (ex: "Rune Fo" → 1519).
   * Absent uniquement pour les runes inexistantes en base (ex: "Rune Pa Do").
   */
  itemId?: string;
}

export const DOFUS_RUNES: Rune[] = [
  // Exotiques / Majeurs
  { id: 'ga_pa', name: 'Rune Ga Pa', code: 'Ga Pa', weight: 100, statEffect: '+1 PA', category: 'Exotiques', imgUrl: 'https://api.dofusdb.fr/img/items/78055.png', itemId: '1557' },
  { id: 'ga_pme', name: 'Rune Ga Pme', code: 'Ga Pme', weight: 90, statEffect: '+1 PM', category: 'Exotiques', imgUrl: 'https://api.dofusdb.fr/img/items/78056.png', itemId: '1558' },
  { id: 'po', name: 'Rune Po', code: 'Po', weight: 51, statEffect: '+1 Portée', category: 'Exotiques', imgUrl: 'https://api.dofusdb.fr/img/items/78018.png', itemId: '7438' },
  { id: 'invoc', name: 'Rune Invo', code: 'Invo', weight: 30, statEffect: '+1 Invocation', category: 'Exotiques', imgUrl: 'https://api.dofusdb.fr/img/items/78019.png', itemId: '7442' },

  // Sagesse / Prospection / Soin
  { id: 'ra_sa', name: 'Rune Ra Sa', code: 'Ra Sa', weight: 30, statEffect: '+10 Sagesse', category: 'VigSagesse', imgUrl: 'https://api.dofusdb.fr/img/items/78051.png', itemId: '1552' },
  { id: 'pa_sa', name: 'Rune Pa Sa', code: 'Pa Sa', weight: 9, statEffect: '+3 Sagesse', category: 'VigSagesse', imgUrl: 'https://api.dofusdb.fr/img/items/78050.png', itemId: '1546' },
  { id: 'sa', name: 'Rune Sa', code: 'Sa', weight: 3, statEffect: '+1 Sagesse', category: 'VigSagesse', imgUrl: 'https://api.dofusdb.fr/img/items/78049.png', itemId: '1521' },
  { id: 'pa_so', name: 'Rune Pa So', code: 'Pa So', weight: 30, statEffect: '+3 Soins', category: 'VigSagesse', imgUrl: 'https://api.dofusdb.fr/img/items/78099.png', itemId: '19337' },
  { id: 'so', name: 'Rune So', code: 'So', weight: 10, statEffect: '+1 Soin', category: 'VigSagesse', imgUrl: 'https://api.dofusdb.fr/img/items/78013.png', itemId: '7434' },

  // Vitalité
  { id: 'ra_vi', name: 'Rune Ra Vi', code: 'Ra Vi', weight: 2.5, statEffect: '+10 Vitalité', category: 'Carac', imgUrl: 'https://api.dofusdb.fr/img/items/78054.png', itemId: '1554' },
  { id: 'pa_vi', name: 'Rune Pa Vi', code: 'Pa Vi', weight: 0.75, statEffect: '+3 Vitalité', category: 'Carac', imgUrl: 'https://api.dofusdb.fr/img/items/78053.png', itemId: '1548' },
  { id: 'vi', name: 'Rune Vi', code: 'Vi', weight: 0.25, statEffect: '+1 Vitalité', category: 'Carac', imgUrl: 'https://api.dofusdb.fr/img/items/78052.png', itemId: '1523' },

  // Stats Primaires
  { id: 'ra_fo', name: 'Rune Ra Fo', code: 'Ra Fo', weight: 10, statEffect: '+10 Force', category: 'Carac', imgUrl: 'https://api.dofusdb.fr/img/items/78045.png', itemId: '1551' },
  { id: 'pa_fo', name: 'Rune Pa Fo', code: 'Pa Fo', weight: 3, statEffect: '+3 Force', category: 'Carac', imgUrl: 'https://api.dofusdb.fr/img/items/78044.png', itemId: '1545' },
  { id: 'fo', name: 'Rune Fo', code: 'Fo', weight: 1, statEffect: '+1 Force', category: 'Carac', imgUrl: 'https://api.dofusdb.fr/img/items/78043.png', itemId: '1519' },
  { id: 'ra_ine', name: 'Rune Ra Ine', code: 'Ra Ine', weight: 10, statEffect: '+10 Intelligence', category: 'Carac', imgUrl: 'https://api.dofusdb.fr/img/items/78039.png', itemId: '1553' },
  { id: 'pa_ine', name: 'Rune Pa Ine', code: 'Pa Ine', weight: 3, statEffect: '+3 Intelligence', category: 'Carac', imgUrl: 'https://api.dofusdb.fr/img/items/78038.png', itemId: '1547' },
  { id: 'ine', name: 'Rune Ine', code: 'Ine', weight: 1, statEffect: '+1 Intelligence', category: 'Carac', imgUrl: 'https://api.dofusdb.fr/img/items/78037.png', itemId: '1522' },
  { id: 'ra_age', name: 'Rune Ra Age', code: 'Ra Age', weight: 10, statEffect: '+10 Agilité', category: 'Carac', imgUrl: 'https://api.dofusdb.fr/img/items/78048.png', itemId: '1555' },
  { id: 'pa_age', name: 'Rune Pa Age', code: 'Pa Age', weight: 3, statEffect: '+3 Agilité', category: 'Carac', imgUrl: 'https://api.dofusdb.fr/img/items/78047.png', itemId: '1549' },
  { id: 'age', name: 'Rune Age', code: 'Age', weight: 1, statEffect: '+1 Agilité', category: 'Carac', imgUrl: 'https://api.dofusdb.fr/img/items/78046.png', itemId: '1524' },
  { id: 'ra_cha', name: 'Rune Ra Cha', code: 'Ra Cha', weight: 10, statEffect: '+10 Chance', category: 'Carac', imgUrl: 'https://api.dofusdb.fr/img/items/78042.png', itemId: '1556' },
  { id: 'pa_cha', name: 'Rune Pa Cha', code: 'Pa Cha', weight: 3, statEffect: '+3 Chance', category: 'Carac', imgUrl: 'https://api.dofusdb.fr/img/items/78041.png', itemId: '1550' },
  { id: 'cha', name: 'Rune Cha', code: 'Cha', weight: 1, statEffect: '+1 Chance', category: 'Carac', imgUrl: 'https://api.dofusdb.fr/img/items/78040.png', itemId: '1525' },
  { id: 'pui', name: 'Rune Pui', code: 'Pui', weight: 5, statEffect: '+1 Puissance', category: 'Carac', imgUrl: 'https://api.dofusdb.fr/img/items/78016.png', itemId: '7436' },

  // Dommages
  { id: 'pa_do', name: 'Rune Pa Do', code: 'Pa Do', weight: 60, statEffect: '+3 Dommages', category: 'Dommages' },
  { id: 'do', name: 'Rune Do', code: 'Do', weight: 20, statEffect: '+1 Dommage', category: 'Dommages', imgUrl: 'https://api.dofusdb.fr/img/items/78015.png', itemId: '7435' },
  { id: 'do_terre', name: 'Rune Do Terre', code: 'Do Terre', weight: 5, statEffect: '+1 Dommages Terre', category: 'Dommages', imgUrl: 'https://api.dofusdb.fr/img/items/78065.png', itemId: '11657' },
  { id: 'do_feu', name: 'Rune Do Feu', code: 'Do Feu', weight: 5, statEffect: '+1 Dommages Feu', category: 'Dommages', imgUrl: 'https://api.dofusdb.fr/img/items/78063.png', itemId: '11659' },
  { id: 'do_eau', name: 'Rune Do Eau', code: 'Do Eau', weight: 5, statEffect: '+1 Dommages Eau', category: 'Dommages', imgUrl: 'https://api.dofusdb.fr/img/items/78061.png', itemId: '11661' },
  { id: 'do_air', name: 'Rune Do Air', code: 'Do Air', weight: 5, statEffect: '+1 Dommages Air', category: 'Dommages', imgUrl: 'https://api.dofusdb.fr/img/items/78067.png', itemId: '11663' },
  { id: 'do_neutre', name: 'Rune Do Neutre', code: 'Do Neutre', weight: 5, statEffect: '+1 Dommages Neutre', category: 'Dommages', imgUrl: 'https://api.dofusdb.fr/img/items/78069.png', itemId: '11665' },
  { id: 'do_cri', name: 'Rune Do Cri', code: 'Do Cri', weight: 5, statEffect: '+1 Dommage Critique', category: 'Dommages', imgUrl: 'https://api.dofusdb.fr/img/items/78073.png', itemId: '11653' },
  { id: 'do_pou', name: 'Rune Do Pou', code: 'Do Pou', weight: 5, statEffect: '+1 Dommage Poussée', category: 'Dommages', imgUrl: 'https://api.dofusdb.fr/img/items/78081.png', itemId: '11649' },
  { id: 'cri', name: 'Rune Cri', code: 'Cri', weight: 10, statEffect: '+1 Coup Critique', category: 'Dommages', imgUrl: 'https://api.dofusdb.fr/img/items/78014.png', itemId: '7433' },

  // Résistances % et Fixes
  { id: 're_neutre', name: 'Rune Ré Per Neutre', code: 'Ré Per Neutre', weight: 6, statEffect: '+1% Résistance Neutre', category: 'Resistances', imgUrl: 'https://api.dofusdb.fr/img/items/78057.png', itemId: '7460' },
  { id: 're_terre', name: 'Rune Ré Per Terre', code: 'Ré Per Terre', weight: 6, statEffect: '+1% Résistance Terre', category: 'Resistances', imgUrl: 'https://api.dofusdb.fr/img/items/78034.png', itemId: '7459' },
  { id: 're_feu', name: 'Rune Ré Per Feu', code: 'Ré Per Feu', weight: 6, statEffect: '+1% Résistance Feu', category: 'Resistances', imgUrl: 'https://api.dofusdb.fr/img/items/78028.png', itemId: '7457' },
  { id: 're_eau', name: 'Rune Ré Per Eau', code: 'Ré Per Eau', weight: 6, statEffect: '+1% Résistance Eau', category: 'Resistances', imgUrl: 'https://api.dofusdb.fr/img/items/78030.png', itemId: '7560' },
  { id: 're_air', name: 'Rune Ré Per Air', code: 'Ré Per Air', weight: 6, statEffect: '+1% Résistance Air', category: 'Resistances', imgUrl: 'https://api.dofusdb.fr/img/items/78032.png', itemId: '7458' },
  { id: 're_f_neutre', name: 'Rune Ré Neutre', code: 'Ré Neutre', weight: 2, statEffect: '+1 Résistance Neutre', category: 'Resistances', imgUrl: 'https://api.dofusdb.fr/img/items/78058.png', itemId: '7456' },
  { id: 're_f_terre', name: 'Rune Ré Terre', code: 'Ré Terre', weight: 2, statEffect: '+1 Résistance Terre', category: 'Resistances', imgUrl: 'https://api.dofusdb.fr/img/items/78035.png', itemId: '7455' },
  { id: 're_f_feu', name: 'Rune Ré Feu', code: 'Ré Feu', weight: 2, statEffect: '+1 Résistance Feu', category: 'Resistances', imgUrl: 'https://api.dofusdb.fr/img/items/78029.png', itemId: '7452' },
  { id: 're_f_eau', name: 'Rune Ré Eau', code: 'Ré Eau', weight: 2, statEffect: '+1 Résistance Eau', category: 'Resistances', imgUrl: 'https://api.dofusdb.fr/img/items/78031.png', itemId: '7454' },
  { id: 're_f_air', name: 'Rune Ré Air', code: 'Ré Air', weight: 2, statEffect: '+1 Résistance Air', category: 'Resistances', imgUrl: 'https://api.dofusdb.fr/img/items/78033.png', itemId: '7453' },
  { id: 're_pm', name: 'Rune Ré Pme', code: 'Es PM', weight: 4, statEffect: '+1 Résistance PM', category: 'Resistances', imgUrl: 'https://api.dofusdb.fr/img/items/78085.png', itemId: '11643' },

  // Esquives (Résistances PA/PM officielles : 11641-11644)
  { id: 're_pa', name: 'Rune Ré Pa', code: 'Es PA', weight: 4, statEffect: '+1 Résistance PA', category: 'Resistances', imgUrl: 'https://api.dofusdb.fr/img/items/78083.png', itemId: '11641' },
  { id: 'pa_re_pa', name: 'Rune Pa Ré Pa', code: 'Pa Es PA', weight: 12, statEffect: '+3 Résistance PA', category: 'Resistances', imgUrl: 'https://api.dofusdb.fr/img/items/78084.png', itemId: '11642' },
  { id: 'pa_re_pm', name: 'Rune Pa Ré Pme', code: 'Pa Es PM', weight: 12, statEffect: '+3 Résistance PM', category: 'Resistances', imgUrl: 'https://api.dofusdb.fr/img/items/78086.png', itemId: '11644' },
  // Retrait PA / PM ("Rune Ret Pa" / "Rune Ret Pme")
  { id: 'ret_pa', name: 'Rune Ret Pa', code: 'Ret Pa', weight: 7, statEffect: '+1 Retrait PA', category: 'Utilitaires', imgUrl: 'https://api.dofusdb.fr/img/items/78087.png', itemId: '11645' },
  { id: 'pa_ret_pa', name: 'Rune Pa Ret Pa', code: 'Pa Ret Pa', weight: 21, statEffect: '+3 Retrait PA', category: 'Utilitaires', imgUrl: 'https://api.dofusdb.fr/img/items/78088.png', itemId: '11646' },
  { id: 'ret_pm', name: 'Rune Ret Pme', code: 'Ret Pme', weight: 7, statEffect: '+1 Retrait PM', category: 'Utilitaires', imgUrl: 'https://api.dofusdb.fr/img/items/78089.png', itemId: '11647' },
  { id: 'pa_ret_pm', name: 'Rune Pa Ret Pme', code: 'Pa Ret Pme', weight: 21, statEffect: '+3 Retrait PM', category: 'Utilitaires', imgUrl: 'https://api.dofusdb.fr/img/items/78090.png', itemId: '11648' },

  // Utilitaires (Tacle, Fuite, Prospection, Pods, Initiative)
  { id: 'pa_tac', name: 'Rune Pa Tac', code: 'Pa Tac', weight: 12, statEffect: '+3 Tacle', category: 'Utilitaires', imgUrl: 'https://api.dofusdb.fr/img/items/78078.png', itemId: '11640' },
  { id: 'tac', name: 'Rune Tac', code: 'Tac', weight: 4, statEffect: '+1 Tacle', category: 'Utilitaires', imgUrl: 'https://api.dofusdb.fr/img/items/78077.png', itemId: '11639' },
  { id: 'pa_fui', name: 'Rune Pa Fui', code: 'Pa Fui', weight: 12, statEffect: '+3 Fuite', category: 'Utilitaires', imgUrl: 'https://api.dofusdb.fr/img/items/78075.png', itemId: '11638' },
  { id: 'fui', name: 'Rune Fui', code: 'Fui', weight: 4, statEffect: '+1 Fuite', category: 'Utilitaires', imgUrl: 'https://api.dofusdb.fr/img/items/78076.png', itemId: '11637' },
  { id: 'ra_pod', name: 'Rune Ra Pod', code: 'Ra Pod', weight: 2.5, statEffect: '+100 Pods', category: 'Utilitaires', imgUrl: 'https://api.dofusdb.fr/img/items/78022.png', itemId: '7445' },
  { id: 'pa_pod', name: 'Rune Pa Pod', code: 'Pa Pod', weight: 0.75, statEffect: '+30 Pods', category: 'Utilitaires', imgUrl: 'https://api.dofusdb.fr/img/items/78021.png', itemId: '7444' },
  { id: 'pod', name: 'Rune Pod', code: 'Pod', weight: 0.25, statEffect: '+10 Pods', category: 'Utilitaires', imgUrl: 'https://api.dofusdb.fr/img/items/78020.png', itemId: '7443' },
  { id: 'ra_ini', name: 'Rune Ra Ini', code: 'Ra Ini', weight: 1, statEffect: '+100 Initiative', category: 'Utilitaires', imgUrl: 'https://api.dofusdb.fr/img/items/78027.png', itemId: '7450' },
  { id: 'pa_ini', name: 'Rune Pa Ini', code: 'Pa Ini', weight: 0.3, statEffect: '+30 Initiative', category: 'Utilitaires', imgUrl: 'https://api.dofusdb.fr/img/items/78026.png', itemId: '7449' },
  { id: 'ini', name: 'Rune Ini', code: 'Ini', weight: 0.1, statEffect: '+10 Initiative', category: 'Utilitaires', imgUrl: 'https://api.dofusdb.fr/img/items/78025.png', itemId: '7448' },
  { id: 'prospe', name: 'Rune Prospe', code: 'Prospe', weight: 3, statEffect: '+1 Prospection', category: 'Utilitaires', imgUrl: 'https://api.dofusdb.fr/img/items/78036.png', itemId: '7451' },
];

export const DOFUS_MOCK_ITEMS: DofusItem[] = [
  // INGRÉDIENTS & RESSOURCES DE BASE (Pour le lookup des prix et les crafts)
  { _id: 'ing_frene', name: 'Bois de Frêne', type: 'Bois', level: 1, dofusdbId: 303, imgUrl: 'https://api.dofusdb.fr/img/items/38017.png' },
  { _id: 'ing_chataignier', name: 'Bois de Châtaignier', type: 'Bois', level: 20, dofusdbId: 473, imgUrl: 'https://api.dofusdb.fr/img/items/38086.png' },
  { _id: 'ing_chene', name: 'Bois de Chêne', type: 'Bois', level: 40, dofusdbId: 460, imgUrl: 'https://api.dofusdb.fr/img/items/38092.png' },
  { _id: 'ing_cuivre', name: 'Minerai de Cuivre', type: 'Minerai', level: 20, dofusdbId: 441, imgUrl: 'https://api.dofusdb.fr/img/items/39108.png' },
  { _id: 'ing_bronze', name: 'Minerai de Bronze', type: 'Minerai', level: 40, dofusdbId: 442, imgUrl: 'https://api.dofusdb.fr/img/items/39109.png' },
  { _id: 'ing_laine_bouftou', name: 'Laine de Bouftou', type: 'Ressource', level: 5, dofusdbId: 384, imgUrl: 'https://api.dofusdb.fr/img/items/57056.png' },
  { _id: 'ing_laine_bouftou_guerre', name: 'Laine de Bouftou Chef de Guerre', type: 'Ressource', level: 15, imgUrl: 'https://api.dofusdb.fr/img/items/57056.png' },
  { _id: 'ing_corne_bouftou', name: 'Corne de Bouftou', type: 'Ressource', level: 5, imgUrl: 'https://api.dofusdb.fr/img/items/47055.png' },
  { _id: 'ing_cuir_bouftou', name: 'Cuir de Bouftou', type: 'Ressource', level: 5, imgUrl: 'https://api.dofusdb.fr/img/items/56016.png' },
  { _id: 'ing_plume_piou_bleu', name: 'Plume de Piou Bleu', type: 'Plume', level: 1, dofusdbId: 6897, imgUrl: 'https://api.dofusdb.fr/img/items/53114.png' },
  { _id: 'ing_bec_piou', name: 'Bec de Piou', type: 'Ressource', level: 1, imgUrl: 'https://api.dofusdb.fr/img/items/47037.png' },
  { _id: 'ing_trefle', name: 'Trèfle à 5 feuilles', type: 'Fleur', level: 1, dofusdbId: 395, imgUrl: 'https://api.dofusdb.fr/img/items/36067.png' },
  { _id: 'ing_eau', name: 'Eau de source', type: 'Ressource', level: 1, dofusdbId: 311, imgUrl: 'https://api.dofusdb.fr/img/items/15026.png' },
  { _id: 'ing_riz', name: 'Riz grain', type: 'Céréale', level: 20, dofusdbId: 7018, imgUrl: 'https://api.dofusdb.fr/img/items/34010.png' },
  { _id: 'ing_fiole', name: 'Fiole de Pandapils', type: 'Ressource', level: 10, dofusdbId: 7047, imgUrl: 'https://api.dofusdb.fr/img/items/79179.png' },
  { _id: 'ing_orge', name: 'Orge brute', type: 'Céréale', level: 20, dofusdbId: 400, imgUrl: 'https://api.dofusdb.fr/img/items/34082.png' },
  { _id: 'ing_seigle', name: 'Seigle sauvage', type: 'Céréale', level: 40, dofusdbId: 532, imgUrl: 'https://api.dofusdb.fr/img/items/34083.png' },
  { _id: 'ing_goujon', name: 'Goujon frais', type: 'Poisson', level: 1, dofusdbId: 1782, imgUrl: 'https://api.dofusdb.fr/img/items/41294.png' },
  { _id: 'ing_truite', name: 'Truite arc-en-ciel', type: 'Poisson', level: 20, dofusdbId: 1844, imgUrl: 'https://api.dofusdb.fr/img/items/41394.png' },
  { _id: 'ing_viande_intangible', name: 'Viande Intangible', type: 'Viande', level: 1, dofusdbId: 16663, imgUrl: 'https://api.dofusdb.fr/img/items/63407.png' },
  { _id: 'ing_viande_bouftou', name: 'Viande de Bouftou', type: 'Viande', level: 10, imgUrl: 'https://api.dofusdb.fr/img/items/69112.png' },
  { _id: 'ing_sel', name: 'Pincée de Sel', type: 'Ressource', level: 1, dofusdbId: 11143, imgUrl: 'https://api.dofusdb.fr/img/items/24833.png' },
  { _id: 'ing_sabot_bouftou', name: 'Sabot de Bouftou', type: 'Ressource', level: 5, imgUrl: 'https://api.dofusdb.fr/img/items/47539.png' },
  { _id: 'ing_silicate', name: 'Silicate cristallin', type: 'Minerai', level: 50, dofusdbId: 7032, imgUrl: 'https://api.dofusdb.fr/img/items/39111.png' },
  { _id: 'ing_or', name: 'Minerai d\'Or', type: 'Minerai', level: 100, dofusdbId: 313, imgUrl: 'https://api.dofusdb.fr/img/items/39022.png' },
  { _id: 'ing_etain', name: 'Minerai d\'Étain', type: 'Minerai', level: 60, dofusdbId: 444, imgUrl: 'https://api.dofusdb.fr/img/items/39078.png' },
  { _id: 'ing_bauxite', name: 'Minerai de Bauxite', type: 'Minerai', level: 80, dofusdbId: 446, imgUrl: 'https://api.dofusdb.fr/img/items/39076.png' },
  { _id: 'ing_seve_tremble', name: 'Sève de Tremble', type: 'Sève', level: 180, dofusdbId: 16926, imgUrl: 'https://api.dofusdb.fr/img/items/179018.png' },
  { _id: 'ing_huile_friture', name: 'Huile de Friture', type: 'Ressource', level: 1, imgUrl: 'https://api.dofusdb.fr/img/items/60061.png' },

  // ITEMS CRAFTABLES PAR MÉTIER

  // 1. Forgeron
  {
    _id: 'forge_epee_boisaille',
    name: 'Épée de Boisaille',
    type: 'Épée',
    level: 1,
    dofusdbId: 44,
    imgUrl: 'https://api.dofusdb.fr/img/items/6007.png',
    job: 'Forgeron',
    recipe: [
      { 'Bois de Frêne': { id: 'ing_frene', quantity: '2' } },
      { 'Fer': { id: '312', quantity: '2' } }
    ]
  },
  {
    _id: 'forge_hache_boisaille',
    name: 'Hache de Boisaille',
    type: 'Hache',
    level: 10,
    imgUrl: 'https://api.dofusdb.fr/img/items/6007.png',
    job: 'Forgeron',
    recipe: [
      { 'Bois de Frêne': { id: 'ing_frene', quantity: '5' } },
      { 'Fer': { id: '312', quantity: '5' } },
      { 'Minerai de Cuivre': { id: 'ing_cuivre', quantity: '2' } }
    ]
  },

  // 2. Sculpteur
  {
    _id: 'sculp_baguette_boisaille',
    name: 'Baguette de Boisaille',
    type: 'Baguette',
    level: 1,
    dofusdbId: 134,
    imgUrl: 'https://api.dofusdb.fr/img/items/3008.png',
    job: 'Sculpteur',
    recipe: [
      { 'Bois de Frêne': { id: 'ing_frene', quantity: '4' } }
    ]
  },
  {
    _id: 'sculp_arc_boisaille',
    name: 'Arc de Boisaille',
    type: 'Arc',
    level: 10,
    dofusdbId: 91,
    imgUrl: 'https://api.dofusdb.fr/img/items/2001.png',
    job: 'Sculpteur',
    recipe: [
      { 'Bois de Frêne': { id: 'ing_frene', quantity: '6' } },
      { 'Bois de Châtaignier': { id: 'ing_chataignier', quantity: '2' } }
    ]
  },

  // 3. Tailleur
  {
    _id: 'taille_coiffe_aventurier',
    name: 'Coiffe de l\'Aventurier',
    type: 'Chapeau',
    level: 1,
    imgUrl: 'https://api.dofusdb.fr/img/items/16041.png',
    job: 'Tailleur',
    recipe: [
      { 'Plume de Piou Bleu': { id: 'ing_plume_piou_bleu', quantity: '1' } }
    ]
  },
  {
    _id: 'taille_coiffe_bouftou',
    name: 'Coiffe du Bouftou',
    type: 'Chapeau',
    level: 10,
    dofusdbId: 2411,
    imgUrl: 'https://api.dofusdb.fr/img/items/16041.png',
    job: 'Tailleur',
    recipe: [
      { 'Laine de Bouftou': { id: 'ing_laine_bouftou', quantity: '10' } },
      { 'Laine de Bouftou Chef de Guerre': { id: 'ing_laine_bouftou_guerre', quantity: '10' } }
    ]
  },

  // 4. Bijoutier
  {
    _id: 'bijou_anneau_aventurier',
    name: 'Anneau de l\'Aventurier',
    type: 'Anneau',
    level: 1,
    imgUrl: 'https://api.dofusdb.fr/img/items/1048.png',
    job: 'Bijoutier',
    recipe: [
      { 'Fer': { id: '312', quantity: '1' } }
    ]
  },
  {
    _id: 'bijou_amulette_bouftou',
    name: 'Amulette du Bouftou',
    type: 'Amulette',
    level: 10,
    dofusdbId: 2425,
    imgUrl: 'https://api.dofusdb.fr/img/items/1048.png',
    job: 'Bijoutier',
    recipe: [
      { 'Laine de Bouftou': { id: 'ing_laine_bouftou', quantity: '15' } },
      { 'Corne de Bouftou': { id: 'ing_corne_bouftou', quantity: '2' } }
    ]
  },

  // 5. Cordonnier
  {
    _id: 'cordo_ceinture_aventurier',
    name: 'Ceinture de l\'Aventurier',
    type: 'Ceinture',
    level: 1,
    imgUrl: 'https://api.dofusdb.fr/img/items/56016.png',
    job: 'Cordonnier',
    recipe: [
      { 'Cuir de Bouftou': { id: 'ing_cuir_bouftou', quantity: '1' } }
    ]
  },
  {
    _id: 'cordo_bottes_bouftou',
    name: 'Bottes de Bouftou',
    type: 'Bottes',
    level: 10,
    imgUrl: 'https://api.dofusdb.fr/img/items/11010.png',
    job: 'Cordonnier',
    recipe: [
      { 'Cuir de Bouftou': { id: 'ing_cuir_bouftou', quantity: '10' } },
      { 'Laine de Bouftou': { id: 'ing_laine_bouftou', quantity: '5' } }
    ]
  },

  // 6. Mineur
  {
    _id: 'mine_aluminite',
    name: 'Aluminite',
    type: 'Alliage',
    level: 20,
    dofusdbId: 747,
    imgUrl: 'https://api.dofusdb.fr/img/items/40660.png',
    job: 'Mineur',
    recipe: [
      { 'Fer': { id: '312', quantity: '10' } },
      { 'Minerai de Cuivre': { id: 'ing_cuivre', quantity: '10' } },
      { 'Minerai de Bronze': { id: 'ing_bronze', quantity: '10' } }
    ]
  },
  {
    _id: 'mine_pyrute',
    name: 'Pyrute',
    type: 'Alliage',
    level: 100,
    dofusdbId: 7035,
    imgUrl: 'https://api.dofusdb.fr/img/items/40708.png',
    job: 'Mineur',
    recipe: [
      { 'Silicate cristallin': { id: 'ing_silicate', quantity: '10' } },
      { 'Minerai d\'Or': { id: 'ing_or', quantity: '10' } },
      { 'Minerai d\'Étain': { id: 'ing_etain', quantity: '10' } },
      { 'Minerai de Bauxite': { id: 'ing_bauxite', quantity: '10' } }
    ]
  },

  // 7. Bûcheron
  {
    _id: 'buch_planche_salut',
    name: 'Planche de Salut',
    type: 'Planche',
    level: 20,
    dofusdbId: 16499,
    imgUrl: 'https://api.dofusdb.fr/img/items/95023.png',
    job: 'Bûcheron',
    recipe: [
      { 'Bois de Frêne': { id: 'ing_frene', quantity: '20' } },
      { 'Bois de Châtaignier': { id: 'ing_chataignier', quantity: '10' } }
    ]
  },
  {
    _id: 'buch_substrat_sylvestre',
    name: 'Substrat de Sylvestre',
    type: 'Substrat',
    level: 40,
    imgUrl: 'https://api.dofusdb.fr/img/items/26017.png',
    job: 'Bûcheron',
    recipe: [
      { 'Sève de Tremble': { id: 'ing_seve_tremble', quantity: '2' } },
      { 'Bois de Frêne': { id: 'ing_frene', quantity: '10' } },
      { 'Bois de Chêne': { id: 'ing_chene', quantity: '10' } }
    ]
  },

  // 8. Alchimiste
  {
    _id: 'alchi_potion_rappel',
    name: 'Potion de Rappel',
    type: 'Potion',
    level: 1,
    dofusdbId: 548,
    imgUrl: 'https://api.dofusdb.fr/img/items/12017.png',
    job: 'Alchimiste',
    recipe: [
      { 'Trèfle à 5 feuilles': { id: 'ing_trefle', quantity: '4' } },
      { 'Eau de source': { id: 'ing_eau', quantity: '1' } }
    ]
  },
  {
    _id: 'alchi_potion_bonta',
    name: 'Potion de Cité : Bonta',
    type: 'Potion',
    level: 20,
    imgUrl: 'https://api.dofusdb.fr/img/items/12017.png',
    job: 'Alchimiste',
    recipe: [
      { 'Riz grain': { id: 'ing_riz', quantity: '5' } },
      { 'Fiole de Pandapils': { id: 'ing_fiole', quantity: '1' } }
    ]
  },

  // 9. Paysan
  {
    _id: 'pays_briochette',
    name: 'Briochette',
    type: 'Pain',
    level: 40,
    dofusdbId: 2024,
    imgUrl: 'https://api.dofusdb.fr/img/items/33015.png',
    job: 'Paysan',
    recipe: [
      { 'Orge brute': { id: 'ing_orge', quantity: '10' } },
      { 'Seigle sauvage': { id: 'ing_seigle', quantity: '5' } }
    ]
  },

  // 10. Pêcheur
  {
    _id: 'pech_goujon_frit',
    name: 'Goujon Frit',
    type: 'Poisson préparé',
    level: 1,
    imgUrl: 'https://api.dofusdb.fr/img/items/49083.png',
    job: 'Pêcheur',
    recipe: [
      { 'Goujon frais': { id: 'ing_goujon', quantity: '4' } },
      { 'Huile de Friture': { id: 'ing_huile_friture', quantity: '1' } }
    ]
  },
  {
    _id: 'pech_poisson_pane',
    name: 'Poisson Pané',
    type: 'Poisson préparé',
    level: 20,
    dofusdbId: 1750,
    imgUrl: 'https://api.dofusdb.fr/img/items/41269.png',
    job: 'Pêcheur',
    recipe: [
      { 'Truite arc-en-ciel': { id: 'ing_truite', quantity: '4' } }
    ]
  },

  // 11. Chasseur
  {
    _id: 'chass_viande_conservee',
    name: 'Viande Conservée',
    type: 'Viande préparée',
    level: 1,
    imgUrl: 'https://api.dofusdb.fr/img/items/49083.png',
    job: 'Chasseur',
    recipe: [
      { 'Viande Intangible': { id: 'ing_viande_intangible', quantity: '4' } }
    ]
  },
  {
    _id: 'chass_steak_bouftou',
    name: 'Steak de Bouftou Cuit',
    type: 'Viande préparée',
    level: 10,
    imgUrl: 'https://api.dofusdb.fr/img/items/49083.png',
    job: 'Chasseur',
    recipe: [
      { 'Viande de Bouftou': { id: 'ing_viande_bouftou', quantity: '4' } },
      { 'Pincée de Sel': { id: 'ing_sel', quantity: '1' } }
    ]
  },

  // 12. Bricoleur
  {
    _id: 'brico_clef_incarnam',
    name: 'Clef du Donjon d\'Incarnam',
    type: 'Clef',
    level: 10,
    imgUrl: 'https://api.dofusdb.fr/img/items/6007.png',
    job: 'Bricoleur',
    recipe: [
      { 'Plume de Piou Bleu': { id: 'ing_plume_piou_bleu', quantity: '5' } },
      { 'Bec de Piou': { id: 'ing_bec_piou', quantity: '5' } }
    ]
  },
  {
    _id: 'brico_clef_bouftou',
    name: 'Clef du Donjon des Bouftous',
    type: 'Clef',
    level: 20,
    imgUrl: 'https://api.dofusdb.fr/img/items/6007.png',
    job: 'Bricoleur',
    recipe: [
      { 'Laine de Bouftou': { id: 'ing_laine_bouftou', quantity: '10' } },
      { 'Corne de Bouftou': { id: 'ing_corne_bouftou', quantity: '10' } },
      { 'Sabot de Bouftou': { id: 'ing_sabot_bouftou', quantity: '1' } }
    ]
  },

  // 13. Façonneur
  {
    _id: 'facon_bouclier_bois',
    name: 'Bouclier en Bois',
    type: 'Bouclier',
    level: 1,
    imgUrl: 'https://api.dofusdb.fr/img/items/82020.png',
    job: 'Façonneur',
    recipe: [
      { 'Bois de Frêne': { id: 'ing_frene', quantity: '10' } }
    ]
  },
  {
    _id: 'facon_bouclier_bouftou',
    name: 'Bouclier du Bouftou',
    type: 'Bouclier',
    level: 20,
    dofusdbId: 18666,
    imgUrl: 'https://api.dofusdb.fr/img/items/82020.png',
    job: 'Façonneur',
    recipe: [
      { 'Cuir de Bouftou': { id: 'ing_cuir_bouftou', quantity: '10' } },
      { 'Corne de Bouftou': { id: 'ing_corne_bouftou', quantity: '5' } }
    ]
  },

  // 14. Éleveur (Breeding utility items)
  {
    _id: 'elev_abreuvoir_frene',
    name: 'Abreuvoir en Frêne',
    type: 'Objet d\'élevage',
    level: 20,
    imgUrl: 'https://api.dofusdb.fr/img/items/95023.png',
    job: 'Éleveur',
    recipe: [
      { 'Bois de Frêne': { id: 'ing_frene', quantity: '20' } },
      { 'Fer': { id: '312', quantity: '10' } }
    ]
  },
  {
    _id: 'elev_foudroyeur_frene',
    name: 'Foudroyeur en Frêne',
    type: 'Objet d\'élevage',
    level: 20,
    imgUrl: 'https://api.dofusdb.fr/img/items/95023.png',
    job: 'Éleveur',
    recipe: [
      { 'Bois de Frêne': { id: 'ing_frene', quantity: '20' } },
      { 'Bois de Châtaignier': { id: 'ing_chataignier', quantity: '10' } },
      { 'Fer': { id: '312', quantity: '5' } }
    ]
  }
];

export const DOFUS_JOBS = [
  'Alchimiste',
  'Bijoutier',
  'Bricoleur',
  'Bûcheron',
  'Chasseur',
  'Cordonnier',
  'Éleveur',
  'Façonneur',
  'Forgeron',
  'Mineur',
  'Paysan',
  'Pêcheur',
  'Sculpteur',
  'Tailleur'
];
