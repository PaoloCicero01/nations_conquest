# Nation's Conquest

**Nation's Conquest** è un gioco strategico a turni ambientato sulla mappa delle **20 regioni italiane**. I giocatori schierano le proprie pedine, rinforzano i territori, attaccano le regioni confinanti e scelgono quando adottare una strategia difensiva. Vince l'ultimo giocatore rimasto in partita.

Progetto sviluppato per il corso di **Sviluppo Applicazioni Web (SAW)**.

## Funzionalità principali

- **Partita locale** per **2–4 giocatori** sullo stesso dispositivo, con configurazione di nomi e colori, salvataggio nel browser e possibilità di riprendere una partita.
- **Partita online multiplayer** tramite **Firebase Cloud Firestore**, con aggiornamenti in tempo reale.
- **Lobby online**: creazione di una stanza privata con codice di **6 caratteri**, accesso tramite codice e ricerca di una partita casuale; gestione dei partecipanti e dello stato *pronto*.
- **Autenticazione Firebase**: accesso con Google, registrazione/accesso tramite email e password oppure accesso come ospite (anonimo).
- **Profili giocatore** con statistiche, punti esperienza (XP) e livelli; livello visualizzato anche nella lobby online. Al termine delle partite online vengono gestite ricompense XP (con bonus per il vincitore).
- **Chat durante le partite online**.
- **Mappa interattiva dell'Italia** in SVG, con territori, colori dei giocatori e controlli di navigazione.
- **Tutorial delle regole**, impostazioni audio, musica ed effetti sonori, e notifiche relative al gioco.
- **Progressive Web App (PWA)**: manifest per l'installazione, service worker per la cache delle risorse locali e fallback per le navigazioni quando manca la rete.

> La modalità online richiede una connessione a Internet e l'accesso ai servizi Firebase. La modalità locale memorizza lo stato della partita nel `localStorage` del browser. Il supporto offline della PWA riguarda l'interfaccia e le risorse già memorizzate in cache: non rende disponibili le partite online senza connessione.

## Tecnologie utilizzate

| Tecnologia | Utilizzo |
| --- | --- |
| **React 19** | Interfaccia e componenti dell'applicazione |
| **JavaScript / JSX** | Logica del gioco e interazioni |
| **CSS** | Stili e layout responsive |
| **React Router 7** | Navigazione tra le pagine |
| **Firebase Authentication** | Account Google, email/password e accesso anonimo |
| **Cloud Firestore** | Stanze, sincronizzazione multiplayer, chat e profili |
| **Create React App / react-scripts** | Ambiente di sviluppo e build |
| **Web App Manifest + Service Worker** | Installazione PWA e caching offline |
| **localStorage** | Salvataggio e ripristino delle partite locali |

## Requisiti

- **Node.js** e **npm** installati (preferibilmente una versione LTS recente di Node.js compatibile con le dipendenze del progetto).
- Un browser moderno, per esempio Chrome, Firefox.
- Connessione Internet per l'installazione delle dipendenze, l'autenticazione e il multiplayer online.

## Installazione e avvio in locale

1. Clonare il repository:

   ```bash
   git clone https://github.com/<USERNAME>/nations-conquest.git
   ```

2. Entrare nella cartella del progetto:

   ```bash
   cd nations-conquest
   ```

3. Installare le dipendenze utilizzando il file `package-lock.json`:

   ```bash
   npm ci
   ```

4. Avviare il server di sviluppo:

   ```bash
   npm start
   ```

5. Aprire **http://localhost:3000** nel browser, se non viene aperto automaticamente.

> Sostituire `<USERNAME>` con il nome dell'account GitHub su cui viene pubblicato il progetto.

### Altri comandi disponibili

```bash
npm run build  # Crea la versione di produzione nella cartella build/
npm test       # Avvia il test runner di Create React App
```

La cartella `build/` e la cartella `node_modules/` **non** devono essere caricate nel repository: vengono rigenerate rispettivamente con `npm run build` e `npm ci`.

## Configurazione di Firebase

Il progetto include il file `src/firebase/firebase.js`, contenente la **configurazione client Firebase** usata dall'applicazione. La configurazione fa riferimento al progetto Firebase `nations-conquest` e inizializza:

- **Firebase Authentication** per l'accesso degli utenti;
- **Cloud Firestore** per le stanze e i dati multiplayer.

Per provare le funzioni online è necessario che il progetto Firebase configurato sia disponibile, che i provider di autenticazione usati siano abilitati e che le **regole di sicurezza Firestore** consentano le operazioni previste dall'applicazione. Se si utilizza un progetto Firebase differente, aggiornare `src/firebase/firebase.js` con i dati della relativa applicazione Web e configurarne Authentication, Firestore e i domini autorizzati per l'accesso.

La configurazione Firebase lato client **non equivale a credenziali amministrative**. Non pubblicare account di servizio, chiavi private o altri segreti nel repository.

## Come giocare

### Modalità locale

1. Dalla pagina iniziale selezionare la modalità **locale**.
2. Scegliere il numero di partecipanti (**da 2 a 4**) e assegnare un nome a ogni giocatore.
3. Avviare la partita e seguire la fase di schieramento iniziale.
4. A ogni turno, assegnare i rinforzi e scegliere una strategia di **attacco** oppure **difesa**; quando previsto, è possibile trasferire pedine tra regioni proprie adiacenti.
5. Conquistare i territori avversari fino a rimanere l'unico giocatore con regioni sulla mappa.

Il salvataggio locale permette di riprendere una partita dal medesimo browser, purché i dati del sito non vengano cancellati.

### Modalità online

1. Dalla pagina iniziale selezionare la modalità **online** (richiede la connessione).
2. Accedere con un account oppure utilizzare l'accesso come **ospite**.
3. Indicare il nome del giocatore e scegliere se **creare una stanza**, **entrare tramite codice** o **cercare una partita casuale**.
4. Attendere gli altri giocatori nella lobby e utilizzare il comando per segnalarsi come **pronto** quando disponibile.
5. Giocare a turni nella partita sincronizzata tramite Firestore, con chat integrata.

Le stanze prevedono fino a **4 giocatori**. Per testare il multiplayer occorrono più sessioni/browser oppure più dispositivi, ciascuno con una propria sessione di autenticazione.

### Regole essenziali

- La mappa comprende **20 regioni italiane**.
- Durante il turno si **schierano i rinforzi**, poi si sceglie tra fase **offensiva** e **difensiva**.
- Un attacco può partire da una regione con almeno **2 pedine** verso un territorio avversario adiacente.
- Il punteggio dell'attaccante è `pedine attaccanti + (dado × pedine attaccanti)`.
- Il punteggio del difensore è `pedine difendenti + bonus difesa + (dado × pedine difendenti)`.
- In caso di **pareggio**, vince il difensore.
- Dopo una conquista si trasferiscono pedine nella nuova regione, lasciandone almeno una in quella di partenza.
- La difesa applica un bonus alle proprie regioni, ma non consente di attaccare nello stesso turno.
- La partita termina quando rimane **un solo giocatore** con territori.

Per le formule complete dei rinforzi, delle perdite, dei bonus e dei trasferimenti, consultare la pagina **Tutorial** nell'applicazione (`/tutorial`).

## PWA, modalità offline e notifiche

Il progetto contiene:

- `public/manifest.json`, con nome, icone e modalità di visualizzazione *standalone*;
- `public/service-worker.js`, che gestisce il caching delle risorse interne e un fallback per le pagine;
- `src/serviceWorkerRegistration.js`, che registra il service worker **solo nella build di produzione**;
- `src/utils/notifications.jsx`, con richiesta del permesso e notifiche browser, tra cui gli avvisi per il proprio turno.

Per verificare il service worker e l'installazione della PWA **non è sufficiente `npm start`**, perché il codice registra il service worker solo in produzione. Occorre pubblicare una build di produzione su **HTTPS** oppure servirla in un ambiente locale idoneo (per esempio `localhost`).

Le notifiche dipendono dal supporto del browser e dal permesso concesso dall'utente. Il codice implementa notifiche browser associate agli eventi di gioco, **non un servizio di push remoto garantito quando l'applicazione è completamente chiusa**.

## Struttura principale del progetto

```text
nations-conquest/
├── public/
│   ├── audio/                    # Effetti sonori e musica
│   ├── manifest.json             # Manifest PWA
│   ├── service-worker.js         # Cache e navigazione offline
│   └── index.html
├── src/
│   ├── assets/                   # Mappa SVG e immagini
│   ├── components/               # Componenti UI, mappa, chat, profilo
│   ├── context/                  # Contesti autenticazione e audio
│   ├── data/                     # Dati di gioco e territori
│   ├── firebase/                 # Configurazione, stanze, partite, profili
│   ├── hooks/                    # Hook per audio e notifiche
│   ├── pages/                    # Home, lobby, gioco, tutorial, profilo...
│   ├── utils/                    # Salvataggi, notifiche e utilità
│   ├── App.js                    # Routing dell'applicazione
│   └── index.js                  # Entry point React
├── firebase.json                # Configurazione Firebase Hosting
├── package.json
├── package-lock.json
└── README.md
```

## Distribuzione

È presente `firebase.json`, configurato per pubblicare la cartella `build/` tramite **Firebase Hosting** e reindirizzare le rotte della SPA a `index.html`.

Per generare la versione distribuibile:

```bash
npm run build
```

L'eventuale pubblicazione con Firebase Hosting richiede l'accesso a un progetto Firebase autorizzato e la Firebase CLI configurata. La presenza di `firebase.json` **non dimostra, da sola, che l'applicazione sia già pubblicata online**.

## Prova del progetto per la valutazione

La **modalità locale** è utilizzabile senza creare un account. Per la **modalità online** è presente l'opzione **«Continua come guest»**, che utilizza l'autenticazione anonima Firebase: in presenza di una configurazione Firebase funzionante non è quindi necessario fornire credenziali personali per eseguire una prova di base.

Per testare la lobby e il multiplayer aprire l'applicazione in due sessioni distinte e accedere con utenti differenti. Le funzionalità online dipendono dall'accessibilità del backend Firebase e dalle relative autorizzazioni.

**Nota per la consegna:** prima dell'invio, verificare che il repository sia pubblico, che la configurazione Firebase funzioni per un nuovo visitatore e che siano documentate eventuali credenziali di prova richieste dal docente.

## Autore e contesto

Progetto per l'esame di **Sviluppo Applicazioni Web (SAW)**.

<!-- Prima della consegna: aggiungere qui nome, cognome, matricola e, se disponibile, URL dell'app online. -->
