// scripts.js (Client-Side, Full Code - v6 with Re-roll Logic)

const socket = io();

// --- Global Variables ---
let clientPlayers = []; // Format: { id, name, roles: {}, protectedPickUsed: false, rerollsRemaining: 12 }
const maxPlayers = 10;
const battleRoles = [ "Captain", "Vice Captain", "Ace", "Flex 1/Tactician", "Tank", "Wildcard", "Mascot", "Flex 2/Support" ];
const relationshipRoles = [ "Primary Partner", "Past Flame", "Guardian Figure", "The Anchor", "Secret Interest", "Further Complication", "Best Friend", "Sibling" ];
const allRoles = [...battleRoles, ...relationshipRoles];

// State variables
let clientCurrentPlayerId = null;
let clientIsPickAvailable = false; // Is rank claimed, waiting for assignment?
let clientDraftLog = [];
let clientDraftHasStarted = false;
let clientOverallPickCount = 0;
let clientIsAdminEditMode = false;
let clientIsProtectedPickPending = false; // Flag to track if assignment follows a protected pick
let clientInitialRerolls = 12; // Store initial setting locally

// --- DOM Elements ---
const numberDisplay = document.getElementById("numberDisplay");
const removeButton = document.getElementById("removeButton"); // Claim Button
const addButton = document.getElementById("addButton"); // Undo Claim Button
const minValueInput = document.getElementById("minValue");
const maxValueInput = document.getElementById("maxValue");
const initialRerollsInput = document.getElementById("initialRerolls"); // Re-roll setting input
const setSettingsButton = document.getElementById("setSettingsButton"); // Settings button
const generateButton = document.getElementById("generateButton"); // Standard Generate
const rerollButton = document.getElementById("rerollButton"); // Re-roll button
const playerBoardDiv = document.getElementById("playerBoard");
const draftLogEntriesDiv = document.getElementById("draftLogEntries");
const summaryBoardDiv = document.getElementById("summaryBoard"); // Summary Board Div
const turnIndicatorDiv = document.getElementById("turnIndicator");
const adminEditButton = document.getElementById("adminEditButton"); // Admin edit button
const protectedMinInput = document.getElementById("protectedMin"); // Protected Min Input
const protectedMaxInput = document.getElementById("protectedMax"); // Protected Max Input
const protectedGenerateButton = document.getElementById("protectedGenerateButton"); // Protected Generate Button

// --- Socket.IO Event Listeners ---

// Handles initial state load and resets
socket.on('initialState', (state) => {
    console.log('Received initial state:', state);
    if (!state) return;
    // Update state variables
    minValueInput.value = state.min;
    maxValueInput.value = state.max;
    clientInitialRerolls = state.initialRerolls || 12; // Store initial rerolls
    initialRerollsInput.value = clientInitialRerolls; // Set input field value
    clientPlayers = state.players || []; // Update player list FIRST
    clientCurrentPlayerId = state.currentPlayerId;
    clientIsPickAvailable = state.canAddBack;
    clientDraftLog = state.draftLog || [];
    clientDraftHasStarted = state.draftHasStarted; // Sync draft status
    clientOverallPickCount = state.overallPickCounter || 0; // Sync pick count
    clientIsAdminEditMode = state.isAdminEditMode || false; // Sync admin mode
    clientIsProtectedPickPending = false; // Reset pending flag

    // Update UI elements
    updateNumberDisplay(state.currentNumber);
    toggleButtonState(state); // Update standard buttons
    renderPlayers(clientPlayers); // Render players (also handles protected/reroll button state)
    renderDraftLog(clientDraftLog);
    renderSummary(clientPlayers); // Render summary
    updateTurnIndicator(clientCurrentPlayerId, clientDraftHasStarted);
    updateAdminEditButtonVisibility();
    // Disable settings inputs/button if draft started
    toggleSettingsInputs(clientDraftHasStarted);
});

// Handles updates when a new number is generated (standard or protected)
socket.on('numberGenerated', (data) => { // Expect { number, isProtected }
    console.log('Received number:', data);
    updateNumberDisplay(data.number);
    // If a number (protected or not) is generated, disable generation buttons
    if (data.number !== null) {
         toggleButton(generateButton, false);
         toggleButton(protectedGenerateButton, false);
         toggleButton(rerollButton, false); // Disable re-roll button too
         // Set flag if this was a protected pick generation
         clientIsProtectedPickPending = data.isProtected || false;
         console.log("Protected pick pending:", clientIsProtectedPickPending);
    }
    // Update button states based on whether a number is now shown
    toggleButtonState({
        canRemove: data.number !== null,
        canAddBack: false, // Cannot undo immediately after generate
        poolSize: -1 // Pool size unknown here, rely on updatePoolStatus or server state
    });
});

// Confirms draft settings set by server
socket.on('settingsSet', (data) => {
    console.log(`Settings confirmed by server: Range ${data.min}-${data.max}, Re-rolls ${data.initialRerolls}`);
    alert(`Settings updated: Range ${data.min}-${data.max}, Initial Re-rolls ${data.initialRerolls}`);
    minValueInput.value = data.min;
    maxValueInput.value = data.max;
    initialRerollsInput.value = data.initialRerolls;
    clientInitialRerolls = data.initialRerolls;
    // Server resetDraft would have sent initialState, refreshing everything
});

// Updates generate button availability based on pool size
socket.on('updatePoolStatus', (poolSize) => {
    console.log('Pool size updated:', poolSize);
    // Update button states based on pool size and current state
    toggleButtonState({
         canRemove: removeButton ? !removeButton.disabled : false,
         canAddBack: addButton ? !addButton.disabled : false,
         poolSize: poolSize
    });
});

// Updates Claim/Undo buttons and pick availability state
socket.on('updateRemoveAddButtons', (state) => {
    console.log('Updating button states:', state);
    clientIsPickAvailable = state.canAddBack; // Update pick availability
    toggleButtonState(state); // Update standard buttons based on server state
    renderPlayers(clientPlayers); // Re-render needed for Assign buttons
});

// Updates the list of players and re-renders relevant UI parts
socket.on('updatePlayers', (playersFromServer) => {
    console.log('Received updated players:', playersFromServer);
    clientPlayers = playersFromServer || []; // Update player list FIRST
    renderPlayers(clientPlayers); // Re-renders player cards (handles protected/reroll button state)
    renderSummary(clientPlayers); // Update summary
});

// Updates whose turn it is and related states
socket.on('updateTurn', (turnData) => {
    console.log('Received turn update:', turnData);
    clientCurrentPlayerId = turnData.currentPlayerId;
    clientDraftHasStarted = turnData.draftHasStarted;
    clientOverallPickCount = turnData.overallPickCounter || clientOverallPickCount;
    clientIsPickAvailable = false; // Reset pick availability
    clientIsProtectedPickPending = false; // Reset protected pending flag
    updateTurnIndicator(clientCurrentPlayerId, clientDraftHasStarted);
    renderPlayers(clientPlayers); // Re-render (handles protected/reroll button state for new player)
    updateAdminEditButtonVisibility();
    socket.emit('requestState'); // Refresh full state including buttons
});

// Updates the draft log display
socket.on('updateDraftLog', (logFromServer) => {
    console.log('Received draft log update:', logFromServer);
    clientDraftLog = logFromServer || [];
    renderDraftLog(clientDraftLog);
    // Also update summary when log updates (as players' roles have changed)
    renderSummary(clientPlayers);
});

// Updates admin edit mode state and UI
socket.on('updateAdminEditMode', (isEnabled) => {
    console.log('Admin Edit Mode updated:', isEnabled);
    clientIsAdminEditMode = isEnabled;
    updateAdminEditButtonVisibility();
    renderPlayers(clientPlayers); // Re-render players to show/hide edit buttons
});

// Error handling listeners
socket.on('rangeError', (message) => { alert(`Server Error: ${message}`); });
socket.on('poolEmpty', (message) => { alert(`Server Info: ${message}`); });
socket.on('error', (message) => { alert(`Server Error: ${message}`); }); // General errors
socket.on('protectedPickError', (message) => { alert(`Protected Pick Error: ${message}`); });
socket.on('rerollError', (message) => { alert(`Re-roll Error: ${message}`); });

// Request state on reconnect
socket.on('connect', () => {
    console.log('Connected to server');
    socket.emit('requestState');
});


// --- Client-Side Functions Emitting Events ---

// Sets draft settings (range, re-rolls) - PRE-DRAFT ONLY
function setDraftSettings() {
  const min = parseInt(minValueInput.value) || 1;
  const max = parseInt(maxValueInput.value) || 15000;
  const initialRerolls = parseInt(initialRerollsInput.value);

  if (min < 1 || max <= min) { alert("Invalid range values (Min >= 1, Max > Min)."); return; }
  if (isNaN(initialRerolls) || initialRerolls < 0) { alert("Invalid number of initial re-rolls (must be 0 or more)."); return; }

  console.log(`Emitting setDraftSettings: Range ${min}-${max}, Re-rolls ${initialRerolls}`);
  socket.emit('setDraftSettingsRequest', { min, max, initialRerolls });
}

// Generates a standard random number/rank
function generateNumber() {
  console.log('Emitting generateNumberRequest');
  socket.emit('generateNumberRequest');
}

// Uses a re-roll
function useReroll() {
    console.log("Emitting useRerollRequest");
    if (confirm("Are you sure you want to use a re-roll?")) {
        socket.emit('useRerollRequest');
    }
}

// Claims the currently displayed rank number
function removeNumber() { // Claim Pick
  console.log("Emitting removeNumberRequest (Claim Pick)");
  socket.emit('removeNumberRequest');
}

// Undoes the last claim, putting the rank number back
function addNumberBack() { // Undo Claim
  console.log("Emitting addNumberBackRequest (Undo Claim)");
  socket.emit('addNumberBackRequest');
}

// Player Management Functions
function addPlayer() {
    console.log("Emitting addPlayerRequest");
    socket.emit('addPlayerRequest');
}
function removePlayer() {
    console.log("Emitting removePlayerRequest");
    socket.emit('removePlayerRequest');
}
function shufflePlayers() {
    console.log("Emitting shufflePlayersRequest");
    socket.emit('shufflePlayersRequest');
}
function updatePlayerName(id, name) {
    console.log(`Emitting updatePlayerName for ${id}: ${name}`);
    socket.emit('updatePlayerName', { id, name });
}

// Starts the draft
function startDraft() {
    console.log("Emitting startDraftRequest");
    if (confirm("Are you sure you want to start the draft? Settings cannot be changed and players cannot be added/removed/shuffled after starting.")) {
        socket.emit('startDraftRequest');
    }
}

// Toggles admin edit mode (post-draft)
function toggleAdminEdit() {
    console.log("Emitting toggleAdminEditMode");
    socket.emit('toggleAdminEditMode');
}

// Generates a protected pick using a specific range
function generateProtectedPick() {
    const protectedMin = parseInt(protectedMinInput.value);
    const protectedMax = parseInt(protectedMaxInput.value);

    // Validation
    if (isNaN(protectedMin) || isNaN(protectedMax) || protectedMin < 1 || protectedMax <= protectedMin) {
        alert("Invalid protected range values (Min >= 1, Max > Min)."); return;
    }
    if (!clientDraftHasStarted || clientCurrentPlayerId === null) {
         alert("Draft is not active or it's not a player's turn."); return;
    }
     const currentPlayer = clientPlayers.find(p => p.id === clientCurrentPlayerId);
     if (currentPlayer && currentPlayer.protectedPickUsed) {
         alert("You have already used your protected pick for this draft."); return;
     }

    console.log(`Emitting generateProtectedPickRequest with range: ${protectedMin}-${protectedMax}`);
    socket.emit('generateProtectedPickRequest', { min: protectedMin, max: protectedMax });
}


// Handles assigning a character to a role (normal draft or admin edit)
function handleAssignRoleClick(playerId, roleName) {
    console.log(`Assign/Edit button clicked for Player ${playerId}, Role ${roleName}`);
    const player = clientPlayers.find(p => p.id === playerId);
    if (!player) return;

    // If in Admin Edit Mode
    if (clientIsAdminEditMode) {
        const currentCharacter = player.roles[roleName] || "";
        const currentNameOnly = currentCharacter.replace(/\s\(#\d+\)$/, ''); // Remove rank for default prompt value
        const newCharacterName = prompt(`ADMIN EDIT:\nEnter new character name for ${player.name}'s "${roleName}" role (currently "${currentNameOnly}"):`, currentNameOnly);

        if (newCharacterName !== null) { // Allow empty string to clear role
            console.log(`ADMIN EDIT: Emitting assignRoleRequest for Player ${playerId}, Role ${roleName}, Character ${newCharacterName}`);
            socket.emit('assignRoleRequest', {
                playerId: playerId,
                roleName: roleName,
                characterName: newCharacterName.trim()
                // No isProtected flag needed for admin edits
            });
        } else {
            console.log("Admin role edit cancelled by user.");
        }
    }
    // Else, handle normal draft assignment logic
    else {
        // Validation
        if (!clientDraftHasStarted) { alert("Draft hasn't started!"); return; }
        if (playerId !== clientCurrentPlayerId) { alert("It's not your turn!"); return; }
        if (!clientIsPickAvailable) { alert("No character rank/number has been claimed yet (Click 'Claim Rank' first)."); return; }
        if (player.roles[roleName]) { alert(`Role "${roleName}" is already filled!`); return; }

        const characterName = prompt(`Enter character name for role "${roleName}":`);
        if (characterName !== null && characterName.trim() !== '') {
            console.log(`NORMAL DRAFT: Emitting assignRoleRequest for Player ${playerId}, Role ${roleName}, Character ${characterName}`);
            // Check if the assignment follows a protected pick generation
            const isProtected = clientIsProtectedPickPending;
            socket.emit('assignRoleRequest', {
                playerId: playerId,
                roleName: roleName,
                characterName: characterName.trim(),
                isProtected: isProtected // Send flag to server
            });
            // Reset flags and update UI client-side for responsiveness
            clientIsPickAvailable = false;
            clientIsProtectedPickPending = false; // Reset pending flag after assignment attempt
            renderPlayers(clientPlayers); // Update UI to hide assign buttons
        } else {
            console.log("Normal role assignment cancelled by user.");
        }
    }
}


// --- Render Functions (Update UI based on client state) ---

// Renders all player cards, including re-roll count and button states
function renderPlayers(playersToRender) {
  const currentPlayers = Array.isArray(playersToRender) ? playersToRender : [];
  if (!playerBoardDiv) return;

  // Determine button states outside the map for efficiency? No, needs player data.
  let isAnyProtectedEnabled = false;
  let isAnyRerollEnabled = false;

  playerBoardDiv.innerHTML = currentPlayers.map(player => {
    const isCurrentTurn = (player.id === clientCurrentPlayerId);
    // Button visibility logic
    const showAssignButtonsForNormalDraft = isCurrentTurn && clientIsPickAvailable && !clientIsAdminEditMode && clientDraftHasStarted;
    const showEditButtonsForAdmin = clientIsAdminEditMode;
    // Check if protected pick button should be enabled for THIS player
    const canUseProtectedPick = isCurrentTurn && !player.protectedPickUsed && !clientIsAdminEditMode && clientDraftHasStarted && !clientIsPickAvailable && (numberDisplay.textContent === '#?');
    // Check if re-roll button should be enabled for THIS player
    const canUseReroll = isCurrentTurn && (player.rerollsRemaining > 0) && !clientIsAdminEditMode && clientDraftHasStarted && !clientIsPickAvailable && (numberDisplay.textContent !== '#?');

    // Keep track if any buttons should be enabled overall (for toggling outside map)
    if (canUseProtectedPick) isAnyProtectedEnabled = true;
    if (canUseReroll) isAnyRerollEnabled = true;

    // Renders a group of roles (Battle or Relationship)
    const renderRoleGroup = (title, rolesToRender) => `
        <div class="role-section">
            <h4>${title}</h4>
            ${rolesToRender.map(role => {
                const assignedCharacter = player.roles[role] || '';
                const isRoleFilled = !!assignedCharacter;
                let showButton = false;
                let buttonText = "Assign";
                if (showEditButtonsForAdmin) { showButton = true; buttonText = isRoleFilled ? "Edit" : "Assign"; }
                else if (showAssignButtonsForNormalDraft && !isRoleFilled) { showButton = true; buttonText = "Assign"; }
                return `
                    <div class="role-input">
                        <label>${role}:</label>
                        <input type="text" value="${assignedCharacter}" readonly placeholder="Empty">
                        ${showButton ? `<button class="assign-button" onclick="handleAssignRoleClick(${player.id}, '${role}')">${buttonText}</button>` : ''}
                    </div>
                `;
            }).join('')}
        </div>
    `;

    // Determine if the card should be highlighted
    const highlightTurn = isCurrentTurn && !clientIsAdminEditMode && clientDraftHasStarted;
    // Get rerolls remaining, defaulting to initial if undefined (e.g., before first update)
    const rerolls = player.rerollsRemaining ?? clientInitialRerolls;

    return `
        <div class="player-card" data-player-id="${player.id}" data-is-current-turn="${highlightTurn}">
            <input type="text" value="${player.name}"
            onchange="updatePlayerName(${player.id}, this.value)" placeholder="Player Name">

            
            <div class="player-info">
                Re-rolls Remaining: ${rerolls} | Protected Pick Used: ${player.protectedPickUsed ? 'Yes' : 'No'}
            </div>
            

            ${renderRoleGroup("Battle Team", battleRoles)}
            ${renderRoleGroup("Relationship Team", relationshipRoles)}
        </div>
    `;
  }).join('');

  // Toggle buttons based on overall possibility during the current turn render
  toggleButton(protectedGenerateButton, isAnyProtectedEnabled);
  toggleButton(rerollButton, isAnyRerollEnabled);

  // Also disable if draft ended or not started
  if (clientCurrentPlayerId === null || !clientDraftHasStarted) {
      toggleButton(protectedGenerateButton, false);
      toggleButton(rerollButton, false);
  }
}


// Renders the Draft Log
function renderDraftLog(logEntries) {
    if (!draftLogEntriesDiv) return;
    if (!Array.isArray(logEntries)) return;
    draftLogEntriesDiv.innerHTML = logEntries.map(entry => `
        <div class="log-entry">
            <span>R${entry.round}.${entry.pickInRound} (Pick #${entry.overallPick}): <strong>${entry.playerName || 'Unknown'}</strong> selects <strong>${entry.characterName || 'Unknown'}</strong> (#${entry.rank || '?'}) as ${entry.roleName || 'Unknown Role'}.</span>
        </div>
    `).join('');
    // Auto-scroll to the bottom
    draftLogEntriesDiv.scrollTop = draftLogEntriesDiv.scrollHeight;
}

// Renders the Draft Summary board
function renderSummary(playersToRender) {
  const currentPlayers = Array.isArray(playersToRender) ? playersToRender : [];
  if (!summaryBoardDiv) return; // Check if the element exists

  summaryBoardDiv.innerHTML = currentPlayers.map(player => `
    <div class="summary-card" data-player-id="${player.id}">
      <h3>${player.name}</h3>
      ${allRoles.map(role => { // Iterate through all defined roles
          const character = player.roles[role] || "Empty"; // Get assigned character or "Empty"
          // Use <p> for better structure and styling potential
          return `<p><strong>${role}:</strong> <span>${character}</span></p>`;
      }).join('')}
    </div>
  `).join('');
}


// Updates the turn indicator text
function updateTurnIndicator(currentPlayerId, draftHasStarted) {
    if (!turnIndicatorDiv) return;
    // Check overallPickCount to distinguish between pre-draft and post-draft states
    if (!draftHasStarted && clientOverallPickCount === 0) {
        turnIndicatorDiv.textContent = "Waiting for draft to start...";
        turnIndicatorDiv.style.color = 'var(--text-color)';
    } else if (draftHasStarted && currentPlayerId !== null) {
        const currentPlayer = clientPlayers.find(p => p.id === currentPlayerId);
        if (currentPlayer) {
            turnIndicatorDiv.textContent = `Current Turn: ${currentPlayer.name}`;
            turnIndicatorDiv.style.color = 'var(--secondary-highlight)';
        } else {
            // This might happen briefly if player data hasn't arrived yet
            turnIndicatorDiv.textContent = "Loading turn...";
            turnIndicatorDiv.style.color = 'var(--text-color)';
        }
    } else { // Draft is finished
        turnIndicatorDiv.textContent = "Draft complete!";
        turnIndicatorDiv.style.color = 'var(--highlight-color)'; // Blue for complete
    }
}

// Shows/Hides Admin Edit Button based on draft state
function updateAdminEditButtonVisibility() {
    if (!adminEditButton) return;
    // Show button only if draft is NOT started AND at least one pick has been made
    if (!clientDraftHasStarted && clientOverallPickCount > 0) {
        adminEditButton.style.display = 'inline-block'; // Show the button
        adminEditButton.textContent = clientIsAdminEditMode ? 'Disable Post-Draft Edits' : 'Enable Post-Draft Edits';
    } else {
        adminEditButton.style.display = 'none'; // Hide the button
    }
}

// Disables settings inputs after draft start
function toggleSettingsInputs(draftIsActive) {
    const disable = draftIsActive;
    if (minValueInput) minValueInput.disabled = disable;
    if (maxValueInput) maxValueInput.disabled = disable;
    if (initialRerollsInput) initialRerollsInput.disabled = disable;
    if (setSettingsButton) setSettingsButton.disabled = disable;
}


// --- Utility Functions ---

// Updates the number display element
function updateNumberDisplay(number) {
    if (numberDisplay) {
        if (number !== null && number !== undefined) {
            numberDisplay.textContent = `$top #${number}`;
            numberDisplay.style.color = 'var(--highlight-color)';
        } else {
            numberDisplay.textContent = "#?"; // Reset display
            numberDisplay.style.color = 'var(--text-color)';
        }
    }
}

// Enables/disables a button element
function toggleButton(buttonElement, enable) {
  if (buttonElement) {
      buttonElement.disabled = !enable;
  }
}

// Updates enabled/disabled state of multiple buttons based on server state
function toggleButtonState(state) {
    if (!state) return;
    // Enable Claim/Undo only during active draft
    toggleButton(removeButton, state.canRemove && clientDraftHasStarted);
    toggleButton(addButton, state.canAddBack && clientDraftHasStarted);

    // Standard Generate button logic
    if (generateButton) {
        const poolHasItems = state.poolSize !== undefined ? state.poolSize > 0 : true;
        // Enable Generate only if draft started, turn active, pool has items, and no number shown/claimable
        const canGenerateNormal = clientDraftHasStarted && clientCurrentPlayerId !== null && poolHasItems && !state.canRemove && !state.canAddBack;
        toggleButton(generateButton, canGenerateNormal);
    }

    // Re-roll button logic is now handled within renderPlayers as it depends on player-specific state (rerollsRemaining)
    // Protected Generate button logic is also handled within renderPlayers (depends on protectedPickUsed)
}


// --- Waifu Search Function (AniList API - Debounced) ---
async function searchWaifu() {
    // Debounce mechanism
    clearTimeout(searchWaifu.debounceTimer);
    searchWaifu.debounceTimer = setTimeout(async () => {
        console.log("Searching AniList...");
        const query = document.getElementById("searchInput").value.trim();
        const resultsContainer = document.getElementById("searchResults");
        if (!resultsContainer) return;
        if (!query) {
            resultsContainer.innerHTML = ""; // Clear results if query is empty
            return;
        }
        resultsContainer.innerHTML = "<p>Searching...</p>"; // Indicate loading
        try {
            // GraphQL query
            const graphqlQuery = {
                 query: `
                  query ($search: String) {
                    Page(perPage: 5) { # Limit results
                      characters(search: $search, sort: SEARCH_MATCH) { # Sort by relevance
                        id
                        name { full native }
                        image { medium }
                        media(sort: POPULARITY_DESC, type: ANIME, perPage: 1) { # Top anime
                          nodes { id title { romaji english native } }
                        }
                      }
                    }
                  }
                `,
                variables: { search: query },
             };
            // Fetch data
            const response = await fetch("https://graphql.anilist.co", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(graphqlQuery), });
            if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`); }
            const data = await response.json();
            const characters = data?.data?.Page?.characters || [];
            // Display results
            if (characters.length > 0) {
                resultsContainer.innerHTML = characters.map(character => {
                    const mediaNode = character?.media?.nodes?.[0];
                    const title = mediaNode?.title?.romaji || mediaNode?.title?.english || mediaNode?.title?.native || "Unknown Series";
                    const nativeName = character?.name?.native ? `(${character.name.native})` : '';
                    const imageUrl = character?.image?.medium || ''; // Use placeholder if needed: 'https://via.placeholder.com/40';
                    return `
                        <div>
                            <img src="${imageUrl}" alt="${character?.name?.full || 'Character image'}" loading="lazy">
                            <span>
                                <h3>${character?.name?.full || 'Unknown Name'} ${nativeName}</h3>
                                <p><strong>Appears in:</strong> ${title}</p>
                            </span>
                        </div>
                    `;
                 }).join("");
            } else {
                resultsContainer.innerHTML = "<p>No characters found.</p>";
            }
        } catch (error) {
            resultsContainer.innerHTML = "<p>Failed to fetch data.</p>";
            console.error("Error fetching character data:", error);
        }
    }, 300); // Debounce timeout
}
