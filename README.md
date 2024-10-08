# Conjure Animals Helper

![My Module Logo](assets/animals-icon.png)

## Description
This module automates many aspects of the **Conjure Animals** spell, allowing players to either receive a random selection of creatures or choose from a list. The GM can then generate tokens for players to control.

## Features
- Easily summon creatures
- Manage summoned creatures
- Customize allowed creatures and the origin compendium
- Change the weights for rolling CR values

## Installation
1. Use the manifest URL to install the module.
https://raw.githubusercontent.com/pteraxor/Conjure-Animals-Helper-Module-for-Foundry-VTT-/refs/heads/master/module.json

## Usage
To use the module, the player can click the **"Conjure Animals"** button in the Actors tab. 

![Conjure Animals Button](assets/player_conjure_btn.PNG)

### Random Selection
This opens a prompt where the player can choose to get animals randomly or select them manually. If random, it rolls a CR based on weights set in the settings and then selects a random creature with that CR.

![Starting Prompt](assets/player_prompt_start.PNG)

### Manual Selection
If choosing manually, the player must first select a CR rating and then an animal from a dropdown.

![CR Choice](assets/player_summon_man_cr.PNG)  
![Creature Choice](assets/player_summon_man_choices.png)

This generates a chat message with all the information and options for the GM.

![Chat Message](assets/player_summon_chat_message.PNG)

### Token Generation
When the GM summons the creatures, the tokens are added near the summoner.

![GM Makes Tokens](assets/gm_makes_tokens.PNG)

The player who summoned them can control the tokens and view their sheets.

![Sheet](assets/player_has_sheets.PNG)

### Combat Integration
If there is an active combat, the conjured animals roll a single initiative and join the combat automatically. They can be added to a later combat with a button, or removed altogether from the first chat message.

![Token Combat](assets/tokens_added_to_combat.PNG)

![Chat Message](assets/player_summon_chat_message.PNG)

## Configuration
Everything is ready to go, but there are options you can change.

### CR Weight Settings
The settings allow the GM to choose the weights for the CR rolling.

![CR Weights](assets/cr_weight_settings.PNG)

### Compendium Settings
The settings also allow the GM to choose a different compendium to load creatures from. When selecting another compendium, the GM must choose which subfolders are used.

![Compendium Choices](assets/compendium_setting_dropdown.PNG)  
![Subfolders](assets/subfolder_select.PNG)

### Actor Selection
The GM can also specify which actors to use. By default, all animals explicitly mentioned in the **Conjure Animals** spell are loaded.

![Actor Choice](assets/actor_select.PNG)
