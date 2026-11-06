
const { test, before, after } = require("node:test");
const fs = require("node:fs");

const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");

const {
  doc,
  setDoc,
  updateDoc,
} = require("firebase/firestore");

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "nations-conquest",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: fs.readFileSync("firestore.rules", "utf8"),
    },
  });
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

function createProfile(uid, xp = 0) {
  return {
    uid,
    displayName: "Giocatore",
    email: null,
    photoURL: null,
    isAnonymous: true,
    xp,
    level: 1,
    onlineGamesPlayed: 0,
    onlineWins: 0,
    onlineLosses: 0,
    claimedOnlineRewards: {},
  };
}

test("Un utente può creare il proprio profilo", async () => {
  const db = testEnv.authenticatedContext("mario").firestore();

  await assertSucceeds(
    setDoc(doc(db, "userProfiles", "mario"), createProfile("mario"))
  );
});

test("Un utente non può assegnarsi 1000 XP", async () => {
  const db = testEnv.authenticatedContext("luigi").firestore();

  await assertFails(
    setDoc(doc(db, "userProfiles", "luigi"), createProfile("luigi", 1000))
  );
});

test("Un utente può modificare il proprio nome", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), "userProfiles", "anna"),
      createProfile("anna")
    );
  });

  const db = testEnv.authenticatedContext("anna").firestore();

  await assertSucceeds(
    updateDoc(doc(db, "userProfiles", "anna"), {
      displayName: "Anna123",
    })
  );
});

test("Un utente non può modificare gli XP", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), "userProfiles", "paolo"),
      createProfile("paolo")
    );
  });

  const db = testEnv.authenticatedContext("paolo").firestore();

  await assertFails(
    updateDoc(doc(db, "userProfiles", "paolo"), {
      xp: 9999,
    })
  );
});


test("Un utente autenticato può leggere una stanza", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), "rooms", "STANZA1"),
      {
        code: "STANZA1",
        hostUid: "mario",
        status: "waiting",
        playerCount: 1,
        maxPlayers: 4,
        players: [{ uid: "mario", isHost: true }],
      }
    );
  });

  const db = testEnv.authenticatedContext("luigi").firestore();

  const { getDoc } = require("firebase/firestore");

  await assertSucceeds(
    getDoc(doc(db, "rooms", "STANZA1"))
  );
});

test("Un estraneo può attualmente modificare una stanza", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), "rooms", "STANZA2"),
      {
        code: "STANZA2",
        hostUid: "mario",
        status: "waiting",
        playerCount: 1,
        maxPlayers: 4,
        players: [{ uid: "mario", isHost: true }],
      }
    );
  });

  const db = testEnv.authenticatedContext("luigi").firestore();

  await assertSucceeds(
    updateDoc(doc(db, "rooms", "STANZA2"), {
      playerCount: 4,
    })
  );
});


test("Un estraneo non deve modificare una stanza", async () => {

  // Creiamo una stanza appartenente a Mario
  await testEnv.withSecurityRulesDisabled(
    async (context) => {
      const db = context.firestore();

      await setDoc(
        doc(db, "rooms", "STANZA3"),
        {
          code: "STANZA3",
          hostUid: "mario",
          status: "waiting",
          playerCount: 1,
          maxPlayers: 4,
          players: [
            {
              uid: "mario",
              isHost: true,
            },
          ],
        }
      );
    }
  );

  // Simuliamo Luigi, che non fa parte della stanza
  const db = testEnv
    .authenticatedContext("luigi")
    .firestore();

  // Ci aspettiamo che Firestore rifiuti la modifica
  await assertFails(
    updateDoc(
      doc(db, "rooms", "STANZA3"),
      {
        playerCount: 4,
      }
    )
  );
});


test("Un estraneo non può eliminare una stanza", async () => {
  // Creiamo una stanza appartenente a Mario
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), "rooms", "STANZA_DELETE"),
      {
        code: "STANZA_DELETE",
        hostUid: "mario",
        status: "waiting",
        playerCount: 1,
        maxPlayers: 4,
        players: [
          { uid: "mario", isHost: true }
        ],
      }
    );
  });

  // Simuliamo Luigi, che non è il proprietario
  const db = testEnv
    .authenticatedContext("luigi")
    .firestore();

  const { deleteDoc } = require("firebase/firestore");

  // Firestore deve rifiutare l'eliminazione
  await assertFails(
    deleteDoc(doc(db, "rooms", "STANZA_DELETE"))
  );
});
test("Un giocatore può ricevere XP dopo una partita", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), "userProfiles", "giocatoreXP"),
      createProfile("giocatoreXP")
    );
  });

  const db = testEnv
    .authenticatedContext("giocatoreXP")
    .firestore();

  await assertSucceeds(
    updateDoc(
      doc(db, "userProfiles", "giocatoreXP"),
      {
        xp: 50,
        level: 1,
        onlineGamesPlayed: 1,
        onlineWins: 1,
        onlineLosses: 0,
      }
    )
  );
});