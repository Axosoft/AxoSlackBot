var fs = require('fs')

var config = {};

//set defaults
config.port = 3004;
config.axosoftClientId = '4b62de06-1f39-41f7-ae38-37ec5262478a'

var prefix = process.env.BUILD_LIFECYCLE;

if (process.env.BUILD_LIFECYCLE == 'dev') {
    config.clientId = '2574228432.116076023584';
}
else if (process.env.BUILD_LIFECYCLE == 'staging') {
    config.clientId = '2574228432.117458216726';
}

else if (process.env.BUILD_LIFECYCLE == 'production') {
    config.clientId = '2574228432.104777884963';
    prefix = '';    
}

config.baseUri = 'https://'+ prefix + 'slackbot.axosoft.com';
config.mongoUri = 'mongodb://localhost:27017/slackData'

if (process.env.AXO_slackbot_secret && process.env.AXO_slackbot_axosoft_secret) {
console.log('updating config file...')
    config.clientSecret = process.env.AXO_slackbot_secret;
    config.axosoftClientSecret = process.env.AXO_slackbot_axosoft_secret;
}

// write to file
fs.writeFileSync('./config.json', JSON.stringify(config));
