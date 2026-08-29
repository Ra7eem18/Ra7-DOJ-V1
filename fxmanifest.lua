fx_version 'cerulean'
game 'gta5'
lua54 'yes'

author 'Ra7eem'
description 'Ra7 Dev : https://discord.gg/WCnn2KBZJB'
version '1.0'

shared_scripts {
    '@ox_lib/init.lua',
    'config.lua',
    'shared/shared.lua'
}

client_scripts {
    'client/main.lua'
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server/main.lua'
}

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/css/style.css',
    'html/js/locale.js',
    'html/js/app.js'
}

dependencies {
    'qb-core',
    'oxmysql',
    'ox_lib'
}
