"use strict";

const DefaultSettings = {
    human: false,
    tab: false,
    blacklist: []
};

module.exports = function MigrateSettings( from_ver, to_ver, settings ) {
    if ( from_ver === undefined ) {
        // Migrate legacy config file
        return Object.assign( Object.assign({}, DefaultSettings ), settings );
    } else if ( from_ver === null ) {
        // No config file exists, use default settings
        return DefaultSettings;
    } else {
        let migratedSettings = Object.assign({}, settings );
        // Migrate from older/newer version (using the new system) to latest one
        // upgrade...
        for ( let cur_ver = from_ver; cur_ver < to_ver; cur_ver++ ) {
            switch ( cur_ver ) {
                case 1:
                default:
                    throw new Error( "So far there is only one settings version and this should never be reached!" );
            }
        }
        if ( from_ver > to_ver ) migratedSettings = Object.assign( Object.assign({}, DefaultSettings ), settings );
        // downgrade...
        for ( let cur_ver = from_ver; cur_ver > to_ver; cur_ver-- );

        return migratedSettings;
    }
};
