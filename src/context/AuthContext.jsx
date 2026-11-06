import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";

import { auth } from "../firebase/firebase";

import {
  ensureUserProfile,
  subscribeToUserProfile,
} from "../firebase/userProfiles";

const AuthContext = createContext(null);
const googleProvider = new GoogleAuthProvider();

//Configuriamo il comportamento dell'autenticazione Google
googleProvider.setCustomParameters({
  prompt: "select_account",
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile = () => {}; //Definizione della funzione nel return

	//Avvisiamo quando cambia lo stato di autenticazione
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
    
    //Definizione della funzione nel return
      unsubscribeProfile();
      unsubscribeProfile = () => {};

      setUser(currentUser); //Aggiorniamo l'utente corrente
      setAuthLoading(false); //Verifica autenticazione terminata

      if (!currentUser) {
        setUserProfile(null);
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);

      try {
        await ensureUserProfile(currentUser); //Attendiamo che venga creato il profilo

		//Usiamo onSnapshot di Firestore per non chiedere manualmente il database
        unsubscribeProfile = subscribeToUserProfile(
          currentUser.uid,
          (updatedProfile) => {
            setUserProfile(updatedProfile);
            setProfileLoading(false);
          },
          (error) => {
            console.error("Errore lettura profilo:", error);
            setProfileLoading(false);
          }
        );
      } catch (error) {
        console.error("Errore creazione profilo:", error);
        setUserProfile(null);
        setProfileLoading(false);
      }
    });

	//funzione di pulizia
    return () => {
      unsubscribeProfile();
      unsubscribeAuth();
    };
  }, []);

  async function resetPassword(email) {
    const normalizedEmail = email.trim().toLowerCase();
    await sendPasswordResetEmail(auth, normalizedEmail);
  }

  async function registerWithEmail({ name, email, password }) {
    const credential = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(),password);

    if (name.trim()) {
      await updateProfile(credential.user, {
        displayName: name.trim(),
      });

	  //Ricarica le informazioni utente e aggiorniamo lo stato React
      await credential.user.reload();
      setUser(auth.currentUser);
    }

	//Creiamo o verifichiamo il documento del giocatore su firestore
    await ensureUserProfile(auth.currentUser ?? credential.user);
    return credential.user;
  }

  async function loginWithEmail({ email, password }) {
    const credential = await signInWithEmailAndPassword(auth,email.trim().toLowerCase(),password);
    return credential.user;
  }

  async function loginWithGoogle() {
    const credential = await signInWithPopup(auth, googleProvider);
    return credential.user;
  }

  async function continueAsGuest() {
    if (user?.isAnonymous) {
      return user;
    }
    const credential = await signInAnonymously(auth);
    return credential.user;
  }

  async function logout() {
    await signOut(auth);
  }

  //Contiene tutte le informazioni che vogliamo condividere attraverso il contesto
  const value = {
    user,
    authLoading,
    userProfile,
    profileLoading,
    isGuest: Boolean(user?.isAnonymous),
    isRegistered: Boolean(user && !user.isAnonymous),
    registerWithEmail,
    loginWithEmail,
    loginWithGoogle,
    continueAsGuest,
    resetPassword,
    logout,
  };

  //Rende i dati condivisi
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

//Permette di accedere facilmente alle funzioni di autenticazione e alle informazioni
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve essere utilizzato dentro AuthProvider.");
  }
  return context;
}
