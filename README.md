# Heldenwerker Planungstool

Besichtigungen als Chat mit Claude festhalten, Ergebnis ins HERO-Projekt. Design: `docs/Planungstool Design.md`, Bauplan: `docs/superpowers/plans/2026-11-17-planungstool.md`.

## Starten (lokal)

    npm install
    PLANUNG_LOKAL=1 npm start      # http://127.0.0.1:8790

Schlüssel liegen außerhalb des Repos: `~/.hero/graphql.env` (`HERO_GRAPHQL_KEY=`), `~/.anthropic/planung.env` (`ANTHROPIC_API_KEY=`).
Daten (Planungen, Feedback) liegen in `daten/` und werden nie committet.

## Tests

    npm test
