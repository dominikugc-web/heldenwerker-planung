# Baustellenabschluss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monteure schließen eine Baustelle in der App mit einem von fünf Abnahmeprotokollen ab (Dach, DC, AC, Wärmepumpe, Klima), mit Pflichtfotos und Kundenunterschrift; Fotos und PDF landen im HERO-Projekt.

**Architecture:** Ein Abschlussbericht ist eine Planung mit vorbeantworteter Startfrage `bericht`. Eigener Katalog in `server/abschluss-fragen.mjs`, eingehängt in die bestehenden Helfer von `fragen.mjs` (sichtbar, naechste, frageNach). Senden läuft über `abschluss.mjs` ohne Claude, mit eigenem PDF (`server/abnahme-pdf.mjs`), Dokumenttyp Abnahmeprotokoll und Bildkategorie je Bericht. Neue Rolle `monteur` mit zentraler Sperrliste in `main.mjs`.

**Tech Stack:** Node ESM ohne Framework, node:test, pdf-lib, Vanilla-JS-PWA in `web/`.

**Spec:** `docs/superpowers/specs/2026-11-27-baustellenabschluss-design.md`

## Global Constraints

- Keine Gedankenstriche in Texten der Oberfläche und im PDF.
- Besichtigung verhält sich unverändert; alle bestehenden Tests bleiben grün (`npm test`).
- Testdaten im öffentlichen Repo ohne echte Kundennamen aus HERO.
- Keine Schlüssel, Tailnet-Adresse, Drive-ID, Kundendaten im Repo.
- HERO-Proben von Claude nur im Testprojekt UNB-1149; nie send_mail, nie löschen.
- Fragen-IDs des Abschlusses beginnen mit `ab_` und bestehen nur aus a-z, 0-9, _.
- Vor Server-Neustart prüfen, dass nichts sendet (`grep -rl '"laeuft"' daten/planungen`).

## Review Focus

1. Monteur ruft per Hand eine fremde Planungs-ID oder eine gesperrte Route auf: muss 403 bekommen, auch für Dateien, PDF und Antworten.
2. Antwort wird nach der Unterschrift geändert (auch nur ein Foto): Unterschrift muss weg sein, Senden gesperrt bis neu unterschrieben.
3. Gesendeter Bericht: jede Antwort-Änderung 409; „Erneut senden“ nach einem Fehler holt nur Fehlendes nach, lädt nichts doppelt.
4. Unterschrift-PNG darf nicht als Foto ins HERO-Projekt oder in die Fotoliste des PDFs, nur in den Unterschriftsblock.
5. Besichtigung bleibt gleich: Katalog-Endpunkt, `sichtbar` ohne `bericht`, Zusammenfassen mit Claude, Bildkategorie „Besichtigung“, Dokumenttyp Allgemein.

---

### Task 1: Abschluss-Katalog und Sichtbarkeit

**Files:**
- Create: `server/abschluss-fragen.mjs`
- Modify: `server/fragen.mjs` (KATALOG, frageNach, sichtbar, richtungVon), `web/chat.js` (Client-Kopie von `sichtbar`)
- Test: `test/abschluss-fragen.test.mjs`

**Interfaces:**
- Produces: `BERICHTE = { dach: "Dachmontage PV", dc: "Elektrik DC", ac: "Elektrik AC", wp: "Wärmepumpe", klima: "Klima" }`; `ABSCHLUSS_BEREICHE` (ab_kopf, ab_dach, ab_dc, ab_ac, ab_wp, ab_klima, ab_abnahme); `ABSCHLUSS_KATALOG` (Fragen mit `bericht: "<key>"` oder ohne = alle Berichte, optional `aus: "<besichtigungs-id>"`, Pflichtfotos `pflicht:true, titel`); Startfrage `{ id: "bericht", art: "auswahl", optionen: Object.values(BERICHTE) }`.
- `fragen.mjs` exportiert weiter `KATALOG` (jetzt Besichtigung + Abschluss), `frageNach`, `sichtbar(antworten)`, `istAbschluss(antworten) => !!antworten.bericht?.wert`, `berichtVon(antworten) => key`.
- `sichtbar`: mit `bericht` nur Abschlussfragen dieses Berichts (plus gemeinsame Kopf- und Abnahmefragen, plus `wenn`); ohne `bericht` wie heute, Abschlussfragen nie sichtbar.
- `/api/fragen` liefert beide Bereiche-Tabellen zusammengeführt.

Inhalte genau wie Spec, Abschnitt „Inhalt der Berichte“. DC-Messprotokoll: Frage `ab_dc_strings` (auswahl 1 bis 6), je String n Fragen `ab_dc_s<n>_module|spannung|strom|erdung|isolation` (zahl, Einheiten Stk, V, A, Ω, MΩ) mit `wenn: { frage: "ab_dc_strings", ist: ["n".."6"] }`. Mängel: `ab_maengel` auswahl ["Keine sichtbaren Mängel", "Folgende Mängel"], `ab_maengel_text` text wenn Folgende. Unterschrift: `ab_unterschrift` art `unterschrift`, Name als Wert. Wallbox-Foto mit `wenn` auf `ab_ac_wallbox` ungleich leer: als `wenn: { frage: "ab_ac_wallbox_da", ist: "ja" }` mit eigener Ja/Nein-Frage vor dem Foto.

- [ ] Test: `sichtbar({ bericht:{wert:"Elektrik DC"}, ab_dc_strings:{wert:"2"} })` enthält `ab_dc_s2_spannung`, nicht `ab_dc_s3_spannung`, keine Besichtigungsfrage, endet mit `ab_unterschrift`; `sichtbar({ typ:{wert:"PV"} })` enthält keine `ab_`-ID; jede Abschluss-ID passt `/^ab_[a-z0-9_]+$|^bericht$/`; alle fünf Berichte haben mindestens ein `pflicht`-Foto.
- [ ] Test läuft rot, dann Katalog bauen, grün, `npm test` grün.
- [ ] Client-`sichtbar` in `web/chat.js` gleich anpassen (Regel: mit bericht nur Abschlussfragen).
- [ ] Commit.

### Task 2: Antworten mit Unterschrift, Begründung und Sperre

**Files:** Modify `server/fragen.mjs` (pruefeAntwort), `server/routen-ablauf.mjs`, `server/bericht.mjs` (fehltPflichtfotos); Test `test/abschluss-ablauf.test.mjs`

**Interfaces:**
- `pruefeAntwort` kennt `unterschrift` (Wert = Name, Pflicht nicht leer, max 120 Zeichen).
- PUT Antwort: bei Abschluss (a) Planung mit `status === "gesendet"` → 409 „Bericht ist gesendet“; (b) Änderung an einer anderen Frage als `ab_unterschrift`, während `ab_unterschrift` Dateien hat → `antworten.ab_unterschrift` wird entfernt; (c) Pflichtfoto `uebersprungen: true` ohne Notiz → 400 „Bitte Grund angeben“.
- `fehltPflichtfotos(pl)` zählt bei Abschluss übersprungene mit Notiz nicht als fehlend.
- Produces `fehltZumSenden(pl): string[]` in bericht.mjs: fehlende Pflichtfotos + „Unterschrift“ wenn `ab_unterschrift` keine Bild-Datei hat.

- [ ] Tests (rot, dann grün): Unterschrift wird bei Änderung von `ab_ac_wr` gelöscht; bleibt bei Änderung der Unterschrift selbst; 409 nach `status:"gesendet"`; 400 beim Überspringen ohne Notiz; `fehltZumSenden` meldet „Unterschrift“.
- [ ] `npm test` grün, Commit.

### Task 3: Abschlussbericht anlegen

**Files:** Modify `server/routen-planungen.mjs` (POST /api/planungen), `server/planungen.mjs` (neu: `bericht`), `server/lieferschein.mjs`; Test `test/abschluss-anlegen.test.mjs`

**Interfaces:**
- POST `/api/planungen` mit `{ bericht: "<key>", projektId, projektTitel, kunde, adresse, nummer, monteure?: string[] }` legt Abschluss an: `antworten.bericht = { wert: BERICHTE[key] }`, `ab_monteure` vorbelegt (Name des Anlegers + `monteure`, eindeutig, mit Komma), `ab_unterzeichner`-Vorgabe = Kunde (Wert von `ab_unterschrift` bleibt leer bis unterschrieben, Vorschlag als `vorschlag` am Planungsobjekt `pl.unterzeichner`), `projekte: [{ id, nummer, richtungen: [] }]`, `art: "abschluss"`.
- Fortsetzen: existiert eine Planung mit gleichem `projektId`, gleichem `bericht` und `status !== "gesendet"`, wird sie mit 200 zurückgegeben statt neu angelegt.
- Lieferschein: `vorbefuellt` aus `antwortenAusLieferscheinen` wird über `aus` auf `ab_`-IDs umgeschrieben (z. B. `ab_dach_module ← modul + anzahl_module`, `ab_ac_wr ← wechselrichter`, `ab_ac_speicher ← speicher`, `ab_wp_aussen ← bosch_modell`, `ab_wp_innen ← inneneinheit`). Parser ergänzt `wallbox` (Name enthält Wallbox) und `klima_aussen`/`klima_innen` (Klima-Positionen), nur wenn eindeutig.
- `bericht` ungültig → 400.

- [ ] Tests (rot, grün): Anlegen setzt `bericht`, `ab_monteure`, `art`; zweiter Aufruf liefert dieselbe ID; nach `status:"gesendet"` neue ID; Lieferschein-Mapping mit Fixture (vorhandene Lieferschein-Testdaten in `test/daten` wiederverwenden) füllt `ab_ac_wr` mit `quelle`.
- [ ] `npm test` grün, Commit.

### Task 4: Abnahmeprotokoll-PDF

**Files:** Create `server/abnahme-pdf.mjs`; Modify `server/routen-planungen.mjs` (protokoll.pdf wählt PDF nach Art); Test `test/abnahme-pdf.test.mjs`

**Interfaces:**
- `abnahmePdf(pl, { bild }) => Promise<Uint8Array>`; `bild(dateiId)` liefert JPEG/PNG-Bytes (Unterschrift ist PNG).
- Inhalt: Logo (`vorlagen/logo.png`), Kopf (Kunde, Adresse, Projekt-Nr., Datum), Titel „Abnahmeprotokoll <Berichtname>“, Monteure, Punkte Frage | Antwort (mit Notiz), DC-Strings als Tabelle, Abnahmeteil mit festem Text aus der Spec, Mängel, Werbefreigabe, Unterschrift als Bild mit „Name, Datum“, danach Fotos je Pflichtfoto mit Titel; begründet übersprungene Pflichtfotos mit „Nicht möglich: <Notiz>“. `winAnsi` aus bericht.mjs wiederverwenden (exportieren).
- `abnahmeTitel(antworten)`, `abnahmeDateiname(pl) => "Abnahmeprotokoll <Bericht> <Kunde> <TT.MM.JJJJ>.pdf"` (Schrägstriche ersetzt).

- [ ] Test (rot, grün): PDF mit pdfjs-dist lesen (wie `test/bericht.test.mjs`), enthält „Abnahmeprotokoll Elektrik DC“, „gewährleisten wir gemäß BGB 5 Jahre“, einen String-Spannungswert, Unterzeichnername; Unterschrift-Datei taucht nicht in der Fotoliste auf.
- [ ] `npm test` grün, Commit.

### Task 5: Senden ohne Claude, HERO-Ziel je Bericht

**Files:** Modify `server/routen-planungen.mjs` (abschliessen), `server/abschluss.mjs`, `server/hero-dateien.mjs`, `server/main.mjs` (inHero-Optionen durchreichen); Test `test/abschluss-senden.test.mjs`

**Interfaces:**
- POST `/api/planungen/:id/abschliessen` bei Abschluss: `fehltZumSenden(pl)` nicht leer → 409 mit Liste; sonst `pl.ergebnis = { fehlt: [] , abschluss: true }`, `status = "zusammengefasst"` falls nötig, dann `abschluss.starten`.
- `abschluss.mjs`: bei Abschluss PDF = `abnahmePdf`, Name `abnahmeDateiname`, Unterschrift-Dateien (Frage `ab_unterschrift`) nicht als eigene Aufträge; `dateien.inHero(z.id, pfad, name, mime, { dokumenttyp, bildkategorie })`; Logbuch `logbuchTextAbschluss(berichtName, monteure)` = „Baustelle abgeschlossen: <Bericht>\nMonteure: …“.
- `hero-dateien.mjs`: `inHero(projektId, pfad, name, mime, { dokumenttyp = 380912, bildkategorie = "Besichtigung" } = {})`; Konstanten `DOKUMENTTYP_ABNAHME = 380908`, `BILDKATEGORIE = { dach: "Dachbelegung ", dc: "Messprotokoll Strings+Erdung", ac: "AC Montage", wp: "wärmepumpe ", klima: "aussengerät" }`.
- Nach Senden `status = "gesendet"` (wie heute über Logbuch).

- [ ] Tests (rot, grün) mit den Fakes aus `test/zusammenfassen.test.mjs`/`mehrere-projekte.test.mjs`: 409 ohne Unterschrift; mit Unterschrift läuft Senden, `inHero` bekam für das PDF `dokumenttyp 380908` und für Fotos die Kategorie des Berichts, Unterschrift-PNG nicht als Foto, Logbuchtext beginnt mit „Baustelle abgeschlossen“; Besichtigung ruft weiter mit Standardwerten.
- [ ] `npm test` grün, Commit.

### Task 6: Rolle Monteur und Zugriff

**Files:** Modify `server/profile.mjs`, `server/main.mjs`, `server/routen-planungen.mjs`, `server/routen-hero.mjs`, `server/routen-ablauf.mjs`; Test `test/monteur.test.mjs`

**Interfaces:**
- `ROLLEN = ["admin", "planer", "monteur"]`; `istMonteur(k)`.
- `main.mjs`: Monteur darf nur diese Routen (Methode + Muster): GET /api/gesund, /api/ich, /api/fragen, /api/termine, /api/termin-kategorien, /api/produkte, /api/produkte/:id/bild, /api/produkte/:id/3d, GET/POST /api/planungen, GET /api/planungen/:id, PUT …/antworten/:frage, PUT/GET …/dateien/:dateiId, GET …/protokoll.pdf, POST …/abschliessen, POST /api/fehlerbericht, POST /api/feedback (falls vorhanden), GET /api/projekte/:id (nur erlaubte Projekte). Alles andere 403. Die exakten Produkt-/Feedback-Muster beim Bauen aus `produkte.mjs`/`feedback.mjs` übernehmen.
- `erlaubteProjekte(k) => Promise<Set<number>>`: Projekt-IDs aus `/api/termine`-Daten (heroPerson oder E-Mail eingeteilt), Zeitraum −60 bis +14 Tage, Kategorien Umsetzung, DC Montage, WP Montage, Zählertausch; 5 Minuten im Speicher je Login.
- Planungen für Monteur: Liste nur `art === "abschluss"` und (`person === login` oder Projekt erlaubt); `:id`-Routen prüfen dasselbe, sonst 403; POST nur mit `bericht` und erlaubtem Projekt.
- Termine für Monteur: nur `meins`, nur obige Kategorien, nur mit Projekt.

- [ ] Tests (rot, grün) mit Fake-HERO und `tailscale-user-login`-Header: Monteur bekommt 403 auf POST /api/projekte, GET /api/projekte?suche, fremde Planung, Besichtigung anlegen; 200 auf eigenen Bericht und auf Bericht eines Kollegen im selben Termin-Projekt; Termine gefiltert; Admin kann Rolle `monteur` setzen.
- [ ] `npm test` grün, Commit.

### Task 7: Oberfläche

**Files:** Modify `web/app.js`, `web/chat.js`, `web/pruefung.js`, `web/ui.js`, `web/style.css`, `web/lokal.js` (Wert-Normalisierung `unterschrift`)

- Home für Monteur: „Meine Montagen“ (heute bis 7 Tage, Termine aus /api/termine), „Offene Abschlussberichte“, „Zuletzt gesendet“; Tab-Leiste ohne Kalender-alle/Projektsuche/Plus; Einstellungen nur Name und Server.
- „Baustelle abschließen“: auf Termin-Zeilen (Monteur) und auf der Projektseite (alle Rollen). Sheet: Bericht wählen (Vorauswahl aus Gewerk wie Spec), bei mehreren Projekten im Termin Projekt wählen (Vorauswahl passend zum Gewerk), dann POST mit `monteure` = Personen des Termins, öffnet `chat/<id>`.
- Chat: Frageart `unterschrift`: Zeichenfläche (Canvas, Pointer Events, Finger), Name-Feld vorbelegt mit Kunde, Knöpfe „Löschen“ und „Übernehmen“; Übernehmen lädt PNG hoch (art bild, ohne Verkleinern) und setzt Wert = Name. Pflichtfoto „Überspringen“ fragt nach Grund (Notiz-Sheet).
- Ende des Ablaufs bei Abschluss: Knopf „Prüfen und senden“ statt Zusammenfassen; ruft kein Claude, geht zu `pruefung/<id>`.
- Prüfansicht bei Abschluss: ohne Monteur-Text, Hinweis „Es fehlt noch“ aus `fehltZumSenden`-Logik (Client rechnet nach Katalog), Senden-Knopf „In HERO speichern“ deaktiviert solange etwas fehlt, Ergebniszeilen „Abnahmeprotokoll im HERO-Projekt“; gesendeter Bericht ohne Bearbeiten-Links.
- Team-Sheet: dritter Rollen-Knopf „Monteur“, Badge.

- [ ] In der Vorschau `planungstool` (Port 8792, Testmodus) durchklicken: Bericht AC anlegen, Fragen beantworten, Foto, Unterschrift, Prüfen, PDF ansehen; Rolle Monteur über lokalen Login prüfen (Header nicht setzbar: Profil in daten-test auf monteur stellen); Handy-Breite 375 px; Konsole ohne Fehler.
- [ ] `npm test` grün, Commit.

### Task 8: HERO-Probe und Live

- [ ] Im Testmodus einen AC-Bericht nach UNB-1149 senden: prüfen, dass das PDF im Ordner Baustellenberichte als Abnahmeprotokoll liegt und Fotos die Kategorie „AC Montage“ haben (`hero-abfrage.mjs`). Klappt 380908 nicht: Fallback 380912, Dominik Bescheid geben.
- [ ] `bash veroeffentlichen.sh`, Server neu starten (vorher „laeuft“ prüfen), `/api/gesund` und `/api/fragen` live prüfen.
- [ ] Memory `heldenwerker-planungstool.md` ergänzen, `docs/betrieb.md` um Monteur-Einrichtung ergänzen.
