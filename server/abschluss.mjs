import fs from "node:fs";
import path from "node:path";
import { fehler } from "./router.mjs";
import { ladeFelder, protokollPdf, protokollText } from "./protokoll.mjs";
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

// "Zählerschrank 1.jpg", "Weitere 2.jpg"; Schrägstriche gehen in Dateinamen nicht.
export function dateiNamen(fotos) {
  const zaehler = {};
  return Object.fromEntries(fotos.map((f) => {
    const basis = f.pflichtfoto.replaceAll("/", "-");
    zaehler[basis] = (zaehler[basis] || 0) + 1;
    return [f.dateiId, `${basis} ${zaehler[basis]}.jpg`];
  }));
}

// Schickt eine Planung ab. Jeder Schritt wird sofort in planung.gesendet vermerkt, damit ein
// zweiter Lauf nur nachholt, was fehlt. ablage = null heißt: kein Ort für Dateien verfügbar.
export function erstelleAbschluss({ planungen, schreiber, dateien, ablage: ablageQuelle, nameVon = (l) => l }) {
  const laufend = new Set();

  return {
    async abschliessen(id) {
      if (laufend.has(id)) throw fehler(409, "Wird gerade gespeichert");
      laufend.add(id);
      try { return await lauf(id); } finally { laufend.delete(id); }
    },
  };

  async function lauf(id) {
    const ablage = typeof ablageQuelle === "function" ? ablageQuelle() : ablageQuelle;
    let pl = planungen.laden(id);
    if (!pl.ergebnis) throw fehler(409, "Erst zusammenfassen");
    const ziel = schreiber.zielProjekt(pl.projektId);
    const namen = dateiNamen(pl.ergebnis.fotos);
    const alle = pl.verlauf.flatMap((n) => n.dateien);
    const datum = new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
    const aufgenommen = `Aufgenommen von ${nameVon(pl.person)} am ${new Date(pl.erstellt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" })}`;

    // Was hochgeladen werden muss: Fotos (mit Zeichnung), PDFs und Videos aus dem Chat, das Protokoll.
    const auftraege = alle.map((d) => ({ schluessel: d.id, name: d.art === "bild" ? namen[d.id] || d.name : d.name, pfad: planungen.dateiPfad(id, d.id), mime: d.art === "audio" ? audioMime(d.name) : MIME[d.art] }));
    const protokollPfad = path.join(path.dirname(planungen.dateiPfad(id, "x")), "..", "protokoll.pdf");
    auftraege.push({ schluessel: "protokoll", name: `Besichtigungsprotokoll ${datum}.pdf`, pfad: protokollPfad, mime: MIME.pdf, protokoll: true });

    const r = { ziel, hochgeladen: 0, uebersprungen: 0, offen: 0, fehler: [] };
    for (const a of auftraege) {
      if (pl.gesendet.dateien[a.schluessel]) { r.uebersprungen++; continue; }
      if (!ablage) { r.offen++; continue; }
      try {
        if (a.protokoll) fs.writeFileSync(a.pfad, await protokollPdf(pl.ergebnis, await ladeFelder()));
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
    const links = auftraege.filter((a) => pl.gesendet.dateien[a.schluessel]).map((a) => [a.name, pl.gesendet.dateien[a.schluessel].link]);
    if (fertig && pl.gesendet.logbuch !== true) {
      const text = pl.gesendet.logbuch === "vorlaeufig" ? monteurText({}, links, "Nachtrag zur Besichtigung: Fotos und Protokoll") : monteurText(pl.ergebnis.monteure, links, "", protokollText(pl.ergebnis.felder, await ladeFelder()), aufgenommen);
      await dateien.logbuchEintrag(ziel.id, text);
      pl.gesendet.logbuch = true;
    } else if (!ablage && !pl.gesendet.logbuch) {
      await dateien.logbuchEintrag(ziel.id, monteurText(pl.ergebnis.monteure, [], "Fotos und Protokoll-PDF folgen.", protokollText(pl.ergebnis.felder, await ladeFelder()), aufgenommen));
      pl.gesendet.logbuch = "vorlaeufig";
    }
    if (pl.gesendet.logbuch) pl.status = "gesendet";
    pl.gesendet.ziel = ziel;
    planungen.speichern(pl);
    return r;
  }
}
