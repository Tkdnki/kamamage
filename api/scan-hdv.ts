import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ 
      error: 'La clé GEMINI_API_KEY est manquante sur Vercel.' 
    });
  }

  try {
    const { image } = req.body || {};
    if (!image) {
      return res.status(400).json({ error: 'Aucune image fournie dans la requête.' });
    }

    let mimeType = 'image/png';
    let base64Data = image;

    if (image.startsWith('data:')) {
      const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      } else {
        base64Data = image.replace(/^data:image\/\w+;base64,/, '');
      }
    }

    const promptText = `Tu es un extracteur de données ultra-précis pour l'Hôtel de Vente (HDV) du jeu Dofus.
Analyse cette capture d'écran HDV et extrait :
1. Le nom exact de l'item (ex: "Gelano", "Bois de Frêne", "Laine de Bouftou").
2. Les prix de vente associés aux lots (1, 10, 100, 1000). Si un lot n'est pas présent, mets 0.

Réponds EXCLUSIVEMENT avec un objet JSON au format strict suivant, sans aucun texte ou markdown :
{
  "item_name": "Nom de l'item",
  "prices": {
    "x1": 0,
    "x10": 0,
    "x100": 0,
    "x1000": 0
  }
}`;

    // Liste des modèles à tester par ordre de priorité
    const candidateModels = [
      'gemini-1.5-flash-002',
      'gemini-1.5-flash-8b',
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash',
      'gemini-2.0-flash'
    ];

    let lastError = '';

    for (const model of candidateModels) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: promptText },
                    { inline_data: { mime_type: mimeType, data: base64Data } }
                  ]
                }
              ],
              generationConfig: {
                response_mime_type: 'application/json',
                temperature: 0.1
              }
            })
          }
        );

        if (response.ok) {
          const data = await response.json();
          const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            const parsed = JSON.parse(rawText);
            return res.status(200).json(parsed);
          }
        } else {
          const errText = await response.text();
          lastError = `[${model}] ${response.status}: ${errText}`;
          console.warn(`Fallback: modèle ${model} indisponible, essai du suivant...`);
        }
      } catch (err: any) {
        lastError = `[${model}] Exception: ${err.message}`;
      }
    }

    return res.status(500).json({
      error: `Aucun modèle disponible sur votre clé. Dernière erreur : ${lastError}`
    });

  } catch (err: any) {
    return res.status(500).json({ error: `Erreur serveur : ${err.message || String(err)}` });
  }
}