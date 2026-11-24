# Betrieb

## Server starten

- **Im Hintergrund (empfohlen):** Doppelklick auf `start-hintergrund.vbs` (oder die Desktop-Verknüpfung „Heldenwerker Planung“). Kein Fenster, Ausgaben in `daten/server.log`.
- **Beenden:** `stop.cmd` (oder Verknüpfung „Heldenwerker Planung stoppen“).
- **Mit Fenster (zum Zuschauen):** `start.cmd`.

Der Server lauscht nur auf `127.0.0.1:8790`. Läuft schon einer, beendet sich ein zweiter Start sofort wieder.
Automatisch nach dem Anmelden: Verknüpfung nach `shell:startup` kopieren.
Schlüssel: `~/.hero/planung.env` (`HERO_GRAPHQL_KEY=`, `PLANUNG_INHABER=` Tailscale-Login des Inhabers), `~/.anthropic/planung.env` (`ANTHROPIC_API_KEY=`).
Daten: Ordner `daten/` (Planungen, Fotos, Feedback). Nicht im Repo.

## Erreichbar machen (einmalig, über Tailscale)

    tailscale serve --bg --https=10443 http://127.0.0.1:8790

Dann ist die App unter `https://<pc-name>.<tailnet>.ts.net:10443` erreichbar, nur für Geräte im eigenen Tailnet.
Auf der GitHub-Seite trägt man genau diese Adresse in den Einstellungen ein.

## Oberfläche veröffentlichen

    ./veroeffentlichen.sh

Legt `web/` auf den Branch `gh-pages`. Live unter https://dominikugc-web.github.io/heldenwerker-planung/

## Hinweise

- Chrome am PC fragt beim ersten Verbinden von der GitHub-Seite nach „Lokales Netzwerk“. Erlauben. Safari am iPhone fragt nicht.
- Echtbetrieb seit 24.11.2026: Der Server schreibt Fotos, Protokoll und Logbuch direkt in die gewählten Kundenprojekte. send_mail und Löschen bleiben gesperrt. Mit `PLANUNG_TESTMODUS=1` (so läuft die Vorschau mit daten-test) geht alles nur nach UNB-1149 und in Projekte, die die App mit „TEST“ angelegt hat. Neue Projekte aus der App heißen im Echtbetrieb wie eingegeben, im Testmodus mit „TEST“ davor.
