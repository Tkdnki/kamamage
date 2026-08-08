/**
 * Extrait les ressources + XP familier depuis Ressources_XP_familier_lvl100.xlsx
 * (parse direct du XML OOXML, sans dépendance) et génère src/data/petXpResources.json
 * sous la forme [{ name, xp }].
 *
 * Usage : npx tsx scripts/extract-pet-xp.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const XLSX_SOURCE = join(ROOT, 'Ressources_XP_familier_lvl100.xlsx');

/**
 * Idoles retirées de Dofus : on exclut les ressources dont le nom correspond
 * exactement à l'une d'elles OU commence par leur nom (variantes "mineure",
 * "majeure", "magistrale"...). La comparaison est insensible à la casse et aux
 * accents, avec frontières de mot.
 */
const IDOL_BLACKLIST = [
  'Aroumb', 'Binar', 'Boboule', 'Corrozor', 'Dagore', 'Dakid',
  'Djim', 'Domak', 'Dynamo', 'Horam', 'Huluhu', 'Kyoub',
  'Lechane', 'Muta', 'Nekineko', 'Oubi', 'Paho', 'Penyu',
  'Peon', 'Peto', 'Prohim', 'Protes', 'Sak', 'Symphète',
  'Ultram', 'Yoche',
];

/** Normalise (minuscules, sans accents) — identique à l'app (lib/petXp.ts). */
function normalizeName(name: string): string {
  return name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Échappe les caractères spéciaux regex. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Vrai si le nom désigne une idole (exact ou "nom + suffixe"). */
function isIdolResource(name: string): boolean {
  const norm = normalizeName(name);
  if (!norm) return false;
  return IDOL_BLACKLIST.some(idol => {
    const i = normalizeName(idol);
    return new RegExp(`(^|\\W)${escapeRegExp(i)}(\\W|$)`, 'i').test(norm);
  });
}

/** Extrait toutes les toString() des noeuds <si> (shared strings). */
function extractStrings(sstXml: string): string[] {
  const out: string[] = [];
  const siRegex = /<si[^>]*>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRegex.exec(sstXml)) !== null) {
    const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let text = '';
    let tm: RegExpExecArray | null;
    while ((tm = tRegex.exec(m[1])) !== null) {
      text += tm[1];
    }
    out.push(text);
  }
  return out;
}

/** Dézip l'archive niveau central directory et lit les fichiers nommés. */
function readZip(): Record<string, Buffer> {
  const data = readFileSync(XLSX_SOURCE);
  const names: Record<string, Buffer> = {};
  let eocd = -1;
  for (let i = data.length - 22; i >= 0; i--) {
    if (data.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('EOCD introuvable');
  const count = data.readUInt16LE(eocd + 10);
  let cdOffset = data.readUInt32LE(eocd + 16);
  for (let c = 0; c < count; c++) {
    if (data.readUInt32LE(cdOffset) !== 0x02014b50) throw new Error('Signature central répertoire invalide');
    const method = data.readUInt16LE(cdOffset + 10);
    const compSize = data.readUInt32LE(cdOffset + 20);
    const nameLen = data.readUInt16LE(cdOffset + 28);
    const extraLen = data.readUInt16LE(cdOffset + 30);
    const commentLen = data.readUInt16LE(cdOffset + 32);
    const localOffset = data.readUInt32LE(cdOffset + 42);
    const name = data.subarray(cdOffset + 46, cdOffset + 46 + nameLen).toString('utf8');
    cdOffset += 46 + nameLen + extraLen + commentLen;
    if (data.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Signature locale invalide');
    const lNameLen = data.readUInt16LE(localOffset + 26);
    const lExtraLen = data.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = data.subarray(start, start + compSize);
    names[name] = method === 8 ? inflateRawSync(raw) : raw;
  }
  return names;
}

function main() {
  if (!existsSync(XLSX_SOURCE)) {
    throw new Error(`Fichier introuvable : ${XLSX_SOURCE}`);
  }
  const files = readZip();
  const sharedXml = Object.entries(files)
    .find(([k]) => k.endsWith('sharedStrings.xml'))?.[1]
    ?.toString('utf8') ?? '';
  const sheetXml = Object.entries(files)
    .find(([k]) => k.endsWith('worksheets/sheet1.xml'))?.[1]
    ?.toString('utf8') ?? '';
  const shared = extractStrings(sharedXml);

  const rows: string[][] = [];
  const rowRegex = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRegex.exec(sheetXml)) !== null) {
    const cells: string[] = [];
    const cellRegex = /<c\s+([^>]*)>(?:<v>([^<]*)<\/v>)?/g;
    const rowCells: Record<string, { type?: string; v?: string }> = {};
    let cm: RegExpExecArray | null;
    while ((cm = cellRegex.exec(m[1])) !== null) {
      const attrs = cm[1];
      const refMatch = /r="([A-Z]+)\d+"/.exec(attrs);
      const tMatch = /t="([^"]*)"/.exec(attrs);
      if (!refMatch) continue;
      rowCells[refMatch[1]] = { type: tMatch?.[1], v: cm[2] };
    }
    for (const col of ['A', 'B']) {
      const c = rowCells[col];
      if (!c) { cells.push(''); continue; }
      cells.push(c.type === 's' ? shared[Number(c.v)] : c.v ?? '');
    }
    rows.push(cells);
  }

  const resources: { name: string; xp: number }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const [name, xpRaw] = rows[i];
    if (!name) continue;
    const xp = Number(String(xpRaw ?? '').trim().replace(',', '.'));
    if (Number.isNaN(xp)) continue;
    const clean = name
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
    if (clean) resources.push({ name: clean, xp });
  }

  const target = join(ROOT, 'src', 'data', 'petXpResources.json');
  const filtered = resources.filter(r => !isIdolResource(r.name));
  writeFileSync(target, JSON.stringify(filtered, null, 2) + '\n', 'utf8');
  console.log(`✅ ${filtered.length} ressources écrites dans ${target} (${resources.length - filtered.length} idoles exclues)`);
  console.log('Aperçu (5 premiers) :', JSON.stringify(filtered.slice(0, 5)));
  console.log('Dernier échantillon :', JSON.stringify(filtered.slice(-3)));
  console.log('Aperçu des idoles exclues :', JSON.stringify(resources.filter(r => isIdolResource(r.name)).map(r => r.name).sort()));
}

import { existsSync } from 'node:fs';
main();