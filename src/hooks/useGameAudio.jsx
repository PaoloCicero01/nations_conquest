import {
  useAudioSettings,
} from "../context/AudioSettingsContext";

//Estraiamo le proprietà dell'oggetto e le ritorniamo
function useGameAudio() {
  const {
    playMusic,
    stopMusic,
    playEffect,
  } = useAudioSettings();

  return {
    playMusic,
    stopMusic,
    playEffect,
  };
}

export default useGameAudio;