import * as fs from 'fs';
import * as path from 'path';

const DOFUSDB_BASE = 'https://api.dofusdb.fr';
const PER_PAGE = 200;

const JOBS: Record<string, number> = {
  Alchimiste: 26,
  Bijoutier: 16,
  Bricoleur: 65,
  Bûcheron: 2,
  Chasseur: 41,
  Cordonnier: 15,
  Éleveur: 79,
  Façonneur: 60,
  Forgeron: 11,
  Mineur: 24,
  Paysan: 28,
  Pêcheur: 36,
  Sculpteur: 13,
  Tailleur: 27,
};

// Ratio XP par jobId (doit être synchrone avec JOB_RECIPE_TYPE dans xp.ts)
// CRAFT_EQUIPMENT = ×20, TRANSFORMATION = ×1.3, RESOURCE_COLLECTION = ×4
const JOB_RATIO: Record<number, number> = {
  26: 1.3, // Alchimiste     → Transformation
  16: 20,  // Bijoutier      → Craft
  65: 20,  // Bricoleur      → Craft
  2: 4,    // Bûcheron       → Ressource
  41: 4,   // Chasseur       → Ressource
  15: 20,  // Cordonnier     → Craft
  79: 1.3, // Éleveur        → Transformation
  60: 1.3, // Façonneur      → Transformation
  11: 20,  // Forgeron       → Craft
  24: 4,   // Mineur         → Ressource
  28: 1.3, // Paysan         → Transformation
  36: 1.3, // Pêcheur        → Transformation
  13: 1.3, // Sculpteur      → Transformation
  27: 20,  // Tailleur       → Craft
};

interface Recipe {
  resultId: number;
  resultLevel: number;
  jobId: number;
}

interface PaginatedResponse {
  data: Recipe[];
}

async function fetchJobRecipes(jobId: number): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  let skip = 0;

  while (true) {
    const url = `${DOFUSDB_BASE}/recipes?jobId=${jobId}&$limit=${PER_PAGE}&$skip=${skip}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const json: PaginatedResponse = await res.json();
    const batch = json.data ?? [];
    if (batch.length === 0) break;

    const multiplier = JOB_RATIO[jobId] ?? 4;
    for (const recipe of batch) {
      const key = String(recipe.resultId);
      if (!(key in map)) {
        map[key] = recipe.resultLevel * multiplier;
      }
    }

    skip += batch.length;
    await new Promise(r => setTimeout(r, 100));
  }

  return map;
}

async function main() {
  const allXp: Record<string, number> = {};

  // Fetch jobs in parallel (4 at a time)
  const entries = Object.entries(JOBS);
  for (let i = 0; i < entries.length; i += 4) {
    const batch = entries.slice(i, i + 4);
    const results = await Promise.all(
      batch.map(([name, id]) =>
        (async () => {
          console.log(`Fetching ${name} (jobId=${id})...`);
          const xps = await fetchJobRecipes(id);
          const count = Object.keys(xps).length;
          console.log(`  → ${count} recipes`);
          return xps;
        })(),
      ),
    );
    for (const xps of results) Object.assign(allXp, xps);
  }

  const outputPath = path.resolve(process.cwd(), 'src', 'data', 'xp_database.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(allXp), 'utf-8');
  console.log(`\nDone! ${Object.keys(allXp).length} entries → ${outputPath}`);
  console.log('Note: L\'API DofusDB n\'expose plus le champ `experience`.');
  console.log('Chaque entrée est initialisée avec la règle niveau×4.');
  console.log('Modifie manuellement les valeurs dans xp_database.json pour les cas réels.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
