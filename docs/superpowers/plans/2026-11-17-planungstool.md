---
tags: [heldenwerker, app, plan]
status: aktiv
date: 2026-11-17
---

# Heldenwerker Planungstool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Web-App, in der Planer eine Besichtigung als Chat mit Claude festhalten. Das Ergebnis (Fotos mit Zeichnung, Protokoll-PDF, Monteur-Zusammenfassung, Video-Links) landet im HERO-Projekt.

**Architecture:** Statische Oberfläche (Vanilla HTML/CSS/JS im Stempeluhr-Look) auf GitHub Pages, Branch `gh-pages`. Dieselben Dateien liefert auch ein kleiner Node-Server auf Dominiks PC aus, erreichbar nur über Tailscale. Der Server hält alle Schlüssel und spricht live mit HERO (GraphQL v7), Claude und später Google Drive. Eine eigene Kopie der HERO-Daten gibt es nicht. Der Server speichert nur Planungs-Chats, Dateien bis zum Abschluss, Feedback und die IDs selbst angelegter Projekte als JSON im Ordner `daten/`.

**Tech Stack:** Node 22 (ESM, `node:http`, `node:test`), `@anthropic-ai/sdk`, `pdf-lib`, später `googleapis`. Frontend ohne Build und ohne Framework.

**Spec:** `02 Projekte/Heldenwerker GmbH/Planungstool/Planungstool Design.md` (im Vault; Task 1 legt eine Kopie unter `docs/` ins Repo)

## Global Constraints

- Repo: `C:\Users\Dominik\Documents\Heldenwerker-Planung` (außerhalb des Vaults), GitHub öffentlich `dominikugc-web/heldenwerker-planung`, Pages vom Branch `gh-pages` = Inhalt von `web/`.
- Schlüssel nur in Dateien außerhalb des Repos: `~/.hero/graphql.env` (`HERO_GRAPHQL_KEY=`), `~/.anthropic/planung.env` (`ANTHROPIC_API_KEY=`), später `~/.google/heldenwerker-drive.json`. Nie loggen, nie an die Oberfläche geben, nie committen. `daten/` steht in `.gitignore`.
- Ins öffentliche Repo kommen keine echten Kundendaten, keine Tailnet-Adresse und keine lokalen Pfade. Die Demodaten sind erfunden.
- HERO-Endpunkt `https://login.hero-software.de/api/external/v7/graphql`, `Authorization: Bearer <key>`.
- HERO-Schreibregel, vom Server erzwungen: Schreiben nur in Projekt `11541539` (UNB-1149) und in Projekte, die die App selbst angelegt hat (`daten/angelegt.json`). Anlegen nur, wenn der Name mit `TEST ` beginnt. Nie `send_mail`, nie löschende Mutationen.
- Claude: Modell `claude-sonnet-5-5`, `betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`. Chat mit `output_config: {effort: "low"}` und gestreamt. Zusammenfassen mit `effort: "high"` und `output_config.format` (JSON-Schema). Top-level `cache_control: {type: "ephemeral"}`. Vor dem Lesen von `content` immer `stop_reason === "refusal"` prüfen.
- CORS: Nur Origin `https://dominikugc-web.github.io` ist erlaubt. Vorabfragen beantworten mit `Access-Control-Allow-Private-Network: true`.
- Identität: Kopf `Tailscale-User-Login`. Fehlt er, bekommt die Anfrage 401, außer der Server läuft mit `PLANUNG_LOKAL=1` (Tests und Entwicklung, Name „Lokal“).
- Oberfläche: nur Dunkel und Hell (`html.light`). Systemschrift 17 px, Glas-Karten, Pills, schwebende Tab-Leiste, Bottom-Sheets, Toast oben, Touch ab 44 px, kein Zoom. Akzent Heldenwerker-Blau `#3aa8f0` (aus dem PDF-Kopf; der Builder prüft den Ton per Pipette und passt ihn an), OK `#8cc63f`, Warnung `#f0a03c`, Fehler `#e8667e`. Vorbild: `style.css` aus `dominikugc-web/stempeluhr`.
- Texte in der App: duzen, kurz, keine Gedankenstriche. Monteur-Zusammenfassung ohne Anrede, in Stichpunkten.
- Menüleiste von links: Home, Kalender, ＋, Projekte, Einstellungen. Die Feedback-Lampe sitzt rechts über der Leiste.
- **Tasks 5 bis 9 bauen Bildschirme und warten auf Dominiks Vorlagebilder.** Anordnung, Kacheln und Abstände folgen den Bildern. Ohne Bilder werden diese Tasks nicht begonnen.

## Review Focus

1. **Server mitten im Chat weg** (PC aus, Tailscale am Handy aus): Die getippte Nachricht und die gewählten Dateien bleiben stehen, ein Toast sagt „Keine Verbindung zum Server“, und erneutes Senden klappt später. (Test in Task 8)
2. **Großes Video vom Handy** (z. B. 600 MB): Der Server schreibt den Upload als Stream auf die Platte und nicht in den Speicher. Die Oberfläche zeigt Fortschritt. Ein Abbruch hinterlässt keine halbe Datei als „fertig“. (Test in Task 7)
3. **Doppeltippen auf „In HERO speichern“ oder Wiederholen nach Teilfehler:** Jede Datei geht genau einmal hoch. Ein zweiter Lauf lädt nur, was beim ersten fehlte, und schreibt keinen zweiten Logbuch-Eintrag. (Test in Task 11)
4. **Planung zu einem echten, nicht selbst angelegten Projekt:** Der Server schreibt nach UNB-1149, auch wenn die Oberfläche eine andere ID schickt. Das Ergebnis meldet das Ziel ehrlich zurück. (Test in Task 3)
5. **Umlaute und Sonderzeichen** in Kundennamen und Dateinamen (`Müller & Söhne`, `Zählerschrank 1.jpg`): Das funktioniert in der Suche, in HERO-Dateinamen, im PDF und in Drive. (Tests in Task 2 und Task 11)

---

### Task 1: Repo, Server-Gerüst, Auslieferung der Oberfläche

**Files:**
- Create: `package.json`, `.gitignore`, `README.md`, `server/main.mjs`, `server/konfig.mjs`, `web/index.html` (Platzhalter „Planung“), `docs/Planungstool Design.md` (Kopie aus dem Vault), `docs/superpowers/plans/2026-11-17-planungstool.md` (Kopie dieses Plans)
- Test: `test/main.test.mjs`

**Interfaces:**
- Produces: `starteServer({port, webDir, datenDir, lokal}) -> Promise<http.Server>`; `ladeSchluessel(datei, name) -> string|null` in `konfig.mjs` (liest `NAME=` aus einer env-Datei im Home-Ordner); `person(req) -> string|null`; Routing-Tabelle `route(methode, muster, handler)`, Handler `(req, res, params, person)`; Hilfen `json(res, status, obj)` und `leseJson(req) -> Promise<object>`.

- [ ] **Step 1: Write the failing tests** `test/main.test.mjs`:
  - `GET /api/gesund` → 200, `{ok: true, hero: <bool>, claude: <bool>}` (bool = Schlüssel vorhanden, Wert nie enthalten)
  - `OPTIONS /api/gesund` mit `Origin: https://dominikugc-web.github.io` → 204, `Access-Control-Allow-Origin` gleich diesem Origin, `Access-Control-Allow-Private-Network: true`
  - fremder Origin `https://boese.example` → kein `Access-Control-Allow-Origin`-Kopf
  - ohne `Tailscale-User-Login` und ohne `lokal` → `GET /api/gesund` 401
  - `GET /` liefert `web/index.html`, `GET /../package.json` → 404 (kein Pfad-Ausbruch)
- [ ] **Step 2:** `node --test test/` → FAIL
- [ ] **Step 3:** `server/main.mjs` und `konfig.mjs` umsetzen. Statische Dateien aus `webDir` mit Content-Type nach Endung. Ohne `PLANUNG_PORT` lauscht der Server nur auf `127.0.0.1:8790`.
- [ ] **Step 4:** `node --test test/` → PASS
- [ ] **Step 5:** `git init`, Commit „Gerüst: Server und Auslieferung“. Danach `gh repo create dominikugc-web/heldenwerker-planung --public --source . --push`.

### Task 2: HERO lesen (Projekte, Kunden, Termine)

**Files:**
- Create: `server/hero.mjs`, `server/routen-hero.mjs`
- Modify: `server/main.mjs` (Routen einhängen)
- Test: `test/hero.test.mjs`

**Interfaces:**
- Consumes: `ladeSchluessel` (Task 1)
- Produces: `heroAbfrage(query, variablen, {fetch}) -> Promise<data>` (wirft `HeroFehler` mit `status`/`meldung`); `projekteSuchen(suche, {offset=0, anzahl=30}) -> Promise<Projekt[]>`; `projektLaden(id) -> Promise<ProjektDetail>`; `termineLaden(vonISO, bisISO) -> Promise<Termin[]>`; `terminKategorien() -> Promise<{id,name}[]>`.
  - `Projekt = {id, nummer, titel, kunde, adresse, status}`
  - `ProjektDetail = Projekt & {kontakt:{name,telefon,email}, dateien:[{id,name,url}], logbuch:[{datum,text}]}`
  - `Termin = {id, titel, start, ende, projektId|null, kategorie}`
  - Routen: `GET /api/projekte?suche=&offset=`, `GET /api/projekte/:id`, `GET /api/termine?von=&bis=`, `GET /api/termin-kategorien`

- [ ] **Step 1:** Feldnamen per Introspektion holen (`node hero-abfrage.mjs` im Heldenwerker-Ordner) für `project_matches`, `project_match`, `contacts`, `calendar_events`, `calendar_event_categories`, `project_histories`, `file_uploads`. Das Ergebnis kommt als Kommentar in `hero.mjs`. Nur lesen.
- [ ] **Step 2: Write the failing tests** mit einer `fetch`-Attrappe (es gibt keinen echten Aufruf im Test):
  - `projekteSuchen("Müller & Söhne")` sendet `search: "Müller & Söhne"` unverändert als Variable (nicht in den Query-Text eingebaut)
  - Eine HERO-Antwort mit `errors` → `HeroFehler`. Die Route antwortet 502 mit `{fehler: "HERO antwortet nicht wie erwartet"}`, und der Schlüssel taucht in keiner Antwort auf
  - Die Abbildung HERO-Objekt → `Projekt` liefert genau die Felder oben
- [ ] **Step 3:** `node --test test/hero.test.mjs` → FAIL
- [ ] **Step 4:** umsetzen
- [ ] **Step 5:** `node --test test/` → PASS. Danach eine echte Leseprobe: Server mit `PLANUNG_LOKAL=1` starten, `curl 127.0.0.1:8790/api/projekte?suche=UNB-1149` liefert das Testprojekt
- [ ] **Step 6:** Commit „HERO lesen“

### Task 3: HERO schreiben mit Schutz, Projekt anlegen

**Files:**
- Create: `server/speicher.mjs`, `server/hero-schreiben.mjs`
- Modify: `server/routen-hero.mjs`
- Test: `test/hero-schreiben.test.mjs`, `test/speicher.test.mjs`

**Interfaces:**
- Consumes: `heroAbfrage` (Task 2)
- Produces:
  - `speicher.mjs`: `ladeJson(datei, standard) -> any`, `speichereJson(datei, wert)` (atomar: tmp-Datei, dann rename), `datenPfad(...teile) -> string`
  - `TESTPROJEKT_ID = 11541539`; `zielProjekt(gewuenschteId) -> {id, umgeleitet: bool}` (gibt die eigene ID zurück, wenn sie in `angelegt.json` steht, sonst `11541539` mit `umgeleitet: true`)
  - `heroSchreiben(mutation, variablen, projektId)` (wirft, wenn `projektId` nicht erlaubt ist, oder wenn die Mutation `send_mail` oder `delete` enthält)
  - `projektAnlegen({vorname, nachname, firma, strasse, plz, ort, telefon, email, titel}) -> {id, nummer}` (setzt `TEST ` vor Titel und Nachname, ruft `create_contact` und `create_project_match` auf, merkt die ID in `daten/angelegt.json`)
  - Route `POST /api/projekte` → 201 `Projekt`

- [ ] **Step 1: Write the failing tests:**
  - `zielProjekt(999)` → `{id: 11541539, umgeleitet: true}`; `zielProjekt(11541539)` → `{id: 11541539, umgeleitet: false}`; nach Eintrag 4711 in `angelegt.json`: `zielProjekt(4711)` → `{id: 4711, umgeleitet: false}`
  - `heroSchreiben("mutation{send_mail…}", {}, 11541539)` wirft; `heroSchreiben(…, 999)` wirft und ruft `fetch` nicht auf
  - `projektAnlegen({nachname: "Meier", titel: "PV Dach"})` sendet `TEST Meier` und `TEST PV Dach`; bei einem Fehler in `create_project_match` bleibt `angelegt.json` unverändert
  - `speichereJson` lässt bei einem Absturz vor dem Umbenennen die alte Datei ganz
- [ ] **Step 2:** FAIL prüfen
- [ ] **Step 3:** Eingabe-Typen von `create_contact` und `create_project_match` per Introspektion holen, dann umsetzen
- [ ] **Step 4:** PASS. Kein echter Anlege-Aufruf in diesem Task.
- [ ] **Step 5:** Commit „HERO schreiben mit Schutz“

### Task 4: Probelauf Datei-Upload nach HERO

**Files:**
- Create: `server/hero-dateien.mjs`, `docs/hero-upload.md` (Ergebnis des Probelaufs)
- Test: `test/hero-dateien.test.mjs`

**Interfaces:**
- Consumes: `heroSchreiben`, `zielProjekt` (Task 3)
- Produces: `dateiHochladen(buffer, dateiname, mime) -> Promise<uuid>`; `bildAnProjekt(projektId, uuid, kategorie)`; `dokumentAnProjekt(projektId, uuid, titel)`; `ordnerSichern(name) -> ordnerId` (sucht in `file_upload_folders`, legt sonst `FileUploadFolder_CreateFileUploadFolder` an); `logbuchEintrag(projektId, text)` (`add_logbook_entry`, `target: project_match`)

- [ ] **Step 1:** Herausfinden, wie HERO eine `file_upload_uuid` vergibt: HERO-API-Doku, Schema (`FileUpload`, `associate_file_uploads`) und Antwort-Köpfe. Das Ergebnis mit genauem Endpunkt und Format kommt in `docs/hero-upload.md`.
- [ ] **Step 2:** Einmaliger echter Probelauf ins Testprojekt 11541539: ein kleines PNG und ein einseitiges PDF hochladen, dazu ein Logbuch-Eintrag „Probelauf Planungstool“. Danach in HERO nachsehen, dass alles im Projekt liegt.
- [ ] **Step 3:** Tests mit `fetch`-Attrappe für genau den gefundenen Ablauf (Multipart-Teile, Dateiname mit Umlaut bleibt erhalten). Erst FAIL, dann umsetzen, dann PASS.
- [ ] **Step 4:** **Ausstieg:** Gibt es keinen Upload-Weg, kommt das in `docs/hero-upload.md`. Dann melden: Fotos und PDFs gehen wie die Videos über Drive (Task 13 wird vorgezogen), und `dateiHochladen` entfällt.
- [ ] **Step 5:** Commit „HERO Datei-Upload“

### Task 5: Oberfläche Grundgerüst (wartet auf Vorlagebilder)

**Files:**
- Create: `web/style.css`, `web/app.js`, `web/api.js`, `web/demo-daten.json`, `web/manifest.webmanifest`, `web/icon-180.png`, `web/icon-192.png`, `web/icon-512.png`
- Modify: `web/index.html`

**Interfaces:**
- Produces:
  - `api.js`: `SERVER` (gleiche Herkunft, wenn die Seite vom Server kommt, sonst die Adresse aus `localStorage['planung-server']`, die man in den Einstellungen einträgt); `api(pfad, {methode, body, signal}) -> Promise<json>` (wirft `VerbindungsFehler`); `apiStrom(pfad, body, onText) -> Promise<void>`; `istDemo() -> bool` (ohne Server Lesen aus `demo-daten.json`, Schreiben mit Toast „Demo, nicht verbunden. Hier wird nichts gespeichert.“)
  - `app.js`: `go(tab)`, `sheet(html)`, `closeSheet()`, `toast(text, art)`, `esc(text)`, `$(sel)`; Tabs `home`, `kalender`, `plus`, `projekte`, `setup`
- [ ] **Step 1:** Dominiks Vorlagebilder ansehen. Kacheln, Abstände und Reihenfolge je Bildschirm als Liste in `docs/oberflaeche.md` festhalten.
- [ ] **Step 2:** `style.css` aus der Stempeluhr ableiten: Tokens auf `:root` (dunkel) und `html.light`, nur die Bausteine, die die Bilder brauchen (Karte, Pill, großer Knopf, Tab-Leiste mit Indikator, Sheet, Toast, Listenzeile, Suchfeld). Kein Kaffee-Hintergrund, im Dunkeln mit leichtem Blau-Schimmer.
- [ ] **Step 3:** `index.html` mit Tab-Leiste (5 Icons) und Lampen-Knopf `#fbbtn` wie in der Stempeluhr. `app.js` als Router. Einstellungen mit Umschalter Dunkel/Hell (`localStorage['planung-theme']`), Server-Adresse und Status aus `/api/gesund`. Das Banner „Testmodus: Speichern geht nach UNB-1149 oder in TEST-Projekte“ sitzt dauerhaft oben.
- [ ] **Step 4: Sichtprüfung** im Vorschau-Browser mit `PLANUNG_LOKAL=1`: Handy 375×812 und Desktop, Dunkel und Hell, Screenshot neben das Vorlagebild legen. Prüfen: kein waagerechter Scroll, Touch ab 44 px.
- [ ] **Step 5:** Commit „Oberfläche Gerüst“

### Task 6: Home, Projekte, Projektseite, Kalender (wartet auf Vorlagebilder)

**Files:**
- Create: `web/ansichten/home.js`, `web/ansichten/projekte.js`, `web/ansichten/projekt.js`, `web/ansichten/kalender.js`
- Modify: `web/index.html`, `web/app.js`, `web/demo-daten.json`

**Interfaces:**
- Consumes: `/api/projekte`, `/api/projekte/:id`, `/api/termine`, `/api/termin-kategorien` (Task 2), `GET /api/planungen` (Task 7, bis dahin aus den Demodaten)
- Produces: `zeigeProjekt(id)`; `starteChat(projektId)` (wird in Task 8 umgesetzt, bis dahin Toast)

- [ ] **Step 1:** Projekte-Liste mit Suchfeld (300 ms entprellt, eine laufende Anfrage wird abgebrochen), Nachladen beim Scrollen (`offset`), Leerzustand
- [ ] **Step 2:** Projektseite: Kunde, Adresse (tippbar als Karten-Link), Telefon, HERO-Dateien, Logbuch, Planungen der App. Knopf „Planung starten“.
- [ ] **Step 3:** Kalender: Woche und Tag, Kategorie-Filter mit „Besichtigung“ vorausgewählt (Name enthält „Besichtigung“, Groß-/Kleinschreibung egal), Tippen auf einen Termin öffnet das Projekt
- [ ] **Step 4:** Home: offene Planungen, Termine heute und morgen, zuletzt gesendet
- [ ] **Step 5:** Sichtprüfung wie in Task 5, einmal mit echtem Server (`PLANUNG_LOKAL=1`, nur lesen) und einmal als Demo ohne Server
- [ ] **Step 6:** Commit „Home, Projekte, Kalender“

### Task 7: Planungen und Chat auf dem Server

**Files:**
- Create: `server/planungen.mjs`, `server/claude.mjs`, `server/prompt-besichtigung.md`
- Modify: `server/main.mjs`
- Test: `test/planungen.test.mjs`, `test/claude.test.mjs`

**Interfaces:**
- Consumes: `speicher.mjs` (Task 3), `zielProjekt` (Task 3), `projektLaden` (Task 2)
- Produces:
  - Datei `daten/planungen/<id>/planung.json`: `Planung = {id, projektId, projektTitel, person, erstellt, status: "offen"|"zusammengefasst"|"gesendet", kostenCent, verlauf: Nachricht[], ergebnis: null|Ergebnis, gesendet: {dateien:{[dateiId]: heroUuid}, logbuch: bool, pdf: bool}}`
  - `Nachricht = {rolle: "planer"|"claude", text, dateien: DateiRef[], zeit}`; `DateiRef = {id, name, art: "bild"|"video"|"pdf", groesse, klein: bool}`
  - Routen: `POST /api/planungen {projektId}` → `Planung`; `GET /api/planungen` → Liste ohne Verlauf; `GET /api/planungen/:id`; `PUT /api/planungen/:id/dateien/:dateiId?name=&art=&klein=0|1` (roher Body wird per Stream nach `daten/planungen/<id>/dateien/<dateiId>[.klein]` geschrieben; erst nach vollständigem Empfang umbenannt); `POST /api/planungen/:id/nachricht {text, dateien: DateiRef[]}` → `text/plain`-Stream mit Claudes Antwort, danach beide Nachrichten im Verlauf
  - `claudeChat(planung, onText) -> Promise<{text, usage}>`; `kostenSchaetzen(usage) -> euroCent`
- [ ] **Step 1: Write the failing tests:**
  - Ein Upload, der mitten im Body abbricht (Request `destroy()`), hinterlässt keine Datei unter dem Zielnamen
  - Ein Upload von 50 MB aus einem erzeugten Stream bleibt im Prozess-Speicher deutlich unter 50 MB (`process.memoryUsage().rss` vor und nach, Zuwachs < 30 MB)
  - Die Umwandlung `verlauf → messages` macht aus Bildern (die `.klein`-Datei) einen `image`-Block (base64, jpeg), aus PDFs einen `document`-Block und aus Videos nur den Text „[Video: <name>, Inhalt unbekannt]“
  - Nach mehr als 60 Fotos in einer Planung → 400 „Höchstens 60 Fotos pro Planung“; PDF über 30 Seiten → 400 „PDFs bitte bis 30 Seiten“ (Seitenzahl per `pdf-lib`)
  - Nach jeder Antwort steigt `planung.kostenCent` um `kostenSchaetzen(usage)` (Sonnet 5.5: 2 $ Eingabe, 10 $ Ausgabe, 0,10 $ Cache-Lesen je 1 Mio. Token, Kurs fest 0,92 €/$ in `konfig.mjs`). Die Einstellungen zeigen die Summe der Planungen.
  - `claudeChat` mit Attrappen-Client: Bei `stop_reason: "refusal"` wird kein Text gespeichert, sondern die Meldung „Claude hat diese Nachricht abgelehnt. Formuliere sie bitte anders.“
- [ ] **Step 2:** FAIL prüfen
- [ ] **Step 3:** `prompt-besichtigung.md` schreiben: Rolle (Assistent für Heldenwerker-Planer, duzt, kurz), die 7 Bereiche und 12 Pflichtfotos aus dem PDF wörtlich, Verhalten (nach Fehlendem fragen, höchstens 2 Fragen pro Antwort, Videos nicht raten, nie Preise erfinden). Der Prompt ist fest, damit der Cache greift; Projektdaten kommen als erste Nutzer-Nachricht.
- [ ] **Step 4:** Umsetzen mit `client.beta.messages.stream(...)` gemäß Global Constraints, `max_tokens: 4000`
- [ ] **Step 5:** PASS. Danach eine echte Probe mit einem Foto (kostet Cent-Beträge, nur nach Dominiks Schlüssel)
- [ ] **Step 6:** Commit „Planungen und Chat“

### Task 8: Plus und Chat-Oberfläche (wartet auf Vorlagebilder)

**Files:**
- Create: `web/ansichten/plus.js`, `web/ansichten/chat.js`, `web/bild.js`
- Modify: `web/app.js`, `web/style.css`

**Interfaces:**
- Consumes: Routen aus Task 7, `POST /api/projekte` (Task 3), `projekteSuchen` über `/api/projekte`
- Produces: `bildVorbereiten(file) -> Promise<{gross: Blob, klein: Blob}>` (gross: Originalgröße bis 4000 px als JPEG 0.85; klein: max. 1600 px als JPEG 0.8); `starteChat(projektId)`; `oeffneChat(planungId)`
- [ ] **Step 1:** Plus-Sheet mit zwei großen Kacheln „Neues Projekt“ (Formular: Name, Adresse, Telefon, Titel; Hinweis „Wird in HERO mit TEST angelegt“) und „Vorhandenes Projekt“ (Suche wie in Task 6)
- [ ] **Step 2:** Chat wie bei Claude: Blasen, Claude-Antwort wird live hereingestreamt, Eingabe unten mit Kamera/Galerie (`accept="image/*,video/*"`, `multiple`) und Datei (`application/pdf`), Vorschau-Leiste der gewählten Dateien mit Entfernen. Hochladen mit Fortschritt (`XMLHttpRequest.upload.onprogress`).
- [ ] **Step 3:** Fehlerweg (Review Focus 1): Wenn `api`/`apiStrom` einen `VerbindungsFehler` werfen, bleiben Text und Dateien in der Eingabe, es kommt ein Toast „Keine Verbindung zum Server“, und der Sende-Knopf ist wieder aktiv. Bereits hochgeladene Dateien werden beim nächsten Senden nicht noch einmal geschickt (gemerkt über `dateiId`).
- [ ] **Step 4:** Sichtprüfung: echte Probe mit 3 Fotos, 1 PDF und 1 kurzem Video. Danach Server stoppen und senden: Eingabe bleibt stehen, Toast erscheint.
- [ ] **Step 5:** Commit „Plus und Chat“

### Task 9: In Fotos zeichnen (wartet auf Vorlagebilder)

**Files:**
- Create: `web/zeichnen.js`
- Modify: `web/ansichten/chat.js`, `web/style.css`

**Interfaces:**
- Consumes: `bildVorbereiten` (Task 8)
- Produces: `zeichnen(blob) -> Promise<Blob|null>` (Vollbild-Sheet, null = abgebrochen)
- [ ] **Step 1:** Canvas über dem Bild. Pointer Events (Finger, Stift, Maus), Stift in Rot `#e8667e`, Gelb `#f5d020` und Weiß, Pfeil-Werkzeug, Rückgängig, „Fertig“. Strichstärke relativ zur Bildbreite (0,6 %), damit sie auf jedem Foto gleich wirkt. Das Ergebnis wird in voller Auflösung zusammengerechnet.
- [ ] **Step 2:** Im Chat: Tippen auf eine Vorschau vor dem Senden öffnet `zeichnen`. Bei einem gesendeten Bild legt „Bearbeiten“ eine neue Version derselben `dateiId` an (`PUT` überschreibt; die alte Version wird nicht aufbewahrt).
- [ ] **Step 3:** Sichtprüfung am Handy-Maß: Zeichnen mit der Maus im Vorschau-Browser, Pfeil, Rückgängig. Das gespeicherte Bild zeigt die Zeichnung in voller Auflösung.
- [ ] **Step 4:** Commit „Zeichnen in Fotos“

### Task 10: Zusammenfassen und Prüfansicht

**Files:**
- Create: `server/protokoll.mjs`, `server/protokoll-felder.json` (aus der PDF-Vorlage erzeugt), `vorlagen/besichtigung.pdf` (leere Vorlage aus Dominiks Downloads), `web/ansichten/pruefung.js`
- Modify: `server/claude.mjs`, `server/planungen.mjs`
- Test: `test/protokoll.test.mjs`

**Interfaces:**
- Consumes: `Planung` (Task 7)
- Produces:
  - `protokoll-felder.json`: `[{name, label, bereich: 1..7, art: "text"|"auswahl"|"janein", optionen?: string[]}]`, erzeugt per Skript `npm run felder` mit `pdf-lib` (`getForm().getFields()`); die Labels kommen aus dem PDF-Text
  - `PFLICHTFOTOS = ["Dach gesamt","Dacheindeckung","Pfannentyp","Sparren/Lattung","Dachmaße","Störer/Gauben","Gerüstfläche","Kabelweg","WR-Standort","Speicher-Standort","Zählerschrank","HAK/Zähler"]`
  - `Ergebnis = {monteure: {wasWirdGemacht: string[], woKommtWasHin: string[], achtung: string[], material: string[], offen: string[]}, felder: {[name]: string}, fotos: [{dateiId, pflichtfoto: string|null}], fehlt: string[]}`
  - `claudeZusammenfassen(planung) -> Promise<Ergebnis>` mit `output_config.format` als JSON-Schema. `felder.*` ist auf die Namen aus `protokoll-felder.json` begrenzt, Auswahl-Felder auf ihre `optionen`.
  - Routen: `POST /api/planungen/:id/zusammenfassen` → `Ergebnis`; `PUT /api/planungen/:id/ergebnis` (nach der Bearbeitung durch den Planer)
- [ ] **Step 1: Write the failing tests:**
  - `npm run felder` erzeugt für `vorlagen/besichtigung.pdf` mindestens die Felder `modul`, `dachbelag`, `kabelweg_dach_wr`, `optimierer`, `inneneinheit` mit `art: "auswahl"`
  - Ein Ergebnis mit unbekanntem Feldnamen oder einer Auswahl außerhalb der Optionen wird beim Speichern abgewiesen (400)
  - `fehlt` enthält jedes Pflichtfoto, dem kein Foto zugeordnet ist
- [ ] **Step 2:** FAIL, umsetzen, PASS
- [ ] **Step 3:** Prüfansicht: Monteur-Text als bearbeitbare Abschnitte, Felder nach den 7 Bereichen, Fotos mit Pflichtfoto-Auswahl, „Fehlt noch“ in Orange. Knopf „In HERO speichern“ (Task 11).
- [ ] **Step 4:** Echte Probe mit der Planung aus Task 8
- [ ] **Step 5:** Commit „Zusammenfassen und Prüfung“

### Task 11: Protokoll-PDF und Abschluss nach HERO

**Files:**
- Create: `server/abschluss.mjs`
- Modify: `server/protokoll.mjs`, `web/ansichten/pruefung.js`
- Test: `test/abschluss.test.mjs`

**Interfaces:**
- Consumes: `zielProjekt`, `dateiHochladen`, `bildAnProjekt`, `dokumentAnProjekt`, `ordnerSichern`, `logbuchEintrag` (Tasks 3 und 4), `Ergebnis` (Task 10)
- Produces: `protokollPdf(ergebnis, projekt) -> Promise<Buffer>` (Formularfelder füllen, danach `form.flatten()`); `monteurText(ergebnis, videoLinks) -> string`; `abschliessen(planungId) -> Promise<{ziel: {id, umgeleitet}, hochgeladen: number, uebersprungen: number, fehler: string[]}>`; Route `POST /api/planungen/:id/abschliessen`
- [ ] **Step 1: Write the failing tests** (HERO als Attrappe):
  - Zwei Läufe hintereinander: Der zweite lädt nichts hoch, schreibt keinen zweiten Logbuch-Eintrag und meldet `uebersprungen` gleich der Anzahl der Dateien
  - Bricht der dritte von fünf Uploads ab, sind danach genau zwei in `gesendet.dateien`. Der nächste Lauf lädt nur die drei fehlenden hoch, und erst dann kommt der Logbuch-Eintrag.
  - Zwei gleichzeitige Aufrufe für dieselbe Planung: Der zweite bekommt 409 „Wird gerade gespeichert“
  - Dateinamen: `<Pflichtfoto> <n>.jpg` bzw. `Weitere <n>.jpg`, mit Umlauten (`Zählerschrank 1.jpg`)
  - `protokollPdf` mit `kunde: "Müller & Söhne"` erzeugt ein PDF, das `pdf-lib` wieder öffnet und das den Text enthält
  - Das Ziel ist UNB-1149 mit `umgeleitet: true`, wenn die Planung zu einem fremden Projekt gehört
- [ ] **Step 2:** FAIL, umsetzen, PASS. Reihenfolge im Ablauf: Ordner „Besichtigung“ sichern, Fotos, PDFs aus dem Chat, Protokoll-PDF `Besichtigungsprotokoll <Datum>.pdf`, Videos (Task 13, bis dahin „Video folgt: <name>“), zum Schluss der Logbuch-Eintrag. Jeder Schritt wird sofort in `gesendet` gespeichert.
- [ ] **Step 3:** Oberfläche: Fortschritt pro Datei, Ergebnis mit Ziel („Gespeichert in UNB-1149 (Testmodus)“), Knopf „Fehlende erneut senden“ bei Fehlern
- [ ] **Step 4:** Echter Lauf ins Testprojekt. Danach in HERO prüfen: Ordner, Fotos mit Zeichnung, PDF, Logbuch-Eintrag lesbar
- [ ] **Step 5:** Commit „Abschluss nach HERO“

### Task 12: Feedback-Lampe

**Files:**
- Create: `server/feedback.mjs`, `web/ansichten/feedback.js`
- Modify: `server/main.mjs`, `web/ansichten/setup.js` (bzw. Einstellungen in `app.js`)
- Test: `test/feedback.test.mjs`

**Interfaces:**
- Produces: `POST /api/feedback {art: "idee"|"fehler"|"frage", text, bild?: base64}` → 201; `GET /api/feedback` → Liste (nur für `PLANUNG_INHABER` aus der env, sonst 403); Speicher `daten/feedback.json` (Bilder als Dateien daneben)
- [ ] **Step 1: Write the failing tests:** leerer Text → 400; Text über 4000 Zeichen → 400; `GET` durch eine andere Person → 403; `art` außerhalb der drei Werte → 400
- [ ] **Step 2:** FAIL, umsetzen, PASS
- [ ] **Step 3:** Sheet wie in der Stempeluhr (💡 Idee, 🐞 Fehler, ❓ Frage, Textfeld, Senden). Die Liste steht in den Einstellungen, neueste oben.
- [ ] **Step 4:** Commit „Feedback-Lampe“

### Task 13: Videos auf Google Drive (wartet auf Heldenwerker-Konto)

**Files:**
- Create: `server/drive.mjs`, `docs/drive-einrichten.md`
- Modify: `server/abschluss.mjs`
- Test: `test/drive.test.mjs`

**Interfaces:**
- Produces: `videoHochladen(pfad, name, ordnerName) -> Promise<{id, link}>` (resumable Upload als Stream, Freigabe `anyone` + `reader`, Ordner `Heldenwerker Planung/<Projektnummer> <Kunde>`)
- [ ] **Step 1:** Mit Dominik das Konto festlegen. Anleitung für den OAuth-Zugang (Desktop-Client, Refresh-Token in `~/.google/heldenwerker-drive.json`) in `docs/drive-einrichten.md`. Den Zugang richtet Dominik selbst ein.
- [ ] **Step 2: Tests** mit Attrappe: Freigabe wird gesetzt; Ordner wird nur einmal angelegt; ein zweiter Abschluss-Lauf lädt kein Video doppelt hoch (`gesendet.dateien`)
- [ ] **Step 3:** FAIL, umsetzen, PASS. Im Logbuch steht dann „Video: <name> <link>“ statt „Video folgt“
- [ ] **Step 4:** Commit „Videos auf Drive“

### Task 14: Veröffentlichen und Betrieb

**Files:**
- Create: `start.cmd`, `veroeffentlichen.sh`, `docs/betrieb.md`
- Modify: `README.md`

- [ ] **Step 1:** `veroeffentlichen.sh`: `web/` nach Branch `gh-pages` (`git subtree split --prefix web` + Force-Push nur auf `gh-pages`). Vorher prüfen, dass in `web/` weder `ts.net`, `C:\` noch `@` mit Firmen-Domain stehen. Pages in den Repo-Einstellungen auf `gh-pages` stellen.
- [ ] **Step 2:** `start.cmd` startet den Server auf `127.0.0.1:8790`. Tailscale Serve auf einem freien HTTPS-Port (nicht 443 und nicht 8443, die Klartext nutzt), z. B. `tailscale serve --bg --https=10443 http://127.0.0.1:8790`. Den Befehl führt Dominik selbst aus (Persistenz auf seinem PC). Steht in `docs/betrieb.md`.
- [ ] **Step 3:** Ende-zu-Ende am iPhone über die GitHub-Seite: Server-Adresse in den Einstellungen eintragen, Projekt mit TEST anlegen, Chat mit 3 Fotos (eins bemalt), Zusammenfassen, In HERO speichern. In HERO prüfen. Chrome am PC: Prüfen, ob eine Erlaubnisabfrage für das lokale Netz kommt, und das in `docs/betrieb.md` notieren.
- [ ] **Step 4:** Commit „Veröffentlichen und Betrieb“, Push
