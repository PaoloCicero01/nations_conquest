import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const STORAGE_KEY = "nationsConquestSettings"; //Chiave per salvare le impostazioni del browser

//Costanti per la transizione del volume
const MUSIC_FADE_IN_DURATION = 500;
const MUSIC_FADE_OUT_DURATION = 450;
const MUSIC_FADE_STEP = 25;

const DEFAULT_SETTINGS = {
  musicEnabled: true,
  musicVolume: 0.5,
  effectsEnabled: true,
  effectsVolume: 0.7,
  animationsEnabled: true,
};

const AudioSettingsContext = createContext(null);

//Per garantire che rimanga tra 0 e 1
function clampVolume(value) {
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    return 0;
  }
  return Math.min(1,Math.max(0, numericValue));
}

//Recuperiamo le impostazioni precedentemente salvate 
function loadStoredSettings() {
  try {
    const storedValue = localStorage.getItem(STORAGE_KEY);
    if (!storedValue) {
      return DEFAULT_SETTINGS;
    }
    const parsedValue = JSON.parse(storedValue);
    return {
      musicEnabled: parsedValue.musicEnabled ?? DEFAULT_SETTINGS.musicEnabled,
      musicVolume: clampVolume(parsedValue.musicVolume ?? DEFAULT_SETTINGS.musicVolume),
      effectsEnabled: parsedValue.effectsEnabled ?? DEFAULT_SETTINGS.effectsEnabled,
      effectsVolume: clampVolume(parsedValue.effectsVolume ?? DEFAULT_SETTINGS.effectsVolume),
      animationsEnabled: parsedValue.animationsEnabled ?? DEFAULT_SETTINGS.animationsEnabled,
    };
  } catch (error) {
    console.error("Impossibile leggere le impostazioni salvate:", error);
    return DEFAULT_SETTINGS;
  }
}

//Variazione graduale del volume
function fadeAudio({audio,from,to,duration,onComplete}) {
  if (!audio) {
    onComplete?.();
    return () => {};
  }
  const startVolume = clampVolume(from);
  const targetVolume = clampVolume(to);
  const totalSteps =Math.max(1,Math.ceil(duration / MUSIC_FADE_STEP));
  let currentStep = 0;
  audio.volume = startVolume;
  //Aggiorniamo periodicamente il volume
  const intervalId = window.setInterval(() => { 
      currentStep += 1;
      const progress = Math.min(1,currentStep / totalSteps);
      audio.volume = clampVolume(startVolume + (targetVolume - startVolume) * progress);
      if (progress >= 1) {
        window.clearInterval(intervalId); //Interrompiamo il timer
        onComplete?.(); //Callback di completamento
      }
    }, MUSIC_FADE_STEP);

//Ritorniamo una funzione così possiamo interrompere il fade prima del completamento
  return () => {
    window.clearInterval(intervalId); 
  };
}

//Gestisce lo stato e rende disponibili le funzionalità audio ai componenti
export function AudioSettingsProvider({ children}) {
  const [settings,setSettings] = useState(loadStoredSettings);
  const musicAudioRef = useRef(null); //Conserviamo il riferimento all'oggetto audio della musica
  const currentMusicSourceRef = useRef(""); //Memorizziamo il percorso della musica corrente
  const fadeCleanupRef = useRef(null); //Conserviamo funzione per interrompere transizione del volume
  const latestSettingsRef = useRef(settings); //Riferimento alle impostazioni recenti
  useEffect(() => {
    latestSettingsRef.current = settings;
  }, [settings]);

//Mantiene stabile il riferimento alla funzione
  const clearCurrentFade = useCallback(() => {
      if(fadeCleanupRef.current) {
        fadeCleanupRef.current();
        fadeCleanupRef.current = null;
      }
    }, []);

  const stopMusic = useCallback(({immediate = false} = {}) => {
        const audio = musicAudioRef.current;
        if (!audio) {
          return;
        }
        clearCurrentFade();
        const finishStop = () => {
          audio.pause();
          audio.currentTime = 0;
          if(musicAudioRef.current === audio) {
            musicAudioRef.current = null;
            currentMusicSourceRef.current = "";
          }
        };

        if(immediate || audio.volume <= 0) {
          finishStop();
          return;
        }
        fadeCleanupRef.current = fadeAudio({audio,from: audio.volume,to: 0,duration: MUSIC_FADE_OUT_DURATION,onComplete: () => {
              fadeCleanupRef.current = null;
              finishStop();
            },
          });
      },[clearCurrentFade]
    );

  const playMusic = useCallback(async (source, {loop = true,restart = false} = {}) => {
        const currentSettings = latestSettingsRef.current;
        if(!currentSettings.musicEnabled || !source){
          return false;
        }
        //Verifichiamo che la traccia esista sia quella richiesta
        const currentAudio = musicAudioRef.current;
        const isSameTrack = currentAudio && currentMusicSourceRef.current === source; 
        if(isSameTrack && !restart){
          clearCurrentFade();
          currentAudio.loop = loop;
          if(currentAudio.paused){
            try {
              await currentAudio.play();
            } catch (error) {
              console.warn("Riproduzione musica bloccata dal browser:", error);
              return false;
            }
          }
          //Avviamo la musica gradualmente
          fadeCleanupRef.current = fadeAudio({audio: currentAudio, from: currentAudio.volume,to:currentSettings.musicVolume, duration:MUSIC_FADE_IN_DURATION,onComplete: () => {
                fadeCleanupRef.current = null;
              },
            });
          return true;
        }
        clearCurrentFade();
        const previousAudio = musicAudioRef.current;
        if (previousAudio) {
          const oldAudio = previousAudio;
          fadeAudio({audio: oldAudio,from:oldAudio.volume, to: 0, duration: MUSIC_FADE_OUT_DURATION, onComplete: () => {
              oldAudio.pause();
              oldAudio.currentTime = 0;
            },
          });
        }
        const audio = new Audio(source); //Creiamo un oggetto ogni volta che lo chiamo
        audio.loop = loop;
        audio.volume = 0;
        audio.preload = "auto";
        musicAudioRef.current = audio;
        currentMusicSourceRef.current = source;
        try {
          await audio.play();
        } catch (error) {
          console.warn("Riproduzione musica bloccata dal browser:", error);
          if(musicAudioRef.current === audio) { //Se l'oggetto memorizzato è quello che ah generato l'errore, ripristiniamo i riferimenti
            musicAudioRef.current = null;
            currentMusicSourceRef.current = "";
          }
          return false;
        }
        fadeCleanupRef.current = fadeAudio({audio,from: 0, to: currentSettings.musicVolume, duration: MUSIC_FADE_IN_DURATION, onComplete: () => {
              fadeCleanupRef.current = null; //Rimuoviamo il riferimento alla funzione di cancellazione
            },
          });
        return true;
      },[clearCurrentFade]
    );
  const playEffect = useCallback(async(source,{volumeMultiplier = 1,playbackRate = 1,} = {}) => {
        const currentSettings = latestSettingsRef.current;
        if(!currentSettings.effectsEnabled || !source){
          return false;
        }
        const audio = new Audio(source);
        audio.volume = clampVolume(currentSettings.effectsVolume * volumeMultiplier);
        audio.playbackRate = Math.min(2,Math.max(0.5,playbackRate));
        audio.preload = "auto"; //Pre-carichiamo la risorsa audio
        try {
          await audio.play();
          return true;
        }catch (error) {
          console.warn("Riproduzione effetto bloccata dal browser:",error);
          return false;
        }
      },[]
    );
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY,JSON.stringify(settings)); //Salva le impostazioni browser
    document.documentElement.classList.toggle("reduced-game-animations",!settings.animationsEnabled);
  },[settings]);
//Aggiorna la musica quando cambiano le impostazioni
  useEffect(() => {
    const audio = musicAudioRef.current;
    if (!audio) {
      return;
    }
    if (!settings.musicEnabled){
      stopMusic();
      return;
    }
    clearCurrentFade(); //Interrompiamo eventuale transizione
    fadeCleanupRef.current = fadeAudio({audio,from:audio.volume,to:settings.musicVolume,duration: 220, onComplete: () => {
          fadeCleanupRef.current = null;
        },
      });
  },[settings.musicEnabled,settings.musicVolume,stopMusic,clearCurrentFade]);
  useEffect(() => {
    return () => {
      clearCurrentFade();
      const audio = musicAudioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    };
  }, [clearCurrentFade]);

  function updateSetting(settingName,settingValue){
    setSettings((currentSettings) => ({
        ...currentSettings, //Copiamo le proprietà del vecchio oggetto nel nuovo
        [settingName]: settingName === "musicVolume" || settingName === "effectsVolume" ? clampVolume(settingValue): settingValue
      })
    );
  }
  function resetSettings() {
    setSettings({
      ...DEFAULT_SETTINGS,
    });
  }
//Memorizziamo tutte le informazioni e le funzioni che vogliamo condividere tramite il Context
  const contextValue = useMemo(() => ({
        settings,
        updateSetting,
        resetSettings,
        playMusic,
        stopMusic,
        playEffect,
      }),[settings,playMusic,stopMusic,playEffect]
    );
//Rende disponibile contextValue ai componenti discendenti
  return (
    <AudioSettingsContext.Provider
      value={contextValue}
    >
      {children}
    </AudioSettingsContext.Provider>
  );
}
export function useAudioSettings() {
  const context = useContext(AudioSettingsContext);
  if (!context) {
    throw new Error("useAudioSettings deve essere usato dentro AudioSettingsProvider.");
  }
  return context;
}

export {
  DEFAULT_SETTINGS
};
