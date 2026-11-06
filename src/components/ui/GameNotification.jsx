import "./GameNotification.css";

const ICONS = {
  error: "!",
  warning: "!",
  success: "✓",
  info: "i",
};

const TITLES = {
  error: "Operazione non riuscita",
  warning: "Attenzione",
  success: "Operazione completata",
  info: "Informazione",
};

function GameNotification({notification, onClose}){
  if (!notification) {
    return null;
  }
  const type = notification.type ?? "info";
  return (
    <div className={`game-notification game-notification-${type}`} role={type === "error"? "alert" : "status"} aria-live={type === "error"? "assertive": "polite"}>
      <span className="game-notification-icon" aria-hidden="true">
        {ICONS[type] ?? ICONS.info}
      </span>

      <div className="game-notification-content">
        <strong> {notification.title ?? TITLES[type] ?? TITLES.info}
        </strong>
        <p>
          {notification.message}
        </p>
      </div>
      <button type="button" className="game-notification-close" onClick={onClose} aria-label="Chiudi avviso">
        ×
      </button>
      <span className="game-notification-progress" aria-hidden="true"/>
    </div>
  );
}

export default GameNotification;
