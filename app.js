import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, set, get, onValue, update, remove } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// Firebase Project Configuration
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
let lobbyTheme = null;
let isMuted = false;

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

function playThemeMusic() {
    if (!lobbyTheme) {
        lobbyTheme = new Audio('./Music/theme.mp3');
        lobbyTheme.loop = true;
    }
    
    // Dynamically adjust volume depending on state
    lobbyTheme.volume = isMuted ? 0.0 : 0.30;
    
    // Show the audio control toggle button on screen
    document.getElementById('sound-control-container').style.display = 'block';

    lobbyTheme.play().catch(error => {
        console.log("Audio playback initialization failed:", error);
    });
}

function stopThemeMusic() {
    if (lobbyTheme) {
        lobbyTheme.pause();
        lobbyTheme.currentTime = 0;
    }
    // Hide the toggle button when music is totally stopped (e.g., back on home screen)
    document.getElementById('sound-control-container').style.display = 'none';
}

// --- Sound Mute Toggle Event Listener ---
document.getElementById('btn-toggle-sound').addEventListener('click', () => {
    if (!lobbyTheme) return;

    isMuted = !isMuted; // Invert sound state
    
    if (isMuted) {
        lobbyTheme.volume = 0.0;
        document.getElementById('btn-toggle-sound').innerText = "🔇";
    } else {
        lobbyTheme.volume = 0.15;
        document.getElementById('btn-toggle-sound').innerText = "🔊";
    }
});


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
    // Block players from joining if the game is already in progress
    if (roomData.settings && roomData.settings.gameStarted === true) {
        errorEl.innerText = "This game is already in progress! You cannot join right now.";
        return;
    }

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

    // START THE MUSIC HERE
    playThemeMusic();

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
        if (!data) {
            // If the host deletes the room, 'data' becomes null!
            alert("This room has been closed by the host.");
            window.location.search = "";
            return;
        }

        //Check if the local player was booted by the host
        const players = data.players || {};
        if (!players[localPlayerKey]) {
            alert("You have been removed from this room by the host.");
            window.location.search = ""; // Wipes out URL parameters and restarts at home
            return;
        }

        // Sync player visual roster
        const playerListEl = document.getElementById('player-list');
        playerListEl.innerHTML = "";
        
        const playerKeys = Object.keys(players);
        document.getElementById('player-count').innerText = playerKeys.length;

        // Render players + Kick buttons for the host
        playerKeys.forEach(key => {
            const li = document.createElement('li');
            li.innerText = players[key].name + (players[key].isHost ? " (👑 Host)" : "");
            
            // If current client is host, and this row isn't the host themselves, append a Kick option
            if (isHost && key !== localPlayerKey) {
                const kickBtn = document.createElement('button');
                kickBtn.innerText = "Remove";
                kickBtn.className = "btn-kick";
                kickBtn.onclick = async () => {
                    if(confirm(`Remove ${players[key].name} from the room?`)) {
                        // Remove player path node from Firebase
                        await set(ref(db, `rooms/${currentRoomId}/players/${key}`), null);
                    }
                };
                li.appendChild(kickBtn);
            }
            
            playerListEl.appendChild(li);
        });
        
        // Evaluate core game structural transitions
        if (data.settings.gameStarted) {
            playThemeMusic();
            runGameplaySetup(data);
        } else if (screens.game.classList.contains('active') && !data.settings.gameStarted) {
            // Graceful exit fallback to lobby if reset occurs
            stopThemeMusic();
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

    // Set the room code text for gameplay visibility
    document.getElementById('game-room-code').innerText = currentRoomId;

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

// --- Game Reset System with Automated Reveal ---
document.getElementById('btn-reset-game').addEventListener('click', async () => {
    try {
        // Stop the background theme track immediately when host clicks reset
        stopThemeMusic();
        
        // 1. Fetch the player list to find the imposter before erasing roles
        const snapshot = await get(ref(db, `rooms/${currentRoomId}/players`));
        const players = snapshot.val() || {};
        
        const imposterNames = Object.values(players)
            .filter(player => player.role === "imposter")
            .map(player => player.name);

        const imposterText = imposterNames.length > 0 ? imposterNames.join(", ") : "None";

        // 2. Alert the host locally, or update the database for everyone to see
        alert(`🎉 Round Over!\n\nThe Imposter was: ${imposterText}`);

        // 3. Clean up the database nodes for the next round
        const updates = {};
        updates['/settings/gameStarted'] = false;
        updates['/gameState'] = null;
        
        Object.keys(players).forEach(key => {
            updates[`/players/${key}/role`] = "pending";
        });

        await update(ref(db, `rooms/${currentRoomId}`), updates);

    } catch (error) {
        console.error("Error during game reset and reveal:", error);
    }
});

// --- Manual Room Deletion by Host ---
document.getElementById('btn-close-room').addEventListener('click', async () => {
    if (confirm("Are you sure you want to close this room? All players will be disconnected.")) {
        try {
            // Reference to the entire room node
            const roomRef = ref(db, 'rooms/' + currentRoomId);
            
            // Setting a node to null in Firebase deletes it completely
            await set(roomRef, null);
            
            // Clean up local tracking and send host home
            window.location.search = ""; 
        } catch (error) {
            console.error("Error deleting room:", error);
        }
    }
});

// --- Link Clipboard Utility ---
document.getElementById('btn-copy-link').addEventListener('click', () => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?id=${currentRoomId}`;
    navigator.clipboard.writeText(inviteUrl).then(() => {
        alert("Invite link copied to clipboard!");
    });
});

// --- Prevent Accidental Refreshes or Back Navigation ---
window.addEventListener('beforeunload', (event) => {
    // Only warn the player if they are actively in a lobby or in a game
    const isCurrentlyInRoom = currentRoomId && localPlayerKey;
    
    if (isCurrentlyInRoom) {
        // Modern standard requires setting the return value and calling preventDefault
        event.preventDefault();
        
        // Custom text is ignored by most modern browsers for security reasons,
        // but setting this triggers the browser's native confirmation dialog.
        event.returnValue = "Are you sure you want to leave the game? Your progress will be lost.";
        return event.returnValue;
    }
});

// --- Global Clean-up: Close All Rooms Across the Platform ---
document.getElementById('btn-close-all-rooms').addEventListener('click', async () => {
    if (confirm("⚠️ WARNING: Are you sure you want to delete ALL open rooms across the database? This will disconnect every active player on the platform.")) {
        try {
            // Reference targeting the entire 'rooms' node
            const allRoomsRef = ref(db, 'rooms');
            
            // Wipe the node clean
            await remove(allRoomsRef);
            
            alert("All open rooms have been cleared successfully.");
            window.location.search = ""; // Redirect the host back to the main screen
        } catch (error) {
            console.error("Error wiping all rooms:", error);
            alert("Failed to close all rooms. Check your Firebase security rules console permissions.");
        }
    }
});