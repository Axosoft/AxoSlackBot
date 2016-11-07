var fs = require('fs')

console.log('writing config file...')
if (process.env.AXO_slackbot_config) {
  fs.writeFileSync('../config.json', process.env.AXO_slackbot_config)
}