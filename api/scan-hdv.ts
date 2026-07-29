import type { VercelRequest, VercelResponse } from '@vercel/node';

function normalize(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function cleanPrice(val: any): number {
  if (typeof val === 'string') return parseInt(val.replace(/\s+/g, ''), 10) || 0;
  return typeof val === 'number' ? val : 0;
}

function sanitizeResponse(data: any): any {
  if (!data || !data.items || !Array.isArray(data.items)) return data;
  return {
    items: data.items.map((item: any) => ({
      name: normalize(item.name || ''),
      prices: {
        x1: cleanPrice(item.prices?.x1),
        x10: cleanPrice(item.prices?.x10),
        x100: cleanPrice(item.prices?.x100),
        x1000: cleanPrice(item.prices?.x1000),
      }
    }))
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ 
      error: 'La clé GROQ_API_KEY est manquante sur Vercel. Ajoutez-la dans Environment Variables.' 
    });
  }

  try {
    const { image } = req.body || {};
    if (!image) {
      return res.status(400).json({ error: 'Aucune image fournie.' });
    }

    let imageUrl = image;
    if (!image.startsWith('data:')) {
      imageUrl = `data:image/png;base64,${image}`;
    }

    const promptText = `Tu es un extracteur de données ultra-stricte pour l'Hôtel de Vente (HDV) du jeu Dofus.
Analyse l'image fournie et extrait TOUS les items visibles dans la fenêtre (l'item principal ET ses ingrédients). Pour chaque item :
1. Le nom exact de l'item tel qu'il est écrit textuellement. NE MODIFIE PAS l'orthographe, recopie exactement les caractères visibles.
2. Les prix selon le type d'affichage de l'item :
   - Si l'item montre plusieurs lignes successives de lot "1" (cas typique des équipements et armes), prends **uniquement le prix le plus bas** (le tout premier en haut de la liste pour un lot de 1) et assigne-le à "x1". Mets "0" pour "x10", "x100" et "x1000".
   - Si c'est une ressource classique avec des lots de tailles différentes (1, 10, 100, 1000), extrait chaque prix dans son lot correspondant. Nettoie les espaces dans les grands chiffres (ex: "1 200 000" devient 1200000). Si un lot est absent ou non visible, mets 0.

Réponds uniquement avec un objet JSON strict au format :
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

    let lastError = '';

    for (const model of visionModels) {
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
            response_format: { type: 'json_object' },
            temperature: 0.1
          })
        });

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) {
            const parsedData = JSON.parse(content);
            console.log('[scan-hdv] IA brute:', JSON.stringify(parsedData));
            const sanitized = sanitizeResponse(parsedData);
            console.log('[scan-hdv] Sanitized:', JSON.stringify(sanitized));
            return res.status(200).json(sanitized);
          }
        } else {
          const errText = await response.text();
          lastError = `[${model}] ${response.status}: ${errText}`;
          console.warn(`Groq Fallback: modèle ${model} non valide, test du suivant...`);
        }
      } catch (err: any) {
        lastError = `[${model}] Exception: ${err.message}`;
      }
    }

    return res.status(500).json({
      error: `Aucun modèle vision Groq fonctionnel. Dernière erreur : ${lastError}`
    });

  } catch (err: any) {
    console.error('Handler Error:', err);
    return res.status(500).json({ error: `Erreur serveur : ${err.message || String(err)}` });
  }
}