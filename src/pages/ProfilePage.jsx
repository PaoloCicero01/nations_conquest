import { useState } from "react";
import { useNavigate } from "react-router-dom";
import backgroundImage from "../assets/images/schermata_iniziale.png";
import { useAuth } from "../context/AuthContext";
import { getProfileProgress } from "../firebase/userProfiles";
import "./ProfilePage.css";
function ProfilePage() {
  const navigate = useNavigate();
  const {
    user,
    userProfile,
    authLoading,
    profileLoading,
    loginWithGoogle,
    continueAsGuest,
    logout
  } = useAuth();
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const profileProgress = getProfileProgress(userProfile?.xp ?? 0);
  const isLoading = authLoading || Boolean(user) && profileLoading;
  async function executeAuthAction(action, fallbackMessage) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage("");
    try {
      await action();
    } catch (error) {
      console.error(error);
      setErrorMessage(fallbackMessage);
    } finally {
      setIsSubmitting(false);
    }
  }
  function getDisplayName() {
    if (!user) return "Giocatore";
    if (user.isAnonymous) return userProfile?.displayName || "Guest";
    return userProfile?.displayName || user.displayName || user.email?.split("@")[0] || "Giocatore";
  }
  function getProviderName() {
    const providerId = user?.providerData?.[0]?.providerId;
    if (providerId === "google.com") return "Google";
    if (providerId === "password") return "Email";
    if (user?.isAnonymous) return "Guest";
    return "Firebase";
  }
  function renderLevelCard() {
    return <section className="profile-level-card">
        <div className="profile-level-header">
          <div>
            <span>Livello attuale</span>
            <strong>Livello {profileProgress.level}</strong>
          </div>
          <strong className="profile-total-xp">
            {profileProgress.totalXp} XP
          </strong>
        </div>
        <div className="profile-xp-bar">
          <span style={{width: `${profileProgress.progressPercentage}%`}} />
        </div>
        <p>{profileProgress.xpToNextLevel} XP al prossimo livello</p>
      </section>;
  }
  function renderStatistics() {
    return <div className="profile-info-grid">
        <div>
          <span>Partite online</span>
          <strong>{userProfile?.onlineGamesPlayed ?? 0}</strong>
        </div>
        <div>
          <span>Vittorie</span>
          <strong>{userProfile?.onlineWins ?? 0}</strong>
        </div>
        <div>
          <span>Sconfitte</span>
          <strong>{userProfile?.onlineLosses ?? 0}</strong>
        </div>
      </div>;
  }
  return <main className="profile-page" style={{backgroundImage: `url(${backgroundImage})`}}>
      <div className="profile-page-overlay" aria-hidden="true" />
      <button type="button" className="profile-back-button" onClick={() => navigate("/")}>
        ← Torna alla Home
      </button>
      <section className="profile-card">
        <header className="profile-card-header">
          <p className="profile-kicker">Nation Conquest</p>
          <div className="profile-avatar" aria-hidden="true">
            {user?.photoURL ? <img src={user.photoURL} alt="" /> : "👤"}
          </div>
          <h1>Profilo giocatore</h1>
          <p>
            Accedi per conservare il tuo profilo, il livello e l’esperienza ottenuta nelle partite online.
          </p>
        </header>
        {isLoading && <div className="profile-loading" role="status">
            Caricamento profilo...
          </div>}
        {!isLoading && !user && <section className="profile-auth-section">
            <div className="profile-status-card">
              <span className="profile-status-label">Stato attuale</span>
              <strong>Nessun accesso effettuato</strong>
              <p>
                Puoi accedere con Google, registrarti con email oppure continuare come guest.
              </p>
            </div>
            <div className="profile-actions">
              <button type="button" className="profile-google-button" onClick={() => executeAuthAction(loginWithGoogle, "Non è stato possibile accedere con Google.")} disabled={isSubmitting}>
                <span className="google-button-icon" aria-hidden="true">
                  G
                </span>
                Accedi con Google
              </button>
              <button type="button" className="profile-primary-button" onClick={() => navigate("/profile/email")} disabled={isSubmitting}>
                Accedi o registrati con email
              </button>
              <div className="profile-divider">
                <span>oppure</span>
              </div>
              <button type="button" className="profile-guest-button" onClick={() => executeAuthAction(continueAsGuest, "Non è stato possibile continuare come guest.")} disabled={isSubmitting}>
                Continua come guest
              </button>
            </div>
          </section>}
        {!isLoading && user?.isAnonymous && <section className="profile-auth-section">
            <div className="profile-status-card profile-status-guest">
              <span className="profile-status-label">Profilo attuale</span>
              <strong>Stai giocando come Guest</strong>
              <p>
                Puoi accumulare esperienza, ma il profilo anonimo potrebbe andare perso effettuando il logout.
              </p>
            </div>
            {renderLevelCard()}
            <div className="profile-info-grid">
              <div>
                <span>Nome</span>
                <strong>{getDisplayName()}</strong>
              </div>
              <div>
                <span>Tipo di account</span>
                <strong>Temporaneo</strong>
              </div>
            </div>
            {renderStatistics()}
            <div className="profile-actions">
              <button type="button" className="profile-google-button" onClick={() => executeAuthAction(loginWithGoogle, "Non è stato possibile accedere con Google.")} disabled={isSubmitting}>
                <span className="google-button-icon" aria-hidden="true">
                  G
                </span>
                Accedi con Google
              </button>
              <button type="button" className="profile-primary-button" onClick={() => navigate("/profile/email")} disabled={isSubmitting}>
                Accedi o registrati con email
              </button>
              <button type="button" className="profile-danger-button" onClick={() => executeAuthAction(logout, "Non è stato possibile uscire dalla modalità guest.")} disabled={isSubmitting}>
                Esci dalla modalità guest
              </button>
            </div>
          </section>}
        {!isLoading && user && !user.isAnonymous && <section className="profile-auth-section">
            <div className="profile-status-card profile-status-authenticated">
              <span className="profile-status-label">Profilo attivo</span>
              <strong>Benvenuto, {getDisplayName()}</strong>
              <p>Hai effettuato correttamente l’accesso al tuo profilo.</p>
            </div>
            {renderLevelCard()}
            <div className="profile-info-grid">
              <div>
                <span>Nome</span>
                <strong>{getDisplayName()}</strong>
              </div>
              <div>
                <span>Email</span>
                <strong>{user.email || "Non disponibile"}</strong>
              </div>
              <div>
                <span>Tipo di account</span>
                <strong>Account registrato</strong>
              </div>
              <div>
                <span>Provider</span>
                <strong>{getProviderName()}</strong>
              </div>
            </div>
            {renderStatistics()}
            <button type="button" className="profile-danger-button" onClick={() => executeAuthAction(logout, "Non è stato possibile uscire dal profilo.")} disabled={isSubmitting}>
              Esci dal profilo
            </button>
          </section>}
        {errorMessage && <p className="profile-error-message" role="alert">
            {errorMessage}
          </p>}
        {isSubmitting && <p className="profile-submit-message" role="status">
            Operazione in corso...
          </p>}
      </section>
    </main>;
}
export default ProfilePage;