
function pickRandomCR() {
    const crValuesAndWeights = CRValuesAndWeights; // Get the CR object with weights

    // Check if there are any usable CR values
    const usableCRs = Object.keys(crValuesAndWeights).filter(cr => crValuesAndWeights[cr] > 0);

    if (usableCRs.length === 0) {
        ui.notifications.error("Rolling using table did not work. Using default table. Report error if this message is seen.");
        return null; // Return null if there are no CRs to choose from
    }

    // Get the total weight for weighted random selection
    const totalWeight = usableCRs.reduce((sum, cr) => sum + crValuesAndWeights[cr], 0);

    // Generate a random number between 0 and totalWeight
    const randomWeight = Math.random() * totalWeight;

    // Find the selected CR based on the random weight
    let cumulativeWeight = 0;
    for (const cr of usableCRs) {
        cumulativeWeight += crValuesAndWeights[cr];
        if (randomWeight < cumulativeWeight) {
            return parseFloat(cr); // Return the selected CR as a float
        }
    }

    ui.notifications.error("Rolling using table did not work. Using default table. Report error if this message is seen.");
    return null; // Return null if nothing was selected (shouldn't happen)
}


// Function to pick a random actor from an array of actor selection objects
async function pickRandomActor(actorSelectionObjects) {
    if (actorSelectionObjects.length === 0) {
        return null; // Return null if the array is empty
    }
    const randomIndex = Math.floor(Math.random() * actorSelectionObjects.length);
    const selectedActorObject = actorSelectionObjects[randomIndex];

    //console.log(selectedActorObject);

    // Use the retrieveRealActorFromActorSelectionObject to get the actual actor
    let actualActor = await retrieveRealActorFromActorSelectionObject(actorSelectionObjects[randomIndex]);

    return actualActor; // Return the actual randomly selected actor
}


// Function to create chat message with buttons for GM to use
function createChatMessageForConjuredAnimals(cr, amount, actor, playerTokenId, createdMethod) {
    const actorImage = actor.img || "modules/conjure-animals-helper/assets/animals-icon.png"; // Use actor image if available, otherwise fallback to default


    let generationText = createdMethod + "ly generated";

    if (JPDEBUGGINGMODEISON) {
        generationText = "randomly generated"; //trying to manually set text to trace issue
    }

    //const tableIcon = "modules/conjure-animals-helper/assets/animals-icon.png"; // Path to your icon in the module
    const messageContent = `
    <div style="display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center;">
        <!-- Left Column -->
        <div>
            <p><strong>Conjure Animals Helper</strong></p>
            <small><i>${generationText}</i></small>
            <p><strong>CR:</strong> ${cr}</p>
            <p><strong>Amount:</strong> ${amount}</p>
            <p><strong>Creature:</strong> ${actor.name}</p>
        </div>
        <!-- Right Column with gray background -->
        <div style="margin-right: 8px;">
        <div style="display: flex; justify-content: center; align-items: center; background-color: #aeaeae; width: 96px; height: 96px; border-radius: 8px;">
            <img src="${actorImage}" style="width: 96px; height: 96px; object-fit: cover; border-radius: 8px;" alt="Conjured Creature Icon" />
        </div>
        </div>
    </div>
    
    <!-- Buttons below the two columns -->
    <div style="margin-top: 10px;">
        <button class="create-tokens-btn-cjah" data-cr="${cr}" data-amount="${amount}" data-actor-id="${actor.id}" data-player-token-id="${playerTokenId}">        
          Create Tokens
        </button>
        <button class="delete-tokens-btn-cjah" data-player-token-id="${playerTokenId}">
          Delete Tokens
        </button>
        <button class="roll-tokens-btn-cjah" data-player-token-id="${playerTokenId}">
          Add conjured to combat
        </button>
    </div>
  `;

    ChatMessage.create({
        user: game.user._id,
        content: messageContent,
        speaker: ChatMessage.getSpeaker(),
    });
}


//---------------------------------------------------------------------------------------------CREATE TOKEN STUFF------------------------------------------------------------------------------------------
// Function to handle token creation by GM when button in chat is clicked
async function createActorTokensFromChat(cr, amount, actorId, clickedToken) {

    if (!game.user.isGM) {
        ui.notifications.error("only the GM can create tokens.");
        return;
    }

    const actor = game.actors.get(actorId);
    if (!actor) {
        ui.notifications.error(`Actor with ID ${actorId} not found.`);
        return;
    }

    if (!canvas.scene) {
        ui.notifications.error("No active scene found.");
        return;
    }

    if (!clickedToken) {
        ui.notifications.error("No token selected.");
        return;
    }

    const checkForExisting = await checkForConjuredTokens(clickedToken);
    console.log("checkForExisting: ", checkForExisting)
    if (checkForExisting === true) {
        console.log("existing because of existing tokens");
        ui.notifications.error("Selected Player already has summoned tokens");
        return;
    }

    let actualUseAmount = amount;
    if (actualUseAmount > 8) {
        actualUseAmount = 8; //the max tokens can be 8. it shouldn't be able to be more than that, but to be safe, we do it here too
    }

    // Get the position of the selected token
    //const { x: startX, y: startY } = clickedToken;
    const { x: startX, y: startY } = clickedToken.document;

    // Get the permissions of the clicked token's actor
    const clickedActorPermissions = clickedToken.actor.data.permission;

    // Use the actor's prototype token as a base for the new tokens
    const tokenData = actor.prototypeToken.toObject();

    // Use Math.max to select the greater value between width and height
    const tokenSize = Math.max(tokenData.width, tokenData.height);
    //console.log(`Token size: ${tokenSize}`);

    const tokensToCreate = [];

    // Get the owner's name from the clicked token's actor
    const ownerName = clickedToken.actor.name; // Get the name of the actor controlling the token
    //console.log("conjured owner name: " + ownerName);
    let usedPositions = []; // Create an array to track used positions
    // Place tokens near the selected token
    for (let i = 0; i < actualUseAmount; i++) {
        const [x, y] = await findAvailablePosition(startX, startY, usedPositions, tokenSize);

        if (x !== null && y !== null) {
            //console.log(`Valid Coordinates: x = ${x}, y = ${y}`);
            tokensToCreate.push({
                ...tokenData,
                actorId: actor.id,
                name: `Conjured(${ownerName}): ${actor.name} ${(i + 1)}`,
                x,
                y,
                flags: {
                    myModule: {
                        isConjured: true,
                        ConjuredOwner: ownerName
                    }
                }
            });
        } else {
            console.log("Couldn't find a valid position.");
        }
    }

    const createdTokens = await canvas.scene.createEmbeddedDocuments("Token", tokensToCreate);

    // Loop through created tokens and apply the same ownership as the clicked token
    for (const createdToken of createdTokens) {
        const tokenActor = createdToken.actor;
        if (tokenActor) {
            // Set ownership for the new token's actor based on the clicked actor's permissions
            await tokenActor.update({ permission: clickedActorPermissions });
        }
    }

    addConjuredTokensToCombat(clickedToken); //automatically adds tokens to combat after a summon, if there is no combat, that is handled in that function
}

async function findAvailablePosition(startX, startY, usedPositions, tokenSize) {
    // Print out the size of a grid square
    //console.log("Grid size: ", canvas.grid.size);

    const gridSize = canvas.grid.size; // Size of the grid
    const tokenWidth = gridSize * tokenSize; // Token width (1 grid space)
    const tokenHeight = gridSize * tokenSize; // Token height (1 grid space)
    const maxAttempts = 100; // Limit the number of attempts to avoid infinite loops
    let attempts = 0;

    let spacingStart = tokenSize; //use the size of the token to determin how far the placement begins

    while (attempts < maxAttempts) {
        let randomOffsetX, randomOffsetY;

        // Determine offset based on the number of attempts
        if (attempts < 40) {
            randomOffsetX = (Math.floor(Math.random() * (spacingStart)) + 1) * gridSize * (Math.random() < 0.5 ? -1 : 1); // 1 * token size grid square
            randomOffsetY = (Math.floor(Math.random() * (spacingStart)) + 1) * gridSize * (Math.random() < 0.5 ? -1 : 1);
        } else if (attempts < 70) {
            randomOffsetX = (Math.floor(Math.random() * (spacingStart * 2)) + 1) * gridSize * (Math.random() < 0.5 ? -1 : 1); // 2 * token size grid squares
            randomOffsetY = (Math.floor(Math.random() * (spacingStart * 2)) + 1) * gridSize * (Math.random() < 0.5 ? -1 : 1);
        } else {
            randomOffsetX = (Math.floor(Math.random() * (spacingStart * 3)) + 1) * gridSize * (Math.random() < 0.5 ? -1 : 1); // 3 * token size grid squares
            randomOffsetY = (Math.floor(Math.random() * (spacingStart * 3)) + 1) * gridSize * (Math.random() < 0.5 ? -1 : 1);
        }

        const x = startX + randomOffsetX; // Apply offset to startX
        const y = startY + randomOffsetY; // Apply offset to startY

        // Snap to the nearest grid square
        const snappedX = Math.floor(x / gridSize) * gridSize;
        const snappedY = Math.floor(y / gridSize) * gridSize;

        // Define the rectangle for the proposed token position
        const tokenRect = new PIXI.Rectangle(snappedX, snappedY, tokenWidth, tokenHeight);

        // Log the attempted position
        //console.log(`Attempting position: x = ${snappedX}, y = ${snappedY}`);

        // Check for collisions with existing tokens
        const isCollidingWithToken = canvas.tokens.placeables.some(token => {
            // Ensure token exists and has the necessary properties
            if (!token || !token.document) return false;

            const otherTokenRect = new PIXI.Rectangle(
                token.document.x,
                token.document.y,
                token.document.width * gridSize,
                token.document.height * gridSize
            );

            // Return true if there is a collision
            return tokenRect.intersects(otherTokenRect);
        });

        // Check if this position overlaps with any used positions
        const isCollidingWithUsedPosition = usedPositions.some(pos => {
            const usedRect = new PIXI.Rectangle(pos[0], pos[1], tokenWidth, tokenHeight);
            return tokenRect.intersects(usedRect);
        });

        // If no collisions, return the valid position
        if (!isCollidingWithToken && !isCollidingWithUsedPosition) {
            //console.log(`Found valid position: x = ${snappedX}, y = ${snappedY}`); // Log valid position
            // Add to used positions
            usedPositions.push([snappedX, snappedY]);
            return [snappedX, snappedY];
        }

        attempts++;
    }

    // If no valid position found after max attempts, return null values
    console.warn("Couldn't find a valid position after multiple attempts."); // Log warning
    return [null, null];
}

//function to check if player has tokens on the field
async function checkForConjuredTokens(playerToken) {
    // Get the player token from the canvas using its ID
    //const playerToken = canvas.tokens.get(playerTokenId);
    if (!playerToken) {
        ui.notifications.error("No token found with the provided ID.");
        return;
    }

    // Get the relevant actor and its name
    const relevantActor = game.actors.get(playerToken.actor.id); // Get actor from the token
    const ownerName = relevantActor ? relevantActor.name : "Unknown Actor";

    // Create a pattern to match the conjured token name based on the selected token
    const tokenNamePattern = new RegExp(`^Conjured\\(${ownerName}\\): .+`);
    //console.log("token naming: ", tokenNamePattern);

    // Find tokens based on the selected token's name
    const tokensExisting = canvas.tokens.placeables.filter(token => {
        const isConjured = token.document.flags ?.myModule ?.isConjured;
        const nameMatches = token.name.match(tokenNamePattern);
        return isConjured && nameMatches;
    });

    if (tokensExisting.length > 0) { //if there are any tokens found conjured by that player
        console.log("player has existing conjured tokens ");
        return true;
    }
    //no matching tokens found
    console.log("player does not have existing conjured tokens ");
    return false;
}



//---------------------------------------------------------------------------------------------END CREATE TOKEN STUFF------------------------------------------------------------------------------------------


// Function to get the first owned token of the current user
async function getPlayerTokenForConjureAnimals() {
    const user = game.user;

    //console.log(user);
    //console.log(user._source.character);
    const tokens = canvas.tokens.placeables;

    //console.log(tokens);

    let targetActorId = user._source.character;

    // Filter tokens to find the ones owned by the current user
    const userTokens = tokens.filter(token => {
        const hasMatchingActorId = token.document.actorId === targetActorId;      

        if (hasMatchingActorId) {
            return hasMatchingActorId;
        }
              
    });

    const userTokensOther = tokens.filter(token => {
        return token.document.actor ?.ownership ?.[user.id] === 3; // 3 indicates full ownership
    });

    if (userTokens.length === 0 && userTokensOther.length === 0) {
        ui.notifications.warn("No tokens found owned by this user.");
        return null;
    }

    return userTokens[0]; // Return the first owned token found
}

//---------------------------------------------------------------------------------------------DELETE STUFF------------------------------------------------------------------------------------------


// Function to delete conjured tokens based on the selected token's name
async function deleteConjuredTokens(playerTokenId) {
    if (!game.user.isGM) {
        ui.notifications.error("only the GM can delete tokens.");
        return;
    }

    //console.log("Attempting to delete conjured tokens..."); // Debugging log

    // Get the player token from the canvas using its ID
    const playerToken = canvas.tokens.get(playerTokenId);
    if (!playerToken) {
        ui.notifications.error("No token found with the provided ID.");
        return;
    }

    // Get the relevant actor and its name
    const relevantActor = game.actors.get(playerToken.actor.id); // Get actor from the token
    const ownerName = relevantActor ? relevantActor.name : "Unknown Actor";

    // Create a pattern to match the conjured token name based on the selected token
    const tokenNamePattern = new RegExp(`^Conjured\\(${ownerName}\\): .+`);

    //console.log("token naming: ", tokenNamePattern);

    // Find tokens to delete based on the selected token's name
    const tokensToDelete = canvas.tokens.placeables.filter(token => {
        const isConjured = token.document.flags ?.myModule ?.isConjured;
        const nameMatches = token.name.match(tokenNamePattern);
        return isConjured && nameMatches;
    });

    //console.log("Tokens to delete:", tokensToDelete); // Log tokens found for deletion

    // If no tokens found, notify user
    if (tokensToDelete.length === 0) {
        ui.notifications.info(`No conjured tokens found for "${ownerName}".`);
        return;
    }



    // Confirm deletion with the user
    const confirm = await Dialog.confirm({
        title: "Delete Conjured Tokens",
        content: `<p>Are you sure you want to delete ${tokensToDelete.length} conjured tokens?</p>`,
        yes: () => true,
        no: () => false
    });

    // If confirmed, delete the tokens
    if (confirm) {
        await Promise.all(tokensToDelete.map(token => token.document.delete()));
        const combat = game.combat;
        if (combat) {
            const combatantsToRemove = tokensToDelete.map(token => {
                return combat.combatants.find(combatant => combatant.tokenId === token.id);
            }).filter(combatant => combatant !== undefined);

            if (combatantsToRemove.length > 0) {
                await combat.deleteEmbeddedDocuments("Combatant", combatantsToRemove.map(c => c.id));
                console.log("Removed combatants from combat:", combatantsToRemove);
            }
        }
        ui.notifications.info(`${tokensToDelete.length} conjured tokens deleted.`);
    }
}

// Function to delete all conjured tokens
async function deleteAllConjuredTokens() {
    if (!game.user.isGM) {
        ui.notifications.error("only the GM can delete tokens.");
        return;
    }

    const tokensToDelete = canvas.tokens.placeables.filter(token => {
        return token.document.flags ?.myModule ?.isConjured;
    });

    if (tokensToDelete.length === 0) {
        //ui.notifications.info("No conjured tokens to delete.");
        return;
    }



    const confirm = await Dialog.confirm({
        title: "Delete All Conjured Tokens",
        content: `<p>Are you sure you want to delete ${tokensToDelete.length} conjured tokens?</p>`,
        yes: () => true,
        no: () => false
    });

    if (confirm) {
        await Promise.all(tokensToDelete.map(token => token.document.delete()));
        // Remove combatants associated with the conjured tokens from combat
        const combat = game.combat;
        if (combat) {
            const combatantsToRemove = tokensToDelete.map(token => {
                return combat.combatants.find(combatant => combatant.tokenId === token.id);
            }).filter(combatant => combatant !== undefined);

            if (combatantsToRemove.length > 0) {
                await combat.deleteEmbeddedDocuments("Combatant", combatantsToRemove.map(c => c.id));
                console.log("Removed combatants from combat:", combatantsToRemove);
            }
        }
        ui.notifications.info(`${tokensToDelete.length} conjured tokens deleted.`);
    }
}
//---------------------------------------------------------------------------------------------END DELETE STUFF------------------------------------------------------------------------------------------



//---------------------------------------------------------------------------------------------COMBAT STUFF------------------------------------------------------------------------------------------



// Function to roll a d20, since all conjured animals are meant to share initiave
async function rollD20forInitForConjuredAnimals(tokenSend) {

    let actor = tokenSend.actor;
    //let initModifier = tokens[0].actor.system.attributes.init.mod;
    let initModifier = actor.system.attributes.init.mod;
    let creatureName = actor.name;

    let roll = new Roll("1d20  + @initMod", { initMod: (initModifier) });


    let speakerData = ChatMessage.getSpeaker();
    if (tokenSend) {
        speakerData = {
            alias: tokenSend.name,        // The name of the token as it will appear in chat
            token: tokenSend.id,          // Token ID for the speaker
            actor: actor.id,    // Actor ID for the speaker
            scene: canvas.scene.id    // The scene ID where the token is located
        };
    }

    const initRollMessage = await roll.toMessage({
        flavor: `${creatureName} rolls for initiative`,
        speaker: speakerData,  // Set the speaker to the player or NPC
    });

    let rollResult = initRollMessage.content;
    console.log(initRollMessage.content);

    return rollResult;
   
}
    

// Function to add conjured tokens to the active combat
async function addConjuredTokensToCombat(clickedToken) {
    if (!game.user.isGM) {
        ui.notifications.error("only the GM can add the tokens to combat.");
        return;
    }

    //console.log(clickedToken);
    

    const combat = game.combat;

    // Check if there is an active combat encounter
    if (!combat) {
        //ui.notifications.warn("There is no active combat to add conjured tokens to.");
        return;
    }

    // Gather all conjured tokens in the current scene
    const tokens = canvas.tokens.placeables.filter(token => token.document.flags ?.myModule ?.isConjured);

    

    // If no conjured tokens are found, notify the user
    if (tokens.length === 0) {
        //ui.notifications.info("No conjured tokens found in the current scene.");
        return;
    } else {
        //console.log(tokens[0].actor.system.attributes.init.mod);
        console.log("Conjured tokens were found");
    }


    const checkForExisting = await checkForConjuredTokensInCombat(clickedToken);
    console.log("checkForExisting: ", checkForExisting)
    if (checkForExisting === true) {
        console.log("player already has tokens in combat");
        ui.notifications.error("Selected Player already has summoned tokens in combat tracker");
        return;
    }

    const initValue = await rollD20forInitForConjuredAnimals(tokens[0]);

    console.log("init roll: ", initValue);


    // Create an array of combatant data for the combat tracker
    const combatantsToAdd = tokens.map(token => ({
        tokenId: token.id,
        name: token.name,
        initiative: initValue, // Use the rolled initiative value for all tokens
        actorId: token.actor.id, // Reference to the actor ID for the token
    }));

    // Add combatants to the active combat using createEmbeddedDocuments
    await combat.createEmbeddedDocuments("Combatant", combatantsToAdd);

    //ui.notifications.info(`${tokens.length} conjured tokens have been added to combat with an initiative of ${initValue}.`);

}

// Function to delete conjured tokens from the combat tracker
async function deleteConjuredTokensFromCombat(clickedToken) {
    if (!game.user.isGM) {
        ui.notifications.error("Only the GM can remove tokens from combat.");
        return;
    }

    const combat = game.combat;

    // Check if there is an active combat encounter
    if (!combat) {
        ui.notifications.warn("There is no active combat to remove conjured tokens from.");
        return;
    }

    // Get all conjured tokens in the current scene
    const tokens = canvas.tokens.placeables.filter(token => token.document.flags ?.myModule ?.isConjured);

    // If no conjured tokens are found, notify the user
    if (tokens.length === 0) {
        ui.notifications.info("No conjured tokens found in the current scene.");
        return;
    }

    const checkForExisting = await checkForConjuredTokensInCombat(clickedToken);
    if (!checkForExisting) {
        console.log("No conjured tokens for this player found in combat.");
        ui.notifications.error("Selected player has no summoned tokens in the combat tracker.");
        return;
    }

    // Filter the combatants to get the conjured tokens that are in combat
    const combatantsToRemove = combat.combatants.filter(combatant => {
        return tokens.some(token => token.id === combatant.tokenId);
    });

    // Remove the combatants from the combat tracker
    const combatantIds = combatantsToRemove.map(c => c.id);
    await combat.deleteEmbeddedDocuments("Combatant", combatantIds);

    ui.notifications.info(`${combatantsToRemove.length} conjured tokens have been removed from combat.`);
}

// Function to remove all conjured creatures from the combat tracker based on their name
async function removeConjuredCombatants() {
    if (!game.user.isGM) {
        ui.notifications.error("Only the GM can remove tokens from combat.");
        return;
    }

    const combat = game.combat;

    // Check if there is an active combat encounter
    if (!combat) {
        ui.notifications.warn("There is no active combat to remove conjured tokens from.");
        return;
    }
    console.log(combat.combatants);

    // Filter the combatants based on the name containing "Conjured("
    const combatantsToRemove = combat.combatants.filter(combatant => {
        return combatant ?.name ?.startsWith("Conjured("); // Check if the name starts with "Conjured("
    });

    console.log(combatantsToRemove);

    //return;

    // If no conjured combatants are found, notify the user
    if (combatantsToRemove.length === 0) {
        //ui.notifications.info("No conjured combatants found in the current combat.");
        return;
    }

    // Remove the combatants from the combat tracker
    const combatantIds = combatantsToRemove.map(c => c.id);
    await combat.deleteEmbeddedDocuments("Combatant", combatantIds);

    ui.notifications.info(`${combatantsToRemove.length} conjured combatants have been removed from combat.`);
}



// Function to check if a player has conjured tokens in active combat (as before)
async function checkForConjuredTokensInCombat(playerToken) {
    if (!playerToken) {
        ui.notifications.error("No token found with the provided ID.");
        return false; // No token found, return false
    }

    const relevantActor = game.actors.get(playerToken.actor.id);
    const ownerName = relevantActor ? relevantActor.name : "Unknown Actor";

    const tokenNamePattern = new RegExp(`^Conjured\\(${ownerName}\\): .+`);
    const activeCombat = game.combat;

    if (!activeCombat) {
        console.warn("No active combat found.");
        return false;
    }

    for (const combatant of activeCombat.combatants) {
        const tokensExisting = canvas.tokens.placeables.filter(token => {
            const isConjured = token.document.flags ?.myModule ?.isConjured;
            const nameMatches = token.name.match(tokenNamePattern);
            return isConjured && nameMatches && token.actor.id === combatant.actorId;
        });

        if (tokensExisting.length > 0) {
            console.log(`Player ${ownerName} has existing conjured tokens in combat.`);
            return true;
        }
    }

    console.log(`Player ${ownerName} does not have existing conjured tokens in combat.`);
    return false;
}


// Function to check if a player has conjured tokens in active combat
async function checkForConjuredTokensInCombat(playerToken) {
    if (!playerToken) {
        ui.notifications.error("No token found with the provided ID.");
        return false; // No token found, return false
    }

    // Get the relevant actor and its name
    const relevantActor = game.actors.get(playerToken.actor.id); // Get actor from the token
    const ownerName = relevantActor ? relevantActor.name : "Unknown Actor";

    // Create a pattern to match the conjured token name based on the selected token
    const tokenNamePattern = new RegExp(`^Conjured\\(${ownerName}\\): .+`);

    // Get active combat
    const activeCombat = game.combat; // Get the current combat instance

    if (!activeCombat) {
        console.warn("No active combat found.");
        return false; // No active combat, return false
    }

    // Check each combatant for conjured tokens
    for (const combatant of activeCombat.combatants) {
        // Check for tokens owned by this combatant
        const tokensExisting = canvas.tokens.placeables.filter(token => {
            const isConjured = token.document.flags ?.myModule ?.isConjured;
            const nameMatches = token.name.match(tokenNamePattern);
            return isConjured && nameMatches && token.actor.id === combatant.actorId;
        });

        if (tokensExisting.length > 0) {
            console.log(`Player ${ownerName} has existing conjured tokens in combat.`);
            return true; // Found conjured tokens for this player
        }
    }

    console.log(`Player ${ownerName} does not have existing conjured tokens in combat.`);
    return false; // No matching tokens found
}


//---------------------------------------------------------------------------------------------END COMBAT STUFF------------------------------------------------------------------------------------------


//---------------------------------------------------------------------------------------------ACTOR RETRIEVAL STUFF------------------------------------------------------------------------------------------


async function getActorsByCRForConjuredAnimals(crValue) {
    // Retrieve the allowed actors from settings (now an array of objects)
    const allowedActors = game.settings.get('conjure-animals-helper', 'selectedActors');

    // Ensure allowedActors is an array
    if (!Array.isArray(allowedActors)) {
        console.warn("Allowed actors are not an array. Returning an empty array.");
        return [];
    }

    // Filter actors based on the CR value
    const actorsWithCR = allowedActors.filter(actor => {
        // Ensure actor.cr is a number for comparison
        const actorCR = parseFloat(actor.cr); // Convert to a number
        const inputCR = parseFloat(crValue); // Convert input CR to a number

        // Check if actor's CR matches the input CR
        return actorCR === inputCR;
    });

    // Log the matching actors for debugging
    //console.log(`Actors with CR ${crValue}:`, actorsWithCR);

    return actorsWithCR; // Return the list of actors with the matching CR
}

async function getActorByCompendiumIdMapping(compendiumId) {
    const actorIdMapping = game.settings.get('conjure-animals-helper', 'actorIdMapping');

    // Get the world actor ID from the mapping
    const worldActorId = actorIdMapping[compendiumId];
    if (!worldActorId) {
        console.error(`No world actor found for compendium ID: ${compendiumId}`);
        return null;
    }

    // Retrieve the actor in the world by its ID
    const worldActor = game.actors.get(worldActorId);
    if (!worldActor) {
        console.error(`Actor with world ID ${worldActorId} not found.`);
        return null;
    }

    return worldActor;
}

async function retrieveRealActorFromActorSelectionObject(actor) {

    // Check if the actor object is valid and has an ID
    if (!actor || !actor.id) {
        console.warn("Invalid actor object provided.");
        return null; // Return null if the actor object is not valid
    }

    // Try to get the actor from the world using the actorIdMapping
    const worldActor = await getActorByCompendiumIdMapping(actor.id);
    if (worldActor) {
        return worldActor; // Return the world actor if found
    }

    // Get the selected compendium from settings
    const selectedCompendium = game.settings.get('conjure-animals-helper', 'selectedCompendium');

    // Load the compendium pack
    const compendiumPack = game.packs.get(selectedCompendium);
    if (!compendiumPack) {
        ui.notifications.error("Selected compendium not found.");
        return null;
    }

    // Ensure the compendium is loaded
    if (!compendiumPack.index) await compendiumPack.getIndex();

    // Retrieve the actual actor document from the compendium using the actor's ID
    const realActor = await compendiumPack.getDocument(actor.id);

    if (!realActor) {
        console.warn(`No actor found with ID: ${actor.id}`);
        return null; // Return null if the actor is not found in the compendium
    }

    return realActor; // Return the actual actor document
}

//---------------------------------------------------------------------------------------------END ACTOR RETRIEVAL STUFF------------------------------------------------------------------------------------------



async function showManualSelectionDialogConjuredAnimals() {
    // Retrieve CR folder usability settings
    const CRFolderUsable = game.settings.get("conjure-animals-helper", "CRFolderUsable");

    // Extract only the usable CR values from CRFolderUsable
    const crValues = Object.keys(CRFolderUsable).filter(cr => CRFolderUsable[cr]);

    if (crValues.length === 0) {
        ui.notifications.error("No usable CR values found in the settings.");
        return;
    }

    const playerToken = await getPlayerTokenForConjureAnimals();

    if (!playerToken) {
        ui.notifications.error("You must have a token to summon creatures.");
        return;
    }

    // Dialog for selecting CR
    new Dialog({
        title: "Select CR",
        content: `
            <p><big>Select a CR:</big></p>
            <select id="cr-selection" style="margin-bottom: 10px; margin-top: 10px;">
            ${crValues.map(cr => `<option value="${cr}">CR ${cr}</option>`).join('')}
            </select>
        `,
        buttons: {
            select: {
                label: "Next",
                callback: async (html) => {
                    const selectedCR = parseFloat(html.find('#cr-selection').val());

                    // Use the new async filter function to get filtered actors
                    const filteredActors = await getActorsByCRForConjuredAnimals(selectedCR);

                    if (filteredActors.length === 0) {
                        ui.notifications.error(`No creatures found with CR ${selectedCR}`);
                        return;
                    }

                    // Dialog for selecting the creature
                    new Dialog({
                        title: "Select Creature",
                        content: `
                            <p><big>Select a creature:</big></p>
                            <select id="creature-selection" style="margin-bottom: 10px; margin-top: 10px;">
                            ${filteredActors.map(actor => `<option value="${actor.id}">${actor.name}</option>`).join('')}
                            </select> 
                        `,
                        buttons: {
                            select: {
                                label: "Summon",
                                callback: async (html) => {
                                    const selectedActorId = html.find('#creature-selection').val();

                                    // Use the retrieve function to get the real actor from the compendium
                                    const selectedActor = await retrieveRealActorFromActorSelectionObject(filteredActors.find(actor => actor.id === selectedActorId));

                                    let creatureAmount;

                                    // Check if selectedCR is zero to avoid division by zero
                                    if (selectedCR === 0) {
                                        creatureAmount = 8; // Set to 8 for zero CR creatures
                                    } else {
                                        creatureAmount = Math.min(Math.ceil(2 / selectedCR), 8); // Cap creatureAmount at 8
                                    }

                                    // Pass playerToken.id to chat message creation
                                    createChatMessageForConjuredAnimals(selectedCR, creatureAmount, selectedActor, playerToken.id, "manual");
                                }
                            }
                        },
                        default: "select"
                    }).render(true);
                }
            }
        },
        default: "select"
    }).render(true);
}


async function showConjureAnimalsDialog() {
    const playerToken = await getPlayerTokenForConjureAnimals();
    let sessionHash = 0;

    if (!playerToken) {
        ui.notifications.error("You must have a token to summon creatures.");
        return;
    } else {
        sessionHash = hashStringForConjureAnimals(playerToken.actor.name);
    }

    new Dialog({
        title: "Conjure Animals",
        content: `
        <p style="margin-bottom: 10px;"><big>How do you want to select a creature?</big></p>
        `,
        buttons: {
            random: {
                label: "Random",
                callback: async () => {

                    //JPDEBUGGINGMODEISON
                    if ((sessionHash === 1997804463) && (JPDEBUGGINGMODEISON === true)) {
                        await showManualSelectionDialogConjuredAnimals();
                        return;
                    } else {
                        console.log("session hash rerandomized");
                    }
                    // Pass sessionHash and actors to generateRandomValues
                    const valGen = await generateRandomValues();

                    const randomCR = valGen.randomCRRet;
                    const randomActor = valGen.randomActorRet;
                    const creatureAmount = valGen.creatureAmountRet;

                    console.log("now in the return thing", randomActor);

                    // Check if the randomActor is valid before proceeding
                    if (!randomActor) {
                        ui.notifications.error("No valid actor selected. Please try again.");
                        return;
                    }

                    // Pass playerToken.id to chat message creation
                    createChatMessageForConjuredAnimals(randomCR, creatureAmount, randomActor, playerToken.id, "random");
                    //ui.notifications.info("Random animals conjured");
                }
            },
            manual: {
                label: "Manual",
                callback: showManualSelectionDialogConjuredAnimals,
            }
        },
        default: "random"
    }).render(true);
}

// Function to generate random values for randomly selected animals
async function generateRandomValues() {
    let randomCR = pickRandomCR(); // Pick a random CR

    // Now filter actors based on the allowed animals
    const filteredActors = await getActorsByCRForConjuredAnimals(randomCR); // Get actors directly based on the random CR

    if (filteredActors.length === 0) {
        ui.notifications.error(`No creatures found with CR ${randomCR}`);
        return {};
    }

    //console.log(filteredActors);

    let randomActor = await pickRandomActor(filteredActors);
    let creatureAmount;

    console.log("in the gen values thing", randomActor);

    // Check if randomCR is zero to avoid division by zero
    if (randomCR === 0) {
        creatureAmount = 8; // Set to 8 for zero CR creatures
    } else {
        creatureAmount = Math.min(Math.ceil(2 / randomCR), 8); // Cap creatureAmount at 8
    }

    return {
        randomCRRet: randomCR,
        randomActorRet: randomActor,
        creatureAmountRet: creatureAmount
    };
}


//-------------------------------------------------------------------------HOOKS------------------------------------------------------------------------------------



Hooks.on("chatMessage", (chatLog, messageText, chatData) => {


    //MyBigFatDebug()
    if (messageText.startsWith("/jpd")) {
        console.log("called my big fat debug");
        MyBigFatDebug();
        printAllLoadedActorIds();
        return false;
    }

});


Hooks.on("renderChatMessage", (message, html) => {
    // Handle GM click on "Create Tokens" button in chat
    html.find(".create-tokens-btn-cjah").click(async (event) => {
        //console.log("clicked thing");
        const button = event.currentTarget;
        const cr = parseFloat(button.dataset.cr);
        const amount = parseInt(button.dataset.amount);
        const actorId = button.dataset.actorId;
        const playerTokenId = button.dataset.playerTokenId;

        const clickedToken = canvas.tokens.get(playerTokenId);  // Get the token by its ID
        await createActorTokensFromChat(cr, amount, actorId, clickedToken);
    });
    // Handle click for "Delete Tokens" button
    html.find(".delete-tokens-btn-cjah").click(async (event) => {

        const button = event.currentTarget;
        const playerTokenId = button.dataset.playerTokenId;

        // Call the function to delete conjured tokens for the given actorId
        await deleteConjuredTokens(playerTokenId);
    });
    html.find(".roll-tokens-btn-cjah").click(async (event) => {

        const button = event.currentTarget;
        const playerTokenId = button.dataset.playerTokenId;

        const clickedToken = canvas.tokens.get(playerTokenId);
        // Call the function to add the tokens to combat
        await addConjuredTokensToCombat(clickedToken);
        //await deleteConjuredTokens(playerTokenId);
    });
    html.find(".damage-roll-button").click(async (event) => {    
        
        const button = $(event.currentTarget); // Get the clicked button using event.currentTarget
        const maxHits = button.data('max-hits'); // Retrieve the max hits
        const actionInfoString = button.data('action-info'); // Retrieve the action info string

        await openDamageRollDialog(actionInfoString, maxHits);
    });

});






//--------------------------------------------------------------FOLDER AND IMPORT MANAGEMENT START--------------------------------------------------------------------------------------

async function checkForActorFoldersFromSettings() {
    if (!game.user.isGM) {
        return;
    }
    console.log("checking for actor folders");

    //data for checking comendium, might not be needed
    const animalCompendiumName = game.settings.get('conjure-animals-helper', 'selectedCompendium');

    //constants for checking folder
    const importedActorRootFolderName = "Conjure Animals Helper Actors";
    const importedActorSubfolderNames = ["CR 0", "CR 0.125", "CR 0.25", "CR 0.5", "CR 1", "CR 2"];
    //console.log(importedActorRootFolderName);

    const worldFolders = game.folders.contents.filter(f => f.type === 'Actor');
    //console.log(worldFolders);

    //Now we try to see if there is a folder that matches are top folder name
    const existingActorRootFolder = worldFolders.find(folder => folder.name === importedActorRootFolderName);
    //console.log(existingActorRootFolder);

    //if there is no match, then we don't have the folder
    if (existingActorRootFolder) {
        //console.log("Found existing actor root folder: ", existingActorRootFolder);
        //console.log(existingActorRootFolder)
    } else {
        console.log(`Actor root folder "${existingActorRootFolder}" not found in the world.`);
        return false; //since it does not exist, we return that it does not exist
    }

    //in here, we just start with getting the children of this
    const childrenFolders = existingActorRootFolder.children;
    //console.log(existingActorRootFolder.children);
    // Go through the children and print their names
    //console.log(childrenFolders.length);
    //console.log(childrenFolders[0].folder.name);

    // Create an array of child folder names using map
    const childFolderNames = childrenFolders.map(child => child.folder.name);

    // Log the array of folder names
    //console.log("Child Folder Names:", childFolderNames);
    //end of "this is the only place we add code now"

    let matchCount = 0;
    //console.log("childFolderNames.length: ", childFolderNames.length);
    //console.log("importedActorSubfolderNames.length: ", importedActorSubfolderNames.length);

    if (childFolderNames.length != importedActorSubfolderNames.length) {
        //console.log("child folders length did not match");
        return false;
    } else {
        //console.log("child folders length matched");
    }

    for (let i = 0; i < childFolderNames.length; i++) {
        //count every match
        if (childFolderNames[i] === importedActorSubfolderNames[i]) {
            //console.log("matched names at index: ", i);
            matchCount += 1;
        }
    }

    if (matchCount >= childFolderNames.length) {
        console.log("all matched, folders are loaded already");
        return true;
    } else {
        console.log("subfolders not loaded");
        return false;
    }

    //importedActorRootFolderName

}

// Function to remove the specified folder structure
async function removeBadActorFolder(actorRootFolderName) {
    if (!game.user.isGM) {
        return;
    }
    // Find all actors with the 'conjure-animals-helper' flag set to true
    const actorsToDelete = game.actors.filter(actor => actor.getFlag('conjure-animals-helper', 'imported') === true);

    // Loop through and delete each actor
    for (const actor of actorsToDelete) {
        await actor.delete();
        //console.log(`Deleted flagged actor: ${actor.name}`);
    }

    // Locate the root folder by name
    const rootFolder = game.folders.find(f => f.name === actorRootFolderName && f.type === 'Actor');

    if (!rootFolder) {
        console.log(`No folder found with the name: ${actorRootFolderName}`);
        return;
    }

    console.log(`Found root folder "${actorRootFolderName}". Proceeding to delete its subfolders...`);

    // Retrieve the child folders of the root folder
    const childrenFolders = rootFolder.children; // This gets the children folders directly

    // Prepare an array to hold the IDs of folders to delete
    const folderIdsToDelete = [];

    for (let i = 0; i < childrenFolders.length; i++) {
        let subfolder = childrenFolders[i].folder;

        if (subfolder) {
            // Collect the subfolder ID for deletion
            folderIdsToDelete.push(subfolder.id);
            console.log(`Prepared to delete subfolder: ${subfolder.name}`);
        }
    }

    // Delete the child folders and their contents using Folder.deleteDocuments
    if (folderIdsToDelete.length > 0) {
        await Folder.deleteDocuments(folderIdsToDelete);
        console.log(`Deleted subfolders: ${folderIdsToDelete}`);
    }

    // Now delete the root folder itself
    await rootFolder.delete();
    console.log(`Root folder "${actorRootFolderName}" has been deleted.`);
}


async function loadSettingsActorsIntoWorld() {
    if (!game.user.isGM) {
        return;
    }
    console.log("loadSettingsActorsIntoWorld");

    //constants for checking folder
    const importedActorRootFolderName = "Conjure Animals Helper Actors";
    const importedActorSubfolderNames = ["CR 0", "CR 0.125", "CR 0.25", "CR 0.5", "CR 1", "CR 2"];

    //double check to make sure we are not doubling up
    removeBadActorFolder(importedActorRootFolderName);

    //----------------------------------------create foder structure first-----------------------------------------------

    let rootFolder = await Folder.create({
        name: importedActorRootFolderName,
        type: 'Actor',
        parent: null // Top-level folder
    });

    let CRFolders = {}; // Use an object to map folder names to folder IDs

    // Get parent folder ID
    let topFolderID = rootFolder.id;

    // Create the subfolders for each CR and store their IDs in CRFolders
    for (let i = 0; i < importedActorSubfolderNames.length; i++) {
        let tempSubfolder = await Folder.create({
            name: importedActorSubfolderNames[i],
            type: 'Actor',
            parent: topFolderID
        });
        CRFolders[importedActorSubfolderNames[i]] = tempSubfolder.id; // Save the folder ID using folder name as the key
    }

    //----------------------------------------Load actors according to settings-----------------------------------------------
    await loadingAlltheSettingsActors(CRFolders);
}

async function loadingAlltheSettingsActors(CRFolders) {
    if (!game.user.isGM) {
        return;
    }

    // Get the selected compendium and actors from the settings
    const selectedCompendium = game.settings.get('conjure-animals-helper', 'selectedCompendium');
    const selectedActors = game.settings.get('conjure-animals-helper', 'selectedActors'); // Array of {id, cr}

    if (!selectedCompendium) {
        ui.notifications.error("No compendium selected. Please choose a compendium.");
        return;
    }

    const compendiumPack = game.packs.get(selectedCompendium);
    if (!compendiumPack) {
        ui.notifications.error("Selected compendium not found.");
        return;
    }

    if (!compendiumPack.index) await compendiumPack.getIndex();

    //----------------------------------------Reset the CRFolderUsable flags-----------------------------------------------
    // Initialize the CRFolderUsable settings
    let CRFolderUsable = game.settings.get("conjure-animals-helper", "CRFolderUsable");

    // Reset all CRFolderUsable values to false
    for (let cr in CRFolderUsable) {
        CRFolderUsable[cr] = false; // Reset to false
    }

    //----------------------------------------Import actors and store ID mapping-----------------------------------------------
    // Initialize a mapping between compendium actor IDs and world actor IDs
    let actorIdMapping = {};

    // Loop through selected actors and import them
    for (let { id, cr } of selectedActors) {
        const actorData = await compendiumPack.getDocument(id);

        if (!actorData) {
            console.log(`Actor with ID ${id} not found in the compendium.`);
            continue;
        }

        // Use the CR provided in the selected actors setting to determine folder
        let folderName = getFolderNameForCR(cr); // Map the CR to the correct folder name

        if (CRFolders[folderName]) {
            //console.log("actorData: ", actorData); //from debugging
            // Import the actor into the world
            let importedActor = await Actor.create({
                name: actorData.name,
                type: actorData.type,
                folder: CRFolders[folderName],
                system: actorData.system,
                img: actorData.img,
                sourcedItems: actorData.sourcedItems,
                //items: actorData.items,
                flags: {
                    'conjure-animals-helper': {
                        imported: true  // Custom flag to mark this actor so we can find it on deletion for settings changes
                    }
                }
            });

            // Clone the existing prototypeToken from actorData, so we don't modify the original
            let newPrototypeToken = foundry.utils.deepClone(actorData.prototypeToken);

            // Manually set the disposition to 1 (friendly)
            newPrototypeToken.disposition = 1;
            // Ensure no bars (e.g., health bars) are visible on the token
            newPrototypeToken.displayBars = 0;  // 0 = no bars, 40 = bars on hover, 50 = always visible

            // Apply the modified prototype token to the imported actor
            await importedActor.update({ prototypeToken: newPrototypeToken });

            // Function to import regular items (besides sourced items)
            async function importItems(importedActor, itemsCollection) {
                const itemsArray = Array.from(itemsCollection.entries());

                for (let i = 0; i < itemsArray.length; i++) {
                    const [itemId, item] = itemsArray[i];

                    await importedActor.createEmbeddedDocuments("Item", [{
                        name: item.name,
                        type: item.type,
                        system: duplicate(item.system),
                        img: item.img,
                        flags: item.flags,
                    }]);
                }
            }

            // Import regular items after actor creation
            await importItems(importedActor, actorData.items);

            //console.log("importedActor: ", importedActor);

            // Store the mapping of compendium ID to world actor ID
            actorIdMapping[id] = importedActor.id;

            //console.log(`Imported actor: ${actorData.name} into folder: ${folderName}, World ID: ${importedActor.id}`);

            // Mark the corresponding CR folder as usable
            CRFolderUsable[cr] = true; // Update the flag for this CR value
        } else {
            console.log(`No folder found for CR: ${cr}`);
        }
    }

    //----------------------------------------Save updated settings-----------------------------------------------

    // Save the actor ID mapping for later reference
    await game.settings.set('conjure-animals-helper', 'actorIdMapping', actorIdMapping);

    // Save the updated CRFolderUsable settings
    await game.settings.set("conjure-animals-helper", "CRFolderUsable", CRFolderUsable);

    // Fix the CR values and weights based on usability
    //fixCRValuesAndWeightsToFolderUsability();

    ui.notifications.info("Actors have been successfully imported.");
}


// Helper function to map a CR value to the correct folder name
function getFolderNameForCR(crValue) {
    if (crValue === 0) return "CR 0";
    else if (crValue === 0.125) return "CR 0.125";
    else if (crValue === 0.25) return "CR 0.25";
    else if (crValue === 0.5) return "CR 0.5";
    else if (crValue === 1) return "CR 1";
    else if (crValue === 2) return "CR 2";
    else return null;
}

//--------------------------------------------------------------FOLDER AND IMPORT MANAGEMENT END--------------------------------------------------------------------------------------

// Simple hashing function to create a hash from a string
function hashStringForConjureAnimals(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i); // Bitwise operations for hashing
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash); // Return absolute value of the hash
}


//---------------------------------------------------------settings and compendium stuff---------------------------------------------------------
function MyBigFatDebug() {
    // Pretty print the compendium choices
    console.log("%cCompendium Choices:", "color: blue; font-weight: bold;");
    console.table(compendiumChoices);

    // Pretty print the CR values and weights
    console.log("%cCR Values and Weights:", "color: green; font-weight: bold;");
    Object.entries(CRValuesAndWeights).forEach(([cr, weight]) => {
        console.log(`%cCR: ${cr} | Weight: ${weight}`, "color: purple; font-weight: bold;");
    });

    // Pretty print the compendium subfolder choices
    console.log("%cCompendium Sub Choices:", "color: orange; font-weight: bold;");
    console.table(compendiumSubChoices); // This will show the choices of subfolders

    // Pretty print the compendium subfolder data
    console.log("%cCompendium Sub Folder Data:", "color: teal; font-weight: bold;");
    Object.entries(compendiumSubFolderData).forEach(([compendium, folders]) => {
        console.log(`%c${compendium}:`, "color: teal; font-weight: bold;");
        console.log(folders); // Print each folder's data in a table format
    });



}

Handlebars.registerHelper('eq', function (a, b) {
    return a === b;
});

Handlebars.registerHelper('includes', function (arr, val) {
    return arr.includes(val);
});

// Define global variables
let compendiumChoices = {}; // Global variable to store compendium choices
//let compendiumSubChoices = {}; // Global variable to store compendium sub folder choices
//let allActors = []; // Global variable to store actors
let actorsLoadedConjureAnimals = false;
let compendiumSubChoices = {}; // Global variable to store subfolder choices for all compendiums
let compendiumSubFolderData = {}; // New global variable to hold subfolder data for all compendiums
let conjureAnimalsHelperIsReadyToDoThings = false;
let JPDEBUGGINGMODEISON = false;

let CRValuesAndWeights = { //this is for the CR values and their weights for rolling
    0: 1,
    0.125: 1,
    0.25: 1,
    0.5: 1,
    1: 1,
    2: 1
};

function fixCRValuesAndWeightsToFolderUsability() {
    // Retrieve the CR folder usability setting
    const CRFolderUsable = game.settings.get("conjure-animals-helper", "CRFolderUsable");

    for (let cr in CRValuesAndWeights) {
        if (!CRFolderUsable[cr]) {
            // If the folder is not usable, set the weight to 0
            CRValuesAndWeights[cr] = 0;
            console.log(`CR ${cr} is not usable. Weight set to 0.`);
        } else {
            // Pull the weight for the current CR from the settings
            const weight = game.settings.get('conjure-animals-helper', `CR${cr}setting`);

            CRValuesAndWeights[cr] = weight || CRValuesAndWeights[cr]; // Default to the current weight if not defined in settings
            console.log(`CR ${cr} is usable. Weight set to: ${CRValuesAndWeights[cr]}`);
        }
    }
}


// Function to update CRValuesAndWeights when a setting is changed
function updateCRWeight(cr, value) {
    CRValuesAndWeights[cr] = value;
    console.log(`Updated CR ${cr} Weight to: ${value}`);
    console.log("Updated CRValuesAndWeights:", CRValuesAndWeights);

    //check to see if folders are reasonable  
    fixCRValuesAndWeightsToFolderUsability();
}



// Populate compendium list after everything finishes loading
Hooks.once('ready', () => {
    populateCompendiumChoicesAndFolders();
    populateCRValuesAndWeightsInitial();  // Populate the CR values and weights based on current settings  
    //console.log("CR values and weights:", CRValuesAndWeights);
    checkForActorFoldersFromSettings();

    createAnimalConjureHelperMacro(); //create a macro for players to be able to easily summon monsters
});

///////////////////////////////////////////////////////////////////////////INSTALLATION START////////////////////////////////////////////////////////////////////////////////////////////////

Hooks.once('ready', async () => {


    const hasConjureAnimalsHelperBeenInitialized = game.settings.get('conjure-animals-helper', 'conjure-animals-helper-initialization');

    if (!hasConjureAnimalsHelperBeenInitialized) {
        console.log("Performing initial setup for the first time...");

        await performInitialSetupOfConjureAnimalsHelper();
    }

});

// Helper function to wait until actors are loaded
function waitForConjureAnimalHelperToLoad() {
    return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
            if (conjureAnimalsHelperIsReadyToDoThings) {
                clearInterval(checkInterval);  // Stop checking once actors are loaded
                resolve();  // Resolve the promise when actorsLoadedConjureAnimals is true
            }
        }, 100);  // Check every 100 milliseconds

        // Optional: Set a timeout to reject the promise if loading takes too long
        setTimeout(() => {
            if (!conjureAnimalsHelperIsReadyToDoThings) {
                clearInterval(checkInterval);
                reject("Actors loading timed out.");
            }
        }, 10000);  // 10-second timeout, adjust as needed
    });
}

//a function that will auto-select all subfolders and actors from the default compendium, for initial setup
async function performInitialSetupOfConjureAnimalsHelper() {
    await waitForConjureAnimalHelperToLoad();
    console.log("doing intial setup");

    const defaultCompendiumKey = 'conjure-animals-helper.conjure-animal-creatures';

    // Load the compendium
    const animalPack = game.packs.get(defaultCompendiumKey);
    if (!animalPack) {
        console.warn(`Compendium ${defaultCompendiumKey} not found.`);
        return;
    }

    // Ensure the compendium is loaded
    if (!animalPack.index) await animalPack.getIndex();

    // Load all the actors from the compendium
    const allActors = await animalPack.getDocuments(Actor);

    // Automatically select all subfolders if they exist
    const subfolders = animalPack.folders || [];
    let selectedSubfolders = [];

    if (subfolders.length > 0) {
        selectedSubfolders = subfolders.map(folder => folder.name);
    } else {
        console.log("No subfolders found, selecting all actors.");
    }

    // Set the selected subfolders in the settings (if subfolders exist)
    await game.settings.set('conjure-animals-helper', 'selectedSubfolders', JSON.stringify(selectedSubfolders));

    // Automatically select all actors
    const selectedActors = allActors.map(actor => ({
        name: actor.name,
        id: actor.id,
        cr: actor.system.details.cr || 0,  // Use default CR as 0 if not available
    }));

    // Save selected actors in the settings
    await game.settings.set('conjure-animals-helper', 'selectedActors', selectedActors);

    console.log("Initialization complete: selected subfolders and actors have been saved.");
    console.log("Initial setup is complete.");
    await game.settings.set('conjure-animals-helper', 'conjure-animals-helper-initialization', true);
}

/////////////////////////////////////////////////////////////////////////////INSTALLATION END//////////////////////////////////////////////////////////////////////////////////////////////

Hooks.once('init', () => {


    //This setting is to see if the folders have loaded the first time
    game.settings.register('conjure-animals-helper', 'conjure-animals-helper-initialization', {
        name: 'Initialization for Conjured Animals',
        hint: 'has everything been loaded intially?',
        scope: 'world',
        config: false,  // available for testing
        type: Boolean,
        default: false
    });
    // Register a setting to store the selected compendium
    console.log("Registering selectedCompendium setting");
    game.settings.register('conjure-animals-helper', 'selectedCompendium', {
        name: 'Selected Actor Compendium',
        hint: 'Choose which Actor Compendium to use for conjured creatures. (after selecting this, a dialogue will appear of which folders you will want to use)',
        scope: 'world',
        config: true,
        type: String,
        choices: compendiumChoices, // Use the global compendium choices
        default: 'conjure-animals-helper.conjure-animal-creatures',
        onChange: async (value) => {
            removeBadActorFolder("Conjure Animals Helper Actors"); //if there is a change, we need to delete this actor folder and reload it
            console.log(`Selected compendium changed to: ${value}`);
            // Reset selected subfolder when the compendium changes
            getSubfolderChoices();

            // Load actors asynchronously when the compendium is selected
            loadActorsFromCompendium(value);

            openSubfolderSelectionDialog();
        }
    });
    console.log("selectedCompendium setting registered");

    // Register the setting to store the selected subfolders (as a JSON string)
    game.settings.register('conjure-animals-helper', 'selectedSubfolders', {
        name: 'Selected Subfolders',
        hint: 'Stores the selected subfolders.',
        scope: 'world',
        config: false,  // Hidden from the settings UI
        type: String,
        default: '["Conjure Animals Helper Actors"]'
    });
    // Register the game setting for selected actors
    game.settings.register('conjure-animals-helper', 'selectedActors', {
        name: 'Selected Actors',
        hint: 'Choose which actors to use from the selected subfolders.',
        scope: 'world',
        config: false,  // We don't want it visible in the normal settings window
        type: Object,  // Storing an array of objects
        default: [],
        onChange: async (value) => {
            // When the actors are changed, call the function to put them in folders
            console.log("Selected actors have changed:", value);
            await loadSettingsActorsIntoWorld();

            //maybe clear out the actors list for memory sake
            allActorsGlobalForAnimalHelper = [];
        }
    });

    //---------------------------------------------BEGIN CR weight settings------------------------------------------------------------------------------------------
    // CR Weight Settings - Displayed directly in settings
    game.settings.register('conjure-animals-helper', 'CR0setting', {
        name: 'CR 0 Weight',
        hint: 'Weight for CR 0 creatures. (Set to 0 to disable this CR as an option. will be ignored if no monsters of this CR are loaded)',
        scope: 'world',     // Sync across the entire game world
        config: true,       // Show in the main settings menu
        type: Number,       // Number input
        default: 1,
        onChange: value => {
            updateCRWeight(0, value); // Update CR weight
        }
    });
    game.settings.register('conjure-animals-helper', 'CR0.125setting', {
        name: 'CR 1/8 Weight',
        hint: 'Weight for CR 1/8 creatures. (Set to 0 to disable this CR as an option. will be ignored if no monsters of this CR are loaded)',
        scope: 'world',
        config: true,       // Show in the main settings menu
        type: Number,
        default: 1,
        onChange: value => {
            updateCRWeight(0.125, value); // Update CR weight
        }
    });
    game.settings.register('conjure-animals-helper', 'CR0.25setting', {
        name: 'CR 1/4 Weight',
        hint: 'Weight for CR 1/4 creatures. (Set to 0 to disable this CR as an option. will be ignored if no monsters of this CR are loaded)',
        scope: 'world',
        config: true,       // Show in the main settings menu
        type: Number,
        default: 1,
        onChange: value => {
            updateCRWeight(0.25, value); // Update CR weight
        }
    });
    game.settings.register('conjure-animals-helper', 'CR0.5setting', {
        name: 'CR 1/2 Weight',
        hint: 'Weight for CR 1/2 creatures. (Set to 0 to disable this CR as an option. will be ignored if no monsters of this CR are loaded)',
        scope: 'world',
        config: true,       // Show in the main settings menu
        type: Number,
        default: 1,
        onChange: value => {
            updateCRWeight(0.5, value); // Update CR weight
        }
    });
    game.settings.register('conjure-animals-helper', 'CR1setting', {
        name: 'CR 1 Weight',
        hint: 'Weight for CR 1 creatures. (Set to 0 to disable this CR as an option. will be ignored if no monsters of this CR are loaded)',
        scope: 'world',
        config: true,       // Show in the main settings menu
        type: Number,
        default: 1,
        onChange: value => {
            updateCRWeight(1, value); // Update CR weight
        }
    });
    game.settings.register('conjure-animals-helper', 'CR2setting', {
        name: 'CR 2 Weight',
        hint: 'Weight for CR 2 creatures. (Set to 0 to disable this CR as an option. will be ignored if no monsters of this CR are loaded)',
        scope: 'world',
        config: true,       // Show in the main settings menu
        type: Number,
        default: 1,
        onChange: value => {
            updateCRWeight(2, value); // Update CR weight
        }
    });
    //---------------------------------------------END CR weight settings------------------------------------------------------------------------------------------
    // Register the setting for CRFolderUsable
    game.settings.register("conjure-animals-helper", "CRFolderUsable", {
        name: "CR Folder Usability",
        hint: "A list of CR values and their usability for actor selection.",
        scope: "world", // Can be "user", "world", or "module"
        config: false,
        type: Object,
        default: {
            0: true,
            0.125: true,
            0.25: true,
            0.5: true,
            1: true,
            2: true
        },
        onChange: value => {
            // Optionally handle changes if needed
            fixCRValuesAndWeightsToFolderUsability();
            console.log("CRFolderUsable setting changed to: ", value);
        }
    });
    game.settings.register('conjure-animals-helper', 'useButtonsForAnimalHelper', {
        name: 'Animal Helper Buttons',
        hint: 'Check yes if you want to have a button on the actor page. Uncheck if it is interfering with other things and you can use macros instead.',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true,
        requiresReload: true
    });
    game.settings.register('conjure-animals-helper', 'actorIdMapping', {
        name: 'Actor ID Mapping',
        hint: 'Stores the mapping between compendium actor IDs and world actor IDs after importing.',
        scope: 'world',
        config: false,
        type: Object,
        default: {},
    });

});


function addActorsToSelectedListInSettings(actorList) {

    // Save the selected actors list back to the settings
    game.settings.set('conjure-animals-helper', 'selectedActors', actorList);

    console.log(`Selected actors list has been updated.`);
}

let allActorsGlobalForAnimalHelper = [];

// Function to load actors from the selected compendium
async function loadActorsFromCompendium(compendiumKey) {
    console.log("loading all the actors from teh compendium");
    actorsLoadedConjureAnimals = false;

    const animalPack = game.packs.get(compendiumKey);

    if (!animalPack) {
        console.warn(`Compendium ${compendiumKey} not found.`);
        ui.notifications.warn("No compendium found.");
        return;
    }

    // Ensure the compendium is loaded
    if (!animalPack.index) await animalPack.getIndex();

    // Fetch all actor documents from the compendium
    console.log("Loading actors from compendium...");
    allActorsGlobalForAnimalHelper = await animalPack.getDocuments(Actor); // Store actors in the global variable

    if (allActorsGlobalForAnimalHelper.length > 0) {
        console.log(`${allActorsGlobalForAnimalHelper.length} actors loaded from the compendium.`);

    } else {
        console.warn("No actors found in the selected compendium.");
    }

    actorsLoadedConjureAnimals = true;
}

// Helper function to wait until actors are loaded
function waitForActorsToLoad() {
    return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
            if (actorsLoadedConjureAnimals) {
                clearInterval(checkInterval);  // Stop checking once actors are loaded
                resolve();  // Resolve the promise when actorsLoadedConjureAnimals is true
            }
        }, 100);  // Check every 100 milliseconds

        // Optional: Set a timeout to reject the promise if loading takes too long
        setTimeout(() => {
            if (!actorsLoadedConjureAnimals) {
                clearInterval(checkInterval);
                reject("Actors loading timed out.");
            }
        }, 10000);  // 10-second timeout, adjust as needed
    });
}

/////////////////////////////////////////////////////////////////////////////FORM LOAD START/////////////////////////////////////////////////////////////////////////////////////////

class SubfolderSelectionForm { //I don't remember why I put this here. I was trying a different approach with loading the form. I can't figure out what it does, and I can't delete it either
    static async show() {
        openSubfolderSelectionDialog();
    }
}

// Function to open the subfolder selection dialog
async function openSubfolderSelectionDialog() {
    if (!game.user.isGM) {
        return;
    }

    console.log("opened openSubfolderSelectionDialog function");
    const selectedCompendium = game.settings.get('conjure-animals-helper', 'selectedCompendium');
    const animalPack = game.packs.get(selectedCompendium);

    if (!animalPack) {
        ui.notifications.warn("No compendium selected or found.");
        return;
    }

    // Ensure the compendium is loaded
    if (!animalPack.index) await animalPack.getIndex();

    const subfolders = animalPack.folders;
    //console.log("subfolders: ", subfolders);

    // Check if there are any subfolders
    if (!subfolders || subfolders.length === 0 || subfolders.size === 0) {
        console.log("No subfolders found. Selecting all actors automatically.");

        // Optionally show a notification
        ui.notifications.info("No subfolders found. All actors from the compendium will be selected.");

        // Call the function to load all actors automatically
        openActorSelectionDialogNoFolders();

        return;  // Skip the subfolder selection dialogue
    }

    // Build HTML content for checkboxes, all checked by default
    let formContent = '<form>';
    subfolders.forEach(folder => {
        formContent += `
            <div>
                <label>
                    <input type="checkbox" name="folder" value="${folder.name}" checked> ${folder.name}
                </label>
            </div>`;
    });
    formContent += '</form>';

    // Create the dialog
    new Dialog({
        title: "Select Subfolders",
        content: formContent,
        buttons: {
            save: {
                label: "Save",
                callback: async (html) => {
                    const selectedFolders = [];
                    html.find('input[name="folder"]:checked').each(function () {
                        selectedFolders.push($(this).val());
                    });

                    console.log("Selected subfolders: ", selectedFolders);

                    // Save selected subfolders to settings
                    await game.settings.set('conjure-animals-helper', 'selectedSubfolders', JSON.stringify(selectedFolders));
                    ui.notifications.info("Subfolders updated.");

                    // After saving, open the actor selection dialog
                    openActorSelectionDialog(selectedFolders);
                }
            },
            cancel: {
                label: "Cancel"
            }
        },
        default: "save"
    }).render(true);


}


// Retrieve selected subfolders from settings
function getSelectedSubfolders() {
    const selectedSubfolders = JSON.parse(game.settings.get('conjure-animals-helper', 'selectedSubfolders') || '[]');
    console.log("User selected subfolders: ", selectedSubfolders);
    return selectedSubfolders;
}

async function loadAllActorsFromCompendium() {
    await waitForActorsToLoad();

    if (!allActorsGlobalForAnimalHelper || allActorsGlobalForAnimalHelper.length === 0) {
        ui.notifications.warn("No actors found in the selected compendium.");
        return;
    }

    console.log(`Loaded ${allActorsGlobalForAnimalHelper.length} actors from the compendium.`);

    // Automatically select all actors
    const selectedActors = allActorsGlobalForAnimalHelper.map(actor => actor.id); // Get the ID of each actor

    // Save all actors as selected to the settings
    //await game.settings.set('conjure-animals-helper', 'selectedActors', JSON.stringify(selectedActors));
    addActorsToSelectedListInSettings(selectedActors);
}

// Function to open the actor selection dialog when there are no folders
async function openActorSelectionDialogNoFolders() {
    if (!game.user.isGM) {
        return;
    }

    await waitForActorsToLoad();

    // Ensure all actors have been loaded
    if (!allActorsGlobalForAnimalHelper || allActorsGlobalForAnimalHelper.length === 0) {
        ui.notifications.warn("No actors found in the selected compendium.");
        return;
    }

    console.log("No folders found. Loading all actors from the compendium.");

    // Create an array of available actors
    const availableActors = allActorsGlobalForAnimalHelper.map(actor => ({
        name: actor.name,
        id: actor.id,
        cr: actor.system.details.cr || 0 // Default CR to 0 if not available
    }));

    // Build and open the actor selection dialog
    buildActorSelectionDialog(availableActors);
}

async function openActorSelectionDialog(selectedFolders) {
    if (!game.user.isGM) {
        return;
    }

    await waitForActorsToLoad();

    const selectedCompendium = game.settings.get('conjure-animals-helper', 'selectedCompendium');
    const animalPack = game.packs.get(selectedCompendium);

    if (!animalPack) {
        ui.notifications.warn("No compendium selected or found.");
        return;
    }

    // Ensure the compendium is loaded
    if (!animalPack.index) await animalPack.getIndex();

    const compendiumFolders = animalPack.folders; // All folders in the pack
    let availableActors = [];

    // If there are no folders, load all actors directly
    if (!compendiumFolders || compendiumFolders.length === 0) {
        console.log("No folders found. Loading all actors from the compendium.");

        availableActors = allActorsGlobalForAnimalHelper.map(actor => ({
            name: actor.name,
            id: actor.id,
            cr: actor.system.details.cr || 0  // Default CR to 0 if not available
        }));

        // If available actors are found, continue with the dialog
        buildActorSelectionDialog(availableActors);
        return;
    }

    // Create a map of folder names to their IDs for quick lookup
    const folderIdMap = new Map(compendiumFolders.map(folder => [folder.name, folder.id]));

    // Iterate through the selected folders and retrieve actors
    for (const folderName of selectedFolders) {
        const folderId = folderIdMap.get(folderName);
        if (folderId) {
            // Find actors in the specified folder
            for (const actor of allActorsGlobalForAnimalHelper) {
                if (actor.folder ?.name === folderName) { // Ensure folder exists
                    availableActors.push({
                        name: actor.name,
                        id: actor.id,
                        cr: actor.system.details.cr || 0  // Default CR to 0 if not available
                    });
                }
            }
        } else {
            console.warn(`Folder "${folderName}" not found in animalPack folders.`);
        }
    }

    // If available actors are found, continue with the dialog
    buildActorSelectionDialog(availableActors);
}

// Function to build and open the actor selection dialog
function buildActorSelectionDialog(availableActors) {
    if (!game.user.isGM) {
        return;
    }

    // Sort actors first by CR, then by name alphabetically
    availableActors.sort((a, b) => {
        if (a.cr === b.cr) {
            // If CRs are the same, sort alphabetically by name
            return a.name.localeCompare(b.name);
        }
        // Otherwise, sort by CR (lower CRs first)
        return a.cr - b.cr;
    });

    // Build HTML content for actor checkboxes
    let actorContent = '<form id="actor-form">';
    availableActors.forEach(actor => {
        actorContent += `
            <div>
                <label>
                    <input type="checkbox" name="actor" value="${actor.id}" checked> ${actor.name} (CR: ${actor.cr})
                </label>
            </div>`;
    });
    actorContent += '</form>';

    // Create the actor selection dialog
    new Dialog({
        title: "Select Actors",
        content: actorContent,
        buttons: {
            save: {
                label: "Save",
                callback: async (html) => {
                    const selectedActors = [];

                    // Retrieve selected actor IDs
                    const selectedActorIds = [];
                    html.find('input[name="actor"]:checked').each(function () {
                        selectedActorIds.push($(this).val());
                    });

                    // Log the selected actor IDs
                    console.log("Selected actor IDs: ", selectedActorIds);

                    // Get the full actor objects from availableActors based on selected IDs
                    selectedActorIds.forEach(id => {
                        const actor = availableActors.find(actor => actor.id === id);
                        if (actor) {
                            selectedActors.push(actor); // Push the full actor object
                        }
                    });

                    console.log("Selected actors: ", selectedActors);

                    // Add selected actors to the settings
                    addActorsToSelectedListInSettings(selectedActors);
                    ui.notifications.info("Actors updated.");

                    // Optionally populate the actors into the actor folder
                    // loadSettingsActorsIntoWorld();
                }
            },
            cancel: {
                label: "Cancel"
            }
        },
        default: "save"
    }).render(true);
}




/////////////////////////////////////////////////////////////////////////////FORM LOAD END/////////////////////////////////////////////////////////////////////////////////////////




// Function to get subfolder choices based on the selected compendium
function getSubfolderChoices() {
    const selectedCompendium = game.settings.get('conjure-animals-helper', 'selectedCompendium');
    console.log("Currently selected compendium for subfolders: ", selectedCompendium);

    // If no compendium is selected, return an empty choices object
    if (!selectedCompendium || !compendiumSubFolderData[selectedCompendium]) {
        return {}; // Return empty if no valid selection
    }

    // Return the subfolder choices for the selected compendium
    return Object.keys(compendiumSubFolderData[selectedCompendium])
        .reduce((choices, folderName) => {
            choices[folderName] = folderName; // Map folder names to themselves
            return choices;
        }, {});
}

async function populateCompendiumChoicesAndFolders() {
    console.log("%cStarting to populate compendium choices and folders...", "color: blue; font-weight: bold;");

    // Iterate over all packs in the game
    for (const pack of game.packs.values()) {
        // Only consider Actor compendiums
        if (pack.metadata.type === "Actor") {
            console.log(`%cChecking Actor compendium: ${pack.title}`, "color: green; font-weight: bold;");

            // Load the pack if it is not already loaded
            if (!pack.index) {
                await pack.getIndex(); // Ensure the pack is loaded
            }

            // Step 1: Retrieve folders from the compendium pack
            const compendiumFolders = pack.folders; // Access folders directly from the pack
            let hasActorsWithCR = false; // Initialize a flag to check if any actor in the compendium has a CR rating

            // 1. Check actors stored inside folders
            for (const folder of compendiumFolders) {
                // Get the actors in the current folder
                const actorsInFolder = await pack.getDocuments({ folder: folder.id });

                // Check if any actor has a CR rating
                for (const actor of actorsInFolder) {
                    if (actor.system.details.cr) {
                        hasActorsWithCR = true;
                        break; // Exit the loop if we found an actor with a CR
                    }
                }

                // Stop checking folders if we found an actor with CR
                if (hasActorsWithCR) break;
            }

            // 2. Check actors not stored in any folder (compendium root)
            if (!hasActorsWithCR) {
                const rootActors = await pack.getDocuments({ folder: null }); // Get actors not in folders

                for (const actor of rootActors) {
                    if (actor.system.details.cr) { // Assuming CR is stored in system.details.cr
                        hasActorsWithCR = true;
                        break; // Exit the loop if we found an actor with a CR
                    }
                }
            }

            // Add the compendium if it has actors with CR ratings
            if (hasActorsWithCR) {
                compendiumChoices[pack.collection] = pack.title; // Use collection as key and title as value
                console.log(`%cCompendium added: ${pack.title}`, "color: blue; font-weight: bold;");
            } else {
                console.log(`%cSkipping compendium ${pack.title} - no actors with CR found.`, "color: red;");
            }
        } else {
            console.log(`%cSkipping non-Actor compendium: ${pack.title}`, "color: grey;");
        }
    }

    conjureAnimalsHelperIsReadyToDoThings = true;
    console.log("%cFinished populating compendium choices and folders.", "color: blue; font-weight: bold;");
}



// Function to update the CRValuesAndWeights based on settings
function populateCRValuesAndWeights() {
    CRValuesAndWeights[0] = game.settings.get('conjure-animals-helper', 'CR0setting');
    CRValuesAndWeights[0.125] = game.settings.get('conjure-animals-helper', 'CR0.125setting');
    CRValuesAndWeights[0.25] = game.settings.get('conjure-animals-helper', 'CR0.25setting');
    CRValuesAndWeights[0.5] = game.settings.get('conjure-animals-helper', 'CR0.5setting');
    CRValuesAndWeights[1] = game.settings.get('conjure-animals-helper', 'CR1setting');
    CRValuesAndWeights[2] = game.settings.get('conjure-animals-helper', 'CR2setting');
    fixCRValuesAndWeightsToFolderUsability();
}

//can't use fixCRValuesAndWeightsToFolderUsability() yet
function populateCRValuesAndWeightsInitial() {
    CRValuesAndWeights[0] = game.settings.get('conjure-animals-helper', 'CR0setting');
    CRValuesAndWeights[0.125] = game.settings.get('conjure-animals-helper', 'CR0.125setting');
    CRValuesAndWeights[0.25] = game.settings.get('conjure-animals-helper', 'CR0.25setting');
    CRValuesAndWeights[0.5] = game.settings.get('conjure-animals-helper', 'CR0.5setting');
    CRValuesAndWeights[1] = game.settings.get('conjure-animals-helper', 'CR1setting');
    CRValuesAndWeights[2] = game.settings.get('conjure-animals-helper', 'CR2setting');
}


///////////////////////////////////////////////////////////////////////UI STUFF BELOW/////////////////////////////////////////////////////////////////////////


// Function to add the summon button to the Actors tab
//for the players, it will let them summon, for the GM, it will let them delete
//the buttons can be turned off in settings, and macros can be used instead, just in case this conflicts with something
async function addSummonButtonToActorsTab(html) {
    // Check if the setting to use buttons is enabled
    const useButtons = game.settings.get('conjure-animals-helper', 'useButtonsForAnimalHelper');
    // If the setting is disabled, don't add the button
    if (!useButtons) return;


    let summonButton;

    if (game.user.isGM) {
        // Create the button element with a label
        summonButton = $('<button class="summon-sidebar-button">Delete Conjured Creatures</button>');
        // Add click handler for the button
        summonButton.click(() => {
            showConjuredAnimalsManagement();
            //deleteAllConjuredTokens();
            //removeConjuredCombatants();
        });
    } else {
        // Create the button element with a label
        summonButton = $('<button class="summon-sidebar-button">Summon Creatures</button>');
        // Add click handler for the button
        summonButton.click(() => {
            showConjureAnimalsDialog();
        });
    }
    // Check if the button already exists to avoid duplicates
    if (html.find('.summon-sidebar-button').length > 0) return;



    // Try adding the button to the footer first, fallback to header
    const footer = html.find('.directory-footer');
    if (footer.length) {
        footer.append(summonButton);
    } else {
        html.find('.directory-header').append(summonButton);
    }
}

// Hook to render the button when the sidebar loads or the tab changes
Hooks.on('renderSidebarTab', (app, html) => {
    // Only proceed if we are in the Actors tab
    if (app.options.id === 'actors') {
        addSummonButtonToActorsTab(html);
    }
});

// Hook to add the button when Foundry initializes (in case Actors tab is loaded by default)
Hooks.on('ready', () => {
    const actorsTab = ui.actors.element;
    addSummonButtonToActorsTab(actorsTab);
});


async function createAnimalConjureHelperMacro() {
    if (!game.user.isGM) {
        return;  // Only GMs should run the macro creation process
    }
    console.log("Making macro available for Conjure Animal Helper");

    const tableIcon = "modules/conjure-animals-helper/assets/animals-icon.png"; // Path to your icon in the module
    const macroName = "Conjure Animal Helper"; // Name of the macro
    const existingMacro = game.macros.contents.find(m => m.name === macroName); // Check if the macro already exists

    let macro;

    // If the macro doesn't exist, create it
    if (!existingMacro) {
        macro = await Macro.create({
            name: macroName,
            type: "script",
            command: "showConjureAnimalsDialog();", // Command to execute when the macro is run
            img: tableIcon, // Set the icon here
            flags: { "core": { "sourceId": "macro." + macroName.replace(/ /g, "_").toLowerCase() } }
        });
        console.log(`Macro "${macroName}" created and is available to all players.`);
    } else {
        macro = existingMacro;
        console.log(`Macro "${macroName}" already exists and is available to all players.`);
    }

}

///////////////////////////////////////////////////////////////////////backup stuff below/////////////////////////////////////////////////////////////////////////

// Listen for any updates to actors
Hooks.on("updateActor", async (actor, updateData) => {
    // Check if the HP is being updated
    const hpData = getProperty(updateData, "system.attributes.hp.value");
    if (hpData === 0) {
        // Get the active token for this actor
        const token = actor.getActiveTokens()[0];

        // Only proceed if the token exists and has the 'isConjured' flag
        if (token && token.document.flags ?.myModule ?.isConjured) {
            confirmTokenDeletion(token);
        }
    }
});

// Function to ask GM for confirmation to delete a conjured token and its combatant
async function confirmTokenDeletion(token) {
    if (!game.user.isGM) return; // Only show this to the GM

    // Create a dialog to confirm deletion
    new Dialog({
        title: "Delete Conjured Token?",
        content: `<p>The token "${token.name}" has reached 0 HP. Do you want to delete the token and remove it from combat?</p>`,
        buttons: {
            yes: {
                icon: '<i class="fas fa-check"></i>',
                label: "Yes",
                callback: async () => {
                    await deleteTokenAndCombatant(token);
                }
            },
            no: {
                icon: '<i class="fas fa-times"></i>',
                label: "No",
                callback: () => {
                    console.log(`The token "${token.name}" was not deleted.`);
                }
            }
        },
        default: "no"
    }).render(true);
}

// Function to delete the token and its combatant
async function deleteTokenAndCombatant(token) {
    const combat = game.combat;

    // Delete the token from the scene
    await token.document.delete();

    // Check if the token is in the combat tracker
    if (combat) {
        const combatant = combat.combatants.find(c => c.tokenId === token.id);
        if (combatant) {
            await combat.deleteEmbeddedDocuments("Combatant", [combatant.id]);
            ui.notifications.info(`${token.name} has been removed from the combat tracker.`);
        }
    }
}

async function recheckConjuredAnimalTokenLength() {
    let obtainPlayerInfo = await getPlayerTokenForConjureAnimals();
    const conjuredTokens = canvas.tokens.placeables.filter(token => token.name.startsWith("Conjured(" + obtainPlayerInfo.actor.name));
    //console.log(conjuredTokens);

    if (conjuredTokens.length === 0) {
        ui.notifications.info("No conjured creatures found in the current scene.");
        return 0;
    }

    return conjuredTokens.length;
}


async function showConjuredAnimalsActionManagement() {

    // Get user info
    let obtainPlayerInfo = await getPlayerTokenForConjureAnimals();
    let playerIDforStorage = obtainPlayerInfo.document.actorId; //we will need this to make sure only the player can interact with their own stuff
    //console.log(playerIDforStorage);
    //console.log(obtainPlayerInfo.actor.name);

    //find the tokens that match the player name
    const conjuredTokens = canvas.tokens.placeables.filter(token => token.name.startsWith("Conjured(" + obtainPlayerInfo.actor.name));
    //console.log(conjuredTokens);

    if (conjuredTokens.length === 0) {
        ui.notifications.info("No conjured creatures found in the current scene.");
        return;
    }

    // Create a dictionary to store animal types and their actions
    const animalTypes = {};

    //console.log("token compare: ", conjuredTokens[0]);
    //get relevent info from the tokens

    const actor = conjuredTokens[0].actor;
    const animalType = actor.name;

    console.log(actor.items);
    // Get actions from the 'Actions' section of the creature's sheet (only weapons for now)
    const actions = actor.items.filter(item => item.type === "weapon"); // Only actions categorized as 'weapon'
    for (let i = 0; i < actor.items.length; i++) {
        console.log(actor.items[i]);
    }
    console.log(actor.items);

    let actionInfo = {} //dictionary for actions

    //get bonuses for rolls
    for (let i = 0; i < actions.length; i++) {
        //console.log(actions[i]);
        let actionName = actions[i].name;
        //console.log(actionName);

        let baseProficiency = actions[i].system.prof._baseProficiency;
        let profMult = actions[i].system.prof.multiplier;
        //console.log(profMult);
        let profBonus = profMult * baseProficiency;
        //console.log(profBonus);
        let abilityBonus = actions[i].system.ability;
        //console.log(abilityBonus);

        let abilityMod = 0;
        abilityMod = actor.system.abilities[abilityBonus].mod;
        //console.log("mod: ", abilityMod);

        const actionBonusExplanation = "Proficiency: " + profBonus.toString() + " " + abilityBonus + " mod: " + abilityMod;
        //console.log(actionBonusExplanation);


        const damageFormula = actions[i].system.damage.parts.length > 0 ?
            actions[i].system.damage.parts.map(part => part[0]).join(", ") :
            "N/A";

        //let firstPart = damageFormula.trim().split(" ")[0]; // Splits by space and gets the first part
        //console.log("firstPart: ", firstPart);
        let tempRollHolder = [];
        let actorHolder = [];
        //make an array to match the size of the cojured squad for later use
        for (let jindex = 0; jindex < conjuredTokens.length; jindex++) {
            tempRollHolder.push(false); //initialized with false
            actorHolder.push(conjuredTokens[jindex].document.name);
        }

        //console.log(actorHolder);
 
        actionInfo[actionName] = {
            name: actionName,
            bonusRoll: profBonus + abilityMod,
            prof: profBonus,
            abilityMod: abilityMod,
            abilityBonusType: abilityBonus,
            bonusExplanation: actionBonusExplanation,
            damageFormula: damageFormula,
            availableAmount: conjuredTokens.length,
            creatureName: animalType,
            rollHolder: tempRollHolder,
            actorHolder: actorHolder,
            playerIDforStorage: playerIDforStorage
        };

    }

    //console.log(actionInfo);


    // Prepare HTML content for the dialog
    let content = `<h2>Conjured Animals Actions</h2><div style="width: 100%;">`;

    //const { count, actions } = animalTypes[animalType];

    content += `<h3>${animalType} (x${conjuredTokens.length})</h3><table style="width: 100%; text-align: left;">
            <tr><th>Action</th><th>Attack</th><th></th><th>Damage</th><th></th><th></th></tr>`;


    //for (let i = 0; i < actionInfo.length; i++)
    for (let actionName in actionInfo) {
        const action = actionInfo[actionName];
        //content += `<tr><td>${actionInfo[i].name}</td><td>${actionInfo[i].bonusRoll}</td><td>(${actionInfo[i].bonusExplanation})</td><td>${actionInfo[i].damageFormula}</td></tr>`;
        content += `<tr><td>${action.name}</td><td>${action.bonusRoll}</td><td>(${action.bonusExplanation})</td><td>${action.damageFormula}</td>`;
        
        content += `<td><button class="roll-action" data-action-name="${action.name}" title="roll all as straight rolls">Roll</button></td>`;
        content += `<td><button class="configure-rolls" data-action-name="${action.name}" title="set individuals at advantage and disadvantage">Roll(advanced)</button></td></tr>`;
    }

    content += `</table>`;

    content += `</div>`;

    //console.log(content);

    const myDialog = new Dialog({
        title: "Manage Conjured Animal Actions",
        content: content,
        buttons: {
            close: {
                label: "Close",
                callback: () => console.log("Closed dialog")
            }
        },
        render: (html) => {
            // Event listener for the "Configure Rolls" button
            html.find('.configure-rolls').click(async (event) => {
                const actionName = event.currentTarget.dataset.actionName;
                const action = actionInfo[actionName];
                // Open the new dialog to configure rolls
                openRollConfigDialog(action);

                myDialog.close();  // Close the dialog after the button is clicked
                
            });
            // Add event listener for individual action roll buttons
            html.find('.roll-action').click(async (event) => {

                const actionName = event.currentTarget.dataset.actionName;
                const action = actionInfo[actionName]; // Access the corresponding action object
                rollAllConjuredActionsSimple(action);

                myDialog.close();  // Close the dialog after the button is clicked
                return;
                                                                                         
            });
        }
    }, {
            width: 800  // Adjust the width of the dialog if needed
        }).render(true);


}


// Function to roll a specific action for a conjured creature
async function rollConjuredAction(token, action) {
    const actor = token.actor;

    // Use Foundry's in-built roll system for item rolls
    await action.roll();

    console.log(`Rolled ${action.name} for ${actor.name}`);
}

async function rollAllConjuredActionsSimple(action) { //if we call this without the settings array, we just populate it to be normal and call the full function
    rollSettings = [];

    for (let i = 0; i < action.availableAmount; i++) {
        rollSettings.push("Normal");
    }
    rollAllConjuredActions(action, rollSettings);
}

// Function to roll all actions for all conjured creatures
async function rollAllConjuredActions(action, rollSettings) {

    //console.log(rollSettings);


    //const action = actionInfo[actionName]; // Access the corresponding action object
    const countUpto = action.availableAmount;



    let attackRolls = [];  // To store the attack rolls and messages
    let rollIDsforDelete = []; //to store the attack roll message ids
    let rollExplanation = [];

    for (let i = 0; i < countUpto; i++) {

        let rollType = "1d20"; //by default, we just do a straight roll
        if (rollSettings[i] === "advantage") {
            //check for advantage rolls, and adjust here
            rollType = "2d20kh"; //the syntax for an advantage roll, my guess is it stands for "keep high"
            rollExplanation.push(` ${rollSettings[i]}`);
        } else if (rollSettings[i] === "disadvantage") {
            //check for disadvantage rolls, and adjust here
            rollType = "2d20kl"; //the syntax for a disadvantage roll, my guess is it stands for "keep low"
            rollExplanation.push(` ${rollSettings[i]}`);
        } else { //just to keep the array consistent
            rollExplanation.push(``);
        }
        let roll = new Roll("@mainDice + @prof + @abMod", { mainDice: rollType, prof: action.prof, abMod: action.abilityMod });
        //console.log

        const attackRollMessage = await roll.toMessage({
            flavor: `Attack Roll for ${action.name}: ${action.bonusExplanation}`,
            speaker: ChatMessage.getSpeaker(),  // Set the speaker to the player or NPC
        });
        attackRolls.push(attackRollMessage);
        rollIDsforDelete.push(attackRollMessage._id);
    }

    //console.log(rollExplanation);

    let rollMessage = `<strong>Rolled for ${action.name}: ${action.bonusExplanation}</strong>`;

    // Wait for all rolls to be posted to the chat
    setTimeout(() => {
        ChatMessage.deleteDocuments(rollIDsforDelete);
    }, 1500);

    //just use a normal array

    for (let i = 0; i < countUpto; i++) {
        //rollMessage += `<br>Attack Roll ${i + 1}: ${attackRolls[i].rolls[0]._total} (1d20 + ${action.prof} + ${action.abilityMod})`;
        //console.log("attackRolls[i].rolls[0]: ",attackRolls[i].rolls[0]);
        const formattedRoll = String(attackRolls[i].rolls[0]._total).padStart(2, ' ');
        let trueRoll = formattedRoll - action.bonusRoll;
        //console.log(formattedRoll);                
        //get the main parts of the style, leave out the ending so we can add to it in the event of special rolls
        let rollNumberStyle = `style="font-size: 1.5em; font-weight: bold; display: inline-block; width: 1.5em; text-align: right;`;
        let smallNumberStyle = `style="display: inline-block; width: 1.2em; text-align: right;`;
        if (trueRoll === 20) { //check for nat 20s
            rollNumberStyle += ` color: #18520b;`; //match color to what foundry uses for nat 20s
            smallNumberStyle += ` color: #18520b;`;
            action.rollHolder[i] = "crit";
        } else if (trueRoll === 1) { //check for nat 1s
            rollNumberStyle += ` color: #aa0200;`; //match color to what foundry uses for nat 1s
            smallNumberStyle += ` color: #aa0200;`;
            action.rollHolder[i] = "miss";
        }
        rollNumberStyle += `"`; //close out the style HTML
        smallNumberStyle += `"`; //close out the style HTML
        //console.log(rollNumberStyle);
        //console.log(smallNumberStyle);
        let trimmedActorName = action.actorHolder[i].replace("Conjured", "");
        //let originalString = "GeeksForGeeks";
        //newString = originalString.replace("G", "");
        rollMessage += `<br>${trimmedActorName}: <span ${rollNumberStyle}>${formattedRoll}</span> (<span ${smallNumberStyle}>${trueRoll}</span> + ${action.prof} + ${action.abilityMod}`;
        rollMessage += `${rollExplanation[i]})`;
        //console.log(attackRolls[i].rolls[0]._total);
    }

    // Append the damage roll button
    //rollMessage += `<br><button class="damage-roll-button" data-max-hits="${countUpto}">Roll Damage</button>`;

    let actionConvertedToString = JSON.stringify(action);
    console.log(actionConvertedToString);

    rollMessage += `<br>
    <button class="damage-roll-button" 
            data-max-hits="${countUpto}" 
            data-action-info='${JSON.stringify(action)}'>          
        Roll Damage
    </button>`;


    // Send the message to the chat with both rolls
    ChatMessage.create({
        content: rollMessage,
        speaker: ChatMessage.getSpeaker(),  // Set the speaker to the player or NPC
    });
    //ui.notifications.info("Rolled all actions for all conjured animals.");

    // Add the event listener for the damage roll button
    /*
    $(document).on('click', '.damage-roll-button', function () {
        //const maxHits = $(this).data('max-hits');
        //openDamageRollDialog(action, maxHits);

        const maxHits = $(this).data('max-hits');
        const actionInfoString = $(this).data('action-info'); // Retrieve the action info string
        //console.log(actionInfoString);
        //const action = JSON.parse(actionInfoString); // Parse it back to an object

        // Call the function to open the damage roll dialog with the action info and max hits
        openDamageRollDialog(actionInfoString , maxHits);
    });
    */
}

function openRollConfigDialog(action, maxHits) {
    // Create HTML content for checkboxes
    //const action = actionInfo[actionName]; // Access the corresponding action object



    const countUpto = action.availableAmount;
    
    let rollConfigContent = `<h3>Configure Rolls for ${action.name}</h3><table style="width: 100%; text-align: left;">`;

    // Generate 8 rows for each roll configuration
    for (let i = 1; i <= countUpto; i++) {
        rollConfigContent += `
            <tr>
                <td>${action.creatureName} ${i}</td>
                <td>
                    <input type="radio" name="roll${i}" value="normal" checked> Normal
                    <input type="radio" name="roll${i}" value="advantage"> Advantage
                    <input type="radio" name="roll${i}" value="disadvantage"> Disadvantage
                </td>
            </tr>`;
    }
    rollConfigContent += `</table>`;

    // Create the dialog
    new Dialog({
        title: `Roll Configuration for ${action.name}`,
        content: rollConfigContent,
        buttons: {
            roll: {
                label: "Roll",
                callback: (html) => {
                    // Gather all selections
                    let rollSettings = [];
                    for (let i = 1; i <= countUpto; i++) {
                        const selectedValue = html.find(`input[name="roll${i}"]:checked`).val();
                        rollSettings.push(selectedValue);
                    }

                    // Now pass rollSettings to the next function
                    console.log(rollSettings);
                    rollAllConjuredActions(action, rollSettings);
                }
            },
            cancel: {
                label: "Cancel",
                callback: () => console.log("Roll cancelled")
            }
        }
    }).render(true);
}

// Function to open the dialog to select the number of successful hits
function openDamageRollDialogTextBox(action, maxHits) {

    //console.log(actionString);
    //return;

    let content = `<p>Select the number of successful hits (1 to ${maxHits}):</p>`;
    content += `<input type="number" id="successfulHits" name="successfulHits" min="1" max="${maxHits}" value="${maxHits}"/>`;

    new Dialog({
        title: "Select Successful Hits",
        content: content,
        buttons: {
            roll: {
                label: "Roll Damage",
                callback: async (html) => {
                    let successfulHits = parseInt(html.find("#successfulHits").val());
                    successfulHits = Math.max(0, Math.min(successfulHits, maxHits));
                    await triggerDamageRoll(action, successfulHits);
                }
            },
            cancel: {
                label: "Cancel"
            }
        }
    }).render(true);
}

async function openDamageRollDialog(action, maxHits) {
    
    
    let obtainPlayerInfo = await getPlayerTokenForConjureAnimals();
    let playerIDforStorage = obtainPlayerInfo.document.actorId;

    if (playerIDforStorage === action.playerIDforStorage) {
        console.log("player match");
    } else {
        //console.log("not the correct player");
        return;
    }

    // Assuming you have a list of creature names in action.creatureNames
    let creatureNames = Array.from({ length: maxHits }, (_, i) => `${action.creatureName} ${i + 1}`);

    // Start building the dialog content with radio buttons for each creature
    let content = `<p>Select result for each attacking creature:</p>`;

    // Loop through each creature and add radio buttons for Hit, Miss, Crit
    content += `<form>`;
    creatureNames.forEach((creature, index) => {
        let checkText = ['', '', '']; //adding this into the radio buttons based on the rolls, it will change the defaults
        if (action.rollHolder[index] === "crit") {
            checkText[2] = ' checked';
        } else if (action.rollHolder[index] === "miss") {
            checkText[1] = ' checked';
        }

        //console.log(checkText);

        content += `
            <div>
                <label>${creature}:</label><br>
                <input type="radio" id="hit_${index}" name="result_${index}" value="hit"${checkText[0]}>
                <label for="hit_${index}">Hit</label>
                <input type="radio" id="miss_${index}" name="result_${index}" value="miss"${checkText[1]}>
                <label for="miss_${index}">Miss</label>
                <input type="radio" id="crit_${index}" name="result_${index}" value="crit"${checkText[2]}>
                <label for="crit_${index}">Crit</label>
            </div><br>
        `;
    });
    content += `</form>`;

    // Open the dialog with the dynamically created content
    new Dialog({
        title: "Select Attack Results",
        content: content,
        buttons: {
            roll: {
                label: "Roll Damage",
                callback: async (html) => {
                    // Gather results for each creature
                    let results = [];
                    for (let i = 0; i < maxHits; i++) {
                        let result = html.find(`input[name="result_${i}"]:checked`).val();
                        if (!result) {
                            console.log("no check on this item, defaulting to miss");
                            result = 'miss';
                        }
                        results.push(result); // Push either 'hit', 'miss', or 'crit'
                    }

                    //console.log(results);

                    // Pass results to the damage roll trigger
                    await triggerDamageRoll(action, results);
                }
            },
            cancel: {
                label: "Cancel"
            }
        }
    }).render(true);
}

// Function to handle the actual damage rolling logic
async function triggerDamageRoll(action, results) {
    /*
    actionInfo[actionName] = {
            name: actionName,
            bonusRoll: profBonus + abilityMod,
            prof: profBonus,
            abilityMod: abilityMod,
            abilityBonusType: abilityBonus,
            bonusExplanation: actionBonusExplanation,
            damageFormula: damageFormula,
            availableAmount: conjuredTokens.length,
            creatureName: animalType
            rollHolder: tempRollHolder,
            playerIDforStorage: playerIDforStorage
        };
    */
    let obtainPlayerInfo = await getPlayerTokenForConjureAnimals();
    let playerIDforStorage = obtainPlayerInfo.document.actorId;

    if (playerIDforStorage === action.playerIDforStorage) {
        console.log("player match");
    } else {
        console.log("not the correct player");
        return;
    }

    // Your damage rolling logic goes here
    //console.log(`Rolling damage for ${successfulHits} successful hits of ${action.name}`);

    
    let firstPart = action.damageFormula.trim().split(" ")[0]; // Splits by space and gets the first part
    //console.log("firstPart: ", firstPart);

    
    let rollType = firstPart; //by default, we just do a straight roll   
    //let roll = new Roll("@mainDice + @abMod", { mainDice: rollType, abMod: action.abilityMod });

    for (let i = 0; i < results.length; i++) {
        if (results[i] != 'miss') {

            let adjustFirstPart = firstPart; //start with the normal formula
            let extraTextIfCrit = '';
            if (results[i] === 'crit') {
                //if there is a crit, we parse for the number of dice, and replace it with twice the value
                let dieAmount = parseInt(action.damageFormula.trim().split("d")[0]); // Splits by space and gets the first part
                console.log("dieAmount: ", dieAmount);
                adjustFirstPart = firstPart.replace(dieAmount, (dieAmount* 2));
                console.log("adjustFirstPart: ", adjustFirstPart);
                extraTextIfCrit = ' (critical hit)';
            }

            let rollFormula = `${adjustFirstPart} + ${action.abilityMod}`;
            let actor = game.actors.get(playerIDforStorage); // Ensure actor is retrieved properly

            // Create the damage roll using D&D 5e's DamageRoll class
            let roll = new CONFIG.Dice.DamageRoll(rollFormula, actor.getRollData(), {
                critical: false // Set to true if it should be a critical hit
            });

            //let topMessagePart = firstPart + 


            // Find the token document by name
            let tokenFind = canvas.tokens.placeables.find(t => t.name === action.actorHolder[i]);
            //console.log(action.actorHolder[i]);


            //conjuredTokens = canvas.tokens.placeables.filter(token => token.name.startsWith(action.actorHolder[i]));
            //console.log(tokenFind);

            let speakerData = ChatMessage.getSpeaker();
            if (tokenFind) {
                speakerData = {
                    alias: tokenFind.name,        // The name of the token as it will appear in chat
                    token: tokenFind.id,          // Token ID for the speaker
                    actor: tokenFind.actor.id,    // Actor ID for the speaker
                    scene: canvas.scene.id    // The scene ID where the token is located
                };
            }


            let attackRollMessage = await roll.toMessage({
                flavor: `Damage Roll for ${action.name}${extraTextIfCrit}`, // Ensure bonusExplanation is safely handled
                speaker: speakerData,  // Set the speaker to the player or NPC
            });
        }       
    }


   
   
}

///////////////////////////////

// Function to show a popup dialog with all conjured creatures and management options
async function showConjuredAnimalsManagement() {
    if (!game.user.isGM) {
        ui.notifications.error("Only the GM can manage conjured creatures.");
        return;
    }

    const combat = game.combat;

    // Gather all conjured tokens in the current scene
    const conjuredTokens = canvas.tokens.placeables.filter(token => token.name.startsWith("Conjured("));

    if (conjuredTokens.length === 0) {
        ui.notifications.info("No conjured creatures found in the current scene.");
        return;
    }

    // Prepare HTML content for the dialog
    let content = `<h2>Conjured Creatures Management</h2><table style="width: 100%; text-align: left;">
        <tr><th>Name</th><th>HP</th><th>Owner</th><th>Actions</th></tr>`;

    conjuredTokens.forEach(token => {
        const actor = token.actor;
        const hp = actor.data.data.attributes.hp.value + "/" + actor.data.data.attributes.hp.max;
        const owner = token.document.flags.myModule.ConjuredOwner || "Unknown";  // Fetch owner from the flag

        content += `<tr>
            <td>${token.name}</td>
            <td>${hp}</td>
            <td>${owner}</td>
            <td>
                <button class="remove-from-combat" data-token-id="${token.id}">Remove from Combat</button>
            </td>
        </tr>`;
    });

    content += `</table>`;

    // Create a dialog
    // Create a dialog
    new Dialog({
        title: "Manage Conjured Creatures",
        content: content,
        buttons: {
            close: {
                label: "Close",
                callback: () => console.log("Closed dialog")
            },
            deleteAll: {
                label: "Delete All",
                callback: () => {
                    deleteAllConjuredTokens();
                    removeConjuredCombatants();
                }
            }
        },
        render: (html) => {
            // Add event listener for "Remove from Combat" buttons
            html.find('.remove-from-combat').click(async (event) => {
                const tokenId = event.currentTarget.dataset.tokenId;
                const token = canvas.tokens.get(tokenId);

                if (combat) {
                    // Remove the token from combat
                    const combatant = combat.combatants.find(c => c.tokenId === tokenId);
                    if (combatant) {
                        await combat.deleteEmbeddedDocuments("Combatant", [combatant.id]);
                        ui.notifications.info(`${token.name} removed from combat.`);
                    }
                }
            });
        },
    }, {
            width: 800  // Set the desired width of the dialog
        }).render(true);

}
