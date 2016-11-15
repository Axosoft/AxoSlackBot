var fs = require('fs')

var config = {};

//set defaults
config.clientId = '2574228432.104777884963';
config.port = 3004;
config.axosoftClientId = '4b62de06-1f39-41f7-ae38-37ec5262478a'

var prefix = process.env.BUILD_LIFECYCLE;

if (prefix == 'production') {
    prefix = '';
}

config.redirectUri = prefix + 'slackbot.axosoft.com:3004';
config.mongoUri = 'mongodb://' + prefix + 'slackbot.axosoft.com:27017/slackData'

// test for process.env
console.log(process.env);

if (process.env.AXO_slackbot_secret && process.env.AXO_slackbot_axosoft_secret) {
console.log('updating config file...')
    config.clientSecret = process.env.AXO_slackbot_secret;
    config.axosoftClientSecret = process.env.AXO_slackbot_axosoft_secret;
}

// write to file
console.log(config);
fs.writeFileSync('./config.json', JSON.stringify(config));