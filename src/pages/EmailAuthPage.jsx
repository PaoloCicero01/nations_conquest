import { useState } from "react";
import { useNavigate } from "react-router-dom";
import backgroundImage from "../assets/images/schermata_iniziale.png";
import { useAuth } from "../context/AuthContext";
import "./EmailAuthPage.css";

const INITIAL_FORM = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
};

function getFriendlyAuthError(error) {
  switch (error?.code) {
    case "auth/email-already-in-use":
      return "Esiste già un account associato a questa email.";
    case "auth/invalid-email":
      return "L’indirizzo email inserito non è valido.";
    case "auth/weak-password":
      return "La password è troppo debole. Inserisci almeno 6 caratteri.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email o password non corrette.";
    case "auth/too-many-requests":
      return "Troppi tentativi. Attendi qualche minuto e riprova.";
    case "auth/network-request-failed":
      return "Problema di connessione. Controlla Internet e riprova.";
    case "auth/popup-closed-by-user":
      return "La finestra di accesso è stata chiusa.";
    default:
      return "Si è verificato un errore durante l’autenticazione.";
  }
}

function EmailAuthPage() {
  const navigate = useNavigate();
  const { user, registerWithEmail, loginWithEmail, resetPassword } = useAuth();
  const [authMode, setAuthMode] = useState("login");
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRegisterMode = authMode === "register";
  const isResetMode = authMode === "reset";
  function handleInputChange(event) {
    const { name, value } = event.target;
    setFormData((currentData) => ({ ...currentData, [name]: value }));
    setErrorMessage("");
    setSuccessMessage("");
  }

  function changeMode(newMode) {
    setAuthMode(newMode);
    setErrorMessage("");
    setSuccessMessage("");
    setFormData((currentData) => ({ ...INITIAL_FORM, email: currentData.email }));
  }

  function validateForm() {
    const normalizedEmail = formData.email.trim().toLowerCase();
    if (!normalizedEmail) return "Inserisci il tuo indirizzo email.";
    if (isResetMode) return "";
    if (formData.password.length < 6) return "La password deve contenere almeno 6 caratteri.";
    if (isRegisterMode && formData.name.trim().length < 2) return "Inserisci un nome di almeno 2 caratteri.";
    if (isRegisterMode && formData.password !== formData.confirmPassword) return "Le due password non coincidono.";
    return "";
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting) return;
    const validationError = validateForm();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }
    const normalizedEmail = formData.email.trim().toLowerCase();
    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      if (isResetMode) {
        await resetPassword(normalizedEmail);
        setSuccessMessage("Email di recupero inviata. Controlla anche la cartella spam.");
        return;
      }
      if (isRegisterMode) {
        await registerWithEmail({
          name: formData.name.trim(),
          email: normalizedEmail,
          password: formData.password,
        });
        navigate("/profile", { replace: true });
        return;
      }
      await loginWithEmail({ email: normalizedEmail, password: formData.password });
      navigate("/profile", { replace: true });
    } catch (error) {
      console.error("Errore autenticazione:", error);
      setErrorMessage(getFriendlyAuthError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (user && !user.isAnonymous) {
    return (
      <main className="email-auth-page" style={{ backgroundImage: `url(${backgroundImage})` }}>
        <div className="email-auth-overlay" aria-hidden="true" />

        <section className="email-auth-card">
          <p className="email-auth-kicker">Nation Conquest</p>
          <h1>Accesso già effettuato</h1>
          <p className="email-auth-description">
            Hai già effettuato l’accesso con un account registrato.
          </p>
          <button type="button" className="email-auth-primary-button" onClick={() => navigate("/profile")}>
            Torna al profilo
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="email-auth-page" style={{ backgroundImage: `url(${backgroundImage})` }}>
      <div className="email-auth-overlay" aria-hidden="true" />
      <button type="button" className="email-auth-back-button" onClick={() => navigate("/profile")}>
        ← Torna al profilo
      </button>
      <section className="email-auth-card">
        <header className="email-auth-header">
          <p className="email-auth-kicker">Nation Conquest</p>
          <div className="email-auth-symbol" aria-hidden="true">
            {isResetMode ? "✉" : "♟"}
          </div>
          <h1>
            {isRegisterMode ? "Crea il tuo profilo" : isResetMode ? "Recupera la password" : "Accedi al profilo"}
          </h1>
          <p>
            {isRegisterMode? "Registrati per creare un profilo permanente." : isResetMode ? "Inserisci la tua email per ricevere il collegamento di recupero." : "Inserisci email e password per accedere."}
          </p>
        </header>

        {!isResetMode && (
          <div className="email-auth-mode-selector" role="tablist" aria-label="Tipo di autenticazione">
            <button type="button" className={authMode === "login" ? "selected" : ""} onClick={() => changeMode("login")} role="tab" aria-selected={authMode === "login"}>
              Accedi
            </button>
            <button type="button" className={authMode === "register" ? "selected" : ""} onClick={() => changeMode("register")} role="tab" aria-selected={authMode === "register"}>
              Registrati
            </button>
          </div>
        )}

        <form className="email-auth-form" onSubmit={handleSubmit}>
          {isRegisterMode && (
            <label className="email-auth-field">
              <span>Nome giocatore</span>
              <input type="text" name="name" value={formData.name} maxLength={30} autoComplete="name" placeholder="Il tuo username" onChange={handleInputChange} disabled={isSubmitting}/>
            </label>
          )}
          <label className="email-auth-field">
            <span>Email</span>
            <input type="email" name="email" value={formData.email} autoComplete="email" placeholder="nome@email.it" onChange={handleInputChange} disabled={isSubmitting}/>
          </label>
          {!isResetMode && (
            <label className="email-auth-field">
              <span>Password</span>
              <input type="password" name="password" value={formData.password} minLength={6} autoComplete={isRegisterMode ? "new-password" : "current-password"} placeholder="Almeno 6 caratteri" onChange={handleInputChange} disabled={isSubmitting}/>
            </label>
          )}

          {isRegisterMode && (
            <label className="email-auth-field">
              <span>Conferma password</span>
              <input type="password" name="confirmPassword" value={formData.confirmPassword} minLength={6} autoComplete="new-password" placeholder="Ripeti la password" onChange={handleInputChange} disabled={isSubmitting}/>
            </label>
          )}
          {errorMessage && <p className="email-auth-error" role="alert">{errorMessage}</p>}
          {successMessage && <p className="email-auth-success" role="status">{successMessage}</p>}
          <button type="submit" className="email-auth-primary-button" disabled={isSubmitting}>
            {isSubmitting ? "Operazione in corso..." : isRegisterMode ? "Crea profilo" : isResetMode ? "Invia email di recupero": "Accedi"}
          </button>
        </form>

        {!isRegisterMode && !isResetMode && (
          <button type="button" className="email-auth-link-button" onClick={() => changeMode("reset")} disabled={isSubmitting}>
            Password dimenticata?
          </button>
        )}
        {isResetMode && (
          <button type="button" className="email-auth-link-button" onClick={() => changeMode("login")} disabled={isSubmitting}>
            Torna all’accesso
          </button>
        )}
        <p className="email-auth-footer">
          Puoi tornare al profilo e scegliere anche Google oppure la modalità guest.
        </p>
      </section>
    </main>
  );
}

export default EmailAuthPage;