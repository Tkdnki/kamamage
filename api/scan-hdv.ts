import type { VercelRequest, VercelResponse } from '@vercel/node';

// Durée maximale d'exécution de la fonction Vercel (en secondes). On garde une
// marge par rapport au timeout interne Groq (GROQ_TIMEOUT_MS) pour que la
// fonction réponde en JSON propre AVANT que Vercel ne coupe avec une page HTML.
export const maxDuration = 30;

// Nombre max de réessais après un échec de validation JSON du modèle (tentatives = retries + 1).
const MAX_JSON_RETRIES = 2;

// Timeout de sécurité sur l'appel Groq Vision : on coupe à 7,5s.
//
// IMPORTANT — Vercel HOBBY tue les Serverless Functions au bout de 10s (504).
// Ce timeout doit donc rester NETTEMENT sous les 10s : si Groq dépasse 7,5s,
// l'AbortController coupe la requête et renvoie un JSON propre 504
// { error: 'Timeout Groq' } AVANT que Vercel ne coupe l'exécution en plein vol
// (page HTML "Unexpected token 'A'"). Le maxDuration configuré plus haut est
// ignoré/plafonné à 10s sur le plan gratuit : on ne peut pas compter dessus.
const GROQ_TIMEOUT_MS = 7500;

// Index de rotation Round-Robin : alterne la clé de départ à chaque requête
// pour répartir la charge sur toutes les clés Groq configurées.
let currentKeyIndex = 0;

/**
 * Résout la liste des clés Groq utilisables :
 * - La clé personnalisée du client (BYOK) prime toujours (une seule clé).
 * - Sinon on lit GROQ_API_KEYS (séparées par des virgules) puis GROQ_API_KEY.
 */
function resolveApiKeys(customKey?: string): string[] {
  if (customKey?.trim()) return [customKey.trim()];
  const raw = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '';
  return raw.split(',').map(k => k.trim()).filter(Boolean);
}

// Prompt système STRICT : le modèle vision doit renvoyer UNIQUEMENT un objet JSON valide.
const SYSTEM_PROMPT = `Tu es un extracteur de données STRICT pour l'Hôtel de Vente (HDV) du jeu Dofus.
Règles impératives :
1. Tu DOIS répondre UNIQUEMENT par un objet JSON valide.
2. N'ajoute AUCUN texte avant ou après l'objet JSON : pas d'explication, pas de salutation, pas de commentaire.
3. N'utilise PAS de balises markdown (pas de \`\`\`json ni de \`\`\`).
4. N'invente JAMAIS de nom ni de prix : toute valeur non visible dans l'image doit être 0.
5. Recopie les noms d'items exactement comme ils apparaissent (orthographe et accents).
6. INTERDICTION de dupliquer une même valeur entre "price_x1" et "price_x10" : chaque lot a SON prix propre. Si tu n'es pas certain d'un lot, mets 0 plutôt que de recopier un autre lot.
7. Si la case du lot "1" (price_x1) est vide ou non visible, force "price_x1" à 0 : NE DÉCALE JAMAIS le prix du lot "10" (price_x10) vers "price_x1".
8. Format JSON STRICT obligatoire : chaque item DOIT contenir exactement les clés "price_x1", "price_x10", "price_x100", "price_x1000" avec des nombres entiers (jamais de texte, jamais de virgules ni d'espaces dans les chiffres).`;

interface AiItem {
  name?: string;
  prices?: { x1?: number | string; x10?: number | string; x100?: number | string; x1000?: number | string } | null;
  // Format STRICT imposé au modèle (prompt v2) : chaque lot à son niveau propre.
  price_x1?: number | string;
  price_x10?: number | string;
  price_x100?: number | string;
  price_x1000?: number | string;
}
interface AiResponse {
  items?: AiItem[] | null;
}

const normalizeItemName = (name: string): string => {
  return name
    .replace(/['''`']/g, "'")
    .trim();
};

// Convertit toute valeur en entier positif (0 si indéfinie, non numérique ou
// négative). Nettoie les espaces/points/virgules de séparation des milliers.
function cleanPrice(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? Math.max(0, Math.floor(val)) : 0;
  if (typeof val === 'string') {
    const digits = val.replace(/\D+/g, '');
    return digits ? parseInt(digits, 10) : 0;
  }
  return 0;
}

// POST-TRAITEMENT de sécurité : corrige les erreurs OCR classiques sur les prix
// Dofus (décalage de colonne / doublon x1-x10) AVANT d'envoyer la donnée au client.
// Règles :
// 1. Si x1 === x10 (> 0) → x1 = 0 : la valeur de x1 est en réalité celle du lot x10.
// 2. Si x1 > x10 (et x10 > 0) → décalage d'une colonne : x100 = x10, x10 = x1, x1 = 0.
// 3. Toute valeur indéfinie ou non numérique → 0.
function applyPriceFixRules(raw: {
  x1?: unknown; x10?: unknown; x100?: unknown; x1000?: unknown;
}): { x1: number; x10: number; x100: number; x1000: number } {
  let x1 = cleanPrice(raw.x1);
  let x10 = cleanPrice(raw.x10);
  let x100 = cleanPrice(raw.x100);
  let x1000 = cleanPrice(raw.x1000);

  // Doublon x1 === x10 : x1 porte la valeur du lot x10 → on le neutralise.
  if (x1 > 0 && x1 === x10) {
    x1 = 0;
  }
  // Décalage x1 > x10 : la grille OCR est décalée d'une colonne (x1 contient en
  // réalité le prix du lot x10, x10 celui du lot x100). On décale tout vers le bas.
  else if (x10 > 0 && x1 > x10) {
    x1000 = x100;
    x100 = x10;
    x10 = x1;
    x1 = 0;
  }

  return { x1, x10, x100, x1000 };
}

function sanitizeResponse(data: AiResponse): AiResponse {
  if (!data?.items || !Array.isArray(data.items)) return data;
  return {
    items: data.items.map(item => {
      // L'IA renvoie désormais les clés strictes "price_xN" (prompt v2) ;
      // on accepte en repli l'ancien format "prices.xN".
      const prices = applyPriceFixRules({
        x1: item.price_x1 ?? item.prices?.x1,
        x10: item.price_x10 ?? item.prices?.x10,
        x100: item.price_x100 ?? item.prices?.x100,
        x1000: item.price_x1000 ?? item.prices?.x1000,
      });
      return {
        name: normalizeItemName(typeof item.name === 'string' ? item.name : ''),
        prices,
      };
    })
  };
}

// Extraction robuste du JSON : nettoie les éventuels blocs markdown ou texte parasite ajouté par l'IA.
function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // cas 1 : réponse entourée de balises markdown ```json ... ```
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      try {
        return JSON.parse(fenced[1].trim()) as unknown;
      } catch { /* on continue */ }
    }
    // cas 2 : extraire le premier objet JSON {...} de la réponse
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
      } catch { /* on continue */ }
    }
    throw new Error('La réponse du modèle ne contient pas de JSON exploitable.');
  }
}

interface GroqVisionResult {
  ok: boolean;
  status: number;
  body: {
    choices?: { message?: { content?: string } }[];
    error?: { code?: string; message?: string };
  } | null;
  rawText: string;
  headers: Headers;
  isJsonValidationError: boolean;
  /** Vrai si l'appel a été interrompu par le timeout interne (GROQ_TIMEOUT_MS). */
  timedOut: boolean;
}

// "Rate limit reached. Please try again in 10.5s" (Groq inclut souvent le délai recommandé).
const RETRY_AFTER_RE = /(?:try again in|retry in|wait)\s+(\d+(?:\.\d+)?)\s*s?/i;

// Extrait le délai d'attente (en secondes) conseillé par Groq depuis le message
// d'erreur ou l'en-tête `Retry-After` de la réponse.
function extractRetryAfter(result: GroqVisionResult): number | undefined {
  const message = result.body?.error?.message || result.rawText || '';
  const match = message.match(RETRY_AFTER_RE);
  if (match) return parseFloat(match[1]);
  const header = result.headers.get('retry-after');
  if (header) {
    const parsed = parseFloat(header);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}

// Marqueurs de QUOTA QUOTIDIEN chez Groq (Tokens Per Day / Requests Per Day) :
// ex. "Rate limit reached for organisation: ... for tokens per day. ..." ou
// "Daily limit reached for organisation: ...". Contrairement au rate-limit par
// minute (RPM/TPM), ce quota ne se réinitialise qu'à minuit UTC : une pause de
// quelques secondes est donc inutile.
const DAILY_LIMIT_RE = /(?:tokens?|requests?)\s+per\s+day|daily\s+(?:tokens?|requests?)\s+limit|daily\s+limit\s+reached|\bTPD\b|\bRPD\b/i;

// Détecte si une erreur 429 de Groq concerne le quota quotidien (TPD/RPD).
function isDailyLimitError(result: GroqVisionResult): boolean {
  const message = result.body?.error?.message || result.rawText || '';
  return DAILY_LIMIT_RE.test(message);
}

async function callGroqVision(apiKey: string, model: string, systemPrompt: string, promptText: string, imageUrl: string): Promise<GroqVisionResult> {
  // Timeout de sécurité : interrompt l'appel Groq à GROQ_TIMEOUT_MS. Si la coupe
  // survient, on renvoie un résultat marqué `timedOut` (JSON propre côté client)
  // au lieu de laisser la requête pendre jusqu'à la limite Vercel (maxDuration).
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: promptText },
              {
                type: 'image_url',
                image_url: { url: imageUrl }
              }
            ]
          }
        ],
        // Mode JSON strict Groq : la réponse DOIT être un objet JSON valide.
        response_format: { type: 'json_object' },
        // Température très basse pour forcer un rendu déterministe.
        temperature: 0.1,
        // Plafond de tokens de sortie : l'extraction HDV est courte (quelques
        // items). Limiter la sortie accélère la réponse du modèle 27B et évite
        // des générations longues qui frôleraient la limite Vercel (10s).
        max_tokens: 512
      }),
      signal: controller.signal
    });

    const rawText = await response.text();
    let body: { choices?: { message?: { content?: string } }[]; error?: { code?: string; message?: string } } | null = null;
    try {
      body = JSON.parse(rawText) as typeof body;
    } catch { /* corps non-JSON (rare) */ }

    const isJsonValidationError =
      response.status === 400 &&
      (body?.error?.code === 'json_validate_failed' || rawText.includes('json_validate_failed'));

    return { ok: response.ok, status: response.status, body, rawText, headers: response.headers, isJsonValidationError, timedOut: false };
  } catch (err: unknown) {
    // Interruption volontaire par notre AbortController (GROQ_TIMEOUT_MS) :
    // on signale le timeout pour que le handler réponde en JSON propre.
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, status: 0, body: null, rawText: '', headers: new Headers(), isJsonValidationError: false, timedOut: true };
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * FALLBACK GEMINI : si Groq renvoie un 429 (Rate Limit / TPM saturé) ou un
 * timeout, et qu'une clé GEMINI_API_KEY est configurée côté Vercel, on réessaie
 * l'OCR Vision sur Google Gemini (gemini-1.5-flash, rapide et bon en OCR).
 * Renvoie un résultat au même format que callGroqVision pour réutiliser la
 * boucle de traitement (parse/sanitize). Retourne un statut 429 si Gemini est
 * indisponible pour que le client conserve son comportement de pause.
 */
async function callGeminiVision(geminiKey: string, systemPrompt: string, promptText: string, imageUrl: string): Promise<GroqVisionResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

  // Gemini attend l'image en base64 "inline_data", sans préfixe mime.
  const base64 = imageUrl.includes(',') ? imageUrl.split(',')[1] : imageUrl;

  try {
    const content = [
      { text: `${systemPrompt}\n\n${promptText}` },
      {
        inline_data: {
          mime_type: 'image/jpeg',
          data: base64,
        },
      },
    ];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: content }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 512,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      },
    );

    const rawText = await response.text();
    let geminiBody: { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } } | null = null;
    try {
      geminiBody = JSON.parse(rawText) as typeof geminiBody;
    } catch { /* corps non-JSON */ }

    // Reconstruit un corps compatible Groq-ROMAN pour la boucle de parsing.
    const contentText = geminiBody?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ?? '';
    const body: GroqVisionResult['body'] = contentText
      ? { choices: [{ message: { content: contentText } }] }
      : { error: { message: geminiBody?.error?.message || 'Réponse Gemini vide' } };

    return {
      ok: response.ok && !!contentText,
      status: response.status,
      body,
      rawText,
      headers: response.headers,
      isJsonValidationError: false,
      timedOut: false,
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, status: 0, body: null, rawText: '', headers: new Headers(), isJsonValidationError: false, timedOut: true };
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
  }

  const customKey = req.headers['x-custom-groq-key'] as string | undefined;
  const apiKeys = resolveApiKeys(customKey);
  if (apiKeys.length === 0) {
    return res.status(500).json({
      error: 'Aucune clé API Groq configurée. Ajoutez GROQ_API_KEYS ou GROQ_API_KEY dans Environment Variables Vercel.'
    });
  }

  try {
    const { image, expectedName, targetedItemId, targetedItemName } = req.body || {};
    if (!image) {
      return res.status(400).json({ error: 'Aucune image fournie.' });
    }

    let imageUrl = image;
    if (!image.startsWith('data:')) {
      imageUrl = `data:image/png;base64,${image}`;
    }

    // Mode scan ciblé : l'utilisateur a déjà identifié l'item, on force l'IA à
    // n'extraire QUE les prix (l'OCR du nom est trop faillible).
    const isTargeted = Boolean(targetedItemId && targetedItemName);

    const nameHint = isTargeted
      ? `\nIMPORTANT — SCAN CIBLÉ : tu scannes UNIQUEMENT l'item « ${targetedItemName} ». Ne lis PAS le nom dans l'image, ne le devine PAS : extrais UNIQUEMENT les prix (x1, x10, x100, x1000) du lot affiché.`
      : expectedName
      ? `\nContexte : l'item attendu est "${expectedName}". Vérifie-le visuellement dans l'image mais concentre-toi sur l'extraction des prix.`
      : '';

    const promptText = `Analyse l'image ci-jointe de l'Hôtel de Vente (HDV) de Dofus et extrais TOUS les items visibles dans la fenêtre (l'item principal ET ses ingrédients).${nameHint}
Pour chaque item :
1. Le nom exact de l'item tel qu'il est écrit textuellement. NE MODIFIE PAS l'orthographe, recopie exactement les caractères visibles.
2. Les prix selon le type d'affichage de l'item :
   - Si l'item montre plusieurs lignes successives de lot "1" (cas typique des équipements et armes), prends **uniquement le prix le plus bas** (le tout premier en haut de la liste pour un lot de 1) et assigne-le à "price_x1". Mets "0" pour "price_x10", "price_x100" et "price_x1000".
   - Si c'est une ressource classique avec des lots de tailles différentes (1, 10, 100, 1000), extrait chaque prix dans son lot correspondant. Nettoie les espaces dans les grands chiffres (ex: "1 200 000" devient 1200000). Si un lot est absent ou non visible, mets 0.
   - NE DUPLIQUE JAMAIS la même valeur entre "price_x1" et "price_x10" : chaque lot a son prix propre.
   - Si la case du lot "1" est vide ou non visible, mets "price_x1" à 0 : ne décale JAMAIS "price_x10" vers "price_x1".

Réponds UNIQUEMENT avec un objet JSON valide au format exact suivant (SANS balises markdown) :
{
  "items": [
    {
      "name": "Nom exact de l'item",
      "price_x1": 0,
      "price_x10": 0,
      "price_x100": 0,
      "price_x1000": 0
    }
  ]
}

Si un seul item est visible, retourne-le dans le tableau avec un seul élément.`;

    // MODÈLE UNIQUE : Groq a retiré Llama 3.2 Vision et ne supporte plus que
    // `qwen/qwen3.6-27b` comme modèle Vision. On utilise UNIQUEMENT ce modèle
    // pour /api/scan-hdv (les autres identifiants répondent 404 model_not_found).
    // La détection dynamique /models est retirée : elle coûte un aller-retour
    // HTTP supplémentaire (temps précieux sous la limite Vercel de 10s) et le
    // modèle officiel est désormais stable.
    const visionModels = ['qwen/qwen3.6-27b'];

    // Prompt système adapté : en mode ciblé, l'IA ne doit JAMAIS lire/écrire le nom
    // de l'item, uniquement extraire les prix du lot affiché.
    const systemPrompt = isTargeted
      ? `${SYSTEM_PROMPT}\n\nSCAN CIBLÉ : l'item à analyser est « ${targetedItemName} ». Tu ne dois PAS lire, deviner ni écrire son nom. Concentre-toi UNIQUEMENT sur l'extraction des prix des lots 1, 10, 100 et 1000 visibles dans l'image.`
      : SYSTEM_PROMPT;

    // Tente le scan complet avec UNE clé donnée. Retourne un résultat typé pour
    // que la boucle multi-clés sache quoi faire (succès / quota / erreur JSON).
    const attemptWithKey = async (apiKey: string): Promise<
      | { kind: 'success'; payload: AiResponse & { tokens?: { remaining: number; limit: number; used: number } } }
      | { kind: 'quota'; status: number; retryAfter: number; isDailyLimit: boolean }
      | { kind: 'jsonValidationFailed'; detail: string }
      | { kind: 'timeout' }
      | { kind: 'modelFailure'; detail: string; details: Record<string, string> }
    > => {
      let lastError = '';
      let jsonValidationFailed = false;
      // Détail EXACT de l'erreur par modèle testé (pour le log console.error et
      // le retour JSON 500 détaillé si TOUS les modèles échouent).
      const modelErrors: Record<string, string> = {};

      for (const model of visionModels) {
        // Réessais automatiques en cas d'échec de validation JSON (l'IA peut réussir au 2e essai).
        for (let attempt = 0; attempt <= MAX_JSON_RETRIES; attempt++) {
          try {
            const result = await callGroqVision(apiKey, model, systemPrompt, promptText, imageUrl);

            // Timeout interne (GROQ_TIMEOUT_MS) : la marge restante avant la
            // limite Vercel (maxDuration) est trop courte pour réessayer une
            // autre clé/modèle → on renvoie immédiatement un JSON propre.
            if (result.timedOut) {
              console.warn(`[scan-hdv] ⏱️ Timeout Groq (${GROQ_TIMEOUT_MS}ms) sur "${model}".`);
              return { kind: 'timeout' };
            }

            // Erreurs de quota Groq (429 Rate Limit / 503 Over Capacity) : on
            // laisse la boucle multi-clés décider (basculement sur une autre clé).
            // NB : on distingue le rate-limit PAR MINUTE (RPM/TPM, pause de
            // quelques secondes) du QUOTA QUOTIDIEN (TPD/RPD, bloqué jusqu'à
            // minuit UTC) via le flag `isDailyLimit` transmis au client.
            if (result.status === 429 || result.status === 503) {
              console.warn(`[scan-hdv] Quota Groq (${result.status}) : ${(result.body?.error?.message || result.rawText).slice(0, 200)}`);
              return {
                kind: 'quota',
                status: result.status,
                retryAfter: extractRetryAfter(result) ?? 15,
                isDailyLimit: result.status === 429 && isDailyLimitError(result),
              };
            }

            if (result.ok) {
              const content = result.body?.choices?.[0]?.message?.content;
              if (content) {
                try {
                  const parsedData = parseJsonContent(content) as AiResponse;
                  console.log('[scan-hdv] IA brute:', JSON.stringify(parsedData));
                  const sanitized = sanitizeResponse(parsedData);

                  // Mode scan ciblé : on FORCE le nom exact de l'item ciblé sur le
                  // résultat final (on ignore les tentatives de l'IA d'identifier
                  // un nom), garantissant un upsert sur la bonne ligne Supabase.
                  if (isTargeted) {
                    const forcedPrices = sanitized.items?.[0]?.prices ?? { x1: 0, x10: 0, x100: 0, x1000: 0 };
                    sanitized.items = [{ name: targetedItemName as string, prices: forcedPrices }];
                  }

                  // Capacité cumulée des N clés (Round-Robin) : on multiplie le
                  // quota par le nombre de clés pour refléter le plafond réel de
                  // la file (ex: 2 clés × 8 000 = 16 000 tokens/min).
                  const keyCount = apiKeys.length;
                  const payload: AiResponse & { tokens?: { remaining: number; limit: number; used: number } } = {
                    ...sanitized,
                    tokens: {
                      remaining: (parseInt(result.headers.get('x-ratelimit-remaining-tokens') || '0', 10) * keyCount),
                      limit: (parseInt(result.headers.get('x-ratelimit-limit-tokens') || '0', 10) * keyCount),
                      used: (parseInt(result.headers.get('x-ratelimit-used-tokens') || '0', 10) * keyCount),
                    },
                  };
                  console.log('[scan-hdv] Sanitized:', JSON.stringify(payload));
                  return { kind: 'success', payload };
                } catch (parseErr: unknown) {
                  jsonValidationFailed = true;
                  lastError = `[${model}] ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`;
                  console.warn(`[scan-hdv] JSON illisible (${model}), tentative ${attempt + 1}/${MAX_JSON_RETRIES + 1}...`);
                  continue;
                }
              }
            }

            if (result.isJsonValidationError) {
              jsonValidationFailed = true;
              lastError = `[${model}] ${result.body?.error?.message || result.rawText.slice(0, 300)}`;
              console.warn(`[scan-hdv] Validation JSON échouée (${model}), tentative ${attempt + 1}/${MAX_JSON_RETRIES + 1}...`);
              continue;
            }

            // Modèle invalide / erreur HTTP (ex: 404 model_not_found) : on capture
            // le détail exact et on bascule sur le modèle suivant.
            lastError = `[${model}] ${result.status}: ${result.rawText.slice(0, 300)}`;
            modelErrors[model] = lastError;
            console.error(`[Groq OCR Error] Modèle ${model}:`, {
              status: result.status,
              message: result.body?.error?.message || result.rawText.slice(0, 300),
            });
            console.warn(`[scan-hdv] Modèle ${model} non valide (${result.status}), test du suivant...`);
            break;
          } catch (err: unknown) {
            lastError = `[${model}] Exception: ${err instanceof Error ? err.message : String(err)}`;
            modelErrors[model] = lastError;
            console.error('[Groq OCR Error] Modèle ${model} (Exception):', err);
            break;
          }
        }
      }

      if (jsonValidationFailed) {
        return { kind: 'jsonValidationFailed', detail: lastError };
      }
      return { kind: 'modelFailure', detail: lastError, details: modelErrors };
    };

    // ── FALLBACK GEMINI (dégradation gracieuse si Groq est saturé/timeout) ──
    // Exécute l'OCR Vision sur Google Gemini et, en cas de succès, renvoie un
    // payload identique à celui de Groq (mêmes règles de nettoyage, même mode
    // ciblé). Retourne null si Gemini n'est pas configuré ou a échoué.
    const geminiApiKey = process.env.GEMINI_API_KEY || '';
    const attemptGemini = async (): Promise<
      | { kind: 'success'; payload: AiResponse & { tokens?: { remaining: number; limit: number; used: number } } }
      | null
    > => {
      if (!geminiApiKey.trim()) return null;
      console.log('[scan-hdv] 🛰️ FALLBACK Gemini (Groq saturé/timeout) — tentative OCR Gemini...');
      const result = await callGeminiVision(geminiApiKey, systemPrompt, promptText, imageUrl);

      if (result.timedOut) {
        console.warn('[scan-hdv] ⏱️ Timeout Gemini également.');
        return null;
      }
      if (!result.ok) {
        console.warn(`[scan-hdv] Gemini échoué (${result.status}) : ${result.rawText.slice(0, 300)}`);
        return null;
      }

      const content = result.body?.choices?.[0]?.message?.content;
      if (!content) return null;

      try {
        const parsedData = parseJsonContent(content) as AiResponse;
        console.log('[scan-hdv] Gemini brut:', JSON.stringify(parsedData));
        const sanitized = sanitizeResponse(parsedData);

        if (isTargeted) {
          const forcedPrices = sanitized.items?.[0]?.prices ?? { x1: 0, x10: 0, x100: 0, x1000: 0 };
          sanitized.items = [{ name: targetedItemName as string, prices: forcedPrices }];
        }

        console.log('[scan-hdv] Gemini sanitized:', JSON.stringify(sanitized));
        return { kind: 'success', payload: sanitized };
      } catch (parseErr: unknown) {
        console.warn('[scan-hdv] JSON Gemini illisible :', parseErr instanceof Error ? parseErr.message : String(parseErr));
        return null;
      }
    };

    // Round-Robin : on démarre à la clé suivante (rotation par requête).
    const startKeyIndex = currentKeyIndex;
    let lastQuota: { status: number; retryAfter: number; isDailyLimit: boolean } | null = null;

    for (let keyOffset = 0; keyOffset < apiKeys.length; keyOffset++) {
      const keyIndex = (startKeyIndex + keyOffset) % apiKeys.length;
      const apiKey = apiKeys[keyIndex];

      const outcome = await attemptWithKey(apiKey);

      if (outcome.kind === 'success') {
        // Succès : on fait avancer la rotation pour la prochaine requête.
        currentKeyIndex = (keyIndex + 1) % apiKeys.length;
        return res.status(200).json(outcome.payload);
      }

      if (outcome.kind === 'quota') {
        lastQuota = { status: outcome.status, retryAfter: outcome.retryAfter, isDailyLimit: outcome.isDailyLimit };
        if (keyOffset < apiKeys.length - 1) {
          console.warn(`[Groq Multi-Key] Clé ${keyOffset + 1}/${apiKeys.length} bloquée (${outcome.status}), basculement...`);
          continue;
        }
        // Toutes les clés Groq sont saturées → fallback Gemini (si configuré)
        // avant de répondre 429 au client.
        const geminiOutcome = await attemptGemini();
        if (geminiOutcome) {
          return res.status(200).json(geminiOutcome.payload);
        }
        // Si le quota QUOTIDIEN est atteint (TPD/RPD), on le signale via
        // `isDailyLimit: true` pour que le client stoppe la file au lieu de
        // re-tenter en boucle avec une pause inutile.
        return res.status(outcome.status).json({
          error: outcome.isDailyLimit ? 'Quota journalier atteint' : (outcome.status === 429 ? 'Rate limit' : 'Service Unavailable'),
          isDailyLimit: outcome.isDailyLimit,
          retryAfter: outcome.retryAfter,
        });
      }

      if (outcome.kind === 'jsonValidationFailed') {
        return res.status(422).json({
          error: 'Le modèle vision n\'a pas produit de JSON valide.',
          detail: outcome.detail,
        });
      }

      if (outcome.kind === 'timeout') {
        // L'appel Groq a dépassé GROQ_TIMEOUT_MS : on tente Gemini en dernier
        // recours, sinon on répond JSON propre (504) plutôt que de laisser Vercel
        // couper la réponse avec une page HTML.
        const geminiOutcome = await attemptGemini();
        if (geminiOutcome) {
          return res.status(200).json(geminiOutcome.payload);
        }
        return res.status(504).json({ error: 'Timeout Groq' });
      }

      // Échec non-quota : pas de rotation, renvoyer l'erreur telle quelle, avec le
      // détail exact par modèle (logs Groq / 404 model_not_found / etc.).
      return res.status(500).json({
        error: 'Aucun modèle vision Groq fonctionnel.',
        detail: outcome.detail,
        details: outcome.details,
      });
    }

    // Cas limite : boucle terminée sans retour (ne devrait pas arriver).
    return res.status(lastQuota?.status ?? 500).json({
      error: lastQuota
        ? (lastQuota.isDailyLimit ? 'Quota journalier atteint' : (lastQuota.status === 429 ? 'Rate limit' : 'Service Unavailable'))
        : 'Erreur inconnue',
      isDailyLimit: lastQuota?.isDailyLimit,
      retryAfter: lastQuota?.retryAfter,
    });

  } catch (err: unknown) {
    console.error('Handler Error:', err);
    return res.status(500).json({ error: `Erreur serveur : ${err instanceof Error ? err.message : String(err)}` });
  }
}
