# fishertiger - A Fantacalcio Auction Advisor

Local-first advisor for a Classic Fantacalcio Serie A auction. It builds player
projections, supports a live auction, replays randomized auctions, and runs a
season-level Monte Carlo simulation using the configured league rules.

## License

- Software: [MIT](LICENSE)
- Structured base data in `data/raw/`: [CC BY 4.0](DATA_LICENSE.md)
- Model choices: [MODEL.md](MODEL.md)
- Input data and private calendar: [DATA_SOURCES.md](DATA_SOURCES.md)

## Requirements

- Python 3.10+
- Node.js 22+

```bash
python -m venv .venv
.venv/bin/pip install -r requirements.txt
cd web && npm install
```

## Run Locally

Start the local API from the repository root:

```bash
.venv/bin/python -m advisor.server --host 127.0.0.1 --port 8000
```

In another terminal, start Vite:

```bash
cd web
npm run dev
```

Open the Vite URL. On first launch the application opens **Impostazioni**.
Upload your private `calendario_lega.xlsx`, verify participants and sources,
then use **Genera dati**. Generated datasets and simulations stay local under
`data/processed/<profile_id>/<season>/`.

## Inputs And Profiles

`config/default_profile.json` is the single public default profile. The API
serves it to the client; there is no duplicate browser profile.

The repository includes base inputs in `data/raw/`. The only excluded input is
`data/raw/calendario_lega.xlsx`, because it identifies a user's fantasy league.
It must be uploaded locally. The profile source declarations identify the
expected files and seasons.

The Serie A input is always a 20-team, 38-matchday, 380-match calendar. The
fantasy league can use a shorter configured interval through
`fantasy_start_matchday`, `fantasy_end_matchday`, and `fantasy_matchdays`.

## CLI

The UI is the normal workflow. These commands are useful for local automation
after a matching private calendar has been supplied:

```bash
.venv/bin/python -m advisor.pipeline --profile config/default_profile.json --raw-dir data/raw --output-dir data/processed
.venv/bin/python -m advisor.simulate --profile config/default_profile.json --raw-dir data/raw --output-dir data/processed --iterations 1000 --seed 202627
```

## AI Advisor (opzionale)

Nella scheda **Asta live**, quando un giocatore è selezionato, è disponibile un
bottone opzionale "🤖 Chiedi il consiglio AI" che chiede a Claude un secondo
parere in linguaggio naturale. Non sostituisce il consiglio numerico calcolato
localmente dal Web Worker (sempre disponibile, anche offline): è un livello
aggiuntivo, richiesto esplicitamente un click alla volta, mai in automatico a
ogni chiamata d'asta.

Per attivarlo, esporta una chiave Anthropic prima di avviare il server:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
.venv/bin/python -m advisor.server --host 127.0.0.1 --port 8000
```

Senza la chiave configurata il bottone mostra semplicemente "Consiglio AI non
configurato": nessun errore, nessun blocco del resto del tool. La chiave vive
solo nell'ambiente del backend Python: il browser chiama sempre e soltanto
`/api/advisor-live` sul server locale, mai l'API di Anthropic direttamente.
Non committare mai la chiave; usa una variabile d'ambiente o un `.env` locale
(già escluso da git, vedi `.env.example`).

## Stato giocatori / infortuni (opzionale)

Nella scheda **Asta live** compare un piccolo "cartellino" colorato (nessun
testo, solo colore e forma — rosso per infortunato, giallo per diffidato,
giallo a righe per in dubbio, con l'informazione comunque disponibile a chi
usa uno screen reader tramite `aria-label`) accanto al nome di ogni giocatore
interessato, nella ricerca, nelle rose delle squadre e nei consigli per
reparto. Senza nulla di configurato non cambia nulla: nessun badge, nessun
errore, il tool si comporta esattamente come prima.

Per attivarlo, esporta **una sola** delle due chiavi prima di avviare il
server (Highlightly viene provato per primo; se assente si passa
automaticamente ad API-Football, ma solo dopo aver verificato che la
stagione richiesta abbia davvero la copertura infortuni):

```bash
export HIGHLIGHTLY_API_KEY=...
# oppure
export API_FOOTBALL_API_KEY=...
.venv/bin/python -m advisor.server --host 127.0.0.1 --port 8000
```

Lo stato viene richiesto una volta per squadra di Serie A (20 chiamate
totali, mai per singolo giocatore) e tenuto in cache locale per 6 ore
(`data/processed/player_status_cache.json`) per restare ampiamente sotto il
limite di 100 richieste/giorno dei piani gratuiti. Il bottone "Aggiorna ora"
nella scheda Asta forza un refresh immediato bypassando la cache.

Nota: gli endpoint esatti dei due provider (percorsi, parametri, forma della
risposta) sono scritti da documentazione pubblica ma non è stato possibile
riverificarli dal vivo in questo ambiente di sviluppo (rete in uscita verso
quei domini bloccata). Se al primo utilizzo con una chiave reale i dati non
arrivano, controlla `advisor/player_status.py` (funzioni `_fetch_highlightly`
e `_fetch_api_football`) contro la documentazione corrente del provider: il
resto del sistema (cache, endpoint locale, badge, fallback) non dipende da
quei dettagli ed è già testato.

## Loghi squadre Serie A (opzionale)

Il tracker, le rose e i consigli per reparto mostrano il logo di ogni
squadra di Serie A accanto al suo nome (fallback automatico a un cerchietto
con le iniziali per qualunque squadra senza logo — mai un'icona rotta).

I loghi vengono da [TheSportsDB](https://www.thesportsdb.com/) (chiave di
test pubblica `3`) tramite uno script standalone, **non** dal server live:

```bash
.venv/bin/python advisor/fetch_team_badges.py
```

Va rilanciato **una tantum**, non ad ogni avvio del server: dopo il setup
iniziale del progetto, o in seguito solo se cambia l'elenco delle squadre di
Serie A in `data/raw/squadre.csv` (promozioni/retrocessioni). Scrive i PNG
(ridimensionati a un massimo di 128x128) in `web/public/team-badges/` e la
mappa `web/src/team-badges.json`: entrambi vanno committati come asset
statici, non rigenerati ad ogni build.

Lo script stampa un riepilogo tipo `18/20 loghi scaricati, mancanti: ...`.
Se una squadra manca perché il suo nome su TheSportsDB non combacia con
quello nel CSV, lo script stampa i nomi esatti che ha provato: aggiungi
l'alias giusto alla tabella `ALIASES` in cima allo script e rilancialo. Le
squadre ancora mancanti restano assenti da `team-badges.json` (nessun
errore, nessun blocco: il frontend mostra il fallback a iniziali per loro).

## Deploy pubblico

Il tool resta pensato per un gruppo chiuso (es. la tua lega di 6 amici), non
per il pubblico generico: l'unica protezione è una password condivisa, non un
sistema di account. Passi per un deploy pubblico (backend su Render,
frontend su Vercel):

1. **Deploy del backend su Render** usando `render.yaml` nella root del
   repo (Blueprint). Non è stato possibile riverificare dal vivo in questo
   ambiente di sviluppo la sintassi più recente del Blueprint contro
   render.com (rete in uscita verso quel dominio bloccata): prima del primo
   deploy, controlla `render.yaml` contro la documentazione Render corrente
   (es. se `env: python` è ancora il nome campo giusto). Al primo deploy
   Render crea il servizio ma lascia vuote le variabili d'ambiente marcate
   `sync: false`: vai nella dashboard Render
   del servizio → Environment e imposta manualmente:
   - `APP_SHARED_PASSWORD` — la password condivisa con gli amici (obbligatoria
     per un deploy pubblico, vedi sotto).
   - `ANTHROPIC_API_KEY` — per l'AI Advisor (opzionale, ma vedi la checklist
     sul limite di spesa).
   - `HIGHLIGHTLY_API_KEY` (o `API_FOOTBALL_API_KEY`) — per lo stato
     infortuni/diffide (opzionale).
   - `ALLOWED_ORIGINS` — l'URL Vercel del frontend, es.
     `https://fanta-tuonome.vercel.app` (più `http://localhost:5173` se vuoi
     continuare a sviluppare in locale contro lo stesso backend).
2. **Deploy del frontend su Vercel** puntando alla cartella `web/`. Imposta
   la variabile d'ambiente `VITE_LOCAL_API_BASE` sull'URL Render del backend
   (vedi `web/.env.production.example`).
3. **Attenzione**: senza `APP_SHARED_PASSWORD` impostata, il backend resta
   raggiungibile da chiunque conosca l'URL, senza nessuna password (lo stesso
   vale per `ALLOWED_ORIGINS` non impostata: il CORS resta permissivo). Va
   bene così **solo** in locale o in un Codespace personale — non lasciarlo
   così su un servizio con un URL pubblico.

## Checklist prima di condividere il link

Controlli manuali da fare tu, dopo il deploy, prima di mandare il link agli
amici (non automatizzabili da codice):

- Apri il link in una scheda in incognito e verifica che chieda la password.
- Prova una password sbagliata e verifica che dia un errore chiaro.
- Apri la console del browser (tab Network) e verifica che non ci siano
  errori CORS mentre usi l'app.
- Prova a chiamare un endpoint API direttamente dal browser senza aver
  inserito la password (deve rispondere 401).
- Imposta un limite di spesa mensile sulla chiave Anthropic da
  [console.anthropic.com](https://console.anthropic.com), dato che ora l'app
  è raggiungibile da più persone contemporaneamente.
- Condividi password e link su canali/messaggi separati, non insieme.
- Il piano gratuito Render "addormenta" il backend dopo 15 minuti di
  inattività: apri il link qualche minuto prima di iniziare l'asta per farlo
  svegliare in anticipo.

## Verification

```bash
.venv/bin/python -m pytest
cd web && npm test && npm run build
```
