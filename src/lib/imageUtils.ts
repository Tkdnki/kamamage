/**
 * Redimensionne et compresse une image côté client avant l'envoi à l'API IA.
 *
 * Les captures HD/4K envoyées en base64 explosent le nombre de tokens par
 * requête vision (et donc le quota RPM/TPM du provider). On limite la plus
 * grande dimension à 400px et on ré-encode en JPEG 0.45 pour réduire fortement
 * le nombre de tokens vision envoyés à Groq (modèle Qwen 27B). Image plus
 * légère → réponse plus rapide (reste sous les 10s Vercel) et saturation du TPM
 * évitée (~<1500 tokens/image, plusieurs scans/minute sous le plafond de 8000).
 */

/** Dimension maximale (px) de la plus grande arête après redimensionnement. */
export const MAX_IMAGE_DIMENSION = 400;

/** Qualité JPEG d'export (0 = très compressé, 1 = perte minimale). */
export const JPEG_QUALITY = 0.45;

/**
 * Redimensionne proportionnellement (max 400x400) et compresse en JPEG 0.45.
 * Accepte un dataURL base64 (avec ou sans préfixe `data:`) et renvoie un
 * dataURL JPEG allégé.
 */
export function compressImage(base64Str: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str.startsWith('data:') ? base64Str : `data:image/png;base64,${base64Str}`;
    img.onload = () => {
      const scale = Math.min(
        1,
        MAX_IMAGE_DIMENSION / Math.max(img.width, img.height, 1),
      );
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    };
    img.onerror = () => {
      // Si l'image ne peut pas être chargée/redimensionnée, on renvoie
      // l'entrée d'origine plutôt que de bloquer la file d'attente.
      resolve(base64Str);
    };
  });
}
