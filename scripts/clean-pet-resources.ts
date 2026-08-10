/**
 * Audit et nettoyage automatique des ressources de familiers contre DofusDB.
 *
 * Pour chaque ressource de src/data/petXpResources.json :
 *   1. Applique les alias de nommage (NAME_ALIASES) → nom officiel DofusDB.
 *   2. Interroge l'API DofusDB (regex diacritique-insensible + repli mot significatif).
 *   3. Si un item exact correspond → conserver (et adopter le nom officiel DofusDB).
 *   4. Sinon → supprimer la ressource.
 *
 * Affiche un rapport récapitulatif et réécrit le JSON nettoyé (dédoublonné).
 *
 * Usage : npx tsx scripts/clean-pet-resources.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookupDofusdbName, normalizeName, applyAlias } from './dofusdb-audit';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TARGET = join(ROOT, 'src', 'data', 'petXpResources.json');

const CONCURRENCY = 12;
const RETRY_LIMIT = 3;

interface Resource {
  name: string;
  xp: number;
}

interface CleanResult {
  /** Nom conservé dans le JSON final */
  name: string;
  xp: number;
  /** Nom d'origine (dataset) */
  originalName: string;
  /** 'kept' | 'renamed' | 'removed' */
  status: 'kept' | 'renamed' | 'removed';
}

/**
 * Exécute `task` en limitant la concurrence et en retentant en cas d'échec
 * réseau (timeout / HTTP 5xx).
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  task: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  const worker = async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      let lastError: unknown;
      for (let attempt = 0; attempt < RETRY_LIMIT; attempt++) {
        try {
          results[index] = await task(items[index], index);
          lastError = undefined;
          break;
        } catch (err) {
          lastError = err;
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        }
      }
      if (lastError !== undefined) {
        // En dernier recours on marque la ressource "removed" (introuvable vu le réseau KO)
        const item = items[index] as { name: string; xp?: number };
        results[index] = {
          name: item.name,
          xp: item.xp ?? 0,
          originalName: item.name,
          status: 'removed',
        } as R;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

async function auditResources(resources: Resource[]): Promise<CleanResult[]> {
  const results = await mapWithConcurrency(
    resources,
    async (res): Promise<CleanResult> => {
      const aliased = applyAlias(res.name);
      const official = await lookupDofusdbName(aliased);

      if (!official) {
        return { name: res.name, xp: res.xp, originalName: res.name, status: 'removed' };
      }

      const status: CleanResult['status'] = normalizeName(official) !== normalizeName(res.name) ? 'renamed' : 'kept';
      return { name: official, xp: res.xp, originalName: res.name, status };
    },
    CONCURRENCY,
  );
  return results;
}

/**
 * Dédoublonne par nom normalisé : conserve la première occurrence, en
 * préférant la forme officielle DofusDB quand plusieurs orthographes coexistent.
 */
function dedupe(results: CleanResult[]): CleanResult[] {
  const seen = new Map<string, CleanResult>();
  for (const r of results) {
    if (r.status === 'removed') continue;
    const key = normalizeName(r.name);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, r);
      continue;
    }
    // Si la nouvelle entrée est une forme officielle (ou plus courte/EXACTE), on remplace
    const existingIsOfficial = existing.originalName === existing.name;
    const newIsOfficial = r.originalName === r.name;
    if (newIsOfficial && !existingIsOfficial) {
      seen.set(key, r);
    } else if (existing.originalName !== r.originalName && !newIsOfficial && !existingIsOfficial) {
      // Deux orthographes non officielles : on garde la première, on merge XP
      seen.set(key, { ...existing, xp: Math.max(existing.xp, r.xp) });
    } else {
      seen.set(key, { ...existing, xp: Math.max(existing.xp, r.xp) });
    }
  }
  return [...seen.values()];
}

async function main() {
  const raw = JSON.parse(readFileSync(TARGET, 'utf8')) as Resource[];
  const sourceCount = raw.length;

  const results = await auditResources(raw);
  const removed = results.filter((r) => r.status === 'removed');
  const renamed = results.filter((r) => r.status === 'renamed');
  const kept = results.filter((r) => r.status === 'kept');

  const deduped = dedupe(results);

  writeFileSync(TARGET, JSON.stringify(deduped.map(({ name, xp }) => ({ name, xp })), null, 2) + '\n', 'utf8');

  const dupRemoved = results.length - removed.length - deduped.length;

  console.log('=== Rapport d\'audit DofusDB des ressources familiers ===');
  console.log(`Source : ${sourceCount} ressources`);
  console.log(`✔ Constatés valides : ${kept.length} (nom inchangé)`);
  console.log(`↻ Renommés vers le nom officiel DofusDB : ${renamed.length}`);
  console.log(`✘ Supprimés (introuvables sur DofusDB) : ${removed.length}`);
  console.log(`⇒ Fusionnés (doublons d'orthographe) : ${dupRemoved}`);
  console.log(`✔ Écrits dans ${TARGET} : ${deduped.length}`);

  if (renamed.length > 0) {
    console.log('\n— Détail des renommages —');
    for (const r of renamed) {
      console.log(`  "${r.originalName}" → "${r.name}"`);
    }
  }

  if (removed.length > 0) {
    console.log('\n— Ressources supprimées (introuvables) —');
    for (const r of removed) {
      console.log(`  "${r.name}" (xp ${r.xp})`);
    }
  }
}

main().catch((err) => {
  console.error('Erreur fatale :', err);
  process.exit(1);
});