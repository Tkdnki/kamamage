/**
 * Décodage des entités HTML courantes dans les noms d'objets DofusDB/JSON.
 * Remplace `&apos;`, `&#39;`, `&quot;`, `&amp;`, `&lt;`, `&gt;` par leur
 * caractère réel pour que "Bitte d&apos;amarrage" s'affiche "Bitte d'amarrage".
 *
 * NB : on décodera d'abord `&amp;` en dernier afin de ne pas recréer une entité
 * à partir d'une autre (ex: `&amp;apos;` → `&apos;` doit rester `&apos;`).
 */
export function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/g, '&');
}