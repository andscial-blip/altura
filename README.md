# Altura

Piattaforma personale di sport, salute e performance. *Know your edge.*

PWA Next.js su Vercel (piano gratuito), dati nello schema `sport` del progetto Supabase di Cairn, isolato con un ruolo dedicato.

## Architettura

| Livello | Scelta | Note |
|---|---|---|
| Interfaccia | Next.js 16 (App Router), React 19, PWA | Grafici SVG resi sul server, mappa MapLibre + OpenFreeMap (gratuita, senza chiave) |
| Accesso | Passkey (WebAuthn) + cookie di sessione firmato | Nessuna password; primo dispositivo con `SETUP_TOKEN` |
| Database | Postgres Supabase, schema `sport` | Ruolo `sport_app`: vede solo `sport`, RLS su ogni tabella, nessun permesso su Cairn |
| Sincronizzazioni | Funzioni Vercel: all'apertura dell'app (`/api/sync`) e cron giornaliero (`/api/cron/sync`) | Tempo massimo per esecuzione; il lavoro rimasto riprende alla volta successiva |
| Garmin | Garmin Connect Personal API (accesso personale ufficiale) | Attività, file FIT originali, metriche giornaliere |
| Runna | Feed iCal ufficiale (sola lettura) | Runna non ha API pubbliche: nessuna API viene simulata |
| Apple Salute | Comandi Rapidi sull'iPhone → `POST /api/ingest/health` con token | Token salvato solo come impronta SHA-256 |
| Strava | API v3 con OAuth del proprietario (`activity:read_all`) | Serve per lo storico pre-Garmin; le uscite doppie si fondono (Garmin prevale), tracciati Strava solo dove Garmin manca. Token cifrati, revoca da Impostazioni |
| Domande sui dati | Claude con il connettore Supabase | Nessun dato inviato da Altura a servizi di AI |

## Modello dati

- `activities`: un'attività per uscita reale; i campi sono **ricalcolati** dalle fonti collegate.
- `activity_sources`: per ogni fonte il record originale (`raw`, mai modificato), i valori normalizzati (`norm`), modalità di acquisizione e data.
- Gerarchia delle fonti per i campi: manuale > Garmin > Strava > Apple Salute > Runna. Una correzione manuale è una fonte in più, non una sovrascrittura.
- Deduplicazione: stessa famiglia di sport e inizio entro 3 minuti; Runna collega direttamente l'attività Garmin tramite l'id che riporta.
- `daily_metrics`: una riga per (giorno, metrica, fonte); `metric_catalog` dichiara unità, tipo (misurato, stima, calcolato) e gerarchia.
- `change_log`: ogni modifica a attività e sedute programmate.
- `planned_workouts`: sedute Runna con storico degli spostamenti di data.

## Sicurezza

- Segreti solo nelle variabili d'ambiente di Vercel: `DATABASE_URL`, `SESSION_SECRET`, `SETUP_TOKEN`, `CRON_SECRET`, `GARMIN_API_KEY`, `RUNNA_ICS_URL`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`. Mai nel codice, nel browser o nei registri.
- Il token Garmin derivato e i token OAuth Strava sono salvati cifrati (AES-256-GCM).
- Dati Strava: visibili solo al proprietario, mai usati per addestrare modelli (Strava API Agreement).
- I messaggi di errore vengono ripuliti da chiavi, token e indirizzi con parametri prima di essere salvati.
- Zone private: i punti GPS entro il raggio non arrivano mai al browser.
- Intestazioni di sicurezza e CSP rigida (nessuno script di terze parti).

## Sviluppo e test

```bash
npm ci
npm test                    # test unitari
TEST_DATABASE_URL=... npm test   # anche i test d'integrazione su un Postgres con db/001 e db/002
npm run build
```

I test d'integrazione usano lo schema reale su Postgres e simulano solo le risposte esterne (Garmin, Runna) nel loro formato.

## Migrazioni

`db/001_sport_schema.sql`, `db/002_norm_and_backfill.sql`, eseguite sul progetto Supabase senza toccare la cronologia delle migrazioni di Cairn.
