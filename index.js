module.exports = function Banker(mod) {
  const BANK_CONTRACT = 26;
  //1 = Bank, 3 = Guild Bank, 9 = Pet, 12 = Wardrobe
  // const BANK_TYPE = 1;
  const BANK_PAGE_SLOTS = 72;
  const INV_SLOTS = 120; // aka pocket 0
  const POCKET_SLOTS = 80;
  const PAGE_CHANGE_TIMEOUT = 1000;
  const COLOR_ERROR = '#dd0000';
  const COLOR_COMMAND = '#08ffda';
  const COLOR_SUB_COMMAND = '#ff7a00';
  const COLOR_VALUE = '#59f051';

  const PROTOCOLS = [
    'C_GET_WARE_ITEM',
    'C_PUT_WARE_ITEM',
    'C_VIEW_WARE',
    'S_VIEW_WARE_EX'
  ];

  const BlacklistModes = Object.freeze({
    NONE: 0,
    REMOVE: 1,
    ADD: 2,
    ANY: 3 });

  const IdBankTypes = Object.freeze({
    1: "personal",
    3: "guild",
    9: "pet",
    12: "wardrobe",
  });

  let disabled;
  let lastOffset;
  let deposited = false;
  let bankInventory;
  let bankOffsetStart;
  let currentContract;
  let currentBankTypeId;
  let onNextOffset;
  let blacklist = new Set();

  let blacklistMode = BlacklistModes.NONE;

  loadConfig();

  //we are already in a game, mod was likely reloaded
  if (mod.game.me.gameId) {
    validateProtocolMap();
  }
  mod.game.on('enter_game', () => {
    validateProtocolMap();
  });

  if (disabled)
    return;

  //started or closed contract (window)
  mod.hook('S_REQUEST_CONTRACT', 1, event => {
    if (mod.game.me.is(event.senderId)) {
      currentContract = event.type;
    }
  });
  mod.hook('S_CANCEL_CONTRACT', 1, event => {
    if (mod.game.me.is(event.senderId)) {
      currentContract = null;
      currentBankTypeId = null;
      lastOffset = null;
      deposited = false;
    }
  });

  mod.hook('S_VIEW_WARE_EX', 2, event => {
    if (!mod.game.me.is(event.gameId))
      return;

    currentBankTypeId = event.container;
    bankInventory = event;

    if (mod.settings.auto  && blacklistMode == BlacklistModes.NONE) {
      if(mod.settings.tab) {
        if(lastOffset !== event.offset) deposit();
      } else {
        if(!deposited) deposit();
        deposited = true;
      }
    }
    if(currentContract == BANK_CONTRACT
      && mod.settings.depositIn[IdBankTypes[currentBankTypeId]]
      && onNextOffset) onNextOffset(event);
  });
  mod.hook('C_GET_WARE_ITEM', "*", event => {
    tryBlacklistNext(event, false);
  });
  mod.hook('C_PUT_WARE_ITEM', 3, event => {
    tryBlacklistNext(event, true);
  });
  // TODO react on sort and item movement:
  // C_APPLY_INVEN_POCKET_SORT
  // C_MOVE_ITEM

  mod.command.add('bank', {
    $default() {
      argsError();
    },
    pockets() { toggleBankFrom("pockets"); },
    bag() { toggleBankFrom("bag"); },
    personal() { toggleBankInto("personal"); },
    pet() { toggleBankInto("pet"); },
    guild() { toggleBankInto("guild"); },
    wardrobe() { toggleBankInto("wardrobe"); },
    settings: printSettings,
    auto() {
      mod.settings.auto = !mod.settings.auto;
      saveConfig();
      sendMsg(`Auto mode ${msg(mod.settings.auto ? 'enabled' : 'disabled',COLOR_VALUE)}`);
    },
    human() {
      mod.settings.human = !mod.settings.human;
      saveConfig();
      sendMsg(msg(`Switched to ${mod.settings.human? '"human-like (slow)"' : '"fast"'} depositing speed`));
    },
    tab() {
      if (checkDisabled()) return;
      //force deposit tab
      if (checkBankOpen()) {
        sendMsg('Depositing items in this tab');
        autoDeposit(false);
      }
    },
    all() {
      if (checkDisabled()) return;
      //force deposit all
      if (checkBankOpen()) {
        sendMsg('Depositing items in all tabs');
        depositAllTabs();
      }
    },
    mode() {
      //update tab mode
      mod.settings.tab = !mod.settings.tab;
      saveConfig();
      sendMsg(msg(`Switched to ${mod.settings.tab ? '"single tab"' : '"all tabs"'} mode`));
    },
    blacklist(...args) {
      processBlacklistCommand(args);
    },
    bl(...args){
      processBlacklistCommand(args);
    },
    help(){
      let cmds = {
        "auto": "Toggle auto depositing when opening bank.",
        "human": "Toggle human-like delays (Default is off)",
        "mode": `Switch between ${msg("single tab",COLOR_VALUE)} mode and ${msg("all tabs",COLOR_VALUE)} mode.`,
        "tab": "Deposit in current tab.",
        "all": "Deposit in all tabs.",
        "bl | blacklist" : {
          "": "Manipulates the blacklist. Sub commands are listed below:",
          "a | add": "Adds the next banked/retrieved item to blacklist.",
          "r | remove": "Removes the next banked/retrieved item from blacklist.",
          "mode": "Enables/Disables blacklist mode. Adds retrieved items to blacklist and removes banked items from blacklist.",
          "clear": "Empty blacklist",
          "list": "List current blacklisted items."
        },
        settings: "List current settings.",
        personal: "Toggle allow depositing in personal bank (Default is enabled)",
        pet: "Toggle allow depositing in pet bank (Default is enabled)",
        guild: "Toggle allow depositing in guild bank (Default is disabled)",
        wardrobe: "Toggle allow depositing in wardrobe bank (Default is disabled)",
        bag: "Toggle allow depositing from (main) bag (Default is enabled)",
        pockets: "Toggle allow depositing from pockets (Default is disabled)",
      };
      sendMsg(`Usage: ${msg("bank",COLOR_COMMAND)} to deposit items to all tabs or current tab.`);
      let msgs = [];
      msgs.push(`Usage: ${msg("bank command",COLOR_COMMAND)}`);
      msgs.push(`${msg("command", COLOR_COMMAND)} is one of the commands below:`);
      for(let cmd in cmds) {
        if(typeof cmds[cmd] == 'string')
          msgs.push(msgForCmd(cmd, cmds[cmd]));
        else {
          msgs.push(`   ${msg(cmd, COLOR_COMMAND)} ${msg("&lt;sub-command&gt;", COLOR_SUB_COMMAND)}: ${cmds[cmd][""]}`);
          for(let subCmd in cmds[cmd]) {
            if(subCmd.length) msgs.push(`   ${msgForCmd(subCmd, cmds[cmd][subCmd], COLOR_SUB_COMMAND)}`);
          }
        }
      }
      sendMsg(msgs.join("\n"));

    },
    $none() {
      if (checkDisabled()) return;
      //deposit based on settings
      if (checkBankOpen()) {
        deposit();
      }
    }
  });

  function msgForCmd(cmd, message, color) {
    return `   ${msg(cmd, color ? color : COLOR_COMMAND)}: ${message}`;
  }

  function deposit() {
    blacklistMode = BlacklistModes.NONE;
    sendMsg(`Depositing items in ${mod.settings.tab ? 'this tab' : 'all tabs'}`);
    if (mod.settings.tab) {
      autoDeposit(false);
    } else {
      depositAllTabs();
    }
  }

  function argsError() {
    sendMsg(msg(`Invalid arguments."`, COLOR_ERROR));
    sendHelpInfoMsg();
  }

  function toggleBankInto(type) {
    mod.settings.depositIn[type] = !mod.settings.depositIn[type];
    saveConfig();
    msg(`Depositing in ${type} bank ${mod.settings.depositIn[type] ? 'enabled' : 'disabled'}`);
  }

  function toggleBankFrom(type) {
    mod.settings.depositFrom[type] = !mod.settings.depositFrom[type];
    saveConfig();
    msg(`Depositing from ${type} ${mod.settings.depositFrom[type] ? 'enabled' : 'disabled'}`);
  }

  function settingsObjectToString(obj) {
    let deposit = { true: [], false: [] };
    let message = "";
    for(let type in obj)
      if(obj[type]) deposit.true.push(`${type}`);
      else deposit.false.push(`${type}`);
    if(deposit.true.length > 0) message += `${deposit.true.join(', ')}`;
    if(deposit.false.length > 0) message += ` (Not: ${deposit.false.join(', ')})`;
    return message;
  }

  function printSettings() {
    let message = "Depositing items:";
    message += `\nIn:   ${settingsObjectToString(mod.settings.depositIn)}`;
    message += `\nFrom: ${settingsObjectToString(mod.settings.depositFrom)}`;
    msg(message);
    msg(`Depositing speed: ${mod.settings.human? '"Human-like (slow)"' : '"Fast"'}`);
    msg(`Tab mode: ${mod.settings.tab ? '"Single tab"' : '"All tabs"'}`);
  }

  function checkDisabled() {
    if (disabled)
      sendMsg(msg('Banker is disabled. Add the required protocol maps to the tera-data folder.', COLOR_ERROR));
    return disabled;
  }

  function depositAllTabs() {
    if(!bankInventory) return;
    bankOffsetStart = bankInventory.offset;
    autoDeposit(true);
  }

  function processBlacklistCommand(args) {
    if (args.length >= 1) {
      switch (args[0]) {
        case 'a':
        case 'add':
          if (args.length == 1) {
            if (checkDisabled()) return;
            blacklistMode = blacklistMode ? BlacklistModes.NONE : BlacklistModes.ADD;
            sendMsg(`Next item deposited or retrieved will be added to blacklist`);
          } else if (args.length == 2 && isNormalInteger(args[1])) {
            sendMsg(`Item ${msg(args[1],COLOR_VALUE)} added to blacklist`);
            blacklist.add(args[1]);
            saveConfig();
          } else {
            argsError();
          }
          break;
        case 'r':
        case 'remove':
          if (args.length == 1) {
            if (checkDisabled()) return;
            blacklistMode = blacklistMode ? BlacklistModes.NONE : BlacklistModes.REMOVE;
            sendMsg(`Next item deposited or retrieved will be removed from blacklist`);
          } else if (args.length == 2 && isNormalInteger(args[1])) {
            sendMsg(`Item ${msg(args[1],COLOR_VALUE)} removed from blacklist`);
            blacklist.add(args[1]);
            saveConfig();
          } else {
            argsError();
          }
          break;
        case 'mode':
          if (checkDisabled()) return;
          blacklistMode = blacklistMode ? BlacklistModes.NONE : BlacklistModes.ANY;
          if (blacklistMode) {
            sendMsg('Next retrieved items will be add to and banked items will be removed from blacklist');
            sendMsg(`Use ${msg("bank blacklist mode",COLOR_COMMAND)} to finish mode`);
          } else {
            sendMsg(msg('Blacklist mode disabled'));
          }
          break;
        case 'clear':
          sendMsg(msg('Blacklist cleared'));
          blacklist.clear();
          saveConfig();
          break;
        case 'list':
          if (blacklist.size == 0) {
            sendMsg('Blacklist is empty.');
          } else {
            sendMsg('Blacklist items:');
            for (let item of blacklist)
              sendMsg(item);
          }
          break;
      }
    } else {
      argsError();
    }
  }

  function tryBlacklistNext(item, store) {
    if (blacklistMode == BlacklistModes.ADD || (blacklistMode == BlacklistModes.ANY && !store)) {
      blacklist.add(item.id);
      sendMsg(msg(`Item ${msg(item.id, COLOR_VALUE)} added to blacklist`));
      saveConfig();
    } else if (blacklistMode == BlacklistModes.REMOVE || (blacklistMode == BlacklistModes.ANY && store)) {
      blacklist.delete(item.id);
      sendMsg(`Item ${msg(item.id, COLOR_VALUE)} removed from blacklist`);
      saveConfig();
    }

    if (blacklistMode != BlacklistModes.ANY)
      blacklistMode = BlacklistModes.NONE;
  }

  function checkBankOpen(ignoreOutput) {
    if (currentContract != BANK_CONTRACT) {
      if(!ignoreOutput)
        sendMsg(msg('Bank must be open to use banker module.', COLOR_ERROR));
      return false;
    } else if (!mod.settings.depositIn[IdBankTypes[currentBankTypeId]]) {
      if(!ignoreOutput)
        sendMsg(msg('Not allowed to bank here. Check "bank settings" if you did not expected this.', COLOR_ERROR));
      return false;
    }
    return true;
  }

  function sendHelpInfoMsg() {
    sendMsg(msg(`For more help and command list use `)
      +msg(`bank help`, COLOR_COMMAND)
    );
  }

  function autoDeposit(allTabs) {
    let bagItems;
    switch((mod.settings.depositFrom.bag && 0b1)
      | (mod.settings.depositFrom.pockets && 0b10)) {
      case 0b1: bagItems = mod.game.inventory.bagItems; break;
      case 0b10: bagItems = mod.game.inventory.items.filter(item => mod.game.inventory.isInPockets(item)); break;
      case 0b11: bagItems = mod.game.inventory.bagOrPocketItems; break;
      default: bagItems = [];
    }
    let bankItems = bankInventory.items;

    // Sort inventory such that they are sorted by stack size when id is equal and
    // reverse sorted by slot when also stack sizes are equal. Items in higher pockets
    // behaves like higher slot number.
    // By using this sorting, you don't need to care about restacked stacks.
    // E.g. you've got 200x Metamorphic Emblems in slot 3 and
    // 200x Metamorphic Emblems in slot 6. If you would deposit slot 3 first, the
    // inventory will move the 200x emblems of slot 6 to slot 3. So, the next slot
    // to deposit would be slot 3 again.
    // Depositing slot 6 first counters this behaviour. Next slot would be 3.
    bagItems.sort((a, b) =>
      a.id != b.id ? a.id - b.id
        : a.amount != b.amount ? a.amount - b.amount
          : (b.pocket > 0 ? (b.pocket - 1) * POCKET_SLOTS + INV_SLOTS : 0) + b.slot
          - ((a.pocket > 0 ? (a.pocket - 1) * POCKET_SLOTS + INV_SLOTS : 0) + a.slot));
    bankItems.sort((a, b) => a.id - b.id);
    let aIdx = 0;
    let bIdx = 0;

    let depositNext = function () {
      //iterate both lists and find matching items to deposit
      while (aIdx < bagItems.length && bIdx < bankItems.length) {
        if (bagItems[aIdx].id === bankItems[bIdx].id) {
          if (currentContract != BANK_CONTRACT)
            return;
          if (!blacklist.has(bagItems[aIdx].id))
            depositItem(bagItems[aIdx], bankInventory.offset);

          aIdx++;

          setTimeout(() => {
            depositNext();
          }, getRandomDelay());
          return;
        } else if (bagItems[aIdx].id < bankItems[bIdx].id) {
          aIdx++;
        } else {
          bIdx++;
        }
      }

      if (allTabs) {
        let next = getNextOffset(bankInventory);
        if (hasNextOffset(bankInventory)) {
          changeBankOffset(next, () => autoDeposit(allTabs));
        } else {
          sendMsg(msg("Finished depositing all tabs"));
          changeBankOffset(next, () => undefined);
        }
      } else {
        sendMsg(msg(`Finished depositing tab ${bankInventory.offset / BANK_PAGE_SLOTS + 1}`));
      }
    };

    depositNext();
  }

  function depositItem(bagItem, offset) {
    mod.send('C_PUT_WARE_ITEM', 3, {
      gameId: mod.game.me.gameId,
      container: currentBankTypeId,
      offset: offset,
      money: 0,
      fromPocket: bagItem.pocket,
      fromSlot: bagItem.slot,
      id: bagItem.id,
      dbid: bagItem.dbid,
      amount: bagItem.amount,
      toSlot: offset
    });
  }

  function getNextOffset(bank) {
    return (bank.offset + BANK_PAGE_SLOTS) % bank.numUnlockedSlots;
  }

  function hasNextOffset(bank) {
    return bankOffsetStart != undefined ? getNextOffset(bank) != bankOffsetStart : false;
  }

  function changeBankOffset(offset, callback) {
    let bankLoaded;
    onNextOffset = event => {
      bankLoaded = true;
      onNextOffset = false;
      callback(event);
    };

    setTimeout(() => {
      if (!bankLoaded)
        sendMsg(msg(`Failed to load bank tab ${(offset / BANK_PAGE_SLOTS) + 1}.`, COLOR_ERROR));
    }, PAGE_CHANGE_TIMEOUT);

    setTimeout(() => {
      mod.send('C_VIEW_WARE', 2, {
        gameId: mod.game.me.gameId,
        type: currentBankTypeId,
        offset: offset
      });
    }, getRandomDelay());
  }

  function loadConfig() {
    blacklist = new Set(mod.settings.blacklist);
  }

  function saveConfig() {
    mod.settings.blacklist = Array.from(blacklist);
    mod.saveSettings();
  }

  function validateProtocolMap() {
    if (disabled)
      return;

    try {
      let missing = [];
      disabled = false;

      for (var name of PROTOCOLS) {
        var valid = mod.dispatch.protocolMap.name.get(name);
        if (valid === undefined || valid == null) {
          missing.push(name);
        }
      }

      if (missing.length) {
        let errorText = msg(missing.join(', '),COLOR_VALUE)
            + msg(' are missing in the protocol map. Install missing protocols before using banker.', COLOR_ERROR);
        sendMsg(errorText);
        mod.error(errorText);
        disabled = true;
      }
    } catch (e) {
      mod.error(e);
    }
  }

  function getRandomDelay() {
    if (mod.settings.human) {
      return 300 + Math.floor(gaussianRand() * 200);
    } else {
      return 50 + Math.floor(Math.random() * 100);
    }
  }

  function gaussianRand() {
    let rand = 0;
    for (var i = 0; i < 6; i += 1) {
      rand += Math.random();
    }
    return rand / 6;
  }

  function isNormalInteger(str) {
    let n = Math.floor(Number(str));
    return n !== Infinity && String(n) === str && n >= 0;
  }

  function msg(text, color) {
    if (color !== undefined)
      return `<font color="${color}">${text}</font>`;
    else
      return `${text}`;
  }

  function sendMsg(text) {
    mod.command.message(text);
  }
};
