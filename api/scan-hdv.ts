import type { VercelRequest, VercelResponse } from '@vercel/node';

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: { text?: string }[];
    };
  }[];
}

interface ScanResult {
  item_name: string;
  prices: {
    x1: number;
    x10: number;
    x100: number;
    x1000: number;
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image } = req.body;
  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'Image (base64) requise' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY non configurée' });
  }

  const prompt =
    'Tu es un extracteur de données pour l\'Hôtel de Vente (HDV) du jeu Dofus. ' +
    'Analyse cette capture d\'écran et extrait au format JSON strict :\n' +
    '{\n' +
    '  "item_name": string (nom exact de l\'item),\n' +
    '  "prices": {\n' +
    '    "x1": number,\n' +
    '    "x10": number,\n' +
    '    "x100": number,\n' +
    '    "x1000": number\n' +
    '  }\n' +
    '}\n' +
    'Ne réponds rien d\'autre que l\'objet JSON.';

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inlineData: { mimeType: 'image/png', data: image } },
              ],
            },
          ],
        }),
      },
    );

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      console.error('[scan-hdv] Gemini error:', geminiRes.status, errorText);
      return res.status(502).json({ error: 'Erreur API Gemini', detail: errorText });
    }

    const data: GeminiResponse = await geminiRes.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(502).json({ error: 'Gemini n\'a rien retourné' });
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(502).json({ error: 'Format JSON attendu', raw: text });
    }

    const result: ScanResult = JSON.parse(jsonMatch[0]);

    if (!result.item_name || !result.prices) {
      return res.status(502).json({ error: 'JSON invalide', raw: jsonMatch[0] });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('[scan-hdv] Error:', err);
    return res.status(500).json({ error: 'Erreur interne' });
  }
}