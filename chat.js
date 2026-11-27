// Plus-Sheet (neues oder vorhandenes Projekt) und der Planungs-Chat als fester Ablauf.
import { api, dateiUrl, zustand, bericht, merken, serverUrl } from "./api.js";
import { ablage, antwortAnwenden, istZahl } from "./lokal.js";
import { einreihen, abarbeiten, offeneAntworten, dateiBlob, anzahl } from "./ausgang.js";
import { $, $$, esc, toast, fehlerMelden, sheet, zurueck, IKON } from "./ui.js";
import { zeichnen } from "./zeichnen.js";

const gehe = (ziel) => (location.hash = ziel);

// ---------- Plus ----------
export function plusSheet() {
  const d = sheet(`<div class="sheetkopf"><span></span><h2>Neue Besichtigung</h2><button class="pill" data-zu>Abbrechen</button></div>
    <div class="zwei">
      <button class="kachel" data-neu><span class="ikon">${IKON.plus}</span><b>Neues Projekt</b><span>Kunde ist noch nicht in HERO</span></button>
      <button class="kachel" data-alt><span class="ikon">${IKON.ordner}</span><b>Vorhandenes Projekt</b><span>Aus HERO auswählen</span></button>
    </div>`);
  $("[data-zu]", d).onclick = () => d.close();
  $("[data-neu]", d).onclick = () => { d.close(); neuesProjektSheet(); };
  $("[data-alt]", d).onclick = () => { d.close(); projektWaehlenSheet(); };
}

function neuesProjektSheet() {
  const feld = (name, label, attr = "") => `<label class="feld"><span>${label}</span><input name="${name}" ${attr}></label>`;
  const d = sheet(`<form><div class="sheetkopf"><button type="button" class="pill" data-zu>Abbrechen</button><h2>Neues Projekt</h2><span></span></div>
    ${zustand.gesund?.echt ? "" : `<div class="banner">Wird in HERO mit „TEST“ vor dem Namen angelegt.</div>`}
    <div class="gruppe">${feld("vorname", "Vorname", 'autocomplete="off"')}${feld("nachname", "Nachname", 'autocomplete="off"')}${feld("firma", "Firma (optional)", 'autocomplete="off"')}</div>
    <div class="gruppe">${feld("strasse", "Straße und Nr.", 'autocomplete="off"')}<div class="zwei" style="margin:0">${feld("plz", "PLZ", 'inputmode="numeric" autocomplete="off"')}${feld("ort", "Ort", 'autocomplete="off"')}</div>${feld("telefon", "Telefon", 'type="tel" autocomplete="off"')}${feld("email", "E-Mail", 'type="email" autocomplete="off"')}</div>
    <div class="gruppe">${feld("titel", "Worum geht es?", 'placeholder="z. B. PV 9,9 kWp mit Speicher" required')}</div>
    <button class="gross">Anlegen und starten</button></form>`);
  $("[data-zu]", d).onclick = () => d.close();
  $("form", d).onsubmit = async (e) => {
    e.preventDefault();
    const daten = Object.fromEntries(new FormData(e.target));
    if (!daten.nachname.trim() && !daten.firma.trim()) return toast("Bitte Nachname oder Firma eintragen", "fehler");
    const knopf = $(".gross", d); knopf.disabled = true; knopf.textContent = "Wird in HERO angelegt …";
    try { const p = await api("/api/projekte", { methode: "POST", body: daten }); d.close(); await planungStarten(p); }
    catch (err) { fehlerMelden(err); knopf.disabled = false; knopf.textContent = "Anlegen und starten"; }
  };
}

function projektWaehlenSheet() {
  const d = sheet(`<div class="sheetkopf"><button class="pill" data-zu>Abbrechen</button><h2>Projekt wählen</h2><span></span></div>
    <label class="suche">${IKON.suche}<input type="search" placeholder="Kunde, Adresse oder Projekt-Nr." aria-label="Projekt suchen" enterkeyhint="search"></label>
    <div class="gruppe" id="treffer"><div class="leer">Lädt …</div></div>`);
  $("[data-zu]", d).onclick = () => d.close();
  const eingabe = $("input", d), liste = $("#treffer", d);
  let laufend, timer, treffer = [];
  async function suchen() {
    laufend?.abort(); laufend = new AbortController();
    try {
      treffer = await api(`/api/projekte?suche=${encodeURIComponent(eingabe.value.trim())}`, { signal: laufend.signal });
      liste.innerHTML = treffer.length ? treffer.map((p, i) => `<button class="zeile" data-i="${i}"><div class="haupt"><div class="titel">${esc(p.kunde || p.titel)}</div><div class="neben">${esc(p.nummer)} · ${esc(p.adresse || "ohne Adresse")}</div></div><span class="pfeil">${IKON.pfeil}</span></button>`).join("") : `<div class="leer">Nichts gefunden.</div>`;
    } catch (e) { fehlerMelden(e); }
  }
  eingabe.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(suchen, 300); });
  liste.addEventListener("click", async (e) => { const b = e.target.closest("[data-i]"); if (!b) return; d.close(); await planungStarten(treffer[b.dataset.i]); });
  suchen();
  setTimeout(() => eingabe.focus(), 250);
}

// Ein Kunde ist ein Besuch: zuerst wählen, was besichtigt wird, und zu welchem seiner HERO-Projekte das jeweils gehört.
// Vorausgewählt ist, was das geöffnete Projekt (und die Projekte aus demselben Termin, mit) laut Gewerk abdeckt.
const RICHTUNGEN = ["PV", "Wärmepumpe", "Klimaanlage"];
export async function planungStarten(p, { mit = [] } = {}) {
  const projekte = p.kundeId ? await api(`/api/kunden/${p.kundeId}/projekte`).catch(() => []) : [];
  if (!projekte.some((x) => x.id === p.id)) projekte.unshift(p);
  const dabei = (x) => x.id === p.id || mit.includes(x.id);
  const an = new Set(projekte.filter(dabei).flatMap((x) => x.richtungen || []));
  const passend = (r) => projekte.filter((x) => (x.richtungen || []).includes(r));
  const zu = Object.fromEntries(RICHTUNGEN.map((r) => [r, (passend(r).find(dabei) || passend(r)[0] || p).id]));
  const d = sheet(`<div class="sheetkopf"><button class="pill" data-zu>Abbrechen</button><h2>Was wird besichtigt?</h2><span></span></div>
    <p class="unter">${esc(p.kunde || p.titel || "")}</p>
    <div class="knoepfe">${RICHTUNGEN.map((r) => `<button class="wahl" data-r="${r}">${r}</button>`).join("")}</div>
    <div class="gruppe" id="zuordnung" hidden></div>
    <button class="gross" data-los>Besichtigung starten</button>`);
  const zeichne = () => {
    for (const b of $$("[data-r]", d)) { b.classList.toggle("gewaehlt", an.has(b.dataset.r)); b.setAttribute("aria-pressed", an.has(b.dataset.r)); }
    const box = $("#zuordnung", d), welche = RICHTUNGEN.filter((r) => an.has(r));
    box.hidden = projekte.length < 2 || !welche.length;
    box.innerHTML = welche.map((r) => `<label class="feld"><span>${r} gehört zu Projekt</span><select data-fuer="${r}">${projekte.map((x) =>
      `<option value="${x.id}" ${zu[r] === x.id ? "selected" : ""}>${esc(x.nummer || String(x.id))}${x.gewerk ? " · " + esc(x.gewerk) : ""}${x.status ? " · " + esc(x.status) : ""}</option>`).join("")}</select></label>`).join("");
    $("[data-los]", d).disabled = !welche.length;
  };
  $("[data-zu]", d).onclick = () => d.close();
  for (const b of $$("[data-r]", d)) b.onclick = () => { if (an.has(b.dataset.r)) an.delete(b.dataset.r); else an.add(b.dataset.r); zeichne(); };
  $("#zuordnung", d).addEventListener("change", (e) => { if (e.target.dataset.fuer) zu[e.target.dataset.fuer] = Number(e.target.value); });
  $("[data-los]", d).onclick = async (e) => {
    const knopf = e.currentTarget, typen = RICHTUNGEN.filter((r) => an.has(r)), liste = [];
    for (const r of typen) {
      const x = projekte.find((y) => y.id === zu[r]) || p;
      const eintrag = liste.find((y) => y.id === x.id);
      if (eintrag) eintrag.richtungen.push(r); else liste.push({ id: x.id, nummer: x.nummer || "", richtungen: [r] });
    }
    knopf.disabled = true;
    try {
      const titel = [liste.map((x) => x.nummer).filter(Boolean).join(", "), p.kunde, p.adresse].filter(Boolean).join(", ");
      const pl = await api("/api/planungen", { methode: "POST", body: { projektId: liste[0].id, projektTitel: titel, kunde: p.kunde, adresse: p.adresse, nummer: p.nummer, typen, projekte: liste } });
      d.close();
      gehe("chat/" + pl.id);
    } catch (err) { fehlerMelden(err); knopf.disabled = false; }
  }
  zeichne();
}

// ---------- Abnahmeprotokoll aus der Menüleiste ----------
export function abnahmeSheet() {
  const monteur = zustand.ich?.rolle === "monteur";
  const d = sheet(`<div class="sheetkopf"><button class="pill" data-zu>Abbrechen</button><h2>Abnahmeprotokoll</h2><span></span></div>
    <div class="label">Montagen</div><div class="gruppe" id="montagen"><div class="leer">Lädt …</div></div>
    ${monteur ? "" : `<div class="label">Anderes Projekt</div>
    <label class="suche">${IKON.suche}<input type="search" placeholder="Kunde, Adresse oder Projekt-Nr." aria-label="Projekt suchen" enterkeyhint="search"></label>
    <div class="gruppe" id="treffer"></div>`}`);
  $("[data-zu]", d).onclick = () => d.close();
  let termine = [], treffer = [];
  const tag = 864e5, heute = new Date(); heute.setHours(0, 0, 0, 0);
  api(`/api/termine?von=${new Date(+heute - 7 * tag).toISOString()}&bis=${new Date(+heute + 8 * tag).toISOString()}`).then((liste) => {
    // Montagen mit Projekt; Planer und Admins sehen zuerst ihre eigenen, sonst alle (Monteure bekommen vom Server nur ihre).
    const montage = liste.filter((t) => t.projektId && ["Umsetzung", "DC Montage", "WP Montage", "Zählertausch"].includes(t.kategorie));
    termine = (montage.some((t) => t.meins) ? montage.filter((t) => t.meins) : montage).sort((a, b) => Math.abs(new Date(a.start) - Date.now()) - Math.abs(new Date(b.start) - Date.now()));
    $("#montagen", d).innerHTML = termine.length ? termine.map((t, i) => `<button class="zeile" data-t="${i}"><div class="haupt"><div class="titel">${esc(t.kunde || t.titel)}</div><div class="neben">${esc(new Date(t.start).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }))} · ${esc(t.kategorie)}${t.personen?.length ? " · " + esc(t.personen.join(", ")) : ""}</div></div><span class="pfeil">${IKON.pfeil}</span></button>`).join("")
      : `<div class="leer">Keine Montagen in den letzten und nächsten 7 Tagen.</div>`;
  }).catch(() => { $("#montagen", d).innerHTML = `<div class="leer">Termine nicht erreichbar.</div>`; });
  const eingabe = $("input", d), liste = $("#treffer", d);
  let laufend, timer;
  eingabe?.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(async () => {
    const q = eingabe.value.trim();
    if (!q) { liste.innerHTML = ""; return; }
    laufend?.abort(); laufend = new AbortController();
    try {
      treffer = await api(`/api/projekte?suche=${encodeURIComponent(q)}`, { signal: laufend.signal });
      liste.innerHTML = treffer.length ? treffer.map((p, i) => `<button class="zeile" data-p="${i}"><div class="haupt"><div class="titel">${esc(p.kunde || p.titel)}</div><div class="neben">${esc(p.nummer)} · ${esc(p.adresse || "ohne Adresse")}</div></div><span class="pfeil">${IKON.pfeil}</span></button>`).join("") : `<div class="leer">Nichts gefunden.</div>`;
    } catch (e) { if (e.name !== "AbortError") fehlerMelden(e); }
  }, 300); });
  d.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-t], [data-p]"); if (!b) return;
    b.disabled = true;
    try {
      if (b.dataset.t !== undefined) {
        const t = termine[b.dataset.t], p = await api("/api/projekte/" + t.projektId);
        d.close(); await abschlussStarten(p, { mit: t.projektIds || [], personen: t.personen || [] });
      } else { const p = treffer[b.dataset.p]; d.close(); await abschlussStarten(p); }
    } catch (err) { fehlerMelden(err); b.disabled = false; }
  });
}

// ---------- Neu starten (Dominik, 27.11.), Abschlussbericht und Besichtigung ----------
// Offen: alle Antworten, Fotos, Unterschrift und Zusammenfassung weg, Kundendaten, Typ/Bericht und Monteure bleiben.
// Schon gesendet: neu anlegen für dieselben Projekte, das Gesendete bleibt unangetastet.
export async function berichtNeuStarten(planung, fragen) {
  const a = planung.antworten || {}, gesendet = planung.status === "gesendet" || !!planung.senden, abschluss = !!berichtKey(fragen, a);
  if (!confirm(gesendet ? `${abschluss ? "Dieser Bericht ist" : "Diese Besichtigung ist"} schon gesendet. Für dasselbe Projekt neu anlegen?`
    : `Alle Antworten, Fotos${abschluss ? " und die Unterschrift" : " und die Zusammenfassung"} werden gelöscht. Wirklich neu starten?`)) return;
  try {
    await abarbeiten(); // nichts Altes aus dem Ausgang über den neuen Stand legen
    const liste = (w) => String(w || "").split(",").map((s) => s.trim()).filter(Boolean);
    const pl = !gesendet ? await api(`/api/planungen/${planung.id}/neustart`, { methode: "POST", body: {} })
      : abschluss ? await api("/api/planungen", { methode: "POST", body: { bericht: berichtKey(fragen, a), projektId: planung.projektId, projektTitel: planung.projektTitel,
          kunde: a.ab_kunde?.wert, adresse: a.ab_adresse?.wert, nummer: a.ab_projektnr?.wert, monteure: liste(a.ab_monteure?.wert) } })
      : await api("/api/planungen", { methode: "POST", body: { projektId: planung.projektId, projekte: planung.projekte, typen: liste(a.typ?.wert), projektTitel: planung.projektTitel,
          kunde: a.kunde?.wert, adresse: a.adresse?.wert, nummer: a.projektnr?.wert } });
    toast(gesendet ? "Neu angelegt" : "Neu gestartet", "ok");
    if (location.hash === "#chat/" + pl.id) dispatchEvent(new HashChangeEvent("hashchange")); else gehe("chat/" + pl.id);
  } catch (e) { fehlerMelden(e); }
}

// ---------- Baustelle abschließen ----------
// Bericht wählen (Vorauswahl aus dem Gewerk), bei einem gebündelten Termin auch das Projekt. Monteure = Personen des Termins.
const BERICHTE = [["dc", "Dachmontage DC"], ["ac", "Elektrik AC"], ["wp", "Wärmepumpe"], ["klima", "Klima"]];
const berichteAus = (gewerk = "") => { const g = gewerk.toLowerCase(), r = [];
  if (/photovoltaik|pv/.test(g)) r.push("dc", "ac"); else if (/wallbox|speicher|elektro/.test(g)) r.push("ac");
  if (/wärmepumpe/.test(g)) r.push("wp"); if (/klima/.test(g)) r.push("klima"); return r; };
export async function abschlussStarten(p, { mit = [], personen = [] } = {}) {
  const projekte = [p, ...(await Promise.all(mit.filter((x) => x !== p.id).map((x) => api("/api/projekte/" + x).catch(() => null)))).filter(Boolean)];
  let bericht = berichteAus(p.gewerk)[0] || null;
  const passend = () => projekte.find((x) => berichteAus(x.gewerk).includes(bericht)) || p;
  let projektId = passend().id;
  const d = sheet(`<div class="sheetkopf"><button class="pill" data-zu>Abbrechen</button><h2>Baustelle abschließen</h2><span></span></div>
    <p class="unter">${esc(p.kunde || p.titel || "")}</p>
    <div class="label">Welcher Bericht?</div>
    <div class="knoepfe">${BERICHTE.map(([k, t]) => `<button class="wahl" data-b="${k}">${t}</button>`).join("")}</div>
    <div class="gruppe" id="projektwahl" ${projekte.length < 2 ? "hidden" : ""}><label class="feld"><span>Gehört zu Projekt</span><select>${projekte.map((x) =>
      `<option value="${x.id}">${esc(x.nummer || String(x.id))}${x.gewerk ? " · " + esc(x.gewerk) : ""}</option>`).join("")}</select></label></div>
    <button class="gross" data-los>Weiter</button>`);
  // Schritt 2 (Dominik, 27.11.): wer war mit auf der Baustelle? Teams aus den Einstellungen bringen ihre Mitglieder mit
  // (vorausgewählt, abwählbar); danach weitere Teams oder einzelne Namen. Vorausgewählt: Personen/Teams des Termins und ich.
  const laden = Promise.all([api("/api/mitarbeiter").catch(() => []), api("/api/teams").catch(() => [])]);
  const ich = zustand.ich?.heroPerson?.name || zustand.ich?.name || "";
  const dabei = new Set(), teamsAn = new Set(), extra = new Set();
  let vorbelegt = false;
  async function werWarDabei() {
    const [heroNamen, teams] = await laden;
    const teamVon = (n) => teams.find((t) => t.name === n);
    const teamAn = (t) => { teamsAn.add(t.name); t.mitglieder.forEach((m) => dabei.add(m)); };
    if (!vorbelegt) { vorbelegt = true; for (const n of [...personen, ich].filter(Boolean)) teamVon(n) ? teamAn(teamVon(n)) : dabei.add(n); }
    const imTeam = new Set(teams.flatMap((t) => t.mitglieder));
    const einzeln = [...new Set([...heroNamen.filter((n) => !teamVon(n)), ...extra, ...[...dabei].filter((n) => !imTeam.has(n))])].sort((a, b) => a.localeCompare(b, "de"));
    const chip = (n, attr) => `<button class="wahl" ${attr}="${esc(n)}">${esc(n)}</button>`;
    $(".panel", d).innerHTML = `<div class="griff"></div><div class="sheetkopf"><button class="pill" data-zurueckb>Zurück</button><h2>Wer war dabei?</h2><span></span></div>
      ${teams.length ? `<div class="label">Teams</div><div class="knoepfe">${teams.map((t) => chip(t.name, "data-team")).join("")}</div>` : ""}
      ${teams.filter((t) => teamsAn.has(t.name)).map((t) => `<div class="label">${esc(t.name)}</div><div class="knoepfe">${t.mitglieder.map((m) => chip(m, "data-n")).join("") || `<span class="muted small">Noch niemand eingetragen (Einstellungen > Montage-Teams)</span>`}</div>`).join("")}
      <div class="label">${teams.length ? "Weitere Personen" : "Personen"}</div>
      <div class="knoepfe">${einzeln.map((n) => chip(n, "data-n")).join("")}${teams.filter((t) => !teamsAn.has(t.name)).flatMap((t) => t.mitglieder).filter((m) => !einzeln.includes(m)).map((m) => chip(m, "data-n")).join("")}</div>
      <div class="feldzeile" style="margin:10px 0"><input id="weitere" placeholder="Weitere Person (Name)" autocomplete="off" aria-label="Weitere Person"><button class="sendbtn" data-dazu aria-label="Hinzufügen">${IKON.plus}</button></div>
      <button class="gross" data-start>Bericht starten</button>`;
    const markieren = () => {
      for (const b of $$("[data-n]", d)) { const an = dabei.has(b.dataset.n); b.classList.toggle("gewaehlt", an); b.setAttribute("aria-pressed", an); }
      for (const b of $$("[data-team]", d)) { const an = teamsAn.has(b.dataset.team); b.classList.toggle("gewaehlt", an); b.setAttribute("aria-pressed", an); }
      $("[data-start]", d).disabled = !dabei.size && !teamsAn.size;
    };
    $(".panel", d).onclick = (e) => {
      const n = e.target.closest("[data-n]"), t = e.target.closest("[data-team]");
      if (n) { dabei.has(n.dataset.n) ? dabei.delete(n.dataset.n) : dabei.add(n.dataset.n); markieren(); }
      if (t) { const team = teamVon(t.dataset.team); if (teamsAn.has(team.name)) { teamsAn.delete(team.name); team.mitglieder.forEach((m) => dabei.delete(m)); } else teamAn(team); werWarDabei(); }
    };
    $("[data-dazu]", d).onclick = () => { const n = $("#weitere", d).value.trim().slice(0, 80); if (!n) return; extra.add(n); dabei.add(n); werWarDabei(); };
    $("[data-zurueckb]", d).onclick = (e) => { e.stopPropagation(); d.close(); abschlussStarten(p, { mit, personen: [...teamsAn, ...dabei] }); };
    $("[data-start]", d).onclick = (e) => { e.stopPropagation(); starten(e); };
    markieren();
  }
  // Für den Bericht: alle gewählten Namen; ein gewähltes Team ohne gewählte Mitglieder steht mit seinem Namen drin.
  const werListe = async () => { const [, teams] = await laden; return [...dabei, ...[...teamsAn].filter((t) => !(teams.find((x) => x.name === t)?.mitglieder || []).some((m) => dabei.has(m)))]; };
  const zeichne = () => {
    for (const b of $$("[data-b]", d)) { b.classList.toggle("gewaehlt", b.dataset.b === bericht); b.setAttribute("aria-pressed", b.dataset.b === bericht); }
    $("select", d).value = String(projektId);
    $("[data-los]", d).disabled = !bericht;
  };
  $("[data-zu]", d).onclick = () => d.close();
  for (const b of $$("[data-b]", d)) b.onclick = () => { bericht = b.dataset.b; projektId = passend().id; zeichne(); };
  $("select", d).onchange = (e) => (projektId = Number(e.target.value));
  $("[data-los]", d).onclick = werWarDabei;
  async function starten(e) {
    const knopf = e.currentTarget, x = projekte.find((y) => y.id === projektId) || p;
    knopf.disabled = true;
    try {
      const titel = [x.nummer, x.kunde || p.kunde, x.adresse].filter(Boolean).join(", ");
      const pl = await api("/api/planungen", { methode: "POST", body: { bericht, projektId: x.id, projektTitel: titel, kunde: x.kunde || p.kunde, adresse: x.adresse, nummer: x.nummer, monteure: await werListe() } });
      d.close();
      gehe("chat/" + pl.id);
    } catch (err) { fehlerMelden(err); knopf.disabled = false; }
  };
  zeichne();
}

// ---------- Bilder vorbereiten ----------
async function ladeBild(blob) {
  const url = URL.createObjectURL(blob);
  const img = new Image(); img.src = url;
  try { await img.decode(); return img; } finally { URL.revokeObjectURL(url); }
}
// <img> berücksichtigt die Drehung aus den Kameradaten, daher über ein Bild statt direkt über createImageBitmap.
export async function verkleinern(blob, max, qualitaet) {
  const img = await ladeBild(blob);
  const f = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = Object.assign(document.createElement("canvas"), { width: Math.round(img.naturalWidth * f), height: Math.round(img.naturalHeight * f) });
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob(ok, "image/jpeg", qualitaet));
}
export const bildVorbereiten = async (file) => ({ gross: await verkleinern(file, 4000, 0.85), klein: await verkleinern(file, 1600, 0.8) });

const artVon = (file) => (file.type.startsWith("image/") ? "bild" : file.type.startsWith("video/") ? "video" : file.type === "application/pdf" ? "pdf" : null);
const neueId = () => crypto.randomUUID().replaceAll("-", "").slice(0, 16);


// ---------- Fester Ablauf (Planungs-Chat) ----------
// Die App stellt die Fragen aus dem Katalog der Reihe nach. Antworten per Knopf, Liste oder Eingabe, jede Frage
// kann übersprungen und später geändert werden. Fotos, Videos und Sprachnotizen hängen an der jeweiligen Frage.
let katalogCache = null;
const bildMass = new Map(); // Foto-ID -> Seitenverhältnis, damit Einzelfotos beim Neuzeichnen sofort ihre Höhe haben
const ladeKatalog = async () => (katalogCache ??= await api("/api/fragen"));

// Gleiche Regeln wie auf dem Server (server/fragen.mjs): Typ blendet Bereiche aus, Folgefragen nur bei passender Antwort.
// Abschlussbericht: Startfrage "bericht" beantwortet, dann nur dessen Fragen (abschluss: true, bericht passend oder für alle).
const TYPEN = { pv: "PV", wp: "Wärmepumpe", klima: "Klimaanlage" };
export const berichtKey = (fragen, antworten) => { const f = fragen.find((x) => x.id === "bericht"), w = antworten.bericht?.wert; const i = f ? f.optionen.indexOf(w) : -1; return i < 0 ? f?.alt?.[w] || null : f.berichte[i]; };
export function sichtbar(fragen, antworten) {
  const passt = (f) => !f.wenn || [].concat(f.wenn.ist).includes(antworten[f.wenn.frage]?.wert);
  const b = berichtKey(fragen, antworten);
  if (b) return fragen.filter((f) => f.abschluss && (!f.bericht || f.bericht === b) && passt(f));
  const w = antworten.typ?.wert || "", gewaehlt = w === "Beides" ? ["PV", "Wärmepumpe"] : w.split(",").map((t) => t.trim()).filter(Boolean);
  if (!gewaehlt.length) return [fragen[0]];
  return fragen.filter((f) => !f.abschluss && (!f.nur || gewaehlt.includes(TYPEN[f.nur])) && passt(f));
}
const erledigt = (a) => a && (a.uebersprungen || (a.wert ?? "") !== "" || a.dateien?.length);
// Was vor dem Senden fehlt: Pflichtfotos ohne Foto (im Abschlussbericht zählt Überspringen mit Grund) und die Unterschrift.
// Gleiche Regeln wie fehltPflichtfotos/fehltZumSenden in server/bericht.mjs. Liefert die Fragen in Ablauf-Reihenfolge.
const hatBild = (a) => (a?.dateien || []).some((d) => d.art === "bild");
export function fehltFragen(fragen, antworten) {
  const abschluss = !!berichtKey(fragen, antworten);
  return sichtbar(fragen, antworten).filter((f) => {
    const a = antworten[f.id];
    if (f.art === "unterschrift") return !(hatBild(a) && a.wert);
    return f.pflicht && !hatBild(a) && !(abschluss && a?.uebersprungen && a?.notiz);
  });
}
const mitEinheit = (f, w) => (f.einheit && w ? (f.einheit.startsWith("°") ? w + f.einheit : `${w} ${f.einheit}`) : w);

export async function chatAnsicht(el, id) {
  const { katalog: fragen, bereiche } = await ladeKatalog();
  let planung = await api("/api/planungen/" + id);
  // Antworten, die noch im Ausgang auf dem Gerät liegen, über den (älteren) Stand vom Server legen.
  for (const op of await offeneAntworten(id).catch(() => [])) {
    const f = fragen.find((x) => x.id === op.frage);
    if (f) planung.antworten = antwortAnwenden(planung.antworten || {}, f, op.body, op.meta);
  }
  // Fotos, die noch nicht hochgeladen sind, vom Gerät anzeigen.
  const lokaleUrl = new Map();
  for (const d of Object.values(planung.antworten || {}).flatMap((a) => a.dateien || [])) {
    const b = await ablage.get("bild:" + d.id).catch(() => null);
    if (b) lokaleUrl.set(d.id, URL.createObjectURL(b.blob));
  }
  const bildSrc = (d) => lokaleUrl.get(d.id) || dateiUrl(planung.id, d.id, true, d.v);
  let bearbeite = decodeURIComponent(location.hash.split("/")[2] || "") || null; // #chat/<id>/<frage> springt zum Ändern
  if (bearbeite) history.replaceState(null, "", "#chat/" + id); // Neu laden soll nicht wieder zur Frage springen
  const antworten = () => planung.antworten || {};
  const abschluss = () => !!berichtKey(fragen, antworten());
  // Gesendeter (oder gerade sendender) Abschlussbericht: nur noch in der Prüfansicht ansehen.
  if (abschluss() && (planung.status === "gesendet" || planung.senden)) { location.hash = "pruefung/" + id; return; }
  // Aus der Prüfansicht „Es fehlt noch“ (#chat/<id>/fehlt): der Reihe nach zu jedem fehlenden Punkt, danach zurück zum Prüfen.
  let nachholen = bearbeite === "fehlt";
  if (nachholen) bearbeite = fehltFragen(fragen, antworten())[0]?.id || null;

  el.innerHTML = `<div class="chatseite">
    <div class="chatkopf"><button class="pill rund" data-zurueck aria-label="Zurück">${IKON.zurueck}</button>
      <div class="haupt"><div class="titel">${esc(antworten().kunde?.wert || antworten().ab_kunde?.wert || planung.projektTitel)}</div><div class="neben" id="stand"></div><div class="sync" id="sync" role="status" hidden></div></div>
      <button class="pill" data-neustartkopf>Neu starten</button>
      <button class="pill" data-uebersicht>Übersicht</button></div>
    <div class="fortschritt" aria-hidden="true"><span id="balken"></span></div>
    <div class="verlauf" id="verlauf" aria-live="polite"></div>
    <div class="steuerung" id="steuerung"></div>
    <input type="file" id="kamera" accept="image/*" capture="environment" hidden>
    <input type="file" id="galerie" accept="image/*,video/*,application/pdf" multiple hidden>
    <input id="halter" class="halter" aria-hidden="true" tabindex="-1" autocomplete="off">
  </div>`;
  const verlauf = $("#verlauf", el), steuerung = $("#steuerung", el);
  $("[data-zurueck]", el).onclick = () => zurueck("home");
  $("[data-uebersicht]", el).onclick = uebersicht;
  $("[data-neustartkopf]", el)?.addEventListener("click", () => berichtNeuStarten(planung, fragen));
  // Tastatur geht auf (oder die Eingabe wächst): Verlauf wird kleiner, also um genau so viel mit nach oben schieben.
  let verlaufH = 0;
  // Nur wer unten war, wird mitgeschoben; weiter oben öffnet sich das Feld einfach darüber, ohne dass der Chat springt.
  const anheften = () => { const h = verlauf.clientHeight, d = verlaufH - h, warUnten = verlauf.scrollHeight - verlauf.scrollTop - verlaufH < 40; verlaufH = h; if (d > 0 && warUnten) verlauf.scrollTop += d; };
  new ResizeObserver(anheften).observe(verlauf);
  const vv = window.visualViewport;
  const beiTastatur = () => (verlauf.isConnected ? anheften() : vv.removeEventListener("resize", beiTastatur));
  vv?.addEventListener("resize", beiTastatur); // nach sichtbarerBereich() in app.js, die Höhe ist dann schon gesetzt

  // Ausgang: Hochladen läuft still im Hintergrund (der grüne Balken reicht). Ein Hinweis kommt nur, wenn es hängt,
  // weil kein Netz da ist; er verschwindet, sobald wieder etwas durchgeht. Stand vom Server übernehmen, sobald alles oben ist.
  let wartet = false;
  const syncZeigen = (offen) => {
    const s = $("#sync", el);
    s.hidden = !offen || !wartet;
    s.textContent = `☁ Kein Empfang · ${offen} ${offen === 1 ? "Eintrag wartet" : "Einträge warten"}, bis wieder Netz da ist`;
  };
  const beiAusgang = ({ detail: d }) => {
    if (!el.isConnected || !$("#verlauf", el)) return removeEventListener("ausgang", beiAusgang);
    if (d.wartet) wartet = true; else if ("planungId" in d) wartet = false; // planungId = es ging gerade etwas durch
    syncZeigen(d.offen);
    if (d.abgelehnt) toast("Nicht gespeichert: " + d.abgelehnt, "fehler");
    if (d.planungId === planung.id && d.antworten) { planung.antworten = d.antworten; merken("/api/planungen/" + planung.id, planung); zeichne(true); }
  };
  addEventListener("ausgang", beiAusgang);
  anzahl().then((n) => { syncZeigen(n); if (n) abarbeiten(); }).catch(() => {});

  const aktuelleFrage = () => (bearbeite && fragen.find((f) => f.id === bearbeite)) || sichtbar(fragen, antworten()).find((f) => !erledigt(antworten()[f.id])) || null;

  // Scrollen (Dominik, 27.11.): Wer unten ist, bleibt unten (die nächste Frage kommt dort). Wer hochgescrollt hat, um etwas
  // zu ändern, bleibt an derselben Stelle, auch nach dem Speichern. Nur ein gezielter Sprung (aus der Prüfübersicht oder der
  // Übersicht) holt die Frage in die Mitte.
  function zeichne(nurVerlauf = false, springen = false) {
    const scrollVorher = verlauf.scrollTop, amEnde = verlauf.scrollHeight - scrollVorher - verlauf.clientHeight < 40;
    const liste = sichtbar(fragen, antworten()), akt = aktuelleFrage();
    const fertig = liste.filter((f) => erledigt(antworten()[f.id])).length;
    $("#balken", el).style.width = Math.round((fertig / Math.max(liste.length, 1)) * 100) + "%";
    $("#stand", el).textContent = akt ? `${bereiche[akt.bereich]} · ${fertig} von ${liste.length}` : `Alles erfasst · ${fertig} von ${liste.length}`;
    // Verlauf: erledigte Fragen bis zur nächsten offenen, dazu die aktuelle an ihrer Stelle. Spätere, schon vorausgefüllte
    // Antworten (Lieferschein) kommen erst, wenn man dort ankommt; sonst stünden sie unter der aktuellen Frage.
    const offen = liste.findIndex((f) => !erledigt(antworten()[f.id])), grenze = offen < 0 ? Infinity : offen;
    verlauf.innerHTML = liste.filter((f, i) => (erledigt(antworten()[f.id]) && i <= grenze) || f === akt).map((f) => {
      const a = antworten()[f.id];
      const frage = `<div class="blase claude frageblase${f === akt ? " aktiv" : ""}" id="f-${f.id}">${f.pflicht ? "📷 " : ""}${esc(f.frage)}${f === akt && bearbeite ? '<span class="badge orange">wird geändert</span>' : ""}</div>`;
      if (!erledigt(a) || f === akt && bearbeite) return frage + (f === akt && a ? antwortHtml(f, a) : "");
      return frage + antwortHtml(f, a);
    }).join("") || "";
    verlauf.scrollTop = scrollVorher;
    if (!akt) verlauf.insertAdjacentHTML("beforeend", abschluss() ? `<div class="blase claude">Alles erfasst. Tipp auf „Prüfen und senden“, dann siehst du alles noch einmal und speicherst den Bericht in HERO.</div>`
      : `<div class="blase claude">Alles erfasst. Tipp auf „Zusammenfassen“, dann schreibt Claude den Text für die Monteure und du prüfst alles vor dem Speichern.</div>`);
    // Stand vom Server im Hintergrund: Eingabe nicht anfassen (Tastatur, getippter Text), Scrollposition halten.
    if (nurVerlauf) { verlauf.scrollTop = scrollVorher; return; }
    steuerungZeichnen(akt);
    requestAnimationFrame(() => {
      const z = akt && $("#f-" + akt.id, el);
      if (springen && z) return z.scrollIntoView({ block: "center" });
      if (amEnde) verlauf.scrollTop = verlauf.scrollHeight;
      if (bearbeite && z) z.scrollIntoView({ block: "nearest" }); // nur falls die Frage gerade verdeckt ist
    });
  }

  function antwortHtml(f, a) {
    const teile = [];
    if (a.uebersprungen) teile.push(`<span class="muted">übersprungen</span>`);
    else if (a.wert) teile.push(esc(mitEinheit(f, a.wert)));
    const bilder = (a.dateien || []).filter((d) => d.art === "bild"), andere = (a.dateien || []).filter((d) => d.art !== "bild");
    if (bilder.length) teile.push(`<span class="album${bilder.length === 1 ? " einzeln" : ""}">${bilder.map((d) => `<img src="${esc(bildSrc(d))}" alt="" data-mass="${esc(d.id)}"${bilder.length === 1 ? ` style="aspect-ratio:${bildMass.get(d.id) || "3 / 4"}"` : ""}>`).join("")}</span>`);
    for (const d of andere) teile.push(d.art === "audio" ? `<span class="klein">🎙 ${esc(d.text || "Sprachnotiz")}</span>` : `<span class="klein">${d.art === "video" ? "🎬" : "📄"} ${esc(d.name)}</span>`);
    if (a.notiz) teile.push(`<span class="klein">✎ ${esc(a.notiz)}</span>`);
    if (a.quelle) teile.push(`<span class="quelle">📄 aus ${esc(a.quelle)}, bitte prüfen</span>`);
    return `<button class="blase planer antwortblase${bilder.length ? " mitalbum" : ""}" data-bearbeite="${f.id}" aria-label="${esc(f.frage)} ändern">${teile.join("") || "<span class='muted'>leer</span>"}</button>`;
  }
  verlauf.addEventListener("load", (e) => {
    const i = e.target;
    if (!i.dataset?.mass || !i.naturalWidth || bildMass.has(i.dataset.mass)) return;
    bildMass.set(i.dataset.mass, `${i.naturalWidth} / ${i.naturalHeight}`);
    if (i.closest(".einzeln")) i.style.aspectRatio = bildMass.get(i.dataset.mass);
  }, true);
  verlauf.addEventListener("click", (e) => { const b = e.target.closest("[data-bearbeite]"); if (b) { bearbeite = b.dataset.bearbeite; zeichne(); } });

  // ---------- Eingabe für die aktuelle Frage ----------
  function steuerungZeichnen(f) {
    if (!f) {
      steuerung.innerHTML = `<button class="gross" data-zusammen>${IKON.haken}${abschluss() ? "Prüfen und senden" : "Zusammenfassen und prüfen"}</button>`;
      $("[data-zusammen]", steuerung).onclick = abschluss() ? pruefen : zusammenfassen;
      return;
    }
    const a = antworten()[f.id] || {};
    let eingabe = "";
    if (f.art === "janein") eingabe = `<div class="knoepfe zwei">${["Ja", "Nein"].map((o) => `<button class="wahl${a.wert === o.toLowerCase() ? " gewaehlt" : ""}" data-wert="${o}">${o}</button>`).join("")}</div>`;
    else if (f.art === "auswahl") eingabe = `<div class="knoepfe">${f.optionen.map((o) => `<button class="wahl${a.wert === o ? " gewaehlt" : ""}" data-wert="${esc(o)}">${esc(o)}</button>`).join("")}</div>`;
    else if (f.art === "mehrfach") {
      const an = (a.wert || "").split(",").map((t) => t.trim());
      eingabe = `<div class="knoepfe">${f.optionen.map((o) => `<button class="wahl${an.includes(o) ? " gewaehlt" : ""}" data-mehr="${esc(o)}" aria-pressed="${an.includes(o)}">${esc(o)}</button>`).join("")}</div>
        <button class="wahl gewaehlt" data-mehrweiter>Weiter</button>`;
    }
    else if (f.art === "liste") eingabe = `<div class="feldzeile"><select id="wert" aria-label="${esc(f.frage)}"><option value="">Bitte wählen …</option>${f.optionen.map((o) => `<option ${a.wert === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select><button class="sendbtn" data-weiter aria-label="Weiter">${IKON.senden}</button></div>`;
    else if (f.art === "zahl") eingabe = `<div class="feldzeile"><input id="wert" inputmode="decimal" enterkeyhint="next" value="${esc(a.wert || "")}" placeholder="Zahl" aria-label="${esc(f.frage)}">${f.einheit ? `<span class="einheit">${esc(f.einheit)}</span>` : ""}<button class="sendbtn" data-weiter aria-label="Weiter">${IKON.senden}</button></div>`;
    else if (f.art === "text") eingabe = `<div class="feldzeile"><textarea id="wert" rows="1" enterkeyhint="next" placeholder="Antwort …" aria-label="${esc(f.frage)}">${esc(a.wert || "")}</textarea><button class="rundknopf diktat" data-diktat hidden aria-label="Diktieren">${IKON.mikro}</button><button class="sendbtn" data-weiter aria-label="Weiter">${IKON.senden}</button></div>`;
    if (f.art === "unterschrift") eingabe = `<p class="muted small abnahmetext">${esc(f.hinweis || "")}</p>
      <label class="feld"><span>Name des Unterzeichners</span><input id="wert" autocomplete="off" value="${esc(a.wert || antworten().ab_kunde?.wert || "")}"></label>
      <canvas class="unterschriftfeld" id="unterschrift" aria-label="Hier mit dem Finger unterschreiben"></canvas>
      <div class="knoepfe zwei"><button class="wahl" data-unterschriftweg>Löschen</button><button class="wahl gewaehlt" data-unterschriftok>Übernehmen</button></div>`;
    const bilder = (a.dateien || []).filter((d) => d.art === "bild");
    if (f.art === "foto") eingabe = `${f.heroBilder ? `<button class="wahl gewaehlt" data-planungsbild style="width:100%;margin-bottom:8px">Planungsbild aus HERO öffnen</button>` : ""}<div class="knoepfe zwei"><button class="wahl" data-kamera>${IKON.kamera} Kamera</button><button class="wahl" data-galerie>Aus Galerie</button></div>
        ${bilder.length ? `<button class="wahl gewaehlt" data-fertig>Weiter</button>` : ""}`;
    // Alle Fotos dieser Frage antippen zum Bemalen und Beschriften, egal welche Frage.
    const vorschau = bilder.length ? `<div class="vorschau">${bilder.map((d) => `<div class="anhangbox"><button class="anhang" data-malen="${d.id}" aria-label="Foto bemalen oder beschriften"><img src="${esc(bildSrc(d))}" alt=""><span class="art">Bemalen</span></button><button class="weg" data-fotoweg="${d.id}" aria-label="Foto löschen">✕</button></div>`).join("")}</div>` : "";
    steuerung.innerHTML = f.art === "unterschrift" ? eingabe + (bearbeite ? `<div class="zusatz"><span class="platz"></span><button class="pill" data-zurueckzumablauf>Fertig</button></div>` : "") : `${vorschau}${eingabe}
      <div class="zusatz">
        <button class="rundknopf" data-anhang aria-label="Foto, Video oder PDF anhängen">${IKON.bueroklammer}</button>
        <button class="rundknopf" data-sprache aria-label="Sprachnotiz aufnehmen">${IKON.mikro}</button>
        <button class="pill notizknopf" data-notiz aria-label="Notiz für die Monteure schreiben">✎ Notiz</button>
        <span class="platz"></span>
        ${bearbeite ? `<button class="pill" data-zurueckzumablauf>Fertig</button>` : ""}
        <button class="pill" data-ueberspringen>Überspringen</button>
      </div>`;
    if (f.art === "unterschrift") return unterschriftFeld(f);
    const feld = $("#wert", steuerung);
    $$("[data-wert]", steuerung).forEach((b) => (b.onclick = () => speichern(f, { wert: b.dataset.wert })));
    // Mehrfachauswahl: antippen schaltet an und aus, „Weiter“ speichert alle gewählten zusammen.
    $$("[data-mehr]", steuerung).forEach((b) => (b.onclick = () => { const an = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", an); b.classList.toggle("gewaehlt", an); }));
    $("[data-mehrweiter]", steuerung)?.addEventListener("click", () => {
      const wahl = $$('[data-mehr][aria-pressed="true"]', steuerung).map((b) => b.dataset.mehr);
      wahl.length ? speichern(f, { wert: wahl.join(", ") }) : toast("Bitte mindestens einen Punkt wählen oder überspringen", "fehler");
    });
    // Der Senden-Knopf nimmt dem Feld den Fokus nicht weg, sonst geht am Handy die Tastatur zu.
    const weiter = $("[data-weiter]", steuerung);
    const absenden = () => feld.value.trim() ? speichern(f, { wert: feld.value }) : toast("Bitte etwas eintragen oder überspringen", "fehler");
    weiter?.addEventListener("pointerdown", (e) => e.preventDefault());
    // iPhone: Beim Tippen auf den Knopf verliert das Feld sonst den Fokus (Tastatur zu), noch bevor click kommt.
    // preventDefault auf touchend verhindert den Fokuswechsel und den nachgeschobenen Klick; gesendet wird hier.
    weiter?.addEventListener("touchend", (e) => { e.preventDefault(); absenden(); });
    weiter?.addEventListener("click", absenden);
    feld?.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && f.art !== "text") { e.preventDefault(); $("[data-weiter]", steuerung).click(); } });
    if (f.art === "text") { feld.style.height = "auto"; feld.addEventListener("input", () => { feld.style.height = "auto"; feld.style.height = Math.min(feld.scrollHeight, 140) + "px"; }); diktieren(feld, $("[data-diktat]", steuerung)); }
    if (feld && matchMedia("(pointer: fine)").matches) feld.focus();
    $("[data-kamera]", steuerung)?.addEventListener("click", () => $("#kamera", el).click());
    $("[data-planungsbild]", steuerung)?.addEventListener("click", () => planungsbild(f));
    $("[data-galerie]", steuerung)?.addEventListener("click", () => $("#galerie", el).click());
    $("[data-fertig]", steuerung)?.addEventListener("click", () => { bearbeite = null; zeichne(); });
    $$("[data-malen]", steuerung).forEach((b) => (b.onclick = () => malen(f, b.dataset.malen)));
    $$("[data-fotoweg]", steuerung).forEach((b) => (b.onclick = () => fotoLoeschen(f, b.dataset.fotoweg)));
    $("[data-anhang]", steuerung).onclick = () => $("#galerie", el).click();
    $("[data-sprache]", steuerung).onclick = () => sprachnotiz(f);
    $("[data-notiz]", steuerung).onclick = () => notizSheet(f);
    $("[data-ueberspringen]", steuerung).onclick = () => (f.abschluss && f.pflicht ? grundSheet(f) : speichern(f, { uebersprungen: true }));
    $("[data-zurueckzumablauf]", steuerung)?.addEventListener("click", () => { bearbeite = null; nachholen = false; zeichne(); });
  }

  // Antwort sofort auf dem Gerät eintragen und in den Ausgang legen; hochgeladen wird, sobald Netz da ist.
  // nurAnzeigen: nur auf dem Gerät eintragen, in den Ausgang legt es der Aufrufer selbst (Fotos, siehe unten).
  async function speichern(f, body, meta = {}, { nurAnzeigen = false } = {}) {
    if (zustand.demo) return toast("Demo, nicht verbunden. Hier wird nichts gespeichert.", "fehler");
    if (f.art === "zahl" && body.wert && !istZahl(body.wert)) return toast("Bitte eine Zahl eintragen", "fehler");
    // Tastatur offen: Fokus solange auf ein verstecktes Feld parken, das beim Neuzeichnen bleibt, dann ans nächste Feld geben.
    const halter = $("#halter", el), tastatur = steuerung.contains(document.activeElement) && document.activeElement.matches("input, textarea");
    if (tastatur) halter.focus({ preventScroll: true });
    // Erst anzeigen und das nächste Feld fokussieren, dann speichern: Das iPhone lässt die Tastatur nur offen,
    // wenn der Fokus noch im selben Tipp wechselt (nicht erst nach einem await).
    const vorher = { antworten: planung.antworten, bearbeite };
    planung.antworten = antwortAnwenden(antworten(), f, body, meta);
    if (abschluss() && f.id !== "ab_unterschrift" && planung.antworten.ab_unterschrift) {
      const { ab_unterschrift, ...rest } = planung.antworten; planung.antworten = rest;
      toast("Geändert: Der Kunde muss neu unterschreiben", "ok");
    }
    // Nach einer Antwort geht es zur nächsten Frage; nach Datei oder Notiz bleibt die Frage offen (weitere Fotos, Antwort fehlt noch).
    bearbeite = "wert" in body || "uebersprungen" in body ? null : f.id;
    if (nachholen) { bearbeite = fehltFragen(fragen, antworten())[0]?.id || null; if (!bearbeite) nachgeholt(); }
    zeichne(false, nachholen);
    if (tastatur) { const neu = $("input#wert, textarea#wert", steuerung); neu ? neu.focus({ preventScroll: true }) : halter.blur(); }
    if (nurAnzeigen) return;
    try {
      await antwortEinreihen(f, body, meta);
    } catch (e) {
      planung.antworten = vorher.antworten; bearbeite = vorher.bearbeite; zeichne();
      bericht("antwort", e); toast("Konnte auf dem Gerät nicht speichern: " + (e.message || e), "fehler");
    }
  }

  async function antwortEinreihen(f, body, meta) {
    await einreihen({ planungId: planung.id, art: "antwort", pfad: `/api/planungen/${planung.id}/antworten/${f.id}`, body, frage: f.id, meta });
    merken("/api/planungen/" + planung.id, planung);
    abarbeiten();
  }

  // ---------- Dateien an der aktuellen Frage ----------
  const dateienVon = (f) => (antworten()[f.id]?.dateien || []).map((d) => ({ id: d.id }));
  // Datei in den Ausgang legen (Fotos groß und klein); das kleine Foto bleibt bis zum Hochladen auf dem Gerät zum Anzeigen.
  async function dateiEinreihen(dateiId, name, art, blob, klein, v) {
    const pfad = `/api/planungen/${planung.id}/dateien/${dateiId}?name=${encodeURIComponent(name)}&art=${art}&klein=${klein ? 1 : 0}`;
    await einreihen({ planungId: planung.id, art: "datei", pfad, blob, dateiId, klein, v });
    if (klein) {
      await ablage.set("bild:" + dateiId, { v, blob });
      if (lokaleUrl.has(dateiId)) URL.revokeObjectURL(lokaleUrl.get(dateiId));
      lokaleUrl.set(dateiId, URL.createObjectURL(blob));
    }
  }
  // Fotos sofort anzeigen (Original als Vorschau), damit es gleich weitergeht. Verkleinern und in den Ausgang legen
  // läuft dahinter, eins nach dem anderen (hinten), damit die Dateien vor der Antwort ankommen, die sie nennt.
  let hinten = Promise.resolve();
  function hochladenUndAnhaengen(f, files) {
    if (zustand.demo) return toast("Demo, nicht verbunden. Hier wird nichts gespeichert.", "fehler");
    const neu = [], meta = {}, auftraege = [];
    for (const file of files) {
      const art = file.type.startsWith("audio/") ? "audio" : artVon(file);
      if (!art) { toast(`${file.name}: nur Fotos, Videos, PDFs`, "fehler"); continue; }
      const id = neueId(), name = art === "bild" ? (file.name || "Foto").replace(/\.\w+$/, "") + ".jpg" : file.name, v = Date.now();
      if (art === "bild") lokaleUrl.set(id, URL.createObjectURL(file));
      meta[id] = { id, name, art, groesse: file.size, v };
      neu.push({ id });
      auftraege.push({ id, name, art, file, v });
    }
    if (!neu.length) return;
    const body = { dateien: [...dateienVon(f), ...neu] };
    speichern(f, body, meta, { nurAnzeigen: true });
    hinten = hinten.then(async () => {
      try {
        for (const a of auftraege) {
          if (a.art === "bild") { const { gross, klein } = await bildVorbereiten(a.file); await dateiEinreihen(a.id, a.name, a.art, gross, false, a.v); await dateiEinreihen(a.id, a.name, a.art, klein, true, a.v); }
          else await dateiEinreihen(a.id, a.name, a.art, a.file, false, a.v);
        }
        await antwortEinreihen(f, body, meta);
      } catch (e) {
        // Nicht auf dem Gerät gelandet: aus der Anzeige nehmen, sonst glaubt man, die Fotos wären gespeichert.
        bericht("hochladen", e);
        const weg = new Set(neu.map((d) => d.id));
        planung.antworten = antwortAnwenden(antworten(), f, { dateien: dateienVon(f).filter((d) => !weg.has(d.id)) }, {});
        if (el.isConnected) zeichne();
        toast("Foto konnte nicht gespeichert werden, bitte nochmal: " + (e.message || e), "fehler");
      }
    });
    return hinten;
  }
  for (const eingang of ["#kamera", "#galerie"]) $(eingang, el).addEventListener("change", async (e) => {
    const f = aktuelleFrage(), files = [...e.target.files];
    e.target.value = "";
    if (!f || !files.length) return;
    if (eingang === "#kamera" && files.length === 1 && files[0].type.startsWith("image/")) {
      const bemalt = await zeichnen(files[0]).catch(() => null);
      if (bemalt) files[0] = new File([bemalt], (files[0].name || "Foto").replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
    }
    try { await hochladenUndAnhaengen(f, files); } catch (err) { bericht("hochladen", err); fehlerMelden(err); }
  });

  async function malen(f, dateiId) {
    try {
      await hinten; // ein gerade erst aufgenommenes Foto muss erst verkleinert auf dem Gerät liegen
      const d = (antworten()[f.id]?.dateien || []).find((x) => x.id === dateiId);
      // Immer die aktuelle, schon bemalte Fassung: erst die noch nicht hochgeladene, dann vom Server, ohne Netz die kleine vom Gerät.
      let blob = await dateiBlob(dateiId);
      if (!blob) {
        try { const r = await fetch(dateiUrl(planung.id, dateiId, false, d?.v), { cache: "no-cache" }); if (r.ok) blob = await r.blob(); } catch { /* kein Netz */ }
      }
      blob ??= (await ablage.get("bild:" + dateiId).catch(() => null))?.blob;
      if (!blob) return toast("Das Foto ist ohne Netz nicht auf diesem Gerät", "fehler");
      const neu = await zeichnen(blob);
      if (!neu) return;
      const v = Date.now(), name = d?.name || "Foto.jpg";
      await dateiEinreihen(dateiId, name, "bild", neu, false, v);
      await dateiEinreihen(dateiId, name, "bild", await verkleinern(neu, 1600, 0.8), true, v);
      await speichern(f, { dateien: dateienVon(f) }, { [dateiId]: { v, groesse: neu.size } });
    } catch (e) { bericht("malen", e); fehlerMelden(e); }
  }

  // Falsches Foto aus der Antwort nehmen (27.11.). Es wird dann nicht mit gesendet; schon nach HERO/Drive Gesendetes bleibt dort.
  async function fotoLoeschen(f, dateiId) {
    if (!confirm("Foto löschen?")) return;
    try {
      await hinten; // sonst schreibt ein noch laufendes Hochladen die alte Liste samt Foto zurück
      await speichern(f, { dateien: dateienVon(f).filter((d) => d.id !== dateiId) });
    } catch (e) { bericht("foto-loeschen", e); fehlerMelden(e); }
  }

  // Belegung geändert (Dominik, 27.11.): Planungsbild des Projekts aus HERO laden, im Editor einzeichnen, als Foto anhängen.
  async function planungsbild(f) {
    let liste;
    try { liste = await api(`/api/planungen/${planung.id}/planungsbilder`); } catch (e) { return fehlerMelden(e); }
    if (!liste.length) return toast("In HERO ist bei diesem Projekt kein Planungsbild hinterlegt. Bitte ein Foto machen.", "fehler");
    const bildUrl = (b) => serverUrl(`/api/planungen/${planung.id}/planungsbilder/${b.id}`);
    const nimm = async (b) => {
      try {
        const r = await fetch(bildUrl(b));
        if (!r.ok) throw new Error("Planungsbild konnte nicht geladen werden");
        const neu = await zeichnen(await r.blob());
        if (!neu) return toast("Nichts eingezeichnet, das Bild wurde nicht übernommen", "ok");
        await hochladenUndAnhaengen(f, [new File([neu], "Planung geändert.jpg", { type: "image/jpeg" })]);
      } catch (e) { bericht("planungsbild", e); fehlerMelden(e); }
    };
    if (liste.length === 1) return nimm(liste[0]);
    const d = sheet(`<div class="sheetkopf"><button class="pill" data-zu>Abbrechen</button><h2>Planungsbild wählen</h2><span></span></div>
      <div class="gruppe">${liste.map((b, i) => `<button class="zeile" data-i="${i}"><span class="daumen"><img src="${esc(bildUrl(b))}" alt="" loading="lazy"></span><div class="haupt"><div class="titel">${esc(b.kategorie)}</div><div class="neben">${esc(new Date(b.datum).toLocaleDateString("de-DE"))} · ${esc(b.name)}</div></div><span class="pfeil">${IKON.pfeil}</span></button>`).join("")}</div>`);
    $("[data-zu]", d).onclick = () => d.close();
    d.addEventListener("click", (e) => { const z = e.target.closest("[data-i]"); if (z) { d.close(); nimm(liste[z.dataset.i]); } });
  }

  // Unterschrift mit dem Finger: weißes Feld, schwarzer Strich; „Übernehmen“ legt ein PNG an die Antwort (Name = Wert).
  function unterschriftFeld(f) {
    const c = $("#unterschrift", steuerung), g = c.getContext("2d"), r = devicePixelRatio || 1;
    const groesse = () => { const b = c.getBoundingClientRect(); c.width = b.width * r; c.height = b.height * r; g.scale(r, r); g.lineWidth = 2.2; g.lineCap = g.lineJoin = "round"; g.strokeStyle = "#111"; };
    groesse();
    let leer = true, zug = null;
    const punkt = (e) => { const b = c.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    c.addEventListener("pointerdown", (e) => { c.setPointerCapture(e.pointerId); zug = punkt(e); g.beginPath(); g.moveTo(...zug); g.lineTo(zug[0] + 0.1, zug[1]); g.stroke(); leer = false; });
    c.addEventListener("pointermove", (e) => { if (!zug) return; const p = punkt(e); g.beginPath(); g.moveTo(...zug); g.lineTo(...p); g.stroke(); zug = p; });
    for (const t of ["pointerup", "pointercancel"]) c.addEventListener(t, () => (zug = null));
    $("[data-unterschriftweg]", steuerung).onclick = () => { g.clearRect(0, 0, c.width, c.height); leer = true; };
    $("[data-zurueckzumablauf]", steuerung)?.addEventListener("click", () => { bearbeite = null; zeichne(); });
    $("[data-unterschriftok]", steuerung).onclick = async (e) => {
      const knopf = e.currentTarget, name = $("#wert", steuerung).value.trim();
      if (!name) return toast("Bitte den Namen des Unterzeichners eintragen", "fehler");
      if (leer) return toast("Bitte unterschreiben lassen", "fehler");
      knopf.disabled = true;
      try {
        const blob = await new Promise((ok) => c.toBlob(ok, "image/png"));
        const id = neueId(), v = Date.now(), dname = "Unterschrift.png";
        lokaleUrl.set(id, URL.createObjectURL(blob));
        await hinten;
        await dateiEinreihen(id, dname, "bild", blob, false, v);
        await speichern(f, { wert: name, dateien: [{ id }] }, { [id]: { id, name: dname, art: "bild", groesse: blob.size, v } });
      } catch (err) { bericht("unterschrift", err); fehlerMelden(err); knopf.disabled = false; }
    };
  }

  // Pflichtfoto im Abschlussbericht fehlt: nur mit Grund (steht dann im Protokoll).
  function grundSheet(f) {
    const d = sheet(`<div class="sheetkopf"><button class="pill" data-zu>Abbrechen</button><h2>Foto fehlt</h2><button class="pill akzent" data-ok>Überspringen</button></div>
      <p class="muted small">${esc(f.titel || f.frage)}: Warum geht das Foto nicht?</p><textarea rows="4" placeholder="Grund …"></textarea>`);
    $("[data-zu]", d).onclick = () => d.close();
    $("[data-ok]", d).onclick = async () => {
      const grund = $("textarea", d).value.trim();
      if (!grund) return toast("Bitte einen Grund angeben", "fehler");
      await speichern(f, { uebersprungen: true, notiz: grund }); d.close();
    };
    setTimeout(() => $("textarea", d).focus(), 200);
  }

  // Alles nachgeholt: warten, bis alles oben ist, dann zurück zur Prüfansicht.
  async function nachgeholt() {
    nachholen = false;
    toast("Alles nachgeholt", "ok");
    // Erst einen Takt warten: ein gerade gewähltes Foto hängt sich erst danach hinten an.
    try { await new Promise((ok) => setTimeout(ok)); await hinten; await abarbeiten(); } catch { /* bleibt im Ausgang, die Prüfansicht zeigt den Stand vom Server */ }
    if (el.isConnected) gehe("pruefung/" + planung.id);
  }

  // Abschlussbericht: kein Claude, erst alles hochladen, dann zur Prüfansicht.
  async function pruefen(e) {
    const knopf = e.currentTarget; knopf.disabled = true; knopf.textContent = "Lädt noch hoch …";
    try {
      await hinten;
      const offen = await abarbeiten();
      if (offen) { toast(`Noch ${offen} Einträge nicht hochgeladen. Prüfen geht, sobald wieder Netz da ist.`, "fehler"); knopf.disabled = false; knopf.innerHTML = IKON.haken + "Prüfen und senden"; return; }
      gehe("pruefung/" + planung.id);
    } catch (err) { fehlerMelden(err); knopf.disabled = false; knopf.innerHTML = IKON.haken + "Prüfen und senden"; }
  }

  function notizSheet(f) {
    const d = sheet(`<div class="sheetkopf"><button class="pill" data-zu>Abbrechen</button><h2>Notiz</h2><button class="pill akzent" data-ok>Speichern</button></div>
      <p class="muted small">${esc(f.frage)}</p><textarea rows="5" placeholder="Was die Monteure dazu wissen müssen …">${esc(antworten()[f.id]?.notiz || "")}</textarea>`);
    $("[data-zu]", d).onclick = () => d.close();
    $("[data-ok]", d).onclick = async () => { await speichern(f, { notiz: $("textarea", d).value }); d.close(); };
    setTimeout(() => $("textarea", d).focus(), 200);
  }

  // Sprachnotiz: Aufnahme an die Frage hängen, Whisper auf dem Server macht Text daraus.
  async function sprachnotiz(f) {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast("Aufnehmen geht in diesem Browser nicht", "fehler");
    let strom;
    try { strom = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { bericht("aufnahme-start", e); return toast("Mikrofon ist nicht erlaubt. In den Einstellungen freigeben.", "fehler"); }
    try {
      const typ = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) => MediaRecorder.isTypeSupported?.(t));
      const rec = new MediaRecorder(strom, typ ? { mimeType: typ } : {});
      const teile = [];
      rec.ondataavailable = (e) => e.data.size && teile.push(e.data);
      const start = Date.now();
      steuerung.innerHTML = `<div class="aufnahmeanzeige" role="status"><span class="rotpunkt" aria-hidden="true"></span><span id="zeit">0:00</span></div>
        <div class="knoepfe zwei"><button class="wahl" data-weg>Verwerfen</button><button class="wahl gewaehlt" data-stopp>Fertig</button></div>`;
      const uhr = setInterval(() => { const s = Math.floor((Date.now() - start) / 1000); const z = $("#zeit", steuerung); if (z) z.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }, 250);
      let verwerfen = false;
      rec.onstop = async () => {
        clearInterval(uhr); strom.getTracks().forEach((t) => t.stop());
        if (verwerfen) return zeichne();
        if (!teile.length) { bericht("aufnahme-ende", "keine Audiodaten"); toast("Die Aufnahme war leer", "fehler"); return zeichne(); }
        const mime = rec.mimeType || typ || "audio/webm";
        const file = new File(teile, `Sprachnotiz ${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }).replace(":", "-")}.${mime.includes("mp4") ? "m4a" : "webm"}`, { type: mime });
        try { toast("Sprachnotiz wird umgewandelt …"); await hochladenUndAnhaengen(f, [file]); } catch (e) { bericht("sprachnotiz", e); fehlerMelden(e); zeichne(); }
      };
      rec.onerror = (e) => bericht("aufnahme", e.error || e);
      $("[data-stopp]", steuerung).onclick = () => rec.stop();
      $("[data-weg]", steuerung).onclick = () => { verwerfen = true; rec.stop(); };
      rec.start(1000);
    } catch (e) { strom.getTracks().forEach((t) => t.stop()); bericht("aufnahme-start", e); toast("Aufnahme klappt nicht: " + (e.message || e), "fehler"); zeichne(); }
  }

  function uebersicht() {
    const liste = sichtbar(fragen, antworten());
    const gruppen = [...new Set(liste.map((f) => f.bereich))];
    const d = sheet(`<div class="sheetkopf"><span></span><h2>Übersicht</h2><button class="pill" data-zu>Schließen</button></div>
      ${gruppen.map((b) => `<div class="label">${esc(bereiche[b])}</div><div class="gruppe">${liste.filter((f) => f.bereich === b).map((f) => {
        const a = antworten()[f.id], status = !erledigt(a) ? ["offen", ""] : a.uebersprungen ? ["übersprungen", "orange"] : ["✓", "gruen"];
        const kurz = a?.wert ? mitEinheit(f, a.wert) : a?.dateien?.length ? `${a.dateien.length} Datei(en)` : "";
        return `<button class="zeile" data-springe="${f.id}"><div class="haupt"><div class="titel">${esc(f.frage)}</div>${kurz ? `<div class="neben">${esc(kurz)}</div>` : ""}</div><span class="badge ${status[1]}">${status[0]}</span></button>`;
      }).join("")}</div>`).join("")}
      <button class="pill" data-neustart style="width:100%;margin-top:var(--gap);color:var(--err)">Neu starten</button>`);
    $("[data-zu]", d).onclick = () => d.close();
    $("[data-neustart]", d)?.addEventListener("click", () => { d.close(); berichtNeuStarten(planung, fragen); });
    $$("[data-springe]", d).forEach((b) => (b.onclick = () => { bearbeite = b.dataset.springe; d.close(); zeichne(false, true); }));
  }

  async function zusammenfassen(e) {
    const knopf = e.currentTarget; knopf.disabled = true; knopf.textContent = "Lädt noch hoch …";
    try {
      // Erst muss alles auf dem Server sein, sonst fehlen Claude Antworten und Fotos (auch die, die gerade noch verkleinert werden).
      await hinten;
      const offen = await abarbeiten();
      if (offen) { toast(`Noch ${offen} Einträge nicht hochgeladen. Zusammenfassen geht, sobald wieder Netz da ist.`, "fehler"); knopf.disabled = false; knopf.innerHTML = IKON.haken + "Zusammenfassen und prüfen"; return; }
      knopf.textContent = "Claude schreibt den Monteur-Text …"; await api(`/api/planungen/${planung.id}/zusammenfassen`, { methode: "POST", body: {} }); gehe("pruefung/" + planung.id); }
    catch (err) { fehlerMelden(err); knopf.disabled = false; knopf.innerHTML = IKON.haken + "Zusammenfassen und prüfen"; }
  }

  zeichne(false, !!bearbeite); // aus der Prüfübersicht: direkt zur Frage
  verlaufH = verlauf.clientHeight;
}

// Diktieren in ein Textfeld: der Browser wandelt live in Text um (am iPhone die Apple-Spracherkennung).
function diktieren(feld, knopf) {
  const Erkennung = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Erkennung || !knopf) return;
  knopf.hidden = false;
  let erkennung = null;
  knopf.onclick = () => {
    if (erkennung) return erkennung.stop();
    erkennung = new Erkennung();
    Object.assign(erkennung, { lang: "de-DE", continuous: true, interimResults: true });
    const vorher = feld.value.trim() ? feld.value.trimEnd() + " " : "";
    erkennung.onresult = (e) => { feld.value = vorher + [...e.results].map((r) => r[0].transcript).join(""); feld.dispatchEvent(new Event("input")); };
    erkennung.onerror = (e) => { bericht("diktat", e.error); if (e.error !== "no-speech" && e.error !== "aborted") toast("Diktieren hat nicht geklappt (" + e.error + ")", "fehler"); };
    erkennung.onend = () => { erkennung = null; knopf.setAttribute("aria-pressed", "false"); };
    erkennung.start();
    knopf.setAttribute("aria-pressed", "true");
  };
}
