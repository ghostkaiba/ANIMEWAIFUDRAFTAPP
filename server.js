// Import necessary modules
const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");

// Create app, server, and io instances
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Define the port
const PORT = process.env.PORT || 3000;

// --- Server State ---
let serverPool = [];
let serverCurrentNumber = null;
let serverRemovedNumber = null; // Store the number that was "removed" (picked)
let serverMin = 1;
let serverMax = 100;
let serverPlayers = [];
const maxPlayers = 10;
const roles = [
  "Captain", "Vice Captain", "Ace", "Flex 1/Tactician", "Tank",
  "Wildcard", "Mascot", "Flex 2/Support", "Wife/Husband", "Crazy Ex",
  "Mommy/Daddy", "Baby Mommy/Baby Daddy", "Side Piece", "Other Side Piece",
  "Best Friend", "Brother/Sister"
];
let nextPlayerId = 1; // Simple ID counter for players
let draftStarted = false;
let currentTurnIndex = 0; // Index in the serverPlayers array

// --- NEW: Snake Draft State ---
let currentRound = 1;
let draftDirection = 'forward'; // 'forward' or 'backward'

// --- Helper Functions (Server-Side) ---
function initializePool(min, max) {
    console.log(`Pool initializing from ${min} to ${max}`);
    serverPool = []; // Reset pool
    for (let i = min; i <= max; i++) {
        serverPool.push(i);
    }
    // Shuffle the pool initially
    serverPool.sort(() => Math.random() - 0.5);
    console.log(`Pool initialized and shuffled with ${serverPool.length} numbers.`);
}

// Broadcasts button states and pool size
function broadcastStateUpdate() {
    console.log("Broadcasting state update (buttons, pool size)");
    const state = {
        canRemove: serverCurrentNumber !== null,
        canAddBack: serverRemovedNumber !== null, // Enable Add Back if a number was removed/picked
        poolSize: serverPool.length
    };
    io.emit('updateRemoveAddButtons', state);
    io.emit('updatePoolStatus', state.poolSize);
}

function broadcastPlayersUpdate() {
    console.log("Broadcasting players update");
    io.emit('updatePlayers', serverPlayers);
}

// Updated for snake draft (uses direct index)
function getCurrentPlayerId() {
    if (draftStarted && serverPlayers.length > 0 && currentTurnIndex >= 0 && currentTurnIndex < serverPlayers.length) {
        return serverPlayers[currentTurnIndex]?.id || null;
    }
    return null; // No current player if draft not started, no players, or index out of bounds
}

function broadcastTurnUpdate() {
    console.log(`Broadcasting turn update: Round ${currentRound}, Index ${currentTurnIndex}, Direction ${draftDirection}`);
    io.emit('updateTurn', {
        currentPlayerId: getCurrentPlayerId(),
        draftHasStarted: draftStarted
        // Optionally include round/direction if needed by client UI
        // currentRound: currentRound,
        // draftDirection: draftDirection
    });
}

// Function to get the complete current state for new connections
function getFullState() {
    return {
        min: serverMin,
        max: serverMax,
        currentNumber: serverCurrentNumber,
        canRemove: serverCurrentNumber !== null,
        canAddBack: serverRemovedNumber !== null,
        poolSize: serverPool.length,
        players: serverPlayers,
        currentPlayerId: getCurrentPlayerId(),
        draftHasStarted: draftStarted,
        // Optionally include snake state
        // currentRound: currentRound,
        // draftDirection: draftDirection
    };
}

// Reset function updated for snake draft
function resetDraft() {
    console.log("Resetting draft state");
    initializePool(serverMin, serverMax);
    serverCurrentNumber = null;
    serverRemovedNumber = null;
    serverPlayers.forEach(p => p.roles = {}); // Clear roles
    draftStarted = false;
    currentTurnIndex = 0;
    currentRound = 1; // Reset snake state
    draftDirection = 'forward'; // Reset snake state
    // Broadcast initial state to everyone
    io.emit('initialState', getFullState());
    console.log("Draft reset complete.");
}


// Initialize pool at startup
initializePool(serverMin, serverMax);

// --- Express Middleware & Routes ---
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
  console.log('A user connected - Socket ID:', socket.id);

  // Send the current full state to the newly connected client
  socket.emit('initialState', getFullState());

  // --- Event Listeners --- (Mostly unchanged, except startDraft and assignRoleRequest)

  socket.on('setRange', (data) => {
      console.log("setRange received:", data);
      if (draftStarted) { return socket.emit('error', "Cannot change range after draft starts."); }
      const min = parseInt(data.min);
      const max = parseInt(data.max);
      if (isNaN(min) || isNaN(max) || min < 1 || max <= min) {
          return socket.emit('rangeError', 'Invalid range values.');
      }
      serverMin = min;
      serverMax = max;
      resetDraft(); // Reset everything including pool and snake state if range changes
      console.log(`Range set to ${serverMin}-${serverMax} and draft reset.`);
  });

  socket.on('generateNumberRequest', () => {
      console.log("generateNumberRequest received");
      if (!draftStarted) { return socket.emit('error', "Draft hasn't started yet."); }
      if (serverCurrentNumber !== null) { return socket.emit('error', "A number is already displayed."); }
      if (serverPool.length === 0) { return socket.emit('poolEmpty', 'Number pool is empty!'); }

      serverCurrentNumber = serverPool.pop();
      serverRemovedNumber = null;

      console.log(`Generated number: ${serverCurrentNumber}`);
      io.emit('numberGenerated', serverCurrentNumber);
      broadcastStateUpdate();
  });

  socket.on('removeNumberRequest', () => { // Claim number
      console.log("removeNumberRequest received (claim number)");
      if (!draftStarted) { return socket.emit('error', "Draft hasn't started yet."); }
      if (serverCurrentNumber === null) { return socket.emit('error', "No number to claim."); }
      if (getCurrentPlayerId() === null) { return socket.emit('error', "No current player turn.");}

      console.log(`Number ${serverCurrentNumber} claimed by player turn (Index: ${currentTurnIndex}, ID: ${getCurrentPlayerId()})`);
      serverRemovedNumber = serverCurrentNumber;
      serverCurrentNumber = null;

      io.emit('numberGenerated', null);
      broadcastStateUpdate();
      // Don't advance turn here, just update UI potentially
      broadcastPlayersUpdate();
      broadcastTurnUpdate(); // Ensure client knows whose turn it still is (for assign buttons)
  });

  socket.on('addNumberBackRequest', () => { // Undo claim
      console.log("addNumberBackRequest received (undo claim)");
      if (!draftStarted) { return socket.emit('error', "Draft hasn't started yet."); }
      if (serverRemovedNumber === null) { return socket.emit('error', "No claimed number to add back."); }

      serverPool.push(serverRemovedNumber);
      serverPool.sort(() => Math.random() - 0.5); // Re-shuffle
      console.log(`Number ${serverRemovedNumber} added back to pool. Pool size: ${serverPool.length}`);
      serverRemovedNumber = null;

      broadcastStateUpdate();
      broadcastPlayersUpdate();
      broadcastTurnUpdate();
  });

  socket.on('addPlayerRequest', () => {
      console.log("addPlayerRequest received");
      if (draftStarted) { return socket.emit('error', "Cannot add players after draft starts."); }
      if (serverPlayers.length >= maxPlayers) { return socket.emit('error', "Maximum players reached."); }
      const newPlayer = { id: nextPlayerId++, name: `Player ${nextPlayerId - 1}`, roles: {} };
      serverPlayers.push(newPlayer);
      console.log(`Player added: ${newPlayer.name} (ID: ${newPlayer.id})`);
      broadcastPlayersUpdate();
      broadcastTurnUpdate(); // Update turn in case player order matters pre-draft
  });

  socket.on('removePlayerRequest', () => {
      console.log("removePlayerRequest received");
      if (draftStarted) { return socket.emit('error', "Cannot remove players after draft starts."); }
      if (serverPlayers.length > 0) {
          const removedPlayer = serverPlayers.pop();
          console.log(`Player removed: ${removedPlayer.name}`);
          broadcastPlayersUpdate();
          broadcastTurnUpdate(); // Update turn index if needed
      } else {
          socket.emit('error', "No players to remove.");
      }
  });

  socket.on('shufflePlayersRequest', () => {
      console.log("shufflePlayersRequest received");
      if (draftStarted) { return socket.emit('error', "Cannot shuffle players after draft starts."); }
      serverPlayers.sort(() => Math.random() - 0.5);
      console.log("Players shuffled.");
      currentTurnIndex = 0; // Reset turn index after shuffle
      broadcastPlayersUpdate();
      broadcastTurnUpdate(); // Broadcast new turn order
  });

  socket.on('updatePlayerName', (data) => {
      console.log("updatePlayerName received:", data);
      const player = serverPlayers.find(p => p.id === data.id);
      if (player) {
          player.name = String(data.name).trim() || `Player ${player.id}`;
          console.log(`Player ${data.id} name updated to: ${player.name}`);
          broadcastPlayersUpdate();
          broadcastTurnUpdate(); // Broadcast in case name affects turn indicator
      } else {
          socket.emit('error', "Player not found for name update.");
      }
  });

  // Updated startDraftRequest
  socket.on('startDraftRequest', () => {
      console.log("startDraftRequest received");
      if (draftStarted) { return socket.emit('error', "Draft already started."); }
      if (serverPlayers.length < 1) { return socket.emit('error', "Need at least one player to start."); }

      draftStarted = true;
      currentTurnIndex = 0; // Start at the beginning
      currentRound = 1; // Start at round 1
      draftDirection = 'forward'; // Start going forward
      console.log("Draft started! Round 1, Direction: forward");

      broadcastTurnUpdate();
      broadcastStateUpdate();
  });

  // --- assignRoleRequest with SNAKE DRAFT logic ---
  socket.on('assignRoleRequest', (data) => {
    console.log("Assign role request received:", data);

    const expectedPlayerId = getCurrentPlayerId();
    const playerMakingRequest = serverPlayers.find(p => p.id === data.playerId);

    // --- Validation ---
    if (!draftStarted) { return socket.emit('error', 'Draft has not started yet.'); }
    if (!expectedPlayerId || data.playerId !== expectedPlayerId) { return socket.emit('error', 'It is not your turn to assign a role.'); }
    if (serverRemovedNumber === null) { return socket.emit('error', 'No character rank/number has been claimed (Click Remove first).'); }
    if (!playerMakingRequest) { return socket.emit('error', 'Player not found.'); }
    if (!data.roleName || !roles.includes(data.roleName)) { return socket.emit('error', 'Invalid role specified.'); }
    if (!data.characterName || String(data.characterName).trim() === '') { return socket.emit('error', 'Character name cannot be empty.'); }
    if (playerMakingRequest.roles[data.roleName]) { return socket.emit('error', `Role '${data.roleName}' is already filled for this player.`); }

    // --- Validation Passed - Perform Assignment ---
    const characterRank = serverRemovedNumber;
    console.log(`Assigning Rank ${characterRank} ("${data.characterName}") to Player ${data.playerId} (${playerMakingRequest.name}) - Role: ${data.roleName}`);
    playerMakingRequest.roles[data.roleName] = String(data.characterName).trim() + ` (#${characterRank})`;
    serverRemovedNumber = null; // Consume the claimed pick number

    // --- SNAKE DRAFT Turn Advancement Logic ---
    if (serverPlayers.length > 0) { // Only advance if players exist
        if (draftDirection === 'forward') {
            // Move forward
            const nextTurnIndex = currentTurnIndex + 1;
            if (nextTurnIndex >= serverPlayers.length) {
                // Reached end: Stay on last player, flip direction
                console.log(`End of forward Round ${currentRound}. Reversing direction.`);
                currentTurnIndex = serverPlayers.length - 1; // Stays the same index
                draftDirection = 'backward';
                currentRound++;
            } else {
                // Continue forward
                currentTurnIndex = nextTurnIndex;
            }
        } else { // draftDirection === 'backward'
            // Move backward
            const nextTurnIndex = currentTurnIndex - 1;
            if (nextTurnIndex < 0) {
                // Reached beginning: Stay on first player, flip direction
                console.log(`End of backward Round ${currentRound}. Reversing direction.`);
                currentTurnIndex = 0; // Stays the same index
                draftDirection = 'forward';
                currentRound++;
            } else {
                // Continue backward
                currentTurnIndex = nextTurnIndex;
            }
        }
        console.log(`Turn advanced. Next Turn: Round ${currentRound}, Index ${currentTurnIndex} (Player ID: ${getCurrentPlayerId()}), Direction: ${draftDirection}`);
    } else {
        // No players, reset index?
        currentTurnIndex = 0;
    }
    // --- End Snake Draft Logic ---

    // --- Broadcast all updates ---
    broadcastPlayersUpdate(); // Show the new assignment
    broadcastTurnUpdate();    // Show the next player's turn (snake adjusted)
    broadcastStateUpdate();   // Update button states
  });


  socket.on('disconnect', () => {
      console.log('User disconnected - Socket ID:', socket.id);
      // Consider handling disconnects during draft? Pause? Remove player?
  });

}); // End of io.on('connection', ...)


// --- Start the Server ---
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
}); // End of server.listen()