# HERO: Dateien hochladen (Stand 17.11.2026)

**Ergebnis: Kein dokumentierter Weg.** Die Mutationen `upload_image(file_upload_uuid, target, target_id, image_category)` und `upload_document(document, file_upload_uuid, target, target_id)` gibt es. Sie hängen aber nur eine Datei an, die HERO schon kennt. Wie eine neue Datei zu ihrer `file_upload_uuid` kommt, steht weder in der API-Doku (hero-software.de/api-doku, GraphQL-Guide, Lead-API) noch im Schema. Es gibt keine Mutation zum Erzeugen eines Uploads. Das Hilfe-Center lädt nur mit JavaScript.

Interne Adressen der HERO-Web-App haben wir nicht ausprobiert, weil der Schlüssel Vollzugriff hat und solche Adressen sich ohne Ankündigung ändern können.

**Geht:** Logbuch-Einträge per `add_logbook_entry` (target `project_match`), echt geprüft im Testprojekt (Eintrag 138140121). Sichtbar in `project_match.histories`, nicht in `project_histories`.

**Bis zur Antwort des HERO-Supports:** Fotos und PDFs gehen wie Videos auf Google Drive. Ins Logbuch kommt die Monteur-Zusammenfassung mit den Links. `server/hero-dateien.mjs` meldet `uploadMoeglich: false`.

**Dateiordner:** `FileUploadFolder_CreateFileUploadFolder` legt firmenweite Ordner an, nicht pro Projekt. Das lassen wir, bis jemand bei Heldenwerker zustimmt.
