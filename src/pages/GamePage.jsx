import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  useLocation,
  useNavigate,
} from "react-router-dom";
import { ItalyMap } from "../components/game/ItalyMap";
import GameChat from "../components/game/GameChat";
import PauseMenu from "../components/game/PauseMenu";
import GameNotification from "../components/ui/GameNotification";
import useGameAudio from "../hooks/useGameAudio";
import useGameNotification from "../hooks/useGameNotification";
import {
  clearSavedLocalGame,
  loadLocalGame,
  saveLocalGame,
} from "../utils/localGameStorage";
import {
  player_list,
  territory_list,
} from "../data/setup_game";
import "./GamePage.css";
import "./ResponsiveGame.css";

const CONQUEST_MODAL_DELAY = 1250; //Attesa prima dela finestra di conquista
const TURN_TRANSITION_DURATION = 2600; //Annuncio nuovo turno
const INITIAL_PLACEMENT_INTRO_DURATION = 2400; //Introduzione dello schieramento
const ELIMINATION_NOTICE_DURATION = 2200; //Avviso di eliminazione
const INITIAL_TROOPS_PER_PLAYER = 25; //Truppe iniziali
const INITIAL_TROOPS_PER_PLACEMENT_TURN = 5; // Truppe da piazzare per turno
const GAME_MUSIC = "/audio/game-music.wav";
const ATTACK_SOUND = "/audio/attack.wav";
const CONQUEST_SOUND = "/audio/conquest.wav";
const TURN_SOUND = "/audio/turn.wav";
const ELIMINATION_SOUND = "/audio/elimination.wav";
const VICTORY_SOUND = "/audio/victory.wav";

function shuffleArray(items) {
  const shuffledItems = [...items];
  for (let i = shuffledItems.length - 1; i > 0; i -= 1){
    const randomIndex = Math.floor( Math.random() * (i + 1));
    [shuffledItems[i], shuffledItems[randomIndex],] = [shuffledItems[randomIndex],shuffledItems[i]];
  }
  return shuffledItems;
}
//Prepariamo i giocatori per una nuova partita
function createPlayersForNewGame(players) {
  return players.map((player) => ({
    ...player, bonus_def: 0, activated_def: false, in_game: true,
  }));
}

function createRandomInitialTerritories(players) {
  const shuffledTerritories = shuffleArray(territory_list);
  const activePlayerIds = players.filter((player) => player.in_game !== false).map((player) => player.id);
  return shuffledTerritories.map((territory, index) => ({
      ...territory,owner: activePlayerIds[index % activePlayerIds.length],troops: 0,
    })
  );
}
//Indica quante pedine deve ancora distribuire un giocatore
function createInitialTroopsRemaining(players){
  return Object.fromEntries(players.map((player) => [ player.id,INITIAL_TROOPS_PER_PLAYER]));
}

function GamePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const {playMusic, stopMusic, playEffect} = useGameAudio();
  const {notification,showNotification,dismissNotification} = useGameNotification();
  const savedGameRef = useRef(loadLocalGame()); 
  const savedGame = savedGameRef.current;
  const initialPlayers = savedGame?.players ?? location.state?.players ?? player_list;
  const startingPlayers = savedGame?.players ?? createPlayersForNewGame(initialPlayers);
  const [players, setPlayers] = useState(startingPlayers);
  const [territories, setTerritories] = useState(() => savedGame?.territories ?? createRandomInitialTerritories(startingPlayers));
  const [currentPlayerId,setCurrentPlayerId] = useState(savedGame?.currentPlayerId ??"player 1"); //Contiene identificativo del giocatore di turno
  const [reinforcementsRemaining,setReinforcementsRemaining] = useState(savedGame?.reinforcementsRemaining ?? 0); //Numero di rinforzi che deve posizionare durante un turno normale
  const [selectedTerritoryId,setSelectedTerritoryId] = useState(savedGame?.selectedTerritoryId ?? null); //Identificativo della regione selezionata dall'utente
  const [chatMessages, setChatMessages] = useState(savedGame?.chatMessages ?? []);
  const [turnMode, setTurnMode] = useState(savedGame?.turnMode ?? null);
  const [isInitialPlacement,setIsInitialPlacement] = useState(savedGame?.isInitialPlacement ?? true); //indica se siamo ancora nello schieramento iniziale
  const [initialTroopsRemaining,setInitialTroopsRemaining] = useState(() => savedGame?.initialTroopsRemaining ?? createInitialTroopsRemaining(startingPlayers)); //Associa ogni giocatore al numero di pedine ancora da distribuire
  const [placementTurnTroopsRemaining,setPlacementTurnTroopsRemaining] = useState(savedGame?.placementTurnTroopsRemaining ?? INITIAL_TROOPS_PER_PLACEMENT_TURN);
  const [attackingTerritoryId,setAttackingTerritoryId] = useState(savedGame?.attackingTerritoryId ?? null);
  const [defendingTerritoryId,setDefendingTerritoryId] = useState(savedGame?.defendingTerritoryId ?? null);
  const [attackableTerritoryIds,setAttackableTerritoryIds] = useState(savedGame?.attackableTerritoryIds ?? []);
  const [attackResult, setAttackResult] = useState(savedGame?.attackResult ?? null);
  const [battleEffects, setBattleEffects] = useState([]); //Effetti grafici associati alle battaglie
  const [conquestTransfer, setConquestTransfer] = useState(savedGame?.conquestTransfer ?? null);
  const [troopsToTransfer, setTroopsToTransfer] = useState(savedGame?.troopsToTransfer ?? 1);
  const [transferSourceTerritoryId, setTransferSourceTerritoryId] = useState(savedGame?.transferSourceTerritoryId ?? null); //Regione dalla quale vogliamo spostare le pedine
  const [transferTargetTerritoryId,setTransferTargetTerritoryId] = useState(savedGame?.transferTargetTerritoryId ?? null); //Regione di destinazione
  const [troopsToMove,setTroopsToMove] = useState(savedGame?.troopsToMove ?? 1);
  const [showConquestTransferModal,setShowConquestTransferModal] = useState(Boolean(savedGame?.conquestTransfer)); //Controllo della finestra di conquista
  const [showInitialPlacementIntro, setShowInitialPlacementIntro] = useState(false); //Controlla animazione introduttiva dello schieramento iniziale
  const [turnTransitionPlayer,setTurnTransitionPlayer] = useState(null); //Giocatore mostrato nell'animazione di inizio turno.
  const [eliminatedPlayerNotice,setEliminatedPlayerNotice] = useState(null); //Avviso grafico del giocatore eliminato
  const [winner, setWinner] = useState(savedGame?.winner ?? null); //Avviso del giocatore che ha vinto
  const [isPauseMenuOpen, setIsPauseMenuOpen] = useState(location.state?.openPauseMenu ?? false); //Controlla se il menu di pausa è aperto
  //Riferimenti ai timer
  const conquestModalTimerRef = useRef(null); //Timer finestra di conquista
  const turnTransitionTimerRef = useRef(null); //Timer animazione cambio turno
  const initialPlacementIntroTimerRef = useRef(null); //Timer introduzione allo schieramento iniziale
  const eliminationNoticeTimerRef = useRef(null); //Timer avviso eliminazione
  const battleEffectTimersRef = useRef([]); //Timer effetti grafici delle battaglie
  //Avvia la musica della partita
  useEffect(() => {
    playMusic(GAME_MUSIC);
    return () => {
      stopMusic();
    };
  },[playMusic, stopMusic]);

  const currentPlayer = players.find((player) => player.id === currentPlayerId);
  const selectedTerritory = territories.find((territory) => territory.id === selectedTerritoryId);
  const selectedTerritoryOwner = selectedTerritory? players.find((player) =>player.id === selectedTerritory.owner): null;
  const attackingTerritory = territories.find((territory) => territory.id === attackingTerritoryId);
  const defendingTerritory = territories.find((territory) => territory.id === defendingTerritoryId);
  const transferSourceTerritory = territories.find((territory) => territory.id === transferSourceTerritoryId);
  const transferTargetTerritory = territories.find((territory) => territory.id === transferTargetTerritoryId);
  const transferableTerritoryIds = transferSourceTerritory?(transferSourceTerritory.adjacent_territory ?? []).filter((territoryId) => {
    const territory = territories.find((item) => item.id === territoryId);
    return(territory?.owner === currentPlayerId);
  }): [];
//Annulliamo i timer quando il componente viene smontato
  useEffect(() => {
    return () => {
      if (conquestModalTimerRef.current) {
        clearTimeout(conquestModalTimerRef.current);
      }
      if (turnTransitionTimerRef.current) {
        clearTimeout(turnTransitionTimerRef.current);
      }
      if (initialPlacementIntroTimerRef.current) {
        clearTimeout(initialPlacementIntroTimerRef.current);
      }
      if (eliminationNoticeTimerRef.current) {
        clearTimeout(eliminationNoticeTimerRef.current);
      }
      battleEffectTimersRef.current.forEach((timerId) => clearTimeout(timerId)); //Esegue la funzione di timeout per ogni elemento dell'array
    };
  }, []);

 //Controlla la sequenza introduttiva della partita
  useEffect(() => {
    if(savedGame){
      return undefined;
    }
    showInitialPlacementSequence(currentPlayerId);
    return () => {
      if(initialPlacementIntroTimerRef.current){
        clearTimeout(initialPlacementIntroTimerRef.current);
        initialPlacementIntroTimerRef.current =null;
      }
      if(turnTransitionTimerRef.current) {
        clearTimeout(turnTransitionTimerRef.current);
        turnTransitionTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  //Salvataggio automatico della partita
  useEffect(() => {
    saveLocalGame({
      players,
      territories,
      currentPlayerId,
      reinforcementsRemaining,
      selectedTerritoryId,
      chatMessages,
      turnMode,
      isInitialPlacement,
      initialTroopsRemaining,
      placementTurnTroopsRemaining,
      attackingTerritoryId,
      defendingTerritoryId,
      attackableTerritoryIds,
      attackResult,
      conquestTransfer,
      troopsToTransfer,
      transferSourceTerritoryId,
      transferTargetTerritoryId,
      troopsToMove,
      winner,
    });
  }, [
    players,
    territories,
    currentPlayerId,
    reinforcementsRemaining,
    selectedTerritoryId,
    chatMessages,
    turnMode,
    isInitialPlacement,
    initialTroopsRemaining,
    placementTurnTroopsRemaining,
    attackingTerritoryId,
    defendingTerritoryId,
    attackableTerritoryIds,
    attackResult,
    conquestTransfer,
    troopsToTransfer,
    transferSourceTerritoryId,
    transferTargetTerritoryId,
    troopsToMove,
    winner,
  ]);

  //Apriamo e chiudiamo il menu di pausa con ESC
  useEffect(() => {
    function handleEscapeKey(event){
      if(event.key !== "Escape" || winner){
        return;
      }
      setIsPauseMenuOpen((currentValue) => !currentValue);
    }
    window.addEventListener("keydown",handleEscapeKey);
    return () => { //Quando l'effetto viene pulito rimuoviamo l'ascoltatore
      window.removeEventListener("keydown", handleEscapeKey);
    };
  }, [winner]); //Quando winner cambia react pulisce il vecchio effetto e registra il listener aggiornato
  if (!currentPlayer) {
    return <p>Giocatore corrente non trovato.</p>;
  }

  function handleOpenPauseMenu(){
    playEffect("/audio/click.wav");
    setIsPauseMenuOpen(true);
  }

  function handleResumeGame(){
    playEffect("/audio/click.wav");
    setIsPauseMenuOpen(false);
  }

  function handleOpenSettings(){
  playEffect("/audio/click.wav");
  navigate("/settings", {state: {returnTo: "/game", reopenPauseMenu: true}});
  }

  function handleOpenTutorial() {
  playEffect("/audio/click.wav");
  navigate("/tutorial", {state: {returnTo: "/game", reopenPauseMenu: true}});
  }

  function handleExitLocalGame() {
    const confirmed = window.confirm("Vuoi tornare al menu? La partita locale resterà salvata.");
    if (!confirmed) {
      return;
    }
    playEffect("/audio/click.wav");
    stopMusic();
    navigate("/");
  }

  function handleSendChatMessage(text) {
    const trimmedText = text.trim();
    if (!trimmedText){ //Evitiamo messaggi vuoti
      return;
    }
    const newMessage = {
      id: `${Date.now()}-${Math.random()}`,
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      playerColor: currentPlayer.color,
      text: trimmedText,
    };
    setChatMessages((currentMessages) => [...currentMessages,newMessage]); //Aggiunge messaggio alla chat senza eliminare quelli vecchi
  }
  //Restituiamo tutti i territori appartenenti a un giocatore
  function getOwnedTerritories(playerId) {
    return territories.filter((territory) => territory.owner === playerId);
  }
  //Tutti i territori di un giocatore che non contengono truppe
  function getEmptyOwnedTerritories(playerId) {
    return getOwnedTerritories(playerId).filter(
      (territory) => territory.troops === 0
    );
  }

  function getNextPlacementPlayerId(updatedTroopsRemaining){
    const currentPlayerIndex = players.findIndex((player) => player.id === currentPlayerId);
    for(let i = 1;i <= players.length;i += 1){
      const nextPlayer = players[(currentPlayerIndex + i) % players.length];
      if(nextPlayer.in_game !== false && updatedTroopsRemaining[nextPlayer.id] > 0){
        return nextPlayer.id;
      }
    }
    return null;
  }

  //Eseguita quando tutti i giocatori hanno terminato la distribuzione delle 25 pedine iniziali
  function finishInitialPlacement(){
    const firstPlayerId = players[0]?.id ?? "player 1";
    setIsInitialPlacement(false);
    setCurrentPlayerId(firstPlayerId);
    setSelectedTerritoryId(null);
    setReinforcementsRemaining(getReinforcementsForPlayer(firstPlayerId));
    setTurnMode(null); //Riporta il turno allo stato iniziale
    showTurnTransition(firstPlayerId);
  }

  //Gestisce il posizionamento di una pedina durante lo schieramento iniziale
  function handleInitialTroopPlacement() {
    if (!isInitialPlacement){
      showNotification("Lo schieramento iniziale è già terminato.","warning");
      return;
    }
    if (!selectedTerritory){
      showNotification("Seleziona prima una tua regione sulla mappa.","warning");
      return;
    }
    if(selectedTerritory.owner !== currentPlayerId) {
      showNotification("Puoi schierare pedine soltanto nelle tue regioni.","error");
      return;
    }

    const playerTroopsRemaining = initialTroopsRemaining[currentPlayerId] ?? 0;

    if (playerTroopsRemaining <= 0 || placementTurnTroopsRemaining <= 0) {
      showNotification("Non hai altre pedine da schierare in questo turno.","warning");
      return;
    }

    const emptyOwnedTerritories = getEmptyOwnedTerritories(currentPlayerId);
    //Impediamo al giocatore di lasciare territori liberi 
    const mustFillEmptyTerritory = playerTroopsRemaining === emptyOwnedTerritories.length;
    if (mustFillEmptyTerritory && selectedTerritory.troops > 0){
      showNotification("Devi prima inserire almeno una pedina in ogni tua regione.","warning");
      return;
    }
    //Aggiunge una pedina alla regione selezionata
    setTerritories((currentTerritories) => currentTerritories.map((territory) => territory.id === selectedTerritory.id?{...territory, troops: territory.troops + 1,}: territory));

    const updatedPlayerTroopsRemaining = playerTroopsRemaining - 1; //Diminuiamo il numero di pedine ancora disponibili
    const updatedTroopsRemaining = {...initialTroopsRemaining,[currentPlayerId]:updatedPlayerTroopsRemaining}; //crea una copia delle pedine rimanenti e aggiorna solo quelle del giocatore corrente
    const updatedPlacementTurnRemaining = placementTurnTroopsRemaining - 1; //Diminuiamo il numero di pedine che possiamo schierare nel turno corrente

    setInitialTroopsRemaining(updatedTroopsRemaining); //pedine che rimangono complessivamente al giocatore
    setPlacementTurnTroopsRemaining(updatedPlacementTurnRemaining); //Pedine che può posizionare in un turno

    const allTroopsPlaced = Object.values(updatedTroopsRemaining).every((remainingTroops) => remainingTroops === 0);

    if(allTroopsPlaced) {
      finishInitialPlacement();
      return;
    }
    //Distrubuite 5 pedine o terminate le 25 iniziali
    const placementTurnFinished = updatedPlacementTurnRemaining === 0 || updatedPlayerTroopsRemaining === 0;

    if (!placementTurnFinished){
      return;
    }

    const nextPlayerId = getNextPlacementPlayerId(updatedTroopsRemaining);

    if(nextPlayerId){
      showTurnTransition(nextPlayerId);
      setCurrentPlayerId(nextPlayerId);
      setSelectedTerritoryId(null);
      setPlacementTurnTroopsRemaining(Math.min(INITIAL_TROOPS_PER_PLACEMENT_TURN,updatedTroopsRemaining[nextPlayerId]));
    }
  }

  function getEnemyAdjacentTerritories(territory) {
    const adjacentIds = territory.adjacent_territory ?? [];
    return adjacentIds.filter((adjacentId) => { //Restituisce un array contenente le regioni adiacenti
      const adjacentTerritory = territories.find((item) => item.id === adjacentId);
      return(adjacentTerritory && adjacentTerritory.owner !== currentPlayerId);
    });
  }

  function createBattleEffect(territoryId,lostTroops,color){
    if (lostTroops <= 0) {
      return;
    }
    const newEffect = { //Effetto grafico che compare sulla mappa quando un giocatore perde pedine durante una battaglia
      id: `${Date.now()}-${Math.random()}`,
      territoryId,
      lostTroops,
      color,
    };
    setBattleEffects((currentEffects) => [...currentEffects, newEffect]); //Aggiungiamo il nuovo effetto all'array degli effetti
    const timerId = setTimeout(() => { //creiamo un timer che dopo 1.2 sec elimina l'effetto grafico
      setBattleEffects((currentEffects) => currentEffects.filter((effect) => effect.id !== newEffect.id));
      battleEffectTimersRef.current = battleEffectTimersRef.current.filter((currentTimerId) => currentTimerId !== timerId);
    }, 1200);
    battleEffectTimersRef.current.push(timerId); //Registriamo il nuovo timer nell'array contenuto nella ref
  }
  //Cancella la selezione dei territori durante la modalità attacco
  function resetAttackSelection() {
    setAttackingTerritoryId(null);
    setDefendingTerritoryId(null);
    setAttackableTerritoryIds([]);
  }
  //Cancella il timer associato alla finestra di conquista
  function clearConquestModalTimer() {
    if (!conquestModalTimerRef.current) {
      return;
    }
    clearTimeout(conquestModalTimerRef.current);
    conquestModalTimerRef.current = null;
  }

  function showInitialPlacementSequence(playerId){
    //Elimino i timer per evitare interferenze
    if (initialPlacementIntroTimerRef.current) {
      clearTimeout(initialPlacementIntroTimerRef.current);
    }
    if (turnTransitionTimerRef.current) {
      clearTimeout(turnTransitionTimerRef.current);
      turnTransitionTimerRef.current = null;
    }
    setTurnTransitionPlayer(null); //Rimuove annuncio di cambio turno
    setShowInitialPlacementIntro(true); //Attiviamo l'introduzione
    initialPlacementIntroTimerRef.current = setTimeout(() => {
        setShowInitialPlacementIntro(false);
        initialPlacementIntroTimerRef.current = null;
        showTurnTransition(playerId);
      }, INITIAL_PLACEMENT_INTRO_DURATION); //Dopo INITIAL_PLACEMENT_INTRO_DURATION ripristino il riferimento al timer e mostriamo l'annuncio al giocatore corrente
  }

  function showTurnTransition(playerId){ //Gestisce animazione cambio turno
    const playerToShow = players.find((player) => player.id === playerId);
    if (!playerToShow) {
      return;
    }
    if (turnTransitionTimerRef.current) {
      clearTimeout(turnTransitionTimerRef.current);
    }
    setTurnTransitionPlayer(playerToShow);
    playEffect(TURN_SOUND);
    turnTransitionTimerRef.current = setTimeout(() => {
        setTurnTransitionPlayer(null);
        turnTransitionTimerRef.current = null;
      }, TURN_TRANSITION_DURATION);
  }

  function getNextActivePlayerId(){
    const currentPlayerIndex = players.findIndex((player) => player.id === currentPlayerId);
    if (currentPlayerIndex === -1) {
      return null;
    }
    for(let i = 1;i <= players.length;i += 1) {
      const nextPlayerIndex = (currentPlayerIndex + i) % players.length;
      const nextPlayer = players[nextPlayerIndex];
      const isStillInGame = nextPlayer.in_game !== false;
      const ownsTerritories = territories.some((territory) => territory.owner === nextPlayer.id);
      if (isStillInGame && ownsTerritories) {
        return nextPlayer.id;
      }
    }
    return null;
  }
  //Calcolo delle pedine di inizio turno
  function getReinforcementsForPlayer(playerId) {
    const ownedTerritories = territories.filter((territory) => territory.owner === playerId).length;
    if (ownedTerritories === 0) {
      return 0;
    }
    if (ownedTerritories <= 2) {
      return 3;
    }
    return Math.min(6,Math.max(2,Math.floor(ownedTerritories / 2)));
  }

  function handleEndTurn() {
    if(winner){
      return;
    }
    const canEndTurn = turnMode === "attack-complete" || turnMode === "defence-complete" || turnMode === "transfer-complete";
    if(conquestTransfer){
      showNotification("Devi prima completare il trasferimento della conquista.","warning");
      return;
    }
    if(!canEndTurn){
      showNotification("Completa l'azione del turno prima di passare al giocatore successivo.","warning");
      return;
    }
    const nextPlayerId = getNextActivePlayerId();
    if (!nextPlayerId) {
     return;
    }
    const nextPlayerReinforcements = getReinforcementsForPlayer(nextPlayerId);
    //Ripristiniamo gli stati del precendete giocatore in default
    clearConquestModalTimer();
    resetAttackSelection();
    setAttackResult(null);
    setSelectedTerritoryId(null);
    setConquestTransfer(null);
    setShowConquestTransferModal(false);
    setTroopsToTransfer(1);
    setTransferSourceTerritoryId(null);
    setTransferTargetTerritoryId(null);
    setTroopsToMove(1);
    setBattleEffects([]);
    //Elimina il bonus difesa del turno precedente
    setPlayers((currentPlayers) => currentPlayers.map((player) => player.id === nextPlayerId? {...player, bonus_def: 0,activated_def: false}: player)); 
    showTurnTransition(nextPlayerId); //Annuncio grafico del nuovo turno
    setCurrentPlayerId(nextPlayerId); //Cambio effettivo del giocatore
    setReinforcementsRemaining(nextPlayerReinforcements);
    setTurnMode(null); //Riporta il nuovo giocatore alla fase iniziale
  }

  //Mostra un avviso quando un giocatore viene eliminato
  function showEliminationNotice(player){
    if(!player){
      return;
    }
    if(eliminationNoticeTimerRef.current){ //Puliamo timer di un avviso di eliminazine già esistente
      clearTimeout(eliminationNoticeTimerRef.current);
    }
    setEliminatedPlayerNotice(player);
    eliminationNoticeTimerRef.current = setTimeout(() => {
        setEliminatedPlayerNotice(null);
        eliminationNoticeTimerRef.current = null;
      }, ELIMINATION_NOTICE_DURATION);
  }

  function evaluatePlayersAfterConquest(updatedTerritories,defeatedPlayerId){
    const activePlayerIds = new Set(updatedTerritories.map((territory) => territory.owner)); //Almeno un territorio
    const defeatedPlayer = players.find((player) => player.id === defeatedPlayerId);
    const defeatedPlayerHasTerritories = activePlayerIds.has(defeatedPlayerId); //Verifichiamo se il giocatore sconfitto possiede almeno un territorio
    if(defeatedPlayer && !defeatedPlayerHasTerritories){ //Se esiste e non possiede più territori
      setPlayers((currentPlayers) => currentPlayers.map((player) => player.id === defeatedPlayerId? {...player,in_game: false, bonus_def: 0, activated_def: false}: player));
      showEliminationNotice(defeatedPlayer);
      playEffect(ELIMINATION_SOUND);
    }
    const survivingPlayers = players.filter((player) => player.in_game !== false && activePlayerIds.has(player.id));
    if (survivingPlayers.length === 1) {
      stopMusic();
      playEffect(VICTORY_SOUND);
      setWinner(survivingPlayers[0]);
      setTurnMode("game-over");
      resetAttackSelection();
      clearConquestModalTimer();
      setConquestTransfer(null);
      setShowConquestTransferModal(false);
    }
  }

  function handleRestartGame(){
    clearSavedLocalGame();
    savedGameRef.current = null;
    playMusic(GAME_MUSIC);
    const resetPlayers = createPlayersForNewGame(initialPlayers);
    const firstPlayerId = resetPlayers[0]?.id ?? "player 1";
    //Cancelliamo timer della partita precedente
    if (conquestModalTimerRef.current){
      clearTimeout(conquestModalTimerRef.current);
      conquestModalTimerRef.current = null;
    }
    if (turnTransitionTimerRef.current) {
      clearTimeout(turnTransitionTimerRef.current);
      turnTransitionTimerRef.current = null;
    }
    if (initialPlacementIntroTimerRef.current) {
      clearTimeout(initialPlacementIntroTimerRef.current);
      initialPlacementIntroTimerRef.current = null;
    }
    if (eliminationNoticeTimerRef.current) {
      clearTimeout(eliminationNoticeTimerRef.current);
      eliminationNoticeTimerRef.current = null;
    }
    battleEffectTimersRef.current.forEach((timerId) => clearTimeout(timerId)); //Annullimamo tutti i timer
    battleEffectTimersRef.current = [];
    setPlayers(resetPlayers); //Aggiorna lo stato dei giocatori con quelli appena ripristinati
    setTerritories(createRandomInitialTerritories(resetPlayers));
    setCurrentPlayerId(firstPlayerId);
    setIsInitialPlacement(true);
    setInitialTroopsRemaining(createInitialTroopsRemaining(resetPlayers)); 
    setPlacementTurnTroopsRemaining(Math.min(INITIAL_TROOPS_PER_PLACEMENT_TURN,INITIAL_TROOPS_PER_PLAYER));
    //Azzeriamo degli stati della partita
    setReinforcementsRemaining(0);
    setSelectedTerritoryId(null);
    setChatMessages([]);
    setTurnMode(null);
    setAttackingTerritoryId(null);
    setDefendingTerritoryId(null);
    setAttackableTerritoryIds([]);
    setAttackResult(null);
    setBattleEffects([]);
    setConquestTransfer(null);
    setTroopsToTransfer(1);
    setShowConquestTransferModal(false);
    setTransferSourceTerritoryId(null);
    setTransferTargetTerritoryId(null);
    setTroopsToMove(1);
    setShowInitialPlacementIntro(false);
    setTurnTransitionPlayer(null);
    setEliminatedPlayerNotice(null);
    setWinner(null);
    showInitialPlacementSequence(firstPlayerId);
  }

  function handleStartDefenceMode(){
    if (reinforcementsRemaining > 0){
      showNotification("Devi prima posizionare tutti i rinforzi.","warning");
      return;
    }
    if (turnMode !== null) {
      showNotification("Hai già scelto la modalità di questo turno.","warning");
      return;
    }
    const ownedTerritories =territories.filter((territory) =>territory.owner === currentPlayerId).length;
    if (ownedTerritories === 0) {
      return;
    }
    const defenceBonus = Math.min(6,Math.floor(ownedTerritories / 2) + 1);
    clearConquestModalTimer();
    resetAttackSelection();
    setAttackResult(null);
    setConquestTransfer(null);
    setShowConquestTransferModal(false);
    setTroopsToTransfer(1);
    setPlayers((currentPlayers) => currentPlayers.map((player) => player.id === currentPlayerId? { ...player, bonus_def: defenceBonus, activated_def: true} : player));
    setTurnMode("defence-complete"); //Evita di poter scegliere di attaccare
  }

  function handleStartAttackMode() {
    if (reinforcementsRemaining > 0) {
      showNotification("Devi prima posizionare tutti i rinforzi.","warning");
      return;
    }
    clearConquestModalTimer();
    setTurnMode("attack");
    setAttackResult(null);
    setConquestTransfer(null);
    setShowConquestTransferModal(false);
    setTroopsToTransfer(1);
    resetAttackSelection();
  }

  function handleAttackTerritorySelection(clickedTerritory){
    if(conquestTransfer){
      return;
    }
    if (!attackingTerritoryId) {
      const isOwnedByCurrentPlayer = clickedTerritory.owner === currentPlayerId;
      const hasEnoughTroops = clickedTerritory.troops >= 2;
      if (!isOwnedByCurrentPlayer) {
        showNotification("Per attaccare devi selezionare una tua regione.","error");
        return;
      }
      if (!hasEnoughTroops) {
        showNotification("La regione attaccante deve avere almeno 2 pedine.","warning");
        return;
      }
      const enemyAdjacentTerritories = getEnemyAdjacentTerritories(clickedTerritory);
      if (enemyAdjacentTerritories.length === 0) {
        showNotification("Questa regione non confina con territori nemici.","warning");
        return;
      }
      setAttackingTerritoryId(clickedTerritory.id);
      setDefendingTerritoryId(null);
      setAttackableTerritoryIds(enemyAdjacentTerritories);
      setAttackResult(null);
      return;
    }
    if(clickedTerritory.id === attackingTerritoryId){ //Clicchiamo la regione attaccante per deselezionarla
      resetAttackSelection();
      setAttackResult(null);
      return;
    }
    if(clickedTerritory.owner === currentPlayerId){
      if (clickedTerritory.troops < 2) {
        showNotification("La regione attaccante deve avere almeno 2 pedine.", "warning");
        return;
      }
      const enemyAdjacentTerritories =  getEnemyAdjacentTerritories(clickedTerritory);
      if (enemyAdjacentTerritories.length === 0) {
        showNotification("Questa regione non confina con territori nemici.","warning");
        return;
      }
      setAttackingTerritoryId(clickedTerritory.id);
      setDefendingTerritoryId(null);
      setAttackableTerritoryIds(enemyAdjacentTerritories);
      setAttackResult(null);
      return;
    }
    const canBeAttacked = attackableTerritoryIds.includes(clickedTerritory.id);
    if(!canBeAttacked){
      showNotification("Puoi attaccare soltanto una regione nemica adiacente evidenziata in rosso.", "warning");
      return;
    }
    setDefendingTerritoryId(clickedTerritory.id);
    setAttackResult(null);
  }

  function handleTerritoryClick(territoryId) { //Collega i click dell'utente alla mappa
    if(conquestTransfer || winner) {
      return;
    }
    const clickedTerritory = territories.find((territory) => territory.id === territoryId);
    if(!clickedTerritory){
      return;
    }
    if(isInitialPlacement) {
      if(clickedTerritory.owner !== currentPlayerId){
        showNotification("Durante lo schieramento puoi selezionare soltanto le tue regioni.","warning");
        return;
      }
      setSelectedTerritoryId(territoryId); //Salviamo la regione selezionata
      return;
    }
    setSelectedTerritoryId(territoryId);
    if (!clickedTerritory) {
      return;
    }
    if (reinforcementsRemaining > 0) {
      return;
    }
    if (turnMode === "attack") {
      handleAttackTerritorySelection(clickedTerritory);
      return;
    }
    if (turnMode === "transfer") {
      handleTransferTerritorySelection(clickedTerritory);
    }
  }

  function resetTroopTransferSelection(){ //Ripristina la selezione dei territori utilizzati per il trasferimento strategico
    setTransferSourceTerritoryId(null); //Cancelliamo il territorio da cui vogliamo spostare le pedine
    setTransferTargetTerritoryId(null); //Cancelliamo il territorio a cui vogliamo spostare le pedine
    setTroopsToMove(1); //Ripristiniamo  il numero di pedine da trasferire
  }

  function handleStartTroopTransfer() { //Attiva modalità di trasferimento
    resetAttackSelection();
    setAttackResult(null);
    resetTroopTransferSelection();
    setSelectedTerritoryId(null);
    setTurnMode("transfer");
  }

  function handleSkipTroopTransfer() {
    resetTroopTransferSelection();
    setSelectedTerritoryId(null);
    setTurnMode("transfer-complete");
  }

  function handleTransferTerritorySelection(clickedTerritory) { //Gestisce la selezione dei territori
    if(clickedTerritory.owner !== currentPlayerId){
      showNotification("Puoi trasferire pedine soltanto tra regioni che possiedi.","error");
      return;
    }
    if (!transferSourceTerritoryId) {
      if (clickedTerritory.troops < 2) {
        showNotification("La regione di partenza deve avere almeno 2 pedine.","warning");
        return;
      }
      setTransferSourceTerritoryId(clickedTerritory.id); //Memorizziamo la regione di partenza
      setTransferTargetTerritoryId(null); //Memorizziamo la regione di arrivo
      setTroopsToMove(1); //Pedine da trasferire
      return;
    }
    if(clickedTerritory.id === transferSourceTerritoryId){
      resetTroopTransferSelection();
      return;
    }
    if(clickedTerritory.troops >= 2 && !transferSourceTerritory?.adjacent_territory?.includes(clickedTerritory.id)){
      setTransferSourceTerritoryId(clickedTerritory.id);
      setTransferTargetTerritoryId(null);
      setTroopsToMove(1);
      return;
    }
    const isAdjacent = transferSourceTerritory?.adjacent_territory?.includes(clickedTerritory.id);
    if (!isAdjacent) {
      showNotification("Le due regioni devono essere alleate e adiacenti.","warning");
      return;
    }
    setTransferTargetTerritoryId(clickedTerritory.id);
    setTroopsToMove(1);
  }

  function handleDecreaseTroopMove() {
    setTroopsToMove((currentValue) =>Math.max(1, currentValue - 1));
  }

  function handleIncreaseTroopMove() {
    const maximumMove = (transferSourceTerritory?.troops ?? 1) - 1;
    setTroopsToMove((currentValue) => Math.min(maximumMove,currentValue + 1));
  }

  function handleSetMaximumTroopMove() {
    const maximumMove = (transferSourceTerritory?.troops ?? 1) -1;
    setTroopsToMove(Math.max(1, maximumMove));
  }

  function handleConfirmTroopTransfer() {
    if(!transferSourceTerritory || !transferTargetTerritory){
      return;
    }
    const maximumMove = transferSourceTerritory.troops - 1;
    const validMove = Math.min(Math.max(1, troopsToMove),maximumMove);

    setTerritories((currentTerritories) =>currentTerritories.map((territory) => {
      if (territory.id === transferSourceTerritory.id){
        return {
          ...territory,troops: territory.troops - validMove,
        };
      }
      if(territory.id === transferTargetTerritory.id){
        return {
          ...territory,troops:territory.troops + validMove,
        };
      }
          return territory;
      })
    );
    setSelectedTerritoryId(transferTargetTerritory.id);
    resetTroopTransferSelection();
    setTurnMode("transfer-complete");
  }

  function handleAddReinforcement(){
    if(isInitialPlacement){
      handleInitialTroopPlacement();
      return;
    }

    if(reinforcementsRemaining <= 0){
      showNotification("Hai già posizionato tutti i rinforzi.","info");
      return;
    }
    if(!selectedTerritory){
      showNotification("Seleziona prima una tua regione sulla mappa.","warning");
      return;
    }

    if(selectedTerritory.owner !==currentPlayerId){
      showNotification("Non puoi aggiungere rinforzi in una regione nemica.","error");
      return;
    }
    setTerritories((currentTerritories) => currentTerritories.map((territory) =>territory.id === selectedTerritory.id? {...territory,troops: territory.troops + 1}: territory));
    setReinforcementsRemaining((currentValue) => currentValue - 1);
  }

  function rollDice() {
    return Math.floor(Math.random() * 6) + 1;
  }

  function handleConfirmAttack() {
    if(conquestTransfer || !attackingTerritory || !defendingTerritory){
      return;
    }
    playEffect(ATTACK_SOUND);
    const attackerPlayer = players.find((player) =>player.id === attackingTerritory.owner);
    const defenderPlayer = players.find( (player) =>player.id === defendingTerritory.owner);
    if(!attackerPlayer || !defenderPlayer){
      return;
    }
    const attackerDice = rollDice();
    const defenderDice = rollDice();
    const attackingTroops = attackingTerritory.troops;
    const defendingTroops = defendingTerritory.troops;
    const defenceBonus = Math.max(0,defenderPlayer.bonus_def ?? 0);
    const attackerScore = attackingTroops + attackerDice * attackingTroops;
    const defenderScore = defendingTroops + defenderDice * defendingTroops;
    const attackerWins = attackerScore > defenderScore;
    if (attackerWins) {
      const lostDefendingTroops = Math.min(attackingTroops,defendingTroops);
      const remainingDefendingTroops = Math.max(0,defendingTroops -lostDefendingTroops);
      createBattleEffect(defendingTerritory.id,lostDefendingTroops,defenderPlayer.color);
      if (remainingDefendingTroops === 0) {
        playEffect(CONQUEST_SOUND);
        setConquestTransfer({
          attackingTerritoryId: attackingTerritory.id,
          defendingTerritoryId: defendingTerritory.id,
          attackingTerritoryName: attackingTerritory.name ?? attackingTerritory.id, 
          defendingTerritoryName: defendingTerritory.name ?? defendingTerritory.id,
          attackingTroops
        });
        setTroopsToTransfer(1);
        setShowConquestTransferModal(false);
        setAttackResult({
          attackerDice,
          defenderDice,
          attackerScore,
          defenderScore,
          winner: "attacker",
          conquered: true,
          message: `${attackingTerritory.name ?? attackingTerritory.id} ha sconfitto ${defendingTerritory.name ?? defendingTerritory.id}.`
        });
        clearConquestModalTimer();
        conquestModalTimerRef.current = setTimeout(() => {
          setShowConquestTransferModal(true);
          conquestModalTimerRef.current = null;
          }, CONQUEST_MODAL_DELAY);
        return;
      }
      setTerritories((currentTerritories) =>currentTerritories.map((territory) =>territory.id === defendingTerritory.id? {...territory,troops:remainingDefendingTroops}: territory));
      setAttackResult({
        attackerDice,
        defenderDice,
        attackerScore,
        defenderScore,
        winner: "attacker",
        conquered: false,
        message: "L'attaccante ha vinto, ma la regione non è ancora stata conquistata.",
      });
      resetAttackSelection();
      return;
    }
    const maximumLoss = Math.max(0,attackingTroops - 1);
    const lostAttackingTroops = Math.min(defendingTroops,maximumLoss);
    const remainingAttackingTroops =attackingTroops -lostAttackingTroops;
    createBattleEffect(attackingTerritory.id,lostAttackingTroops,attackerPlayer.color);
    setTerritories((currentTerritories) => currentTerritories.map((territory) => territory.id === attackingTerritory.id? {...territory,troops:remainingAttackingTroops}: territory));
    setAttackResult({
      attackerDice,
      defenderDice,
      attackerScore,
      defenderScore,
      winner: "defender",
      conquered: false,
      message:attackerScore === defenderScore? "Pareggio: vince il difensore.": "Il difensore ha vinto il combattimento.",
    });
    resetAttackSelection();
  }

  function handleEndAttackMode() {
    if(conquestTransfer){
      return;
    }
    clearConquestModalTimer();
    resetAttackSelection();
    setAttackResult(null);
    setShowConquestTransferModal(false);
    setTurnMode("attack-complete");
  }

  function handleConfirmTransfer() {
    if(!conquestTransfer){
      return;
    }
    const{attackingTerritoryId:sourceTerritoryId,defendingTerritoryId:targetTerritoryId,attackingTroops,} = conquestTransfer;
    const maximumTransfer = attackingTroops - 1;
    if (maximumTransfer < 1) {
      return;
    }
    const validTransferAmount = Math.min(Math.max(1, troopsToTransfer),maximumTransfer);
    const defeatedTerritory = territories.find((territory) => territory.id === targetTerritoryId);
    const defeatedPlayerId = defeatedTerritory?.owner ?? null;
    const updatedTerritories = territories.map((territory) => {
      if(territory.id ===sourceTerritoryId){
          return {
            ...territory,troops: attackingTroops -validTransferAmount,
          };
        }
        if(territory.id === targetTerritoryId){
          return {
            ...territory,owner: currentPlayerId,troops:validTransferAmount,
          };
        }
        return territory;
      }
    );
    setTerritories(updatedTerritories);
    setSelectedTerritoryId(targetTerritoryId);
    setAttackResult((currentResult) => currentResult? {...currentResult,message: `Regione conquistata. Sono state trasferite ${validTransferAmount} pedine.`,}:null);
    clearConquestModalTimer();
    setConquestTransfer(null);
    setShowConquestTransferModal(false);
    setTroopsToTransfer(1);
    resetAttackSelection();
    if(defeatedPlayerId){
      evaluatePlayersAfterConquest(updatedTerritories,defeatedPlayerId);
    }
  }

  function handleDecreaseTransfer() {
    setTroopsToTransfer((currentValue) => Math.max(1, currentValue - 1));
  }

  function handleIncreaseTransfer(){
    if(!conquestTransfer){
      return;
    }
    const maximumTransfer = conquestTransfer.attackingTroops - 1;
    setTroopsToTransfer((currentValue) => Math.min(maximumTransfer,currentValue + 1));
  }

  function handleSetMaximumTransfer() {
    if(!conquestTransfer){
      return;
    }
    setTroopsToTransfer(conquestTransfer.attackingTroops - 1);
  }

function getColorName(color) {
  const normalizedColor = color?.toLowerCase();
  const colorNames = {
    "#e53935": "Red",
    "#1e88e5": "Blue",
    "#fdd835": "Yellow",
    "#ffff00": "Yellow",
    "#43a047": "Green",
  };
  return (
    colorNames[normalizedColor] ?? color ?? "Nessuno"
  );
}

  function handleGamePointerDown() {
    if(!winner){
      playMusic(GAME_MUSIC);
    }
  }

  const playerSummaries = players.map((player) => {
      const ownedTerritories = territories.filter((territory) => territory.owner === player.id);
      const totalTroops = ownedTerritories.reduce((total, territory) => total + territory.troops,0);
      return {
        ...player,territoryCount:ownedTerritories.length,totalTroops
      };
    }
  );

  return (
    <main className="game-page" onPointerDown={handleGamePointerDown}>
      {!winner && (
        <button type="button" className="pause-menu-open-button" onClick={handleOpenPauseMenu} aria-label="Apri menu di pausa">
          ☰ Menu
        </button>
      )}
      <GameNotification notification={notification} onClose={dismissNotification}/>
      <aside className="territory-sidebar">
        <section className="territory-info">
          <h2>
            Regione selezionata
          </h2>
          {selectedTerritory ? (
            <>
              <table className="territory-info-table">
                <tbody>
                  <tr>
                    <th>
                      Nome regione
                    </th>
                    <td>
                      {selectedTerritory.name ?? selectedTerritory.id}
                    </td>
                  </tr>
                  <tr>
                    <th>
                      Numero di pedine
                    </th>
                    <td>
                      {selectedTerritory.troops}
                    </td>
                  </tr>
                  <tr>
                    <th>
                      Proprietario
                    </th>
                    <td>
                      {selectedTerritoryOwner? selectedTerritoryOwner.name: "Nessun proprietario"}
                    </td>
                  </tr>
                  <tr>
                    <th>
                      Colore
                    </th>
                    <td>
                      <span className="owner-color">
                        <span className="owner-color-circle" style={{ backgroundColor: selectedTerritoryOwner?.color ?? "#cccccc"}}/>
                        {selectedTerritoryOwner ? getColorName(selectedTerritoryOwner.color) : "Nessuno"}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <th>
                      Bonus difesa
                    </th>
                    <td>
                      {Math.max(0,selectedTerritoryOwner?.bonus_def ?? 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
              {(isInitialPlacement || reinforcementsRemaining > 0) && (
                <div className="territory-reinforcement-actions">
                  {selectedTerritory.owner === currentPlayerId ? (
                    <>
                      <button type="button" className="add-reinforcement-button" onClick={handleAddReinforcement}>
                        {isInitialPlacement ? "Posiziona una pedina" : "Aggiungi pedina"}
                      </button>
                      {isInitialPlacement && (
                        <p className="initial-placement-rule initial-placement-rule-left">
                          Ogni regione deve contenere almeno una pedina.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="reinforcement-warning">
                      Non puoi aggiungere pedine in una regione nemica.
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="no-territory-selected">
              Clicca una regione sulla mappa per visualizzarne i dati.
            </p>
          )}
        </section>
        {!isInitialPlacement && turnMode === "transfer" && (
            <section className="troop-transfer-panel transfer-panel-left">
              <p className="transfer-panel-kicker">
                Movimento strategico
              </p>
              <h2>
                Trasferimento pedine
              </h2>
              {!transferSourceTerritory && (
                <p>
                  Seleziona sulla mappa una tua regione con almeno 2 pedine.
                </p>
              )}
              {transferSourceTerritory && (
                <>
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
                  {!transferTargetTerritory && (
                    <p className="transfer-map-instruction">
                      Le regioni alleate adiacenti disponibili sono illuminate sulla mappa.
                    </p>
                  )}
                </>
              )}
              {transferTargetTerritory && (
                <>
                  <div className="troop-transfer-route">
                    <div className="troop-transfer-region-card source">
                      <span>
                        Da
                      </span>
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
                      <span>
                        A
                      </span>
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
                    <button type="button" onClick={handleDecreaseTroopMove} disabled={troopsToMove <= 1} aria-label="Diminuisci pedine">
                      −
                    </button>
                    <strong>
                      {troopsToMove}
                    </strong>
                    <button type="button" onClick={handleIncreaseTroopMove} disabled={troopsToMove >= transferSourceTerritory.troops -1} aria-label="Aumenta pedine">
                      +
                    </button>
                    <button type="button" className="troop-transfer-max" onClick={handleSetMaximumTroopMove}>
                      MAX
                    </button>
                  </div>
                  <button type="button" className="confirm-troop-transfer-button" onClick={handleConfirmTroopTransfer}>
                    Conferma trasferimento
                  </button>
                </>
              )}
              <button type="button" className="skip-troop-transfer-button" onClick={handleSkipTroopTransfer}>
                Salta trasferimento
              </button>
            </section>
          )}
        <div className="left-sidebar-tools">
        <GameChat messages={chatMessages} currentPlayer={currentPlayer} onSendMessage={handleSendChatMessage}/>
        <details className="players-summary-dropdown">
          <summary className="players-summary-toggle">
            <span>
              Riepilogo
            </span>
            <span className="players-summary-toggle-icon" aria-hidden="true">
              +
            </span>
          </summary>
          <section className="players-summary-panel">
            <div className="players-summary-list">
              {playerSummaries.map((player) => { const isCurrentPlayer = player.id === currentPlayerId; const isEliminated = player.in_game === false || player.territoryCount === 0;
                return (
                  <article key={player.id} className={`player-summary-card ${isCurrentPlayer? "current-player-summary": ""} ${isEliminated? "eliminated-player-summary": ""}`} style={{"--summary-player-color":player.color,}}>
                    <header className="player-summary-header">
                      <span className="player-summary-color" aria-hidden="true"/>
                      <strong>
                        {player.name}
                      </strong>
                      <span className="player-summary-status">
                        {isEliminated ? "Eliminato": isCurrentPlayer? "Turno attuale": "In gioco"}
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
                        <dd>{player.totalTroops}</dd>
                      </div>

                      <div>
                        <dt>Difesa</dt>
                        <dd>
                          +
                          {Math.max(
                            0,
                            player.bonus_def ?? 0
                          )}
                        </dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          </section>
        </details>
        </div>
      </aside>
      <section className="map-area">
        <ItalyMap
          territories={territories}
          players={players}
          currentPlayerId={currentPlayerId}
          onTerritoryClick={handleTerritoryClick}
          turnMode={turnMode}
          attackingTerritoryId={attackingTerritoryId}
          defendingTerritoryId={defendingTerritoryId}
          attackableTerritoryIds={attackableTerritoryIds}
          transferSourceTerritoryId={transferSourceTerritoryId}
          transferTargetTerritoryId={transferTargetTerritoryId}
          transferableTerritoryIds={transferableTerritoryIds}
          battleEffects={battleEffects}
        />
      </section>
      <aside className="game-sidebar">
        <header className="game-sidebar-header">
          <h1>Nation&apos;s Conquest</h1>
          <div
            className="current-player-card"
            style={{borderColor:currentPlayer.color}}>
            <span>
              Turno di
            </span>
            <strong>
              {currentPlayer.name}
            </strong>
          </div>
          <p className="reinforcements">
            <span>
              {isInitialPlacement? "Pedine iniziali da schierare": "Rinforzi da schierare"}
            </span>
            <strong>
              {isInitialPlacement? initialTroopsRemaining[currentPlayerId] ?? 0: reinforcementsRemaining}
            </strong>
          </p>
        </header>
        {isInitialPlacement && (
          <section className="initial-placement-panel">
            <p className="initial-placement-kicker">
              Preparazione partita
            </p>
            <h2>Schieramento iniziale</h2>
            <p>
              I territori sono stati assegnati casualmente. Ogni giocatore deve schierare 25 pedine in cinque turni da 5 pedine ciascuno.
            </p>
            <div className="initial-placement-status">
              <span>
                Giocatore attivo
              </span>
              <strong
                style={{color: currentPlayer.color}}>
                {currentPlayer.name}
              </strong>
            </div>
            <div className="initial-placement-counters">
              <p>
                <span>
                  Pedine in questo giro
                </span>
                <strong>
                  {placementTurnTroopsRemaining}
                </strong>
              </p>
              <p>
                <span>
                  Pedine totali rimaste
                </span>
                <strong>
                  {initialTroopsRemaining[currentPlayerId] ?? 0}
                </strong>
              </p>
            </div>
          </section>
        )}
        {!isInitialPlacement && (
          <section className="turn-phases">
          <h2>
            Fasi del turno
          </h2>
          <table className="turn-table">
            <tbody>
              <tr className={reinforcementsRemaining > 0 ? "active-phase": "completed-phase"}>
                <td className="phase-number">
                  1
                </td>
                <td>
                  <strong>
                    Rinforzi
                  </strong>
                  <span>
                    Posiziona le nuove pedine
                  </span>
                </td>
              </tr>
              <tr
                className={reinforcementsRemaining === 0 && turnMode === null? "active-phase": reinforcementsRemaining >0 ? "locked-phase": "completed-phase"}>
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
              <tr className={turnMode === "attack"? "active-phase": turnMode === "attack-complete" ||turnMode === "defence-complete"? "completed-phase": "locked-phase"}>
                <td className="phase-number">
                  3
                </td>
                <td>
                  <strong>
                    Azioni
                  </strong>
                  <span>
                    Attacca o attiva la difesa
                  </span>
                </td>
              </tr>
              <tr
                className={turnMode === "attack-complete" ||turnMode === "defence-complete" ||turnMode === "transfer"? "active-phase": turnMode === "transfer-complete"? "completed-phase": "locked-phase"}>
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
              <tr
                className={turnMode === "transfer-complete"? "active-phase": "locked-phase"}>
                <td className="phase-number">
                  5
                </td>
                <td>
                  <strong>
                    Fine turno
                  </strong>
                  <span>
                    Passa al giocatore successivo
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
          </section>
        )}
        {!isInitialPlacement && turnMode === "attack" && (
          <section className="attack-panel">
            <h2>
              Modalità offensiva
            </h2>
            {!attackingTerritory && !conquestTransfer && (
                <p>
                  Seleziona una tua regione con almeno 2 pedine.
                </p>
              )}
            {attackingTerritory && (
              <div className="attack-territory-card">
                <span>
                  Regione attaccante
                </span>
                <strong>
                  {attackingTerritory.name ?? attackingTerritory.id}
                </strong>
                <small>
                  Pedine:{" "}
                  {attackingTerritory.troops}
                </small>
              </div>
            )}
            {attackingTerritory && !defendingTerritory && !conquestTransfer && (
                <p>
                  Ora seleziona una regione nemica evidenziata in rosso.
                </p>
              )}
            {defendingTerritory && (
              <div className="defending-territory-card">
                <span>
                  Regione difensore
                </span>
                <strong>
                  {defendingTerritory.name ?? defendingTerritory.id}
                </strong>
                <small>
                  Pedine:{" "}
                  {defendingTerritory.troops}
                </small>
              </div>
            )}
            {attackingTerritory && defendingTerritory && !conquestTransfer && (
                <button type="button" className="confirm-attack-button" onClick={handleConfirmAttack}>
                  Conferma attacco
                </button>
              )}
            {attackResult && (
              <div className={`attack-result ${attackResult.winner === "attacker"? "attacker-victory" : "defender-victory"}`}>
                <h3>
                  Risultato del combattimento
                </h3>
                <p>
                  Dado attaccante:
                  <strong>
                    {" "}
                    {attackResult.attackerDice}
                  </strong>
                </p>
                <p>
                  Dado difensore:
                  <strong>
                    {" "}
                    {attackResult.defenderDice}
                  </strong>
                </p>
                <p>
                  Punteggio attaccante:
                  <strong>
                    {" "}
                    {attackResult.attackerScore}
                  </strong>
                </p>
                <p>
                  Punteggio difensore:
                  <strong>
                    {" "}
                    {attackResult.defenderScore}
                  </strong>
                </p>
                <p>
                  {attackResult.message}
                </p>
              </div>
            )}
            <button type="button" className="end-attack-mode-button" onClick={handleEndAttackMode} disabled={Boolean(conquestTransfer)}>
              Termina attacchi
            </button>
          </section>
        )}
        {!isInitialPlacement &&turnMode === "attack-complete" && (
          <section className="attack-complete-panel">
            <h2>
              Modalità offensiva terminata
            </h2>
            <p>
              Non puoi effettuare altri attacchi durante questo turno. Premi il pulsante per passare al giocatore successivo.
            </p>
            <div className="post-action-buttons">
              <button type="button" className="start-transfer-button" onClick={handleStartTroopTransfer} disabled={Boolean(conquestTransfer)}>
                Trasferisci pedine
              </button>
              <button type="button" className="end-turn-button" onClick={handleEndTurn} disabled={Boolean(conquestTransfer)}>
                Fine turno
              </button>
            </div>
          </section>
        )}

        {!isInitialPlacement && turnMode === "defence-complete" && (
          <section className="defence-complete-panel">
            <h2>
              Difesa attivata
            </h2>
            <p>
              Tutte le tue regioni ricevono un bonus difesa pari a:
            </p>
            <strong className="defence-bonus-value">
              +{Math.max(0, currentPlayer.bonus_def ?? 0)}
            </strong>
            <p>
              Il bonus resta attivo durante i turni avversari e scade quando inizierà il tuo prossimo turno.
            </p>
            <div className="post-action-buttons">
              <button type="button" className="start-transfer-button" onClick={handleStartTroopTransfer}>
                Trasferisci pedine
              </button>
              <button type="button" className="end-turn-button" onClick={handleEndTurn}>
                Fine turno
              </button>
            </div>
          </section>
        )}
        {!isInitialPlacement && turnMode === "transfer-complete" && (
          <section className="transfer-complete-panel">
            <h2>Trasferimento completato</h2>
            <p>
              Ora puoi terminare il turno.
            </p>
            <button type="button" className="end-turn-button" onClick={handleEndTurn}>
              Fine turno
            </button>
          </section>
          )}
        {!isInitialPlacement && reinforcementsRemaining === 0 && turnMode === null && (
          <section className="sidebar-actions">
            <button type="button" className="attack-button" onClick={handleStartAttackMode}>
              Attacca
            </button>
            <button type="button" className="defence-button" onClick={handleStartDefenceMode}>
               Difendi
            </button>
          </section>
          )}
      </aside>
      {eliminatedPlayerNotice && !winner && (
        <div className="player-eliminated-overlay" role="status" aria-live="assertive">
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
        </div>
      )}
      {winner && (
        <div className="victory-overlay" role="dialog" aria-modal="true" aria-labelledby="victory-title">
          <section className="victory-modal" style={{"--winner-color": winner.color}}>
            <div className="victory-symbol">
              ★
            </div>
            <p className="victory-kicker">
              Partita terminata
            </p>
            <h2 id="victory-title">
              {winner.name} ha conquistato l&apos;Italia
            </h2>
            <p>
              Tutti gli altri giocatori sono stati eliminati.
            </p>
            <button type="button" className="restart-game-button" onClick={handleRestartGame}>
              Nuova partita
            </button>
          </section>
        </div>
      )}
      {showInitialPlacementIntro && (
        <div className="placement-intro-overlay" role="status" aria-live="assertive" aria-label="Inizio dello schieramento iniziale">
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
              Rafforza i territori assegnati e prepara la tua strategia
            </span>
            <span className="placement-intro-line" aria-hidden="true"/>
          </div>
        </div>
      )}
      {turnTransitionPlayer && (
        <div className="turn-transition-overlay" role="status" aria-live="assertive" aria-label={`Inizia il turno di ${turnTransitionPlayer.name}`}>
          <div className="turn-transition-banner" style={{"--turn-player-color": turnTransitionPlayer.color}}>
            <span className="turn-transition-kicker">
              Nuovo turno
            </span>
            <div className="turn-transition-player-row">
              <span className="turn-transition-player-dot" aria-hidden="true"/>
              <strong>
                {turnTransitionPlayer.name}
              </strong>
            </div>
            <span className="turn-transition-message">
              Prepara i rinforzi
            </span>
          </div>
        </div>
      )}

      <PauseMenu isOpen={isPauseMenuOpen} mode="local" onResume={handleResumeGame} onOpenSettings={handleOpenSettings} onOpenTutorial={handleOpenTutorial} onExitGame={handleExitLocalGame}/>
        {conquestTransfer &&showConquestTransferModal && (
          <div className="conquest-transfer-overlay" role="presentation">
            <section className="conquest-transfer-modal" role="dialog" aria-modal="true" aria-labelledby="conquest-modal-title" aria-describedby="conquest-modal-description">
              <div className="conquest-icon">
                ★
              </div>
              <p className="conquest-kicker">
                Vittoria
              </p>
              <h2 id="conquest-modal-title">
                Regione conquistata
              </h2>
              <p id="conquest-modal-description" className="conquest-description">
                Hai conquistato{" "}
                <strong>
                  {conquestTransfer.defendingTerritoryName}
                </strong>
                . Scegli quante pedine trasferire dalla regione{" "}
                <strong>
                  {conquestTransfer.attackingTerritoryName}
                </strong>
                .
              </p>
              <p className="transfer-limit">
                Puoi trasferire da 1 a{" "}
                <strong>
                  {conquestTransfer.attackingTroops -1}
                </strong>{" "}
                pedine.
              </p>
              <div className="transfer-counter">
                <button type="button" className="transfer-counter-button" onClick={handleDecreaseTransfer} disabled={troopsToTransfer <= 1} aria-label="Diminuisci pedine da trasferire">
                  −
                </button>
                <strong className="transfer-counter-value">
                  {troopsToTransfer}
                </strong>
                <button type="button" className="transfer-counter-button" onClick={handleIncreaseTransfer} disabled={troopsToTransfer >= conquestTransfer.attackingTroops -1} aria-label="Aumenta pedine da trasferire">
                  +
                </button>
                <button type="button" className="transfer-max-button" onClick={handleSetMaximumTransfer}>
                  MAX
                </button>
              </div>
              <div className="transfer-preview">
                <p>
                  <span>
                    {conquestTransfer.attackingTerritoryName}
                  </span>
                  <strong>
                    {conquestTransfer.attackingTroops - troopsToTransfer}
                  </strong>
                </p>
                <p>
                  <span>
                    {conquestTransfer.defendingTerritoryName}
                  </span>
                  <strong>
                    {troopsToTransfer}
                  </strong>
                </p>
              </div>
              <button type="button" className="confirm-transfer-button" onClick={handleConfirmTransfer}>
                Conferma trasferimento
              </button>
            </section>
          </div>
        )}
    </main>
  );
}

export default GamePage;