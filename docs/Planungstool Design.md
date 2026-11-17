---
tags: [heldenwerker, app, hero, planung]
status: aktiv
date: 2026-11-17
---

# Heldenwerker Planungstool: Design

## Worum es geht

Planer und Vertriebler bei Heldenwerker sollen eine Besichtigung (PV und Wärmepumpe) in einer App festhalten: Fotos, Videos, PDFs, Maße, Absprachen. Am Ende fasst Claude alles zusammen, und das Ergebnis landet geordnet im HERO-Projekt.

**Für wen das Ergebnis ist:** die Monteure auf der Baustelle. Wer das Projekt in HERO öffnet, soll in 30 Sekunden verstehen, was gemacht wird, wo was hinkommt und worauf zu achten ist.

**Grundlage:** das bestehende Formular „Technische Besichtigung PV + Wärmepumpe“ (Heldenwerker_Besichtigung.pdf, ausfüllbares PDF, 7 Bereiche, 12 Pflichtfotos). Bisher füllen die Planer es von Hand aus und machen die Fotos getrennt davon.

**Jetzt:** ein Test, den Dominik selbst bedient. Die App liegt auf GitHub Pages wie die Stempeluhr, die Daten kommen live aus HERO, und die KI läuft über Dominiks Claude-API-Guthaben.

## Ziele

- In der App sind alle Kunden und Projekte aus HERO sichtbar, mit Suche, immer aktuell.
- Über das Plus legt man ein neues Projekt an oder wählt ein vorhandenes. Danach läuft die Besichtigung als Chat wie bei Claude oder ChatGPT. Der Planer schickt Fotos, Videos, PDFs und Text, und Claude fragt nach, was fürs Protokoll noch fehlt.
- In Fotos kann man zeichnen (z. B. den Kabelweg einzeichnen).
- Zum Abschluss erzeugt Claude eine Zusammenfassung für die Monteure und das ausgefüllte Besichtigungsprotokoll als PDF. Beides geht nach einer Prüfung durch den Planer nach HERO.
- Rechts über der Menüleiste sitzt eine Lampe wie in der Stempeluhr, über die man Verbesserungswünsche schreibt.
- Der Look entspricht der Stempeluhr, mit einem dunklen und einem hellen Design. Die Anordnung von Kacheln und Elementen folgt Dominiks Vorlagebildern.

## Nicht-Ziele (für diesen Test)

- Keine Rechte und Rollen pro Mitarbeiter, keine Monteurs-Ansicht in der App. Die Monteure lesen in HERO.
- Kein Offline-Betrieb auf der Baustelle.
- Keine weiteren Hintergründe oder Farbwahl wie in der Stempeluhr, nur Dunkel und Hell.
- Kein Bearbeiten beliebiger HERO-Felder. Die App liest Kunden, Projekte und Termine und schreibt nur das Ergebnis einer Planung (siehe unten).
- Keine Sprachaufnahme mit eigener Umwandlung in Text. Sprache läuft über die Diktierfunktion der Handy-Tastatur.

## Anti-Ziele (wäre gescheitert, auch wenn es technisch läuft)

- Der HERO-Schlüssel oder der Claude-Schlüssel steht in der öffentlichen Seite oder im öffentlichen Repo.
- Echte Kundendaten stehen im öffentlichen Repo oder sind ohne Tailscale erreichbar.
- Ein echtes Kundenprojekt in HERO wird im Test verändert.
- Der Monteur öffnet das Projekt und muss sich die Infos trotzdem aus 40 Fotos zusammensuchen.
- Es sieht aus wie ein Formular-Baukasten statt wie die Stempeluhr.

## Rahmen und Vorgaben

- **HERO-API** (GraphQL v7, Schlüssel mit Vollzugriff in `~/.hero/graphql.env`). Vorhanden und geprüft: `upload_image` und `upload_document` (Ziel Projekt, brauchen eine `file_upload_uuid`), `add_logbook_entry` (Text an ein Projekt), `FileUploadFolder_*` (Dateiordner). Videos kann HERO nicht aufnehmen. Wie man an eine `file_upload_uuid` kommt (eigener Upload-Endpunkt?), ist noch nicht geprüft.
- **Schreiben nur ins Testprojekt UNB-1149** (interne ID 11541539), bis Dominik es ausdrücklich anders sagt. Lesen ist überall erlaubt. Nie Mails senden, nie löschen.
- **GitHub Pages ist öffentlich.** In die Seite kommen nur Oberfläche und Demodaten (so wie bei der Klartext-Vorschau).
- **Der Server läuft auf Dominiks PC** und ist nur über Tailscale erreichbar (wie Klartext). Nur er hält den HERO-Schlüssel, den Claude-Schlüssel und den Google-Zugang.
- **Videos gehen auf Google Drive**, in HERO steht der Link.
- **Schreibstil in der App:** Heldenwerker, also siezen, sachlich, modern, keine Gedankenstriche. Die App-Oberfläche selbst ist intern und darf duzen. Siehe offene Frage.

## Wege, die zur Wahl standen

**Datenhaltung**
- *Kopie der HERO-Daten in der App, die abgeglichen wird:* Das kann auseinanderlaufen und braucht Webhooks, die HERO vermutlich nicht hat. Verworfen.
- *Live lesen, direkt zurückschreiben (gewählt):* Die App hält keine eigene Kopie von Kunden und Projekten. Jede Ansicht fragt HERO über den Server, und Ergebnisse gehen sofort nach HERO. Damit ist die App automatisch in beide Richtungen synchron. Nur die eigenen Planungs-Chats (Entwürfe) und das Feedback speichert der Server selbst.

**Wo der Schlüssel liegt**
- *Im GitHub-Pages-Code:* ausgeschlossen, weil die Seite öffentlich ist.
- *Cloudflare Worker:* immer erreichbar, aber Kundendaten im Internet, und es braucht sofort einen Login.
- *Server auf dem PC über Tailscale (gewählt von Dominik):* kostenlos, nichts öffentlich, Login über Tailscale. Für Monteure und Planer ohne Tailscale braucht es später einen anderen Host (NAS oder Server in DE, wie im Konzept HERO KI Schnittstelle).

**Ablauf der Planung**
- *A Freier Chat (gewählt von Dominik):* nur Chat, ohne sichtbare Checkliste. Claude kennt das Protokoll und fragt nach.
- *B Formular:* das PDF als Schritt-für-Schritt-Formular. Kein Chat, nicht gewollt.
- *C Chat mit Fortschrittsleiste:* von mir empfohlen, von Dominik nicht gewählt.

**Videos**
- *Google Drive (gewählt):* Der Link geht überall auf dem Handy.
- *NAS:* Der Link geht nur im Firmennetz oder mit Tailscale.

## Aufbau

```
Handy/PC (Tailscale an)
  └─ GitHub Pages: Oberfläche (HTML/CSS/JS, kein Build)
       └─ fetch → https://<PC über Tailscale>/api/…
            Server auf dem PC
              ├─ HERO GraphQL (Schlüssel)
              ├─ Claude API (Schlüssel)
              ├─ Google Drive API (Videos)
              └─ eigene Dateien: Planungs-Chats, Feedback
```

Erreicht die Seite den Server nicht (kein Tailscale, PC aus), zeigt sie Demodaten und einen Hinweis „Demo, nicht verbunden“. So kann man die Seite auch öffentlich ansehen, ohne dass Daten drin sind.

### Menüleiste (unten, schwebendes Glas wie Stempeluhr)

Von links: **Home · Kalender · ＋ · Projekte · Einstellungen**. Die Lampe für Feedback sitzt rechts über der Leiste, wie in der Stempeluhr.

- **Home:** offene Planungen (angefangene Chats), heutige und nächste Besichtigungstermine, zuletzt nach HERO gesendete Planungen.
- **Kalender:** Termine aus HERO (lesen), Tag/Woche. Tippen auf einen Termin öffnet das Projekt oder startet die Planung dazu.
- **＋:** Sheet mit „Neues Projekt anlegen“ oder „Vorhandenes Projekt wählen“ (Suche über Kunde, Adresse, Projektnummer). Danach öffnet sich der Planungs-Chat.
- **Projekte:** alle Kunden und Projekte aus HERO mit Suche. Die Projektseite zeigt Kundendaten, die Dateien und Logbuch-Einträge aus HERO sowie die Planungen der App.
- **Einstellungen:** Dunkel/Hell, Verbindungsstatus (Server, HERO, Claude, Drive), Testmodus-Anzeige, Feedback-Liste für Dominik.

Die genaue Anordnung von Kacheln und Elementen kommt aus Dominiks Vorlagebildern (stehen noch aus).

### Planungs-Chat

- Sieht aus wie Claude oder ChatGPT: Verlauf mit Blasen, unten Eingabe mit Knöpfen für Kamera/Galerie und Datei.
- Der Planer schickt Fotos, Videos, PDFs und Text. Claude sieht die Fotos und PDFs und kennt die 7 Bereiche und 12 Pflichtfotos des Besichtigungsprotokolls. Es fragt freundlich und knapp nach dem, was noch fehlt. Wenn etwas nicht passt, sagt es das (z. B. „Gerüstfläche frei?“ noch offen).
- Videos sieht Claude nicht. Es fragt, was darauf zu sehen ist.
- Jedes Foto lässt sich vor dem Senden oder danach zum Zeichnen öffnen: Stift in Rot, Gelb und Weiß, Pfeil, Rückgängig. Gespeichert wird das Bild mit Zeichnung.
- Die Felder des Protokolls füllt Claude beim Zusammenfassen aus dem ganzen Chat (Felder wie im PDF). Während des Chats sind sie nicht sichtbar (Ablauf A). Man sieht sie in der Prüfung am Ende.
- Der Chat wird laufend auf dem Server gespeichert. Man kann ihn schließen und später auf Home weitermachen.

### Abschluss

1. Knopf „Zusammenfassen“. Claude erzeugt:
   - **„Für die Monteure“:** kurz und in festen Abschnitten, nämlich *Was wird gemacht*, *Wo kommt was hin*, *Achtung auf der Baustelle*, *Material/Besonderheiten*, *Offene Punkte*.
   - **Protokoll-Felder** wie im PDF, mit Hinweis auf fehlende Pflichtangaben und Pflichtfotos.
2. Der Planer sieht beides, kann den Text ändern und Felder korrigieren.
3. „In HERO speichern“:
   - Fotos (mit Zeichnung) gehen per `upload_image` ins Projekt, möglichst in einen Dateiordner „Besichtigung“.
   - Das ausgefüllte Besichtigungsprotokoll geht als PDF (aus der vorhandenen PDF-Vorlage) per `upload_document` ins Projekt.
   - PDFs aus dem Chat gehen per `upload_document` ins Projekt.
   - Videos gehen auf Google Drive, freigegeben per Link.
   - Ein Logbuch-Eintrag enthält die Monteur-Zusammenfassung plus die Video-Links.
4. **Testmodus:** Solange er an ist (Standard), schreibt der Server alles ins Testprojekt UNB-1149, egal welches Projekt gewählt ist. Ein deutliches Banner zeigt das an. Der Server erzwingt das, nicht die Oberfläche.

### Feedback-Lampe

Ein Sheet mit Typ (Idee, Fehler, Frage) und Text, optional ein Screenshot. Der Server speichert es. Dominik sieht die Liste in den Einstellungen. Antworten im Chat wie bei der Stempeluhr gibt es vorerst nicht.

### Anmeldung

Tailscale Serve reicht den angemeldeten Tailscale-Nutzer an den Server weiter. Der Name steht an Planungen und Feedback. Ohne Tailscale gibt es keinen Zugriff, nur die Demo.

## Look

- Stempeluhr als Vorbild (Repo dominikugc-web/stempeluhr, `style.css`): Systemschrift 17 px, Glas-Karten mit Lichtkante, Radien 22 bis 32 px, Pill-Knöpfe, großer Verlaufsknopf 64 px, schwebende Glas-Tab-Leiste mit Indikator, Bottom-Sheets statt Dialoge, Toast oben.
- **Nur Dunkel und Hell.** *Meine Festlegung:* Dunkel ist der Glas-Look auf neutralem, fast schwarzem Grund mit einem leichten Schimmer in Heldenwerker-Blau statt Kaffee-Braun. Hell ist die helle Variante der Stempeluhr. Der Akzent ist Heldenwerker-Blau (der Ton aus dem Protokoll-Kopf), OK Grün, Warnung Orange, Fehler Rot wie in der Stempeluhr.
- Am Handy kein Zoom und Touch-Flächen ab 44 px wie in der Stempeluhr. Am PC ist der Inhalt mittig begrenzt.

## Festlegungen, die ich getroffen habe (bitte prüfen)

- Frontend ohne Build-Schritt, Vanilla HTML/CSS/JS wie die Stempeluhr. Eigenes öffentliches Repo unter dominikugc-web (Name z. B. `heldenwerker-planung`), Code lokal außerhalb des Vaults, weil der Vault per Drive synchronisiert wird.
- Server in Node ohne Framework, weil `hero-abfrage.mjs` schon Node ist. Der Gateway-Ordner aus „HERO KI Schnittstelle“ wird nicht verwendet, weil er für ChatGPT und Rollen gebaut ist.
- Claude-Modell: Sonnet 5.5 (`claude-sonnet-5-5`), von Dominik am 17.11. gewählt. Im Chat mit niedrigem Aufwand (effort low), beim Zusammenfassen mit hohem. Mit Ausweichmodell bei einer Ablehnung (`fallbacks: "default"`).
- Der Chat selbst nutzt keine Werkzeuge. Erst „Zusammenfassen“ holt die Protokoll-Felder, die Pflichtfoto-Zuordnung und den Monteur-Text in einem Aufruf mit festem JSON-Format (structured outputs). Das ist einfacher als Werkzeuge in jeder Runde.
- Dateien aus dem Chat liegen bis zum Speichern auf dem PC im Datenordner des Servers.
- Monteur-Zusammenfassung als Logbuch-Eintrag, weil das in HERO als Erstes im Projektverlauf erscheint.

## Geklärt nach dem Builder-Check

- **Verbindung Seite ↔ Server:** Tailscale Serve setzt den Kopf `Tailscale-User-Login` auf dem Server, egal von welcher Seite die Anfrage kommt. Der Server erlaubt per CORS nur `https://dominikugc-web.github.io` und antwortet auch auf Private-Network-Vorabfragen (Chrome am PC fragt dabei eventuell einmal nach Erlaubnis, Safari am iPhone nicht). *Meine Festlegung:* Zusätzlich liefert der Server dieselbe Oberfläche unter seiner eigenen Tailscale-Adresse aus. Klappt der Weg über GitHub einmal nicht, geht diese Adresse immer. Ohne Tailscale auf dem Handy gibt es nur die Demo.
- **Kunden und Projekte live:** HERO hat `project_matches` (Suche, Status, Seiten mit first/offset), `project_match`, `contacts` (Suche), `calendar_events` (Zeitraum, Projekt), `calendar_event_categories`, `project_histories` (Logbuch), `file_uploads`. Suche und Blättern laufen also direkt über HERO, ohne Kopie. Neues Projekt: `create_project_match` und `create_contact` existieren. (HERO hätte auch Webhooks, `create_webhook`. Die brauchen wir beim Live-Lesen nicht.)
- **`file_upload_uuid`:** Das ist die erste Aufgabe im Plan, als kleiner Probelauf ins Testprojekt. Klappt der Upload nicht, gehen Fotos und PDFs wie die Videos auf Drive, und in HERO stehen nur Logbuch-Eintrag und Links.
- **Protokoll-PDF:** Das ist ein echtes ausfüllbares PDF mit Feldnamen (z. B. `datum_tag`, `modul`, `dachbelag`, `kabelweg_dach_wr`, `optimierer`, `inneneinheit`). Die Vorlage kommt ins Repo, ohne Kundendaten. Aus ihren Feldnamen entstehen die Claude-Werkzeuge und die Prüfansicht. Das Heldenwerker-Blau ist das Blau aus dem PDF-Kopf.
- **Claude und Medien (meine Festlegung):** Aufrufe nur vom Server, Antworten gestreamt. Die Oberfläche verkleinert Fotos für Claude auf höchstens 1600 px. Der ganze Verlauf geht mit Prompt-Caching bei jeder Runde mit, sodass Bilder ab der zweiten Runde nur noch Cache-Preise kosten. Für HERO bleibt das Original mit Zeichnung. Kosten pro Planung zeigt die Einstellungsseite. Grenze pro Planung: 60 Fotos, PDFs bis 30 Seiten.
- **Kalender (meine Festlegung):** Alle Termine aus HERO, oben ein Filter nach Kategorie. Kategorien mit „Besichtigung“ im Namen sind vorausgewählt.
- **Pflichtfotos (meine Festlegung):** Claude ordnet Fotos selbst den 12 Pflichtfotos zu, und der Planer kann das in der Prüfung ändern. In HERO landen alle Fotos in einem Ordner „Besichtigung“. Der Dateiname beginnt mit dem Pflichtfoto, z. B. `Zählerschrank 1.jpg`, weitere Fotos heißen `Weitere 1.jpg`.
- **Ansprache (meine Festlegung):** Die App und Claude duzen den Planer, weil es eine interne App unter Kollegen ist, wie die Stempeluhr. Die Monteur-Zusammenfassung steht neutral in Stichpunkten, ohne Anrede.

## Entscheidungen von Dominik nach dem Builder-Check (17.11.2026)

- **Neues Projekt im Test:** Es wird echt in HERO angelegt (`create_contact`, `create_project_match`), Name mit „TEST“ davor. Dominik löscht diese Projekte selbst, die App löscht nie. *Meine Festlegung dazu:* Im Testmodus darf der Server in UNB-1149 und in Projekte schreiben, die die App selbst angelegt hat (der Server merkt sich deren IDs). Wählt man ein anderes vorhandenes Projekt, geht die Planung nach UNB-1149.
- **Video-Links:** „Jeder mit Link“, damit Monteure ohne Google-Konto sie öffnen können.
- **Drive-Konto:** ein Heldenwerker-Firmenkonto. Welches genau, steht noch aus. Bis der Zugang steht, bleiben Videos auf dem PC, und der Logbuch-Eintrag sagt „Video folgt“. Dieser Schritt kommt im Plan zuletzt.

## Was der Builder selbst entscheidet

Ordner- und Dateistruktur, Port für Tailscale Serve (Klartext belegt 443 und Funnel 8443), Format der gespeicherten Chats, Bildkompression vor dem Upload, PDF-Bibliothek zum Befüllen der Vorlage, Demodaten.

## Offene Punkte

- Vorlagebilder der Oberfläche von Dominik (stehen aus). Ohne sie werden die Bildschirme nicht gebaut.
- Welches Heldenwerker-Google-Konto für die Videos.
- Claude-API-Schlüssel legt Dominik selbst in `~/.anthropic/planung.env` ab.

## Verknüpfungen

- [[HERO KI Schnittstelle und Heldenwerker Brain]]
- [[00 Heldenwerker – Überblick]]

## Nachtrag 17.11.2026: Profile und Feedback-Postfach

Dominik hat entschieden: keine zweite Admin-App und keine Testfassung. Er bekommt Feedback in der App, gibt Claude im Chat die Änderungen, und Claude spielt sie direkt live.

- **Profile:** automatisch aus dem Tailscale-Login (Name, Rolle `admin` oder `planer`, zuletzt aktiv). Der Inhaber (`PLANUNG_INHABER`) ist Admin. Admins sehen in den Einstellungen „Team“ und können Name und Rolle ändern. Der letzte Admin kann sich nicht selbst herabstufen.
- **Wer was macht:** Name des Anlegers an jeder Planung (Listen, Prüfansicht) und „Aufgenommen von …“ im HERO-Logbuch.
- **Feedback:** Status neu oder erledigt, nur Admins sehen und ändern ihn. Roter Punkt an der Lampe, solange es neue Feedbacks gibt.
- **Später:** feinere Rechte pro Rolle, Antworten an den Planer.
