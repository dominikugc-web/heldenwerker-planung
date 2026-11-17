import { fehler } from "./router.mjs";

// Dateien und Logbuch in HERO. Stand 17.11.2026: upload_image/upload_document brauchen eine
// file_upload_uuid, für die HERO keinen dokumentierten Upload-Weg hat (docs/hero-upload.md).
// shortcut: dateiHochladen ist abgeschaltet, Fotos und PDFs gehen bis zur Antwort des HERO-Supports als Link; einschalten, sobald der Weg bekannt ist.
export function erstelleDateien({ schreiber }) {
  return {
    uploadMoeglich: false,
    async dateiHochladen() {
      throw fehler(501, "HERO nimmt über die Schnittstelle noch keine Dateien an");
    },
    async logbuchEintrag(projektId, text) {
      const e = { target: "project_match", target_id: Number(projektId), custom_text: text };
      return (await schreiber.heroSchreiben(`mutation($e:LogbookEntryInput){ add_logbook_entry(logbook_entry:$e){ id } }`, { e }, projektId)).add_logbook_entry;
    },
  };
}
