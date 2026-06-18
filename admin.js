import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, remove } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// Uses your matching established project credentials
const firebaseConfig = {
    apiKey: "AIzaSyD3o6QdLYq4Fwsu_WzkIx2beDMZvHmvgh8",
    authDomain: "imposter-19b20.firebaseapp.com",
    databaseURL: "https://imposter-19b20-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "imposter-19b20",
    storageBucket: "imposter-19b20.firebasestorage.app",
    messagingSenderId: "461732149809",
    appId: "1:461732149809:web:507f60693475f5423d3310"
};

// Initialize app connection instance
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Bind event execution to our unique panel button
document.getElementById('btn-admin-close-all').addEventListener('click', async () => {
    const confirmation = confirm("🚨 MASTER ACCELERATED WIPE:\n\nAre you absolutely sure you want to delete ALL active game rooms platform-wide?");
    
    if (confirmation) {
        try {
            const allRoomsRef = ref(db, 'rooms');
            await remove(allRoomsRef);
            
            alert("Success! The database branch was successfully purged.");
        } catch (error) {
            console.error("Purge system exception details:", error);
            alert("Error: Operation rejected. Verify that your Realtime Database Security Rules allow universal deletion.");
        }
    }
});