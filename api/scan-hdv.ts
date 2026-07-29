import type { VercelRequest, VercelResponse } from '@vercel/node';

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

    const promptText = `Tu es un extracteur de données pour l'Hôtel de Vente (HDV) de Dofus.
Analyse l'image fournie et extrait :
1. Le nom exact de l'item.
2. Les prix associés aux lots (x1, x10, x100, x1000). Si un lot est absent, mets 0.

Réponds uniquement avec un objet JSON strict au format :
{
  "item_name": "Nom de l'item",
  "prices": {
    "x1": 0,
    "x10": 0,
    "x100": 0,
    "x1000": 0
  }
}`;

    // Modèles Vision Groq à tester par ordre de priorité
    const visionModels = [
      'llama-3.2-90b-vision-preview',
      'llama-3.2-11b-vision-instruct',
      'llama-3.2-90b-vision-instruct',
      'meta-llama/llama-3.2-11b-vision-instruct',
      'meta-llama/llama-3.2-90b-vision-instruct'
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
            return res.status(200).json(parsedData);
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