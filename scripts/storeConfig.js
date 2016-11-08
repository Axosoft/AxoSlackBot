var fs = require('fs')

var config = {};

//set defaults
config.clientId = '82854487175.85597041971';
config.port = 4114;
config.axosoftClientId = "d4a4d398-2578-4cc7-a1cf-1b4a02330774"

if (process.env.NODE_ENV == 'development') {
config.redirectUri = 'devslackbot.axosoft.com:4114',
config.mongoUri = "mongodb://devslackbot.axosoft.com:27017/slackData"
}

if (process.env.NODE_ENV == 'production') {
config.redirectUri = 'slackbot.axosoft.com:4114',
config.mongoUri = "mongodb://slackbot.axosoft.com:27017/slackData"
}

if (process.env.AXO_slackbot_secret && process.env.AXO_slackbot_axosoft_secret) {
console.log('updating config file...')
    config.clientSecret = process.env.AXO_slackbot_secret;
    config.axosoftClientSecret = process.env.AXO_slackbot_axosoft_secret;
}

// write to file
console.log(config);
fs.writeFileSync('./config.json', JSON.stringify(config));