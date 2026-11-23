// Heizlast aus dem Autarc-Bericht ("Raumweise-Heizlastbericht"), den die Planung in HERO beim Projekt ablegt.
// John rechnet die Heizlast vor der Besichtigung; die App füllt damit die Leistung der Außeneinheit vor (Planer prüft).
// Die Autarc-Planungsberichte enthalten kein Wärmepumpenmodell (Stichprobe 11 Berichte, 23.11.2026), daher die Norm-Heizlast.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// Nur die Norm-Heizlast zählt, nicht die überschlägige "Heizlast des Gebäudes (Verbrauch)".
export const heizlastAusText = (text) => String(text || "").match(/Norm-Heizlast\s+(\d+(?:,\d+)?)\s*kW/)?.[1] ?? null;

export async function heizlastAusPdf(bytes) {
  const doc = await getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 }).promise;
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const inhalt = await (await doc.getPage(i)).getTextContent();
      const kw = heizlastAusText(inhalt.items.map((x) => x.str).join(" "));
      if (kw) return kw;
    }
    return null;
  } finally { await doc.destroy(); }
}

export const antwortenAusHeizlast = (kw) => (kw ? {
  wp_leistung: { wert: kw, notiz: "Norm-Heizlast laut Heizlastbericht. Außeneinheit passend dazu wählen.", quelle: "Heizlastbericht" },
  heizlast_vorh: { wert: "ja", quelle: "Heizlastbericht" },
} : {});
