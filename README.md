# Conjure Animals Helper

![My Module Logo](assets/animals-icon.png)

## Description
This module helps to automate a lot of the troubles with the conjure animals spell. The player can either get a random selection, or pick from a list. Then the GM can generate the tokens for the player to control.

## Features
- Easily summon creatures
- Manage summoned creatures
- Customize allowed creatures, and the origin compendium
- Change the weights for the rolling of the CR values

## Installation
1. use the manifest URL

## Usage
-To use the module, the player can click the "Conjure Animals" button in the Actors tab.

![conjure animals button](assets/player_conjure_btn.PNG)

-This opens a prompt, where the player can chose to get the animals randomly or chose them
(if random, it rolls a CR based on weights in settings, and then selects a random choice with that CR)

![Starting Prompt](assets/player_prompt_start.PNG)

-If manual, the player must first chose a CR rating, and then an animal from a dropdown

![CR choice](assets/player_summon_man_cr.PNG)
![Creature choice](assets/player_summon_man_choices.png)

-This generates a chat message with all of the information and GM options
![Chat message](assets/player_summon_chat_message.PNG)

-When the GM summons the creatures, the tokens are added near the summoner.

![gm_makes_tokens.PNG](assets/)

-The player who summoned them can control the tokens and view their sheets

![sheet](assets/player_has_sheets.PNG)

-If there is an active combat, the conjured animals roll a single initiative and join the combat automatically

![token combat](assets/tokens_added_to_combat.PNG)

-They can be added to a later combat with a button, or removed altogether with a button.
all from the first chat message
![Chat message](assets/player_summon_chat_message.PNG)

## Configuration
Everything comes ready to go, but there are options you can change.


-The settings allow the GM to chose the weights for the CR rolling
![CR weights](assets/cr_weight_settings.PNG)

-The settings also allow the GM to chose a different compendium to load creatures from
![compendium choices](assets/compendium_setting_dropdown.PNG)

-When selecting another compendium, the GM must chose which subfolders are used
![Subfolders](assets/subfolder_select.PNG)

-and which actors to use
![Actor choice](assets/actor_select.PNG)
-by default, all of the animals explicitely mentioned in the "Conjure Animals" spell are loaded




