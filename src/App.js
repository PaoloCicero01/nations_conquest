import {
  Routes,
  Route,
} from "react-router-dom";

import HomePage from "./pages/HomePage";
import LocalSetupPage from "./pages/LocalSetupPage";
import GamePage from "./pages/GamePage";
import OnlineLobbyPage from "./pages/OnlineLobbyPage";
import OnlineGamePage from "./pages/OnlineGamePage";
import TutorialPage from "./pages/TutorialPage";
import SettingsPage from "./pages/SettingsPage";
import ErrorBoundary from "./components/ErrorBoundary";
import {AudioSettingsProvider} from "./context/AudioSettingsContext"; //Per la condivisione audio tra le componenti
import ProfilePage from "./pages/ProfilePage";
import "./App.css";
import EmailAuthPage from "./pages/EmailAuthPage";

//Restituisce la struttura degli elementi che verrà renderizzata dal browser
function App() {
  return (
    <ErrorBoundary>
      <AudioSettingsProvider>
        <Routes>
          <Route
            path="/"
            element={<HomePage />}
          />

          <Route
            path="/local-setup"
            element={<LocalSetupPage />}
          />

          <Route
            path="/game"
            element={<GamePage />}
          />

          <Route
            path="/online"
            element={<OnlineLobbyPage />}
          />

          <Route
            path="/online-game/:roomCode"
            element={<OnlineGamePage />}
          />

          <Route
            path="/tutorial"
            element={<TutorialPage />}
          />

          <Route
            path="/settings"
            element={<SettingsPage />}
          />

          <Route
            path="*"
            element={<HomePage />}
          />
          <Route
            path="/profile"
            element={<ProfilePage />}
          />
          <Route
            path="/profile/email" 
            element={<EmailAuthPage />}
          />
        </Routes>
      </AudioSettingsProvider>
    </ErrorBoundary>
  );
}

export default App;