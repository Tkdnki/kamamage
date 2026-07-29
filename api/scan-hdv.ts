import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS & Méthode
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ 
      error: 'La clé GEMINI_API_KEY est manquante sur le serveur Vercel. Vérifiez les variables d\'environnement Vercel.' 
    });
  }

  try {
    const { image } = req.body || {};
    if (!image) {
      return res.status(400).json({ error: 'Aucune image fournie dans le corps de la requête.' });
    }

    // Extraction du mimeType et de la chaîne Base64 pure
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
2. Les prix de vente associés aux lots (1, 10, 100, 1000). Si un lot n'est pas présent sur l'image, mets 0.

Réponds EXCLUSIVEMENT avec un objet JSON au format strict suivant, sans aucun autre texte ou markdown :
{
  "item_name": "Nom de l'item",
  "prices": {
    "x1": 0,
    "x10": 0,
    "x100": 0,
    "x1000": 0
  }
}`;

    // Appel REST Gemini 1.5 Flash
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: promptText },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            response_mime_type: 'application/json',
            temperature: 0.1,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API Error:', errText);
      return res.status(response.status).json({ 
        error: `Erreur API Gemini (${response.status}): ${errText}` 
      });
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return res.status(500).json({ error: 'Gemini n\'a renvoyé aucune donnée exploitable.' });
    }

    // Parsing JSON
    const parsedData = JSON.parse(rawText);
    return res.status(200).json(parsedData);

  } catch (err: any) {
    console.error('Handler Error:', err);
    return res.status(500).json({ error: `Erreur serveur : ${err.message || String(err)}` });
  }
}