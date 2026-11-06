import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase/firebase";
import { ensureUserProfile, subscribeToUserProfile } from "../firebase/userProfiles";
import useGameAudio from "../hooks/useGameAudio";
import { createOnlineRoom, ensureRandomRoomCountdown, findRandomMatch, finishReadyCountdown, joinOnlineRoom, leaveOnlineRoom, reconnectOnlinePlayer, subscribeToRoom, togglePlayerReady } from "../firebase/rooms";
import "./OnlineLobbyPage.css";
const PLAYER_COLORS = ["#e53935", "#1e88e5", "#fdd835", "#43a047"];
const COUNTDOWN_SECONDS = 5;
const CLICK_SOUND = "/audio/click.wav";
const ACTIVE_ROOM_STORAGE_KEY = "nationsConquestActiveRoom";
function OnlineLobbyPage() {
  const navigate = useNavigate();
  const {playEffect} = useGameAudio();
  function playClick() {
    playEffect(CLICK_SOUND);
  }
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authStatus, setAuthStatus] = useState("Connessione a Firebase...");
  const [playerName, setPlayerName] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [activeRoomCode, setActiveRoomCode] = useState("");
  const [room, setRoom] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [countdownValue, setCountdownValue] = useState(null);
  const [isCheckingActiveGame, setIsCheckingActiveGame] = useState(true);
  const copyTimerRef = useRef(null);
  const countdownFinishedRef = useRef(false);
  const countdownRepairRef = useRef(false);

  //Autenticazione anonima
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      if (user) {
        setFirebaseUser(user);
        try {
          await ensureUserProfile(user);
        } catch (error) {
          console.error("Errore creazione profilo:", error);
        }
        setAuthStatus("Connesso");
        return;
      }
      try {
        setAuthStatus("Accesso anonimo in corso...");
        await signInAnonymously(auth);
      } catch (error) {
        console.error(error);
        setAuthStatus("Connessione non riuscita");
        setErrorMessage(error.message);
      }
    });
    return unsubscribe;
  }, []);

  //Profilo utente in tempo reale
  useEffect(() => {
    if (!firebaseUser?.uid) {
      setUserProfile(null);
      return undefined;
    }
    const unsubscribe = subscribeToUserProfile(firebaseUser.uid, profile => {
      setUserProfile(profile);
    }, error => {
      console.error("Errore profilo lobby:", error);
    });
    return unsubscribe;
  }, [firebaseUser?.uid]);

  //Quando si apre "Gioca online", controlla se questo browser appartiene già a una partita ancora attiva.
   useEffect(() => {
    if (!firebaseUser) {
      return undefined;
    }
    const storedRoomCode = localStorage.getItem(ACTIVE_ROOM_STORAGE_KEY);
    if (!storedRoomCode) {
      setIsCheckingActiveGame(false);
      return undefined;
    }
    let isCancelled = false;
    let unsubscribeRoom = null;
    async function handleStoredRoom(storedRoom) {
      if (isCancelled) {
        return;
      }
      const storedGame = storedRoom?.game ?? null;
      const storedPlayers = storedGame?.players ?? [];
      const playerBelongsToGame = storedPlayers.some(player => player.uid === firebaseUser.uid);
      const gameIsStillActive = storedRoom?.status === "playing" && Boolean(storedGame) && !storedGame.winner && playerBelongsToGame;
      if (!gameIsStillActive) {
        localStorage.removeItem(ACTIVE_ROOM_STORAGE_KEY);
        setIsCheckingActiveGame(false);
        if (unsubscribeRoom) {
          unsubscribeRoom();
          unsubscribeRoom = null;
        }
        return;
      }
      try {
        const wasReconnected = await reconnectOnlinePlayer({roomCode: storedRoomCode,uid: firebaseUser.uid});
        if (!isCancelled && wasReconnected) {
          navigate(`/online-game/${storedRoomCode}`, {replace: true});
        } else if (!isCancelled) {
          localStorage.removeItem(ACTIVE_ROOM_STORAGE_KEY);
          setIsCheckingActiveGame(false);
        }
      } catch (error) {
        console.error(error);
        if (!isCancelled) {
          localStorage.removeItem(ACTIVE_ROOM_STORAGE_KEY);
          setIsCheckingActiveGame(false);
        }
      } finally {
        if (unsubscribeRoom) {
          unsubscribeRoom();
          unsubscribeRoom = null;
        }
      }
    }
    unsubscribeRoom = subscribeToRoom(storedRoomCode, handleStoredRoom, error => {
      console.error(error);
      if (!isCancelled) {
        localStorage.removeItem(ACTIVE_ROOM_STORAGE_KEY);
        setIsCheckingActiveGame(false);
      }
      if (unsubscribeRoom) {
        unsubscribeRoom();
        unsubscribeRoom = null;
      }
    });
    return () => {
      isCancelled = true;
      if (unsubscribeRoom) {
        unsubscribeRoom();
      }
    };
  }, [firebaseUser, navigate]);
  //Pulizia del timer del messaggio "Codice copiato".
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  //Ascolto in tempo reale della stanza
  useEffect(() => {
    if (!activeRoomCode) {
      setRoom(null);
      return undefined;
    }
    const unsubscribe = subscribeToRoom(activeRoomCode, updatedRoom => {
      if (!updatedRoom) {
        setRoom(null);
        setActiveRoomCode("");
        setErrorMessage("La stanza è stata chiusa.");
        return;
      }
      setRoom(updatedRoom);
    }, error => {
      console.error(error);
      setErrorMessage(error.message);
    });
    return unsubscribe;
  }, [activeRoomCode]);

  //Se una stanza casuale arriva a 4/4 ma rimane erroneamente su "waiting", viene forzato l'avvio del countdown.
  useEffect(() => {
    const shouldRepairCountdown = room?.type === "random" && room?.status === "waiting" && room?.players?.length === 4 && Boolean(room?.code);
    if (!shouldRepairCountdown) {
      countdownRepairRef.current = false;
      return;
    }
    if (countdownRepairRef.current) {
      return;
    }
    countdownRepairRef.current = true;
    ensureRandomRoomCountdown({roomCode: room.code}).catch(error => {
      console.error(error);
      countdownRepairRef.current = false;
      setErrorMessage(error.message);
    });
  }, [room?.type, room?.status, room?.players?.length, room?.code]);

  /*
    Countdown locale da 5 secondi.
    Parte quando:
    - Firestore comunica "countdown";
    - oppure la stanza ha già raggiunto 4 giocatori.
    In questo modo viene mostrato anche sui dispositivi mobili che ricevono in ritardo il cambio di stato della stanza.
  */
  /*
    Countdown locale da 5 secondi.
    Stanza privata:
    parte soltanto quando Firestore conferma che tutti i giocatori sono pronti.
    Stanza casuale:
    può partire anche se la stanza è ancora
    momentaneamente su "waiting", purché sia piena.
   */
  useEffect(() => {
    const roomPlayers = room?.players ?? [];
    const roomIsFull = roomPlayers.length === 4;
    const allPlayersReady = roomIsFull && roomPlayers.every(player => player.isReady === true);
    const privateRoomCanStart = room?.type === "private" && room?.status === "countdown" && allPlayersReady;
    const randomRoomCanStart = room?.type === "random" && roomIsFull && (room?.status === "waiting" || room?.status === "countdown");
    const canStartCountdown = Boolean(room?.code) && (privateRoomCanStart || randomRoomCanStart);
    if (!canStartCountdown) {
      setCountdownValue(null);
      countdownFinishedRef.current = false;
      return undefined;
    }
    let currentValue = COUNTDOWN_SECONDS;
    setCountdownValue(currentValue);
    countdownFinishedRef.current = false;
    const intervalId = setInterval(() => {
      currentValue -= 1;
      setCountdownValue(Math.max(0, currentValue));
      if (currentValue <= 0 && !countdownFinishedRef.current) {
        countdownFinishedRef.current = true;
        clearInterval(intervalId);
        finishReadyCountdown({roomCode: room.code}).catch(error => {
          console.error(error);
          countdownFinishedRef.current = false;
          setCountdownValue(null);
          setErrorMessage(error.message);
        });
      }
    }, 1000);
    return () => {
      clearInterval(intervalId);
    };
  }, [room?.code, room?.type, room?.status, room?.players]);

  //Quando la partita viene creata, tutti vengono portati alla pagina online.
  useEffect(() => {
    if (room?.status === "playing" && room?.game && room?.code) {
      navigate(`/online-game/${room.code}`, {replace: true});
    }
  }, [room?.status, room?.game, room?.code, navigate]);
  const currentPlayer = room?.players?.find(player => player.uid === firebaseUser?.uid);
  const isRandomRoom = room?.type === "random";
  const readyPlayersCount = room?.players?.filter(player => player.isReady === true).length ?? 0;
  const currentPlayerLevel = Math.max(1, Number(userProfile?.level) || 1);
  const canSubmit = Boolean(firebaseUser) && playerName.trim().length >= 2 && !isLoading;
  async function handleCreateRoom() {
    playClick();
    if (!canSubmit) {
      return;
    }
    try {
      setIsLoading(true);
      setErrorMessage("");
      const roomCode = await createOnlineRoom({uid: firebaseUser.uid,playerName,playerLevel: currentPlayerLevel});
      setActiveRoomCode(roomCode);
    } catch (error) {
      console.error(error);
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }
  async function handleFindRandomMatch() {
    playClick();
    if (!canSubmit) {
      return;
    }
    try {
      setIsLoading(true);
      setErrorMessage("");
      const roomCode = await findRandomMatch({uid: firebaseUser.uid,playerName,playerLevel: currentPlayerLevel});
      setActiveRoomCode(roomCode);
    } catch (error) {
      console.error(error);
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }
  async function handleJoinRoom(event) {
    event.preventDefault();
    playClick();
    if (!canSubmit) {
      return;
    }
    try {
      setIsLoading(true);
      setErrorMessage("");
      const roomCode = await joinOnlineRoom({roomCode: roomCodeInput,uid: firebaseUser.uid,playerName,playerLevel: currentPlayerLevel});
      setRoomCodeInput(roomCode);
      setActiveRoomCode(roomCode);
    } catch (error) {
      console.error(error);
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }
  async function handleLeaveRoom() {
    playClick();
    if (!activeRoomCode || !firebaseUser) {
      return;
    }
    try {
      setIsLoading(true);
      setErrorMessage("");
      await leaveOnlineRoom({roomCode: activeRoomCode,id: firebaseUser.ui});
      setRoom(null);
      setActiveRoomCode("");
      setCountdownValue(null);
      localStorage.removeItem(ACTIVE_ROOM_STORAGE_KEY);
    } catch (error) {
      console.error(error);
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }
  async function handleToggleReady() {
    playClick();
    if (!room || !firebaseUser || isRandomRoom) {
      return;
    }
    try {
      setIsLoading(true);
      setErrorMessage("");
      await togglePlayerReady({roomCode: room.code,uid: firebaseUser.uid});
    } catch (error) {
      console.error(error);
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }
  async function handleCopyRoomCode() {
    playClick();
    if (!room?.code) {
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(room.code);
      } else {
        const temporaryInput = document.createElement("textarea");
        temporaryInput.value = room.code;
        temporaryInput.setAttribute("readonly", "");
        temporaryInput.style.position = "fixed";
        temporaryInput.style.opacity = "0";
        document.body.appendChild(temporaryInput);
        temporaryInput.select();
        document.execCommand("copy");
        document.body.removeChild(temporaryInput);
      }
      setCopyMessage("Codice copiato");
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => {
        setCopyMessage("");
        copyTimerRef.current = null;
      }, 2200);
    } catch (error) {
      console.error(error);
      setErrorMessage("Non è stato possibile copiare il codice.");
    }
  }
  if (firebaseUser && isCheckingActiveGame) {
    return <main className="online-page">
        <section className="online-entry-card">
          <p className="online-label">
            Nation&apos;s Conquest
          </p>
          <h1>
            Riconnessione
          </h1>
          <p className="online-intro">
            Controllo di una partita online ancora attiva...
          </p>
          <span className="random-search-spinner" aria-hidden="true" />
        </section>
      </main>;
  }
  /*Lobby privata o casuale*/
  if (room && currentPlayer) {
    const countdownStarted = room.players.length === 4 && (room.status === "waiting" || room.status === "countdown");
    const gameIsStarting = room.status === "starting" || countdownStarted && countdownValue === 0;
    return <main className="online-page">
        <section className="online-room-card">
          <header className="online-room-header">
            <div>
              <p className="online-label">
                {isRandomRoom ? "Matchmaking" : "Stanza privata"}
              </p>
              <h1>
                {isRandomRoom ? "Partita casuale" : room.code}
              </h1>
              <p>
                {isRandomRoom ? "Stiamo cercando altri giocatori." : "Condividi questo codice con gli altri giocatori."}
              </p>
            </div>
            {!isRandomRoom && <button type="button" className="online-copy-button" onClick={handleCopyRoomCode}>
                Copia codice
              </button>}
          </header>
          <div className="online-room-status">
            <span>
              {isRandomRoom ? "Giocatori trovati" : "Giocatori connessi"}
            </span>
            <strong>
              {room.players.length}/4
            </strong>
          </div>
          {isRandomRoom && room.status === "waiting" && <div className="random-search-message">
                <span className="random-search-spinner" aria-hidden="true" />
                <p>
                  Ricerca di altri giocatori in corso...
                </p>
              </div>}
          <section className="online-player-list">
            {Array.from({length: 4}, (_, index) => {
              const player = room.players[index];
              return <article key={player?.uid ?? `empty-${index}`} className={`online-player-card ${player ? "online-player-filled" : "online-player-empty"} ${player?.isReady ? "online-player-ready" : ""}`} style={{"--online-player-color": PLAYER_COLORS[index]}}>
                <span className="online-player-dot" aria-hidden="true" />
                    <div className="online-player-data">
                      <strong>
                        {player ? player.name : "In attesa..."}
                      </strong>
                      {player && <small>
                          {player.uid === firebaseUser.uid ? "Tu" : isRandomRoom ? "Giocatore" : player.isHost ? "Host" : "Giocatore"}
                          {" · "}
                          <strong>
                            LV.{" "}
                            {Math.max(1, Number(player.level) || 1)}
                          </strong>
                        </small>}
                    </div>
                    {player && <span className={`online-ready-badge ${player.isReady ? "ready" : ""}`}>
                        {isRandomRoom ? countdownStarted ? "Pronto" : "In ricerca" : player.isReady ? "Pronto" : "Non pronto"}
                      </span>}
                  </article>;
          })}
          </section>
          {!isRandomRoom && <div className="online-ready-status">
              <span>
                Giocatori pronti
              </span>
              <strong>
                {readyPlayersCount}/4
              </strong>
            </div>}
          {isRandomRoom && <div className="online-ready-status">
              <span>
                Posti mancanti
              </span>
              <strong>
                {Math.max(0, 4 - room.players.length)}
              </strong>
            </div>}
          {gameIsStarting && <p className="online-starting-message">
              Avvio della partita in corso...
            </p>}
          {errorMessage && <p className="online-error">
              {errorMessage}
            </p>}
          <div className="online-room-actions">
            {isRandomRoom ? <button type="button" className="online-cancel-search-button" onClick={handleLeaveRoom} disabled={isLoading || countdownStarted || gameIsStarting}>
                {isLoading ? "Annullamento..." : "Annulla ricerca"}
              </button> : <>
                <button type="button" className={`online-ready-button ${currentPlayer.isReady ? "cancel-ready" : ""}`} onClick={handleToggleReady} disabled={isLoading || room.status !== "waiting"}>
                  {currentPlayer.isReady ? "Annulla pronto" : "Sono pronto"}
                </button>
                <button type="button" className="online-secondary-button" onClick={handleLeaveRoom} disabled={isLoading || countdownStarted || gameIsStarting}>
                  Esci dalla stanza
                </button>
              </>}
          </div>
        </section>
        {countdownStarted && countdownValue !== null && <div className="online-countdown-overlay" role="status" aria-live="assertive">
              <span className="online-countdown-label">
                {countdownValue > 0 ? "La partita inizia" : "Avvio partita"}
              </span>
              {countdownValue > 0 ? <strong key={countdownValue} className="online-countdown-number">
                  {countdownValue}
                </strong> : <span className="random-search-spinner" aria-hidden="true" />}
            </div>}
        {copyMessage && <div className="copy-toast" role="status" aria-live="polite">
            {copyMessage}
          </div>}
      </main>;
  }
  /*
   * Pagina iniziale online.
   */
  return <main className="online-page">
      <section className="online-entry-card">
        <button type="button" className="online-back-button" onClick={() => {
        playClick();
        navigate("/");
      }}>
          ← Torna al menu
        </button>
        <p className="online-label">
          Nation&apos;s Conquest
        </p>
        <h1>
          Gioca online
        </h1>
        <p className="online-intro">
          Crea una stanza privata, entra con un codice oppure cerca automaticamente altri giocatori.
        </p>
        <div className="online-connection-status">
          <span className={firebaseUser ? "online-status-dot connected" : "online-status-dot"} />
          {authStatus}
        </div>
        <label className="online-field">
          <span>
            Nome giocatore
          </span>
          <input type="text" value={playerName} onChange={event => setPlayerName(event.target.value)} placeholder="Inserisci il tuo nome" minLength={2} maxLength={18} />
        </label>
        <button type="button" className="online-random-button" onClick={handleFindRandomMatch} disabled={!canSubmit}>
          {isLoading ? "Ricerca in corso..." : "Cerca partita casuale"}
        </button>
        <div className="online-divider">
          <span>
            stanza privata
          </span>
        </div>
        <button type="button" className="online-primary-button" onClick={handleCreateRoom} disabled={!canSubmit}>
          {isLoading ? "Operazione in corso..." : "Crea stanza privata"}
        </button>
        <div className="online-divider">
          <span>
            oppure entra con codice
          </span>
        </div>
        <form className="online-join-form" onSubmit={handleJoinRoom}>
          <label className="online-field">
            <span>
              Codice stanza
            </span>
            <input type="text" value={roomCodeInput} onChange={event => setRoomCodeInput(event.target.value.toUpperCase().slice(0, 6))} placeholder="ABC123" maxLength={6} />
          </label>
          <button type="submit" className="online-secondary-button" disabled={!canSubmit || roomCodeInput.trim().length !== 6}>
            Entra nella stanza
          </button>
        </form>
        {errorMessage && <p className="online-error">
            {errorMessage}
          </p>}
      </section>
    </main>;
}
export default OnlineLobbyPage;