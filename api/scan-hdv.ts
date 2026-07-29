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
      return res.status(400).json({ error: 'Aucune image fournie dans la requête.' });
    }

    // Formatage Data URI requis par Groq
    let imageUrl = image;
    if (!image.startsWith('data:')) {
      imageUrl = `data:image/png;base64,${image}`;
    }

    const promptText = `Tu es un extracteur de données ultra-précis pour l'Hôtel de Vente (HDV) du jeu Dofus.
Analyse cette capture d'écran HDV et extrait :
1. Le nom exact de l'item (ex: "Gelano", "Bois de Frêne", "Laine de Bouftou").
2. Les prix de vente associés aux lots (1, 10, 100, 1000). Si un lot n'est pas présent, mets 0.

Réponds EXCLUSIVEMENT sous la forme d'un objet JSON strict avec ce format :
{
  "item_name": "Nom de l'item",
  "prices": {
    "x1": 0,
    "x10": 0,
    "x100": 0,
    "x1000": 0
  }
}`;

    // Appel API REST Groq (Format compatible OpenAI)
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.2-11b-vision-preview',
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
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Groq API Error:', errText);
      return res.status(response.status).json({
        error: `Erreur API Groq (${response.status}): ${errText}`
      });
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;

    if (!rawContent) {
      return res.status(500).json({ error: 'Groq n\'a renvoyé aucun contenu.' });
    }

    const parsedData = JSON.parse(rawContent);
    return res.status(200).json(parsedData);

  } catch (err: any) {
    console.error('Handler Error:', err);
    return res.status(500).json({ error: `Erreur serveur : ${err.message || String(err)}` });
  }
}