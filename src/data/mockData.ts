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
}

export const DOFUS_RUNES: Rune[] = [
  // Exotiques / Majeurs
  { id: 'ga_pa', name: 'Rune Ga Pa', code: 'Ga Pa', weight: 100, statEffect: '+1 PA', category: 'Exotiques' },
  { id: 'ga_pme', name: 'Rune Ga Pme', code: 'Ga Pme', weight: 90, statEffect: '+1 PM', category: 'Exotiques' },
  { id: 'po', name: 'Rune Po', code: 'Po', weight: 51, statEffect: '+1 Portée', category: 'Exotiques' },
  { id: 'invoc', name: 'Rune Invoc', code: 'Invoc', weight: 30, statEffect: '+1 Invocation', category: 'Exotiques' },
  
  // Sagesse / Prospection / Soin
  { id: 'ra_sa', name: 'Rune Ra Sa', code: 'Ra Sa', weight: 30, statEffect: '+10 Sagesse', category: 'VigSagesse' },
  { id: 'pa_sa', name: 'Rune Pa Sa', code: 'Pa Sa', weight: 9, statEffect: '+3 Sagesse', category: 'VigSagesse' },
  { id: 'sa', name: 'Rune Sa', code: 'Sa', weight: 3, statEffect: '+1 Sagesse', category: 'VigSagesse' },
  { id: 'pa_so', name: 'Rune Pa So', code: 'Pa So', weight: 30, statEffect: '+3 Soins', category: 'VigSagesse' },
  { id: 'so', name: 'Rune So', code: 'So', weight: 10, statEffect: '+1 Soin', category: 'VigSagesse' },
  
  // Vitalité
  { id: 'ra_vi', name: 'Rune Ra Vi', code: 'Ra Vi', weight: 2.5, statEffect: '+10 Vitalité', category: 'Carac' },
  { id: 'pa_vi', name: 'Rune Pa Vi', code: 'Pa Vi', weight: 0.75, statEffect: '+3 Vitalité', category: 'Carac' },
  { id: 'vi', name: 'Rune Vi', code: 'Vi', weight: 0.25, statEffect: '+1 Vitalité', category: 'Carac' },

  // Stats Primaires (Force, Agi, Intel, Chance)
  { id: 'ra_fo', name: 'Rune Ra Fo', code: 'Ra Fo', weight: 10, statEffect: '+10 Force', category: 'Carac' },
  { id: 'pa_fo', name: 'Rune Pa Fo', code: 'Pa Fo', weight: 3, statEffect: '+3 Force', category: 'Carac' },
  { id: 'fo', name: 'Rune Fo', code: 'Fo', weight: 1, statEffect: '+1 Force', category: 'Carac' },
  
  { id: 'ra_ine', name: 'Rune Ra Ine', code: 'Ra Ine', weight: 10, statEffect: '+10 Intelligence', category: 'Carac' },
  { id: 'pa_ine', name: 'Rune Pa Ine', code: 'Pa Ine', weight: 3, statEffect: '+3 Intelligence', category: 'Carac' },
  { id: 'ine', name: 'Rune Ine', code: 'Ine', weight: 1, statEffect: '+1 Intelligence', category: 'Carac' },

  { id: 'ra_age', name: 'Rune Ra Age', code: 'Ra Age', weight: 10, statEffect: '+10 Agilité', category: 'Carac' },
  { id: 'pa_age', name: 'Rune Pa Age', code: 'Pa Age', weight: 3, statEffect: '+3 Agilité', category: 'Carac' },
  { id: 'age', name: 'Rune Age', code: 'Age', weight: 1, statEffect: '+1 Agilité', category: 'Carac' },

  { id: 'ra_cha', name: 'Rune Ra Cha', code: 'Ra Cha', weight: 10, statEffect: '+10 Chance', category: 'Carac' },
  { id: 'pa_cha', name: 'Rune Pa Cha', code: 'Pa Cha', weight: 3, statEffect: '+3 Chance', category: 'Carac' },
  { id: 'cha', name: 'Rune Chance', code: 'Cha', weight: 1, statEffect: '+1 Chance', category: 'Carac' },

  // Dommages
  { id: 'pa_do', name: 'Rune Pa Do', code: 'Pa Do', weight: 60, statEffect: '+3 Dommages', category: 'Dommages' },
  { id: 'do', name: 'Rune Do', code: 'Do', weight: 20, statEffect: '+1 Dommage', category: 'Dommages' },
  { id: 'do_cri', name: 'Rune Do Cri', code: 'Do Cri', weight: 5, statEffect: '+1 Dommage Critique', category: 'Dommages' },
  { id: 'do_pou', name: 'Rune Do Pou', code: 'Do Pou', weight: 5, statEffect: '+1 Dommage Poussée', category: 'Dommages' },
  { id: 'cri', name: 'Rune Cri', code: 'Cri', weight: 10, statEffect: '+1 Coup Critique', category: 'Dommages' },

  // Résistances % et Fixes
  { id: 're_neutre', name: 'Rune Re Neutre %', code: 'Re Neutre %', weight: 6, statEffect: '+1% Résistance Neutre', category: 'Resistances' },
  { id: 're_terre', name: 'Rune Re Terre %', code: 'Re Terre %', weight: 6, statEffect: '+1% Résistance Terre', category: 'Resistances' },
  { id: 're_feu', name: 'Rune Re Feu %', code: 'Re Feu %', weight: 6, statEffect: '+1% Résistance Feu', category: 'Resistances' },
  { id: 're_eau', name: 'Rune Re Eau %', code: 'Re Eau %', weight: 6, statEffect: '+1% Résistance Eau', category: 'Resistances' },
  { id: 're_air', name: 'Rune Re Air %', code: 'Re Air %', weight: 6, statEffect: '+1% Résistance Air', category: 'Resistances' },
  { id: 're_f_neutre', name: 'Rune Re Neutre (fixe)', code: 'Re Neutre', weight: 2, statEffect: '+1 Résistance Neutre', category: 'Resistances' },
  { id: 're_f_terre', name: 'Rune Re Terre (fixe)', code: 'Re Terre', weight: 2, statEffect: '+1 Résistance Terre', category: 'Resistances' },
  { id: 're_f_feu', name: 'Rune Re Feu (fixe)', code: 'Re Feu', weight: 2, statEffect: '+1 Résistance Feu', category: 'Resistances' },
  { id: 're_f_eau', name: 'Rune Re Eau (fixe)', code: 'Re Eau', weight: 2, statEffect: '+1 Résistance Eau', category: 'Resistances' },
  { id: 're_f_air', name: 'Rune Re Air (fixe)', code: 'Re Air', weight: 2, statEffect: '+1 Résistance Air', category: 'Resistances' },

  // Utilitaires (Tacle, Fuite, Prospection, Pods, Initiative)
  { id: 'pa_tac', name: 'Rune Pa Tac', code: 'Pa Tac', weight: 12, statEffect: '+3 Tacle', category: 'Utilitaires' },
  { id: 'tac', name: 'Rune Tac', code: 'Tac', weight: 4, statEffect: '+1 Tacle', category: 'Utilitaires' },
  { id: 'pa_fui', name: 'Rune Pa Fui', code: 'Pa Fui', weight: 12, statEffect: '+3 Fuite', category: 'Utilitaires' },
  { id: 'fui', name: 'Rune Fui', code: 'Fui', weight: 4, statEffect: '+1 Fuite', category: 'Utilitaires' },
  { id: 'ra_pod', name: 'Rune Ra Pod', code: 'Ra Pod', weight: 2.5, statEffect: '+100 Pods', category: 'Utilitaires' },
  { id: 'pa_pod', name: 'Rune Pa Pod', code: 'Pa Pod', weight: 0.75, statEffect: '+30 Pods', category: 'Utilitaires' },
  { id: 'pod', name: 'Rune Pod', code: 'Pod', weight: 0.25, statEffect: '+10 Pods', category: 'Utilitaires' },
  { id: 'ra_ini', name: 'Rune Ra Ini', code: 'Ra Ini', weight: 1, statEffect: '+100 Initiative', category: 'Utilitaires' },
  { id: 'pa_ini', name: 'Rune Pa Ini', code: 'Pa Ini', weight: 0.3, statEffect: '+30 Initiative', category: 'Utilitaires' },
  { id: 'ini', name: 'Rune Ini', code: 'Ini', weight: 0.1, statEffect: '+10 Initiative', category: 'Utilitaires' },
  { id: 'prospe', name: 'Rune Prospe', code: 'Prospe', weight: 3, statEffect: '+1 Prospection', category: 'Utilitaires' },
];

export const DOFUS_MOCK_ITEMS: DofusItem[] = [
  // INGRÉDIENTS & RESSOURCES DE BASE (Pour le lookup des prix et les crafts)
  { _id: 'ing_frene', name: 'Bois de Frêne', type: 'Bois', level: 1, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/303.png' },
  { _id: 'ing_chataignier', name: 'Bois de Châtaignier', type: 'Bois', level: 20, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/304.png' },
  { _id: 'ing_chene', name: 'Bois de Chêne', type: 'Bois', level: 40, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/305.png' },
  { _id: 'ing_fer', name: 'Minerai de Fer', type: 'Minerai', level: 1, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/311.png' },
  { _id: 'ing_cuivre', name: 'Minerai de Cuivre', type: 'Minerai', level: 20, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/312.png' },
  { _id: 'ing_bronze', name: 'Minerai de Bronze', type: 'Minerai', level: 40, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/313.png' },
  { _id: 'ing_laine_bouftou', name: 'Laine de Bouftou', type: 'Ressource', level: 5, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/460.png' },
  { _id: 'ing_laine_bouftou_guerre', name: 'Laine de Bouftou Chef de Guerre', type: 'Ressource', level: 15, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/2115.png' },
  { _id: 'ing_corne_bouftou', name: 'Corne de Bouftou', type: 'Ressource', level: 5, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/2113.png' },
  { _id: 'ing_cuir_bouftou', name: 'Cuir de Bouftou', type: 'Ressource', level: 5, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/2067.png' },
  { _id: 'ing_plume_piou_bleu', name: 'Plume de Piou Bleu', type: 'Plume', level: 1, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/2208.png' },
  { _id: 'ing_bec_piou', name: 'Bec de Piou', type: 'Ressource', level: 1, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/2200.png' },
  { _id: 'ing_trefle', name: 'Trèfle à 5 feuilles', type: 'Fleur', level: 1, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/422.png' },
  { _id: 'ing_eau', name: 'Eau de source', type: 'Ressource', level: 1, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/310.png' },
  { _id: 'ing_riz', name: 'Riz grain', type: 'Céréale', level: 20, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/1004.png' },
  { _id: 'ing_fiole', name: 'Fiole de Pandapils', type: 'Ressource', level: 10, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/2180.png' },
  { _id: 'ing_orge', name: 'Orge brute', type: 'Céréale', level: 20, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/290.png' },
  { _id: 'ing_seigle', name: 'Seigle sauvage', type: 'Céréale', level: 40, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/291.png' },
  { _id: 'ing_goujon', name: 'Goujon frais', type: 'Poisson', level: 1, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/598.png' },
  { _id: 'ing_truite', name: 'Truite arc-en-ciel', type: 'Poisson', level: 20, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/600.png' },
  { _id: 'ing_viande_intangible', name: 'Viande Intangible', type: 'Viande', level: 1, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/16200.png' },
  { _id: 'ing_viande_bouftou', name: 'Viande de Bouftou', type: 'Viande', level: 10, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/16205.png' },
  { _id: 'ing_sel', name: 'Pincée de Sel', type: 'Ressource', level: 1, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/1000.png' },
  { _id: 'ing_sabot_bouftou', name: 'Sabot de Bouftou', type: 'Ressource', level: 5, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/2114.png' },
  { _id: 'ing_silicate', name: 'Silicate cristallin', type: 'Minerai', level: 50, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/1012.png' },
  { _id: 'ing_or', name: 'Minerai d\'Or', type: 'Minerai', level: 100, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/314.png' },
  { _id: 'ing_etain', name: 'Minerai d\'Étain', type: 'Minerai', level: 60, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/316.png' },
  { _id: 'ing_bauxite', name: 'Minerai de Bauxite', type: 'Minerai', level: 80, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/317.png' },
  { _id: 'ing_seve_tremble', name: 'Sève de Tremble', type: 'Sève', level: 180, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/11054.png' },
  { _id: 'ing_huile_friture', name: 'Huile de Friture', type: 'Ressource', level: 1, imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/315.png' },

  // ITEMS CRAFTABLES PAR MÉTIER

  // 1. Forgeron
  {
    _id: 'forge_epee_boisaille',
    name: 'Épée de Boisaille',
    type: 'Épée',
    level: 1,
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/1001.png',
    job: 'Forgeron',
    recipe: [
      { 'Bois de Frêne': { id: 'ing_frene', quantity: '2' } },
      { 'Minerai de Fer': { id: 'ing_fer', quantity: '2' } }
    ]
  },
  {
    _id: 'forge_hache_boisaille',
    name: 'Hache de Boisaille',
    type: 'Hache',
    level: 10,
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/1501.png',
    job: 'Forgeron',
    recipe: [
      { 'Bois de Frêne': { id: 'ing_frene', quantity: '5' } },
      { 'Minerai de Fer': { id: 'ing_fer', quantity: '5' } },
      { 'Minerai de Cuivre': { id: 'ing_cuivre', quantity: '2' } }
    ]
  },

  // 2. Sculpteur
  {
    _id: 'sculp_baguette_boisaille',
    name: 'Baguette de Boisaille',
    type: 'Baguette',
    level: 1,
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/1201.png',
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
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/1301.png',
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
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/2411.png',
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
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/2416.png',
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
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/1009.png',
    job: 'Bijoutier',
    recipe: [
      { 'Minerai de Fer': { id: 'ing_fer', quantity: '1' } }
    ]
  },
  {
    _id: 'bijou_amulette_bouftou',
    name: 'Amulette du Bouftou',
    type: 'Amulette',
    level: 10,
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/1003.png',
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
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/1013.png',
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
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/1010.png',
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
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/1011.png',
    job: 'Mineur',
    recipe: [
      { 'Minerai de Fer': { id: 'ing_fer', quantity: '10' } },
      { 'Minerai de Cuivre': { id: 'ing_cuivre', quantity: '10' } },
      { 'Minerai de Bronze': { id: 'ing_bronze', quantity: '10' } }
    ]
  },
  {
    _id: 'mine_pyrute',
    name: 'Pyrute',
    type: 'Alliage',
    level: 100,
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/999.png',
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
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/306.png',
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
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/10006.png',
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
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/518.png',
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
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/512.png',
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
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/534.png',
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
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/601.png',
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
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/603.png',
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
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/16220.png',
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
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/16225.png',
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
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/10201.png',
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
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/10200.png',
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
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/9001.png',
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
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/9002.png',
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
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/6801.png',
    job: 'Éleveur',
    recipe: [
      { 'Bois de Frêne': { id: 'ing_frene', quantity: '20' } },
      { 'Minerai de Fer': { id: 'ing_fer', quantity: '10' } }
    ]
  },
  {
    _id: 'elev_foudroyeur_frene',
    name: 'Foudroyeur en Frêne',
    type: 'Objet d\'élevage',
    level: 20,
    imgUrl: 'https://s.ankama.com/www/static.ankama.com/dofus/www/game/items/200/6802.png',
    job: 'Éleveur',
    recipe: [
      { 'Bois de Frêne': { id: 'ing_frene', quantity: '20' } },
      { 'Bois de Châtaignier': { id: 'ing_chataignier', quantity: '10' } },
      { 'Minerai de Fer': { id: 'ing_fer', quantity: '5' } }
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
