# HERO: Dateien hochladen (Stand 24.11.2026)

Der Weg kommt vom HERO-Support (Antwort vom 24.11.2026). Er ist im Testprojekt UNB-1149 geprüft.

1. **Datei hochladen (REST):** `POST https://login.hero-software.de/app/v8/FileUploads/upload`, `multipart/form-data`, Feld `file`, Header `x-auth-token: <Schlüssel>` (nicht Bearer). Eine Datei pro Anfrage. Die Antwort enthält `data.uuid`, das ist die `file_upload_uuid`.
2. **Foto zuordnen (GraphQL):** `upload_image(target: project_match, target_id, file_upload_uuid, image_category: "Besichtigung")`. Das Foto erscheint im Projekt unter Bilder.
3. **PDF zuordnen (GraphQL):** `upload_document(target: project_match, target_id, file_upload_uuid, document: { document_type_id })`. Wir nehmen den Dokumenttyp „Allgemein“ (380912). Die Liste gibt `{ document_types { id name base_type } }`.

**Grenzen:** höchstens etwa 25 MB pro Datei, 30 Sekunden Timeout pro Anfrage, lieber nacheinander als viele gleichzeitig.

**Im Tool:** `hero.hochladen()` macht Schritt 1, `inHero()` in `server/hero-dateien.mjs` macht Schritt 2 oder 3 über den Schreibschutz. Beim Senden gehen alle Fotos, angehängte PDFs und das Besichtigungsprotokoll ins HERO-Projekt. Videos und Sprachnotizen bleiben auf Drive, ihre Links stehen im Protokoll. Der Logbuch-Eintrag kommt erst, wenn alles drin ist. Was schon in HERO ist, steht in `planung.gesendet.hero` und wird nicht doppelt geschickt.

**Logbuch:** `add_logbook_entry` (target `project_match`), sichtbar in `project_match.histories`, nicht in `project_histories`.

**Dateiordner:** `FileUploadFolder_CreateFileUploadFolder` legt firmenweite Ordner an, nicht pro Projekt. Das lassen wir, bis jemand bei Heldenwerker zustimmt.
