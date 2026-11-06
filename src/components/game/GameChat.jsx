import {
  useEffect,
  useRef,
  useState,
} from "react";
import "./GameChat.css";

function GameChat({messages = [], currentPlayer, onSendMessage, isSending = false}){
  const[messageText, setMessageText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const messagesContainerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const container = messagesContainerRef.current;
    if(!container){
      return;
    }
    container.scrollTop = container.scrollHeight;
  },[messages, isOpen]);

  async function handleSubmit(event) {
    event.preventDefault();
    const cleanedMessage = messageText.trim();

    if (!cleanedMessage || isSending){
      return;
    }
    await onSendMessage(cleanedMessage);
    setMessageText("");
  }

  function formatMessageTime(createdAt) {
    if (!createdAt) {
      return "";
    }
    return new Intl.DateTimeFormat("it-IT",{hour: "2-digit", minute: "2-digit"}).format(new Date(createdAt));
  }

  return (
    <section
      className={`game-chat ${isOpen? "chat-open": "chat-closed"}`}>
      <header className="chat-header">
        <div>
          <h2>
            Chat
          </h2>
          {!isOpen && messages.length > 0 && (
              <span className="chat-message-count">
                {messages.length}
              </span>
            )}
        </div>
        <button type="button" className="chat-toggle-button" onClick={() => setIsOpen((currentValue) => !currentValue)} aria-label={isOpen? "Chiudi chat": "Apri chat"} aria-expanded={isOpen}>
          {isOpen ? "−" : "+"}
        </button>
      </header>

      {isOpen && (
        <>
          <div ref={messagesContainerRef} className="chat-messages">
            {messages.length === 0 ? (
              <p className="chat-empty-message">
                Nessun messaggio.
              </p>
            ) : (
              messages.map((message) => (
                <article key={message.id} className={`chat-message ${message.playerId === currentPlayer?.id ? "my-chat-message": ""}`}>
                  <div className="chat-message-header">
                    <span className="chat-player-color" style={{backgroundColor: message.playerColor}}/>
                    <strong>
                      {message.playerName}
                    </strong>
                    <time>
                      {formatMessageTime(message.createdAt)}
                    </time>
                  </div>
                  <p>
                    {message.text}
                  </p>
                </article>
              ))
            )}
          </div>
          <form className="chat-form" onSubmit={handleSubmit}>
            <input type="text" value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder={`Scrivi come ${currentPlayer?.name ?? "giocatore"}`} maxLength={200} disabled={isSending}/>
            <button type="submit" disabled={isSending || !messageText.trim()}>
              {isSending ? "Invio..." : "Invia"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}

export default GameChat;