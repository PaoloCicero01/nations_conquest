import { collection, doc, getDocs, limit, onSnapshot, query, runTransaction, serverTimestamp, where, } from "firebase/firestore";
import { db } from "./firebase";
import { territory_list } from "../data/setup_game";
const MAX_PLAYERS = 4;
const ROOM_CODE_LENGTH = 6;
const INITIAL_TROOPS_PER_PLAYER = 25;
const INITIAL_TROOPS_PER_TURN = 5;
const MAX_CHAT_MESSAGES = 100;
const MAX_CHAT_MESSAGE_LENGTH = 200;
const ONLINE_PRESENCE_TIMEOUT_MS = 25000;
const ROOM_CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PLAYER_COLORS = [ "#e53935", "#1e88e5", "#fdd835", "#43a047"];
function generateRoomCode() {
  let roomCode = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    const randomIndex = Math.floor(Math.random() * ROOM_CODE_CHARACTERS.length);
    roomCode += ROOM_CODE_CHARACTERS[randomIndex];
  }
  return roomCode;
}
function normalizeRoomCode(roomCode) {
  return roomCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function createRoomPlayer({ uid, name, level = 1, isHost = false, isReady = false, }) {
  return {
    uid,
    name: name.trim(),
    level: Math.max(1, Number(level) || 1),
    isHost,
    isReady,
    joinedAt: Date.now(),
  };
}
function shuffleArray(items) {
  const shuffledItems = [...items];
  for (let i = shuffledItems.length - 1; i > 0; i -= 1) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [shuffledItems[i],shuffledItems[randomIndex]] = [ shuffledItems[randomIndex],shuffledItems[i],];
  }
  return shuffledItems;
}
function createOnlinePlayers(roomPlayers) {
  return roomPlayers.map((player, index) => ({
    id: `player ${index + 1}`,
    uid: player.uid,
    name: player.name,
    level: Math.max(1, Number(player.level) || 1),
    color: PLAYER_COLORS[index],
    bonus_def: 0,
    activated_def: false,
    in_game: true,
    isConnected: true,
    lastSeenAt: Date.now(),
  }));
}
function getPlayerColorLabel(color) {
  const labels = {"#e53935": "Rosso", "#1e88e5": "Blu", "#fdd835": "Giallo", "#43a047": "Verde"};
  return (labels[String(color ?? "").toLowerCase()] ?? "Sconosciuto");
}
function createSystemChatMessage({ text, playerColor = "#ffffff", playerId = "system", }) {
  return {
    id: `system-${Date.now()}-` + `${Math.random().toString(36).slice(2, 9)}`,
    playerId,
    playerUid: null,
    playerName: "Sistema",
    playerColor,
    text,
    createdAt: Date.now(),
    isSystem: true,
  };
}
function appendChatMessages(currentMessages, newMessages) {
  return [ ...(currentMessages ?? []),...newMessages].slice(-MAX_CHAT_MESSAGES);
}

//Restituisce i giocatori ancora in gioco, connessi e proprietari di almeno una regione.
function getConnectedActivePlayers({ players, territories, }) {
  return (players ?? []).filter((player) => player.in_game !== false && player.isConnected !== false &&(territories ?? []).some((territory) => territory.owner === player.id));
}
//Crea l'oggetto vincitore
function createOnlineWinner(player) {
  if (!player) {
    return null;
  }
  return {
    id: player.id,
    name: player.name,
    color: player.color,
  };
}

function createAutomaticVictoryMessages(winner) {
  return [ createSystemChatMessage({
      playerId: winner.id,
      playerColor: winner.color,
      text: "Tutti gli avversari si sono disconnessi.",
    }),
    createSystemChatMessage({
      playerId: winner.id,
      playerColor: winner.color,
      text: `Il giocatore ${getPlayerColorLabel(winner.color)} ha vinto la partita.`,
    }),
  ];
}
function getReinforcementsForPlayer(territories, playerId) {
  const ownedTerritories = territories.filter((territory) => territory.owner === playerId).length;
  if (ownedTerritories === 0) {
    return 0;
  }
  if (ownedTerritories <= 2) {
    return 3;
  }
  return Math.min(6, Math.max(2, Math.floor(ownedTerritories / 2)));
}
function getNextConnectedPlayerId({ players, territories, currentPlayerId, initialTroopsRemaining = null, }) {
  const currentPlayerIndex = players.findIndex((player) => player.id === currentPlayerId);
  if (currentPlayerIndex === -1) {
    return null;
  }
  for (let i = 1; i <= players.length; i += 1) {
    const nextPlayer = players[(currentPlayerIndex + i) % players.length];
    const ownsTerritories = territories.some((territory) => territory.owner === nextPlayer.id);
    const hasPlacementTroops = initialTroopsRemaining? (initialTroopsRemaining[nextPlayer.id] ?? 0) > 0: true;
    if (nextPlayer.in_game !== false && nextPlayer.isConnected !== false && ownsTerritories && hasPlacementTroops) {
      return nextPlayer.id;
    }
  }
  return null;
}
function autoPlaceDisconnectedTroops({ game, playerId, }) {
  const territories = game.territories ?? [];
  const initialTroopsRemaining = {...(game.initialTroopsRemaining ?? {})};
  const playerTroopsRemaining = initialTroopsRemaining[playerId] ?? 0;
  const troopsForThisTurn = Math.min(game.placementTurnTroopsRemaining ?? INITIAL_TROOPS_PER_TURN, playerTroopsRemaining);
  const ownedTerritories = territories.filter((territory) => territory.owner === playerId);
  if (troopsForThisTurn <= 0 || ownedTerritories.length === 0) {
    return {
      territories,
      initialTroopsRemaining,
      placedTroops: 0,
    };
  }
  const additions = Object.fromEntries(ownedTerritories.map((territory) => [ territory.id, 0]));
  const emptyTerritories = ownedTerritories.filter((territory) => (territory.troops ?? 0) === 0);
  let placedTroops = 0;
  for (const territory of emptyTerritories) {
    if (placedTroops >= troopsForThisTurn) {
      break;
    }
    additions[territory.id] += 1;
    placedTroops += 1;
  }
  let territoryIndex = 0;
  while (placedTroops < troopsForThisTurn) {
    const territory = ownedTerritories[territoryIndex % ownedTerritories.length];
    additions[territory.id] += 1;
    placedTroops += 1;
    territoryIndex += 1;
  }
  const updatedTerritories = territories.map((territory) => ({...territory, troops: (territory.troops ?? 0) + (additions[territory.id] ?? 0)}));
  initialTroopsRemaining[playerId] = Math.max(0, playerTroopsRemaining - placedTroops);
  return {
    territories: updatedTerritories,
    initialTroopsRemaining,
    placedTroops,
  };
}
function createOnlineTerritories(players) {
  const shuffledTerritories = shuffleArray(territory_list);
  return shuffledTerritories.map((territory, index) => ({...territory, owner: players[index % players.length].id, troops: 0}));
}
function createInitialTroopsRemaining(players) {
  return Object.fromEntries(players.map((player) => [ player.id, INITIAL_TROOPS_PER_PLAYER]));
}

//Crea una stanza privata
export async function createOnlineRoom({ uid, playerName, playerLevel = 1}) {
  if (!uid) {
    throw new Error("Utente Firebase non disponibile.");
  }
  const cleanedName = playerName.trim();
  if (cleanedName.length < 2) {
    throw new Error("Il nome deve contenere almeno 2 caratteri.");
  }
  for (let i = 0; i < 8; i += 1) {
    const roomCode = generateRoomCode();
    const roomReference = doc(db, "rooms", roomCode);
    try {
      await runTransaction(db, async (transaction) => {
        const roomSnapshot = await transaction.get(roomReference);
        if (roomSnapshot.exists()) {
          throw new Error("ROOM_CODE_ALREADY_EXISTS");
        }
        transaction.set(roomReference, {
          code: roomCode,
          type: "private",
          hostUid: uid,
          status: "waiting",
          playerCount: 1,
          maxPlayers: MAX_PLAYERS,
          countdownStartedAt: null,
          countdownEndsAt: null,
          players: [ createRoomPlayer({
              uid,
              name: cleanedName,
              level: playerLevel,
              isHost: true,
              isReady: false,
            }),
          ],
          createdAt: serverTimestamp(),
          createdAtMs: Date.now(),
          updatedAt: serverTimestamp(),
        });
      });
      return roomCode;
    }
    catch (error) {
      if (error.message === "ROOM_CODE_ALREADY_EXISTS") {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Non è stato possibile creare la stanza. Riprova.");
}
//Entra in una stanza privata usando il codice.
export async function joinOnlineRoom({ roomCode, uid, playerName, playerLevel = 1}) {
  if (!uid) {
    throw new Error("Utente Firebase non disponibile.");
  }
  const normalizedCode = normalizeRoomCode(roomCode);
  const cleanedName = playerName.trim();
  if (normalizedCode.length !== ROOM_CODE_LENGTH) {
    throw new Error("Il codice stanza deve contenere 6 caratteri.");
  }
  if (cleanedName.length < 2) {
    throw new Error("Il nome deve contenere almeno 2 caratteri.");
  }
  const roomReference = doc(db, "rooms", normalizedCode);
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      throw new Error("La stanza non esiste.");
    }
    const roomData = roomSnapshot.data();
    const currentPlayers = roomData.players ?? [];
    if (roomData.type !== "private") {
      throw new Error("Non puoi entrare con il codice in una partita casuale.");
    }
    if (roomData.status !== "waiting") {
      throw new Error("La partita sta già iniziando.");
    }
    const existingPlayer = currentPlayers.find((player) => player.uid === uid);
    if (existingPlayer) {
      return;
    }
    if (currentPlayers.length >= (roomData.maxPlayers ?? MAX_PLAYERS)) {
      throw new Error("La stanza è già piena.");
    }
    const duplicatedName = currentPlayers.some((player) => player.name.trim().toLowerCase() === cleanedName.toLowerCase());
    if (duplicatedName) {
      throw new Error("Questo nome è già utilizzato nella stanza.");
    }
    const newPlayer = createRoomPlayer({uid, name: cleanedName, level: playerLevel, isReady: false});
    const updatedPlayers = [ ...currentPlayers,newPlayer];
    transaction.update(roomReference,{players: updatedPlayers, playerCount: updatedPlayers.length, updatedAt: serverTimestamp()});
  });
  return normalizedCode;
}

//Cerca una partita casuale
export async function findRandomMatch({ uid, playerName, playerLevel = 1, }) {
  if (!uid) {
    throw new Error("Utente Firebase non disponibile.");
  }
  const cleanedName = playerName.trim();
  if (cleanedName.length < 2) {
    throw new Error("Il nome deve contenere almeno 2 caratteri.");
  }
  const availableRoomsQuery = query(collection(db, "rooms"), where("type", "==", "random"), where("status", "==", "waiting"), limit(10));
  const availableRoomsSnapshot = await getDocs(availableRoomsQuery);
  const availableRooms = availableRoomsSnapshot.docs.map((roomDocument) => ({id: roomDocument.id, ...roomDocument.data()})).filter((roomData) => {
    const playerCount = roomData.playerCount ?? roomData.players?.length ?? 0;
    return (playerCount < MAX_PLAYERS);
  }).sort((firstRoom, secondRoom) => (firstRoom.createdAtMs ?? 0) - (secondRoom.createdAtMs ?? 0));
  
  //prova a entrare nella stanza casuale più vecchia possibile
  for (const availableRoom of availableRooms) {
    const roomReference = doc(db, "rooms", availableRoom.id);
    try {
      const joinedRoomCode = await runTransaction(db, async (transaction) => {
        const roomSnapshot = await transaction.get(roomReference);
        if (!roomSnapshot.exists()) {
          throw new Error("RANDOM_ROOM_UNAVAILABLE");
        }
        const roomData = roomSnapshot.data();
        const currentPlayers = roomData.players ?? [];
        const roomIsAvailable = roomData.type === "random" && roomData.status === "waiting" && currentPlayers.length < MAX_PLAYERS;
        if (!roomIsAvailable) {
          throw new Error("RANDOM_ROOM_UNAVAILABLE");
        }
        const existingPlayer = currentPlayers.find((player) => player.uid === uid);
        if (existingPlayer) {
          return roomSnapshot.id;
        }
        const duplicatedName = currentPlayers.some((player) => player.name.trim().toLowerCase() === cleanedName.toLowerCase());
        if (duplicatedName) {
          throw new Error("Questo nome è già utilizzato nella partita.");
        }
        const newPlayer = createRoomPlayer({uid, name: cleanedName, level: playerLevel, isReady: true});
        const updatedPlayers = [ ...currentPlayers, newPlayer].map((player) => ({...player, isReady: true}));
        const roomIsNowFull = updatedPlayers.length === MAX_PLAYERS;
        transaction.update(roomReference, {
          players: updatedPlayers,
          playerCount: updatedPlayers.length,
          status: roomIsNowFull? "countdown" : "waiting",
          countdownStartedAt: roomIsNowFull ? serverTimestamp() : null,
          countdownEndsAt: null,
          updatedAt: serverTimestamp(),
        });
        return roomSnapshot.id;
      });
      return joinedRoomCode;
    }
    catch (error) {
      if (error.message === "RANDOM_ROOM_UNAVAILABLE") {
        continue;
      }
      throw error;
    }
  }
  //Se non c'è una stanza disponibile ne viene creata una nuova
  for (let i = 0; i < 8; i += 1) {
    const roomCode = generateRoomCode();
    const roomReference = doc(db, "rooms", roomCode);
    try {
      await runTransaction(db, async (transaction) => {
        const roomSnapshot = await transaction.get(roomReference);
        if (roomSnapshot.exists()) {
          throw new Error("ROOM_CODE_ALREADY_EXISTS");
        }
        transaction.set(roomReference, {
          code: roomCode,
          type: "random",
          hostUid: uid,
          status: "waiting",
          playerCount: 1,
          maxPlayers: MAX_PLAYERS,
          countdownStartedAt: null,
          countdownEndsAt: null,
          players: [ createRoomPlayer({
              uid,
              name: cleanedName,
              level: playerLevel,
              isHost: true,
              isReady: true,
            }),
          ],
          createdAt: serverTimestamp(),
          createdAtMs: Date.now(),
          updatedAt: serverTimestamp(),
        });
      });
      return roomCode;
    }
    catch (error) {
      if (error.message === "ROOM_CODE_ALREADY_EXISTS") {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Non è stato possibile cercare una partita.");
}

export function subscribeToRoom(roomCode, onRoomChange, onError) {
  const normalizedCode = normalizeRoomCode(roomCode);
  const roomReference = doc(db, "rooms", normalizedCode);
  return onSnapshot(roomReference, (snapshot) => {
    if (!snapshot.exists()) {
      onRoomChange(null);
      return;
    }
    onRoomChange({id: snapshot.id, ...snapshot.data()});
  }, (error) => {
    if (onError) {
      onError(error);
    }
  });
}
//Cambia lo stato pronto di un giocatore
export async function togglePlayerReady({ roomCode, uid, }) {
  if (!uid) {
    throw new Error("Utente Firebase non disponibile.");
  }
  const normalizedCode = normalizeRoomCode(roomCode);
  const roomReference = doc(db, "rooms", normalizedCode);
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      throw new Error("La stanza non esiste più.");
    }
    const roomData = roomSnapshot.data();
    if (roomData.type === "random") {
      throw new Error("Nelle partite casuali lo stato pronto è automatico.");
    }
    if (roomData.status !== "waiting") {
      throw new Error("Il conto alla rovescia è già iniziato.");
    }
    const currentPlayers = roomData.players ?? [];
    const playerExists = currentPlayers.some((player) => player.uid === uid);
    if (!playerExists) {
      throw new Error("Non fai parte di questa stanza.");
    }
    const updatedPlayers = currentPlayers.map((player) => player.uid === uid? {...player, isReady: !player.isReady}: player);
    const allPlayersReady = updatedPlayers.length === MAX_PLAYERS && updatedPlayers.every((player) => player.isReady === true);
    transaction.update(roomReference, {
      players: updatedPlayers,
      playerCount: updatedPlayers.length,
      status: allPlayersReady ? "countdown": "waiting",
      countdownStartedAt: allPlayersReady? serverTimestamp(): null,
      countdownEndsAt: null,
      updatedAt: serverTimestamp(),
    });
  });
}

//Termina il countdown e crea lo stato iniziale della partita.
export async function finishReadyCountdown({ roomCode, }) {
  const normalizedCode = normalizeRoomCode(roomCode);
  const roomReference = doc(db, "rooms", normalizedCode);
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      return;
    }
    const roomData = roomSnapshot.data();
    const roomPlayers = roomData.players ?? [];
    const allPlayersReady = roomPlayers.length === MAX_PLAYERS && roomPlayers.every((player) => player.isReady === true);
    const statusAllowsStart = roomData.status === "countdown" || (roomData.type === "private" && roomData.status === "waiting");
    if (!statusAllowsStart || !allPlayersReady) {
      return;
    }
    const gamePlayers = createOnlinePlayers(roomPlayers);
    const gameTerritories = createOnlineTerritories(gamePlayers);
    const firstPlayerId = gamePlayers[0].id;
    transaction.update(roomReference, {
      status: "playing",
      countdownStartedAt: null,
      countdownEndsAt: null,
      game: {
        players: gamePlayers,
        territories: gameTerritories,
        currentPlayerId: firstPlayerId,
        isInitialPlacement: true,
        initialTroopsRemaining: createInitialTroopsRemaining(gamePlayers),
        placementTurnTroopsRemaining: INITIAL_TROOPS_PER_TURN,
        reinforcementsRemaining: 0,
        turnMode: null,
        winner: null,
        chatMessages: [],
        createdAt: Date.now(),
      },
      updatedAt: serverTimestamp(),
    });
  });
}

export async function sendOnlineChatMessage({ roomCode, uid, text, }) {
  if (!uid) {
    throw new Error("Utente Firebase non disponibile.");
  }
  const normalizedCode = normalizeRoomCode(roomCode);
  const cleanedText = String(text ?? "").trim();
  if (!cleanedText) {
    throw new Error("Il messaggio non può essere vuoto.");
  }
  if (cleanedText.length > MAX_CHAT_MESSAGE_LENGTH) {
    throw new Error(`Il messaggio non può superare ${MAX_CHAT_MESSAGE_LENGTH} caratteri.`);
  }
  const roomReference = doc(db, "rooms", normalizedCode);
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      throw new Error("La stanza non esiste più.");
    }
    const roomData = roomSnapshot.data();
    if (roomData.status !== "playing" || !roomData.game) {
      throw new Error("La partita non è attiva.");
    }
    const gamePlayers = roomData.game.players ?? [];
    const sender = gamePlayers.find((player) => player.uid === uid);
    if (!sender) {
      throw new Error("Non fai parte di questa partita.");
    }
    const currentMessages = roomData.game.chatMessages ?? [];
    const newMessage = {
      id: `${Date.now()}-${uid}-` + `${Math.random().toString(36).slice(2, 9)}`,
      playerId: sender.id,
      playerUid: sender.uid,
      playerName: sender.name,
      playerColor: sender.color,
      text: cleanedText,
      createdAt: Date.now(),
    };
    const updatedMessages = [ ...currentMessages, newMessage].slice(-MAX_CHAT_MESSAGES);
    transaction.update(roomReference, {
      "game.chatMessages": updatedMessages,
      updatedAt: serverTimestamp(),
    });
  });
}

//Disconnesione volontaria dalla partita
export async function disconnectOnlinePlayer({ roomCode, uid, }) {
  if (!uid) {
    return false;
  }
  const normalizedCode = normalizeRoomCode(roomCode);
  if (normalizedCode.length !== ROOM_CODE_LENGTH) {
    return false;
  }
  const roomReference = doc(db, "rooms", normalizedCode);
  return runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      return false;
    }
    const roomData = roomSnapshot.data();
    if (roomData.status !== "playing" || !roomData.game) {
      return false;
    }
    const game = roomData.game;
    if (game.winner) {
      return true;
    }
    const players = game.players ?? [];
    const territories = game.territories ?? [];
    const player = players.find((item) => item.uid === uid);
    if (!player) {
      return false;
    }
    if (player.isConnected === false) {
      return true;
    }
    const updatedPlayers = players.map((item) => item.uid === uid? {...item, isConnected: false, disconnectedAt: Date.now()}: item);
    const disconnectMessage = createSystemChatMessage({playerId: player.id, playerColor: player.color, text: `Il giocatore ${getPlayerColorLabel(player.color)} si è disconnesso.`});
    let updatedMessages = appendChatMessages(game.chatMessages, [disconnectMessage]);
    const connectedPlayers = getConnectedActivePlayers({players: updatedPlayers, territories});
    if (connectedPlayers.length === 1) {
      const winningPlayer = connectedPlayers[0];
      const winner = createOnlineWinner(winningPlayer);
      updatedMessages = appendChatMessages(updatedMessages, createAutomaticVictoryMessages(winningPlayer));
      transaction.update(roomReference, {
        "game.players": updatedPlayers,
        "game.winner": winner,
        "game.turnMode": "game-over",
        "game.reinforcementsRemaining": 0,
        "game.placementTurnTroopsRemaining": 0,
        "game.attackingTerritoryId": null,
        "game.defendingTerritoryId": null,
        "game.attackableTerritoryIds": [],
        "game.pendingConquest": null,
        "game.transferSourceTerritoryId": null,
        "game.transferTargetTerritoryId": null,
        "game.chatMessages": updatedMessages,
        updatedAt: serverTimestamp(),
      });
      return true;
    }
    transaction.update(roomReference, {
      "game.players": updatedPlayers,
      "game.chatMessages": updatedMessages,
      updatedAt: serverTimestamp(),
    });
    return true;
  });
}

export async function reconnectOnlinePlayer({ roomCode, uid, }) {
  if (!uid) {
    return false;
  }
  const normalizedCode = normalizeRoomCode(roomCode);
  if (normalizedCode.length !== ROOM_CODE_LENGTH) {
    return false;
  }
  const roomReference = doc(db, "rooms", normalizedCode);
  return runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      return false;
    }
    const roomData = roomSnapshot.data();
    if (roomData.status !== "playing" || !roomData.game) {
      return false;
    }
    const players = roomData.game.players ?? [];
    const player = players.find((item) => item.uid === uid);
    if (!player) {
      return false;
    }
    const wasDisconnected = player.isConnected === false;
    const updatedPlayers = players.map((item) => item.uid === uid? {...item,isConnected: true,lastSeenAt: Date.now()}: item);
    const messagesToAdd = wasDisconnected? [createSystemChatMessage({
          playerId: player.id,
          playerColor: player.color,
          text: `Il giocatore ${getPlayerColorLabel(player.color)} si è riconnesso.`,
        }),
      ]: [];
    transaction.update(roomReference, {
      "game.players": updatedPlayers,
      "game.chatMessages": appendChatMessages(roomData.game.chatMessages, messagesToAdd),
      updatedAt: serverTimestamp(),
    });
    return true;
  });
}

//Aggiorna il segnale di presenza del giocatore
export async function updateOnlinePlayerHeartbeat({ roomCode, uid, }) {
  if (!uid) {
    return false;
  }
  const normalizedCode = normalizeRoomCode(roomCode);
  if (normalizedCode.length !== ROOM_CODE_LENGTH) {
    return false;
  }
  const roomReference = doc(db, "rooms", normalizedCode);
  return runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      return false;
    }
    const roomData = roomSnapshot.data();
    if (roomData.status !== "playing" || !roomData.game) {
      return false;
    }
    const players = roomData.game.players ?? [];
    const playerExists = players.some((player) => player.uid === uid);
    if (!playerExists) {
      return false;
    }
    const updatedPlayers = players.map((player) => player.uid === uid? {...player,isConnected: true,lastSeenAt: Date.now() }: player);
    transaction.update(roomReference, {
      "game.players": updatedPlayers,
      updatedAt: serverTimestamp(),
    });
    return true;
  });
}

//Rileva giocatori afk e gli fa saltare il turno
export async function reconcileOnlinePresence({ roomCode, }) {
  const normalizedCode = normalizeRoomCode(roomCode);
  if (normalizedCode.length !== ROOM_CODE_LENGTH) {
    return;
  }
  const roomReference = doc(db, "rooms", normalizedCode);
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      return;
    }
    const roomData = roomSnapshot.data();
    if (roomData.status !== "playing" || !roomData.game || roomData.game.winner) {
      return;
    }
    const game = roomData.game;
    const now = Date.now();
    const disconnectedPlayers = (game.players ?? []).filter((player) => player.in_game !== false && player.isConnected !== false && now - (player.lastSeenAt ?? game.createdAt ?? now) > ONLINE_PRESENCE_TIMEOUT_MS);
    let updatedPlayers = game.players ?? [];
    let updatedMessages = game.chatMessages ?? [];
    if (disconnectedPlayers.length > 0) {
      const disconnectedIds = new Set(disconnectedPlayers.map((player) => player.id));
      updatedPlayers = updatedPlayers.map((player) => disconnectedIds.has(player.id)? {...player, isConnected: false}: player);
      const newMessages = disconnectedPlayers.map((player) => createSystemChatMessage({
        playerId: player.id,
        playerColor: player.color,
        text: `Il giocatore ${getPlayerColorLabel(player.color)} si è disconnesso.`,
      }));
      updatedMessages = appendChatMessages(updatedMessages, newMessages);
    }
   
    const connectedPlayers = getConnectedActivePlayers({players: updatedPlayers,territories: game.territories ?? []});
    if (connectedPlayers.length === 1) {
      const winningPlayer = connectedPlayers[0];
      const winner = createOnlineWinner(winningPlayer);
      updatedMessages = appendChatMessages(updatedMessages, createAutomaticVictoryMessages(winningPlayer));
      transaction.update(roomReference, {
        "game.players": updatedPlayers,
        "game.winner": winner,
        "game.turnMode": "game-over",
        "game.reinforcementsRemaining": 0,
        "game.placementTurnTroopsRemaining": 0,
        "game.attackingTerritoryId": null,
        "game.defendingTerritoryId": null,
        "game.attackableTerritoryIds": [],
        "game.pendingConquest": null,
        "game.transferSourceTerritoryId": null,
        "game.transferTargetTerritoryId": null,
        "game.chatMessages": updatedMessages,
        updatedAt: serverTimestamp(),
      });
      return;
    }
    const currentPlayer = updatedPlayers.find((player) => player.id === game.currentPlayerId);
    const currentPlayerDisconnected = currentPlayer && currentPlayer.isConnected === false;
    if (!currentPlayerDisconnected) {
      if (disconnectedPlayers.length > 0) {
        transaction.update(roomReference, {
          "game.players": updatedPlayers,
          "game.chatMessages": updatedMessages,
          updatedAt: serverTimestamp(),
        });
      }
      return;
    }
    let updatedTerritories = game.territories ?? [];
    let updatedInitialTroopsRemaining = {...(game.initialTroopsRemaining ?? {})};
    let nextPlayerId = null;
    let nextPlacementTurnTroopsRemaining = game.placementTurnTroopsRemaining ?? 0;
    if (game.isInitialPlacement) {
      const automaticPlacement = autoPlaceDisconnectedTroops({
        game: {...game,territories: updatedTerritories,initialTroopsRemaining: updatedInitialTroopsRemaining},playerId: currentPlayer.id});
      updatedTerritories = automaticPlacement.territories;
      updatedInitialTroopsRemaining = automaticPlacement.initialTroopsRemaining;
      const allTroopsPlaced = Object.values(updatedInitialTroopsRemaining).every((remainingTroops) => remainingTroops === 0);
      if (allTroopsPlaced) {
        nextPlayerId = updatedPlayers.find((player) => player.in_game !== false && player.isConnected !== false && updatedTerritories.some((territory) => territory.owner ===player.id))?.id ?? null;
        if (!nextPlayerId) {
          transaction.update(roomReference, {
            "game.players": updatedPlayers,
            "game.territories": updatedTerritories,
            "game.initialTroopsRemaining": updatedInitialTroopsRemaining,
            "game.chatMessages": updatedMessages,
            updatedAt: serverTimestamp(),
          });
          return;
        }
        transaction.update(roomReference, {
          "game.players": updatedPlayers,
          "game.territories": updatedTerritories,
          "game.initialTroopsRemaining": updatedInitialTroopsRemaining,
          "game.placementTurnTroopsRemaining": 0,
          "game.isInitialPlacement": false,
          "game.currentPlayerId": nextPlayerId,
          "game.reinforcementsRemaining": getReinforcementsForPlayer(updatedTerritories, nextPlayerId),
          "game.turnMode": null,
          "game.attackingTerritoryId": null,
          "game.defendingTerritoryId": null,
          "game.attackableTerritoryIds": [],
          "game.attackResult": null,
          "game.pendingConquest": null,
          "game.transferSourceTerritoryId": null,
          "game.transferTargetTerritoryId": null,
          "game.chatMessages": updatedMessages,
          updatedAt: serverTimestamp(),
        });
        return;
      }
      nextPlayerId = getNextConnectedPlayerId({
          players: updatedPlayers,
          territories: updatedTerritories,
          currentPlayerId: currentPlayer.id,
          initialTroopsRemaining: updatedInitialTroopsRemaining,
        });
      if (!nextPlayerId) {
        transaction.update(roomReference, {
          "game.players": updatedPlayers,
          "game.territories": updatedTerritories,
          "game.initialTroopsRemaining": updatedInitialTroopsRemaining,
          "game.chatMessages": updatedMessages,
          updatedAt: serverTimestamp(),
        });
        return;
      }
      nextPlacementTurnTroopsRemaining = Math.min(INITIAL_TROOPS_PER_TURN, updatedInitialTroopsRemaining[nextPlayerId] ?? 0);
      transaction.update(roomReference, {
        "game.players": updatedPlayers,
        "game.territories": updatedTerritories,
        "game.initialTroopsRemaining": updatedInitialTroopsRemaining,
        "game.placementTurnTroopsRemaining": nextPlacementTurnTroopsRemaining,
        "game.currentPlayerId": nextPlayerId,
        "game.chatMessages": updatedMessages,
        updatedAt: serverTimestamp(),
      });
      return;
    }
    //Durante una conquista in sospeso trasferisce automaticamente una pedina
       if (game.pendingConquest) {
      const sourceId = game.pendingConquest.attackingTerritoryId;
      const targetId = game.pendingConquest.defendingTerritoryId;
      updatedTerritories = updatedTerritories.map((territory) => {
          if (territory.id === sourceId) {
            return {...territory,troops: Math.max(1, (territory.troops ?? 1) - 1)};
          }
          if (territory.id === targetId) {
            return {...territory,owner: currentPlayer.id,troops: 1};
          }
          return territory;
        });
    }
    nextPlayerId = getNextConnectedPlayerId({
        players: updatedPlayers,
        territories: updatedTerritories,
        currentPlayerId: currentPlayer.id,
      });
    if (!nextPlayerId) {
      transaction.update(roomReference, {
        "game.players": updatedPlayers,
        "game.territories": updatedTerritories,
        "game.chatMessages": updatedMessages,
        updatedAt: serverTimestamp(),
      });
      return;
    }
    updatedPlayers = updatedPlayers.map((player) => player.id === nextPlayerId ? {...player, bonus_def: 0, activated_def: false}: player);
    transaction.update(roomReference, {
      "game.players": updatedPlayers,
      "game.territories": updatedTerritories,
      "game.currentPlayerId": nextPlayerId,
      "game.reinforcementsRemaining": getReinforcementsForPlayer(updatedTerritories, nextPlayerId),
      "game.turnMode": null,
      "game.attackingTerritoryId": null,
      "game.defendingTerritoryId": null,
      "game.attackableTerritoryIds": [],
      "game.attackResult": null,
      "game.pendingConquest": null,
      "game.transferSourceTerritoryId": null,
      "game.transferTargetTerritoryId": null,
      "game.chatMessages": updatedMessages,
      updatedAt: serverTimestamp(),
    });
  });
}

//Esce da una stanza
export async function leaveOnlineRoom({ roomCode, uid}) {
  if (!uid) {
    return;
  }
  const normalizedCode = normalizeRoomCode(roomCode);
  const roomReference = doc(db, "rooms", normalizedCode);
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      return;
    }
    const roomData = roomSnapshot.data();
    const currentPlayers = roomData.players ?? [];
    const remainingPlayers = currentPlayers.filter((player) => player.uid !== uid);
    if (remainingPlayers.length === 0) {
      transaction.delete(roomReference);
      return;
    }
    let nextHostUid = roomData.hostUid;
    if (roomData.hostUid === uid) {
      nextHostUid = remainingPlayers[0].uid;
    }
    const isRandomRoom = roomData.type === "random";
    const updatedPlayers = remainingPlayers.map((player) => ({...player, isHost: player.uid === nextHostUid, isReady: isRandomRoom ? true : false}));
    transaction.update(roomReference, {
      hostUid: nextHostUid,
      players: updatedPlayers,
      playerCount: updatedPlayers.length,
      status: "waiting",
      countdownStartedAt: null,
      countdownEndsAt: null,
      updatedAt: serverTimestamp(),
    });
  });
}
//Controlla una stanza casuale rimasta su waiting anche se ci sono 4 partecipanti
export async function ensureRandomRoomCountdown({ roomCode, }) {
  const normalizedCode = normalizeRoomCode(roomCode);
  if (normalizedCode.length !== ROOM_CODE_LENGTH) {
    return;
  }
  const roomReference = doc(db, "rooms", normalizedCode);
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      return;
    }
    const roomData = roomSnapshot.data();
    const currentPlayers = roomData.players ?? [];
    if (roomData.type !== "random" || roomData.status !== "waiting" || currentPlayers.length !== MAX_PLAYERS) {
      return;
    }
    const updatedPlayers = currentPlayers.map((player) => ({...player, isReady: true}));
    transaction.update(roomReference, {
      players: updatedPlayers,
      playerCount: updatedPlayers.length,
      status: "countdown",
      countdownStartedAt: serverTimestamp(),
      countdownEndsAt: null,
      updatedAt: serverTimestamp(),
    });
  });
}