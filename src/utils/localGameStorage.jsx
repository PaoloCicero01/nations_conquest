const LOCAL_GAME_STORAGE_KEY = "nationsConquestLocalGame";
const LOCAL_GAME_VERSION = 1;

export function saveLocalGame(gameState){
  try {
    const payload = {
      version: LOCAL_GAME_VERSION,
      savedAt: Date.now(),
      game: gameState,
    };
    localStorage.setItem(LOCAL_GAME_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (error) {
    console.error("Impossibile salvare la partita locale:",error);
    return false;
  }
}

export function loadLocalGame() {
  try {
    const storedValue = localStorage.getItem(LOCAL_GAME_STORAGE_KEY);
    if (!storedValue) {
      return null;
    }
    const payload = JSON.parse(storedValue);
    if(payload?.version !== LOCAL_GAME_VERSION || !payload?.game || !Array.isArray(payload.game.players) || !Array.isArray(payload.game.territories)){
      clearSavedLocalGame();
      return null;
    }
    return {
      ...payload.game, savedAt: payload.savedAt ?? null
    };
  }catch (error) {
    console.error("Impossibile caricare la partita locale:", error);
    clearSavedLocalGame();
    return null;
  }
}

export function hasSavedLocalGame() {
  return Boolean(loadLocalGame());
}

export function clearSavedLocalGame() {
  try {
    localStorage.removeItem(LOCAL_GAME_STORAGE_KEY);
  } catch (error) {
    console.error("Impossibile eliminare il salvataggio locale:",error);
  }
}

export function formatSavedGameDate(timestamp){
  if (!timestamp) {
    return "";
  }
  return new Intl.DateTimeFormat("it-IT",{dateStyle: "short",timeStyle: "short",}).format(new Date(timestamp));
}
