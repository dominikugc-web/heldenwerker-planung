// Plus-Sheet (neues oder vorhandenes Projekt) und der Planungs-Chat mit Claude.
import { api, apiStrom, hochladen, dateiUrl, zustand } from "./api.js";
import { $, $$, esc, toast, fehlerMelden, sheet, IKON, euro } from "./ui.js";
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
    <div class="banner">Wird in HERO mit „TEST“ vor dem Namen angelegt.</div>
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

export async function planungStarten(p) {
  try {
    const titel = [p.nummer, p.kunde, p.adresse].filter(Boolean).join(", ");
    const pl = await api("/api/planungen", { methode: "POST", body: { projektId: p.id, projektTitel: titel } });
    gehe("chat/" + pl.id);
  } catch (e) { fehlerMelden(e); }
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

// ---------- Chat ----------
export async function chatAnsicht(el, id) {
  let planung = await api("/api/planungen/" + id);
  const wartend = []; // gewählte, noch nicht gesendete Dateien
  el.innerHTML = `<div class="chatseite">
    <div class="chatkopf"><button class="pill rund" data-zurueck aria-label="Zurück">${IKON.zurueck}</button>
      <div class="haupt"><div class="titel">${esc(planung.projektTitel)}</div><div class="neben" id="kosten"></div></div>
      <button class="pill akzent" data-zusammen>Zusammenfassen</button></div>
    <div class="verlauf" id="verlauf" aria-live="polite"></div>
    <div class="vorschau" id="vorschau" hidden></div>
    <div class="chatleiste">
      <label class="pill rund" aria-label="Foto, Video oder PDF anhängen">${IKON.bueroklammer}<input type="file" id="datei" accept="image/*,video/*,application/pdf" multiple hidden></label>
      <textarea id="text" rows="1" placeholder="Nachricht oder Diktat …" aria-label="Nachricht" enterkeyhint="send"></textarea>
      <button class="sendbtn" id="senden" aria-label="Senden">${IKON.senden}</button>
    </div></div>`;
  const verlauf = $("#verlauf", el), vorschau = $("#vorschau", el), text = $("#text", el), senden = $("#senden", el);
  $("[data-zurueck]", el).onclick = () => gehe("home");

  function zeichneVerlauf() {
    $("#kosten", el).textContent = planung.kostenCent ? "Claude bisher " + euro(planung.kostenCent) : "Neue Besichtigung";
    verlauf.innerHTML = planung.verlauf.length ? planung.verlauf.map((n) => {
      const anh = n.dateien?.length ? `<div class="anhaenge">${n.dateien.map((d) => anhangHtml(d, dateiUrl(planung.id, d.id))).join("")}</div>` : "";
      return anh + (n.text ? `<div class="blase ${n.rolle === "claude" ? "claude" : "planer"}">${esc(n.text)}</div>` : "");
    }).join("") : `<div class="start-hilfe"><b>Erzähl mir von der Besichtigung</b>Schick Fotos, Videos, PDFs oder Notizen. Ich frage nach, was fürs Protokoll noch fehlt.</div>`;
    verlauf.scrollTop = verlauf.scrollHeight;
  }
  function zeichneVorschau() {
    vorschau.hidden = !wartend.length;
    vorschau.innerHTML = wartend.map((w, i) => anhangHtml(w, w.vorschau, i)).join("");
  }
  zeichneVerlauf();

  $("#datei", el).addEventListener("change", async (e) => {
    for (const file of e.target.files) {
      const art = artVon(file);
      if (!art) { toast(`${file.name}: nur Fotos, Videos und PDFs`, "fehler"); continue; }
      const w = { id: neueId(), name: file.name, art, file, fortschritt: 0, fertig: false };
      if (art === "bild") {
        try { Object.assign(w, await bildVorbereiten(file)); w.vorschau = URL.createObjectURL(w.klein); w.name = w.name.replace(/\.\w+$/, "") + ".jpg"; }
        catch { toast(`${file.name} lässt sich nicht öffnen`, "fehler"); continue; }
      }
      wartend.push(w);
    }
    e.target.value = "";
    zeichneVorschau();
  });

  vorschau.addEventListener("click", async (e) => {
    const weg = e.target.closest("[data-weg]"), bild = e.target.closest("[data-i]");
    if (weg) { wartend.splice(Number(weg.dataset.weg), 1); return zeichneVorschau(); }
    const w = bild && wartend[bild.dataset.i];
    if (!w || w.art !== "bild") return;
    const neu = await zeichnen(w.gross);
    if (!neu) return;
    w.gross = neu; w.klein = await verkleinern(neu, 1600, 0.8); w.fertig = false;
    URL.revokeObjectURL(w.vorschau); w.vorschau = URL.createObjectURL(w.klein);
    zeichneVorschau();
  });

  text.addEventListener("input", () => { text.style.height = "auto"; text.style.height = Math.min(text.scrollHeight, 160) + "px"; });
  // Enter sendet nur mit echter Tastatur; während einer Eingabe-Komposition (z. B. Diktat) nie.
  text.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && matchMedia("(pointer: fine)").matches) { e.preventDefault(); senden.click(); } });

  senden.onclick = async () => {
    if (zustand.demo) return toast("Demo, nicht verbunden. Hier wird nichts gespeichert.", "fehler");
    const nachricht = text.value.trim();
    if (!nachricht && !wartend.length) return;
    senden.disabled = true;
    try {
      // Bereits hochgeladene Dateien (fertig) werden beim erneuten Senden übersprungen.
      for (const [i, w] of wartend.entries()) {
        if (w.fertig) continue;
        const balken = () => { const b = $(`[data-i="${i}"] .fortschritt`, vorschau); if (b) b.style.width = Math.round(w.fortschritt * 100) + "%"; };
        const pfad = (klein) => `/api/planungen/${planung.id}/dateien/${w.id}?name=${encodeURIComponent(w.name)}&art=${w.art}&klein=${klein ? 1 : 0}`;
        await hochladen(pfad(false), w.art === "bild" ? w.gross : w.file, (f) => { w.fortschritt = f; balken(); });
        if (w.art === "bild") await hochladen(pfad(true), w.klein);
        w.fertig = true;
      }
      const dateien = wartend.map((w) => ({ id: w.id, name: w.name, art: w.art }));
      const lokaleVorschau = Object.fromEntries(wartend.map((w) => [w.id, w.vorschau]));
      verlauf.querySelector(".start-hilfe")?.remove();
      verlauf.insertAdjacentHTML("beforeend", (dateien.length ? `<div class="anhaenge">${dateien.map((d) => anhangHtml(d, lokaleVorschau[d.id])).join("")}</div>` : "") + (nachricht ? `<div class="blase planer">${esc(nachricht)}</div>` : ""));
      const antwort = Object.assign(document.createElement("div"), { className: "blase claude tippt" });
      verlauf.append(antwort);
      verlauf.scrollTop = verlauf.scrollHeight;
      const sicherung = [...wartend];
      text.value = ""; text.style.height = "auto";
      wartend.length = 0; zeichneVorschau();
      try {
        await apiStrom(`/api/planungen/${planung.id}/nachricht`, { text: nachricht, dateien }, (t) => { antwort.textContent += t; verlauf.scrollTop = verlauf.scrollHeight; });
      } catch (err) {
        // Nicht angekommen: Text und Dateien zurück in die Eingabe, damit nichts verloren geht.
        if (!err.angekommen) { text.value = nachricht; wartend.push(...sicherung); }
        throw err;
      } finally {
        // Der Server hält die Wahrheit (z. B. Hinweis statt Teiltext bei einer Ablehnung).
        planung = await api("/api/planungen/" + planung.id).catch(() => planung);
        zeichneVerlauf();
      }
    } catch (e) {
      fehlerMelden(e);
      zeichneVorschau();
    } finally { senden.disabled = false; }
  };

  $("[data-zusammen]", el).onclick = async (e) => {
    if (!planung.verlauf.length) return toast("Erst etwas in den Chat schicken", "fehler");
    const knopf = e.currentTarget; knopf.disabled = true; knopf.textContent = "Claude fasst zusammen …";
    try { await api(`/api/planungen/${planung.id}/zusammenfassen`, { methode: "POST", body: {} }); gehe("pruefung/" + planung.id); }
    catch (err) { fehlerMelden(err); knopf.disabled = false; knopf.textContent = "Zusammenfassen"; }
  };
}

function anhangHtml(d, src, index) {
  const label = { bild: "Foto", video: "Video", pdf: "PDF" }[d.art];
  const innen = d.art === "bild" && src ? `<img src="${esc(src)}" alt="${esc(d.name)}" loading="lazy">` : `<span>${esc(d.name)}</span>`;
  const extra = index === undefined ? "" : `<span class="fortschritt" style="width:${Math.round((d.fortschritt || 0) * 100)}%"></span><button class="weg" data-weg="${index}" aria-label="${esc(d.name)} entfernen">×</button>`;
  const tag = index === undefined ? "div" : "div";
  return `<${tag} class="anhang" ${index === undefined ? "" : `data-i="${index}" role="button" tabindex="0" aria-label="${d.art === "bild" ? "Zum Zeichnen öffnen: " : ""}${esc(d.name)}"`}>${innen}<span class="art">${label}</span>${extra}</${tag}>`;
}
