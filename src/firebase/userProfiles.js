import { doc, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

const PROFILE_COLLECTION = "userProfiles";
const COMPLETION_XP = 20;
const WINNER_BONUS_XP = 30;

export function calculateLevel(totalXp) {
  const safeXp = Math.max(0, Number(totalXp) || 0);
  return Math.floor(Math.sqrt(safeXp / 100)) + 1;
}

export function getXpForLevel(level) {
  const safeLevel = Math.max(1, Number(level) || 1);
  return (safeLevel - 1) ** 2 * 100;
}

export function getProfileProgress(totalXp) {
  const safeXp = Math.max(0, Number(totalXp) || 0);
  const level = calculateLevel(safeXp);
  const currentLevelXp = getXpForLevel(level);
  const nextLevelXp = getXpForLevel(level + 1);
  const xpInsideLevel = safeXp - currentLevelXp;
  const xpRequiredForLevel = nextLevelXp - currentLevelXp;
  const progressPercentage = xpRequiredForLevel > 0 ? Math.min(100, Math.max(0, (xpInsideLevel / xpRequiredForLevel) * 100)) : 100;

  return {
    level,
    totalXp: safeXp,
    currentLevelXp,
    nextLevelXp,
    xpInsideLevel,
    xpRequiredForLevel,
    xpToNextLevel: Math.max(0, nextLevelXp - safeXp),
    progressPercentage,
  };
}

function getProfileReference(uid) {
  if (!uid) {
    throw new Error("UID del profilo non disponibile.");
  }
  return doc(db, PROFILE_COLLECTION, uid);
}

export async function ensureUserProfile(user) {
  if (!user?.uid) {
    return;
  }
  const profileReference = getProfileReference(user.uid);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(profileReference);
    const profileData = {
      uid: user.uid,
      displayName: user.displayName || (user.isAnonymous ? "Guest" : user.email?.split("@")[0]) || "Giocatore",
      email: user.email ?? null,
      photoURL: user.photoURL ?? null,
      isAnonymous: Boolean(user.isAnonymous),
      updatedAt: serverTimestamp(),
    };
    if (!snapshot.exists()) {
      transaction.set(profileReference, {
        ...profileData,
        xp: 0,
        level: 1,
        onlineGamesPlayed: 0,
        onlineWins: 0,
        onlineLosses: 0,
        claimedOnlineRewards: {},
      });
      return;
    }
    transaction.update(profileReference, profileData);
  });
}

export function subscribeToUserProfile(uid, onProfile, onError) {
  if (!uid) {
    onProfile?.(null);
    return () => {};
  }
  const profileReference = getProfileReference(uid);
  return onSnapshot(profileReference,(snapshot) => {
      onProfile?.(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    },(error) => {
      console.error("Errore profilo:", error);
      onError?.(error);
    }
  );
}

export async function claimOnlineGameReward({ roomCode, uid }) {
  const normalizedRoomCode = String(roomCode ?? "").trim().toUpperCase();
  if (!normalizedRoomCode) {
    throw new Error("Codice stanza non valido.");
  }
  if (!uid) {
    throw new Error("Utente non disponibile.");
  }
  const roomReference = doc(db, "rooms", normalizedRoomCode);
  const profileReference = getProfileReference(uid);
  return runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference);
    const profileSnapshot = await transaction.get(profileReference);
    if (!roomSnapshot.exists()) {
      throw new Error("La stanza non esiste più.");
    }
    const roomData = roomSnapshot.data();
    const game = roomData.game;
    if (!game?.winner) {
      throw new Error("La partita non è ancora terminata.");
    }
    const players = game.players ?? [];
    const profilePlayer = players.find((player) => player.uid === uid);
    if (!profilePlayer) {
      throw new Error("Non fai parte di questa partita.");
    }
    const currentProfile = profileSnapshot.exists() ? profileSnapshot.data() : {};
    const claimedOnlineRewards = currentProfile.claimedOnlineRewards && typeof currentProfile.claimedOnlineRewards === "object" ? currentProfile.claimedOnlineRewards: {};
    const previousReward = claimedOnlineRewards[normalizedRoomCode];
    if (previousReward) {
      const currentXp = Number(currentProfile.xp) || 0;
      return {
        alreadyClaimed: true,
        xpAwarded: Number(previousReward.xpAwarded) || 0,
        isWinner: Boolean(previousReward.isWinner),
        previousXp: currentXp,
        newXp: currentXp,
        previousLevel: calculateLevel(currentXp),
        newLevel: calculateLevel(currentXp),
      };
    }
    const isWinner = profilePlayer.id === game.winner.id;
    const xpAwarded = COMPLETION_XP + (isWinner ? WINNER_BONUS_XP : 0);
    const currentXp = Number(currentProfile.xp) || 0;
    const updatedXp = currentXp + xpAwarded;
    const updatedLevel = calculateLevel(updatedXp);
    const currentGamesPlayed = Number(currentProfile.onlineGamesPlayed) || 0;
    const currentWins = Number(currentProfile.onlineWins) || 0;
    const currentLosses = Number(currentProfile.onlineLosses) || 0;
    const updatedRewards = {...claimedOnlineRewards, [normalizedRoomCode]: {
      xpAwarded,
      isWinner,
      playerId: profilePlayer.id,
      claimedAt: Date.now(),
    },
    };

    transaction.set(profileReference,{
      uid,
      displayName: profilePlayer.name || currentProfile.displayName || "Giocatore",
      xp: updatedXp,
      level: updatedLevel,
      onlineGamesPlayed: currentGamesPlayed + 1,
      onlineWins: currentWins + (isWinner ? 1 : 0),
      onlineLosses: currentLosses + (isWinner ? 0 : 1),
      claimedOnlineRewards: updatedRewards,
      lastOnlineGameCode: normalizedRoomCode,
      updatedAt: serverTimestamp(),
    },{ merge: true }
    );

    return {
      alreadyClaimed: false,
      xpAwarded,
      isWinner,
      previousXp: currentXp,
      newXp: updatedXp,
      previousLevel: calculateLevel(currentXp),
      newLevel: updatedLevel,
    };
  });
}