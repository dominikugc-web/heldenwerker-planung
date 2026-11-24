// HERO GraphQL v7, nur lesen (Schreiben läuft über hero-schreiben.mjs). Dazu der REST-Upload für Dateien. Feldnamen per Introspektion geprüft am 17.11.2026:
// ProjectMatch: id project_nr project_title name customer address current_project_match_status file_uploads histories contact
// Customer: full_name company_name first_name last_name phone_mobile phone_home email
// Address: street zipcode city · CalendarEvent: id title start end project_match_id category{name}
// FileUpload: id filename url · History: created custom_title custom_text
// Sortierung: orderBy kennt nur aufsteigend; last:N + offset liefert das Neueste zuerst (geprüft 17.11.).
import fs from "node:fs";
import { fehler } from "./router.mjs";
import { richtungenAusGewerk } from "./fragen.mjs";
export const HERO_URL = "https://login.hero-software.de/api/external/v7/graphql";
// Laut HERO-Support (24.11.2026): eine Datei pro Anfrage im Feld "file", Header x-auth-token, Antwort data.uuid.
export const HERO_UPLOAD_URL = "https://login.hero-software.de/app/v8/FileUploads/upload";

export class HeroFehler extends Error {
  constructor(meldung) { super(meldung); this.status = 502; this.eigen = true; }
}

const PROJEKT_FELDER = "id project_nr project_title name customer { id full_name company_name } address { street zipcode city } current_project_match_status { name } measure { name }";

const trim = (s) => (s || "").trim();
// HERO speichert Logbuch-Text als HTML (Zeilenumbruch = <br />).
const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'", "&nbsp;": " " };
export const alsText = (s) => trim(String(s || "").replace(/<br\s*\/?>\s*\n?/gi, "\n").replace(/<[^>]+>/g, "").replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENT[m]));
const name = (c) => trim(c?.full_name) || trim(c?.company_name);
export function alsProjekt(p) {
  const a = p.address || {};
  return {
    id: p.id, nummer: p.project_nr, titel: trim(p.project_title) || trim(p.name), kunde: name(p.customer), kundeId: p.customer?.id ?? null,
    adresse: [a.street, [a.zipcode, a.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    status: p.current_project_match_status?.name || "",
    gewerk: trim(p.measure?.name), richtungen: richtungenAusGewerk(p.measure?.name),
  };
}

// Ein Kunde mit mehreren Projekten (PV, WP, Klima) hat oft je Projekt einen Termin, besichtigt wird aber in einem Besuch.
// Termine desselben Kunden, derselben Kategorie am selben Tag werden daher einer (projektIds nennt alle Projekte).
const tagIn = (iso) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
export function termineBuendeln(termine) {
  const gruppen = new Map();
  for (const t of termine) {
    const k = t.kundeId ? [tagIn(t.start), t.kundeId, t.kategorie].join("|") : "t" + t.id;
    const g = gruppen.get(k);
    if (!g) { gruppen.set(k, { ...t, projektIds: t.projektId ? [t.projektId] : [] }); continue; }
    g.titel = g.kunde || g.titel;
    if (t.start < g.start) g.start = t.start;
    if (t.ende > g.ende) g.ende = t.ende;
    if (t.projektId && !g.projektIds.includes(t.projektId)) g.projektIds.push(t.projektId);
    g.meins = g.meins || t.meins;
    g.personen = [...new Set([...(g.personen || []), ...(t.personen || [])])];
  }
  return [...gruppen.values()];
}

// key und fetch werden übergeben, damit Tests ohne echten HERO-Aufruf laufen.
export function erstelleHero({ key, fetch = globalThis.fetch }) {
  async function abfrage(query, variables = {}) {
    if (!key) throw fehler(503, "HERO-Schlüssel fehlt");
    let r;
    try {
      r = await fetch(HERO_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + key }, body: JSON.stringify({ query, variables }) });
    } catch { throw new HeroFehler("HERO antwortet nicht wie erwartet"); }
    let j;
    try { j = await r.json(); } catch { j = null; }
    if (!r.ok || !j || j.errors || !j.data) {
      console.error("HERO-Fehler", r.status, JSON.stringify(j?.errors || "").replaceAll(key, "***").slice(0, 300));
      throw new HeroFehler("HERO antwortet nicht wie erwartet");
    }
    return j.data;
  }

  return {
    abfrage,
    // Lieferscheine eines Projekts, neueste zuerst. Produkte aus dem veröffentlichten Entwurf, dort stehen Menge und Beschreibung
    // (metadata.positions hat nur Namen). Positionen können in Titeln verschachtelt sein.
    async lieferscheine(projektId) {
      const d = await abfrage(`query($id:Int){ project_match(project_match_id:$id){ customer_documents { nr type date published_customer_document_draft { data } } } }`, { id: Number(projektId) });
      const produkte = (items) => {
        const raus = [];
        const geh = (x) => { if (Array.isArray(x)) x.forEach(geh); else if (x && typeof x === "object") { if (x.type === "product" && x.name) raus.push(x); else Object.values(x).forEach(geh); } };
        geh(items);
        return raus.map((p) => ({ name: trim(p.name), menge: Number(p.quantity) || 1, beschreibung: alsText(String(p.description || "").replace(/<\/(div|p|li)>|<br\s*\/?>/gi, " ")).replace(/\s+/g, " ") }));
      };
      return (d.project_match?.customer_documents || []).filter((x) => x.type === "delivery_note")
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .map((x) => ({ nr: x.nr, datum: x.date, produkte: produkte(x.published_customer_document_draft?.data?.items) }));
    },
    // Datei von einem HERO-Link laden (z. B. temporary_url einer Projektdatei).
    // Lädt eine Datei als temporären Upload hoch und gibt die file_upload_uuid zurück; zugeordnet wird per GraphQL.
    async hochladen(pfad, name, mime) {
      if (!key) throw fehler(503, "HERO-Schlüssel fehlt");
      const form = new FormData();
      form.append("file", new Blob([fs.readFileSync(pfad)], { type: mime }), name);
      let j;
      try { j = await (await fetch(HERO_UPLOAD_URL, { method: "POST", headers: { "x-auth-token": key }, body: form, signal: AbortSignal.timeout(60_000) })).json(); } catch { j = null; }
      if (j?.status !== "success" || !j.data?.uuid) throw new HeroFehler("HERO nimmt die Datei nicht an");
      return j.data.uuid;
    },
    async laden(url) {
      const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw new HeroFehler("Datei aus HERO nicht ladbar");
      return new Uint8Array(await r.arrayBuffer());
    },
    // Neuester Heizlastbericht (PDF) aus den Projektdateien, null wenn keiner da ist. Der Link gilt nur kurz.
    async heizlastBericht(projektId) {
      const d = await abfrage(`query($id:Int){ project_match(project_match_id:$id){ file_uploads { filename temporary_url created is_deleted } } }`, { id: Number(projektId) });
      const f = (d.project_match?.file_uploads || []).filter((x) => !x.is_deleted && x.temporary_url && /heizlast/i.test(x.filename) && /.pdf$/i.test(x.filename))
        // Autarc-Bericht ("…-Raumweise-Heizlastbericht.pdf") vor anderen Heizlast-Dateien, darin der neueste.
        .sort((x, y) => /heizlastbericht/i.test(y.filename) - /heizlastbericht/i.test(x.filename) || String(y.created).localeCompare(String(x.created)))[0];
      return f ? { name: f.filename, url: f.temporary_url } : null;
    },
    async projekteSuchen(suche, { offset = 0, anzahl = 30 } = {}) {
      const d = await abfrage(`query($s:String,$f:Int,$o:Int){ project_matches(search:$s, last:$f, offset:$o, orderBy:"modified"){ ${PROJEKT_FELDER} } }`, { s: suche || null, f: anzahl, o: offset });
      return d.project_matches.map(alsProjekt);
    },
    // Alle Projekte eines Kunden (für die Projektseite), neueste zuerst.
    async kundenProjekte(kundeId) {
      const d = await abfrage(`query($k:Int){ project_matches(customer_id:$k, last:50, orderBy:"modified"){ ${PROJEKT_FELDER} } }`, { k: Number(kundeId) });
      return d.project_matches.map(alsProjekt);
    },
    async projektLaden(id) {
      const d = await abfrage(`query($id:Int){ project_match(project_match_id:$id){ ${PROJEKT_FELDER}
        contact { full_name company_name phone_mobile phone_home email } file_uploads { id filename url }
        histories { created custom_title custom_text } } }`, { id: Number(id) });
      if (!d.project_match) throw fehler(404, "Projekt nicht gefunden");
      const p = d.project_match, k = p.contact || p.customer || {};
      // histories kommt neueste zuerst und enthält auch per API geschriebene Einträge (project_histories nicht).
      const h = { project_histories: (p.histories || []).slice(0, 30) };
      return {
        ...alsProjekt(p),
        kontakt: { name: name(k), telefon: k.phone_mobile || k.phone_home || "", email: k.email || "" },
        dateien: (p.file_uploads || []).map((f) => ({ id: f.id, name: f.filename, url: f.url })),
        logbuch: h.project_histories.map((e) => ({ datum: e.created, text: alsText(e.custom_text) || alsText(e.custom_title) })).filter((e) => e.text),
      };
    },
    // personen = wer eingeteilt ist (Mitarbeiter oder Team). E-Mail nur für die Zuordnung auf dem Server, nicht für die Oberfläche.
    async termineLaden(von, bis) {
      const d = await abfrage(`query($von:DateTime,$bis:DateTime){ calendar_events(start:$von, end:$bis, first:500){ id title start end all_day project_match_id project_match { customer { id full_name company_name } } category { name } partners { id full_name email } } }`, { von, bis });
      return d.calendar_events.map((t) => ({ id: t.id, titel: t.title, start: t.start, ende: t.end, projektId: t.project_match_id || null, kundeId: t.project_match?.customer?.id ?? null, kunde: name(t.project_match?.customer), kategorie: t.category?.name || "", ganztags: !!t.all_day,
        personen: (t.partners || []).map((p) => ({ id: p.id, name: trim(p.full_name), email: trim(p.email) })) }));
    },
    // HERO hat keine Mitarbeiterliste in der API; wer in Terminen eingeteilt ist (60 Tage zurück, 120 voraus), reicht für die Zuordnung.
    async personen() {
      const tag = 86_400_000, jetzt = Date.now();
      const t = await this.termineLaden(new Date(jetzt - 60 * tag).toISOString(), new Date(jetzt + 120 * tag).toISOString());
      const alle = new Map(t.flatMap((x) => x.personen).map((p) => [p.id, { id: p.id, name: p.name }]));
      return [...alle.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
    },
    async terminKategorien() {
      const d = await abfrage(`{ calendar_event_categories { id name } }`);
      return d.calendar_event_categories.map((k) => ({ id: k.id, name: k.name }));
    },
  };
}
