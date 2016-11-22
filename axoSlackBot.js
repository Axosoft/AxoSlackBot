const config = require('./config.json');
const helper = require('./helper.js');
const nodeAxosoft = require('./nodeAxosoft.js');
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
    redirectUri: config.baseUri + "/oauth",
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
          redirect_uri: config.baseUri + "/authorizationCode",
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
    // TODO reopen rtm if it's required!
    //  bot.startRTM(function(err) {
    // });
});

controller.hears('(get my|get) (.*)(items)(.*)',['direct_message,direct_mention,mention'],function(bot,message){
    var channelId = message.channel;
    helper.checkAxosoftDataForUser(message.team, message.user)
    .then(function(userData){
          var params = {};
          if(message.text.includes("page")){
             params.page = message.text.match('(.*)(page)(\\s)(\\d+)(.*)')[4];
          }

          helper.retrieveDataFromDataBase(message.team, message.user,"teams")
          .then(function(returnedData){
              var axoBaseUrl = returnedData.axosoftBaseURL;
              var slackToken = returnedData.slackAccessToken;

              helper.paramsBuilder(axoBaseUrl, userData[0], slackToken, message)
              .then(function(args){
                  var nodeAxo = new nodeAxosoft(axoBaseUrl, args.access_token);
                  var argsArray = [];
                  argsArray.push(args);

                  nodeAxo.promisify(nodeAxo.axosoftApi.Features.get, argsArray) 
                  .then(function(response){
                    if(response.data.length == 0){
                      helper.textBuilder(message, params)
                      .then(function(txt){
                          helper.sendTextToSlack(slackToken, channelId, txt);
                      });
                    }else{
                      helper.sendDataToSlack(slackToken, message, response, axoBaseUrl, userData[0]);
                    }
                  })
                  .catch(function(reason){
                    console.log(reason);
                    helper.sendTextToSlack(slackToken, channelId, reason);
                  });
             })
             .catch(function(reason){
               console.log(reason);
             });
            })
          .catch(function(reason){
              //axosoftBaseURL does not exists!
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
      }else{
         helper.authorizeUser(bot,message);
      }
    });
});

controller.hears('(.*)(axo)(d|f|t|i|[]{0})(\\s|[]{0})(\\d+)(.*)',['direct_message,direct_mention,mention'],function(bot,message) { 
      var channelId = message.channel;
      var columns = "description,item_type,name,id,priority,due_date,workflow_step,remaining_duration.duration_text,assigned_to,release";
      var formatDueDate = function(dueDate){
          if(dueDate == null)return '';
          else return '*Due Date:* ' + helper.timeFormat(dueDate);
      };

      var formatColumns = function(itemType){
        if(itemType != "features"){
          return columns;
        }
        else{
          return columns + ",custom_fields.custom_1";
        }
      };

      var formatWorkItemType = function(workItemType){
        if(workItemType == null)return '';
        else{
          return `\n *Work Item Type:* ${axosoftData.workItemType}`;
        }
      };

      var item_id = message.match[5];
      var item_type = 'features';
      if (message.match[3]=='d') {
        item_type = 'defects';
      }
      else if (message.match[3]=='t') {
        item_type = 'tasks';
      }
      else if (message.match[3]=='i') {
        item_type = 'incidents';
      }

       helper.checkAxosoftDataForUser(message.team, message.user)
       .then(function(axosoftToken){
            helper.retrieveDataFromDataBase(message.team, message.user,"teams")
            .then(function(returnedData){
                  var axoBaseUrl = returnedData.axosoftBaseURL;
                  var slackToken = returnedData.slackAccessToken;
                  var args = [{
                    access_token: axosoftToken[0],
                    item_id: item_id,
                    columns: formatColumns(item_type), 
                    page_size: 10
                  }];

                  var nodeAxo = new nodeAxosoft(axoBaseUrl, args[0].access_token);
                  nodeAxo.promisify(nodeAxo.axosoftApi.Features.get, args)
                  .then(function(response){
                      var data = response.data[0];
                      var axosoftData = {
                          link: `${axoBaseUrl}/viewitem?id=${data.id}&type=${data.item_type}&force_use_number=true/`,
                          axosoftItemName: data.name,
                          Parent: helper.checkForProperty(data, "parent.id"), 
                          Project: helper.checkForProperty(data, "project.name"),
                          Workflow_Step: helper.checkForProperty(data, "workflow_step.name"),
                          Assigned_To: helper.checkForProperty(data, "assigned_to"),
                          Priority: helper.checkForProperty(data, "priority.name"),
                          axosoftId: data.number,
                          Work_Item_Type: helper.checkForProperty(data, "custom_fields.custom_1"),
                          Due_Date: helper.checkForProperty(data, "due_date"), 
                          Remaining_Estimate: helper.checkForProperty(data, "remaining_duration.duration_text"),
                          Release: helper.checkForProperty(data, "release.name"),
                          SubItems: helper.checkForProperty(data, "subitems.count"),
                          Description: helper.checkForProperty(data, "description")
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
                  })
                  .catch(function(error){
                    helper.sendTextToSlack(slackToken, channelId, reason);
                  });
            })
            .catch(function(reason){
                console.log(reason);
            })
       })
       .catch(function(reason){
            console.log(reason);
            if(reason == "No collection"){
              helper.createNewCollection(message)
              .then(function(val){
                helper.authorizeUserwithoutCollection(bot, message);
              }).catch(function(reason){
                //TODO not a bad idea to slack user! 
                console.log("something went wrong with building a collection for the new user in the data base!");
              })
            }else{
              helper.authorizeUser(bot, message);
            }
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