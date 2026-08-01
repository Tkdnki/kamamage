import type { VercelRequest, VercelResponse } from '@vercel/node';

// Nombre max de réessais après un échec de validation JSON du modèle (tentatives = retries + 1).
const MAX_JSON_RETRIES = 2;

// Prompt système STRICT : le modèle vision doit renvoyer UNIQUEMENT un objet JSON valide.
const SYSTEM_PROMPT = `Tu es un extracteur de données STRICT pour l'Hôtel de Vente (HDV) du jeu Dofus.
Règles impératives :
1. Tu DOIS répondre UNIQUEMENT par un objet JSON valide.
2. N'ajoute AUCUN texte avant ou après l'objet JSON : pas d'explication, pas de salutation, pas de commentaire.
3. N'utilise PAS de balises markdown (pas de \`\`\`json ni de \`\`\`).
4. N'invente JAMAIS de nom ni de prix : toute valeur non visible dans l'image doit être 0.
5. Recopie les noms d'items exactement comme ils apparaissent (orthographe et accents).`;

interface AiItem {
  name?: string;
  prices?: { x1?: number | string; x10?: number | string; x100?: number | string; x1000?: number | string } | null;
}
interface AiResponse {
  items?: AiItem[] | null;
}

const normalizeItemName = (name: string): string => {
  return name
    .replace(/['''`']/g, "'")
    .trim();
};

function cleanPrice(val: unknown): number {
  if (typeof val === 'string') return parseInt(val.replace(/\s+/g, ''), 10) || 0;
  return typeof val === 'number' ? val : 0;
}

function sanitizeResponse(data: AiResponse): AiResponse {
  if (!data?.items || !Array.isArray(data.items)) return data;
  return {
    items: data.items.map(item => ({
      name: normalizeItemName(typeof item.name === 'string' ? item.name : ''),
      prices: {
        x1: cleanPrice(item.prices?.x1),
        x10: cleanPrice(item.prices?.x10),
        x100: cleanPrice(item.prices?.x100),
        x1000: cleanPrice(item.prices?.x1000),
      }
    }))
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

async function callGroqVision(apiKey: string, model: string, systemPrompt: string, promptText: string, imageUrl: string): Promise<GroqVisionResult> {
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
      temperature: 0.1
    })
  });

  const rawText = await response.text();
  let body: { choices?: { message?: { content?: string } }[]; error?: { code?: string; message?: string } } | null = null;
  try {
    body = JSON.parse(rawText) as typeof body;
  } catch { /* corps non-JSON (rare) */ }

  const isJsonValidationError =
    response.status === 400 &&
    (body?.error?.code === 'json_validate_failed' || rawText.includes('json_validate_failed'));

  return { ok: response.ok, status: response.status, body, rawText, headers: response.headers, isJsonValidationError };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
  }

  const customKey = req.headers['x-custom-groq-key'] as string | undefined;
  const apiKey = customKey?.trim() || process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ 
      error: 'La clé GROQ_API_KEY est manquante sur Vercel. Ajoutez-la dans Environment Variables.' 
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
   - Si l'item montre plusieurs lignes successives de lot "1" (cas typique des équipements et armes), prends **uniquement le prix le plus bas** (le tout premier en haut de la liste pour un lot de 1) et assigne-le à "x1". Mets "0" pour "x10", "x100" et "x1000".
   - Si c'est une ressource classique avec des lots de tailles différentes (1, 10, 100, 1000), extrait chaque prix dans son lot correspondant. Nettoie les espaces dans les grands chiffres (ex: "1 200 000" devient 1200000). Si un lot est absent ou non visible, mets 0.

Réponds UNIQUEMENT avec un objet JSON valide au format exact suivant (SANS balises markdown) :
{
  "items": [
    {
      "name": "Nom exact de l'item",
      "prices": { "x1": 0, "x10": 0, "x100": 0, "x1000": 0 }
    }
  ]
}

Si un seul item est visible, retourne-le dans le tableau avec un seul élément.`;

    // Modèle Vision Groq actif actuel
    const visionModels = [
      'qwen/qwen3.6-27b'
    ];

    // Prompt système adapté : en mode ciblé, l'IA ne doit JAMAIS lire/écrire le nom
    // de l'item, uniquement extraire les prix du lot affiché.
    const systemPrompt = isTargeted
      ? `${SYSTEM_PROMPT}\n\nSCAN CIBLÉ : l'item à analyser est « ${targetedItemName} ». Tu ne dois PAS lire, deviner ni écrire son nom. Concentre-toi UNIQUEMENT sur l'extraction des prix des lots 1, 10, 100 et 1000 visibles dans l'image.`
      : SYSTEM_PROMPT;

    let lastError = '';
    let jsonValidationFailed = false;

    for (const model of visionModels) {
      // Réessais automatiques en cas d'échec de validation JSON (l'IA peut réussir au 2e essai).
      for (let attempt = 0; attempt <= MAX_JSON_RETRIES; attempt++) {
        try {
          const result = await callGroqVision(apiKey, model, systemPrompt, promptText, imageUrl);

          // Erreurs de quota Groq (429 Rate Limit / 503 Over Capacity) : remontées
          // telles quelles au frontend avec le délai d'attente recommandé, au lieu
          // de tester un autre modèle ou de renvoyer un 500. Inutile de réessayer
          // immédiatement, le quota ne se libère pas tout de suite.
          if (result.status === 429 || result.status === 503) {
            console.warn(`[scan-hdv] Quota Groq (${result.status}) : ${(result.body?.error?.message || result.rawText).slice(0, 200)}`);
            return res.status(result.status).json({
              error: result.status === 429 ? 'Rate limit' : 'Service Unavailable',
              retryAfter: extractRetryAfter(result) ?? 15,
            });
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

                const payload: AiResponse & { tokens?: { remaining: number; limit: number; used: number } } = {
                  ...sanitized,
                  tokens: {
                    remaining: parseInt(result.headers.get('x-ratelimit-remaining-tokens') || '0', 10),
                    limit: parseInt(result.headers.get('x-ratelimit-limit-tokens') || '0', 10),
                    used: parseInt(result.headers.get('x-ratelimit-used-tokens') || '0', 10),
                  },
                };
                console.log('[scan-hdv] Sanitized:', JSON.stringify(payload));
                return res.status(200).json(payload);
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

          lastError = `[${model}] ${result.status}: ${result.rawText.slice(0, 300)}`;
          console.warn(`[scan-hdv] Modèle ${model} non valide (${result.status}), test du suivant...`);
          break;
        } catch (err: unknown) {
          lastError = `[${model}] Exception: ${err instanceof Error ? err.message : String(err)}`;
          break;
        }
      }
    }

    // Erreur de validation JSON du modèle : réponse propre 422 (pas de crash 500).
    if (jsonValidationFailed) {
      return res.status(422).json({
        error: 'Le modèle vision n\'a pas produit de JSON valide.',
        detail: lastError,
      });
    }

    return res.status(500).json({
      error: `Aucun modèle vision Groq fonctionnel. Dernière erreur : ${lastError}`
    });

  } catch (err: unknown) {
    console.error('Handler Error:', err);
    return res.status(500).json({ error: `Erreur serveur : ${err instanceof Error ? err.message : String(err)}` });
  }
}
