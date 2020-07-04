# Banker

Depositing items made easier.

Banker removes the tedium of depositing commonly acquired items. It works by automatically storing inventory items that are also in your bank. Banker will not touch any inventory items that are not already in your bank. You can configure Banker to which bank type it is allowed to deposit (default is personal bank and pet bank) and if it should only use pockets, the main inventory or both (default is main only).

## Installation

### Tera-Toolbox

- Copy all files from `protocol/defs/` into definitions at `TeraToolbox/data/definitions`
- Copy or merge the map file from `protocol/map/` into opcodes at `TeraToolbox/data/opcodes`<br>
  (Use the map file for your version of Tera. If you are not sure just copy them all.)

### Tera-Proxy

- Copy all files from `protocol/defs/` into tera-data at `tera-proxy/node_modules/tera-data/protocol`

- Copy or merge the map file from `protocol/map/` into tera-data at `tera-proxy/node_modules/tera-data/map`<br>
  (Use the map file for your version of Tera. If you are not sure just copy them all.)

## Usage

All commands should by typed into the tera-toolbox channel `/8` or prefixed with a `!`<br>
Ex. `/8 bank` or `!bank`

### Basic Usage:

Open bank.<br>
Type `bank` to deposit all matching items in your inventory to the bank.<br>
Items on the blacklist will not be deposited.

### Command List:

Command                        | Short Form         | Description
------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
bank                           |                    | Deposits matching items to bank. (Default mode is all tabs)
bank **mode**                  |                    | Toggles the default deposit mode. Modes are 'all tabs' or 'single tab' (Default is all tabs)
bank **tab**                   |                    | Deposits matching items to bank in the current tab only.
bank **all**                   |                    | Deposits matching items to bank in all tabs.
bank **human**                 |                    | Toggle human-like delays (Default is off)
bank **auto**                  |                    | Toggles automatic bank mode. If activated, it deposits items automatically when a bank is opened. It also depends on tab mode (single tab or all tabs). Please consider: If tab mode is set to single mode it will only deposit automatically in first tab. (Default is manual mode)
bank **blacklist mode**        | bank **bl mode**   | Toggle blacklist mode. See below for blacklist usage
bank **blacklist add**         | bank **bl a**      | The next item moved will be added to the blacklist
bank **blacklist add** `id`    | bank **bl a** `id` | Add the item id to the blacklist
bank **blacklist remove**      | bank **bl r**      | The next item moved will be removed from the blacklist
bank **blacklist remove** `id` | bank **bl r** `id` | Remove the item id from the blacklist
bank **blacklist clear**       | bank **bl clear**  | Clear the blacklist
bank **settings**              |                    | List current settings.
bank **personal**              |                    | Toggle allow depositing in personal bank (Default is enabled)
bank **pet**                   |                    | Toggle allow depositing in pet bank (Default is enabled)
bank **guild**                 |                    | Toggle allow depositing in guild bank (Default is disabled)
bank **wardrobe**              |                    | Toggle allow depositing in wardrobe bank (Default is disabled)
bank **bag**                   |                    | Toggle allow depositing from (main) bag (Default is enabled)
bank **pockets**               |                    | Toggle allow depositing from pockets (Default is disabled)

### Blacklist Mode

Blacklist mode allows for adding or removing items from the backlist without item ids.<br>
In blacklist mode:

- All items retrieved from the bank will be added to the blacklist.
- All items stored in the bank will be removed from the blacklist.
