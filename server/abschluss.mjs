import fs from "node:fs";
import path from "node:path";
import { fehler } from "./router.mjs";
import { berichtPdf, berichtText } from "./bericht.mjs";
import { frageNach } from "./fragen.mjs";
import { audioMime } from "./transkribieren.mjs";

const ABSCHNITTE = [["wasWirdGemacht", "Was wird gemacht"], ["woKommtWasHin", "Wo kommt was hin"], ["achtung", "Achtung auf der Baustelle"],
  ["material", "Material und Besonderheiten"], ["offen", "Offene Punkte"]];
const MIME = { bild: "image/jpeg", pdf: "application/pdf", video: "video/mp4" };

// Logbuch-Text für HERO: feste Abschnitte, nur gefüllte, danach die Links.
export function monteurText(monteure, links = [], hinweis = "", protokoll = "", aufgenommen = "") {
  const teile = ["Für die Monteure (Besichtigung)" + (aufgenommen ? "\n" + aufgenommen : "")];
  for (const [k, titel] of ABSCHNITTE) if (monteure?.[k]?.length) teile.push(titel + "\n" + monteure[k].map((s) => "• " + s).join("\n"));
  if (links.length) teile.push("Dateien\n" + links.map(([n, l]) => `${n}: ${l}`).join("\n"));
  if (hinweis) teile.push(hinweis);
  // Solange das PDF nicht in HERO landet, stehen die Protokoll-Werte hier.
  if (protokoll) teile.push("Aus dem Besichtigungsprotokoll\n\n" + protokoll);
  return teile.join("\n\n");
}

// Fotos heißen nach ihrer Frage („Zählerschrank 1.jpg“, „Dachbelag 2.jpg“), andere Dateien behalten ihren Namen.
// Schrägstriche und Satzzeichen gehen in Dateinamen nicht.
export function dateiNamen(pl) {
  const zaehler = {}, namen = {};
  for (const [frageId, a] of Object.entries(pl.antworten || {})) {
    const f = frageNach(frageId);
    for (const d of a.dateien || []) {
      if (d.art !== "bild") { namen[d.id] = d.name; continue; }
      const basis = String(f?.titel || f?.frage || "Foto").replaceAll("/", "-").replace(/[?:]/g, "").trim();
      zaehler[basis] = (zaehler[basis] || 0) + 1;
      namen[d.id] = `${basis} ${zaehler[basis]}.jpg`;
    }
  }
  return namen;
}
const alleDateien = (pl) => [...Object.values(pl.antworten || {}).flatMap((a) => a.dateien || []), ...(pl.verlauf || []).flatMap((n) => n.dateien || [])];

// Schickt eine Planung ab. Jeder Schritt wird sofort in planung.gesendet vermerkt, damit ein
// zweiter Lauf nur nachholt, was fehlt. ablage = null heißt: kein Ort für Dateien verfügbar.
export function erstelleAbschluss({ planungen, schreiber, dateien, ablage: ablageQuelle, nameVon = (l) => l }) {
  const laufend = new Set();
  const vermerken = (id, senden) => { const p = planungen.laden(id); p.senden = senden; planungen.speichern(p); return senden; };

  async function abschliessen(id) {
    if (laufend.has(id)) throw fehler(409, "Wird gerade gespeichert");
    laufend.add(id);
    try { return await lauf(id); } finally { laufend.delete(id); }
  }

  return {
    abschliessen,
    // Im Hintergrund: kommt sofort zurück, der Stand steht in planung.senden (laeuft | fertig | fehler).
    // Die App muss dafür nicht offen bleiben; läuft es schon, wird nichts doppelt gestartet.
    starten(id) {
      const pl = planungen.laden(id);
      if (!pl.ergebnis) throw fehler(409, "Erst zusammenfassen");
      if (laufend.has(id)) return pl.senden;
      const start = new Date().toISOString();
      vermerken(id, { status: "laeuft", start });
      abschliessen(id).then(
        (r) => vermerken(id, { status: r.fehler.length ? "fehler" : "fertig", start, ende: new Date().toISOString(), ergebnis: r, ...(r.fehler.length && { meldung: r.fehler.join(", ") }) }),
        (e) => { console.error("Senden fehlgeschlagen:", String(e.message).slice(0, 200)); vermerken(id, { status: "fehler", start, ende: new Date().toISOString(), meldung: e.eigen ? e.message : "Senden fehlgeschlagen" }); });
      return planungen.laden(id).senden;
    },
    laeuft: (id) => laufend.has(id),
  };

  async function lauf(id) {
    const ablage = typeof ablageQuelle === "function" ? ablageQuelle() : ablageQuelle;
    let pl = planungen.laden(id);
    if (!pl.ergebnis) throw fehler(409, "Erst zusammenfassen");
    const ziel = schreiber.zielProjekt(pl.projektId);
    const namen = dateiNamen(pl);
    const alle = alleDateien(pl);
    const datum = new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
    const aufgenommen = `Aufgenommen von ${nameVon(pl.person)} am ${new Date(pl.erstellt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" })}`;

    // Was hochgeladen werden muss: alle Fotos, Videos, Sprachnotizen und PDFs, zuletzt das Protokoll (es braucht deren Links).
    const auftraege = alle.map((d) => ({ schluessel: d.id, name: d.art === "bild" ? namen[d.id] || d.name : d.name, pfad: planungen.dateiPfad(id, d.id), mime: d.art === "audio" ? audioMime(d.name) : MIME[d.art] }));
    const protokollPfad = path.join(path.dirname(planungen.dateiPfad(id, "x")), "..", "protokoll.pdf");
    auftraege.push({ schluessel: "protokoll", name: `Besichtigungsprotokoll ${datum}.pdf`, pfad: protokollPfad, mime: MIME.pdf, protokoll: true });

    const r = { ziel, hochgeladen: 0, uebersprungen: 0, offen: 0, fehler: [] };
    for (const a of auftraege) {
      if (pl.gesendet.dateien[a.schluessel]) { r.uebersprungen++; continue; }
      if (!ablage) { r.offen++; continue; }
      try {
        if (a.protokoll) fs.writeFileSync(a.pfad, await berichtPdf(pl, { links: Object.fromEntries(Object.entries(pl.gesendet.dateien).map(([k, v]) => [k, v.link])), bild: (d) => planungen.bildFuerPdf(id, d) }));
        const link = await ablage.hochladen(a.pfad, a.name, a.mime, pl.projektTitel.split(", ").slice(0, 2).join(" "));
        pl = planungen.laden(id);
        pl.gesendet.dateien[a.schluessel] = { name: a.name, link };
        planungen.speichern(pl);
        r.hochgeladen++;
      } catch (e) {
        r.fehler.push(`${a.name}: ${e.message}`);
        break; // beim ersten Fehler anhalten; der nächste Lauf macht hier weiter
      }
    }

    const fertig = auftraege.every((a) => pl.gesendet.dateien[a.schluessel]);
    // Ins Logbuch: das Protokoll und Videos/Sprachnotizen/PDFs. Die Fotos stecken im Protokoll.
    const fotoIds = new Set(alle.filter((d) => d.art === "bild").map((d) => d.id));
    const links = auftraege.filter((a) => pl.gesendet.dateien[a.schluessel] && !fotoIds.has(a.schluessel)).sort((x, y) => (y.protokoll ? 1 : 0) - (x.protokoll ? 1 : 0))
      .map((a) => [a.name, pl.gesendet.dateien[a.schluessel].link]);
    if (fertig && pl.gesendet.logbuch !== true) {
      const nachtrag = "Nachtrag zur Besichtigung: Fotos und Protokoll\n\nDateien\n" + links.map(([n, l]) => `${n}: ${l}`).join("\n");
      const text = pl.gesendet.logbuch === "vorlaeufig" ? nachtrag :monteurText(pl.ergebnis.monteure, links, "", "", aufgenommen);
      await dateien.logbuchEintrag(ziel.id, text);
      pl.gesendet.logbuch = true;
    } else if (!ablage && !pl.gesendet.logbuch) {
      await dateien.logbuchEintrag(ziel.id, monteurText(pl.ergebnis.monteure, [], "Fotos und Protokoll-PDF folgen.", berichtText(pl), aufgenommen));
      pl.gesendet.logbuch = "vorlaeufig";
    }
    if (pl.gesendet.logbuch) pl.status = "gesendet";
    pl.gesendet.ziel = ziel;
    planungen.speichern(pl);
    return r;
  }
}
