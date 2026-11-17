// HERO GraphQL v7, nur lesen. Feldnamen per Introspektion geprüft am 17.11.2026:
// ProjectMatch: id project_nr project_title name customer address current_project_match_status file_uploads histories contact
// Customer: full_name company_name first_name last_name phone_mobile phone_home email
// Address: street zipcode city · CalendarEvent: id title start end project_match_id category{name}
// FileUpload: id filename url · History: created custom_title custom_text
// Sortierung: orderBy kennt nur aufsteigend; last:N + offset liefert das Neueste zuerst (geprüft 17.11.).
import { fehler } from "./router.mjs";
export const HERO_URL = "https://login.hero-software.de/api/external/v7/graphql";

export class HeroFehler extends Error {
  constructor(meldung) { super(meldung); this.status = 502; this.eigen = true; }
}

const PROJEKT_FELDER = "id project_nr project_title name customer { full_name company_name } address { street zipcode city } current_project_match_status { name }";

const trim = (s) => (s || "").trim();
// HERO speichert Logbuch-Text als HTML (Zeilenumbruch = <br />).
const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'", "&nbsp;": " " };
export const alsText = (s) => trim(String(s || "").replace(/<br\s*\/?>\s*\n?/gi, "\n").replace(/<[^>]+>/g, "").replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENT[m]));
const name = (c) => trim(c?.full_name) || trim(c?.company_name);
export function alsProjekt(p) {
  const a = p.address || {};
  return {
    id: p.id, nummer: p.project_nr, titel: trim(p.project_title) || trim(p.name), kunde: name(p.customer),
    adresse: [a.street, [a.zipcode, a.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    status: p.current_project_match_status?.name || "",
  };
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
    async projekteSuchen(suche, { offset = 0, anzahl = 30 } = {}) {
      const d = await abfrage(`query($s:String,$f:Int,$o:Int){ project_matches(search:$s, last:$f, offset:$o, orderBy:"modified"){ ${PROJEKT_FELDER} } }`, { s: suche || null, f: anzahl, o: offset });
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
    async termineLaden(von, bis) {
      const d = await abfrage(`query($von:DateTime,$bis:DateTime){ calendar_events(start:$von, end:$bis, first:500){ id title start end all_day project_match_id category { name } } }`, { von, bis });
      return d.calendar_events.map((t) => ({ id: t.id, titel: t.title, start: t.start, ende: t.end, projektId: t.project_match_id || null, kategorie: t.category?.name || "", ganztags: !!t.all_day }));
    },
    async terminKategorien() {
      const d = await abfrage(`{ calendar_event_categories { id name } }`);
      return d.calendar_event_categories.map((k) => ({ id: k.id, name: k.name }));
    },
  };
}
