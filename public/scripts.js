// scripts.js (Client-Side, Updated renderSummary)

const socket = io();

// --- Global Variables ---
let clientPlayers = []; // Format: { id, name, roles: {}, protectedPickUsed: false, rerollsRemaining: 12 }
const maxPlayers = 10;
const battleRoles = [ "Captain", "Vice Captain", "Ace", "Flex 1/Tactician", "Tank", "Wildcard", "Mascot", "Flex 2/Support" ];
const relationshipRoles = [ "Primary Partner", "Past Flame", "Guardian Figure", "The Anchor", "Secret Interest", "Further Complication", "Best Friend", "Sibling" ];
const allRoles = [...battleRoles, ...relationshipRoles];

// State variables
let clientCurrentPlayerId = null;
let clientIsPickAvailable = false;
let clientDraftLog = [];
let clientDraftHasStarted = false;
let clientOverallPickCount = 0;
let clientIsAdminEditMode = false;
let clientIsProtectedPickPending = false;
let clientInitialRerolls = 12;

// --- DOM Elements ---
const numberDisplay = document.getElementById("numberDisplay");
const removeButton = document.getElementById("removeButton");
const addButton = document.getElementById("addButton");
const minValueInput = document.getElementById("minValue");
const maxValueInput = document.getElementById("maxValue");
const initialRerollsInput = document.getElementById("initialRerolls");
const setSettingsButton = document.getElementById("setSettingsButton");
const generateButton = document.getElementById("generateButton");
const rerollButton = document.getElementById("rerollButton");
const playerBoardDiv = document.getElementById("playerBoard");
const draftLogEntriesDiv = document.getElementById("draftLogEntries");
const summaryBoardDiv = document.getElementById("summaryBoard"); // Summary Board Div
const turnIndicatorDiv = document.getElementById("turnIndicator");
const adminEditButton = document.getElementById("adminEditButton");
const protectedMinInput = document.getElementById("protectedMin");
const protectedMaxInput = document.getElementById("protectedMax");
const protectedGenerateButton = document.getElementById("protectedGenerateButton");

// --- Socket.IO Event Listeners ---
// ... (All listeners remain unchanged from draft-tool-v6-client-js) ...
socket.on('initialState', (state) => {
    console.log('Received initial state:', state);
    if (!state) return;
    minValueInput.value = state.min;
    maxValueInput.value = state.max;
    clientInitialRerolls = state.initialRerolls || 12;
    initialRerollsInput.value = clientInitialRerolls;
    clientPlayers = state.players || [];
    clientCurrentPlayerId = state.currentPlayerId;
    clientIsPickAvailable = state.canAddBack;
    clientDraftLog = state.draftLog || [];
    clientDraftHasStarted = state.draftHasStarted;
    clientOverallPickCount = state.overallPickCounter || 0;
    clientIsAdminEditMode = state.isAdminEditMode || false;
    clientIsProtectedPickPending = false;
    updateNumberDisplay(state.currentNumber);
    toggleButtonState(state);
    renderPlayers(clientPlayers);
    renderDraftLog(clientDraftLog);
    renderSummary(clientPlayers); // Call Render Summary
    updateTurnIndicator(clientCurrentPlayerId, clientDraftHasStarted);
    updateAdminEditButtonVisibility();
    toggleSettingsInputs(clientDraftHasStarted);
});
socket.on('numberGenerated', (data) => {
    console.log('Received number:', data);
    updateNumberDisplay(data.number);
    clientIsProtectedPickPending = data.isProtected || false;
    console.log("Protected pick pending:", clientIsProtectedPickPending);
    if (data.number !== null) {
         toggleButton(generateButton, false);
         toggleButton(protectedGenerateButton, false);
         toggleButton(rerollButton, false);
    }
    toggleButtonState({ canRemove: data.number !== null, canAddBack: false, poolSize: -1 });
});
socket.on('settingsSet', (data) => {
    console.log(`Settings confirmed by server: Range ${data.min}-${data.max}, Re-rolls ${data.initialRerolls}`);
    alert(`Settings updated: Range ${data.min}-${data.max}, Initial Re-rolls ${data.initialRerolls}`);
    minValueInput.value = data.min;
    maxValueInput.value = data.max;
    initialRerollsInput.value = data.initialRerolls;
    clientInitialRerolls = data.initialRerolls;
});
socket.on('updatePoolStatus', (poolSize) => {
    console.log('Pool size updated:', poolSize);
    toggleButtonState({
         canRemove: removeButton ? !removeButton.disabled : false,
         canAddBack: addButton ? !addButton.disabled : false,
         poolSize: poolSize
    });
});
socket.on('updateRemoveAddButtons', (state) => {
    console.log('Updating button states:', state);
    clientIsPickAvailable = state.canAddBack;
    toggleButtonState(state);
    renderPlayers(clientPlayers);
});
socket.on('updatePlayers', (playersFromServer) => {
    console.log('Received updated players:', playersFromServer);
    clientPlayers = playersFromServer || [];
    renderPlayers(clientPlayers);
    renderSummary(clientPlayers); // Call Render Summary
});
socket.on('updateTurn', (turnData) => {
    console.log('Received turn update:', turnData);
    clientCurrentPlayerId = turnData.currentPlayerId;
    clientDraftHasStarted = turnData.draftHasStarted;
    clientOverallPickCount = turnData.overallPickCounter || clientOverallPickCount;
    clientIsPickAvailable = false;
    clientIsProtectedPickPending = false;
    updateTurnIndicator(clientCurrentPlayerId, clientDraftHasStarted);
    renderPlayers(clientPlayers);
    updateAdminEditButtonVisibility();
    socket.emit('requestState');
});
socket.on('updateDraftLog', (logFromServer) => {
    console.log('Received draft log update:', logFromServer);
    clientDraftLog = logFromServer || [];
    renderDraftLog(clientDraftLog);
    renderSummary(clientPlayers); // Call Render Summary
});
socket.on('updateAdminEditMode', (isEnabled) => {
    console.log('Admin Edit Mode updated:', isEnabled);
    clientIsAdminEditMode = isEnabled;
    updateAdminEditButtonVisibility();
    renderPlayers(clientPlayers);
});
socket.on('rangeError', (message) => { alert(`Server Error: ${message}`); });
socket.on('poolEmpty', (message) => { alert(`Server Info: ${message}`); });
socket.on('error', (message) => { alert(`Server Error: ${message}`); });
socket.on('protectedPickError', (message) => { alert(`Protected Pick Error: ${message}`); });
socket.on('rerollError', (message) => { alert(`Re-roll Error: ${message}`); });
socket.on('connect', () => { console.log('Connected to server'); socket.emit('requestState'); });


// --- Client-Side Functions Emitting Events ---
// ... (setDraftSettings, generateNumber, useReroll, removeNumber, addNumberBack, addPlayer, removePlayer, shufflePlayers, updatePlayerName, startDraft, toggleAdminEdit, generateProtectedPick, handleAssignRoleClick functions remain unchanged from draft-tool-v6-client-js) ...
function setDraftSettings() {
  const min = parseInt(minValueInput.value) || 1;
  const max = parseInt(maxValueInput.value) || 15000;
  const initialRerolls = parseInt(initialRerollsInput.value);
  if (min < 1 || max <= min) { alert("Invalid range values (Min >= 1, Max > Min)."); return; }
  if (isNaN(initialRerolls) || initialRerolls < 0) { alert("Invalid number of initial re-rolls (must be 0 or more)."); return; }
  console.log(`Emitting setDraftSettings: Range ${min}-${max}, Re-rolls ${initialRerolls}`);
  socket.emit('setDraftSettingsRequest', { min, max, initialRerolls });
}
function generateNumber() { console.log('Emitting generateNumberRequest'); socket.emit('generateNumberRequest'); }
function useReroll() { console.log("Emitting useRerollRequest"); if (confirm("Are you sure you want to use a re-roll?")) { socket.emit('useRerollRequest'); } }
function removeNumber() { console.log("Emitting removeNumberRequest (Claim Pick)"); socket.emit('removeNumberRequest'); }
function addNumberBack() { console.log("Emitting addNumberBackRequest (Undo Claim)"); socket.emit('addNumberBackRequest'); }
function addPlayer() { console.log("Emitting addPlayerRequest"); socket.emit('addPlayerRequest'); }
function removePlayer() { console.log("Emitting removePlayerRequest"); socket.emit('removePlayerRequest'); }
function shufflePlayers() { console.log("Emitting shufflePlayersRequest"); socket.emit('shufflePlayersRequest'); }
function updatePlayerName(id, name) { console.log(`Emitting updatePlayerName for ${id}: ${name}`); socket.emit('updatePlayerName', { id, name }); }
function startDraft() { console.log("Emitting startDraftRequest"); if (confirm("Are you sure you want to start the draft? Settings cannot be changed and players cannot be added/removed/shuffled after starting.")) { socket.emit('startDraftRequest'); } }
function toggleAdminEdit() { console.log("Emitting toggleAdminEditMode"); socket.emit('toggleAdminEditMode'); }
function generateProtectedPick() {
    const protectedMin = parseInt(protectedMinInput.value); const protectedMax = parseInt(protectedMaxInput.value);
    if (isNaN(protectedMin) || isNaN(protectedMax) || protectedMin < 1 || protectedMax <= protectedMin) { alert("Invalid protected range values (Min >= 1, Max > Min)."); return; }
    if (!clientDraftHasStarted || clientCurrentPlayerId === null) { alert("Draft is not active or it's not a player's turn."); return; }
    const currentPlayer = clientPlayers.find(p => p.id === clientCurrentPlayerId);
    if (currentPlayer && currentPlayer.protectedPickUsed) { alert("You have already used your protected pick for this draft."); return; }
    console.log(`Emitting generateProtectedPickRequest with range: ${protectedMin}-${protectedMax}`); socket.emit('generateProtectedPickRequest', { min: protectedMin, max: protectedMax });
}
function handleAssignRoleClick(playerId, roleName) {
    console.log(`Assign/Edit button clicked for Player ${playerId}, Role ${roleName}`);
    const player = clientPlayers.find(p => p.id === playerId); if (!player) return;
    if (clientIsAdminEditMode) {
        const currentCharacter = player.roles[roleName] || ""; const currentNameOnly = currentCharacter.replace(/\s\(#\d+\)$/, ''); const newCharacterName = prompt(`ADMIN EDIT:\nEnter new character name for ${player.name}'s "${roleName}" role (currently "${currentNameOnly}"):`, currentNameOnly);
        if (newCharacterName !== null) { console.log(`ADMIN EDIT: Emitting assignRoleRequest for Player ${playerId}, Role ${roleName}, Character ${newCharacterName}`); socket.emit('assignRoleRequest', { playerId: playerId, roleName: roleName, characterName: newCharacterName.trim() }); }
        else { console.log("Admin role edit cancelled by user."); }
    } else {
        if (!clientDraftHasStarted) { alert("Draft hasn't started!"); return; } if (playerId !== clientCurrentPlayerId) { alert("It's not your turn!"); return; } if (!clientIsPickAvailable) { alert("No character rank/number has been claimed yet (Click 'Claim Rank' first)."); return; } if (player.roles[roleName]) { alert(`Role "${roleName}" is already filled!`); return; }
        const characterName = prompt(`Enter character name for role "${roleName}":`);
        if (characterName !== null && characterName.trim() !== '') {
            console.log(`NORMAL DRAFT: Emitting assignRoleRequest for Player ${playerId}, Role ${roleName}, Character ${characterName}`); const isProtected = clientIsProtectedPickPending; socket.emit('assignRoleRequest', { playerId: playerId, roleName: roleName, characterName: characterName.trim(), isProtected: isProtected }); clientIsPickAvailable = false; clientIsProtectedPickPending = false; renderPlayers(clientPlayers);
        } else { console.log("Normal role assignment cancelled by user."); }
    }
}


// --- Render Functions ---

// renderPlayers remains unchanged from v6
function renderPlayers(playersToRender) { /* ... unchanged ... */
  const currentPlayers = Array.isArray(playersToRender) ? playersToRender : []; if (!playerBoardDiv) return;
  let isAnyProtectedEnabled = false; let isAnyRerollEnabled = false;
  playerBoardDiv.innerHTML = currentPlayers.map(player => {
    const isCurrentTurn = (player.id === clientCurrentPlayerId);
    const showAssignButtonsForNormalDraft = isCurrentTurn && clientIsPickAvailable && !clientIsAdminEditMode && clientDraftHasStarted;
    const showEditButtonsForAdmin = clientIsAdminEditMode;
    const canUseProtectedPick = isCurrentTurn && !player.protectedPickUsed && !clientIsAdminEditMode && clientDraftHasStarted && !clientIsPickAvailable && (numberDisplay.textContent === '#?');
    const canUseReroll = isCurrentTurn && (player.rerollsRemaining > 0) && !clientIsAdminEditMode && clientDraftHasStarted && !clientIsPickAvailable && (numberDisplay.textContent !== '#?');
    if (canUseProtectedPick) isAnyProtectedEnabled = true; if (canUseReroll) isAnyRerollEnabled = true;
    const renderRoleGroup = (title, rolesToRender) => `
        <div class="role-section"> <h4>${title}</h4> ${rolesToRender.map(role => {
                const assignedCharacter = player.roles[role] || ''; const isRoleFilled = !!assignedCharacter; let showButton = false; let buttonText = "Assign";
                if (showEditButtonsForAdmin) { showButton = true; buttonText = isRoleFilled ? "Edit" : "Assign"; } else if (showAssignButtonsForNormalDraft && !isRoleFilled) { showButton = true; buttonText = "Assign"; }
                return `<div class="role-input"> <label>${role}:</label> <input type="text" value="${assignedCharacter}" readonly placeholder="Empty"> ${showButton ? `<button class="assign-button" onclick="handleAssignRoleClick(${player.id}, '${role}')">${buttonText}</button>` : ''} </div>`;
            }).join('')} </div>`;
    const highlightTurn = isCurrentTurn && !clientIsAdminEditMode && clientDraftHasStarted; const rerolls = player.rerollsRemaining ?? clientInitialRerolls;
    return `<div class="player-card" data-player-id="${player.id}" data-is-current-turn="${highlightTurn}"> <input type="text" value="${player.name}" onchange="updatePlayerName(${player.id}, this.value)" placeholder="Player Name"> <div class="player-info"> Re-rolls Remaining: ${rerolls} | Protected Pick Used: ${player.protectedPickUsed ? 'Yes' : 'No'} </div> ${renderRoleGroup("Battle Team", battleRoles)} ${renderRoleGroup("Relationship Team", relationshipRoles)} </div>`;
  }).join('');
  toggleButton(protectedGenerateButton, isAnyProtectedEnabled); toggleButton(rerollButton, isAnyRerollEnabled);
  if (clientCurrentPlayerId === null || !clientDraftHasStarted) { toggleButton(protectedGenerateButton, false); toggleButton(rerollButton, false); }
}


// renderDraftLog remains unchanged from v6
function renderDraftLog(logEntries) { /* ... unchanged ... */
    if (!draftLogEntriesDiv) return; if (!Array.isArray(logEntries)) return;
    draftLogEntriesDiv.innerHTML = logEntries.map(entry => ` <div class="log-entry"> <span>R${entry.round}.${entry.pickInRound} (Pick #${entry.overallPick}): <strong>${entry.playerName || 'Unknown'}</strong> selects <strong>${entry.characterName || 'Unknown'}</strong> (#${entry.rank || '?'}) as ${entry.roleName || 'Unknown Role'}.</span> </div> `).join('');
    draftLogEntriesDiv.scrollTop = draftLogEntriesDiv.scrollHeight;
}

// ***** MODIFIED: Render Draft Summary Function *****
function renderSummary(playersToRender) {
  const currentPlayers = Array.isArray(playersToRender) ? playersToRender : [];
  if (!summaryBoardDiv) return;

  summaryBoardDiv.innerHTML = currentPlayers.map(player => {
    // Helper to generate list items for a role group
    const generateRoleList = (roles) => {
        return roles.map(role => {
           const character = player.roles[role] || "Empty";
           // Format matches the simulation input: Role: Character (#Rank)
           return `<p><strong>${role}:</strong> <span>${character}</span></p>`;
        }).join('');
    };

    return `
        <div class="summary-card" data-player-id="${player.id}">
            
            <h3>${player.name}</h3>
            
            
            <h4>Battle Roles:</h4>
            ${generateRoleList(battleRoles)}
            
            
            <h4 style="margin-top: 10px;">Relationship Roles:</h4> 
            ${generateRoleList(relationshipRoles)}
        </div>
    `;
  }).join('');
}


// updateTurnIndicator remains unchanged from v6
function updateTurnIndicator(currentPlayerId, draftHasStarted) { /* ... unchanged ... */
    if (!turnIndicatorDiv) return; if (!draftHasStarted && clientOverallPickCount === 0) { turnIndicatorDiv.textContent = "Waiting for draft to start..."; turnIndicatorDiv.style.color = 'var(--text-color)'; } else if (draftHasStarted && currentPlayerId !== null) { const currentPlayer = clientPlayers.find(p => p.id === currentPlayerId); if (currentPlayer) { turnIndicatorDiv.textContent = `Current Turn: ${currentPlayer.name}`; turnIndicatorDiv.style.color = 'var(--secondary-highlight)'; } else { turnIndicatorDiv.textContent = "Loading turn..."; turnIndicatorDiv.style.color = 'var(--text-color)'; } } else { turnIndicatorDiv.textContent = "Draft complete!"; turnIndicatorDiv.style.color = 'var(--highlight-color)'; }
}

// updateAdminEditButtonVisibility remains unchanged from v6
function updateAdminEditButtonVisibility() { /* ... unchanged ... */
    if (!adminEditButton) return; if (!clientDraftHasStarted && clientOverallPickCount > 0) { adminEditButton.style.display = 'inline-block'; adminEditButton.textContent = clientIsAdminEditMode ? 'Disable Post-Draft Edits' : 'Enable Post-Draft Edits'; } else { adminEditButton.style.display = 'none'; }
}

// toggleSettingsInputs remains unchanged from v6
function toggleSettingsInputs(draftIsActive) { /* ... unchanged ... */
    const disable = draftIsActive; if (minValueInput) minValueInput.disabled = disable; if (maxValueInput) maxValueInput.disabled = disable; if (initialRerollsInput) initialRerollsInput.disabled = disable; if (setSettingsButton) setSettingsButton.disabled = disable;
}


// --- Utility Functions ---
// updateNumberDisplay, toggleButton, toggleButtonState remain unchanged from v6
function updateNumberDisplay(number) { if (numberDisplay) { if (number !== null && number !== undefined) { numberDisplay.textContent = `$top #${number}`; numberDisplay.style.color = 'var(--highlight-color)'; } else { numberDisplay.textContent = "#?"; numberDisplay.style.color = 'var(--text-color)'; } } }
function toggleButton(buttonElement, enable) { if (buttonElement) { buttonElement.disabled = !enable; } }
function toggleButtonState(state) {
    if (!state) return; toggleButton(removeButton, state.canRemove && clientDraftHasStarted); toggleButton(addButton, state.canAddBack && clientDraftHasStarted);
    if (generateButton) { const poolHasItems = state.poolSize !== undefined ? state.poolSize > 0 : true; const canGenerateNormal = clientDraftHasStarted && clientCurrentPlayerId !== null && poolHasItems && !state.canRemove && !state.canAddBack; toggleButton(generateButton, canGenerateNormal); }
    // Re-roll and Protected button state now handled in renderPlayers
}


// searchWaifu remains unchanged from v6
async function searchWaifu() { /* ... unchanged ... */
    clearTimeout(searchWaifu.debounceTimer); searchWaifu.debounceTimer = setTimeout(async () => {
        console.log("Searching AniList..."); const query = document.getElementById("searchInput").value.trim(); const resultsContainer = document.getElementById("searchResults"); if (!resultsContainer) return; if (!query) { resultsContainer.innerHTML = ""; return; } resultsContainer.innerHTML = "<p>Searching...</p>";
        try {
            const graphqlQuery = { query: ` query ($search: String) { Page(perPage: 5) { characters(search: $search, sort: SEARCH_MATCH) { id name { full native } image { medium } media(sort: POPULARITY_DESC, type: ANIME, perPage: 1) { nodes { id title { romaji english native } } } } } } `, variables: { search: query }, };
            const response = await fetch("https://graphql.anilist.co", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(graphqlQuery), }); if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`); } const data = await response.json(); const characters = data?.data?.Page?.characters || [];
            if (characters.length > 0) { resultsContainer.innerHTML = characters.map(character => { const mediaNode = character?.media?.nodes?.[0]; const title = mediaNode?.title?.romaji || mediaNode?.title?.english || mediaNode?.title?.native || "Unknown Series"; const nativeName = character?.name?.native ? `(${character.name.native})` : ''; const imageUrl = character?.image?.medium || ''; return ` <div> <img src="${imageUrl}" alt="${character?.name?.full || 'Character image'}" loading="lazy"> <span> <h3>${character?.name?.full || 'Unknown Name'} ${nativeName}</h3> <p><strong>Appears in:</strong> ${title}</p> </span> </div> `; }).join(""); }
            else { resultsContainer.innerHTML = "<p>No characters found.</p>"; }
        } catch (error) { resultsContainer.innerHTML = "<p>Failed to fetch data.</p>"; console.error("Error fetching character data:", error); }
    }, 300);
}
