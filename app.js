import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, set, get, onValue, update } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// TODO: Replace with your actual Firebase Project Configuration
const firebaseConfig = {
    apiKey: "AIzaSyD3o6QdLYq4Fwsu_WzkIx2beDMZvHmvgh8",
    authDomain: "imposter-19b20.firebaseapp.com",
    databaseURL: "https://imposter-19b20-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "imposter-19b20",
    storageBucket: "imposter-19b20.firebasestorage.app",
    messagingSenderId: "461732149809",
    appId: "1:461732149809:web:507f60693475f5423d3310"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Application State Variables
let currentRoomId = null;
let localPlayerKey = null; 
let isHost = false;
let wordsPool = [];

// DOM Navigation Elements
const screens = {
    home: document.getElementById('home-screen'),
    name: document.getElementById('name-screen'),
    lobby: document.getElementById('lobby-screen'),
    game: document.getElementById('game-screen')
};

// Function to fetch and parse the CSV file
async function loadWordsFromCSV() {
    try {
        const response = await fetch('./words.csv');
        const csvText = await response.text();
        
        // Split by lines and remove empty rows
        const lines = csvText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
        // Skip the header row (index 0) and loop through data
        for (let i = 1; i < lines.length; i++) {
            const rowValue = lines[i].trim();
            if (rowValue) {
                wordsPool.push({
                    secret: rowValue // The single word from the row becomes the secret word
                });
            }
        }
        
        for (let i = 1; i < lines.length; i++) {
            const columns = lines[i].split(',');
            if (columns.length >= 2) {
                wordsPool.push({
                    secret: columns[0].trim(),
                    imposter: columns[1].trim()
                });
            }
        }
        console.log(`Successfully loaded ${wordsPool.length} word pairs from CSV.`);
    } catch (error) {
        console.error("Error loading CSV file:", error);
        // Fallback pair just in case the file fails to load
        wordsPool = [{ secret: "Eiffel Tower", imposter: "Tower Bridge" }];
    }
}


// --- Initialization & Routing ---
window.addEventListener('DOMContentLoaded', async () => {
    // 1. Load the words first
    await loadWordsFromCSV();

    // 2. Run your existing URL checking logic
    const urlParams = new URLSearchParams(window.location.search);
    const roomIdParam = urlParams.get('id');
    
    if (roomIdParam) {
        currentRoomId = roomIdParam.toUpperCase();
        showScreen('name');
        document.getElementById('display-room-id').innerText = currentRoomId;
    } else {
        showScreen('home');
    }
});

function showScreen(screenKey) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenKey].classList.add('active');
}

// --- Host Node Initialization ---
document.getElementById('btn-create-room').addEventListener('click', async () => {
    const imposterCount = parseInt(document.getElementById('imposter-count').value) || 1;
    // Capture the checkbox state
    const giveFakeWord = document.getElementById('give-imposter-fake-word').checked;
    
    currentRoomId = Math.random().toString(36).substring(2, 7).toUpperCase(); 
    isHost = true;
    localPlayerKey = "player_" + Date.now();

    const roomRef = ref(db, 'rooms/' + currentRoomId);
    await set(roomRef, {
        settings: {
            imposterCount: imposterCount,
            gameStarted: false,
            hostKey: localPlayerKey,
            giveFakeWord: giveFakeWord
        }
    });

    document.getElementById('display-room-id').innerText = currentRoomId;
    showScreen('name');
});

// --- Manual Code Entry Entry Point ---
document.getElementById('btn-submit-code').addEventListener('click', () => {
    const codeInput = document.getElementById('join-room-id').value.trim().toUpperCase();
    if(!codeInput) return;
    window.location.search = `?id=${codeInput}`;
});

// --- Join Flow & Name Verification ---
document.getElementById('btn-join-game').addEventListener('click', async () => {
    const nameInput = document.getElementById('player-name').value.trim();
    const errorEl = document.getElementById('name-error');
    errorEl.innerText = "";

    if (!nameInput) return;

    const roomRef = ref(db, `rooms/${currentRoomId}`);
    const snapshot = await get(roomRef);
    
    if (!snapshot.exists()) {
        errorEl.innerText = "Room does not exist.";
        return;
    }

    const roomData = snapshot.val();
    const playersObj = roomData.players || {};
    
    // Enforce name uniqueness across active players
    const nameExists = Object.values(playersObj).some(p => p.name.toLowerCase() === nameInput.toLowerCase());
    if (nameExists) {
        errorEl.innerText = "This name is already taken in this room.";
        return;
    }

    if (!localPlayerKey) {
        localPlayerKey = "player_" + Date.now();
    }
    
    if (roomData.settings.hostKey === localPlayerKey) {
        isHost = true;
    }

    // Insert player record into the room instance
    await set(ref(db, `rooms/${currentRoomId}/players/${localPlayerKey}`), {
        name: nameInput,
        role: "pending",
        isHost: isHost
    });

    setupLobbyListener();
    showScreen('lobby');
});

// --- Live Lobby & State Synchronization ---
function setupLobbyListener() {
    const roomRef = ref(db, `rooms/${currentRoomId}`);
    
    document.getElementById('lobby-code').innerText = currentRoomId;
    if (isHost) {
        document.getElementById('host-controls').style.display = 'block';
    }

    onValue(roomRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        // Sync player visual roster
        const players = data.players || {};
        const playerListEl = document.getElementById('player-list');
        playerListEl.innerHTML = "";
        
        const playerKeys = Object.keys(players);
        document.getElementById('player-count').innerText = playerKeys.length;

        playerKeys.forEach(key => {
            const li = document.createElement('li');
            li.innerText = players[key].name + (players[key].isHost ? " (👑 Host)" : "");
            playerListEl.appendChild(li);
        });

        // Evaluate core game structural transitions
        if (data.settings.gameStarted) {
            runGameplaySetup(data);
        } else if (screens.game.classList.contains('active') && !data.settings.gameStarted) {
            // Graceful exit fallback to lobby if reset occurs
            showScreen('lobby');
        }
    });
}

// --- Distribution Mechanics ---
document.getElementById('btn-start-game').addEventListener('click', async () => {
    const snapshot = await get(ref(db, `rooms/${currentRoomId}`));
    const data = snapshot.val();
    const players = data.players || {};
    const playerKeys = Object.keys(players);
    const imposterCount = data.settings.imposterCount || 1;
    const giveFakeWord = data.settings.giveFakeWord || false; // Grab the setting

    if (playerKeys.length < imposterCount + 1) {
        alert("Not enough players to allocate selected Imposter count.");
        return;
    }

    const randomPair = wordsPool[Math.floor(Math.random() * wordsPool.length)];
    let fakeWordForImposter = "None";

    // If Fake Word is checked, grab a totally different random pair's secret word
    if (giveFakeWord) {
        let fakeSelection = wordsPool[Math.floor(Math.random() * wordsPool.length)];
        // Ensure the fake word isn't the exact same as the secret word
        while (fakeSelection.secret === randomPair.secret && wordsPool.length > 1) {
            fakeSelection = wordsPool[Math.floor(Math.random() * wordsPool.length)];
        }
        fakeWordForImposter = fakeSelection.secret;
    }
    
    const shuffledKeys = [...playerKeys].sort(() => Math.random() - 0.5);
    const updates = {};

    shuffledKeys.forEach((key, index) => {
        if (index < imposterCount) {
            updates[`/players/${key}/role`] = "imposter";
        } else {
            updates[`/players/${key}/role`] = "innocent";
        }
    });

    updates['/settings/gameStarted'] = true;
    updates['/gameState'] = {
        secret: randomPair.secret,
        fakeWord: fakeWordForImposter // Add the fake word to game state
    };

    await update(ref(db, `rooms/${currentRoomId}`), updates);
});

// --- Interactive View State Mapping ---
function runGameplaySetup(roomData) {
    showScreen('game');
    if (isHost) {
        document.getElementById('host-end-controls').style.display = 'block';
    }

    const localPlayer = roomData.players[localPlayerKey];
    const gameState = roomData.gameState;
    const giveFakeWord = roomData.settings.giveFakeWord; // Grab setting
    const secretDisplay = document.getElementById('secret-display');
    const btnReveal = document.getElementById('btn-reveal');

    let privateAssignment = "";
    if (localPlayer.role === "imposter") {
        if (giveFakeWord) {
            // Option 1: Fake random word from CSV
            privateAssignment = `😇 YOUR SECRET WORD:\n ${gameState.fakeWord}`;
        } else {
            // Option 2: Pure blind mode
            privateAssignment = "🕵️‍♂️ YOU ARE THE IMPOSTER! Blend in and don't get caught!";
        }
    } else {
        privateAssignment = `😇 YOUR SECRET WORD:\n ${gameState.secret}`;
    }

    // Input handlers to bind card reveal interface actions safely
    const revealIdentity = () => {
        secretDisplay.innerText = privateAssignment;
        secretDisplay.classList.remove('hidden-word');
        secretDisplay.classList.add('revealed-word');
    };

    const hideIdentity = () => {
        secretDisplay.innerText = "CONFIDENTIAL";
        secretDisplay.classList.remove('revealed-word');
        secretDisplay.classList.add('hidden-word');
    };

    // Desktop Mouse Events
    btnReveal.onmousedown = revealIdentity;
    btnReveal.onmouseup = hideIdentity;
    btnReveal.onmouseleave = hideIdentity;

    // Mobile Interaction Events
    btnReveal.ontouchstart = (e) => { e.preventDefault(); revealIdentity(); };
    btnReveal.ontouchend = (e) => { e.preventDefault(); hideIdentity(); };
}

// --- Game Reset System ---
document.getElementById('btn-reset-game').addEventListener('click', async () => {
    const updates = {};
    updates['/settings/gameStarted'] = false;
    updates['/gameState'] = null;
    
    // Reset player assignment variables
    const snapshot = await get(ref(db, `rooms/${currentRoomId}/players`));
    const players = snapshot.val() || {};
    Object.keys(players).forEach(key => {
        updates[`/players/${key}/role`] = "pending";
    });

    await update(ref(db, `rooms/${currentRoomId}`), updates);
});

// --- Link Clipboard Utility ---
document.getElementById('btn-copy-link').addEventListener('click', () => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?id=${currentRoomId}`;
    navigator.clipboard.writeText(inviteUrl).then(() => {
        alert("Invite link copied to clipboard!");
    });
});