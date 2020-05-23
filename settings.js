"use strict";

const DefaultSettings = {
  human: false,
  tab: false,
  depositFrom:{
    bag: true,
    pockets: false,
  },
  depositIn: {
    personal: true,
    pet: true,
    wardrobe: false,
    guild: false,
  },
  auto: false,
  blacklist: [],
};

module.exports = function MigrateSettings(from_ver, to_ver, settings) {
  let defaultCopy = Object.assign({}, DefaultSettings);
  if (from_ver === null) {
    // No config file exists, use default settings
    return DefaultSettings;
  } else {
    // Migrate legacy config file
    return Object.assign(defaultCopy, settings);
  }
};
