import fs from "node:fs";
import path from "node:path";
import { fehler } from "./router.mjs";
import { berichtPdf } from "./bericht.mjs";
import { frageNach } from "./fragen.mjs";
import { audioMime } from "./transkribieren.mjs";

const MIME = { bild: "image/jpeg", pdf: "application/pdf", video: "video/mp4" };

// Logbuch-Text für HERO: nur, dass besichtigt wurde und von wem (Dominik, 23.11.). Details stehen im Protokoll-PDF.
export const logbuchText = (aufgenommen) => "Besichtigung durchgeführt\n" + aufgenommen;

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
    // Ein Kunde kann mehrere Projekte haben (PV, WP, Klima); jedes bekommt alles. Im Testmodus landen alle in UNB-1149, dort nur einmal.
    const ziele = [];
    for (const p of pl.projekte?.length ? pl.projekte : [{ id: pl.projektId }]) {
      const z = schreiber.zielProjekt(p.id);
      if (!ziele.some((x) => x.id === z.id)) ziele.push({ ...z, nummer: p.nummer || "" });
    }
    const ziel = ziele[0];
    const namen = dateiNamen(pl);
    const alle = alleDateien(pl);
    const datum = new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
    const aufgenommen = `Aufgenommen von ${nameVon(pl.person)} am ${new Date(pl.erstellt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" })}`;

    // Was hochgeladen werden muss: alle Fotos, Videos, Sprachnotizen und PDFs, zuletzt das Protokoll (es braucht deren Links).
    const auftraege = alle.map((d) => ({ schluessel: d.id, name: d.art === "bild" ? namen[d.id] || d.name : d.name, pfad: planungen.dateiPfad(id, d.id), mime: d.art === "audio" ? audioMime(d.name) : MIME[d.art] }));
    const protokollPfad = path.join(path.dirname(planungen.dateiPfad(id, "x")), "..", "protokoll.pdf");
    auftraege.push({ schluessel: "protokoll", name: `Besichtigungsprotokoll ${datum}.pdf`, pfad: protokollPfad, mime: MIME.pdf, protokoll: true });

    const protokollSchreiben = async () => fs.writeFileSync(protokollPfad, await berichtPdf(pl, { links: Object.fromEntries(Object.entries(pl.gesendet.dateien).map(([k, v]) => [k, v.link])), bild: (d) => planungen.bildFuerPdf(id, d) }));
    // Drive-Ordner: Projektnummer(n) und Kunde
    const ordner = pl.projekte?.length > 1 ? [pl.projekte.map((x) => x.nummer).join(" "), pl.antworten?.kunde?.wert].filter(Boolean).join(" ") : pl.projektTitel.split(", ").slice(0, 2).join(" ");
    const r = { ziel, ziele, hochgeladen: 0, uebersprungen: 0, offen: 0, inHero: 0, fehler: [] };
    for (const a of auftraege) {
      if (pl.gesendet.dateien[a.schluessel]) { r.uebersprungen++; continue; }
      if (!ablage) { r.offen++; continue; }
      try {
        if (a.protokoll) await protokollSchreiben();
        const link = await ablage.hochladen(a.pfad, a.name, a.mime, ordner);
        pl = planungen.laden(id);
        pl.gesendet.dateien[a.schluessel] = { name: a.name, link };
        planungen.speichern(pl);
        r.hochgeladen++;
      } catch (e) {
        r.fehler.push(`${a.name}: ${e.message}`);
        break; // beim ersten Fehler anhalten; der nächste Lauf macht hier weiter
      }
    }

    // Fotos und PDFs zusätzlich direkt in jedes HERO-Projekt (Videos und Sprachnotizen bleiben auf Drive, ihre Links stehen im Protokoll).
    // Nacheinander, weil HERO nach 30 s abbricht und Lastspitzen meiden will. Stand je Projekt in gesendet.inHero, ältere Planungen kannten nur ein Projekt.
    const fuerHero = dateien.inHero ? auftraege.filter((a) => a.mime === MIME.bild || a.mime === MIME.pdf) : [];
    pl.gesendet.inHero ||= pl.gesendet.hero ? { [ziel.id]: pl.gesendet.hero } : {};
    pl.gesendet.logbuchIn ||= pl.gesendet.logbuch ? [ziel.id] : [];
    planungen.speichern(pl);
    const istInHero = (z, a) => pl.gesendet.inHero[z.id]?.[a.schluessel];
    hero: for (const z of ziele) {
      for (const a of fuerHero) {
        if (istInHero(z, a)) continue;
        if (a.protokoll && ablage && !pl.gesendet.dateien.protokoll) break; // Protokoll erst, wenn es alle Drive-Links enthält
        try {
          if (a.protokoll && !fs.existsSync(a.pfad)) await protokollSchreiben();
          const heroId = await dateien.inHero(z.id, a.pfad, a.name, a.mime);
          pl = planungen.laden(id);
          (pl.gesendet.inHero[z.id] ||= {})[a.schluessel] = heroId;
          planungen.speichern(pl);
          r.inHero++;
        } catch (e) {
          r.fehler.push(`HERO ${z.nummer || z.id} ${a.name}: ${e.message}`);
          break hero;
        }
      }
    }

    const fertig = auftraege.every((a) => pl.gesendet.dateien[a.schluessel]);
    // Je Projekt ein kurzer Logbuch-Eintrag, sobald alles abgelegt und dort in HERO ist (ohne Ablage nur HERO).
    for (const z of ziele) {
      if (pl.gesendet.logbuchIn.includes(z.id) || !(fertig || !ablage) || !fuerHero.every((a) => istInHero(z, a))) continue;
      await dateien.logbuchEintrag(z.id, logbuchText(aufgenommen));
      pl.gesendet.logbuchIn.push(z.id);
      planungen.speichern(pl);
    }
    pl.gesendet.logbuch = ziele.every((z) => pl.gesendet.logbuchIn.includes(z.id));
    if (pl.gesendet.logbuch) pl.status = "gesendet";
    pl.gesendet.ziel = ziel;
    planungen.speichern(pl);
    return r;
  }
}
