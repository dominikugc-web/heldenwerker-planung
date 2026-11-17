import fs from "node:fs";
import { PDFDocument, StandardFonts, rgb, PDFName, PDFString } from "pdf-lib";
import { BEREICHE, KATALOG, sichtbar } from "./fragen.mjs";

// Bericht der Besichtigung aus den Antworten des festen Ablaufs: als Abschnitte, als Text und als PDF
// im Stil des „DC Abnahmeprotokolls“ (Logo, Titelband, Abschnittsbalken, Frage | Antwort, Fotos darunter).

const ABSCHNITTE_MONTEURE = [["wasWirdGemacht", "Was wird gemacht"], ["woKommtWasHin", "Wo kommt was hin"], ["achtung", "Achtung auf der Baustelle"],
  ["material", "Material und Besonderheiten"], ["offen", "Offene Punkte"]];

const einheit = (f, w) => (f.einheit && w ? (f.einheit.startsWith("°") ? w + f.einheit : `${w} ${f.einheit}`) : w);

// Sichtbare Fragen mit Inhalt (Antwort, Notiz oder Datei), gruppiert nach Bereich. Die Startfrage fehlt.
export function berichtAbschnitte(pl) {
  const antworten = pl.antworten || {};
  const gruppen = new Map();
  for (const f of sichtbar(antworten)) {
    if (f.id === "typ") continue;
    const a = antworten[f.id];
    if (!a || (!a.wert && !a.notiz && !a.dateien?.length)) continue;
    const dateien = a.dateien || [];
    const eintrag = {
      id: f.id, frage: f.titel || f.frage, antwort: einheit(f, a.wert || ""), notiz: a.notiz || "",
      bilder: dateien.filter((d) => d.art === "bild"), medien: dateien.filter((d) => d.art !== "bild"),
    };
    if (!gruppen.has(f.bereich)) gruppen.set(f.bereich, { titel: BEREICHE[f.bereich], eintraege: [] });
    gruppen.get(f.bereich).eintraege.push(eintrag);
  }
  return [...gruppen.values()];
}

// Kurzfassung als Text (für Claude und für das HERO-Logbuch, solange kein PDF-Link da ist).
export function berichtText(pl) {
  return berichtAbschnitte(pl).map((ab) => ab.titel + "\n" + ab.eintraege.map((e) => {
    const teile = [`• ${e.frage}: ${e.antwort || (e.bilder.length ? `${e.bilder.length} Foto(s)` : "siehe Notiz")}`];
    if (e.notiz) teile.push(`(Notiz: ${e.notiz})`);
    for (const m of e.medien) if (m.text) teile.push(`(Sprachnotiz: ${m.text})`);
    return teile.join(" ");
  }).join("\n")).join("\n\n");
}

export function fehltPflichtfotos(pl) {
  const antworten = pl.antworten || {};
  return sichtbar(antworten).filter((f) => f.pflicht && !(antworten[f.id]?.dateien || []).some((d) => d.art === "bild")).map((f) => f.titel);
}

// ---------- PDF ----------
const BLAU = rgb(0.22, 0.71, 1), BAND = rgb(0.9, 0.96, 1), BAND_HELL = rgb(0.95, 0.98, 1), TEXT = rgb(0.13, 0.13, 0.15), GRAU = rgb(0.42, 0.44, 0.48), LINK = rgb(0.05, 0.4, 0.75);
const RAND = 45, BREITE = 595 - 2 * RAND, LABEL_B = 230, WERT_X = RAND + 255, WERT_B = 595 - RAND - (RAND + 255);
const LOGO = new URL("../vorlagen/logo.png", import.meta.url);
// Standardschrift kann nur WinAnsi; alles andere (Emojis, fremde Schriften) wird ersetzt statt abzustürzen.
const winAnsi = (s) => String(s ?? "").normalize("NFC").replace(/[^\x20-\x7E\xA0-\xFF€‘’‚“”„•…\n]/gu, "?").replace(/\?+/g, (m) => (m.length > 1 ? "?" : m));

export async function berichtPdf(pl, { links = {}, bild }) {
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica), fett = await doc.embedFont(StandardFonts.HelveticaBold), kursiv = await doc.embedFont(StandardFonts.HelveticaOblique);
  const logo = await doc.embedPng(fs.readFileSync(LOGO));
  const antworten = pl.antworten || {};
  const titel = `Technische Besichtigung ${antworten.typ?.wert === "PV" ? "PV" : antworten.typ?.wert === "Wärmepumpe" ? "Wärmepumpe" : "PV + Wärmepumpe"}`;
  let seite, y;

  const neueSeite = () => {
    seite = doc.addPage([595, 842]);
    const h = 38, b = (logo.width / logo.height) * h;
    seite.drawImage(logo, { x: 595 - RAND - b, y: 842 - 30 - h, width: b, height: h });
    y = 842 - 95;
  };
  const platz = (hoehe) => { if (y - hoehe < 60) neueSeite(); };
  const umbrechen = (text, font, groesse, breite) => {
    const zeilen = [];
    for (const absatz of winAnsi(text).split("\n")) {
      let zeile = "";
      for (const wort of absatz.split(/\s+/)) {
        const probe = zeile ? zeile + " " + wort : wort;
        if (font.widthOfTextAtSize(probe, groesse) <= breite) zeile = probe;
        else { if (zeile) zeilen.push(zeile); zeile = wort; }
      }
      zeilen.push(zeile);
    }
    return zeilen;
  };
  const text = (s, x, font, groesse, farbe = TEXT) => seite.drawText(winAnsi(s), { x, y, size: groesse, font, color: farbe });
  const band = (s, farbe, groesse) => {
    platz(40);
    seite.drawRectangle({ x: RAND, y: y - 8, width: BREITE, height: groesse + 12, color: farbe });
    const w = fett.widthOfTextAtSize(winAnsi(s), groesse);
    text(s, RAND + (BREITE - w) / 2, fett, groesse);
    y -= groesse + 22;
  };
  const link = (url, x1, y1, x2, y2) => {
    const annot = doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [x1, y1, x2, y2], Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(url) } });
    const ref = doc.context.register(annot);
    const vorhanden = seite.node.lookup(PDFName.of("Annots"));
    if (vorhanden) vorhanden.push(ref); else seite.node.set(PDFName.of("Annots"), doc.context.obj([ref]));
  };
  const zeile = (frage, antwort, notiz, einzug = 0) => {
    const l = umbrechen(frage, fett, 9.5, LABEL_B - einzug), w = umbrechen(antwort || "", normal, 9.5, WERT_B), n = notiz ? umbrechen("Notiz: " + notiz, kursiv, 8.5, WERT_B) : [];
    const hoehe = Math.max(l.length, w.length + n.length) * 12.5 + 8;
    platz(hoehe);
    const start = y;
    l.forEach((s, i) => { y = start - i * 12.5; text(s, RAND + einzug, fett, 9.5); });
    w.forEach((s, i) => { y = start - i * 12.5; text(s, WERT_X, normal, 9.5); });
    n.forEach((s, i) => { y = start - (w.length + i) * 12.5; text(s, WERT_X, kursiv, 8.5, GRAU); });
    y = start - hoehe;
  };
  // Frage mit Fotos als Kästchen: Überschrift und Fotos stehen sichtbar zusammen, die nächste Überschrift hat Abstand.
  // Bricht die Seite mitten in den Fotos um, wird das Kästchen unten geschlossen und auf der neuen Seite fortgesetzt.
  const P = 8, LUECKE = 10;
  const kaestchen = (k, unten) => k.seite.drawRectangle({ x: RAND, y: unten, width: BREITE, height: k.oben - unten, borderColor: BLUE_GRAU(), borderWidth: 0.8 });
  const fotoKarte = async (e) => {
    platz(40 + 160); // Überschrift nicht allein unten lassen: mit der ersten Fotoreihe zusammen
    const k = { seite, oben: y + 9.5 + P - 2 }; // Grundlinie + Schrifthöhe + Rand
    zeile(e.frage, e.antwort, e.notiz, P);
    let unten = y + 12.5 + 8 - 3, erste = true; // Unterkante der letzten Textzeile
    const b = (BREITE - 2 * P - 2 * LUECKE) / 3, maxH = 150;
    for (let i = 0; i < e.bilder.length; i += 3) {
      const reihe = [];
      for (const d of e.bilder.slice(i, i + 3)) {
        // Kopie: kleine Node-Buffer liegen in einem gemeinsamen Speicherblock, pdf-lib liest sonst ab dessen Anfang ("SOI not found").
        try { reihe.push({ d, img: await doc.embedJpg(Uint8Array.from(await bild(d.id))) }); } catch { /* Bild nicht lesbar: weglassen */ }
      }
      if (!reihe.length) continue;
      const hoehen = reihe.map((r) => Math.min(maxH, (r.img.height / r.img.width) * b)), h = Math.max(...hoehen);
      let oben = unten - (erste ? 6 : LUECKE);
      if (oben - h - P < 60) { kaestchen(k, unten - P); neueSeite(); k.seite = seite; k.oben = y + 10; oben = k.oben - P; }
      reihe.forEach((r, j) => seite.drawImage(r.img, { x: RAND + P + j * (b + LUECKE), y: oben - hoehen[j], width: (r.img.width / r.img.height) * hoehen[j], height: hoehen[j] }));
      unten = oben - h; erste = false;
    }
    kaestchen(k, unten - P);
    y = unten - P - 30; // deutlicher Abstand zur nächsten Überschrift
  };
  const medien = (liste) => {
    for (const m of liste) {
      const art = { video: "Video", audio: "Sprachnotiz", pdf: "PDF" }[m.art] || "Datei";
      const url = links[m.id];
      const s = url ? `${art}: ${m.name} (ansehen)` : `${art}: ${m.name} (Link folgt nach dem Speichern)`;
      platz(14);
      text(s, WERT_X, url ? normal : kursiv, 9, url ? LINK : GRAU);
      if (url) { const w = normal.widthOfTextAtSize(winAnsi(s), 9); seite.drawLine({ start: { x: WERT_X, y: y - 1.5 }, end: { x: WERT_X + w, y: y - 1.5 }, thickness: 0.5, color: LINK }); link(url, WERT_X, y - 3, WERT_X + w, y + 10); }
      y -= 13;
      if (m.text) for (const z of umbrechen(`„${m.text}“`, kursiv, 8.5, WERT_B)) { platz(12); text(z, WERT_X, kursiv, 8.5, GRAU); y -= 11.5; }
    }
  };

  neueSeite();
  band(titel, BAND, 15);
  const kopf = [antworten.kunde?.wert, antworten.projektnr?.wert, antworten.datum?.wert].filter(Boolean).join("  ·  ");
  if (kopf) { const w = normal.widthOfTextAtSize(winAnsi(kopf), 10); text(kopf, RAND + (BREITE - w) / 2, normal, 10, GRAU); y -= 26; }

  const monteure = pl.ergebnis?.monteure;
  if (monteure && ABSCHNITTE_MONTEURE.some(([k]) => monteure[k]?.length)) {
    band("Für die Monteure", BAND_HELL, 11.5);
    for (const [k, t] of ABSCHNITTE_MONTEURE) if (monteure[k]?.length) zeile(t, monteure[k].map((s) => "• " + s).join("\n"));
    y -= 6;
  }
  for (const ab of berichtAbschnitte(pl)) {
    platz(ab.eintraege[0]?.bilder.length ? 40 + 200 : 80); // Balken nicht allein unten: mit dem ersten Eintrag zusammen
    band(ab.titel, BAND_HELL, 11.5);
    for (const e of ab.eintraege) {
      if (e.bilder.length) await fotoKarte(e);
      else zeile(e.frage, e.antwort || (e.medien.length ? "" : "nicht angegeben"), e.notiz);
      if (e.medien.length) { medien(e.medien); y -= 6; }
    }
    y -= 6;
  }

  // Fußzeile mit Seitenzahl
  const seiten = doc.getPages();
  seiten.forEach((s, i) => {
    s.drawLine({ start: { x: RAND, y: 42 }, end: { x: 595 - RAND, y: 42 }, thickness: 0.5, color: BLUE_GRAU() });
    s.drawText(winAnsi(`Heldenwerker GmbH  ·  ${titel}`), { x: RAND, y: 28, size: 8, font: normal, color: GRAU });
    const n = `${i + 1} / ${seiten.length}`;
    s.drawText(n, { x: 595 - RAND - normal.widthOfTextAtSize(n, 8), y: 28, size: 8, font: normal, color: GRAU });
  });
  return Buffer.from(await doc.save());
}
const BLUE_GRAU = () => rgb(0.8, 0.84, 0.88);
export { KATALOG };
