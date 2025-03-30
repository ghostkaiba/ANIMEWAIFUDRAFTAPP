// server.js (Node.js, Added Re-roll Logic)

const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// --- Server State ---
let serverPool = [];
let serverCurrentNumber = null;
let serverRemovedNumber = null;
let serverMin = 1;
let serverMax = 15000;
let serverInitialRerolls = 12; // NEW: Configurable initial re-rolls
let serverPlayers = []; // { id, name, roles: {}, protectedPickUsed: false, rerollsRemaining: 12 } // Added rerolls
const maxPlayers = 10;
const battleRoles = [ "Captain", "Vice Captain", "Ace", "Flex 1/Tactician", "Tank", "Wildcard", "Mascot", "Flex 2/Support" ];
const relationshipRoles = [ "Primary Partner", "Past Flame", "Guardian Figure", "The Anchor", "Secret Interest", "Further Complication", "Best Friend", "Sibling" ];
const allRoles = [...battleRoles, ...relationshipRoles];
const totalRoles = allRoles.length;

let nextPlayerId = 1;
let draftStarted = false;
let currentTurnIndex = -1;
let currentRound = 0;
let draftDirection = 'forward';
let overallPickCounter = 0;
let draftLog = [];
let isAdminEditMode = false;

// --- Helper Functions ---

function initializePool(min, max) { /* ... unchanged ... */
    console.log(`Pool initializing from ${min} to ${max}`);
    serverPool = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    serverPool.sort(() => Math.random() - 0.5);
    console.log(`Pool initialized with ${serverPool.length} numbers.`);
}
function broadcastButtonStateUpdate() { /* ... unchanged ... */
    console.log("Broadcasting button state update");
    const state = { canRemove: serverCurrentNumber !== null, canAddBack: serverRemovedNumber !== null, poolSize: serverPool.length };
    io.emit('updateRemoveAddButtons', state);
    io.emit('updatePoolStatus', state.poolSize);
}
function broadcastPlayersUpdate() { /* ... unchanged ... */
    console.log("Broadcasting players update");
    io.emit('updatePlayers', JSON.parse(JSON.stringify(serverPlayers)));
}
function getCurrentPlayerId() { /* ... unchanged ... */
    if (draftStarted && serverPlayers.length > 0 && currentTurnIndex >= 0 && currentTurnIndex < serverPlayers.length) {
        return serverPlayers[currentTurnIndex]?.id || null;
    } return null;
}
function getCurrentPlayer() { /* ... unchanged ... */
    if (draftStarted && serverPlayers.length > 0 && currentTurnIndex >= 0 && currentTurnIndex < serverPlayers.length) {
        return serverPlayers[currentTurnIndex];
    } return null;
}
function broadcastTurnUpdate() { /* ... unchanged ... */
    console.log(`Broadcasting turn update: Index ${currentTurnIndex}, Player ID ${getCurrentPlayerId()}, Draft Started ${draftStarted}, Pick Count ${overallPickCounter}`);
    io.emit('updateTurn', { currentPlayerId: getCurrentPlayerId(), draftHasStarted: draftStarted, overallPickCounter: overallPickCounter });
}
function broadcastDraftLogUpdate() { /* ... unchanged ... */
    console.log("Broadcasting draft log update");
    io.emit('updateDraftLog', draftLog);
}
function broadcastAdminEditModeUpdate() { /* ... unchanged ... */
    console.log("Broadcasting admin edit mode state:", isAdminEditMode);
    io.emit('updateAdminEditMode', isAdminEditMode);
}

// Get full state (includes initialRerolls)
function getFullState() {
    return {
        min: serverMin,
        max: serverMax,
        initialRerolls: serverInitialRerolls, // NEW: Include setting
        currentNumber: serverCurrentNumber,
        canRemove: serverCurrentNumber !== null,
        canAddBack: serverRemovedNumber !== null,
        poolSize: serverPool.length,
        players: serverPlayers, // includes protectedPickUsed, rerollsRemaining
        currentPlayerId: getCurrentPlayerId(),
        draftHasStarted: draftStarted,
        draftLog: draftLog,
        overallPickCounter: overallPickCounter,
        isAdminEditMode: isAdminEditMode
    };
}

// Reset draft (uses serverInitialRerolls)
function resetDraft() {
    console.log("Resetting draft state");
    initializePool(serverMin, serverMax);
    serverCurrentNumber = null;
    serverRemovedNumber = null;
    serverPlayers.forEach(p => {
        p.roles = {};
        p.protectedPickUsed = false;
        p.rerollsRemaining = serverInitialRerolls; // NEW: Reset using setting
    });
    draftStarted = false;
    currentTurnIndex = -1;
    currentRound = 0;
    draftDirection = 'forward';
    overallPickCounter = 0;
    draftLog = [];
    isAdminEditMode = false;
    io.emit('initialState', getFullState());
    console.log("Draft reset complete.");
}

// Initialize pool at server startup
initializePool(serverMin, serverMax);

// --- Express Middleware & Routes ---
app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/styles.css', (req, res) => res.sendFile(path.join(__dirname, 'styles.css')));
app.get('/scripts.js', (req, res) => res.sendFile(path.join(__dirname, 'scripts.js')));

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  socket.emit('initialState', getFullState());
  socket.on('requestState', () => { socket.emit('initialState', getFullState()); });

  // --- Event Listeners ---

  // ***** MODIFIED: Renamed 'setRange' to 'setDraftSettingsRequest' *****
  socket.on('setDraftSettingsRequest', (data) => {
      console.log("Event 'setDraftSettingsRequest' received:", data);
      if (draftStarted) { return socket.emit('error', "Cannot change settings after draft starts."); }

      const min = parseInt(data.min);
      const max = parseInt(data.max);
      const initialRerolls = parseInt(data.initialRerolls); // Get initial rerolls

      // Validation
      if (isNaN(min) || isNaN(max) || min < 1 || max <= min) {
          return socket.emit('rangeError', 'Invalid range values.');
      }
      if (isNaN(initialRerolls) || initialRerolls < 0) {
          return socket.emit('error', 'Invalid initial re-rolls value.');
      }

      // Update settings
      serverMin = min;
      serverMax = max;
      serverInitialRerolls = initialRerolls; // Store setting
      console.log(`Settings updated: Range ${serverMin}-${serverMax}, Re-rolls ${serverInitialRerolls}`);

      resetDraft(); // Reset everything with new settings

      // Send confirmation back (or rely on initialState from reset)
      io.emit('settingsSet', { min: serverMin, max: serverMax, initialRerolls: serverInitialRerolls });
  });


  socket.on('generateNumberRequest', () => { /* ... unchanged ... */
      console.log("Event 'generateNumberRequest' received");
      if (!draftStarted) { return socket.emit('error', "Draft hasn't started yet."); }
      const currentPlayer = getCurrentPlayer();
      if (!currentPlayer) { return socket.emit('error', "Not a valid player's turn or draft ended."); }
      if (serverCurrentNumber !== null) { return socket.emit('error', "A number/rank is already displayed. Claim, Undo, or Re-roll first."); }
      if (serverPool.length === 0) { return socket.emit('poolEmpty', 'Number pool is empty!'); }
      serverCurrentNumber = serverPool.pop();
      serverRemovedNumber = null;
      console.log(`Generated number: ${serverCurrentNumber}`);
      io.emit('numberGenerated', { number: serverCurrentNumber, isProtected: false });
      broadcastButtonStateUpdate();
  });

  // ***** NEW: Handler for Use Re-roll Request *****
  socket.on('useRerollRequest', () => {
      console.log("Event 'useRerollRequest' received");
      const currentPlayer = getCurrentPlayer();

      // Validation
      if (!draftStarted) { return socket.emit('error', "Draft hasn't started yet."); }
      if (!currentPlayer) { return socket.emit('error', "Not a valid player's turn or draft ended."); }
      // Weak turn check
      // if (socket.id !== currentPlayer.socketId) { return socket.emit('error', "It's not your turn."); }
      if (serverCurrentNumber === null) { return socket.emit('error', "No number/rank is currently displayed to re-roll."); }
      if (currentPlayer.rerollsRemaining <= 0) { return socket.emit('rerollError', "You have no re-rolls remaining."); }

      console.log(`Player ${currentPlayer.name} used a re-roll. ${currentPlayer.rerollsRemaining - 1} left.`);

      // Decrement re-rolls
      currentPlayer.rerollsRemaining--;

      // Put current number back and shuffle
      serverPool.push(serverCurrentNumber);
      serverPool.sort(() => Math.random() - 0.5);

      // Generate a new number
      if (serverPool.length === 0) { // Should be impossible if we just added one back, but safety check
          serverCurrentNumber = null;
          io.emit('poolEmpty', 'Number pool became empty unexpectedly!');
      } else {
          serverCurrentNumber = serverPool.pop();
          console.log(`Re-rolled to number: ${serverCurrentNumber}`);
      }
      serverRemovedNumber = null; // Ensure removed is clear

      // Broadcast updates
      io.emit('numberGenerated', { number: serverCurrentNumber, isProtected: false }); // Send new number
      broadcastPlayersUpdate(); // Send updated player data (with new re-roll count)
      broadcastButtonStateUpdate(); // Update button states
  });


  socket.on('generateProtectedPickRequest', (data) => { /* ... unchanged ... */
      console.log("Event 'generateProtectedPickRequest' received:", data);
      const currentPlayer = getCurrentPlayer();
      if (!draftStarted) { return socket.emit('error', "Draft hasn't started yet."); }
      if (!currentPlayer) { return socket.emit('error', "Not a valid player's turn or draft ended."); }
      if (currentPlayer.protectedPickUsed) { return socket.emit('protectedPickError', "Protected pick already used for this draft."); }
      if (serverCurrentNumber !== null) { return socket.emit('error', "A number/rank is already displayed. Claim, Undo, or Re-roll first."); }
      const protectedMin = parseInt(data.min);
      const protectedMax = parseInt(data.max);
      if (isNaN(protectedMin) || isNaN(protectedMax) || protectedMin < 1 || protectedMax <= protectedMin) { return socket.emit('protectedPickError', 'Invalid protected range values.'); }
      if (protectedMin < serverMin || protectedMax > serverMax) { return socket.emit('protectedPickError', `Protected range (${protectedMin}-${protectedMax}) must be within the main draft range (${serverMin}-${serverMax}).`); }
      const availableProtectedNumbers = serverPool.filter(num => num >= protectedMin && num <= protectedMax);
      if (availableProtectedNumbers.length === 0) { return socket.emit('protectedPickError', `No available ranks left in the specified protected range (${protectedMin}-${protectedMax}).`); }
      const randomIndex = Math.floor(Math.random() * availableProtectedNumbers.length);
      const generatedNumber = availableProtectedNumbers[randomIndex];
      const poolIndex = serverPool.indexOf(generatedNumber);
      if (poolIndex > -1) { serverPool.splice(poolIndex, 1); }
      else { console.error(`Error: Protected pick number ${generatedNumber} not found in main pool!`); return socket.emit('error', 'Internal server error during protected pick.'); }
      serverCurrentNumber = generatedNumber;
      serverRemovedNumber = null;
      console.log(`Generated PROTECTED number: ${serverCurrentNumber} (Range: ${protectedMin}-${protectedMax})`);
      io.emit('numberGenerated', { number: serverCurrentNumber, isProtected: true });
      broadcastButtonStateUpdate();
  });

  socket.on('removeNumberRequest', () => { /* ... unchanged ... */ // Claim Pick
      console.log("Event 'removeNumberRequest' (Claim Pick) received");
      if (!draftStarted) { return socket.emit('error', "Draft hasn't started yet."); }
      if (getCurrentPlayerId() === null) { return socket.emit('error', "Not a valid player's turn or draft ended."); }
      if (serverCurrentNumber === null) { return socket.emit('error', "No number/rank to claim."); }
      console.log(`Number ${serverCurrentNumber} claimed by player turn (Index: ${currentTurnIndex}, ID: ${getCurrentPlayerId()})`);
      serverRemovedNumber = serverCurrentNumber;
      serverCurrentNumber = null;
      io.emit('numberGenerated', { number: null });
      broadcastButtonStateUpdate();
  });

  socket.on('addNumberBackRequest', () => { /* ... unchanged ... */ // Undo Claim
      console.log("Event 'addNumberBackRequest' (Undo Claim) received");
      if (!draftStarted) { return socket.emit('error', "Draft hasn't started yet."); }
       if (getCurrentPlayerId() === null) { return socket.emit('error', "Not a valid player's turn or draft ended."); }
      if (serverRemovedNumber === null) { return socket.emit('error', "No claimed number/rank to add back."); }
      serverPool.push(serverRemovedNumber);
      serverPool.sort(() => Math.random() - 0.5);
      console.log(`Number ${serverRemovedNumber} added back to pool. Pool size: ${serverPool.length}`);
      serverCurrentNumber = serverRemovedNumber;
      serverRemovedNumber = null;
      io.emit('numberGenerated', { number: serverCurrentNumber, isProtected: false });
      broadcastButtonStateUpdate();
  });

  // Player Management
  socket.on('addPlayerRequest', () => { /* ... MODIFIED to use serverInitialRerolls ... */
      console.log("Event 'addPlayerRequest' received");
      if (draftStarted) { return socket.emit('error', "Cannot add players after draft starts."); }
      if (serverPlayers.length >= maxPlayers) { return socket.emit('error', "Maximum players reached."); }
      // Add with initial re-rolls and protected status
      const newPlayer = { id: nextPlayerId++, name: `Player ${nextPlayerId - 1}`, roles: {}, protectedPickUsed: false, rerollsRemaining: serverInitialRerolls };
      serverPlayers.push(newPlayer);
      console.log(`Player added: ${newPlayer.name} (ID: ${newPlayer.id})`);
      broadcastPlayersUpdate();
  });
   socket.on('removePlayerRequest', () => { /* ... unchanged ... */
      console.log("Event 'removePlayerRequest' received");
      if (draftStarted) { return socket.emit('error', "Cannot remove players after draft starts."); }
      if (serverPlayers.length > 0) { const removedPlayer = serverPlayers.pop(); console.log(`Player removed: ${removedPlayer.name}`); broadcastPlayersUpdate(); }
      else { socket.emit('error', "No players to remove."); }
  });
   socket.on('shufflePlayersRequest', () => { /* ... unchanged ... */
      console.log("Event 'shufflePlayersRequest' received");
      if (draftStarted) { return socket.emit('error', "Cannot shuffle players after draft starts."); }
      serverPlayers.sort(() => Math.random() - 0.5); console.log("Players shuffled."); currentTurnIndex = draftStarted ? 0 : -1; broadcastPlayersUpdate(); broadcastTurnUpdate();
  });
   socket.on('updatePlayerName', (data) => { /* ... unchanged ... */
      console.log("Event 'updatePlayerName' received:", data);
      const player = serverPlayers.find(p => p.id === data.id);
      if (player) { player.name = String(data.name).trim() || `Player ${player.id}`; console.log(`Player ${data.id} name updated to: ${player.name}`); broadcastPlayersUpdate(); if(draftStarted && player.id === getCurrentPlayerId()) { broadcastTurnUpdate(); } }
      else { socket.emit('error', "Player not found for name update."); }
  });
  socket.on('startDraftRequest', () => { /* ... MODIFIED to reset rerolls ... */
       console.log("Event 'startDraftRequest' received");
      if (draftStarted) { return socket.emit('error', "Draft already started."); }
      if (serverPlayers.length < 1) { return socket.emit('error', "Need at least one player to start."); }
      // Reset state variables for new draft
      serverPlayers.forEach(p => { p.roles = {}; p.protectedPickUsed = false; p.rerollsRemaining = serverInitialRerolls; }); // Reset rerolls here
      draftStarted = true; currentTurnIndex = 0; currentRound = 1; draftDirection = 'forward'; overallPickCounter = 0; draftLog = []; isAdminEditMode = false;
      initializePool(serverMin, serverMax); // Re-initialize pool
      console.log("Draft started! Round 1, Player Index 0");
      // Broadcast all relevant state updates
      broadcastTurnUpdate(); broadcastButtonStateUpdate(); broadcastDraftLogUpdate(); broadcastAdminEditModeUpdate(); broadcastPlayersUpdate();
  });

  // Admin Edit Mode Toggle
  socket.on('toggleAdminEditMode', () => { /* ... unchanged ... */
      console.log("Event 'toggleAdminEditMode' received");
      if (draftStarted || overallPickCounter === 0) { return socket.emit('error', 'Admin edit mode can only be toggled after the draft is complete.'); }
      isAdminEditMode = !isAdminEditMode; console.log(`Admin Edit Mode set to: ${isAdminEditMode}`); broadcastAdminEditModeUpdate();
  });


  // Assign Role Request (Unchanged from v5, already handles protected pick flag)
  socket.on('assignRoleRequest', (data) => { /* ... unchanged from v5 ... */
    console.log("Event 'assignRoleRequest' received:", data);
    const playerMakingRequest = serverPlayers.find(p => p.id === data.playerId);
    if (!playerMakingRequest) { return socket.emit('error', 'Player not found.'); }
    if (!data.roleName || !allRoles.includes(data.roleName)) { return socket.emit('error', 'Invalid role specified.'); }
    const characterName = String(data.characterName).trim();
    if (isAdminEditMode) {
        if (draftStarted) { return socket.emit('error', 'Cannot use admin edit while draft is active.'); }
        // Allow clearing in admin mode
        // if (!characterName && !confirm(`Clear role ${data.roleName} for ${playerMakingRequest.name}?`)) { return; } // Cannot confirm on server
        console.log(`ADMIN EDIT: Assigning "${characterName}" to Player ${data.playerId} (${playerMakingRequest.name}) - Role: ${data.roleName}`);
        playerMakingRequest.roles[data.roleName] = characterName;
        broadcastPlayersUpdate();
    }
    else { // Normal Draft Logic
        const expectedPlayerId = getCurrentPlayerId();
        if (!draftStarted) { return socket.emit('error', 'Draft has not started yet.'); }
        if (!expectedPlayerId || data.playerId !== expectedPlayerId) { return socket.emit('error', 'It is not your turn.'); }
        if (serverRemovedNumber === null) { return socket.emit('error', 'No rank claimed.'); }
        if (!characterName) { return socket.emit('error', 'Character name cannot be empty.'); }
        if (playerMakingRequest.roles[data.roleName]) { return socket.emit('error', `Role '${data.roleName}' is already filled.`); }
        const assignedRank = serverRemovedNumber;
        console.log(`NORMAL DRAFT: Assigning Rank ${assignedRank} ("${characterName}") to Player ${data.playerId} (${playerMakingRequest.name}) - Role: ${data.roleName}`);
        playerMakingRequest.roles[data.roleName] = `${characterName} (#${assignedRank})`;
        serverRemovedNumber = null;
        if (data.isProtected === true) {
            if (!playerMakingRequest.protectedPickUsed) { playerMakingRequest.protectedPickUsed = true; console.log(`Player ${playerMakingRequest.name} used protected pick.`); }
            else { console.warn(`Warning: Player ${playerMakingRequest.name} assigned protected pick but flag already true.`); }
        }
        overallPickCounter++;
        const pickInRound = draftDirection === 'forward' ? currentTurnIndex + 1 : serverPlayers.length - currentTurnIndex;
        const logEntry = { overallPick: overallPickCounter, round: currentRound, pickInRound: pickInRound, playerId: playerMakingRequest.id, playerName: playerMakingRequest.name, characterName: characterName, rank: assignedRank, roleName: data.roleName };
        draftLog.push(logEntry); console.log("Added to draft log:", logEntry);
        let draftComplete = (overallPickCounter >= serverPlayers.length * totalRoles);
        if (!draftComplete && serverPlayers.length > 0) {
            let nextTurnIndex = currentTurnIndex + (draftDirection === 'forward' ? 1 : -1);
            if (nextTurnIndex >= serverPlayers.length) { currentTurnIndex = serverPlayers.length - 1; draftDirection = 'backward'; currentRound++; console.log(`End of forward Round ${currentRound - 1}. Reversing.`); }
            else if (nextTurnIndex < 0) { currentTurnIndex = 0; draftDirection = 'forward'; currentRound++; console.log(`End of backward Round ${currentRound - 1}. Reversing.`); }
            else { currentTurnIndex = nextTurnIndex; console.log(`Turn advanced.`); }
        } else if (serverPlayers.length === 0) { currentTurnIndex = -1; }
        if (draftComplete) { console.log("Draft Complete!"); draftStarted = false; currentTurnIndex = -1; }
        broadcastPlayersUpdate(); broadcastTurnUpdate(); broadcastButtonStateUpdate(); broadcastDraftLogUpdate();
    } // End Normal Draft
  }); // End assignRoleRequest


  socket.on('disconnect', () => { console.log('User disconnected:', socket.id); });

}); // End io.on('connection')


// --- Start the Server ---
server.listen(PORT, () => { console.log(`Server is running on http://localhost:${PORT}`); });

