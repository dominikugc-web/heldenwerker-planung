# Baustellenabschluss (Abnahmeprotokoll in der App)

Stand 27.11.2026, abgestimmt mit Dominik im Chat.

## Wozu

Wenn eine Baustelle fertig ist, füllen die Monteure in der App einen Abschlussbericht aus: Punkte (vorausgefüllt aus dem Lieferschein), Pflichtfotos und am Ende die Unterschrift des Kunden. Der Bericht **ersetzt das Abnahmeprotokoll aus der HERO-App** (heute „BER-xxx“, Dokumenttyp „Abnahmeprotokoll“, Ordner „Baustellenberichte“). Fotos landen in HERO unter Bilder, das PDF unter Dokumente > Baustellenberichte. So ist jede Baustelle gleich dokumentiert und die Monteure müssen nicht zwei Berichte machen.

## Ziele

- Fünf Berichte: **Dachmontage PV, Elektrik DC, Elektrik AC, Wärmepumpe, Klima**. Jeder Bericht einzeln, mit eigenem PDF und eigener Unterschrift (PV: Dachtrupp macht Dach und DC, später der Elektriker AC).
- Gleiche Bedienung wie die Besichtigung (fester Ablauf mit Knöpfen, Fotos bemalbar, Prüfübersicht, Senden im Hintergrund).
- Lieferschein-Werte vorausgefüllt, Monteur kann alles ändern.
- Kunde unterschreibt in der App, Unterschrift und Name stehen im PDF.
- Rolle **Monteur**: eigener Tailscale-Zugang je Monteur, sieht nur seine Montage-Termine und seine Abschlussberichte.

## Nicht-Ziele

- Kein Claude im Abschluss (keine Kosten, keine Zusammenfassung).
- Keine HERO-Checklisten (field_service_checklist) und kein Ändern der HERO-App-Vorlagen.
- Kein Versand ans Kunden-Postfach (send_mail bleibt gesperrt).
- Keine Nachbearbeitung alter BER-Protokolle.

## Anti-Ziele (wäre ein Fehlschlag, selbst wenn es technisch läuft)

- Ein Monteur sieht Besichtigungen, Einstellungen oder Projekte, auf denen er nicht eingeteilt ist, oder kann Kunden/Projekte anlegen.
- Ein Bericht geht ohne Unterschrift raus.
- Fotos oder PDF landen im falschen HERO-Projekt oder doppelt.
- Die Besichtigung verhält sich anders als heute.

## Bauweg (Approaches)

- **A (gewählt):** Abschluss als neue Art in der bestehenden App. Gleicher Ablauf, gleicher Speicher, gleiches Senden; neu sind Fragenkatalog, Unterschrift, PDF-Layout, Rolle Monteur. Vorteil: das meiste ist erprobt, gleiche Bedienung.
- **B:** eigene lange Formularseite. Verworfen: Senden, Fotos, Bemalen, Prüfen müssten teils neu gebaut werden.
- **C:** HERO-Checklisten. Verworfen: keine Unterschrift, kein eigenes PDF, keine Pflichtfotos.

## Inhalt der Berichte

(LS) = vorausgefüllt aus dem Lieferschein.

**Alle Berichte, Anfang:** Monteure (vorbelegt mit dem Namen des angemeldeten Monteurs plus den auf dem Termin eingeteilten HERO-Personen, änderbar), Datum (heute), Kunde, Projekt-Nr., Baustellenadresse (aus HERO).

**Alle Berichte, Ende** (Wortlaut wie heutiges Abnahmeprotokoll):
- Gemeinsame Besichtigung der montierten Anlagenkomponenten in Ordnung? (ja/nein)
- Gemeinsame Besichtigung der Verkabelung/Leitungsführung in Ordnung? (ja/nein)
- Sauberkeit (Abfall entsorgt, Installationsorte besenrein) in Ordnung? (ja/nein)
- Mängel: „keine sichtbaren Mängel“ oder „folgende Mängel“ mit Text
- Bilder dürfen für Werbezwecke genutzt werden? (ja/nein)
- Fester Text: „Die aufgeführten Mängel werden schnellstmöglich aufgearbeitet. Aufgrund sorgfältiger und fachgerechter Arbeit gewährleisten wir gemäß BGB 5 Jahre ab Abnahme der Leistung, dass diese frei von Sachmängeln sind. Die Anlage gilt mit Unterschrift als mängelfrei abgenommen (ausgenommen der festgestellten Mängel).“
- Name des Unterzeichners (vorbelegt mit Kundenname) und Unterschrift

**1. Dachmontage PV**
- Module Anzahl und Typ (LS), Unterkonstruktion Fabrikat, Moduloptimierer Anzahl/Typ, Belegung wie geplant? (ja/nein, bei nein Notiz), beschädigte Pfannen getauscht? (ja/nein/keine)
- Pflichtfotos: jede belegte Dachfläche komplett, Unterkonstruktion mit Dachhaken vor den Modulen, Kabeldurchführung Dach, Typenschild Modul

**2. Elektrik DC**
- Messprotokoll je String: Bezeichnung, Anzahl Module, Spannung U [V], Strom I [A], Erdung R pe [Ω], Isolation R iso [MΩ]. Anzahl Strings wählbar (1 bis 6), Felder je String.
- Überspannungsschutz DC vorhanden? (ja/nein)
- Pflichtfotos: Messgerät mit Werten, DC-Kabelweg, Erdung und Potentialausgleich, DC-Anschluss am Wechselrichter

**3. Elektrik AC**
- Wechselrichter (LS), Speicher (LS), Wallbox (LS), Notstrom (keine / Notstrom / Ersatzstrom), Inbetriebnahme erfolgt? (ja/nein), Einweisung in App/System erfolgt? (ja/nein)
- Pflichtfotos: Wechselrichter und Speicher gesamt, Typenschilder mit Seriennummern, Zählerschrank offen nach Umbau, Zählerschrank geschlossen, Wallbox (nur wenn Wallbox angegeben), App läuft (Screenshot)

**4. Wärmepumpe**
- Außeneinheit (LS), Inneneinheit (LS), Speicher (LS), Inbetriebnahme erfolgt? Heizkurve eingestellt? Altkessel demontiert? (ja/nein/entfällt), Einweisung in die Bedienung? (ja/nein)
- Pflichtfotos: Außeneinheit gesamt mit Abständen, Fundament und Kondensatablauf, Wanddurchführung gedämmt, Inneneinheit mit Hydraulik, Typenschilder innen und außen, Elektroanschluss, Regler-Display

**5. Klima**
- Außengerät (LS), Innengeräte Anzahl und Modell (LS), Druckprobe (bar und Dauer), Vakuum (mbar), Kältemittel nachgefüllt (g), Inbetriebnahme erfolgt? (ja/nein), Einweisung Fernbedienung oder App? (ja/nein)
- Pflichtfotos: Außengerät, jedes Innengerät, Leitungsweg oder Kanal, Kondensatablauf, Manometer bei der Druckprobe, Vakuummeter, Typenschilder

## Wie es gebaut wird

**Daten.** Ein Abschlussbericht ist eine Planung wie die Besichtigung (gleicher Speicher `daten/planungen/<id>/`). Unterschieden wird über die vorbeantwortete Startfrage `bericht` (Dach | DC | AC | Wärmepumpe | Klima) statt `typ`. Fragen-IDs des Abschlusses beginnen mit `ab_`, damit nichts mit der Besichtigung kollidiert. Katalog in eigener Datei `server/abschluss-fragen.mjs`; `sichtbar`, `naechste`, `frageNach` in fragen.mjs berücksichtigen ihn, ohne das Verhalten der Besichtigung zu ändern.

**Lieferschein.** Bestehender Parser `antwortenAusLieferscheinen` liefert Besichtigungs-IDs (modul, anzahl_module, wechselrichter, speicher, bosch_modell, inneneinheit …). Der Abschlusskatalog trägt je Frage `aus: "<besichtigungs-id>"`; beim Anlegen werden die Werte umgeschrieben. Wallbox und Klimageräte erkennt der Parser heute nicht sicher: wird ergänzt, soweit die Lieferscheine es hergeben, sonst bleibt das Feld leer.

**Unterschrift.** Neue Frageart `unterschrift`: Zeichenfläche im Chat (Finger), „Löschen“ und „Übernehmen“. Gespeichert als PNG-Datei der Antwort (art bild), Wert = Name des Unterzeichners. Ohne Unterschrift kein Senden.

**Pflichtfotos.** Überspringen nur mit Begründung (Notiz). Senden geht nur, wenn jedes sichtbare Pflichtfoto ein Foto oder eine Begründung hat und die Unterschrift da ist. Begründete Lücken stehen im PDF.

**Abschließen.** Kein Zusammenfassen mit Claude: „Senden“ setzt das Ergebnis direkt (fehlende Pflichtfotos prüfen) und startet dieselbe Hintergrund-Sendung wie heute (`abschluss.mjs`): Drive-Ablage (Kunde / Nummer / Fotos, PDF im Projektordner), dann HERO, dann Logbuch. Wiederaufnahme nach Abbruch wie heute.

**HERO.**
- Fotos per `upload_image` mit Bildkategorie je Bericht: Dach „Dachbelegung “, DC „Messprotokoll Strings+Erdung“, AC „AC Montage“, Wärmepumpe „wärmepumpe “, Klima „aussengerät“ (HERO-Namen inkl. Leerzeichen am Ende, wie in `upload_image_categories`).
- PDF per `upload_document` mit Dokumenttyp **Abnahmeprotokoll (380908)**, damit es im Ordner Baustellenberichte liegt. Dateiname `Abnahmeprotokoll <Bericht> <Kunde> <Datum>.pdf`.
- Logbuch: „Baustelle abgeschlossen: <Bericht>“ plus Monteure.
- Zielprojekt: das Projekt des Termins (ein Projekt je Bericht).
- Vor dem Echtbetrieb im Testprojekt UNB-1149 prüfen, ob upload_document mit 380908 klappt und wie es in HERO erscheint (eigene BER-Nummer oder nicht).

**PDF.** Neues Layout `abnahmePdf` im Stil des HERO-Abnahmeprotokolls: Logo, Kopf mit Kunde, Adresse, Projekt-Nr., Datum, Titel „Abnahmeprotokoll <Bericht>“, Monteure, Punkte als Frage | Antwort, Messprotokoll als Tabelle je String, Abnahmeteil mit festem Text, Unterschrift als Bild mit Name und Datum, danach Fotos je Pflichtfoto. Nutzt pdf-lib wie `bericht.mjs`.

**Rolle Monteur.**
- `ROLLEN` um `monteur` erweitern; im Team-Sheet dritter Knopf „Monteur“. Neue Logins bleiben wie heute „planer“, Admin stellt auf Monteur um und ordnet die HERO-Person zu.
- Server (Vertrauensgrenze): Monteur darf nur Termine lesen, Abschlussberichte anlegen/bearbeiten/senden, und nur seine eigenen Berichte lesen. Gesperrt (403): Besichtigung anlegen, Projekte suchen/anlegen, Kunden-Projekte, HERO-Personen, Feedback-Verwaltung, fremde Planungen.
- Termine für Monteure: nur „meins“ und nur Montage-Kategorien (DC Montage, WP Montage, Umsetzung, Zählertausch).
- Oberfläche Monteur: Start zeigt „Meine Montagen“ (heute, morgen, Woche) und „Meine Berichte“; kein Kalender aller, keine Projektsuche, keine Einstellungen außer eigenem Namen.

**Starten.** Auf einem Montage-Termin (und für Admin/Planer zusätzlich auf jeder Projektseite) Knopf „Baustelle abschließen“ → Auswahl des Berichts. Vorauswahl über die Termin-Kategorie: DC Montage → Dach und DC, WP Montage → Wärmepumpe, Umsetzung → AC; bei Projekten mit Gewerk Klima → Klima. Schon begonnene Berichte desselben Projekts und Typs werden fortgesetzt statt neu angelegt.

## Entscheidungen nach der Builder-Prüfung (Claudes Calls, Dominik kann sie umwerfen)

- **Termin-Kategorien (aus HERO-Daten Sep bis Dez 2026):** Montagen laufen fast alle als „Umsetzung“ (PV 248, WP 107, Klima 14); „DC Montage“ und „WP Montage“ sind selten, „Zählertausch“ gelegentlich. Monteure sehen daher ihre Termine der Kategorien Umsetzung, DC Montage, WP Montage, Zählertausch, die ein Projekt haben (Umsetzung ohne Projekt ist meist Urlaub). Die Vorauswahl des Berichts kommt aus dem **Gewerk des Projekts**, nicht aus der Kategorie: Photovoltaik (auch mit Speicher, Wallbox, Notstrom, PV-Erweiterung) → Dach, DC, AC; Wallbox → AC; Wärmepumpe → Wärmepumpe; Klima → Klima; Kombi-Gewerke → alle passenden. Zählertausch → AC.
- **Mehrere Projekte in einem gebündelten Termin:** Der Monteur wählt das Projekt, vorausgewählt ist das, dessen Gewerk zum Bericht passt. Ein Bericht gehört genau zu einem Projekt.
- **Wer was sehen darf (Monteur):** eigene Berichte und Berichte von Projekten, auf deren Termin er in HERO eingeteilt ist (Termine von 60 Tagen zurück bis 14 Tage voraus). So teilt sich ein Trupp einen Bericht: Ein begonnener, nicht gesendeter Bericht desselben Projekts und Typs wird fortgesetzt, egal wer ihn begonnen hat. Anlegen nur für Projekte aus diesen Terminen.
- **Ändern nach der Unterschrift:** Jede Änderung an einer Antwort nach der Unterschrift löscht die Unterschrift; der Kunde muss neu unterschreiben (das PDF zeigt, was er gesehen hat).
- **Nach dem Senden:** Bericht gesperrt. Korrektur = neuer Bericht desselben Typs (zweites PDF in HERO, als Nachtrag im Titel). Kein Löschen in HERO.
- **Dokumenttyp 380908:** Wird zuerst in UNB-1149 geprüft. Klappt er nicht, PDF mit Typ „Allgemein“ (380912) wie heute und Dominik Bescheid geben.

## Offen für den Bauenden

- Genaue Texte der Knöpfe und Hinweise in der Oberfläche (Stil wie bestehende App, keine Gedankenstriche, duzen ist intern unüblich: neutral formulieren wie heute).
- Reihenfolge der Punkte innerhalb eines Berichts.
- Wie die String-Felder im Chat dargestellt werden (eine Frage je Wert oder kleine Tabelle), solange es am Handy bedienbar ist.
