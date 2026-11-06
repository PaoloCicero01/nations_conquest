import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAudioSettings } from "../context/AudioSettingsContext";
import useGameAudio from "../hooks/useGameAudio";
import "./SettingsPage.css";

const MENU_MUSIC = "/audio/menu-music.wav";
const GAME_MUSIC = "/audio/game-music.wav";
const CLICK_SOUND = "/audio/click.wav";

// Restituisce il JSX della pagina.
function SettingsPage() {
  const navigate = useNavigate(); // Per cambiare pagina.
  const location = useLocation(); // Per leggere informazioni della pagina corrente.
  const returnTo = location.state?.returnTo ?? "/";
  const { settings, updateSetting, resetSettings } = useAudioSettings();
  const { playMusic, playEffect } = useGameAudio();
  const reopenPauseMenu = location.state?.reopenPauseMenu ?? false;

  // Gestisce la musica da utilizzare nella pagina impostazioni.
  useEffect(() => {
    const isReturningToGame = returnTo === "/game" || returnTo.startsWith("/online-game/");
    playMusic(isReturningToGame ? GAME_MUSIC : MENU_MUSIC);
  }, [playMusic, returnTo]);

  function handleBack() {
    playEffect(CLICK_SOUND);
    navigate(returnTo, { state: { openPauseMenu: reopenPauseMenu } });
  }

  // Gestisce il checkbox della musica.
  function handleMusicEnabledChange(event) {
    const isEnabled = event.target.checked;
    updateSetting("musicEnabled", isEnabled);
  }

  function handleEffectsEnabledChange(event) {
    const isEnabled = event.target.checked;
    updateSetting("effectsEnabled", isEnabled);
    if (isEnabled) {
      // Non usiamo playEffect perché il riferimento potrebbe non essere ancora disponibile.
      const preview = new Audio(CLICK_SOUND);
      preview.volume = settings.effectsVolume;
      preview.play().catch(console.warn); // Proviamo a riprodurre il suono; se non riesce catturiamo il warning.
    }
  }

  function handleEffectsVolumeChange(event) {
    updateSetting("effectsVolume", Number(event.target.value) / 100);
  }

  // Quando l'utente vuole ascoltare il suono selezionato.
  function handleEffectPreview() {
    playEffect(CLICK_SOUND);
  }

  function handleReset() {
    const shouldReset = window.confirm("Vuoi ripristinare tutte le impostazioni predefinite?");
    if (!shouldReset) return;
    resetSettings();
    playEffect(CLICK_SOUND);
  }

  return (
    <main className="settings-page">
      <section className="settings-card">
        <button type="button" className="settings-back-button" onClick={handleBack}>
          ← Torna indietro
        </button>
        <header className="settings-header">
          <p>Nation&apos;s Conquest</p>
          <h1>Impostazioni</h1>
          <span>Personalizza audio e animazioni.</span>
        </header>
        <section className="settings-section">
          <div className="settings-section-title">
            <h2>Musica</h2>
            <label className="settings-switch">
              <input type="checkbox" checked={settings.musicEnabled} onChange={handleMusicEnabledChange} />
              <span>{settings.musicEnabled ? "Attiva" : "Disattivata"}</span>
            </label>
          </div>
          <label className="settings-slider-row">
            <span>Volume musica</span>
            {/* Lo slider viene disabilitato quando la musica è disattivata. */}
            <input type="range" min="0" max="100" value={Math.round(settings.musicVolume * 100)} disabled={!settings.musicEnabled} onChange={(event) => updateSetting("musicVolume", Number(event.target.value) / 100)}/>
            <strong>{Math.round(settings.musicVolume * 100)} %</strong>
          </label>
        </section>
        <section className="settings-section">
          <div className="settings-section-title">
            <h2>Effetti sonori</h2>
            <label className="settings-switch">
              <input type="checkbox" checked={settings.effectsEnabled} onChange={handleEffectsEnabledChange} />
              <span>{settings.effectsEnabled ? "Attivi" : "Disattivati"}</span>
            </label>
          </div>
          <label className="settings-slider-row">
            <span>Volume effetti</span>
            {/* onPointerUp e onKeyUp riproducono un'anteprima al rilascio. */}
            <input type="range" min="0"  max="100" value={Math.round(settings.effectsVolume * 100)} disabled={!settings.effectsEnabled} onChange={handleEffectsVolumeChange} onPointerUp={handleEffectPreview} onKeyUp={handleEffectPreview}/>
            <strong>{Math.round(settings.effectsVolume * 100)}%</strong>
          </label>
          <button type="button" className="settings-reset-button" onClick={handleEffectPreview} disabled={!settings.effectsEnabled}>
            Prova effetto sonoro
          </button>
        </section>
        <section className="settings-section">
          <div className="settings-section-title">
            <div>
              <h2>Animazioni</h2>
              <p>Disattivale per ridurre gli effetti grafici del gioco.</p>
            </div>
            <label className="settings-switch">
              <input type="checkbox" checked={settings.animationsEnabled} onChange={(event) => updateSetting("animationsEnabled", event.target.checked)} />
              <span>{settings.animationsEnabled ? "Attive" : "Disattivate"}</span>
            </label>
          </div>
        </section>
        <button type="button" className="settings-reset-button" onClick={handleReset}>
          Ripristina impostazioni
        </button>
      </section>
    </main>
  );
}

export default SettingsPage;