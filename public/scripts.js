// Connect to the Socket.IO server
 const socket = io(); 

// --- Global Variables (Client-Side) ---
let clientPlayers = [];
 const maxPlayers = 10;
 const roles = [ 
  "Captain", "Vice Captain", "Ace", "Flex 1/Tactician", "Tank",
  "Wildcard", "Mascot", "Flex 2/Support", "Wife/Husband", "Crazy Ex",
  "Mommy/Daddy", "Baby Mommy/Baby Daddy", "Side Piece", "Other Side Piece",
  "Best Friend", "Brother/Sister"
];
 let clientCurrentPlayerId = null;
let clientIsPickAvailable = false;
 
// --- DOM Elements ---
const numberDisplay = document.getElementById("numberDisplay");
const removeButton = document.getElementById("removeButton");
const addButton = document.getElementById("addButton");
const minValueInput = document.getElementById("minValue");
 const maxValueInput = document.getElementById("maxValue");
const generateButton = document.querySelector('button[onclick="generateNumber()"]') || document.getElementById('generateButton');
const playerBoardDiv = document.getElementById("playerBoard");
const summaryBoardDiv = document.getElementById("summaryBoard");
 const turnIndicatorDiv = document.getElementById("turnIndicator");

// --- Socket.IO Event Listeners (Client-Side) ---
// ... (listeners remain the same as previous version) ...
socket.on('initialState', (state) => {
    console.log('Received initial state:', state);
    if (!state) return;
    minValueInput.value = state.min;
    maxValueInput.value = state.max;
    updateNumberDisplay(state.currentNumber); 
    clientPlayers = state.players || [];
    clientCurrentPlayerId = state.currentPlayerId;
    clientIsPickAvailable = state.canAddBack; 
    toggleButtonState(state); 
    renderPlayers(clientPlayers);
    renderSummary(clientPlayers);
    updateTurnIndicator(clientCurrentPlayerId, state.draftHasStarted);
    if (generateButton) {
  
       toggleButton(generateButton, state.poolSize > 0 && !state.canRemove);
    }
});
 
socket.on('numberGenerated', (numberFromServer) => {
    console.log('Received number:', numberFromServer);
    updateNumberDisplay(numberFromServer); 
    if (generateButton && numberFromServer !== null) {
         toggleButton(generateButton, false);
    }
});
 
socket.on('rangeSet', (data) => {
    console.log(`Range confirmed by server: ${data.min} to ${data.max}`);
    alert(`Range set: ${data.min} to ${data.max}`);
    minValueInput.value = data.min;
    maxValueInput.value = data.max;
});
 
socket.on('updatePoolStatus', (poolSize) => {
    console.log('Pool size updated:', poolSize);
    if (generateButton) {
        const canRemove = removeButton ? !removeButton.disabled : false;
        toggleButton(generateButton, poolSize > 0 && !canRemove);
    }
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
    renderSummary(clientPlayers);
});
 
socket.on('updateTurn', (turnData) => {
    console.log('Received turn update:', turnData);
    clientCurrentPlayerId = turnData.currentPlayerId;
    updateTurnIndicator(clientCurrentPlayerId, turnData.draftHasStarted);
    renderPlayers(clientPlayers); 
});
 
socket.on('rangeError', (message) => { alert(`Server Error: ${message}`); });
socket.on('poolEmpty', (message) => { alert(`Server Info: ${message}`); });
 socket.on('error', (message) => { alert(`Server Error: ${message}`); });


// --- Client-Side Functions modified for Socket.IO ---
// ... (setRange, generateNumber, removeNumber, addNumberBack remain the same) ...
function setRange() {
  const min = parseInt(minValueInput.value) || 1;
  const max = parseInt(maxValueInput.value) || 100;
  if (min >= max) { alert("Minimum value must be less than maximum value."); return; }
  console.log(`Emitting setRange: ${min}, ${max}`);
  socket.emit('setRange', { min, max });
}

function generateNumber() {
  console.log('Emitting generateNumberRequest');
  socket.emit('generateNumberRequest');
 }

function removeNumber() {
  console.log("Emitting removeNumberRequest");
  socket.emit('removeNumberRequest');
}

function addNumberBack() {
  console.log("Emitting addNumberBackRequest");
  socket.emit('addNumberBackRequest');
 }

// --- Helper function to update the display ---
// ... (updateNumberDisplay remains the same) ...
function updateNumberDisplay(number) {
    if (numberDisplay) { 
        if (number !== null && number !== undefined) {
            numberDisplay.textContent = `$top #${number}`; 
 } else {
            numberDisplay.textContent = "#?"; 
         }
    }
}


// ... (toggleButtonState remains the same) ...
function toggleButtonState(state) { 
    if (!state) return; 
 toggleButton(removeButton, state.canRemove);
    toggleButton(addButton, state.canAddBack);
    if (generateButton) {
        const poolHasItems = state.poolSize !== undefined ? 
 state.poolSize > 0 : true;
        toggleButton(generateButton, poolHasItems && !state.canRemove);
    }
}


// --- Player Management Functions (Emit Events) ---
// ... (addPlayer, removePlayer, shufflePlayers, updatePlayerName, handleAssignRoleClick remain the same) ...
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

function handleAssignRoleClick(playerId, roleName) {
    console.log(`Assign button clicked for Player ${playerId}, Role ${roleName}`);
 if (playerId !== clientCurrentPlayerId) { alert("It's not your turn!"); return; 
 }
    if (!clientIsPickAvailable) { alert("No character rank/number has been claimed yet (click Remove first)."); return; 
 }
    const characterName = prompt(`Enter character name for role "${roleName}":`);
 if (characterName !== null && characterName.trim() !== '') {
        console.log(`Emitting assignRoleRequest for Player ${playerId}, Role ${roleName}, Character ${characterName}`);
 socket.emit('assignRoleRequest', {
            playerId: playerId,
            roleName: roleName,
            characterName: characterName.trim()
        });
 clientIsPickAvailable = false; 
        renderPlayers(clientPlayers); 
    } else {
        console.log("Role assignment cancelled by user.");
 }
}


// --- Render Functions (Accept players array) ---
// MODIFIED renderPlayers: Added roles-grid-container div
function renderPlayers(playersToRender) {
  const currentPlayers = Array.isArray(playersToRender) ? playersToRender : [];
  if (playerBoardDiv) {
      playerBoardDiv.innerHTML = currentPlayers.map(player => {
          const isCurrentTurn = (player.id === clientCurrentPlayerId);
          const showAssignButtons = isCurrentTurn && clientIsPickAvailable;

          const cardClass = isCurrentTurn ? 'player-card current-turn-player' : 'player-card';

          return `
            <div class="${cardClass}" data-player-id="${player.id}">
              <input type="text" value="${player.name}"
                onchange="updatePlayerName(${player.id}, this.value)" placeholder="Player Name">

              <div class="roles-grid-container">
                ${roles.map(role => `
                  <div class="role-input">
                    <label>${role}:</label>
                    <p class="role-value">${player.roles[role] || '...'}</p>
                    ${showAssignButtons && !player.roles[role] ?
                      `<button class="assign-button" onclick="handleAssignRoleClick(${player.id}, '${role}')">Assign</button>`
                      : ''
                    }
                  </div>
                `).join('')}
              </div> </div>
          `;
      }).join('');
      // Add empty state message if no players
      if (currentPlayers.length === 0) {
          playerBoardDiv.innerHTML = "<p style='color: #aaa; margin-top: 20px;'>Click 'Add Player' below to start building teams!</p>";
      }
  }
}


// ... (renderSummary remains the same) ...
function renderSummary(playersToRender) {
  const currentPlayers = Array.isArray(playersToRender) ? playersToRender : [];
 if (summaryBoardDiv) {
      summaryBoardDiv.innerHTML = currentPlayers.map(player => `
        <div class="summary-card" data-player-id="${player.id}">
          <h3>${player.name}</h3>
          ${roles.map(role => `
            <p><strong>${role}:</strong> ${player.roles[role] || "N/A"}</p>
          `).join('')}
        </div>
      `).join('');
 }
}

// ... (updateTurnIndicator remains the same) ...
function updateTurnIndicator(currentPlayerId, draftHasStarted) {
    if (!turnIndicatorDiv) return;
 if (!draftHasStarted) {
        turnIndicatorDiv.textContent = "Waiting for draft to start...";
 } else if (currentPlayerId !== null) {
        const currentPlayer = clientPlayers.find(p => p.id === currentPlayerId);
 if (currentPlayer) {
            turnIndicatorDiv.textContent = `Current Turn: ${currentPlayer.name}`;
 } else {
            turnIndicatorDiv.textContent = "Waiting for player data...";
 }
    } else {
        turnIndicatorDiv.textContent = "Draft complete!";
 }
}

// ... (startDraft remains the same) ...
function startDraft() {
    console.log("Emitting startDraftRequest");
    socket.emit('startDraftRequest');
}

// --- Utility Functions ---
// ... (toggleButton remains the same) ...
function toggleButton(buttonElement, enable) {
  if (buttonElement) {
      buttonElement.disabled = !enable;
 }
}

// --- Waifu Search Function ---
// ... (searchWaifu remains the same as previous corrected version) ...
async function searchWaifu() {
    console.log("Search waifu function called");
 const query = document.getElementById("searchInput").value.trim();
    const resultsContainer = document.getElementById("searchResults");
    if (!query) { resultsContainer.innerHTML = ""; return; 
 }
    try {
        const graphqlQuery = {
            // CORRECTED QUERY: Removed ', isMain: true' from media field
            query: `
              query ($search: String) {
                Page(perPage: 5) {
                  characters(search: $search) {
                    id
                    name { full native }
                    image { medium }
                    media(sort: POPULARITY_DESC, type: ANIME) {
                      nodes { title { romaji english } }
                    }
                  }
                }
              }
            `,
            variables: { search: query },
          };
          
        // Keep console.log for debugging if needed
        console.log("Sending GraphQL Request Body:", JSON.stringify(graphqlQuery)); 
          
        const response = await fetch("https://graphql.anilist.co", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify(graphqlQuery),
        });

        // Check if the response was successful (status code 200-299)
        if (!response.ok) {
             const errorBody = await response.text(); 
             console.error(`Error fetching data: ${response.status} ${response.statusText}`, errorBody);
             resultsContainer.innerHTML = `<p>Error contacting API: ${response.status} ${response.statusText}. Check console.</p>`;
             return; 
        }

        const data = await response.json();
        // Check for GraphQL errors within the response data
        if (data.errors) {
            console.error("GraphQL API returned errors:", data.errors);
            resultsContainer.innerHTML = `<p>API returned an error: ${data.errors[0]?.message || 'Unknown API error'}. Check console.</p>`;
            return; 
        }

        const characters = data?.data?.Page?.characters || [];
        if (characters.length === 0) {
            resultsContainer.innerHTML = "<p>No characters found.</p>";
        } else {
            resultsContainer.innerHTML = characters.map(character => {
                const mediaTitle = character?.media?.nodes?.[0]?.title?.romaji || "Unknown Source"; 
                const nativeName = character?.name?.native ? `(${character.name.native})` : ''; 
                return `
                    <div>
                        <img src="${character?.image?.medium}" alt="${character?.name?.full}" style="width:50px; border-radius:8px; vertical-align: middle; margin-right: 10px;">
                        <span style="display: inline-block; vertical-align: middle;">
                            <h3>${character?.name?.full} ${nativeName}</h3>
                            <p><strong>Appears in:</strong> ${mediaTitle}</p>
                        </span>
                    </div>
                `;
            }).join("");
        }
    } catch (error) {
        resultsContainer.innerHTML = "<p>Failed to fetch data. Please check connection or try again later.</p>"; 
        console.error("Error during fetch operation:", error); 
    }
}