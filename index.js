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

  mod.hook('S_VIEW_WARE_EX', 1, event => {
    if (!mod.game.me.is(event.gameId))
        return;
    
    if (event.type == BANK_TYPE) {
      mod.log('bank updated');
      currentContract = BANK_CONTRACT;
      bankInventory = event;
      if (onNextOffset) onNextOffset(event);
    }
  });

  mod.hook('C_GET_WARE_ITEM', 3, event => {
    mod.log('get');
    mod.log(event);
    tryBlacklistNext(event);
  });
  mod.hook('C_GET_WARE_ITEM', 3, {filter:{fake: true}}, event => {
    mod.log('get fake');
    mod.log(event);
  });
  mod.hook('C_PUT_WARE_ITEM', 3, event => {
    mod.log('put');
    mod.log(event);
    tryBlacklistNext(event);
  });
  mod.hook('C_PUT_WARE_ITEM', 3, {filter:{fake: true}}, event => {
    mod.log('put fake');
    mod.log(event);
  });

  mod.hook('C_VIEW_WARE', 2, event => {
    mod.log('view');
    mod.log(event);
  });
  mod.hook('C_VIEW_WARE', 2, {filter:{fake: true}}, event => {
    mod.log('view fake');
    mod.log(event);
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
        autoDeposit(false);
      }
    },
    all() {
      if (checkDisabled()) return;
      //force deposit all
      if (checkBankOpen()) {
        if (bankInventory.offset != 0) {
          changeBankOffset(0, () => {
            autoDeposit(true);
          });
          return;
        }
        autoDeposit(true);
      }
    },
    mode() {
      //update tab mode
      mod.settings.tab = !mod.settings.tab;
      saveConfig();
      msg('Single tab mode ' + (mod.settings.tab ? 'enabled' : 'disabled'));
    },
    blacklist(...args) {
      if (checkArgs(args, 1)) {
        switch (args[0]) {
          case 'a':
          case 'add':
            if (args.length == 1) {
              if (checkDisabled()) return;
              blacklistMode = blacklistMode ? BlacklistModes.NONE : blacklistModes.ADD;
            } else if (Number.isInteger(args[1]) && args[1] > 0) {
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
              blacklistMode = blacklistMode ? BlacklistModes.NONE : blacklistModes.REMOVE;
            } else if (Number.isInteger(args[1]) && args[1] > 0) {
              msg(`Item ${args[1]} removed from blacklist`);
              blacklist.add(args[1]);
              saveConfig();
            } else {
              argsError();
            }
            break;
          case 'mode':
            if (checkDisabled()) return;
            blacklistMode = blacklistMode ? BlacklistModes.NONE : blacklistModes.ANY;
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
        }
      }
    },
    bl(...args){
      blacklist(args);
    },
    $none() {
      if (checkDisabled()) return;
      //deposit based on settings
      if (checkBankOpen()) {
        blacklistMode = BlacklistModes.NONE;
        autoDeposit(!mod.settings.tab);
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

  function tryBlacklistNext(item) {
    if (blacklistNext || blacklistNextAll) {
      blacklist.add(item.id);
      msg(`Item ${item.id} added to blacklist`);
      blacklistNext = false;
    }
  }

  function checkBankOpen() {
    if (currentContract != BANK_CONTRACT) {
      msg('Bank must be open to use banker module', ERROR);
      return true;
    }

    return false;
  }

  function autoDeposit(allTabs) {
    let bagItems = mod.game.inventory.bagItems.slice(0);
    let bankItems = bankInventory.items.slice(0);

    bagItems.sort((a, b) => a.id - b.id);
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
          bIdx++;

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
        if (next != undefined) {
          changeBankOffset(next, () => autoDeposit(allTabs));
        }
      }
    }

    depositNext();
  }

  function depositItem(bagItem, offset) {
    mod.send('C_PUT_WARE_ITEM', 3, {
      gameId: mod.game.me.gameId,
      type: BANK_TYPE,
      page: offset,
      money: 0,
      pocket: 0,
      pocket: bagItem.pocket,
      invenPos: bagItem.slot,
      id: bagItem.id,
      dbid: bagItem.dbid,
      amount: bagItem.amount,
      bankPos: offset
    });
  }

  function getNextOffset(bank) {
    if (bank.offset + BANK_PAGE_SLOTS < bank.slots)
      return bank.offset + BANK_PAGE_SLOTS;
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
        msg('Failed to load next bank page.', ERROR);
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
    blacklistNext = new Set(mod.settings.blacklist);
  }

  function saveConfig() {
    mod.settings.blacklist = Array.from(blacklistNext);
    mod.saveSettings();
  }

  function validateProtocolMap() {
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

  function msg(text, color) {
    if (color !== undefined)
      mod.command.message(`<font color="${color}"> ${text}</font>`);
    else
      mod.command.message(` ${text}`); 
  }
};