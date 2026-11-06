import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { auth } from "../firebase/firebase";
import {
  disconnectOnlinePlayer,
  reconnectOnlinePlayer,
  reconcileOnlinePresence,
  sendOnlineChatMessage,
  subscribeToRoom,
  updateOnlinePlayerHeartbeat,
} from "../firebase/rooms";
import {
  chooseOnlineTurnMode,
  confirmOnlineAttack,
  confirmOnlineConquestTransfer,
  confirmOnlineTroopTransfer,
  updateOnlineConquestTransferSelection,
  finishOnlineAttackMode,
  finishOnlineTurn,
  placeInitialOnlineTroop,
  placeOnlineReinforcement,
  resetOnlineAttackSelection,
  selectOnlineAttackingTerritory,
  selectOnlineDefendingTerritory,
  selectOnlineTransferSource,
  selectOnlineTransferTarget,
  skipOnlineTroopTransfer,
  startOnlineTroopTransfer,
} from "../firebase/onlineGame";
import { claimOnlineGameReward } from "../firebase/userProfiles";
import { getNotificationPermission, notifyYourTurn, requestNotificationPermission } from "../utils/notifications";
import { ItalyMap } from "../components/game/ItalyMap";
import GameChat from "../components/game/GameChat";
import PauseMenu from "../components/game/PauseMenu";
import GameNotification from "../components/ui/GameNotification";
import useGameAudio from "../hooks/useGameAudio";
import useGameNotification from "../hooks/useGameNotification";
import "./GamePage.css";
import "./OnlineGamePage.css";
import "./ResponsiveGame.css";
const CONQUEST_MODAL_DELAY = 1250;
const TURN_TRANSITION_DURATION = 2600;
const INITIAL_PLACEMENT_INTRO_DURATION = 2400;
const ELIMINATION_NOTICE_DURATION = 2200;
const BATTLE_EFFECT_DURATION = 1200;
const PRESENCE_HEARTBEAT_INTERVAL = 8000;
const PRESENCE_RECONCILE_INTERVAL = 5000;
const ACTIVE_ROOM_STORAGE_KEY = "nationsConquestActiveRoom";
const GAME_MUSIC = "/audio/game-music.wav";
const ATTACK_SOUND = "/audio/attack.wav";
const CONQUEST_SOUND = "/audio/conquest.wav";
const TURN_SOUND = "/audio/turn.wav";
const ELIMINATION_SOUND = "/audio/elimination.wav";
const VICTORY_SOUND = "/audio/victory.wav";
function getColorName(color) {
  const colorNames = {"#e53935": "Red","#1e88e5": "Blue","#fdd835": "Yellow", "#43a047": "Green"};
  return colorNames[color?.toLowerCase()] ?? color ?? "Nessuno";
}
function OnlineGamePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {roomCode} = useParams();
  const {
    playMusic,
    stopMusic,
    playEffect
  } = useGameAudio();
  const {
    notification,
    showNotification,
    showError,
    dismissNotification
  } = useGameNotification();
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [room, setRoom] = useState(null);
  const [gameReward, setGameReward] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState(getNotificationPermission());
  const [isClaimingReward, setIsClaimingReward] = useState(false);
  const [selectedTerritoryId, setSelectedTerritoryId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPerformingAction, setIsPerformingAction] = useState(false);
  const [troopsToMove, setTroopsToMove] = useState(1);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSendingChatMessage, setIsSendingChatMessage] = useState(false);
  /*
    Valori primitivi usati dagli effetti della conquista.
    Evitiamo di dipendere dall'intero oggetto pendingConquest, perché Firestore può ricrearlo a ogni aggiornamento.
   */
  const hasPendingConquest = Boolean(room?.game?.pendingConquest);
  const conquestAttackCreatedAt = room?.game?.attackResult?.createdAt ?? null;
  const [showInitialPlacementIntro, setShowInitialPlacementIntro] = useState(false);
  const [turnTransitionPlayer, setTurnTransitionPlayer] = useState(null);
  const [battleEffects, setBattleEffects] = useState([]);
  const [eliminatedPlayerNotice, setEliminatedPlayerNotice] = useState(null);
  const [showConquestTransferModal, setShowConquestTransferModal] = useState(false);
  const [isPauseMenuOpen, setIsPauseMenuOpen] = useState(location.state?.openPauseMenu ?? false);
  const previousCurrentPlayerIdRef = useRef(null);
  const previousInitialPlacementRef = useRef(null);
  const previousAttackResultCreatedAtRef = useRef(null);
  const previousPlayersRef = useRef([]);
  const previousWinnerIdRef = useRef(null);
  const rewardClaimStartedRef = useRef(false);
  const initialSequenceShownRef = useRef(false);
  const initialPlacementIntroTimerRef = useRef(null);
  const turnTransitionTimerRef = useRef(null);
  const eliminationNoticeTimerRef = useRef(null);
  const conquestModalTimerRef = useRef(null);
  const battleEffectTimersRef = useRef([]);
  useEffect(() => {
    function handleEscapeKey(event) {
      if (event.key !== "Escape" || room?.game?.winner) {
        return;
      }
      setIsPauseMenuOpen(currentValue => !currentValue);
    }
    window.addEventListener("keydown", handleEscapeKey);
    return () => {
      window.removeEventListener("keydown", handleEscapeKey);
    };
  }, [room?.game?.winner]);
  function clearTurnTransitionTimer() {
    if (!turnTransitionTimerRef.current) {
      return;
    }
    clearTimeout(turnTransitionTimerRef.current);
    turnTransitionTimerRef.current = null;
  }
  function showTurnTransition(player) {
    if (!player) {
      return;
    }
    clearTurnTransitionTimer();
    playEffect(TURN_SOUND);
    setTurnTransitionPlayer(player);
    turnTransitionTimerRef.current = setTimeout(() => {
      setTurnTransitionPlayer(null);
      turnTransitionTimerRef.current = null;
    }, TURN_TRANSITION_DURATION);
  }
  function showInitialPlacementSequence(player) {
    if (!player) {
      return;
    }
    if (initialPlacementIntroTimerRef.current) {
      clearTimeout(initialPlacementIntroTimerRef.current);
    }
    clearTurnTransitionTimer();
    setTurnTransitionPlayer(null);
    setShowInitialPlacementIntro(true);
    initialPlacementIntroTimerRef.current = setTimeout(() => {
      setShowInitialPlacementIntro(false);
      initialPlacementIntroTimerRef.current = null;
      showTurnTransition(player);
    }, INITIAL_PLACEMENT_INTRO_DURATION);
  }
  function showEliminationNotice(player) {
    if (!player) {
      return;
    }
    if (eliminationNoticeTimerRef.current) {
      clearTimeout(eliminationNoticeTimerRef.current);
    }
    setEliminatedPlayerNotice(player);
    eliminationNoticeTimerRef.current = setTimeout(() => {
      setEliminatedPlayerNotice(null);
      eliminationNoticeTimerRef.current = null;
    }, ELIMINATION_NOTICE_DURATION);
  }
  function createBattleEffect({territoryId,lostTroops,color,createdAt}) {
    if (!territoryId || !lostTroops || lostTroops <= 0) {
      return;
    }
    const newEffect = {id: `${createdAt ?? Date.now()}-` + `${territoryId}-${Math.random()}`,territoryId,lostTroops,color};
    setBattleEffects(currentEffects => [...currentEffects, newEffect]);
    const timerId = setTimeout(() => {
      setBattleEffects(currentEffects => currentEffects.filter(effect => effect.id !== newEffect.id));
      battleEffectTimersRef.current = battleEffectTimersRef.current.filter(currentTimerId => currentTimerId !== timerId);
    },BATTLE_EFFECT_DURATION);
    battleEffectTimersRef.current.push(timerId);
  }
  async function handleEnableNotifications() {
    try {
      const permission = await requestNotificationPermission();
      setNotificationPermission(permission);
      if (permission === "granted") {
        showNotification("Notifiche attivate.", "success");
        return;
      }
      if (permission === "denied") {
        showNotification("Permesso notifiche negato dal browser.", "error");
        return;
      }
      showNotification("Questo browser non supporta le notifiche.", "error");
    } catch (error) {
      console.error("Errore notifiche:", error);
      showNotification("Non è stato possibile attivare le notifiche.", "error");
    }
  }

  //Avvia la musica della partita. Se il browser blocca l'autoplay, riprova alla prima interazione dell'utente.
     useEffect(() => {
    if (room?.status !== "playing" || room?.game?.winner) {
      return undefined;
    }
    let musicStarted = false;
    async function startGameMusic() {
      if (musicStarted) {
        return;
      }
      const started = await playMusic(GAME_MUSIC);
      if (started) {
        musicStarted = true;
      }
    }
    startGameMusic();
    function handleFirstInteraction() {
      startGameMusic();
    }
    window.addEventListener("pointerdown", handleFirstInteraction);
    window.addEventListener("keydown", handleFirstInteraction);
    return () => {
      window.removeEventListener("pointerdown", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
    };
  }, [room?.status, room?.game?.winner, playMusic]);

  //Autenticazione anonima
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      if (user) {
        setFirebaseUser(user);
        return;
      }
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error(error);
        setErrorMessage(error.message);
      }
    });
    return unsubscribe;
  }, []);
  //Sincronizzazione della stanza
  useEffect(() => {
    if (!roomCode) {
      return undefined;
    }
    return subscribeToRoom(roomCode, updatedRoom => {
      if (!updatedRoom) {
        setRoom(null);
        setErrorMessage("La partita non esiste più.");
        return;
      }
      setRoom(updatedRoom);
    },error => {
      console.error(error);
      setErrorMessage(error.message);
    });
  }, [roomCode]);

  //Registra la stanza attiva nel browser, riconnette il giocatore e invia heartbeat.
  useEffect(() => {
    if (!roomCode || !firebaseUser || room?.status !== "playing") {
      return undefined;
    }
    localStorage.setItem(ACTIVE_ROOM_STORAGE_KEY, roomCode);
    let isCancelled = false;
    async function reconnectAndHeartbeat() {
      try {
        await reconnectOnlinePlayer({roomCode,uid: firebaseUser.uid});
        if (!isCancelled) {
          await updateOnlinePlayerHeartbeat({roomCode,uid: firebaseUser.uid});
        }
      } catch (error) {
        console.error(error);
      }
    }
    reconnectAndHeartbeat();
    const heartbeatIntervalId = setInterval(() => {
      updateOnlinePlayerHeartbeat({roomCode, uid: firebaseUser.uid}).catch(console.error);
    }, PRESENCE_HEARTBEAT_INTERVAL);
    const reconcileIntervalId = setInterval(() => {
      reconcileOnlinePresence({roomCode}).catch(console.error);
    }, PRESENCE_RECONCILE_INTERVAL);
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        reconnectAndHeartbeat();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      isCancelled = true;
      clearInterval(heartbeatIntervalId);
      clearInterval(reconcileIntervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [roomCode, firebaseUser, room?.status]);

  //A partita conclusa non viene più proposta la riconnessione automatica.
  useEffect(() => {
    if (room?.game?.winner) {
      localStorage.removeItem(ACTIVE_ROOM_STORAGE_KEY);
    }
  }, [room?.game?.winner]);

  // Avvia l'introduzione iniziale quando lo stato della partita è disponibile.
  useEffect(() => {
    const game = room?.game;
    const players = game?.players ?? [];
    if (!game || !game.isInitialPlacement || initialSequenceShownRef.current) {
      return;
    }
    const firstPlayer = players.find(player => player.id === game.currentPlayerId);
    if (!firstPlayer) {
      return;
    }
    initialSequenceShownRef.current = true;
    previousCurrentPlayerIdRef.current = game.currentPlayerId;
    previousInitialPlacementRef.current = true;
    showInitialPlacementSequence(firstPlayer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.game?.currentPlayerId, room?.game?.isInitialPlacement]);

  //Mostra il cartello del turno ogni volta che Firestore cambia il giocatore attivo.
  useEffect(() => {
    const game = room?.game;
    const players = game?.players ?? [];
    if (!game) {
      return;
    }
    const previousPlayerId = previousCurrentPlayerIdRef.current;
    if (previousPlayerId === null) {
      previousCurrentPlayerIdRef.current = game.currentPlayerId;
      return;
    }
    if (previousPlayerId === game.currentPlayerId) {
      return;
    }
    previousCurrentPlayerIdRef.current = game.currentPlayerId;
    const nextPlayer = players.find(player => player.id === game.currentPlayerId);
    showTurnTransition(nextPlayer);
    if (nextPlayer?.uid === firebaseUser?.uid && notificationPermission === "granted") {
      notifyYourTurn({playerName: nextPlayer.name, roomCode}).catch(error => {
        console.error("Errore notifica turno:", error);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.game?.currentPlayerId, firebaseUser?.uid, notificationPermission, roomCode]);

  //Quando termina lo schieramento iniziale, annuncia l'inizio del primo turno normale.
  useEffect(() => {
    const game = room?.game;
    if (!game) {
      return;
    }
    const previousValue = previousInitialPlacementRef.current;
    if (previousValue === null) {
      previousInitialPlacementRef.current = game.isInitialPlacement;
      return;
    }
    if (previousValue === true && game.isInitialPlacement === false) {
      const player = (game.players ?? []).find(item => item.id === game.currentPlayerId);
      showTurnTransition(player);
    }
    previousInitialPlacementRef.current = game.isInitialPlacement;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.game?.isInitialPlacement]);

  //Riproduce l'effetto delle perdite quando arriva un nuovo risultato di battaglia.
  useEffect(() => {
    const game = room?.game;
    const attackResult = game?.attackResult ?? null;
    if (!game || !attackResult?.createdAt || previousAttackResultCreatedAtRef.current === attackResult.createdAt) {
      return;
    }
    previousAttackResultCreatedAtRef.current = attackResult.createdAt;
    playEffect(ATTACK_SOUND);
    const affectedTerritory = (game.territories ?? []).find(territory => territory.id === attackResult.affectedTerritoryId);
    const affectedPlayer = (game.players ?? []).find(player => player.id === affectedTerritory?.owner);
    createBattleEffect({
      territoryId: attackResult.affectedTerritoryId,
      lostTroops: attackResult.lostTroops ?? 0,
      color: affectedPlayer?.color ?? "#ffffff",
      createdAt: attackResult.createdAt
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.game?.attackResult?.createdAt]);

  //Riproduce il suono di conquista soltanto quando un nuovo combattimento genera una conquista.
  useEffect(() => {
    if (!hasPendingConquest || !conquestAttackCreatedAt) {
      return;
    }
    playEffect(CONQUEST_SOUND);
  }, [conquestAttackCreatedAt, hasPendingConquest, playEffect]);

  /*
   * Lascia visibile l'effetto della battaglia prima di aprire la finestra di conquista.
   *
   * La quantità scelta viene aggiornata dentro
   * pendingConquest, ma non deve riavviare il
   * timer del popup. Per questo dipendiamo solo
   * da valori primitivi che identificano la
   * nascita o la fine della conquista.
   */
  useEffect(() => {
    if (conquestModalTimerRef.current) {
      clearTimeout(conquestModalTimerRef.current);
      conquestModalTimerRef.current = null;
    }
    if (!hasPendingConquest || !conquestAttackCreatedAt) {
      setShowConquestTransferModal(false);
      return undefined;
    }
    setShowConquestTransferModal(false);
    conquestModalTimerRef.current = setTimeout(() => {
      setShowConquestTransferModal(true);
      conquestModalTimerRef.current = null;
    }, CONQUEST_MODAL_DELAY);
    return () => {
      if (conquestModalTimerRef.current) {
        clearTimeout(conquestModalTimerRef.current);
        conquestModalTimerRef.current = null;
      }
    };
  }, [conquestAttackCreatedAt, hasPendingConquest]);

  //Rileva localmente i giocatori appena eliminati confrontando gli aggiornamenti.
  useEffect(() => {
    const players = room?.game?.players ?? [];
    if (players.length === 0) {
      return;
    }
    const previousPlayers = previousPlayersRef.current;
    if (previousPlayers.length > 0) {
      const eliminatedPlayer = players.find(player => {
        const previousPlayer = previousPlayers.find(item => item.id === player.id);
        return previousPlayer?.in_game !== false && player.in_game === false;
      });
      if (eliminatedPlayer) {
        playEffect(ELIMINATION_SOUND);
        showEliminationNotice(eliminatedPlayer);
      }
    }
    previousPlayersRef.current = players.map(player => ({
      id: player.id,
      name: player.name,
      color: player.color,
      in_game: player.in_game
    }));
  }, [room?.game?.players, playEffect]);

  //Ferma la musica della partita e riproduce il suono di vittoria  
  useEffect(() => {
    const winner = room?.game?.winner ?? null;
    if (!winner) {
      previousWinnerIdRef.current = null;
      return;
    }
    const winnerId = winner.id ?? winner.name;
    if (previousWinnerIdRef.current === winnerId) {
      return;
    }
    previousWinnerIdRef.current = winnerId;
    stopMusic();
    playEffect(VICTORY_SOUND);
  }, [room?.game?.winner, stopMusic, playEffect]);

  //Assegna XP e statistiche una sola volta quando la partita termina.
  useEffect(() => {
    const winner = room?.game?.winner;
    if (!winner || !firebaseUser?.uid || !roomCode || rewardClaimStartedRef.current) {
      return;
    }
    rewardClaimStartedRef.current = true;
    async function claimReward() {
      try {
        setIsClaimingReward(true);
        const result = await claimOnlineGameReward({roomCode,uid: firebaseUser.uid});
        setGameReward(result);
      } catch (error) {
        console.error("Errore ricompensa:", error);
        rewardClaimStartedRef.current = false;
        showNotification("Non è stato possibile aggiornare esperienza e livello.", "error");
      } finally {
        setIsClaimingReward(false);
      }
    }
    claimReward();
  }, [room?.game?.winner, firebaseUser?.uid, roomCode, showNotification]);

  /*
   * Gli errori durante una partita già caricata
   * vengono mostrati come notifiche temporanee.
   * Gli errori fatali prima del caricamento della
   * stanza restano nella schermata dedicata.
   */
  useEffect(() => {
    if (!errorMessage || !room) {
      return;
    }
    showNotification(errorMessage, "error");
    setErrorMessage("");
  }, [errorMessage, room, showNotification]);

  //Pulisce tutti i timer locali quando la pagina online viene chiusa.
  useEffect(() => {
    return () => {
      if (initialPlacementIntroTimerRef.current) {
        clearTimeout(initialPlacementIntroTimerRef.current);
      }
      clearTurnTransitionTimer();
      if (eliminationNoticeTimerRef.current) {
        clearTimeout(eliminationNoticeTimerRef.current);
      }
      if (conquestModalTimerRef.current) {
        clearTimeout(conquestModalTimerRef.current);
      }
      battleEffectTimersRef.current.forEach(timerId => clearTimeout(timerId));
      stopMusic();
    };
  }, [stopMusic]);
  if (errorMessage && !room) {
    return <main className="online-game-message-page">
        <section>
          <h1>Errore</h1>
          <p>{errorMessage}</p>
          <button type="button" onClick={() => navigate("/online")}>
            Torna alla modalità online
          </button>
        </section>
      </main>;
  }
  if (!firebaseUser || !room?.game) {
    return <main className="online-game-message-page">
        <section>
          <h1>Preparazione partita</h1>
          <p>
            Sincronizzazione dello stato di gioco...
          </p>
        </section>
      </main>;
  }
  const game = room.game;
  const players = game.players ?? [];
  const territories = game.territories ?? [];
  const currentPlayer = players.find(player => player.id === game.currentPlayerId);
  const localPlayer = players.find(player => player.uid === firebaseUser.uid);
  const selectedTerritory = territories.find(territory => territory.id === selectedTerritoryId);
  const selectedTerritoryOwner = selectedTerritory ? players.find(player => player.id === selectedTerritory.owner) : null;
  const attackingTerritory = territories.find(territory => territory.id === game.attackingTerritoryId);
  const defendingTerritory = territories.find(territory => territory.id === game.defendingTerritoryId);
  const transferSourceTerritory = territories.find(territory => territory.id === game.transferSourceTerritoryId);
  const transferTargetTerritory = territories.find(territory => territory.id === game.transferTargetTerritoryId);
  const transferableTerritoryIds = transferSourceTerritory ? (transferSourceTerritory.adjacent_territory ?? []).filter(territoryId => {
    const territory = territories.find(item => item.id === territoryId);
    return territory?.owner === game.currentPlayerId;
  }) : [];
  const attackableTerritoryIds = game.attackableTerritoryIds ?? [];
  const attackResult = game.attackResult ?? null;
  const pendingConquest = game.pendingConquest ?? null;
  const selectedConquestTransfer = Math.max(1, pendingConquest?.selectedTransfer ?? 1);
  const winner = game.winner ?? null;
  const chatMessages = game.chatMessages ?? [];
  const isMyTurn = Boolean(localPlayer) && localPlayer.id === game.currentPlayerId;
  const playerSummaries = players.map(player => {
    const ownedTerritories = territories.filter(territory => territory.owner === player.id);
    const totalTroops = ownedTerritories.reduce((total, territory) => total + (territory.troops ?? 0), 0);
    return {...player, territoryCount: ownedTerritories.length, totalTroops};
  });
  function handleOpenPauseMenu() {
    playEffect("/audio/click.wav");
    setIsPauseMenuOpen(true);
  }
  function handleResumeGame() {
    playEffect("/audio/click.wav");
    setIsPauseMenuOpen(false);
  }
  function handleOpenSettings() {
    playEffect("/audio/click.wav");
    navigate("/settings", {
      state: {
        returnTo: "/game",
        reopenPauseMenu: true
      }
    });
  }
  function handleOpenTutorial() {
    playEffect("/audio/click.wav");
    navigate("/tutorial", {
      state: {
        returnTo: "/game",
        reopenPauseMenu: true
      }
    });
  }
  function handleBasicTerritorySelection(territoryId) {
    const clickedTerritory = territories.find(territory => territory.id === territoryId);
    if (!clickedTerritory) {
      return null;
    }
    setSelectedTerritoryId(territoryId);
    return clickedTerritory;
  }
  async function handleTerritoryClick(territoryId) {
    setErrorMessage("");
    const clickedTerritory = handleBasicTerritorySelection(territoryId);
    if (!clickedTerritory) {
      showNotification("La regione selezionata non è disponibile.", "error");
      return;
    }
    if (!isMyTurn) {
      showNotification(`Attendi il turno di ${currentPlayer.name}.`, "info");
      return;
    }
    //Se siamo nella fase di trasferimento, il clic seleziona partenza o arrivo.
    if (isMyTurn && game.turnMode === "transfer") {
      try {
        setIsPerformingAction(true);
        if (clickedTerritory.owner !== localPlayer.id) {
          throw new Error("Puoi selezionare soltanto una tua regione.");
        }
        if (!game.transferSourceTerritoryId) {
          await selectOnlineTransferSource({roomCode, uid: firebaseUser.uid, territoryId});
          setTroopsToMove(1);
          return;
        }
        if (clickedTerritory.id === game.transferSourceTerritoryId) {
          await selectOnlineTransferSource({roomCode,uid: firebaseUser.uid,territoryId});
          setTroopsToMove(1);
          return;
        }
        await selectOnlineTransferTarget({roomCode,uid: firebaseUser.uid,territoryId});
        setTroopsToMove(1);
      } catch (error) {
        console.error(error);
        setErrorMessage(error.message);
      } finally {
        setIsPerformingAction(false);
      }
      return;
    }
    //Fuori dalla modalità attacco il clic mostra soltanto i dati della regione.
    if (!isMyTurn || game.isInitialPlacement || game.reinforcementsRemaining > 0 || game.turnMode !== "attack" || pendingConquest) {
      return;
    }
    try {
      setIsPerformingAction(true);
      if (clickedTerritory.owner === localPlayer.id) {
        await selectOnlineAttackingTerritory({roomCode,uid: firebaseUser.uid,territoryId});
        return;
      }
      if (attackableTerritoryIds.includes(territoryId)) {
        await selectOnlineDefendingTerritory({roomCode,uid: firebaseUser.uid,territoryId});
      }
    } catch (error) {
      console.error(error);
      showError(error);
    } finally {
      setIsPerformingAction(false);
    }
  }
  async function handlePlaceTroop() {
    if (!firebaseUser) {
      showNotification("La sessione online non è ancora pronta.", "warning");
      return;
    }
    if (!isMyTurn) {
      showNotification(`Attendi il turno di ${currentPlayer.name}.`, "info");
      return;
    }
    if (!selectedTerritory) {
      showNotification("Seleziona prima una tua regione.", "warning");
      return;
    }
    try {
      setIsSubmitting(true);
      setErrorMessage("");
      if (game.isInitialPlacement) {
        await placeInitialOnlineTroop({roomCode, uid: firebaseUser.uid, territoryId: selectedTerritory.id});
        return;
      }
      await placeOnlineReinforcement({roomCode, uid: firebaseUser.uid, territoryId: selectedTerritory.id});
    } catch (error) {
      console.error(error);
      showError(error);
    } finally {
      setIsSubmitting(false);
    }
  }
  async function handleChooseMode(mode) {
    if (!firebaseUser) {
      showNotification("La sessione online non è ancora pronta.", "warning");
      return;
    }
    if (!isMyTurn) {
      showNotification(`Attendi il turno di ${currentPlayer.name}.`, "info");
      return;
    }
    try {
      setIsPerformingAction(true);
      setErrorMessage("");
      await chooseOnlineTurnMode({roomCode, uid: firebaseUser.uid, mode});
    } catch (error) {
      console.error(error);
      showError(error);
    } finally {
      setIsPerformingAction(false);
    }
  }
  async function handleConfirmAttack() {
    if (!isMyTurn) {
      return;
    }
    try {
      setIsPerformingAction(true);
      setErrorMessage("");
      await confirmOnlineAttack({roomCode,uid: firebaseUser.uid});
    } catch (error) {
      console.error(error);
      showError(error);
    } finally {
      setIsPerformingAction(false);
    }
  }
  async function handleResetAttack() {
    if (!isMyTurn) {
      return;
    }
    try {
      setIsPerformingAction(true);
      setErrorMessage("");
      await resetOnlineAttackSelection({roomCode,uid: firebaseUser.uid});
    } catch (error) {
      console.error(error);
      showError(error);
    } finally {
      setIsPerformingAction(false);
    }
  }
  async function handleFinishAttack() {
    if (!isMyTurn) {
      return;
    }
    try {
      setIsPerformingAction(true);
      setErrorMessage("");
      await finishOnlineAttackMode({roomCode,uid: firebaseUser.uid});
    } catch (error) {
      console.error(error);
      showError(error);
    } finally {
      setIsPerformingAction(false);
    }
  }
  async function handleConquestTransferSelection(nextValue) {
    if (!isMyTurn || !pendingConquest || isPerformingAction) {
      return;
    }
    const maximumTransfer = Math.max(1, pendingConquest.maximumTransfer ?? 1);
    const normalizedValue = Math.max(1, Math.min(maximumTransfer, Number(nextValue) || 1));
    if (normalizedValue === selectedConquestTransfer) {
      return;
    }
    try {
      setIsPerformingAction(true);
      setErrorMessage("");
      await updateOnlineConquestTransferSelection({roomCode,uid: firebaseUser.uid,troopsToTransfer: normalizedValue});
    } catch (error) {
      console.error(error);
      showError(error);
    } finally {
      setIsPerformingAction(false);
    }
  }
  async function handleConfirmConquestTransfer() {
    if (!isMyTurn || !pendingConquest) {
      return;
    }
    try {
      setIsPerformingAction(true);
      setErrorMessage("");
      await confirmOnlineConquestTransfer({roomCode,uid: firebaseUser.uid,troopsToTransfer: selectedConquestTransfer});
    } catch (error) {
      console.error(error);
      showError(error);
    } finally {
      setIsPerformingAction(false);
    }
  }
  async function handleStartTransfer() {
    if (!isMyTurn) {
      return;
    }
    try {
      setIsPerformingAction(true);
      setErrorMessage("");
      await startOnlineTroopTransfer({roomCode,uid: firebaseUser.uid});
      setTroopsToMove(1);
    } catch (error) {
      console.error(error);
      showError(error);
    } finally {
      setIsPerformingAction(false);
    }
  }
  async function handleConfirmTroopTransfer() {
    if (!isMyTurn || !transferSourceTerritory || !transferTargetTerritory) {
      return;
    }
    try {
      setIsPerformingAction(true);
      setErrorMessage("");
      await confirmOnlineTroopTransfer({roomCode,uid: firebaseUser.uid,troopsToMove});
      setTroopsToMove(1);
    } catch (error) {
      console.error(error);
      showError(error);
    } finally {
      setIsPerformingAction(false);
    }
  }
  async function handleSkipTransfer() {
    if (!isMyTurn) {
      return;
    }
    try {
      setIsPerformingAction(true);
      setErrorMessage("");
      await skipOnlineTroopTransfer({roomCode,uid: firebaseUser.uid});
      setTroopsToMove(1);
    } catch (error) {
      console.error(error);
      showError(error);
    } finally {
      setIsPerformingAction(false);
    }
  }
  async function handleTemporaryDisconnect() {
    if (!firebaseUser || !roomCode || isPerformingAction) {
      return;
    }
    const confirmed = window.confirm("Vuoi disconnetterti dalla partita? " + "Potrai rientrare premendo “Gioca online”, " + "finché la partita non sarà terminata.");
    if (!confirmed) {
      return;
    }
    try {
      setIsPauseMenuOpen(false);
      setIsPerformingAction(true);
      setErrorMessage("");
      await disconnectOnlinePlayer({roomCode,uid: firebaseUser.uid});
      await reconcileOnlinePresence({roomCode});
      stopMusic();
      navigate("/");
    } catch (error) {
      console.error(error);
      showError(error);
    } finally {
      setIsPerformingAction(false);
    }
  }
  async function handleSendChatMessage(messageText) {
    if (!firebaseUser || !localPlayer || isSendingChatMessage) {
      return;
    }
    try {
      setIsSendingChatMessage(true);
      setErrorMessage("");
      await sendOnlineChatMessage({roomCode, uid: firebaseUser.uid, text: messageText});
    } catch (error) {
      console.error(error);
      showError(error);
    } finally {
      setIsSendingChatMessage(false);
    }
  }
  async function handleEndTurn() {
    if (!isMyTurn) {
      return;
    }
    try {
      setIsPerformingAction(true);
      setErrorMessage("");
      await finishOnlineTurn({roomCode,uid: firebaseUser.uid});
      setSelectedTerritoryId(null);
      setTroopsToMove(1);
    } catch (error) {
      console.error(error);
      showError(error);
    } finally {
      setIsPerformingAction(false);
    }
  }
  if (!localPlayer) {
    return <main className="online-game-message-page">
        <section>
          <h1>Accesso non consentito</h1>
          <p>
            Non fai parte di questa partita.
          </p>
          <button type="button" onClick={() => navigate("/online")}>
            Torna alla modalità online
          </button>
        </section>
      </main>;
  }
  if (!currentPlayer) {
    return <main className="online-game-message-page">
        <section>
          <h1>Giocatore non trovato</h1>
          <p>
            Non è stato possibile individuare il giocatore corrente.
          </p>
        </section>
      </main>;
  }
  return <main className="game-page online-game-page">
      {!winner && <button type="button" className="pause-menu-open-button" onClick={handleOpenPauseMenu} aria-label="Apri menu di pausa">
          ☰ Menu
        </button>}
      <GameNotification notification={notification} onClose={dismissNotification} />
      <aside className="territory-sidebar">
        <section className="territory-info" style={{ marginTop: "60px"}}>
          <h2>Regione selezionata</h2>
          {selectedTerritory ? <>
              <table className="territory-info-table">
                <tbody>
                  <tr>
                    <th>Nome regione</th>
                    <td>
                      {selectedTerritory.name ?? selectedTerritory.id}
                    </td>
                  </tr>
                  <tr>
                    <th>Numero di pedine</th>
                    <td>
                      {selectedTerritory.troops}
                    </td>
                  </tr>
                  <tr>
                    <th>Proprietario</th>
                    <td>
                      {selectedTerritoryOwner?.name ?? "Nessun proprietario"}
                    </td>
                  </tr>
                  <tr>
                    <th>Colore</th>
                    <td>
                      <span className="owner-color">
                        <span className="owner-color-circle" style={{backgroundColor: selectedTerritoryOwner?.color ?? "#cccccc"}} />
                        {selectedTerritoryOwner ? getColorName(selectedTerritoryOwner.color) : "Nessuno"}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <th>Bonus difesa</th>
                    <td>
                      {Math.max(0, selectedTerritoryOwner?.bonus_def ?? 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
              {(game.isInitialPlacement || game.reinforcementsRemaining > 0) && <div className="territory-reinforcement-actions">
                  {isMyTurn && selectedTerritory.owner === localPlayer.id ? <>
                      <button type="button" className="add-reinforcement-button" onClick={handlePlaceTroop} disabled={isSubmitting}>
                        {isSubmitting ? "Posizionamento..." : game.isInitialPlacement ? "Posiziona una pedina" : "Aggiungi pedina"}
                      </button>
                      {game.isInitialPlacement && <p className="initial-placement-rule initial-placement-rule-left">
                          Ogni regione deve contenere almeno una pedina.
                        </p>}
                    </> : <p className="reinforcement-warning">
                      {!isMyTurn ? "Attendi il tuo turno." : "Non puoi aggiungere pedine in una regione nemica."}
                    </p>}
                </div>}
            </> : <p className="no-territory-selected">
              Clicca una regione sulla mappa per visualizzarne i dati.
            </p>}
        </section>
        {!game.isInitialPlacement && game.turnMode === "transfer" && isMyTurn && <section className="troop-transfer-panel transfer-panel-left">
              <p className="transfer-panel-kicker">
                Movimento strategico
              </p>
              <h2>Trasferimento pedine</h2>
              {!transferSourceTerritory && <p>
                  Seleziona sulla mappa una tua regione con almeno 2 pedine.
                </p>}
              {transferSourceTerritory && <>
                  <div className="troop-transfer-region-card source">
                    <span>
                      Regione di partenza
                    </span>
                    <strong>
                      {transferSourceTerritory.name ?? transferSourceTerritory.id}
                    </strong>
                    <small>
                      Pedine disponibili:{" "}
                      {transferSourceTerritory.troops}
                    </small>
                  </div>
                  {!transferTargetTerritory && <p className="transfer-map-instruction">
                      Le regioni alleate adiacenti disponibili sono illuminate sulla mappa.
                    </p>}
                </>}
              {transferTargetTerritory && <>
                  <div className="troop-transfer-route">
                    <div className="troop-transfer-region-card source">
                      <span>Da</span>
                      <strong>
                        {transferSourceTerritory.name ?? transferSourceTerritory.id}
                      </strong>
                      <small>
                        Dopo il trasferimento:{" "}
                        {transferSourceTerritory.troops - troopsToMove}
                      </small>
                    </div>
                    <span className="troop-transfer-arrow" aria-hidden="true">
                      →
                    </span>
                    <div className="troop-transfer-region-card target">
                      <span>A</span>
                      <strong>
                        {transferTargetTerritory.name ?? transferTargetTerritory.id}
                      </strong>
                      <small>
                        Dopo il trasferimento:{" "}
                        {transferTargetTerritory.troops + troopsToMove}
                      </small>
                    </div>
                  </div>
                  <div className="troop-transfer-counter">
                    <button type="button" onClick={() => setTroopsToMove(currentValue => Math.max(1, currentValue - 1))} disabled={troopsToMove <= 1 || isPerformingAction}>
                      −
                    </button>
                    <strong>
                      {troopsToMove}
                    </strong>
                    <button type="button" onClick={() => setTroopsToMove(currentValue => Math.min(transferSourceTerritory.troops - 1, currentValue + 1))} disabled={troopsToMove >= transferSourceTerritory.troops - 1 || isPerformingAction}>
                      +
                    </button>
                    <button type="button" className="troop-transfer-max" onClick={() => setTroopsToMove(Math.max(1, transferSourceTerritory.troops - 1))} disabled={isPerformingAction}>
                      MAX
                    </button>
                  </div>
                  <button type="button" className="confirm-troop-transfer-button" onClick={handleConfirmTroopTransfer} disabled={isPerformingAction}>
                    Conferma trasferimento
                  </button>
                </>}
              <button type="button" className="skip-troop-transfer-button" onClick={handleSkipTransfer} disabled={isPerformingAction}>
                Salta trasferimento
              </button>
            </section>}
        <div className="left-sidebar-tools">
          <details className="players-summary-dropdown">
            <summary className="players-summary-toggle">
              <span>Riepilogo</span>
              <span className="players-summary-toggle-icon" aria-hidden="true">
                +
              </span>
            </summary>
            <section className="players-summary-panel">
              <div className="players-summary-list">
                {playerSummaries.map(player => {
                const isCurrentPlayer = player.id === game.currentPlayerId;
                const isLocalPlayer = player.id === localPlayer.id;
                const isEliminated = player.in_game === false || player.territoryCount === 0;
                return <article key={player.id} className={`player-summary-card ${isCurrentPlayer ? "current-player-summary" : ""} ${isEliminated ? "eliminated-player-summary" : ""}`} style={{"--summary-player-color": player.color}}>
                        <header className="player-summary-header">
                          <span className="player-summary-color" aria-hidden="true" />
                          <strong>
                            {player.name}
                          </strong>
                          <span className="player-summary-status">
                            {isEliminated ? "Eliminato" : isCurrentPlayer ? "Turno attuale" : isLocalPlayer ? "Tu" : "In gioco"}
                          </span>
                        </header>
                        <dl className="player-summary-stats">
                          <div>
                            <dt>Territori</dt>
                            <dd>
                              {player.territoryCount}
                            </dd>
                          </div>
                          <div>
                            <dt>Pedine</dt>
                            <dd>
                              {player.totalTroops}
                            </dd>
                          </div>
                          <div>
                            <dt>Difesa</dt>
                            <dd>
                              + {Math.max(0, player.bonus_def ?? 0)}
                            </dd>
                          </div>
                        </dl>
                      </article>;
              })}
              </div>
            </section>
          </details>
        </div>
      </aside>
      <section className="map-area">
        <ItalyMap territories={territories} players={players} currentPlayerId={game.currentPlayerId} onTerritoryClick={handleTerritoryClick} turnMode={game.turnMode} attackingTerritoryId={game.attackingTerritoryId ?? null} defendingTerritoryId={game.defendingTerritoryId ?? null} attackableTerritoryIds={attackableTerritoryIds} transferSourceTerritoryId={game.transferSourceTerritoryId ?? null} transferTargetTerritoryId={game.transferTargetTerritoryId ?? null} transferableTerritoryIds={transferableTerritoryIds} battleEffects={battleEffects} />
        {!isMyTurn && !winner && <div className="online-waiting-turn-banner">
            Attendi il turno di{" "}
            <strong>
              {currentPlayer.name}
            </strong>
          </div>}
      </section>
      <aside className="game-sidebar">
        <header className="game-sidebar-header">
          <p className="online-game-room-code">
            Stanza {room.code}
          </p>
          <h1>Nation&apos;s Conquest</h1>
          <div className="current-player-card" style={{borderColor: currentPlayer.color}}>
            <span>Turno di</span>
            <strong>
              {currentPlayer.name}
            </strong>
          </div>
          <div className="online-local-player-card">
            <span>Tu sei</span>
            <strong style={{color: localPlayer.color}}>{localPlayer.name}
            </strong>
          </div>
          <div className="online-notification-controls">
            {notificationPermission === "default" && <button type="button" className="online-notification-button" onClick={handleEnableNotifications}>
                🔔 Attiva notifiche
              </button>}
            {notificationPermission === "granted" && <span className="online-notification-enabled">
                🔔 Notifiche attive
              </span>}
            {notificationPermission === "denied" && <span className="online-notification-denied">
                🔕 Notifiche bloccate
              </span>}
            {notificationPermission === "unsupported" && <span className="online-notification-denied">
                Notifiche non supportate
              </span>}
          </div>
          {!winner && <button type="button" className="end-attack-mode-button" onClick={handleTemporaryDisconnect} disabled={isPerformingAction}>
              {isPerformingAction ? "Disconnessione..." : "Disconnettiti"}
            </button>}
          <p className="reinforcements">
            <span>
              {game.isInitialPlacement ? "Pedine iniziali da schierare" : "Rinforzi da schierare"}
            </span>
            <strong>
              {game.isInitialPlacement ? game.initialTroopsRemaining[currentPlayer.id] ?? 0 : game.reinforcementsRemaining ?? 0}
            </strong>
          </p>
        </header>
        {game.isInitialPlacement && <section className="initial-placement-panel">
            <p className="initial-placement-kicker">
              Preparazione partita
            </p>
            <h2>Schieramento iniziale</h2>
            <p>
              I territori sono stati assegnati casualmente. Ogni giocatore deve schierare 25 pedine in cinque turni da 5 pedine ciascuno.
            </p>
            <div className="initial-placement-status">
              <span>Giocatore attivo</span>
              <strong style={{color: currentPlayer.color}}>
                {currentPlayer.name}
              </strong>
            </div>
            <div className="initial-placement-counters">
              <p>
                <span>
                  Pedine in questo giro
                </span>
                <strong>
                  {game.placementTurnTroopsRemaining}
                </strong>
              </p>
              <p>
                <span>
                  Pedine totali rimaste
                </span>
                <strong>
                  {game.initialTroopsRemaining[currentPlayer.id] ?? 0}
                </strong>
              </p>
            </div>
            <p className={`online-turn-indicator ${isMyTurn ? "my-turn" : ""}`}>
              {isMyTurn ? "È il tuo turno" : `Attendi ${currentPlayer.name}`}
            </p>
          </section>}
        {!game.isInitialPlacement && <section className="turn-phases">
            <h2>Fasi del turno</h2>
            <table className="turn-table">
              <tbody>
                <tr className={game.reinforcementsRemaining > 0 ? "active-phase" : "completed-phase"}>
                  <td className="phase-number">
                    1
                  </td>
                  <td>
                    <strong>Rinforzi</strong>
                    <span>
                      Posiziona le nuove pedine
                    </span>
                  </td>
                </tr>
                <tr className={game.reinforcementsRemaining === 0 && game.turnMode === null ? "active-phase" : game.reinforcementsRemaining > 0 ? "locked-phase" : "completed-phase"}>
                  <td className="phase-number">
                    2
                  </td>
                  <td>
                    <strong>
                      Scelta modalità
                    </strong>
                    <span>
                      Scegli attacco o difesa
                    </span>
                  </td>
                </tr>
                <tr className={game.turnMode === "attack" ? "active-phase" : ["attack-complete", "defence-complete", "transfer", "transfer-complete", "game-over"].includes(game.turnMode) ? "completed-phase" : "locked-phase"}>
                  <td className="phase-number">
                    3
                  </td>
                  <td>
                    <strong>Azioni</strong>
                    <span>
                      Attacca o attiva la difesa
                    </span>
                  </td>
                </tr>
                <tr className={game.turnMode === "transfer" ? "active-phase" : game.turnMode === "transfer-complete" ? "completed-phase" : ["attack-complete", "defence-complete"].includes(game.turnMode) ? "active-phase" : "locked-phase"}>
                  <td className="phase-number">
                    4
                  </td>
                  <td>
                    <strong>
                      Trasferimento
                    </strong>
                    <span>
                      Sposta pedine tra regioni alleate adiacenti
                    </span>
                  </td>
                </tr>
                <tr className={game.turnMode === "transfer-complete" || game.turnMode === "attack-complete" || game.turnMode === "defence-complete" ? "active-phase" : "locked-phase"}>
                  <td className="phase-number">
                    5
                  </td>
                  <td>
                    <strong>Fine turno</strong>
                    <span>
                      Passa al giocatore successivo
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>}
        {!game.isInitialPlacement && game.reinforcementsRemaining === 0 && game.turnMode === null && <section className="sidebar-actions">
              {isMyTurn ? <>
                  <button type="button" className="attack-button" onClick={() => handleChooseMode("attack")} disabled={isPerformingAction}>
                    Attacca
                  </button>
                  <button type="button" className="defence-button" onClick={() => handleChooseMode("defence")} disabled={isPerformingAction}>
                    Difendi
                  </button>
                </> : <p className="online-turn-indicator">
                  Attendi la scelta di{" "} {currentPlayer.name}
                </p>}
            </section>}
        {!game.isInitialPlacement && game.turnMode === "attack" && <section className="attack-panel">
              <h2>Modalità offensiva</h2>
              {!attackingTerritory && !pendingConquest && <p>
                    Seleziona una tua regione con almeno 2 pedine.
                  </p>}
              {attackingTerritory && <div className="attack-territory-card">
                  <span>
                    Regione attaccante
                  </span>
                  <strong>
                    {attackingTerritory.name ?? attackingTerritory.id}
                  </strong>
                  <small>
                    Pedine:{" "} {attackingTerritory.troops}
                  </small>
                </div>}
              {attackingTerritory && !defendingTerritory && !pendingConquest && <p>
                    Ora seleziona una regione nemica evidenziata in rosso.
                  </p>}
              {defendingTerritory && <div className="defending-territory-card">
                  <span>
                    Regione difensore
                  </span>
                  <strong>
                    {defendingTerritory.name ?? defendingTerritory.id}
                  </strong>
                  <small>
                    Pedine:{" "} {defendingTerritory.troops}
                  </small>
                </div>}
              {attackingTerritory && defendingTerritory && !pendingConquest && isMyTurn && <button type="button" className="confirm-attack-button" onClick={handleConfirmAttack} disabled={isPerformingAction}>
                    Conferma attacco
                  </button>}
              {attackResult && <div className={`attack-result ${attackResult.winner === "attacker" ? "attacker-victory" : "defender-victory"}`}>
                  <h3>
                    Risultato del combattimento
                  </h3>
                  {attackResult.attackerDice !== undefined && <p>
                      Dado attaccante:
                      <strong>
                        {attackResult.attackerDice}
                      </strong>
                    </p>}
                  {attackResult.defenderDice !== undefined && <p>
                      Dado difensore:
                      <strong>
                        {attackResult.defenderDice}
                      </strong>
                    </p>}
                  {attackResult.attackerScore !== undefined && <p>
                      Punteggio attaccante:
                      <strong>
                        {attackResult.attackerScore}
                      </strong>
                    </p>}
                  {attackResult.defenderScore !== undefined && <p>
                      Punteggio difensore:
                      <strong>
                        {attackResult.defenderScore}
                      </strong>
                    </p>}
                  <p>{attackResult.message}</p>
                </div>}
              {isMyTurn && !pendingConquest && <>
                    {(attackingTerritory || defendingTerritory) && <button type="button" className="end-attack-mode-button" onClick={handleResetAttack} disabled={isPerformingAction}>
                        Annulla selezione
                      </button>}
                    <button type="button" className="end-attack-mode-button" onClick={handleFinishAttack} disabled={isPerformingAction}>
                      Termina attacchi
                    </button>
                  </>}
            </section>}
        {!game.isInitialPlacement && game.turnMode === "attack-complete" && <section className="attack-complete-panel">
              <h2>
                Modalità offensiva terminata
              </h2>
              <p>
                Puoi trasferire pedine tra due regioni alleate adiacenti oppure terminare direttamente il turno.
              </p>
              {isMyTurn && <div className="post-action-buttons">
                  <button type="button" className="start-transfer-button" onClick={handleStartTransfer} disabled={isPerformingAction}>
                    Trasferisci pedine
                  </button>
                  <button type="button" className="end-turn-button" onClick={handleEndTurn} disabled={isPerformingAction}>
                    Fine turno
                  </button>
                </div>}
            </section>}
        {!game.isInitialPlacement && game.turnMode === "defence-complete" && <section className="defence-complete-panel">
              <h2>Difesa attivata</h2>
              <p>
                Tutte le regioni del giocatore ricevono un bonus difesa pari a:
              </p>
              <strong className="defence-bonus-value">
                +
                {Math.max(0, currentPlayer.bonus_def ?? 0)}
              </strong>
              <p>
                Il bonus resta attivo durante i turni avversari e scadrà all’inizio del prossimo turno del giocatore.
              </p>
              {isMyTurn && <div className="post-action-buttons">
                  <button type="button" className="start-transfer-button" onClick={handleStartTransfer} disabled={isPerformingAction}>
                    Trasferisci pedine
                  </button>
                  <button type="button" className="end-turn-button" onClick={handleEndTurn} disabled={isPerformingAction}>
                    Fine turno
                  </button>
                </div>}
            </section>}
        {!game.isInitialPlacement && game.turnMode === "transfer-complete" && <section className="transfer-complete-panel">
              <h2>
                Trasferimento completato
              </h2>
              <p>
                Ora puoi terminare il turno.
              </p>
              {isMyTurn && <button type="button" className="end-turn-button" onClick={handleEndTurn} disabled={isPerformingAction}>
                  Fine turno
                </button>}
            </section>}
      </aside>
      <GameChat messages={chatMessages} currentPlayer={localPlayer} onSendMessage={handleSendChatMessage} isSending={isSendingChatMessage} />
      <PauseMenu isOpen={isPauseMenuOpen} mode="online" onResume={handleResumeGame} onOpenSettings={handleOpenSettings} onOpenTutorial={handleOpenTutorial} onExitGame={handleTemporaryDisconnect} isBusy={isPerformingAction} />
      {showInitialPlacementIntro && <div className="placement-intro-overlay" role="status" aria-live="assertive" aria-label="Inizio dello schieramento iniziale">
          <div className="placement-intro-banner">
            <span className="placement-intro-emblem" aria-hidden="true">
              ◆
            </span>
            <span className="placement-intro-kicker">
              Preparazione della conquista
            </span>
            <strong>
              Schiera le tue pedine
            </strong>
            <span className="placement-intro-message">
              Rafforza i territori assegnati e
              prepara la tua strategia
            </span>
            <span className="placement-intro-line" aria-hidden="true" />
          </div>
        </div>}
      {turnTransitionPlayer && <div className="turn-transition-overlay" role="status" aria-live="assertive" aria-label={`Inizia il turno di ${turnTransitionPlayer.name}`}>
          <div className="turn-transition-banner" style={{"--turn-player-color": turnTransitionPlayer.color}}>
            <span className="turn-transition-kicker">
              Nuovo turno
            </span>
            <div className="turn-transition-player-row">
              <span className="turn-transition-player-dot" aria-hidden="true" />
              <strong>
                {turnTransitionPlayer.name}
              </strong>
            </div>
            <span className="turn-transition-message">
              Prepara i rinforzi
            </span>
          </div>
        </div>}
      {eliminatedPlayerNotice && !winner && <div className="player-eliminated-overlay" role="status" aria-live="assertive">
            <div className="player-eliminated-card" style={{"--eliminated-player-color": eliminatedPlayerNotice.color}}>
              <span className="player-eliminated-kicker">
                Giocatore eliminato
              </span>
              <strong>
                {eliminatedPlayerNotice.name}
              </strong>
              <span>
                Non possiede più territori
              </span>
            </div>
          </div>}
      {pendingConquest && showConquestTransferModal && !winner && <div className="conquest-transfer-overlay" role="presentation">
          <section className="conquest-transfer-modal" role="dialog" aria-modal="true" aria-labelledby="online-conquest-title">
            <div className="conquest-icon">
              ★
            </div>
            <p className="conquest-kicker">
              Vittoria
            </p>
            <h2 id="online-conquest-title">
              Regione conquistata
            </h2>
            <p className="conquest-description">
              {isMyTurn ? <>
                  Hai sconfitto la regione{" "}
                  <strong>
                    {defendingTerritory?.name ?? defendingTerritory?.id}
                  </strong>
                  . Scegli quante pedine trasferire.
                </> : <>
                  <strong>
                    {currentPlayer.name}
                  </strong>{" "}
                  ha conquistato la regione{" "}
                  <strong>
                    {defendingTerritory?.name ?? defendingTerritory?.id}
                  </strong>
                  . Sta scegliendo quante pedine trasferire.
                </>}
            </p>
            <p className="transfer-limit">
              Puoi trasferire da 1 a{" "}
              <strong>
                {Math.max(1, pendingConquest.maximumTransfer ?? 1)}
              </strong>{" "}
              pedine.
            </p>
            <div className="transfer-counter">
              <button type="button" className="transfer-counter-button" onClick={() => handleConquestTransferSelection(selectedConquestTransfer - 1)} disabled={!isMyTurn || selectedConquestTransfer <= 1 || isPerformingAction}>
                −
              </button>
              <strong className="transfer-counter-value">
                {selectedConquestTransfer}
              </strong>
              <button type="button" className="transfer-counter-button" onClick={() => handleConquestTransferSelection(selectedConquestTransfer + 1)} disabled={!isMyTurn || selectedConquestTransfer >= (pendingConquest.maximumTransfer ?? 1) || isPerformingAction}>
                +
              </button>
              <button type="button" className="transfer-max-button" onClick={() => handleConquestTransferSelection(Math.max(1, pendingConquest.maximumTransfer ?? 1))} disabled={!isMyTurn || isPerformingAction}>
                MAX
              </button>
            </div>
            <div className="transfer-preview">
              <p>
                <span>
                  {attackingTerritory?.name ?? attackingTerritory?.id}
                </span>
                <strong>
                  {Math.max(1, (attackingTerritory?.troops ?? 1) - selectedConquestTransfer)}
                </strong>
              </p>
              <p>
                <span>
                  {defendingTerritory?.name ?? defendingTerritory?.id}
                </span>
                <strong>
                  {selectedConquestTransfer}
                </strong>
              </p>
            </div>
            {isMyTurn ? <button type="button" className="confirm-transfer-button" onClick={handleConfirmConquestTransfer} disabled={isPerformingAction}>
                Conferma trasferimento
              </button> : <p className="online-turn-indicator">
                Attendi la scelta di{" "}
                <strong>
                  {currentPlayer.name}
                </strong>
                .
              </p>}
          </section>
        </div>}
      {winner && <div className="victory-overlay" role="dialog" aria-modal="true" aria-labelledby="online-victory-title">
          <section className="victory-modal" style={{"--winner-color": winner.color}}>
            <div className="victory-symbol">
              ★
            </div>
            <p className="victory-kicker">
              Partita terminata
            </p>
            <h2 id="online-victory-title">
              {winner.name} ha conquistato
              l&apos;Italia
            </h2>
            <p>
              Tutti gli altri giocatori sono stati eliminati.
            </p>
            <div className="online-reward-card">
              {isClaimingReward && <p>
                  Calcolo ricompensa...
                </p>}
              {!isClaimingReward && gameReward && <>
                    <span>
                      Ricompensa partita
                    </span>
                    <strong>
                      +{gameReward.xpAwarded} XP
                    </strong>
                    {gameReward.isWinner ? <small>
                        20 XP partita completata
                        + 30 XP vittoria
                      </small> : <small>
                        20 XP per aver completato
                        la partita
                      </small>}
                    {!gameReward.alreadyClaimed && gameReward.newLevel > gameReward.previousLevel && <p className="online-level-up-message">
                          ★ Nuovo livello:{" "}
                          {gameReward.newLevel}
                        </p>}
                  </>}
            </div>
            <button type="button" className="restart-game-button" onClick={() => navigate("/online")}>
              Torna alla modalità online
            </button>
          </section>
        </div>}
    </main>;
}
export default OnlineGamePage;