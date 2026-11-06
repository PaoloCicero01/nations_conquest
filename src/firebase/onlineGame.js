import { doc, runTransaction, serverTimestamp, } from "firebase/firestore";
import { db } from "./firebase";

const INITIAL_TROOPS_PER_PLACEMENT_TURN = 5;

function normalizeRoomCode(roomCode) {
  return String(roomCode ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function getRoomReference(roomCode) {
  const normalizedCode = normalizeRoomCode(roomCode);
  if (!normalizedCode) {
    throw new Error("Codice stanza non valido.");
  }
  return doc(db, "rooms", normalizedCode);
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

function getCurrentGamePlayer({ players, currentPlayerId, uid }) {
  const currentPlayer = players.find((player) => player.id === currentPlayerId);
  if (!currentPlayer) {
    throw new Error("Giocatore corrente non trovato.");
  }
  if (currentPlayer.uid !== uid) {
    throw new Error("Non è il tuo turno.");
  }
  return currentPlayer;
}

function validatePlayingRoom(roomData) {
  if (roomData.status !== "playing" || !roomData.game) {
    throw new Error("La partita non è disponibile.");
  }
  return roomData.game;
}

function validateNormalTurn(game) {
  if (game.isInitialPlacement) {
    throw new Error("Lo schieramento iniziale non è ancora terminato.");
  }
  if (game.winner) {
    throw new Error("La partita è già terminata.");
  }
}

function getNextPlacementPlayerId({ players, currentPlayerId, initialTroopsRemaining }) {
  const currentPlayerIndex = players.findIndex((player) => player.id === currentPlayerId);
  if (currentPlayerIndex === -1) {
    return null;
  }
  for (let i = 1; i <= players.length; i += 1) {
    const nextPlayer = players[(currentPlayerIndex + i) % players.length];
    const troopsRemaining = initialTroopsRemaining[nextPlayer.id] ?? 0;
    if (nextPlayer.in_game !== false && nextPlayer.isConnected !== false && troopsRemaining > 0) {
      return nextPlayer.id;
    }
  }
  return null;
}

function getEnemyAdjacentTerritoryIds({ territory, territories, playerId }) {
  const adjacentIds = territory.adjacent_territory ?? [];
  return adjacentIds.filter((adjacentId) => {
    const adjacentTerritory = territories.find((item) => item.id === adjacentId);
    return (adjacentTerritory && adjacentTerritory.owner !== playerId);
  });
}

function rollDice() {
  return (Math.floor(Math.random() * 6) + 1);
}

//Schieramento iniziale

export async function placeInitialOnlineTroop({ roomCode, uid, territoryId }) {
  if (!uid) {
    throw new Error("Utente Firebase non disponibile.");
  }
  const roomReference = getRoomReference(roomCode);
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      throw new Error("La partita non esiste più.");
    }
    const roomData = roomSnapshot.data();
    const game = validatePlayingRoom(roomData);
    if (!game.isInitialPlacement) {
      throw new Error("Lo schieramento iniziale è terminato.");
    }
    const players = game.players ?? [];
    const territories = game.territories ?? [];
    const currentPlayer = getCurrentGamePlayer({ players, currentPlayerId: game.currentPlayerId, uid });
    const selectedTerritory = territories.find((territory) => territory.id === territoryId);
    if (!selectedTerritory) {
      throw new Error("Regione non trovata.");
    }
    if (selectedTerritory.owner !== currentPlayer.id) {
      throw new Error("Puoi schierare pedine soltanto nelle tue regioni.");
    }
    const initialTroopsRemaining = { ...game.initialTroopsRemaining };
    const playerTroopsRemaining = initialTroopsRemaining[currentPlayer.id] ?? 0;
    const placementTurnTroopsRemaining = game.placementTurnTroopsRemaining ?? 0;
    if (playerTroopsRemaining <= 0 || placementTurnTroopsRemaining <= 0) {
      throw new Error("Non hai altre pedine da schierare in questo turno.");
    }
    const emptyOwnedTerritories = territories.filter((territory) => territory.owner === currentPlayer.id && territory.troops === 0);
    const mustFillEmptyTerritory = playerTroopsRemaining === emptyOwnedTerritories.length;
    if (mustFillEmptyTerritory && selectedTerritory.troops > 0) {
      throw new Error("Devi prima inserire almeno una pedina in ogni tua regione.");
    }
    const updatedTerritories = territories.map((territory) => territory.id === territoryId ? { ...territory, troops: territory.troops + 1 } : territory);
    const updatedPlayerTroopsRemaining = playerTroopsRemaining - 1;
    initialTroopsRemaining[currentPlayer.id] = updatedPlayerTroopsRemaining;
    const updatedPlacementTurnRemaining = placementTurnTroopsRemaining - 1;
    const allTroopsPlaced = Object.values(initialTroopsRemaining).every((remainingTroops) => remainingTroops === 0);
    if (allTroopsPlaced) {
      const firstConnectedPlayer = players.find((player) => player.in_game !== false && player.isConnected !== false);
      const firstPlayerId = firstConnectedPlayer?.id;
      if (!firstPlayerId) {
        throw new Error("Nessun giocatore connesso disponibile.");
      }
      transaction.update(roomReference, {
        "game.territories": updatedTerritories,
        "game.initialTroopsRemaining": initialTroopsRemaining,
        "game.placementTurnTroopsRemaining": 0,
        "game.isInitialPlacement": false,
        "game.currentPlayerId": firstPlayerId,
        "game.reinforcementsRemaining": getReinforcementsForPlayer(updatedTerritories, firstPlayerId),
        "game.turnMode": null,
        "game.attackingTerritoryId": null,
        "game.defendingTerritoryId": null,
        "game.attackableTerritoryIds": [],
        "game.attackResult": null,
        "game.pendingConquest": null,
        updatedAt: serverTimestamp(),
      });
      return;
    }
    const placementTurnFinished = updatedPlacementTurnRemaining === 0 || updatedPlayerTroopsRemaining === 0;
    let nextPlayerId = currentPlayer.id;
    let nextPlacementTurnRemaining = updatedPlacementTurnRemaining;
    if (placementTurnFinished) {
      nextPlayerId = getNextPlacementPlayerId({ players, currentPlayerId: currentPlayer.id, initialTroopsRemaining });
      if (!nextPlayerId) {
        throw new Error("Non è stato possibile trovare il prossimo giocatore connesso.");
      }
      nextPlacementTurnRemaining = Math.min(INITIAL_TROOPS_PER_PLACEMENT_TURN, initialTroopsRemaining[nextPlayerId] ?? 0);
    }
    transaction.update(roomReference, {
      "game.territories": updatedTerritories,
      "game.initialTroopsRemaining": initialTroopsRemaining,
      "game.placementTurnTroopsRemaining": nextPlacementTurnRemaining,
      "game.currentPlayerId": nextPlayerId,
      updatedAt: serverTimestamp(),
    });
  });
}

//Posizionamento dei rinforzi durante un turno normale.

export async function placeOnlineReinforcement({ roomCode, uid, territoryId }) {
  if (!uid) {
    throw new Error("Utente Firebase non disponibile.");
  }
  const roomReference = getRoomReference(roomCode);
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      throw new Error("La partita non esiste più.");
    }
    const game = validatePlayingRoom(roomSnapshot.data());
    validateNormalTurn(game);
    const players = game.players ?? [];
    const territories = game.territories ?? [];
    const currentPlayer = getCurrentGamePlayer({ players, currentPlayerId: game.currentPlayerId, uid });
    const reinforcementsRemaining = game.reinforcementsRemaining ?? 0;
    if (reinforcementsRemaining <= 0) {
      throw new Error("Hai già schierato tutti i rinforzi.");
    }
    if (game.turnMode !== null) {
      throw new Error("Non puoi schierare rinforzi durante questa fase.");
    }
    const selectedTerritory = territories.find((territory) => territory.id === territoryId);
    if (!selectedTerritory) {
      throw new Error("Regione non trovata.");
    }
    if (selectedTerritory.owner !== currentPlayer.id) {
      throw new Error("Puoi aggiungere rinforzi soltanto nelle tue regioni.");
    }
    const updatedTerritories = territories.map((territory) => territory.id === territoryId ? { ...territory, troops: territory.troops + 1 } : territory);
    transaction.update(roomReference, {
      "game.territories": updatedTerritories,
      "game.reinforcementsRemaining": reinforcementsRemaining - 1,
      updatedAt: serverTimestamp(),
    });
  });
}

//Scegliere tra attacco e difesa

export async function chooseOnlineTurnMode({ roomCode, uid, mode }) {
  if (!uid) {
    throw new Error("Utente Firebase non disponibile.");
  }
  if (mode !== "attack" && mode !== "defence") {
    throw new Error("Modalità non valida.");
  }
  const roomReference = getRoomReference(roomCode);
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      throw new Error("La partita non esiste più.");
    }
    const game = validatePlayingRoom(roomSnapshot.data());
    validateNormalTurn(game);
    if ((game.reinforcementsRemaining ?? 0) > 0) {
      throw new Error("Devi prima posizionare tutti i rinforzi.");
    }
    if (game.turnMode !== null) {
      throw new Error("Hai già scelto la modalità del turno.");
    }
    const players = game.players ?? [];
    const territories = game.territories ?? [];
    const currentPlayer = getCurrentGamePlayer({ players, currentPlayerId: game.currentPlayerId, uid });
    if (mode === "attack") {
      transaction.update(roomReference, {
        "game.turnMode": "attack",
        "game.attackingTerritoryId": null,
        "game.defendingTerritoryId": null,
        "game.attackableTerritoryIds": [],
        "game.attackResult": null,
        "game.pendingConquest": null,
        updatedAt: serverTimestamp(),
      });
      return;
    }
    const ownedTerritoriesCount = territories.filter((territory) => territory.owner === currentPlayer.id).length;
    if (ownedTerritoriesCount === 0) {
      throw new Error("Non possiedi territori.");
    }
    const defenceBonus = Math.min(6, Math.floor(ownedTerritoriesCount / 2) + 1);
    const updatedPlayers = players.map((player) => player.id === currentPlayer.id ? { ...player, bonus_def: defenceBonus, activated_def: true } : player);
    transaction.update(roomReference, {
      "game.players": updatedPlayers,
      "game.turnMode": "defence-complete",
      "game.attackingTerritoryId": null,
      "game.defendingTerritoryId": null,
      "game.attackableTerritoryIds": [],
      "game.pendingConquest": null,
      "game.attackResult": {
        type: "defence",
        defenceBonus,
        winner: "defence",
        message: `Bonus difesa +${defenceBonus} attivato.`,
        createdAt: Date.now(),
      },
      updatedAt: serverTimestamp(),
    });
  });
}

//Selezione del territorio dal quale attaccare
export async function selectOnlineAttackingTerritory({ roomCode, uid, territoryId }) {
  if (!uid) {
    throw new Error("Utente Firebase non disponibile.");
  }
  const roomReference = getRoomReference(roomCode);
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      throw new Error("La partita non esiste più.");
    }
    const game = validatePlayingRoom(roomSnapshot.data());
    validateNormalTurn(game);
    if (game.turnMode !== "attack") {
      throw new Error("Non sei in modalità attacco.");
    }
    if (game.pendingConquest) {
      throw new Error("Devi prima completare la conquista.");
    }
    const players = game.players ?? [];
    const territories = game.territories ?? [];
    const currentPlayer = getCurrentGamePlayer({ players, currentPlayerId: game.currentPlayerId, uid });
    const territory = territories.find((item) => item.id === territoryId);
    if (!territory) {
      throw new Error("Regione non trovata.");
    }
    if (game.attackingTerritoryId === territoryId) {
      transaction.update(roomReference, {
        "game.attackingTerritoryId": null,
        "game.defendingTerritoryId": null,
        "game.attackableTerritoryIds": [],
        "game.attackResult": null,
        updatedAt: serverTimestamp(),
      });
      return;
    }
    if (territory.owner !== currentPlayer.id) {
      throw new Error("Devi scegliere una tua regione.");
    }
    if ((territory.troops ?? 0) < 2) {
      throw new Error("La regione attaccante deve avere almeno 2 pedine.");
    }
    const attackableTerritoryIds = getEnemyAdjacentTerritoryIds({territory, territories, playerId: currentPlayer.id});
    if (attackableTerritoryIds.length === 0) {
      throw new Error("Questa regione non confina con territori nemici.");
    }
    transaction.update(roomReference, {
      "game.attackingTerritoryId": territory.id,
      "game.defendingTerritoryId": null,
      "game.attackableTerritoryIds": attackableTerritoryIds,
      "game.attackResult": null,
      updatedAt: serverTimestamp(),
    });
  });
}

//Selezione del territorio da attaccare
export async function selectOnlineDefendingTerritory({ roomCode, uid, territoryId, }) {
  if (!uid) {
    throw new Error("Utente Firebase non disponibile.");
  }
  const roomReference = getRoomReference(roomCode);
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      throw new Error("La partita non esiste più.");
    }
    const game = validatePlayingRoom(roomSnapshot.data());
    validateNormalTurn(game);
    if (game.turnMode !== "attack") {
      throw new Error("Non sei in modalità attacco.");
    }
    getCurrentGamePlayer({players: game.players ?? [], currentPlayerId: game.currentPlayerId, uid});
    if (!game.attackingTerritoryId) {
      throw new Error("Scegli prima la regione attaccante.");
    }
    const attackableTerritoryIds = game.attackableTerritoryIds ?? [];
    if (!attackableTerritoryIds.includes(territoryId)) {
      throw new Error("Questa regione non può essere attaccata.");
    }
    transaction.update(roomReference, {
      "game.defendingTerritoryId": territoryId,
      "game.attackResult": null,
      updatedAt: serverTimestamp(),
    });
  });
}

//Annulla la selezione dell'attacco
export async function resetOnlineAttackSelection({ roomCode, uid, }) {
  if (!uid) {
    throw new Error("Utente Firebase non disponibile.");
  }
  const roomReference = getRoomReference(roomCode);
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      throw new Error("La partita non esiste più.");
    }
    const game = validatePlayingRoom(roomSnapshot.data());
    validateNormalTurn(game);
    getCurrentGamePlayer({players: game.players ?? [], currentPlayerId: game.currentPlayerId, uid});
    if (game.turnMode !== "attack") {
      throw new Error("La modalità attacco non è attiva.");
    }
    if (game.pendingConquest) {
      throw new Error("Devi completare la conquista.");
    }
    transaction.update(roomReference, {
      "game.attackingTerritoryId": null,
      "game.defendingTerritoryId": null,
      "game.attackableTerritoryIds": [],
      "game.attackResult": null,
      updatedAt: serverTimestamp(),
    });
  });
}

//Esegue il combattimento
export async function confirmOnlineAttack({ roomCode, uid, }) {
  if (!uid) {
    throw new Error("Utente Firebase non disponibile.");
  }
  const roomReference = getRoomReference(roomCode);
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      throw new Error("La partita non esiste più.");
    }
    const game = validatePlayingRoom(roomSnapshot.data());
    validateNormalTurn(game);
    if (game.turnMode !== "attack") {
      throw new Error("Non sei in modalità attacco.");
    }
    if (game.pendingConquest) {
      throw new Error("Devi prima completare la conquista.");
    }
    const players = game.players ?? [];
    const territories = game.territories ?? [];
    const currentPlayer = getCurrentGamePlayer({players, currentPlayerId: game.currentPlayerId, uid});
    const attackingTerritory = territories.find((territory) => territory.id === game.attackingTerritoryId);
    const defendingTerritory = territories.find((territory) => territory.id === game.defendingTerritoryId);
    if (!attackingTerritory || !defendingTerritory){
      throw new Error("Seleziona attaccante e bersaglio.");
    }
    if (attackingTerritory.owner !== currentPlayer.id) {
      throw new Error("La regione attaccante non appartiene al giocatore corrente.");
    }
    const isAdjacent = attackingTerritory.adjacent_territory?.includes(defendingTerritory.id);
    if (!isAdjacent) {
      throw new Error("Le due regioni non sono confinanti.");
    }
    if (attackingTerritory.owner === defendingTerritory.owner) {
      throw new Error("Non puoi attaccare una tua regione.");
    }
    if((attackingTerritory.troops ?? 0) < 2) {
      throw new Error("La regione attaccante non ha abbastanza pedine.");
    }
    const defenderPlayer = players.find((player) => player.id === defendingTerritory.owner);
    if(!defenderPlayer){
      throw new Error("Giocatore difensore non trovato.");
    }
    const attackerDice = rollDice();
    const defenderDice = rollDice();
    const attackingTroops = attackingTerritory.troops ?? 0;
    const defendingTroops = defendingTerritory.troops ?? 0;
    const defenceBonus = Math.max(0, defenderPlayer.bonus_def ?? 0);
    const attackerScore = attackingTroops + attackerDice * attackingTroops;
    const defenderScore = defendingTroops + defenceBonus + defenderDice * defendingTroops;
    const attackerWins = attackerScore > defenderScore;
    if (attackerWins) {
      const lostDefendingTroops = Math.min(attackingTroops, defendingTroops);
      const remainingDefendingTroops = Math.max(0, defendingTroops - lostDefendingTroops);
      const conquered = remainingDefendingTroops === 0;
      const updatedTerritories = territories.map((territory) => territory.id === defendingTerritory.id? {...territory, troops: remainingDefendingTroops}: territory);
      transaction.update(roomReference, {
        "game.territories": updatedTerritories,
        "game.attackResult": {
          attackerDice,
          defenderDice,
          attackerScore,
          defenderScore,
          defenceBonus,
          winner: "attacker",
          conquered,
          lostTroops: lostDefendingTroops,
          affectedTerritoryId: defendingTerritory.id,
          message: conquered? `${attackingTerritory.name} ha conquistato ${defendingTerritory.name}.`: "L'attaccante ha vinto, ma la regione resiste.",
          createdAt: Date.now(),
        },
        "game.pendingConquest": conquered? {
            attackingTerritoryId: attackingTerritory.id,
            defendingTerritoryId: defendingTerritory.id,
            previousOwnerId: defendingTerritory.owner,
            maximumTransfer: Math.max(1, attackingTroops -1),
            selectedTransfer: 1,
          }: null,
        "game.attackingTerritoryId": conquered? attackingTerritory.id: null,
        "game.defendingTerritoryId": conquered? defendingTerritory.id: null,
        "game.attackableTerritoryIds": conquered ? game.attackableTerritoryIds ?? []: [],
        updatedAt: serverTimestamp(),
      });
      return;
    }
    const maximumLoss = Math.max(0, attackingTroops - 1);
    const lostAttackingTroops = Math.min(defendingTroops, maximumLoss);
    const remainingAttackingTroops = attackingTroops - lostAttackingTroops;
    const updatedTerritories = territories.map((territory) => territory.id === attackingTerritory.id? {...territory,troops: remainingAttackingTroops}: territory);
    transaction.update(roomReference,{
      "game.territories": updatedTerritories,
      "game.attackResult": {
        attackerDice,
        defenderDice,
        attackerScore,
        defenderScore,
        defenceBonus,
        winner: "defender",
        conquered: false,
        lostTroops: lostAttackingTroops,
        affectedTerritoryId: attackingTerritory.id,
        message: attackerScore === defenderScore ? "Pareggio: vince la difesa." : "Il difensore ha respinto l'attacco.",
        createdAt: Date.now(),
      },
      "game.pendingConquest": null,
      "game.attackingTerritoryId": null,
      "game.defendingTerritoryId": null,
      "game.attackableTerritoryIds": [],
      updatedAt: serverTimestamp(),
    });
  });
}

//Termina la fase di attacco
export async function finishOnlineAttackMode({ roomCode, uid, }) {
  if (!uid) {
    throw new Error("Utente Firebase non disponibile.");
  }
  const roomReference = getRoomReference(roomCode);
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      throw new Error("La partita non esiste più.");
    }
    const game = validatePlayingRoom(roomSnapshot.data());
    validateNormalTurn(game);
    getCurrentGamePlayer({players: game.players ?? [], currentPlayerId: game.currentPlayerId, uid});
    if (game.turnMode !== "attack") {
      throw new Error("La modalità attacco non è attiva.");
    }
    if (game.pendingConquest) {
      throw new Error("Devi prima completare la conquista.");
    }
    transaction.update(roomReference, {
      "game.turnMode": "attack-complete",
      "game.attackingTerritoryId": null,
      "game.defendingTerritoryId": null,
      "game.attackableTerritoryIds": [],
      updatedAt: serverTimestamp(),
    });
  });
}

//Aggiorna in tempo reale la quantità di pedine scelta durante una conquista.
//Il valore viene salvato su Firestore dentro pendingConquest, così tutti i client collegati alla stanza vedono la stessa scelta.
export async function updateOnlineConquestTransferSelection({ roomCode, uid, troopsToTransfer, }) {
  if (!uid) {
    throw new Error("Utente Firebase non disponibile.");
  }
  const roomReference = getRoomReference(roomCode);
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      throw new Error("La partita non esiste più.");
    }
    const game = validatePlayingRoom(roomSnapshot.data());
    validateNormalTurn(game);
    const players = game.players ?? [];
    const territories = game.territories ?? [];
    const currentPlayer = getCurrentGamePlayer({players,currentPlayerId: game.currentPlayerId, uid});
    const pendingConquest = game.pendingConquest;
    if (!pendingConquest) {
      throw new Error("Non esiste una conquista da completare.");
    }
    const sourceTerritory = territories.find((territory) => territory.id === pendingConquest.attackingTerritoryId);
    if (!sourceTerritory) {
      throw new Error("La regione attaccante non è stata trovata.");
    }
    if (sourceTerritory.owner !== currentPlayer.id) {
      throw new Error("La regione attaccante non appartiene più al giocatore corrente.");
    }
    const maximumTransfer = Math.max(1, Math.min(pendingConquest.maximumTransfer ?? 1, sourceTerritory.troops - 1));
    const requestedTransfer = Number(troopsToTransfer);
    if (!Number.isInteger(requestedTransfer) || requestedTransfer < 1 || requestedTransfer > maximumTransfer) {
      throw new Error("Il numero di pedine da trasferire non è valido.");
    }
    transaction.update(roomReference,{
      "game.pendingConquest.selectedTransfer": requestedTransfer,
      updatedAt: serverTimestamp(),
    });
  });
}

//Trasferimento obbligatorio dovuto alla conquista
export async function confirmOnlineConquestTransfer({ roomCode, uid, troopsToTransfer, }) {
  if (!uid) {
    throw new Error("Utente Firebase non disponibile.");
  }
  const roomReference = getRoomReference(roomCode);
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      throw new Error("La partita non esiste più.");
    }
    const game = validatePlayingRoom(roomSnapshot.data());
    validateNormalTurn(game);
    const players = game.players ?? [];
    const territories = game.territories ?? [];
    const currentPlayer = getCurrentGamePlayer({players, currentPlayerId: game.currentPlayerId, uid});
    const pendingConquest = game.pendingConquest;
    if (!pendingConquest) {
      throw new Error("Non esiste una conquista da completare.");
    }
    const sourceTerritory = territories.find((territory) => territory.id === pendingConquest.attackingTerritoryId);
    const targetTerritory = territories.find((territory) => territory.id === pendingConquest.defendingTerritoryId);
    if (!sourceTerritory ||!targetTerritory) {
      throw new Error("Le regioni coinvolte nella conquista non sono state trovate.");
    }
    if (sourceTerritory.owner !== currentPlayer.id) {
      throw new Error("La regione attaccante non appartiene più al giocatore corrente.");
    }
    const maximumTransfer = Math.max(1, sourceTerritory.troops - 1);
    const requestedTransfer = Number(pendingConquest.selectedTransfer ?? troopsToTransfer);
    if (!Number.isInteger(requestedTransfer) || requestedTransfer < 1) {
      throw new Error("Il numero di pedine da trasferire non è valido.");
    }
    const validTransfer = Math.min(requestedTransfer, maximumTransfer);
    const previousOwnerId = pendingConquest.previousOwnerId ?? targetTerritory.owner;
    const updatedTerritories = territories.map((territory) => {
      if (territory.id === sourceTerritory.id) {
        return {...territory, troops: territory.troops - validTransfer};
      }
      if (territory.id === targetTerritory.id) {
        return {...territory,owner: currentPlayer.id,troops: validTransfer};
      }
      return territory;
    });
    const defeatedPlayerStillOwnsTerritories = updatedTerritories.some((territory) => territory.owner === previousOwnerId);
    const updatedPlayers = players.map((player) => {
      if (player.id === previousOwnerId && !defeatedPlayerStillOwnsTerritories) {
        return {...player, in_game: false, bonus_def: 0, activated_def: false };
      }
      return player;
    });
    const survivingPlayers = updatedPlayers.filter((player) => player.in_game !== false &&
    updatedTerritories.some((territory) => territory.owner === player.id));
    const winner = survivingPlayers.length === 1?{
      id: survivingPlayers[0].id,
      name: survivingPlayers[0].name,
      color: survivingPlayers[0].color
    }: null;
    transaction.update(roomReference,{
      "game.players": updatedPlayers,
      "game.territories": updatedTerritories,
      "game.pendingConquest": null,
      "game.attackingTerritoryId": null,
      "game.defendingTerritoryId": null,
      "game.attackableTerritoryIds": [],
      "game.attackResult": {
        ...(game.attackResult ??{}),
        conquered: true,
        transferredTroops: validTransfer,
        affectedTerritoryId: targetTerritory.id,
        message: `Regione conquistata. Sono state trasferite ${validTransfer} pedine.`,
        createdAt: Date.now(),
      },
      "game.winner": winner,
      "game.rewardedUids": winner? {}: game.rewardedUids ?? {},
      "game.turnMode": winner ? "game-over": "attack",
      updatedAt: serverTimestamp(),
    });
  });
} 

//Avvia il trasferimento facoltativo
export async function startOnlineTroopTransfer({ roomCode, uid, }) {
  if (!uid) {
    throw new Error("Utente Firebase non disponibile.");
  }
  const roomReference = getRoomReference(roomCode);
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      throw new Error("La partita non esiste più.");
    }
    const game = validatePlayingRoom(roomSnapshot.data());
    validateNormalTurn(game);
    getCurrentGamePlayer({players: game.players ?? [],currentPlayerId: game.currentPlayerId,uid});
    const allowedModes = ["attack-complete","defence-complete"];
    if (!allowedModes.includes(game.turnMode)) {
      throw new Error("Il trasferimento non può essere avviato in questa fase.");
    }
    if (game.pendingConquest) {
      throw new Error("Devi prima completare la conquista.");
    }
    transaction.update(roomReference, {
      "game.turnMode": "transfer",
      "game.transferSourceTerritoryId": null,
      "game.transferTargetTerritoryId": null,
      updatedAt: serverTimestamp(),
    });
  });
}

//Selezione della regione di partenza per il trasferimento facoltativo
export async function selectOnlineTransferSource({ roomCode, uid, territoryId, }) {
  if (!uid) {
    throw new Error("Utente Firebase non disponibile.");
  }
  const roomReference = getRoomReference(roomCode);
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      throw new Error("La partita non esiste più.");
    }
    const game = validatePlayingRoom(roomSnapshot.data());
    validateNormalTurn(game);
    if (game.turnMode !== "transfer") {
      throw new Error("La fase di trasferimento non è attiva.");
    }
    const territories = game.territories ?? [];
    const currentPlayer = getCurrentGamePlayer({players: game.players ?? [], currentPlayerId: game.currentPlayerId, uid});
    const territory = territories.find((item) => item.id === territoryId);
    if (!territory) {
      throw new Error("Regione non trovata.");
    }
    if (territory.owner !== currentPlayer.id) {
      throw new Error("Devi selezionare una tua regione.");
    }
    if ((territory.troops ?? 0) < 2) {
      throw new Error("La regione di partenza deve avere almeno 2 pedine.");
    }
    transaction.update(roomReference, {
      "game.transferSourceTerritoryId": territory.id,
      "game.transferTargetTerritoryId": null,
      updatedAt: serverTimestamp(),
    });
  });
}

//Selezione della regione alleata di destinazione
export async function selectOnlineTransferTarget({ roomCode, uid, territoryId, }) {
  if (!uid) {
    throw new Error("Utente Firebase non disponibile.");
  }
  const roomReference = getRoomReference(roomCode);
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      throw new Error("La partita non esiste più.");
    }
    const game = validatePlayingRoom(roomSnapshot.data());
    validateNormalTurn(game);
    if (game.turnMode !== "transfer") {
      throw new Error("La fase di trasferimento non è attiva.");
    }
    const territories = game.territories ?? [];
    const currentPlayer = getCurrentGamePlayer({players: game.players ?? [], currentPlayerId: game.currentPlayerId, uid});
    const sourceTerritory = territories.find((territory) => territory.id === game.transferSourceTerritoryId);
    const targetTerritory = territories.find((territory) => territory.id === territoryId);
    if (!sourceTerritory) {
      throw new Error("Seleziona prima la regione di partenza.");
    }
    if (!targetTerritory) {
      throw new Error("Regione di destinazione non trovata.");
    }
    if (targetTerritory.owner !== currentPlayer.id) {
      throw new Error("La regione di destinazione deve essere tua.");
    }
    if (targetTerritory.id === sourceTerritory.id) {
      throw new Error("Le due regioni devono essere differenti.");
    }
    const isAdjacent = sourceTerritory.adjacent_territory?.includes(targetTerritory.id);
    if (!isAdjacent) {
      throw new Error("Le due regioni non sono adiacenti.");
    }
    transaction.update(roomReference, {
      "game.transferTargetTerritoryId": targetTerritory.id,
      updatedAt: serverTimestamp(),
    });
  });
}


//Conferma il trasferimento facoltativo delle pedine
export async function confirmOnlineTroopTransfer({ roomCode, uid, troopsToMove, }) {
  if (!uid) {
    throw new Error("Utente Firebase non disponibile.");
  }
  const roomReference = getRoomReference(roomCode);
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      throw new Error("La partita non esiste più.");
    }
    const game = validatePlayingRoom(roomSnapshot.data());
    validateNormalTurn(game);
    if (game.turnMode !== "transfer") {
      throw new Error("La fase di trasferimento non è attiva.");
    }
    const territories = game.territories ?? [];
    const currentPlayer = getCurrentGamePlayer({players: game.players ?? [], currentPlayerId: game.currentPlayerId, uid});
    const sourceTerritory = territories.find((territory) => territory.id === game.transferSourceTerritoryId);
    const targetTerritory = territories.find((territory) => territory.id === game.transferTargetTerritoryId);
    if (!sourceTerritory || !targetTerritory) {
      throw new Error("Seleziona regione di partenza e regione di arrivo.");
    }
    if (sourceTerritory.owner !== currentPlayer.id || targetTerritory.owner !== currentPlayer.id) {
      throw new Error("Puoi trasferire pedine soltanto tra tue regioni.");
    }
    const maximumMove = sourceTerritory.troops - 1;
    const requestedMove = Number(troopsToMove);
    if (!Number.isInteger(requestedMove) || requestedMove < 1 || requestedMove > maximumMove){
      throw new Error("Numero di pedine non valido.");
    }
    const updatedTerritories = territories.map((territory) => {
      if (territory.id === sourceTerritory.id) {
        return {...territory, troops: territory.troops - requestedMove};
      }
      if (territory.id === targetTerritory.id) {
        return { ...territory, troops: territory.troops + requestedMove};
      }
      return territory;
    });
    transaction.update(roomReference, {
      "game.territories": updatedTerritories,
      "game.turnMode": "transfer-complete",
      "game.transferSourceTerritoryId": null,
      "game.transferTargetTerritoryId": null,
      updatedAt: serverTimestamp(),
    });
  });
}

//Salta il trasferimento facoltativo
export async function skipOnlineTroopTransfer({ roomCode, uid, }) {
  if (!uid) {
    throw new Error("Utente Firebase non disponibile.");
  }
  const roomReference = getRoomReference(roomCode);
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      throw new Error("La partita non esiste più.");
    }
    const game = validatePlayingRoom(roomSnapshot.data());
    validateNormalTurn(game);
    getCurrentGamePlayer({
      players: game.players ?? [],
      currentPlayerId: game.currentPlayerId,
      uid,
    });
    if (game.turnMode !== "transfer") {
      throw new Error("La fase di trasferimento non è attiva.");
    }
    transaction.update(roomReference, {
      "game.turnMode": "transfer-complete",
      "game.transferSourceTerritoryId": null,
      "game.transferTargetTerritoryId": null,
      updatedAt: serverTimestamp(),
    });
  });
}

function getNextActiveOnlinePlayerId({ players, territories, currentPlayerId, }) {
  const currentPlayerIndex = players.findIndex((player) => player.id === currentPlayerId);
  if (currentPlayerIndex === -1) {
    return null;
  }
  for (let i = 1; i <= players.length; i += 1) {
    const nextPlayer = players[(currentPlayerIndex + i) % players.length];
    const ownsTerritories = territories.some((territory) => territory.owner === nextPlayer.id);
    if (nextPlayer.in_game !== false && nextPlayer.isConnected !== false && ownsTerritories) {
      return nextPlayer.id;
    }
  }
  return null;
}

//Termina il turno e passa al giocatore successivo
export async function finishOnlineTurn({ roomCode, uid, }) {
  if (!uid) {
    throw new Error("Utente Firebase non disponibile.");
  }
  const roomReference = getRoomReference(roomCode);
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    if (!roomSnapshot.exists()) {
      throw new Error("La partita non esiste più.");
    }
    const game = validatePlayingRoom(roomSnapshot.data());
    validateNormalTurn(game);
    const players = game.players ?? [];
    const territories = game.territories ?? [];
    getCurrentGamePlayer({ players, currentPlayerId: game.currentPlayerId, uid });
    const allowedModes = ["attack-complete", "defence-complete", "transfer-complete"];
    if (!allowedModes.includes(game.turnMode)) {
      throw new Error("Non puoi terminare il turno in questa fase.");
    }
    if (game.pendingConquest) {
      throw new Error("Devi prima completare la conquista.");
    }
    const nextPlayerId = getNextActiveOnlinePlayerId({ players, territories, currentPlayerId: game.currentPlayerId });
    if (!nextPlayerId) {
      throw new Error("Non è stato possibile trovare il prossimo giocatore.");
    }
    const updatedPlayers = players.map((player) => player.id === nextPlayerId ? { ...player, bonus_def: 0, activated_def: false } : player);
    transaction.update(roomReference, {
      "game.players": updatedPlayers,
      "game.currentPlayerId": nextPlayerId,
      "game.reinforcementsRemaining": getReinforcementsForPlayer(territories, nextPlayerId),
      "game.turnMode": null,
      "game.attackingTerritoryId": null,
      "game.defendingTerritoryId": null,
      "game.attackableTerritoryIds": [],
      "game.attackResult": null,
      "game.pendingConquest": null,
      "game.transferSourceTerritoryId": null,
      "game.transferTargetTerritoryId": null,
      updatedAt: serverTimestamp(),
    });
  });
}