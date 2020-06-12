module.exports = function Banker(mod) {
  const BANK_CONTRACT = 26;
  const BANK_TYPE = 1;
  const BANK_PAGE_SLOTS = 72;
  const PAGE_CHANGE_TIMEOUT = 1000;
  const ERROR = '#ff0000';

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
    ANY: 3})

  let disabled;
  let bankInventory;
  let bankOffsetStart;
  let currentContract;
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
    }
  });

  mod.hook('S_VIEW_WARE_EX', 2, event => {
    if (!mod.game.me.is(event.gameId))
        return;

    if (event.container == BANK_TYPE) {
      currentContract = BANK_CONTRACT;
      bankInventory = event;
      if (onNextOffset) onNextOffset(event);
    }
  });
  mod.hook('C_GET_WARE_ITEM', "*", event => {
    tryBlacklistNext(event, false);
  });
  mod.hook('C_PUT_WARE_ITEM', 3, event => {
    tryBlacklistNext(event, true);
  });

  mod.command.add('bank', {
    $default() {
      argsError();
    },
    human() {
      mod.settings.human = !mod.settings.human;
      saveConfig();
      msg('Human mode ' + (mod.settings.human ? 'enabled' : 'disabled'));
    },
    tab() {
      if (checkDisabled()) return;
      //force deposit tab
      if (checkBankOpen()) {
        msg('Depositing items in this tab');
        autoDeposit(false);
      }
    },
    all() {
      if (checkDisabled()) return;
      //force deposit all
      if (checkBankOpen()) {
        msg('Depositing items in all tabs');
        depositAllTabs();
      }
    },
    mode() {
      //update tab mode
      mod.settings.tab = !mod.settings.tab;
      saveConfig();
      msg('Single tab mode ' + (mod.settings.tab ? 'enabled' : 'disabled'));
    },
    blacklist(...args) {
      processBlacklistCommand(args);
    },
    bl(...args){
      processBlacklistCommand(args);
    },
    $none() {
      if (checkDisabled()) return;
      //deposit based on settings
      if (checkBankOpen()) {
        blacklistMode = BlacklistModes.NONE;
        msg('Depositing items in ' + (mod.settings.tab ? 'this tab' : 'all tabs'));
        if (mod.settings.tab) {
          autoDeposit(false);
        } else {
          depositAllTabs();
        }
      }
    }
  });

  function argsError() {
    msg('Invalid arguments.', ERROR);
  }

  function checkDisabled() {
    if (disabled)
      msg('Banker is disabled. Add the required protocol maps to the tera-data folder.', ERROR);
    return disabled
  }

  function depositAllTabs() {
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
            msg(`Next item deposited or retrieved will be added to blacklist`);
          } else if (args.length == 2 && isNormalInteger(args[1])) {
            msg(`Item ${args[1]} added to blacklist`);
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
            msg(`Next item deposited or retrieved will be removed from blacklist`);
          } else if (args.length == 2 && isNormalInteger(args[1])) {
            msg(`Item ${args[1]} removed from blacklist`);
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
            msg('Next banked or retrieved items will be blacklisted');
            msg('Use "bank blacklist mode" to disable');
          } else {
            msg('Blacklist mode disabled');
          }
          break;
        case 'clear':
          msg('Blacklist cleared');
          blacklist.clear();
          saveConfig();
          break;
        case 'list':
          if (blacklist.size == 0) {
            msg('Blacklist is empty.');
          } else {
            msg('Blacklist items:');
            for (let item of blacklist)
              msg(item);
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
      msg(`Item ${item.id} added to blacklist`);
      saveConfig();
    } else if (blacklistMode == BlacklistModes.REMOVE || (blacklistMode == BlacklistModes.ANY && store)) {
      blacklist.delete(item.id);
      msg(`Item ${item.id} removed from blacklist`);
      saveConfig();
    }

    if (blacklistMode != BlacklistModes.ANY)
      blacklistMode = BlacklistModes.NONE;
  }

  function checkBankOpen() {
    if (currentContract != BANK_CONTRACT) {
      msg('Bank must be open to use banker module', ERROR);
      return false;
    }

    return true;
  }

  function autoDeposit(allTabs) {
    let bagItems = mod.game.inventory.bagOrPocketItems.slice(0);
    let bankItems = bankInventory.items.slice(0);

    // Sort inventory such that they are sorted by stack size when id is equal and
    // reverse sorted by slot when also stack sizes are equal.
    // By using this sorting, you don't need to care about restacked stacks.
    // E.g. you've got 200x Metamorphic Emblems in slot 3 and
    // 200x Metamorphic Emblems in slot 6. If you would deposit slot 3 first, the inventory
    // will move the 200x emblems of slot 6 to slot 3. So, the next slot to deposit would be
    // slot 3 again.
    // Depositing slot 6 first counters this behaviour. Next slot would be 3.
    bagItems.sort((a, b) => a.id == b.id ? (a.amount == b.amount ? b.slot - a.slot : a.amount - b.amount) : a.id - b.id);
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
          changeBankOffset(next, () => undefined );
        }
      }
    }

    depositNext();
  }

  function depositItem(bagItem, offset) {
    mod.send('C_PUT_WARE_ITEM', 3, {
      gameId: mod.game.me.gameId,
      container: BANK_TYPE,
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
    return bankOffsetStart ? getNextOffset(bank) != bankOffsetStart : false;
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
        msg(`Failed to load bank page ${(offset % BANK_PAGE_SLOTS) + 1}.`, ERROR);
    }, PAGE_CHANGE_TIMEOUT);

    setTimeout(() => {
      mod.send('C_VIEW_WARE', 2, {
        gameId: mod.game.me.gameId,
        type: BANK_TYPE,
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
        let errorText = missing.join(', ') + ' are missing in the protocol map. Install missing protocols before using banker.';
        msg(errorText, ERROR);
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
      mod.command.message(`<font color="${color}"> ${text}</font>`);
    else
      mod.command.message(` ${text}`);
  }
};
