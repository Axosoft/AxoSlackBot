const config = require('./config.json');
const helper = require('./helper.js');
const Botkit = require('botkit');
const request = require('request');
const MongoClient = require('mongodb').MongoClient;
const ObjectId = require('mongodb').ObjectID
const mongoStorage = require('botkit-storage-mongo')({mongoUri: config.mongoUri});
const urlEncode = require('urlencode');
const controller = Botkit.slackbot({storage: mongoStorage});
const qs = require('querystring');
const striptags = require('striptags');

if (!config.clientId || !config.clientSecret || !config.port) {
  console.log('Error: Specify clientId clientSecret and port in environment');
  process.exit(1);
}

controller.configureSlackApp({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri + "/oauth",
    scopes: ["identify","bot","commands","incoming-webhook"]
});

controller.setupWebserver(config.port,function(err,webserver) {
      webserver.get('/',function(req,res) {
        res.sendFile('index.html', {root: __dirname});
      });

    controller.createWebhookEndpoints(controller.webserver);

    controller.createOauthEndpoints(controller.webserver,function(err,req,res) {
      if (err) {
        res.status(500).send('ERROR: ' + err);
      } else {
        res.send('Success!');
      }
    });

    controller.webserver.get('/authorizationCode', function(req, res) {
        var code = req.query.code;
        var axoBaseUrl = req.headers.referer.substr(0, req.headers.referer.indexOf("auth"));
        var userId = req.query.state.split('&')[0].substring(req.query.state.split('&')[0].indexOf("=")+1);
        var teamId = req.query.state.split('&')[1].substring(req.query.state.split('&')[1].indexOf("=")+1);
        var channelId = req.query.state.split('&')[2].substring(req.query.state.split('&')[2].indexOf("=")+1);
        var params = {
          grant_type: "authorization_code",
          code: code,
          redirect_uri: config.redirectUri+ "authorizationCode",
          client_id: config.axosoftClientId,
          client_secret: config.axosoftClientSecret 
        };

        helper.makeRequest("GET", `${axoBaseUrl}/api/oauth2/token`, params, function(error, response, body){
            var Body = JSON.parse(body);
            if(Body.access_token != null){
                helper.saveAxosoftAcessToken(userId, teamId, Body.access_token);
                helper.retrieveDataFromDataBase(teamId, userId,"teams")
                .then(function(returnedDataFromDb){
                  slackToken = returnedDataFromDb.slackAccessToken;
                  helper.sendTextToSlack(slackToken, channelId, "Authorization successful.what can I do for ya boss?");
                  res.send('<html><head><title>Axosoft Slack Authorized</title></head><body><h1>Authorization successful</h1><br/><h4>please close this window</h4></body></html>');
                }).catch(function(reason){
                  console.log(reason);
                });
            }else{
                res.send('<html><head><title>Axosoft Slack Authorized</title></head><body><h1>Authorization failed</h1><br/><h4></h4></body></html>');
            }
        });
    });
});

//Just a simple way to make sure we don't connect to the RTM twice for the same team
var _bots = {};
function trackBot(bot) {
  _bots[bot.config.token] = bot;
}

controller.on('create_bot',function(bot,config) {
  if (_bots[bot.config.token]) {
    // already online! do nothing.
  } else {
    bot.startRTM(function(err) {
      if (!err) {
        trackBot(bot);
      }

      bot.startPrivateConversation({user: config.createdBy},function(err,convo) {
        if (err) {
          console.log(err);
        } else {
          convo.say('I am a bot that has just joined your team');
          convo.say('You must now /invite me to a channel so that I can be of use!');
        }
      });
    });
  }

});

//Handle events related to the websocket connection to Slack
controller.on('rtm_open',function(bot) {
  console.log('** The RTM api just connected!');
});


controller.on('rtm_close',function(bot) {
  console.log('** The RTM api just closed');
    // you may want to attempt to re-open
    // TODO reopen rtm if it's required!
    //   bot.startRTM(function(err) {
    //   if (!err) {
    //     trackBot(bot);
    //   }
    // });
});

controller.hears('(get my|get) (.*)(items)',['direct_message,direct_mention,mention'],function(bot,message) { 
    var channelId = message.channel;
    helper.checkForAxosoftAccessTokenForUser(message.team, message.user)
    .then(function(axosoftToken){
          var params = {
              access_token: axosoftToken,
              columns: "item_type,name,id,priority,due_date,workflow_step,custom_fields.custom_1",
              page_size: 10
          };
          if(message.match[2] == 'open ') {
            params.filters = 'completion_date="1899-01-01"';
          }
          if(message.match[2] == 'closed '){
            params.sort_fields = 'completion_date DESC';
          }
          if(message.match[2] == 'updated '){
            params.sort_fields = 'last_updated_date_time DESC';
          }

          //paging
          var page = 1;
          var pageMatches = message.text.match(/(.*)(page\s)(\d+)/i);

          if (pageMatches) {
            page = pageMatches[3];
            params.page = page;
          }

          helper.retrieveDataFromDataBase(message.team, message.user,"teams")
          .then(function(returnedData){
              var axoBaseUrl = returnedData.axosoftBaseURL;
              var slackToken = returnedData.slackAccessToken;

              helper.assignAxoId(message, params, axoBaseUrl, axosoftToken)
              .then(function(params){
                    helper.makeRequest("GET", `${axoBaseUrl}/api/v5/features`, params, function(error, response, body){
                    if(!error && response.statusCode == 200){
                        var BODY = JSON.parse(body);
                        if(BODY.data.length == 0){
                          if(message.text.includes("page")){
                              helper.sendTextToSlack(slackToken, channelId, `I could not find any \`${message.match[2]}\` features on page ${page}!`)
                          }
                          else if(params.filters.includes("assigned_to")){
                              helper.sendTextToSlack(slackToken, channelId, `I could not find any \`${message.match[2]}\` features assigned to you in Axosoft!`)
                          }
                          else{
                              helper.sendTextToSlack(slackToken, channelId, `I could not find any \`${message.match[2]}\` features that you are!`);
                          }
                        }
                        else{
                          if((params.sort_fields != undefined)&&(params.sort_fields == 'completion_date DESC')){
                                //eliminate items that are not closed
                                BODY.data = BODY.data.filter(function(val){
                                  return val.completion_date != null;
                                });
                                if(params.page != undefined){BODY.requestedPage = pageMatches[3];}
                                if(BODY.data.length == 0){
                                  helper.sendTextToSlack(slackToken, channelId, `I could not find any closed items on page ${page}!`)
                                }
                                else{
                                  helper.sendDataToSlack(slackToken, channelId, BODY);
                                }
                          }else{
                            if(params.page != undefined){BODY.requestedPage = pageMatches[3];}
                            helper.sendDataToSlack(slackToken, channelId, BODY);
                          }
                        }
                    }else{
                      helper.sendTextToSlack(slackToken, channelId,"I could not connect to axosoft");
                    }
                  });
              });
          })
          .catch(function(reason){
              /// axosoftBaseURL does not exists!
              console.log(reason);
          });
    })
    .catch(function(reason){
      console.log(reason);
      if(reason == "No collection"){
         helper.createNewCollection(message)
         .then(function(val){
           helper.authorizeUserwithoutCollection(bot, message);
         }).catch(function(reason){
           console.log("something went wrong with building a collection for the new user in the data base!");
           //TODO not a bad idea to slack the user! 
         })
      }else if(reason == "No axosoft Access Token"){
         helper.authorizeUserWithoutAccessToken(bot,message);
      }else{
        //// 
      }
    });
});

controller.hears('(.*)(axo)(d|f|t|i|\\s*)(\\s|.*)(\\d+|\\s+)(.*)',['direct_message,direct_mention,mention'],function(bot,message) { 
    var channelId = message.channel;
    var axosoftToken, slackToken, axosoftUrl;
    var columnsShort = "description,item_type,name,id,priority,due_date,workflow_step,remaining_duration.duration_text,assigned_to,release,"; 

    var formatColumns = function(itemType){
      if(itemType != "features")return columnsShort;
      else return columnsShort + "custom_fields.custom_1";
    };

    var formatWorkItemType = function(workItemType){
      if(workItemType == null)return '';
      else return `\n *Work Item Type:* ${axosoftData.workItemType}`;
    };

    var item_id = message.match[5];
    var item_type = 'features';
    if (message.match[3]=='d')item_type = 'defects';
    else if (message.match[3]=='t')item_type = 'tasks';
    else if (message.match[3]=='i')item_type = 'incidents';

    helper.retrieveDataFromDataBase(message.team, message.user,"teams")
     .then(function(returnedDataFromDb){
          axosoftToken = returnedDataFromDb.axosoftAccessToken;
          slackToken = returnedDataFromDb.slackAccessToken;
          axosoftUrl = returnedDataFromDb.axosoftBaseURL;

          var params = {
            access_token: axosoftToken,
            filters: `id=${item_id}`,
            columns: formatColumns(item_type), 
            page_size: 10
          };

          helper.makeRequest("GET", `${axosoftUrl}api/v5/${item_type}`, params, function(error, response, body){
             if(!error && response.statusCode == 200){
                      var BODY = JSON.parse(body);
                      if(BODY.data.length == 0){
                          helper.sendTextToSlack(slackToken, channelId, `I could not find any \`${item_type}\` in Axosoft with \`id = ${item_id}\`!`);
                      }
                      else{
                          var axosoftData = {
                                link: `${axosoftUrl}viewitem?id=${BODY.data[0].id}&type=${BODY.data[0].item_type}&force_use_number=true/`,
                                axosoftItemName: BODY.data[0].name,
                                Parent: helper.checkForProperty(BODY.data[0], "parent.id"),
                                Project: helper.checkForProperty(BODY.data[0], "project.name"),
                                Workflow_Step: helper.checkForProperty(BODY.data[0], "workflow_step.name"),
                                Assigned_To: helper.checkForProperty(BODY.data[0], "assigned_to"),
                                Priority: helper.checkForProperty(BODY.data[0], "priority.name"),
                                axosoftId: BODY.data[0].number,
                                Work_Item_Type: helper.checkForProperty(BODY.data[0], "custom_fields.custom_1"),
                                Due_Date: helper.checkForProperty(BODY.data[0], "due_date"),
                                Remaining_Estimate: helper.checkForProperty(BODY.data[0], "remaining_duration.duration_text"),
                                Release: helper.checkForProperty(BODY.data[0], "release.name"),
                                SubItems: helper.checkForProperty(BODY.data[0], "subitems.count"),
                                Description: helper.checkForProperty(BODY.data[0], "description")
                          };

                          var params = {
                                token: slackToken,
                                channel:channelId,
                                mrkdwn: true,
                                attachments:JSON.stringify([{
                                    color: "#FF8000",
                                    text: `<${axosoftData.link}|${axosoftData.axosoftId}>: ${axosoftData.axosoftItemName}`,
                                    fields: helper.formatAxoData(axosoftData),
                                    mrkdwn_in:["text"]
                                }])
                          };
                          helper.makeRequest("GET","https://slack.com/api/chat.postMessage", params, function(err, response, body){});
                      }
             }else{
               helper.sendTextToSlack(slackToken, channelId,"I could not connect to axosoft!");
             }
          });
    })
    .catch(function(reason){
       console.log(reason);
       helper.sendTextToSlack("I could not find the required data in database to get data from axosoft!");
    });
});

controller.hears('hello','direct_message',function(bot,message) {
  bot.reply(message,'Hello!');
});

controller.hears('^stop','direct_message',function(bot,message) {
  bot.reply(message,'Goodbye');
  bot.rtm.close();
});

controller.hears(['gimme'],['direct_message,direct_mention,mention,ambient'], function(bot, message){
    bot.sendWebhook({
        text: "I am a test message from <https://www.axosoft.com/|Take me to Axosoft>",
        attachments:[{
              fallback:"New open task one",
              pretext:"New open task two",
              color:"#D00000",
              fields: [{
                  title:"This is just test ",
                  value:"This is much easier than I thought it would be.",
                  short:false
              }]
        }]

    });
});

controller.hears(['identify yourself', 'who are you', 'who are you?', 'what is your name'],['direct_message,direct_mention,mention,ambient'], function(bot, message){
  bot.reply(message,':robot_face:Wuddup dawg? I am a bot named <@' + bot.identity.name + '>' );
});

controller.on(['direct_message','mention','direct_mention'],function(bot,message) {
    bot.api.reactions.add({
      timestamp: message.ts,
      channel: message.channel,
      name: 'robot_face',
    },function(err) {
      if (err) { console.log(err) }
      bot.reply(message,'I heard you loud and clear boss.');
    });
});

controller.storage.teams.all(function(err,teams) {
    if (err) {
      throw new Error(err);
    }
    //connect all teams with bots up to slack
    for (var t in teams) {
      if (teams[t].bot) {
        controller.spawn(teams[t]).startRTM(function(err, bot) {
          if (err) {
            console.log('Error connecting bot to Slack:',err);
          } else {
            trackBot(bot);
          }
        });
      }
    }
});
