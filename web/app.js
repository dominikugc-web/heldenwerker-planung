// Gerüst: Router, Tab-Leiste, Home, Kalender, Projekte, Projektseite, Einstellungen, Feedback.
import { api, verbinden, brauchtKlick, zustand, serverSetzen, speicher, serverUrl } from "./api.js";
import { $, $$, esc, toast, fehlerMelden, sheet, IKON, uhrzeit, datumKurz, tagName, tagSchluessel, relativ, istBesichtigung, euro } from "./ui.js";
import { plusSheet, planungStarten, chatAnsicht } from "./chat.js";
import { pruefAnsicht } from "./pruefung.js";

const ansicht = $("#ansicht");
let abbruch = null; // laufende Anfragen der vorigen Ansicht abbrechen

const ANSICHTEN = { home, kalender, projekte, setup, projekt, chat: chatAnsicht, pruefung: pruefAnsicht };

async function zeigen() {
  const [name, id] = (location.hash.slice(1) || "home").split("/");
  const fn = ANSICHTEN[name] || home;
  abbruch?.abort();
  abbruch = new AbortController();
  const tab = ["home", "kalender", "projekte", "setup"].includes(name) ? name : name === "projekt" ? "projekte" : null;
  $$(".tabs button").forEach((b) => (b.dataset.tab === tab ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
  const vollbild = name === "chat";
  $(".tabs").hidden = vollbild; $("#fbbtn").hidden = vollbild;
  ansicht.innerHTML = "";
  ansicht.scrollTop = 0;
  try { await fn(ansicht, id, abbruch.signal); } catch (e) { fehlerMelden(e); }
  // Letzter Stand jeder Menüseite, damit sie beim Wischen sofort als Nachbarseite hereinkommt.
  if (MENUE.includes(name) && location.hash.slice(1).split("/")[0] === name) seitenBild[name] = ansicht.innerHTML;
}
const MENUE = ["home", "kalender", "projekte", "setup"];
const seitenBild = {};
export const gehe = (ziel) => { if (location.hash === "#" + ziel) zeigen(); else location.hash = ziel; };

$$(".tabs button").forEach((b) => b.addEventListener("click", () => (b.dataset.tab === "plus" ? plusSheet() : gehe(b.dataset.tab))));
$("#fbbtn").addEventListener("click", feedbackSheet);
addEventListener("hashchange", zeigen);

// Hinweise oben: Offline, Demo, Testmodus (nur wenn der Server nicht im Echtbetrieb läuft).
function banner() {
  if (zustand.offline) return `<div class="banner" role="status">Offline. Begonnene Besichtigungen laufen weiter, alles wird hochgeladen, sobald wieder Netz da ist.<button data-verbinden>Erneut verbinden</button></div>`;
  if (zustand.demo) return `<div class="banner blau" role="status">Demo, nicht verbunden. ${zustand.server ? "Server nicht erreichbar." : "Server-Adresse fehlt."}<button data-verbinden>${zustand.server ? "Erneut verbinden" : "Einrichten"}</button></div>`;
  return zustand.gesund?.echt ? "" : `<div class="banner" role="status">Testmodus: Speichern geht nach UNB-1149 oder in TEST-Projekte.</div>`;
}
document.addEventListener("click", async (e) => {
  if (!e.target.closest("[data-verbinden]")) return;
  if (!zustand.server && location.hostname.endsWith("github.io")) return gehe("setup");
  await verbinden(); lampe();
  toast(zustand.verbunden ? "Verbunden" : "Server nicht erreichbar", zustand.verbunden ? "ok" : "fehler");
  zeigen();
});

// ---------- Home ----------
async function home(el, _, signal) {
  const vorname = (zustand.ich?.name || "").split(/[\s@]/)[0];
  el.innerHTML = `${banner()}<h1>Hallo${vorname && vorname !== "Lokal" ? " " + esc(vorname) : ""}</h1><p class="unter">${esc(new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" }))}</p>
    <button class="gross" data-neu>${IKON.plus}Neue Besichtigung</button>
    <div class="label">Offene Planungen</div><div class="gruppe" id="offen"><div class="leer">Lädt …</div></div>
    <div class="label" id="termineLabel">Besichtigungen heute und morgen</div><div class="gruppe" id="termine"><div class="leer">Lädt …</div></div>
    <div class="label">Zuletzt gesendet</div><div class="gruppe" id="gesendet"><div class="leer">Lädt …</div></div>`;
  $("[data-neu]", el).onclick = plusSheet;

  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const [planungen, termine] = await Promise.all([
    api("/api/planungen", { signal }).catch(() => []),
    api(`/api/termine?von=${heute.toISOString()}&bis=${new Date(+heute + 2 * 864e5).toISOString()}`, { signal }).catch(() => null),
  ]);
  const offen = planungen.filter((p) => p.status !== "gesendet");
  $("#offen", el).innerHTML = offen.length ? offen.map(planungZeile).join("") : `<div class="leer">Keine offenen Planungen. Tipp auf „Neue Besichtigung“.</div>`;
  const gesendet = planungen.filter((p) => p.status === "gesendet").slice(0, 5);
  $("#gesendet", el).innerHTML = gesendet.length ? gesendet.map(planungZeile).join("") : `<div class="leer">Noch nichts gesendet.</div>`;
  // Zugeordnete Planer sehen ihre eigenen Besichtigungen, alle anderen die der ganzen Firma.
  const eigene = !!zustand.ich?.heroPerson || (termine || []).some((t) => t.meins);
  const bes = (termine || []).filter((t) => istBesichtigung(t) && (!eigene || t.meins)).sort((a, b) => a.start.localeCompare(b.start));
  if (eigene) $("#termineLabel", el).textContent = "Meine Besichtigungen heute und morgen";
  $("#termine", el).innerHTML = termine === null ? `<div class="leer">Termine nicht erreichbar.</div>`
    : bes.length ? bes.map((t) => terminZeile(t, !eigene)).join("") : `<div class="leer">Keine Besichtigungen eingetragen.</div>`;
}

const STATUS = { offen: ["Offen", "blau"], zusammengefasst: ["Zum Prüfen", "orange"], gesendet: ["In HERO", "gruen"] };
// Sende-Stand geht vor: läuft gerade im Hintergrund, oder hat nicht geklappt (dann in der Prüfansicht erneut senden).
const SENDEN = { laeuft: ["Wird gesendet …", "orange"], fehler: ["Senden fehlgeschlagen", "rot"] };
function planungZeile(p) {
  const [text, farbe] = SENDEN[p.senden?.status] || STATUS[p.status] || STATUS.offen;
  const ziel = p.status === "offen" ? "chat/" + p.id : "pruefung/" + p.id;
  const person = (p.personName || p.person || "").split(/[\s@]/)[0];
  return `<a class="zeile" href="#${ziel}"><div class="haupt"><div class="titel">${esc(p.projektTitel)}</div><div class="neben">${esc(relativ(p.erstellt))} · von ${esc(person)}</div></div><span class="badge ${farbe}">${text}</span><span class="pfeil">${IKON.pfeil}</span></a>`;
}
// Gebündelter Termin (ein Kunde, mehrere Projekte): die anderen Projekte gehen mit auf die Projektseite.
const terminZiel = (t) => (t.projektId ? `href="#projekt/${t.projektId}${t.projektIds?.length > 1 ? "?mit=" + t.projektIds.join(",") : ""}"` : "");
function terminZeile(t, mitPersonen = false) {
  const ziel = terminZiel(t);
  return `<a class="zeile" ${ziel}><span class="zeit">${t.ganztags ? "Ganz-<br>tags" : esc(uhrzeit(t.start))}</span><div class="haupt"><div class="titel">${esc(t.titel)}</div><div class="neben">${esc(tagSchluessel(t.start) === tagSchluessel(Date.now()) ? "Heute" : "Morgen")} · ${esc(t.kategorie)}${mitPersonen ? esc(personenText(t)) : ""}</div></div>${t.projektId ? `<span class="pfeil">${IKON.pfeil}</span>` : ""}</a>`;
}

// ---------- Kalender ----------
let kalenderTag = tagSchluessel(Date.now());
// Filter: meine (ich bin in HERO eingeteilt) | besichtigungen | alle; gemerkt pro Gerät.
const FILTER = [["meine", "Meine"], ["besichtigungen", "Besichtigungen"], ["alle", "Alle"]];
let kalenderFilter = speicher.get("planung-kalender-filter");
const filterTermin = (t) => (kalenderFilter === "meine" ? t.meins : kalenderFilter === "besichtigungen" ? istBesichtigung(t) : true);
const personenText = (t) => (t.personen?.length ? " · " + t.personen.join(", ") : "");
async function kalender(el, _, signal) {
  kalenderFilter ??= zustand.ich?.heroPerson ? "meine" : "besichtigungen";
  const tag = new Date(kalenderTag + "T12:00:00");
  const montag = new Date(tag); montag.setDate(tag.getDate() - ((tag.getDay() + 6) % 7));
  const tage = Array.from({ length: 7 }, (_, i) => { const d = new Date(montag); d.setDate(montag.getDate() + i); return d; });
  const kw = tage[3].toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  el.innerHTML = `${banner()}<div class="kopf"><h1>Kalender</h1><button class="pill rund" data-w="-7" aria-label="Woche zurück">${IKON.zurueck}</button><button class="pill rund" data-w="7" aria-label="Woche vor" style="transform:scaleX(-1)">${IKON.zurueck}</button></div>
    <p class="unter">${esc(kw)}</p>
    <div class="woche">${tage.map((d) => `<button data-tag="${tagSchluessel(d)}" aria-pressed="${tagSchluessel(d) === kalenderTag}" class="${tagSchluessel(d) === tagSchluessel(Date.now()) ? "heute" : ""}"><small>${esc(tagName(d))}</small><b>${d.getDate()}</b><span class="punkt" hidden></span></button>`).join("")}</div>
    <div class="segctl" role="group" aria-label="Filter">${FILTER.map(([k, t]) => `<button data-f="${k}" aria-pressed="${kalenderFilter === k}">${t}</button>`).join("")}</div>
    <div class="gruppe" id="liste"><div class="leer">Lädt …</div></div>`;
  $$("[data-w]", el).forEach((b) => (b.onclick = () => { const d = new Date(kalenderTag + "T12:00:00"); d.setDate(d.getDate() + Number(b.dataset.w)); kalenderTag = tagSchluessel(d); zeigen(); }));
  $$("[data-tag]", el).forEach((b) => (b.onclick = () => { kalenderTag = b.dataset.tag; zeigen(); }));
  $$("[data-f]", el).forEach((b) => (b.onclick = () => { kalenderFilter = b.dataset.f; speicher.set("planung-kalender-filter", kalenderFilter); zeigen(); }));

  const von = new Date(tagSchluessel(montag) + "T00:00:00"), bis = new Date(+von + 7 * 864e5);
  const alle = await api(`/api/termine?von=${von.toISOString()}&bis=${bis.toISOString()}`, { signal });
  const termine = alle.filter(filterTermin).sort((a, b) => a.start.localeCompare(b.start));
  // Mehrtägige Termine (in HERO häufig, z. B. Montage Mo bis Fr) gehören zu jedem Tag, den sie abdecken.
  const ersterTag = (t) => tagSchluessel(t.start), letzterTag = (t) => tagSchluessel(new Date(t.ende).getTime() - 1);
  const anTag = (t, tag) => ersterTag(t) <= tag && tag <= letzterTag(t);
  for (const b of $$("[data-tag]", el)) $(".punkt", b).hidden = !termine.some((t) => anTag(t, b.dataset.tag));
  const amTag = termine.filter((t) => anTag(t, kalenderTag));
  $("#liste", el).innerHTML = amTag.length ? amTag.map((t) => {
    const ziel = terminZiel(t);
    const mehrtaegig = ersterTag(t) !== letzterTag(t);
    const zeit = t.ganztags ? "Ganz-<br>tags" : ersterTag(t) < kalenderTag ? "läuft" : esc(uhrzeit(t.start));
    const neben = t.ganztags ? "" : mehrtaegig ? ` · ${esc(datumKurz(t.start))} bis ${esc(datumKurz(t.ende))}` : " · bis " + esc(uhrzeit(t.ende));
    return `<a class="zeile" ${ziel}><span class="zeit">${zeit}</span><div class="haupt"><div class="titel">${esc(t.titel)}</div><div class="neben">${esc(t.kategorie || "Termin")}${neben}${kalenderFilter === "meine" ? "" : esc(personenText(t))}</div></div>${t.projektId ? `<span class="pfeil">${IKON.pfeil}</span>` : ""}</a>`;
  }).join("") : `<div class="leer">${kalenderFilter === "meine" && !alle.some((t) => t.meins) && !zustand.ich?.heroPerson
    ? "Dir ist noch keine Person aus HERO zugeordnet. Ein Admin stellt das unter Einstellungen → Team ein."
    : { meine: "Keine eigenen Termine an diesem Tag.", besichtigungen: "Keine Besichtigungen an diesem Tag.", alle: "Keine Termine an diesem Tag." }[kalenderFilter]}</div>`;
}

// ---------- Projekte ----------
let suchText = "";
async function projekte(el, _, signal) {
  el.innerHTML = `${banner()}<h1>Projekte</h1><label class="suche">${IKON.suche}<input type="search" placeholder="Kunde, Adresse oder Projekt-Nr." value="${esc(suchText)}" aria-label="Projekte suchen" enterkeyhint="search"></label>
    <div class="gruppe" id="liste"><div class="leer">Lädt …</div></div><button class="pill" id="mehr" hidden style="width:100%">Mehr laden</button>`;
  const eingabe = $("input", el), liste = $("#liste", el), mehr = $("#mehr", el);
  let offset = 0, laufend = null, timer;
  async function laden(neu) {
    if (neu) { offset = 0; liste.innerHTML = `<div class="leer">Lädt …</div>`; }
    laufend?.abort(); laufend = new AbortController();
    signal.addEventListener("abort", () => laufend.abort());
    try {
      const treffer = await api(`/api/projekte?suche=${encodeURIComponent(suchText)}&offset=${offset}`, { signal: laufend.signal });
      const html = treffer.map(projektZeile).join("");
      if (neu) liste.innerHTML = html || `<div class="leer">Nichts gefunden.</div>`; else liste.insertAdjacentHTML("beforeend", html);
      offset += treffer.length;
      mehr.hidden = treffer.length < 30;
    } catch (e) { fehlerMelden(e); }
  }
  eingabe.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { suchText = eingabe.value.trim(); laden(true); }, 300); });
  mehr.onclick = () => laden(false);
  await laden(true);
}
const projektZeile = (p) => `<a class="zeile" href="#projekt/${p.id}"><div class="haupt"><div class="titel">${esc(p.kunde || p.titel)}</div><div class="neben">${esc(p.adresse || "ohne Adresse")}</div><div class="neben">${esc(p.nummer)}${p.status ? " · " + esc(p.status) : ""}</div></div><span class="pfeil">${IKON.pfeil}</span></a>`;

// ---------- Projektseite ----------
async function projekt(el, roh, signal) {
  // #projekt/7?mit=7,9: aus einem gebündelten Termin, die anderen Projekte desselben Besuchs sind vorausgewählt.
  const [id, q = ""] = String(roh).split("?");
  const mit = (new URLSearchParams(q).get("mit") || "").split(",").map(Number).filter(Boolean);
  el.innerHTML = `<h1>Projekt</h1><div class="leer">Lädt …</div>`;
  const [p, planungen] = await Promise.all([api("/api/projekte/" + id, { signal }), api("/api/planungen", { signal }).catch(() => [])]);
  const eigene = planungen.filter((x) => x.projektId === p.id || x.projekte?.some((y) => y.id === p.id));
  const karte = p.adresse ? `https://maps.google.com/?q=${encodeURIComponent(p.adresse)}` : "";
  el.innerHTML = `<div class="kopf"><button class="pill rund" data-zurueck aria-label="Zurück">${IKON.zurueck}</button><h1>${esc(p.kunde || p.titel)}</h1></div>
    <p class="unter">${esc(p.nummer)}${p.status ? " · " + esc(p.status) : ""}</p>
    <div class="gruppe">
      ${p.adresse ? `<a class="zeile" href="${karte}" target="_blank" rel="noopener"><div class="haupt"><div class="neben">Adresse</div><div class="titel">${esc(p.adresse)}</div></div><span class="pfeil">${IKON.pfeil}</span></a>` : ""}
      ${p.kontakt?.telefon ? `<a class="zeile" href="tel:${esc(p.kontakt.telefon.replace(/[^\d+]/g, ""))}"><div class="haupt"><div class="neben">Telefon</div><div class="titel">${esc(p.kontakt.telefon)}</div></div></a>` : ""}
      ${p.kontakt?.email ? `<a class="zeile" href="mailto:${esc(p.kontakt.email)}"><div class="haupt"><div class="neben">E-Mail</div><div class="titel">${esc(p.kontakt.email)}</div></div></a>` : ""}
    </div>
    <button class="gross" data-start>${IKON.plus}Besichtigung starten</button>
    ${p.kundeId ? `<div class="label">Alle Projekte von ${esc(p.kunde || "diesem Kunden")}</div><div class="gruppe" id="kundenprojekte"><div class="leer">Lädt …</div></div>` : ""}
    <div class="label">Planungen</div><div class="gruppe">${eigene.length ? eigene.map(planungZeile).join("") : `<div class="leer">Noch keine Planung in der App.</div>`}</div>
    <div class="label">Logbuch in HERO</div><div class="gruppe">${p.logbuch.length ? p.logbuch.slice(0, 8).map((e) => `<div class="zeile"><div class="haupt"><div class="neben">${esc(datumKurz(e.datum))}</div><div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(e.text.length > 400 ? e.text.slice(0, 400) + " …" : e.text)}</div></div></div>`).join("") : `<div class="leer">Keine Einträge.</div>`}</div>
    <div class="label">Dateien in HERO</div><div class="gruppe">${p.dateien.length ? p.dateien.map((d) => `<a class="zeile" href="${esc(d.url)}" target="_blank" rel="noopener"><div class="haupt"><div class="titel">${esc(d.name)}</div></div><span class="pfeil">${IKON.pfeil}</span></a>`).join("") : `<div class="leer">Keine Dateien.</div>`}</div>`;
  $("[data-zurueck]", el).onclick = () => (history.length > 1 ? history.back() : gehe("projekte"));
  $("[data-start]", el).onclick = () => planungStarten(p, { mit });
  // Alle Projekte desselben Kunden aus HERO; das offene Projekt ist markiert.
  if (p.kundeId) api(`/api/kunden/${p.kundeId}/projekte`, { signal }).then((liste) => {
    const box = $("#kundenprojekte", el);
    if (box) box.innerHTML = liste.map((x) => x.id === p.id
      ? `<div class="zeile"><div class="haupt"><div class="titel">${esc(x.nummer)}</div><div class="neben">${x.status ? esc(x.status) + " · " : ""}dieses Projekt</div></div></div>`
      : `<a class="zeile" href="#projekt/${x.id}"><div class="haupt"><div class="titel">${esc(x.nummer)}</div><div class="neben">${esc(x.status || "")}</div><div class="neben">${esc(x.adresse || "ohne Adresse")}</div></div><span class="pfeil">${IKON.pfeil}</span></a>`).join("") || `<div class="leer">Keine weiteren Projekte.</div>`;
  }).catch(() => { const box = $("#kundenprojekte", el); if (box) box.innerHTML = `<div class="leer">Konnte die Projekte nicht laden.</div>`; });
}

// ---------- Einstellungen ----------
async function setup(el, _, signal) {
  const theme = speicher.get("planung-theme") || "light dark";
  const g = zustand.gesund;
  const status = (ok, text) => `<span class="badge ${ok ? "gruen" : "orange"}">${ok ? "bereit" : text}</span>`;
  const vonGithub = location.hostname.endsWith("github.io");
  el.innerHTML = `<h1>Einstellungen</h1>
    <div class="label">Darstellung</div>
    <div class="segctl" role="group" aria-label="Darstellung">${[["light dark", "Wie System"], ["dark", "Dunkel"], ["light", "Hell"]].map(([w, t]) => `<button data-theme="${w}" aria-pressed="${theme === w}">${t}</button>`).join("")}</div>
    <div class="label">Verbindung</div>
    <div class="gruppe">
      ${vonGithub ? `<label class="feld"><span>Server-Adresse (Tailscale)</span><input id="adresse" type="url" inputmode="url" placeholder="https://pc-name.tailnet.ts.net:10443" value="${esc(zustand.server)}" autocomplete="off"></label>` : ""}
      <div class="zeile"><div class="haupt">Server</div>${status(zustand.verbunden, zustand.demo ? "Demo" : "aus")}</div>
      <div class="zeile"><div class="haupt">HERO</div>${status(g?.hero, "Schlüssel fehlt")}</div>
      <div class="zeile"><div class="haupt">Claude</div>${status(g?.claude, "Schlüssel fehlt")}</div>
      ${zustand.ich ? `<div class="zeile"><div class="haupt">Angemeldet als</div><span class="wert">${esc(zustand.ich.name)}</span></div>` : ""}
    </div>
    <button class="pill" id="verbinden" style="width:100%;margin-bottom:var(--gap)">${vonGithub ? "Speichern und verbinden" : "Erneut verbinden"}</button>
    <div class="label">Kosten Claude</div><div class="gruppe" id="kosten"><div class="leer">Lädt …</div></div>
    <div id="fbliste"></div>
    <p class="hinweis" style="margin-top:var(--gap-l)">Heldenwerker Planung · Testversion</p>`;
  $$("[data-theme]", el).forEach((b) => (b.onclick = () => { speicher.set("planung-theme", b.dataset.theme); $('meta[name="color-scheme"]').content = b.dataset.theme; systemleiste(); zeigen(); }));
  $("#verbinden", el).onclick = async () => {
    if (vonGithub) serverSetzen($("#adresse", el).value);
    await verbinden(); lampe();
    toast(zustand.verbunden ? "Verbunden" : "Server nicht erreichbar", zustand.verbunden ? "ok" : "fehler");
    zeigen();
  };
  const planungen = await api("/api/planungen", { signal }).catch(() => []);
  const summe = planungen.reduce((s, p) => s + (p.kostenCent || 0), 0);
  $("#kosten", el).innerHTML = `<div class="zeile"><div class="haupt">${planungen.length} Planungen</div><span class="wert">${euro(summe)}</span></div>
    ${planungen.length ? `<div class="zeile"><div class="haupt">Im Schnitt pro Planung</div><span class="wert">${euro(summe / planungen.length)}</span></div>` : ""}`;
  if (zustand.ich?.inhaber) await adminBereich($("#fbliste", el), signal);
}

// ---------- Nur für Admins: Feedback-Postfach und Team ----------
let feedbackFilter = "neu";
async function adminBereich(el, signal) {
  const [liste, team] = await Promise.all([api("/api/feedback", { signal }).catch(() => []), api("/api/team", { signal }).catch(() => [])]);
  const ART = { idee: "💡", fehler: "🐞", frage: "❓" };
  const status = (f) => f.status || "neu";
  const neu = liste.filter((f) => status(f) === "neu").length;
  const sichtbar = liste.filter((f) => status(f) === feedbackFilter);
  el.innerHTML = `<div class="label">Feedback${neu ? ` <span class="badge orange">${neu} neu</span>` : ""}</div>
    <div class="segctl" role="group" aria-label="Feedback filtern"><button data-fb="neu" aria-pressed="${feedbackFilter === "neu"}">Neu</button><button data-fb="erledigt" aria-pressed="${feedbackFilter === "erledigt"}">Erledigt</button></div>
    <div class="gruppe">${sichtbar.length ? sichtbar.map((f) => `<div class="zeile"><span aria-hidden="true">${ART[f.art]}</span><div class="haupt"><div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(f.text)}</div><div class="neben">${esc(f.name || f.person)} · ${esc(relativ(f.zeit))}${f.bild ? ` · <a href="${serverUrl("/api/feedback/bild/" + f.bild)}" target="_blank" rel="noopener">Bild</a>` : ""}</div></div>
      <button class="pill" data-status="${f.id}" data-ziel="${status(f) === "neu" ? "erledigt" : "neu"}">${status(f) === "neu" ? "Erledigt" : "Zurück"}</button></div>`).join("") : `<div class="leer">${feedbackFilter === "neu" ? "Nichts Neues." : "Noch nichts erledigt."}</div>`}</div>
    <div class="label">Team</div>
    <div class="gruppe">${team.map((p) => `<button class="zeile" data-login="${esc(p.login)}"><div class="haupt"><div class="titel">${esc(p.name)}</div><div class="neben">zuletzt ${esc(relativ(p.zuletzt))} · ${p.heroPerson ? "HERO: " + esc(p.heroPerson.name) : "keine HERO-Person"}</div></div><span class="badge ${p.rolle === "admin" ? "blau" : ""}">${p.rolle === "admin" ? "Admin" : "Planer"}</span><span class="pfeil">${IKON.pfeil}</span></button>`).join("")}</div>
    <p class="hinweis">Jeder, der die App über Tailscale öffnet, erscheint hier automatisch.</p>`;
  $$("[data-fb]", el).forEach((b) => (b.onclick = () => { feedbackFilter = b.dataset.fb; adminBereich(el, signal); }));
  $$("[data-status]", el).forEach((b) => (b.onclick = async () => {
    try {
      await api("/api/feedback/" + b.dataset.status, { methode: "PUT", body: { status: b.dataset.ziel } });
      await verbinden(); lampe(); adminBereich(el, signal);
    } catch (e) { fehlerMelden(e); }
  }));
  $$("[data-login]", el).forEach((b) => (b.onclick = () => profilSheet(team.find((p) => p.login === b.dataset.login), () => adminBereich(el, signal))));
}

function profilSheet(p, fertig) {
  let rolle = p.rolle;
  const d = sheet(`<div class="sheetkopf"><button class="pill" data-zu>Abbrechen</button><h2>Profil</h2><span></span></div>
    <div class="gruppe"><label class="feld"><span>Name</span><input id="pname" value="${esc(p.name)}" maxlength="80" autocomplete="off"></label>
      <div class="zeile"><div class="haupt"><div class="neben">Login</div><div>${esc(p.login)}</div></div></div>
      <label class="feld"><span>HERO-Person (für „Meine Termine“)</span><select id="pheld"><option value="">${p.heroPerson ? esc(p.heroPerson.name) : "Lädt …"}</option></select></label></div>
    <div class="label">Rolle</div>
    <div class="segctl" role="group" aria-label="Rolle"><button data-rolle="planer" aria-pressed="${rolle === "planer"}">Planer</button><button data-rolle="admin" aria-pressed="${rolle === "admin"}">Admin</button></div>
    <p class="hinweis">Admins sehen Feedback und Team. Weitere Rechte kommen später.</p>
    <button class="gross" data-speichern>Speichern</button>`);
  $("[data-zu]", d).onclick = () => d.close();
  $$("[data-rolle]", d).forEach((b) => (b.onclick = () => { rolle = b.dataset.rolle; $$("[data-rolle]", d).forEach((x) => x.setAttribute("aria-pressed", x === b)); }));
  // Wer in HERO-Terminen eingeteilt ist; die aktuelle Zuordnung bleibt wählbar, auch wenn sie gerade keine Termine hat.
  const wahl = $("#pheld", d);
  let personen = [];
  api("/api/hero-personen").then((liste) => {
    personen = p.heroPerson && !liste.some((x) => x.id === p.heroPerson.id) ? [p.heroPerson, ...liste] : liste;
    wahl.innerHTML = `<option value="">Keine Zuordnung</option>${personen.map((x) => `<option value="${x.id}" ${x.id === p.heroPerson?.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}`;
  }).catch(() => { wahl.innerHTML = `<option value="">${p.heroPerson ? esc(p.heroPerson.name) : "HERO nicht erreichbar"}</option>`; wahl.disabled = true; });
  $("[data-speichern]", d).onclick = async () => {
    const body = { name: $("#pname", d).value, rolle };
    if (!wahl.disabled) body.heroPerson = personen.find((x) => String(x.id) === wahl.value) || null;
    try { await api("/api/team/" + encodeURIComponent(p.login), { methode: "PUT", body }); d.close(); toast("Gespeichert", "ok"); fertig(); }
    catch (e) { fehlerMelden(e); }
  };
}

// Roter Punkt an der Lampe, solange es neue Feedbacks gibt (nur Admins).
const lampe = () => $("#fbbtn").classList.toggle("ungelesen", (zustand.ich?.feedbackNeu || 0) > 0);

// ---------- Feedback-Lampe ----------
function feedbackSheet() {
  let art = "idee";
  const d = sheet(`<div class="sheetkopf"><button class="pill" data-zu>Schließen</button><h2>Feedback</h2><span></span></div>
    <p class="muted">Was können wir besser machen? Idee, Fehler oder Frage, alles hier rein.</p>
    <div class="segctl" role="group" aria-label="Art">${[["idee", "💡 Idee"], ["fehler", "🐞 Fehler"], ["frage", "❓ Frage"]].map(([w, t]) => `<button data-art="${w}" aria-pressed="${w === art}">${t}</button>`).join("")}</div>
    <textarea rows="5" maxlength="4000" placeholder="Schreib einfach los …" aria-label="Feedback-Text"></textarea>
    <button class="gross" data-senden style="margin-top:var(--gap)">Senden</button>`);
  $("[data-zu]", d).onclick = () => d.close();
  $$("[data-art]", d).forEach((b) => (b.onclick = () => { art = b.dataset.art; $$("[data-art]", d).forEach((x) => x.setAttribute("aria-pressed", x === b)); }));
  $("[data-senden]", d).onclick = async () => {
    const text = $("textarea", d).value.trim();
    if (!text) return toast("Bitte kurz beschreiben", "fehler");
    try { await api("/api/feedback", { methode: "POST", body: { art, text } }); d.close(); toast("Danke, ist angekommen", "ok"); } catch (e) { fehlerMelden(e); }
  };
}

// ---------- Wischen zwischen den Menüfeldern (wie in der Stempeluhr) ----------
// Die Menüseiten liegen wie eine lange Seite nebeneinander. Beim Wischen schiebt sich die Nachbarseite herein
// (ihr letzter Stand aus seitenBild); nach dem Loslassen wird sie frisch geladen.
(function seitenWischen() {
  const nav = $(".tabs");
  const peek = document.createElement("main");
  peek.id = "peek"; peek.setAttribute("aria-hidden", "true"); peek.inert = true;
  ansicht.after(peek);
  let s = null, raf = 0, busy = false;
  const aktuell = () => (location.hash.slice(1) || "home").split("/")[0];
  const W = () => ansicht.clientWidth;
  // Nicht wischen in Feldern, auf der Leiste, in offenen Sheets und in Bereichen, die selbst seitlich scrollen.
  const gesperrt = (el) => el.closest("input,select,textarea,.tabs,[data-noswipe],dialog") || (function () {
    for (let e = el; e && e !== ansicht; e = e.parentElement) if (e.scrollWidth > e.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(e).overflowX)) return true;
    return false;
  })();
  const nachbarHtml = (t) => seitenBild[t] || `<h1>${{ home: "Home", kalender: "Kalender", projekte: "Projekte", setup: "Einstellungen" }[t]}</h1><div class="leer">Lädt …</div>`;
  function setzen(x) {
    ansicht.style.transform = x ? `translate3d(${x}px,0,0)` : "";
    peek.style.transform = s?.seite ? `translate3d(${x + s.seite * W()}px,0,0)` : "";
  }
  function ausklingen(ms, dann) {
    ansicht.style.transition = peek.style.transition = `transform ${ms}ms cubic-bezier(.22,1,.36,1)`;
    setTimeout(() => { ansicht.style.transition = peek.style.transition = "none"; dann(); }, ms + 20);
  }
  ansicht.addEventListener("touchstart", (e) => {
    s = null;
    if (busy || e.touches.length !== 1 || nav.hidden || !MENUE.includes(aktuell()) || document.querySelector("dialog[open]") || gesperrt(e.target)) return;
    s = { x: e.touches[0].clientX, y: e.touches[0].clientY, dir: 0, dx: 0, hist: [], seite: 0, ziel: null };
  }, { passive: true });
  ansicht.addEventListener("touchmove", (e) => {
    if (!s || busy) return;
    const t = e.touches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (!s.dir) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      s.dir = Math.abs(dx) > Math.abs(dy) * 1.3 ? "h" : "v";
      if (s.dir === "h") { s.x = t.clientX; document.body.classList.add("wischt"); ansicht.style.transition = peek.style.transition = "none"; }
    }
    if (s.dir !== "h") return;
    e.preventDefault();
    s.hist.push([e.timeStamp, t.clientX]);
    while (s.hist.length > 2 && e.timeStamp - s.hist[0][0] > 100) s.hist.shift();
    s.dx = t.clientX - s.x;
    const i = MENUE.indexOf(aktuell()), seite = s.dx < 0 ? 1 : -1, ziel = MENUE[i + seite];
    if (ziel && s.seite !== seite) { peek.innerHTML = nachbarHtml(ziel); peek.scrollTop = 0; s.seite = seite; s.ziel = ziel; peek.classList.add("an"); }
    if (!ziel) { s.seite = 0; s.ziel = null; peek.classList.remove("an"); }
    const x = s.seite ? s.dx : s.dx / (1 + Math.abs(s.dx) / 60); // ohne Nachbar: Gummiband
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (s) setzen(x); });
  }, { passive: false });
  const fertig = (e) => {
    if (!s) return;
    const st = s; cancelAnimationFrame(raf); raf = 0;
    if (st.dir !== "h") { s = null; return; }
    const [erst, letzt] = [st.hist[0], st.hist.at(-1)];
    const v = letzt && erst && letzt[0] > erst[0] && e.timeStamp - letzt[0] < 80 ? (letzt[1] - erst[1]) / (letzt[0] - erst[0]) : 0;
    const schwung = Math.abs(v) > 0.4 && Math.sign(v) === Math.sign(st.dx);
    const wechseln = e.type !== "touchcancel" && st.seite && (Math.abs(st.dx) > W() * 0.3 || schwung);
    busy = true;
    setzen(st.seite ? st.dx : st.dx / (1 + Math.abs(st.dx) / 60));
    ansicht.offsetWidth;
    const aufraeumen = () => { s = null; ansicht.style.transform = peek.style.transform = ""; document.body.classList.remove("wischt"); peek.classList.remove("an"); peek.innerHTML = ""; busy = false; };
    if (wechseln) {
      const rest = 1 - Math.abs(st.dx) / W();
      $$(".tabs button").forEach((b) => (b.dataset.tab === st.ziel ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
      ausklingen(Math.round(180 + 200 * rest), () => {
        // Neue Seite sofort mit ihrem letzten Stand zeigen, dann frisch laden (kein Aufblitzen von leer).
        ansicht.innerHTML = peek.innerHTML; ansicht.scrollTop = 0;
        aufraeumen(); gehe(st.ziel);
      });
      ansicht.style.transform = `translate3d(${-st.seite * W()}px,0,0)`;
      peek.style.transform = "translate3d(0,0,0)";
    } else {
      ausklingen(320, aufraeumen);
      ansicht.style.transform = "translate3d(0,0,0)";
      if (st.seite) peek.style.transform = `translate3d(${st.seite * W()}px,0,0)`;
    }
  };
  ansicht.addEventListener("touchend", fertig);
  ansicht.addEventListener("touchcancel", fertig);
})();

// iOS-Web-App: Der Layout-Bereich endet manchmal über der Home-Leiste. Dann auf die echte Bildschirmhöhe ziehen,
// damit die Menüleiste ganz unten sitzt (wie in der Stempeluhr).
function hoeheAnpassen() {
  const standalone = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
  const h = standalone && innerHeight > innerWidth ? screen.height : 0;
  if (h > innerHeight && h - innerHeight < 120) document.documentElement.style.setProperty("--appH", h + "px");
  else document.documentElement.style.removeProperty("--appH");
}
hoeheAnpassen();
addEventListener("resize", hoeheAnpassen);
// Android: Die Systemleiste oben bekommt die Hintergrundfarbe der App, auch nach dem Wechsel zwischen Hell und Dunkel.
function systemleiste() {
  if (document.documentElement.dataset.os === "android") $('meta[name="theme-color"]').content = getComputedStyle(document.body).backgroundColor;
}
systemleiste();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", systemleiste);
// Sichtbarer Bereich (ohne Tastatur) als CSS-Variablen: Der Chat sitzt darin fest, das Eingabefeld direkt über der Tastatur.
function sichtbarerBereich() {
  const vv = window.visualViewport;
  if (!vv) return;
  const wurzel = document.documentElement.style;
  wurzel.setProperty("--vv-top", vv.offsetTop + "px");
  wurzel.setProperty("--vv-h", vv.height + "px");
}
window.visualViewport?.addEventListener("resize", sichtbarerBereich);
window.visualViewport?.addEventListener("scroll", sichtbarerBereich);
sichtbarerBereich();
// Tastatur offen = Textfeld aktiv auf einem Touch-Gerät. (iOS verkleinert beim Öffnen auch innerHeight,
// ein Höhenvergleich erkennt die Tastatur dort nicht.) Dann fällt der Abstand zur Home-Leiste unter dem Eingabefeld weg.
const textfeldAktiv = () => /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || "");
document.addEventListener("focusin", () => document.body.classList.toggle("tastatur", textfeldAktiv() && matchMedia("(pointer: coarse)").matches));
// iOS: Nach dem Schließen der Tastatur bleibt die Seite manchmal verschoben.
document.addEventListener("focusout", () => setTimeout(() => {
  if (textfeldAktiv()) return;
  document.body.classList.remove("tastatur");
  window.scrollTo(0, 0);
}, 60));

// ---------- Start ----------
// Service Worker: App-Dateien auf dem Gerät, damit die App auch ohne Netz startet.
navigator.serviceWorker?.register("sw.js").catch((e) => console.warn("Service Worker:", e));
(async () => {
  if (await brauchtKlick()) { zustand.demo = true; }
  else await verbinden();
  lampe();
  zeigen();
})();
