import path from "node:path";
import { ladeJson, speichereJson } from "./speicher.mjs";
import { fehler } from "./router.mjs";

export const TESTPROJEKT_ID = 11541539; // UNB-1149
// Gewerk "Unbekannt" und Projekttyp wie beim Testprojekt UNB-1149 (geprüft 17.11.2026).
const MEASURE_ID = 6985, TYPE_ID = 67921;
const VERBOTEN = /send_mail|delete/i;

// Schreibschutz für HERO. Testmodus: nur ins Testprojekt und in selbst angelegte Projekte.
// Echtbetrieb (seit 24.11.2026, Dominiks Freigabe): in jedes Projekt. send_mail und delete bleiben immer gesperrt.
export function erstelleSchreiber({ hero, datenDir, echt = false }) {
  const angelegtDatei = path.join(datenDir, "angelegt.json");
  const angelegt = () => ladeJson(angelegtDatei, []);
  const erlaubt = (id) => (echt && Number(id) > 0) || Number(id) === TESTPROJEKT_ID || angelegt().includes(Number(id));

  return {
    zielProjekt(gewuenscht) {
      return erlaubt(gewuenscht) ? { id: Number(gewuenscht), umgeleitet: false } : { id: TESTPROJEKT_ID, umgeleitet: true };
    },
    async heroSchreiben(mutation, variablen, projektId) {
      if (VERBOTEN.test(mutation)) throw fehler(403, "Diese Aktion ist gesperrt");
      if (!erlaubt(projektId)) throw fehler(403, "In dieses Projekt darf der Testmodus nicht schreiben");
      return hero.abfrage(mutation, variablen);
    },
    async projektAnlegen({ vorname = "", nachname = "", firma = "", strasse = "", plz = "", ort = "", telefon = "", email = "", titel = "" }) {
      if (!(nachname.trim() || firma.trim()) || !titel.trim()) throw fehler(400, "Name oder Firma und ein Titel fehlen");
      const test = (s) => (s.trim() ? "TEST " + s.trim() : "");
      const c = {
        first_name: vorname.trim(), last_name: test(nachname), company_name: nachname.trim() ? firma.trim() : test(firma),
        phone_mobile: telefon.trim(), email: email.trim(), address: { street: strasse.trim(), zipcode: plz.trim(), city: ort.trim() },
      };
      const k = (await hero.abfrage(`mutation($c:CustomerInput){ create_contact(contact:$c, findExisting:false){ id address_id } }`, { c })).create_contact;
      const p = { project_title: test(titel), customer_id: k.id, contact_id: k.id, address_id: k.address_id, measure_id: MEASURE_ID, type_id: TYPE_ID };
      const pm = (await hero.abfrage(`mutation($p:ProjectMatchInput){ create_project_match(project_match:$p){ id project_nr } }`, { p })).create_project_match;
      speichereJson(angelegtDatei, [...angelegt(), pm.id]);
      return { id: pm.id, nummer: pm.project_nr };
    },
  };
}
