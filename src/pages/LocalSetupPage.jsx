import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import backgroundImage from "../assets/images/schermata_iniziale.png";
import { player_list } from "../data/setup_game";
import useGameAudio from "../hooks/useGameAudio";
import {
  clearSavedLocalGame,
  formatSavedGameDate,
  loadLocalGame,
} from "../utils/localGameStorage";
import "./LocalSetupPage.css";

const CLICK_SOUND = "/audio/click.wav";
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
const PLAYER_COLORS = [
  {
    name: "Rosso",
    value: "#e53935",
  },
  {
    name: "Blu",
    value: "#1e88e5",
  },
  {
    name: "Giallo",
    value: "#ffff00",
  },
  {
    name: "Verde",
    value: "#43a047",
  },
];

function LocalSetupPage() {
  const navigate = useNavigate();
  const { playEffect } = useGameAudio();
  const [savedGame, setSavedGame] = useState(() => loadLocalGame());
  const [numberOfPlayers,setNumberOfPlayers] = useState(4);
  const [playerNames, setPlayerNames] = useState(["", "", "", ""]); //Manteniamo 4 campi ma mostriamo solo i giocatori partecipanti
  const [errorMessage, setErrorMessage] = useState("");
  const activePlayerNames = useMemo(() => playerNames.slice(0,numberOfPlayers),[playerNames,numberOfPlayers]);
  //Per confrontare i nomi
  const normalizedNames = useMemo(() => activePlayerNames.map((name) => name.trim().toLowerCase()), [activePlayerNames]);
  const allNamesEntered = activePlayerNames.every((name) => name.trim().length >= 2);
  const namesAreUnique = new Set(normalizedNames).size === activePlayerNames.length;
  const canStart = allNamesEntered && namesAreUnique;

  function playClick() {
    playEffect(CLICK_SOUND);
  }

  function handlePlayerCountChange(newPlayerCount){
    const validPlayerCount = Math.min(MAX_PLAYERS,Math.max(MIN_PLAYERS,newPlayerCount));
    playClick();
    setNumberOfPlayers(validPlayerCount);
    setErrorMessage("");
  }

  function handleNameChange(index,value){
    setPlayerNames((currentNames) => currentNames.map((name,currentIndex) => currentIndex === index ? value : name));
    setErrorMessage("");
  }

  function handleContinueSavedGame(){
    if (!savedGame){
      return;
    }
    playClick();
    navigate("/game");
  }

  function handleDeleteSavedGame() {
    const confirmed = window.confirm("Vuoi eliminare la partita locale salvata?");
    if (!confirmed) {
      return;
    }
    playClick();
    clearSavedLocalGame();
    setSavedGame(null); //Aggiorniamo lo stato react
  }

  function handleStartLocalGame() {
    if (!allNamesEntered) {
     setErrorMessage(`Inserisci un nome di almeno 2 caratteri per tutti i ${numberOfPlayers} giocatori.`);
      return;
    }
    if (!namesAreUnique) {
      setErrorMessage("I giocatori devono avere nomi differenti.");
      return;
    }
    playClick();
    clearSavedLocalGame();
    setSavedGame(null);
//Prendimamo solo il numero di giocatori scelti
    const configuredPlayers = player_list.slice(0,numberOfPlayers).map((player, index) => ({
            ...player,
            name: activePlayerNames[index].trim(), color: PLAYER_COLORS[index]?.value ?? player.color, bonus_def: 0, activated_def: false, in_game: true})
          );
    navigate("/game", {
      state: { //Trasferiamo le informazioni durante la navigazione
        players: configuredPlayers,
        numberOfPlayers,
        gameMode: "local",
      },
    });
  }

  function handleBackHome() {
    playClick();
    navigate("/");
  }

  return (
    <main className="local-setup-page" style={{backgroundImage: `url(${backgroundImage})`}}>
      <section className="local-setup-card">
        <header className="local-setup-header">
          <p>
            Modalità offline
          </p>
          <h1>
            Configura la partita locale
          </h1>
          <span>
            Scegliete il numero di giocatori, inserite gli username e passatevi il dispositivo a ogni turno.
          </span>
        </header>
        {savedGame && ( //rendering condizionale
          <section className="local-saved-game-card">
            <div>
              <p>
                Partita locale salvata
              </p>
              <strong>
                Turno di{" "}
                {savedGame.players?.find((player) => player.id === savedGame.currentPlayerId)?.name ?? "giocatore"}
              </strong>
              <small>
                Giocatori:{" "}
                {savedGame.players?.length ?? 4}
              </small>
              {savedGame.savedAt && (
                <small>
                  Ultimo salvataggio:{" "}
                  {formatSavedGameDate(savedGame.savedAt)}
                </small>
              )}
            </div>
            <div className="local-saved-game-actions">
              <button type="button" className="local-start-button" onClick={handleContinueSavedGame}>
                Continua partita
              </button>
              <button type="button" className="local-back-button" onClick={handleDeleteSavedGame}>
                Elimina salvataggio
              </button>
            </div>
          </section>
        )}
        <section className="local-player-count-section">
          <h2>
            Numero di giocatori
          </h2>
          <p>
            La partita locale può essere giocata da 2, 3 oppure 4 persone.
          </p>
          <div className="local-player-count-buttons" role="group" aria-label="Numero di giocatori">
            {[2, 3, 4].map((playerCount) => ( //Creiamo 3 pulsanti
                <button key={playerCount} type="button" className={`local-player-count-button ${numberOfPlayers === playerCount ? "selected" : ""}`} onClick={() => handlePlayerCountChange(playerCount)}
                  aria-pressed={numberOfPlayers === playerCount} //Comunica se il pulsante è selezionato
                >
                  {playerCount}
                </button>
              )
            )}
          </div>
        </section>
        <div className="local-player-list">
          {activePlayerNames.map((playerName,index) => { //Generiamo dinamicamente i nomi
              const playerColor = PLAYER_COLORS[index]; //Recuperiamo i valori
              return (
                <label key={`local-player-${index + 1}`} className="local-player-field">
                  <span className="local-player-label"> 
                    <span className="local-player-color" style={{ backgroundColor: playerColor.value}}/> 
                    Giocatore{" "}
                    {index + 1}
                  </span>
                  <input type="text" value={playerName} maxLength={20} placeholder={`Username giocatore ${index + 1}`} onChange={(event) =>handleNameChange(index, event.target.value)}/>
                  <small>
                    Colore assegnato:{" "}
                    {playerColor.name}
                  </small>
                </label>
              );
            }
          )}
        </div>
        {errorMessage && (
          <p className="local-setup-error" role="alert">
            {errorMessage}
          </p>
        )}
        <div className="local-setup-actions">
          <button type="button" className="local-back-button" onClick={handleBackHome}>
            Torna alla home
          </button> 
          <button type="button" className="local-start-button" onClick={handleStartLocalGame} disabled={!canStart}> {/* Il pulsante viene disabilitato quando non sono soddisfatte le condizioni di validazione*/}
            Inizia partita
          </button>
        </div>
      </section>
    </main>
  );
}

export default LocalSetupPage;