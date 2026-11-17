// Kleine Helfer für alle Ansichten: Escape, Toast, Bottom-Sheet, Icons, Datum.
import { VerbindungsFehler } from "./api.js";

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function toast(text, art = "") {
  $(".toast")?.remove();
  const t = Object.assign(document.createElement("div"), { className: "toast " + art, textContent: text });
  t.setAttribute("role", art === "fehler" ? "alert" : "status");
  document.body.append(t);
  setTimeout(() => t.remove(), art === "fehler" ? 5000 : 2800);
}

export function fehlerMelden(e) {
  if (e?.name === "AbortError") return;
  toast(e instanceof VerbindungsFehler ? "Keine Verbindung zum Server. Ist Tailscale an und der PC an?" : e?.message || "Etwas ist schiefgelaufen", "fehler");
}

// Bottom-Sheet als <dialog>: Escape und Tippen auf den Hintergrund schließen es.
export function sheet(html, { voll = false, onClose } = {}) {
  const d = document.createElement("dialog");
  d.className = "sheet" + (voll ? " voll" : "");
  d.innerHTML = `<div class="panel">${voll ? "" : '<div class="griff"></div>'}${html}</div>`;
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
  d.addEventListener("close", () => { d.remove(); onClose?.(); });
  document.body.append(d);
  d.showModal();
  return d;
}

export const IKON = {
  zurueck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  pfeil: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  suche: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  senden: '<svg viewBox="0 0 24 24"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bueroklammer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 11-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l9-9a3.7 3.7 0 0 1 5.2 5.2l-9 9a1.8 1.8 0 0 1-2.6-2.6l8.3-8.3"/></svg>',
  kamera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
  haus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/><path d="M9.5 21v-6h5v6"/></svg>',
  ordner: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/></svg>',
  stern: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>',
  haken: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  mikro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  wolke: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5A3.75 3.75 0 0 1 17.5 18z"/><path d="M12 11v6M9.5 13.5 12 11l2.5 2.5"/></svg>',
};

const TZ = "Europe/Berlin";
export const uhrzeit = (iso) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
export const datumKurz = (iso) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: TZ });
export const tagName = (d) => d.toLocaleDateString("de-DE", { weekday: "short", timeZone: TZ }).replace(".", "");
export const tagSchluessel = (d) => new Date(d).toLocaleDateString("sv-SE", { timeZone: TZ }); // JJJJ-MM-TT in Berliner Zeit
export function relativ(iso) {
  const tage = Math.round((new Date(tagSchluessel(Date.now())) - new Date(tagSchluessel(iso))) / 864e5);
  return tage === 0 ? "heute " + uhrzeit(iso) : tage === 1 ? "gestern" : tage < 7 ? `vor ${tage} Tagen` : datumKurz(iso);
}
// In HERO heißen Besichtigungen „Vor-Ort-Termin“ (geprüft 17.11.2026).
export const istBesichtigung = (t) => /besichtigung|vor-ort/i.test(t.kategorie) || t.kategorie === "TB";
export const euro = (cent) => (cent / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
