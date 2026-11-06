import {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import backgroundImage from "../assets/images/schermata_iniziale.png";

import ProfileButton from "../components/auth/ProfileButton";

import useGameAudio from "../hooks/useGameAudio";

import "./HomePage.css";

//Percorsi file audio
const MENU_MUSIC =
  "/audio/menu-music.wav";

const CLICK_SOUND =
  "/audio/click.wav";

function HomePage() {
  const navigate = useNavigate(); //Ci serve per cambiare percorso

//Sono proprietà dell'oggetto
const {
	playMusic,
    playEffect,
	} = useGameAudio();

  const [isOnline,setIsOnline] = useState(navigator.onLine);

  //Aggiorna automaticamente lo stato quando la connessione viene persa o ripristinata.
  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

	//Registra una funzione da eseguire quando il browser genera l'evento online o offline
    window.addEventListener("online",handleOnline);
    window.addEventListener("offline",handleOffline);

	//funzione di cleanup
    return () => {
      window.removeEventListener("online",handleOnline);
      window.removeEventListener("offline",handleOffline);
     };
  }, []);

  //Prova ad avviare la musica all'apertura della Home.
  useEffect(() => {
    let musicStarted = false;
    async function startMenuMusic() {
      if (musicStarted) {
        return;
      }

      const started = await playMusic(MENU_MUSIC);

      if (started) {
        musicStarted = true;
      }
    }

    startMenuMusic();

    function handleFirstInteraction() {
      startMenuMusic();
    }

	//Quando utente preme con mouse o touch
    window.addEventListener("pointerdown",handleFirstInteraction);
	//Utente preme da tastiera
    window.addEventListener("keydown",handleFirstInteraction);

    return () => {
      window.removeEventListener("pointerdown",handleFirstInteraction);
      window.removeEventListener("keydown",handleFirstInteraction);
     };
   }, [playMusic]); //Se il riferimento alla funzione cambia, prima viene eseguito un cleanup

  function handleNavigation(path) {
    playEffect(CLICK_SOUND);
    navigate(path);
  }

  return (
    <main className="home-page"style={{backgroundImage:`url(${backgroundImage})`}}>
      <ProfileButton />
      <section className="home-menu">
        <button type="button" className="home-button" onClick={() => handleNavigation("/local-setup")}>
          Partita locale
        </button>

        <button type="button" className={` home-button home-button-online ${!isOnline ? "home-button-disabled" : "" }`} onClick={() => handleNavigation("/online")} disabled={!isOnline} aria-disabled={!isOnline} >
          {isOnline ? "Gioca online" : "Modalità online non disponibile"}
        </button>

        {!isOnline && (
          <div className="offline-message" role="status" aria-live="polite" >
            Sei offline. La modalità online non è disponibile. Puoi comunque giocare una partita locale.
          </div>
        )}

        <button type="button" className="home-button" onClick={() =>handleNavigation("/settings")}>
          Impostazioni
        </button>
        <button type="button" className="home-button" onClick={() => handleNavigation("/tutorial")} >
          Tutorial
        </button>
      </section>
    </main>
  );
}

export default HomePage;
