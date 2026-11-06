import "./PauseMenu.css";

function PauseMenu({
  isOpen,
  mode = "local",
  onResume,
  onOpenSettings,
  onOpenTutorial,
  onExitGame,
  isBusy = false,
}){
  if (!isOpen) {
    return null;
  }

  const isOnline = mode === "online";

  return (
    <div className="pause-menu-overlay" role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget){
          onResume();
        }
      }}>
      <section className="pause-menu-card" role="dialog" aria-modal="true" aria-labelledby="pause-menu-title">
        <p className="pause-menu-kicker">
          Nation&apos;s Conquest
        </p>
        <h2 id="pause-menu-title">
          Partita in pausa
        </h2>
        <p className="pause-menu-description">
          {isOnline ? "La partita online continua a essere sincronizzata mentre il menu è aperto." : "La partita locale è stata salvata automaticamente."}
        </p>
        <div className="pause-menu-actions">
          <button type="button" className="pause-menu-button pause-menu-resume" onClick={onResume} disabled={isBusy}>
            Riprendi partita
          </button>
          <button type="button" className="pause-menu-button" onClick={onOpenSettings} disabled={isBusy}>
            Impostazioni
          </button>
          <button type="button" className="pause-menu-button" onClick={onOpenTutorial} disabled={isBusy}>
            Regole del gioco
          </button>
          <button type="button" className="pause-menu-button pause-menu-exit" onClick={onExitGame} disabled={isBusy}>
            {isOnline? "Disconnettiti" : "Torna al menu"}
          </button>
        </div>
        <small className="pause-menu-hint">
          Premi Esc per riprendere.
        </small>
      </section>
    </div>
  );
}

export default PauseMenu;
