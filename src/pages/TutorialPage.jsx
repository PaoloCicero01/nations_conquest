import { useLocation, useNavigate } from "react-router-dom";
import useGameAudio from "../hooks/useGameAudio";
import "./TutorialPage.css";

const CLICK_SOUND = "/audio/click.wav";

function TutorialPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { playEffect } = useGameAudio();
  const returnTo = location.state?.returnTo ?? "/";
  const reopenPauseMenu = location.state?.reopenPauseMenu ?? false;

  function handleBack() {
    playEffect(CLICK_SOUND);
    navigate(returnTo, {
      state: {
        openPauseMenu: reopenPauseMenu,
      },
    });
  }

  function handleStartLocalGame() {
    playEffect(CLICK_SOUND);
    navigate("/local-setup");
  }

  return (
    <main className="tutorial-page">
      <section className="tutorial-container">
        <header className="tutorial-header">
          <button type="button" className="tutorial-back-button" onClick={handleBack}>← Torna indietro</button>
          <p className="tutorial-label">Nation&apos;s Conquest</p>
          <h1>Regole del gioco</h1>
          <p>Conquista tutte le regioni italiane, elimina gli avversari e diventa l&apos;unico giocatore rimasto in partita.</p>
        </header>
        <section className="tutorial-section">
          <span className="tutorial-number">1</span>
          <div>
            <h2>Preparazione della partita</h2>
            <p>La partita locale prevede quattro giocatori. All&apos;inizio, le 20 regioni italiane vengono distribuite casualmente: ogni giocatore riceve 5 regioni.</p>
            <p>Ogni regione parte con 0 pedine e ogni giocatore riceve 25 pedine da schierare.</p>
          </div>
        </section>
        <section className="tutorial-section">
          <span className="tutorial-number">2</span>
          <div>
            <h2>Schieramento iniziale</h2>
            <p>Lo schieramento avviene in cinque giri. In ciascun giro, ogni giocatore posiziona 5 pedine nelle proprie regioni.</p>
            <div className="tutorial-rule-box">Ogni regione deve contenere almeno una pedina.</div>
            <p>Quando tutte le 25 pedine sono state posizionate da tutti i giocatori, inizia la partita vera e propria.</p>
          </div>
        </section>
        <section className="tutorial-section">
          <span className="tutorial-number">3</span>
          <div>
            <h2>Rinforzi</h2>
            <p>All&apos;inizio di ogni turno, il giocatore deve posizionare tutti i rinforzi ricevuti prima di scegliere un&apos;azione.</p>
            <div className="tutorial-formula-card">
              <strong>Calcolo dei rinforzi</strong>
              <span>1 o 2 territori: 3 rinforzi</span>
              <span>Da 3 territori in poi: un rinforzo ogni 2 territori</span>
              <span>Minimo normale: 2 — Massimo: 6</span>
            </div>
          </div>
        </section>
        <section className="tutorial-section">
          <span className="tutorial-number">4</span>
          <div>
            <h2>Scelta della modalità</h2>
            <p>Dopo aver posizionato tutti i rinforzi, il giocatore deve scegliere tra attacco e difesa.</p>
            <div className="tutorial-choice-grid">
              <article className="tutorial-choice tutorial-choice-attack">
                <strong>Attacco</strong>
                <span>Puoi attaccare una o più regioni nemiche adiacenti.</span>
              </article>
              <article className="tutorial-choice tutorial-choice-defence">
                <strong>Difesa</strong>
                <span>Ottieni un bonus difensivo, ma non puoi attaccare nello stesso turno.</span>
              </article>
            </div>
          </div>
        </section>
        <section className="tutorial-section tutorial-offensive">
          <span className="tutorial-number">5</span>
          <div>
            <h2>Modalità offensiva</h2>
            <p>Per attaccare devi selezionare una tua regione con almeno 2 pedine e poi una regione nemica adiacente.</p>
            <p>Nell&apos;attacco vengono utilizzate tutte le pedine presenti nella regione attaccante.</p>
            <div className="tutorial-formula-card tutorial-formula-attack">
              <strong>Punteggio attaccante</strong>
              <code>pedine attaccanti + (dado × pedine attaccanti)</code>
            </div>
            <div className="tutorial-formula-card tutorial-formula-defence">
              <strong>Punteggio difensore</strong>
              <code>pedine difensore + bonus difesa + (dado × pedine difensore)</code>
            </div>
            <div className="tutorial-rule-box">In caso di pareggio vince sempre il difensore.</div>
          </div>
        </section>
        <section className="tutorial-section tutorial-offensive">
          <span className="tutorial-number">6</span>
          <div>
            <h2>Perdite e conquista</h2>
            <p>Se vince l&apos;attaccante, il difensore perde un numero di pedine pari al minore tra le pedine attaccanti e quelle difendenti.</p>
            <p>Se vince il difensore, l&apos;attaccante perde un numero di pedine pari al minore tra le pedine difendenti e quelle che può perdere lasciandone almeno una nella regione di partenza.</p>
            <p>Quando nella regione difesa non resta alcuna pedina, la regione viene conquistata.</p>
            <div className="tutorial-rule-box">Dopo una conquista devi trasferire almeno 1 pedina, lasciandone sempre almeno 1 nella regione attaccante.</div>
            <p>
              Nella finestra di trasferimento puoi
              usare il pulsante <strong>MAX</strong> per
              spostare automaticamente tutte le pedine
              disponibili, lasciandone una nella
              regione di partenza.
            </p>
          </div>
        </section>
        <section className="tutorial-section tutorial-defensive">
          <span className="tutorial-number">7</span>
          <div>
            <h2>Modalità difensiva</h2>
            <p>Scegliendo la difesa, tutte le regioni del giocatore ricevono lo stesso bonus.</p>
            <div className="tutorial-formula-card tutorial-formula-defence">
              <strong>Bonus difesa</strong>
              <code>parte intera (territori ÷ 2) + 1</code>
              <span>Bonus massimo: +6</span>
            </div>
            <p>Il bonus resta attivo durante i turni degli avversari e scade all&apos;inizio del tuo turno successivo.</p>
          </div>
        </section>
        <section className="tutorial-section tutorial-transfer">
          <span className="tutorial-number">8</span>
          <div>
            <h2>Trasferimento facoltativo</h2>
            <p>Dopo aver terminato gli attacchi oppure dopo aver attivato la difesa, puoi scegliere se trasferire pedine tra due tue regioni adiacenti.</p>
            <p>La regione di partenza deve contenere almeno 2 pedine. Puoi trasferire una o più pedine, ma nella regione di partenza deve rimanerne sempre almeno una.</p>
            <div className="tutorial-rule-box tutorial-transfer-rule">Il trasferimento non è obbligatorio e può essere effettuato una sola volta per turno.</div>
            <p>
              Puoi scegliere il numero di pedine con
              i pulsanti <strong>+</strong> e
              <strong> −</strong>, oppure premere
              <strong> MAX</strong> per selezionare il
              numero massimo consentito.
            </p>
            <p>
              Puoi anche premere
              <strong> Salta trasferimento</strong> o
              terminare direttamente il turno senza
              spostare alcuna pedina.
            </p>
          </div>
        </section>
        <section className="tutorial-section">
          <span className="tutorial-number">9</span>
          <div>
            <h2>Fine del turno</h2>
            <p>Dopo aver terminato gli attacchi oppure dopo aver attivato la difesa, puoi effettuare il trasferimento facoltativo oppure concludere direttamente il turno.</p>
            <p>
              Premendo <strong>Fine turno</strong>, il
              gioco passa automaticamente al giocatore
              successivo ancora in partita.
            </p>
          </div>
        </section>
        <section className="tutorial-section tutorial-victory">
          <span className="tutorial-number">10</span>
          <div>
            <h2>Eliminazione e vittoria</h2>
            <p>Un giocatore viene eliminato quando non possiede più alcuna regione.</p>
            <p>La partita termina quando rimane un solo giocatore con almeno una regione.</p>
            <div className="tutorial-rule-box tutorial-victory-box">Il vincitore è il giocatore che conquista tutte le regioni italiane.</div>
          </div>
        </section>
        <section className="tutorial-footer">
          <h2>Pronto a conquistare l&apos;Italia?</h2>
          <button type="button" className="tutorial-play-button" onClick={handleStartLocalGame}>Inizia una partita locale</button>
        </section>
      </section>
    </main>
  );
}

export default TutorialPage;