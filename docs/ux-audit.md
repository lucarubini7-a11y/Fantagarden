# Audit design system — "cartellino" (agosto 2026)

Verifica finale del sistema di design unificato applicato a tutta l'app
(token in `web/src/design-tokens.css`, applicati a tracker asta, badge stato
giocatori, pannello AI advisor, consigli calendario, form Impostazioni,
export/import, e al resto delle viste: Sintesi, Giocatori, Squadre, Piazzati,
Simulazione, Obiettivi).

Metodo: lettura del codice sorgente (CSS/JSX), calcolo dei contrasti colore
sulle coppie foreground/background effettivamente usate nel codice, e verifica
funzionale con Playwright (Chromium headless) su viewport desktop (1440px),
mobile (375px) e "reflow" a 720px (equivalente a zoom 200% su uno schermo
1440px comune).

## 1. Accessibilità (WCAG 2.1 AA)

| Elemento | Problema | Criterio WCAG | Gravità | Fix |
|---|---|---|---|---|
| Badge stato giocatore (infortunio/diffida/dubbio) | Versione precedente mostrava emoji+testo colorato senza garanzia di un nome accessibile separato dal colore | 1.4.1 Use of Color, 4.1.2 Name Role Value | Media | **Risolto**: badge ridisegnato come "cartellino" puro colore+forma (`role="img"` + `aria-label` sempre presente, es. `aria-label="Infortunato"`), niente più informazione affidata al solo colore |
| `--color-yellow-card-text` | Rischio di uso accidentale di testo bianco su sfondo giallo (contrasto 1.84:1, illeggibile) | 1.4.3 Contrast (Minimum) | Alta (se presente) | **Verificato**: grep su tutto `web/src/*.css` — ogni uso di `background: var(--color-yellow-card)` è sempre abbinato a `color: var(--color-yellow-card-text)` (mai bianco). Nessuna occorrenza errata trovata |
| `.up` / `.down` (frecce quotazione in `.player-detail`, sfondo `--color-pitch`) | Colori isolati (`#bdffc9`, `#ffbdbd`) non derivati dai token | 1.4.3 Contrast (Minimum) | Bassa | **Verificato conforme**: contrasto calcolato su `--color-pitch` (#1B5E3A) = 6.76:1 e 4.90:1, entrambi > 4.5:1 richiesto per testo normale. Lasciato come caso isolato documentato (concetto di "tendenza", non fa parte della semantica cartellino), non serve alcuna modifica |
| Nav principale (`.app-header nav button`) | Altezza reale ~38px (padding 10px + testo), sotto la soglia target-tocco | 2.5.5 Target Size (AAA in WCAG 2.1; requisito di progetto comunque richiesto) | Media | **Risolto**: aggiunto `min-height:44px` |
| Cursori doppio-range in Impostazioni (fasce difensive) | Diametro 16–22px, sotto 44px | 2.5.5 Target Size (AAA in WCAG 2.1) | Bassa | **Parzialmente risolto**: ingranditi a 20–26px in una passata precedente; restano sotto 44px. Un cursore `<input type=range>` nativo non può crescere oltre un certo punto senza perdere precisione di trascinamento — vedi "Problemi aperti" |
| Focus da tastiera (tutti i componenti) | L'outline blu di default del browser non è coerente con la palette e in alcuni punti rischia di sparire su sfondi scuri | 2.4.7 Focus Visible | Media | **Risolto**: regola globale `:focus-visible{outline:3px solid var(--focus-ring-color)}` in `design-tokens.css`, colore = `--color-active-nomination`. Unica eccezione controllata: i cursori range spostano l'outline dal track (`outline:none`) al thumb reale via `::-webkit-slider-thumb`/`::-moz-range-thumb`, verificato che l'anello resti comunque visibile |
| Banner bozza Impostazioni (`.ls-draft-banner`) | Deve annunciarsi a chi usa screen reader senza richiedere focus manuale | 4.1.3 Status Messages | — | **Verificato conforme**: `role="status"` (aria-live implicito "polite") |
| Errori di validazione Impostazioni (`.ls-errors`) | Idem, ma con priorità maggiore (blocca il salvataggio) | 4.1.3 Status Messages | — | **Verificato conforme**: `role="alert"` (aria-live implicito "assertive") + `tabIndex="-1"` per portare il focus lì programmaticamente |
| Messaggio di stato asta (conferma/errore assegnazione) | Deve aggiornarsi senza interrompere il flusso | 4.1.3 Status Messages | — | **Verificato conforme**: `role="status" aria-live="polite"` esplicito |
| Pannello AI advisor (stato di caricamento / non disponibile) | Idem | 4.1.3 Status Messages | — | **Verificato conforme**: `role="status"` su entrambi gli stati |
| Pulsanti "Esporta asta" / "Importa asta" | L'import usa un `<input type="file">` nascosto | 2.1.1 Keyboard | — | **Verificato conforme**: l'input è attivato da un `<button>` reale via ref (`Tab` lo raggiunge, `Invio`/`Spazio` lo attiva); il file input non è mai l'unico modo per attivare l'azione |
| Frecce carosello mobile tracker (`‹`/`›`) | Devono essere raggiungibili da tastiera e annunciare lo stato disabilitato ai margini | 2.1.1 Keyboard, 4.1.2 Name Role Value | — | **Verificato conforme**: `<button>` reali con `aria-label="Squadra precedente/successiva"` e attributo nativo `disabled` al primo/ultimo elemento |
| Etichette form Impostazioni | Rischio di campi identificati solo da `placeholder` (non letto in modo affidabile da tutti gli screen reader) | 1.3.1 Info and Relationships, 3.3.2 Labels or Instructions | — | **Verificato conforme**: ogni input in `league-settings.jsx` è già avvolto in un `<label>` reale, zero occorrenze di input con solo `placeholder` |
| Griglia squadre tracker asta a zoom ~200% (reflow a ~720px CSS px) | La griglia a 4 colonne non passa al carosello (soglia attuale 600px) e diventa compressa | 1.4.10 Reflow (soglia formale a 400%/320px, non raggiunta qui) | Bassa | **Aperto, non bloccante**: nessun overflow orizzontale né testo tagliato/sovrapposto a 720px, ma le colonne sono strette. Vedi "Problemi aperti" |
| Nav principale sotto ~900px | Va in scroll orizzontale senza alcuna indicazione visiva (nessuna freccia/sfumatura); il browser scrolla automaticamente la tab attiva in vista quando riceve focus, lasciando la tab precedente parzialmente tagliata al bordo | 1.4.10 Reflow, 2.4.11 Focus Not Obscured (WCAG 2.2, citato per completezza) | Bassa | **Aperto**: vedi "Problemi aperti" |
| `key` mancante in `roles.map()` per "Posti P/D/C/A" (Impostazioni) | Non è un problema di accessibilità in senso stretto, ma genera un warning React che segnala un rischio reale di stato disallineato tra i controlli in caso di riordino | — (qualità del codice, trovato durante il test) | Bassa | **Risolto**: aggiunto `key: role` alla chiamata `input(...)` mancante (le altre chiamate `roles.map()` nello stesso file avevano già la key) |

## 2. Coerenza del design system

Verifica: nessun colore esadecimale o spaziatura hardcoded rimasta al di fuori
dei token di `design-tokens.css`, salvo le eccezioni sotto — ognuna
documentata con un commento nel file CSS di appartenenza.

| Eccezione | File | Perché non è stata forzata nel sistema |
|---|---|---|
| `.role`/`.P .D .C .A` e `.ra-role`/`.role-P .role-D .role-C .role-A` | `style.css`, `random-auction.css` | Etichette categoriche di ruolo (Portiere/Difensore/Centrocampista/Attaccante): un sistema di colori arbitrario ma consolidato nel prodotto, concettualmente distinto dalla semantica cartellino (ok/warning/errore/nomina attiva). Forzarlo nella palette a 3 colori del cartellino farebbe perdere la distinzione visiva tra i 4 ruoli |
| `.up` / `.down` | `style.css` | Frecce di tendenza quotazione su sfondo scuro (`--color-pitch`); concetto di "in salita/in calo", non di stato cartellino. Contrasto verificato (vedi tabella sopra) |
| `--color-fanta-bg/panel/border/text/muted/accent` in `@theme` | `index.css` | Tailwind genera le utility (`bg-fanta-bg`, ecc.) leggendo valori letterali da `@theme` in fase di build; un `var()` verso `design-tokens.css` lì dentro non verrebbe risolto correttamente da Tailwind. Valori duplicati manualmente e tenuti sincronizzati con i token equivalenti, uso limitato a `<html>`/`<body>` |
| `--color-pitch-hover` | `design-tokens.css` | Non è un'eccezione ma un'**estensione**: due punti (`.data-status .regenerate-data:hover`, `.ls-upload:hover`) avevano lo stesso verde scurito `#164a2e` hardcoded e duplicato. Concetto riutilizzabile (stato hover su bottoni pieni `--color-pitch`) → promosso a token con `color-mix()` invece di lasciarlo come valore isolato |

Nessun'altra occorrenza di colore hardcoded è sopravvissuta alla verifica
(`grep -rnoE "#[0-9a-fA-F]{3,6}" web/src/*.css`, esclusi i casi in tabella e
`design-tokens.css` stesso).

## 3. Revisione copy UX

**Terminologia "crediti" vs "budget"**: verificata l'ipotesi che fossero usati
come sinonimi in modo incoerente. Non è così — sono due concetti distinti e
l'uso è coerente:
- **"crediti"** = importo assoluto nella valuta di lega (Crediti iniziali,
  Crediti rimasti, prezzo "31 crediti").
- **"budget"** = un concetto derivato: "Budget spendibile" è i crediti
  rimasti al netto della riserva minima per gli slot ancora da riempire;
  "Budget Portieri/Difensori/... (%)" è la ripartizione percentuale del
  totale crediti tra i reparti.

Nessuna modifica necessaria: rinominare avrebbe cancellato una distinzione
utile durante un'asta dal vivo (sapere quanto hai vs. quanto puoi
effettivamente permetterti di spendere sono due numeri diversi e devono
restare due parole diverse).

**Conferme distruttive** ("Nuova asta", "Importa asta"): già seguono la
struttura consigliata — cosa succede, perché è sicuro procedere (la sessione
corrente resta salvata), poi la domanda. Nessuna modifica.

**Messaggi di errore** (form Impostazioni, asta): già nella forma "cosa è
successo + perché", es. *"Squadra 1 può spendere al massimo 726 crediti: deve
conservarne N per completare la rosa."* Nessuna modifica.

**Stati vuoti**: pattern coerente "Nessun/Nessuna ..." in tutta l'app.
Nessuna modifica.

### Before/After

| Elemento | Prima | Dopo | Motivo |
|---|---|---|---|
| Badge stato giocatore | Testo visibile abbreviato nel badge stesso (es. emoji + "INF") | Nessun testo visibile; significato affidato a `aria-label="Infortunato"` / `"Diffidato"` / `"In dubbio"` + colore/forma a cartellino | Il colore del cartellino è già un codice universalmente noto a chi segue il calcio — non serve una legenda testuale sopra il badge, e il testo nascosto resta comunque disponibile per screen reader |
| Banner "bozza trovata" (Impostazioni) | Colore verde/lime (stesso tono di stato "ok") | Colore giallo (`--color-yellow-card`) | Un avviso ("hai una bozza non salvata, vuoi ripristinarla?") è semanticamente un warning, non una conferma di stato positivo — allineato alla convenzione cartellino: giallo = attenzione, non verde = tutto ok |

## Riepilogo

**Problemi critici trovati e già risolti in questa passata**: 6 — badge
stato senza nome accessibile indipendente dal colore, target-tocco nav
principale sotto 44px, outline di focus non coerente con la palette in tutta
l'app, due duplicazioni hardcoded dello stesso verde hover (promosse a
token), `key` React mancante in Impostazioni (posti ruolo), banner bozza con
colore semanticamente scorretto (verde invece di giallo).

**Problemi rimasti aperti (con motivazione)**: 2, entrambi di gravità bassa
e non bloccanti:
1. **Cursori doppio-range sotto 44px** (Impostazioni, fasce difensive): un
   `<input type="range">` nativo ingrandito oltre ~26px comincia a rendere
   impreciso il trascinamento fine dei valori; servirebbe sostituirlo con un
   componente custom (fuori scopo di una passata di soli token/CSS).
2. **Nav principale senza affordance di scroll sotto ~900px**: sotto quella
   soglia la barra di navigazione va in scroll orizzontale senza frecce o
   sfumatura, e il browser porta automaticamente in vista la tab attiva alla
   pressione, lasciando talvolta la tab precedente tagliata al bordo. Non è
   un problema introdotto da questa passata (la nav era già a scroll
   orizzontale prima), e risolverlo bene (freccia dedicate o nav che va a
   capo) è una scelta di layout che va oltre la sostituzione di colori/token
   richiesta qui.

Nessun'altra eccezione di palette o spaziatura è stata trovata al di fuori di
quelle documentate nella sezione 2.
