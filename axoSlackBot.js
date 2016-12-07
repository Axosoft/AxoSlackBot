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
        var object = helper.getParamsFromQueryString(req.query);
        var userId = object.userId;
        var teamId = object.teamId;
        var channelId = object.channelId;

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
                helper.saveAxosoftAccessToken(userId, teamId, Body.access_token);
                helper.retrieveDataFromDataBase(teamId, userId,"teams")
                .then(function(returnedDataFromDb){
                  slackToken = returnedDataFromDb.slackAccessToken;
                  helper.sendTextToSlack(slackToken, channelId, "Authorization successful!");
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

controller.hears('(get my|get) (.*)(items)(.*)',['direct_message,direct_mention,mention'],function(bot, message){
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
                      helper.textBuilder(message)
                      .then(function(txt){
                          helper.sendTextToSlack(slackToken, channelId, txt);
                      });
                    }else{
                      helper.sendDataToSlack(slackToken, message, response, axoBaseUrl, userData[0]);
                    }
                  })
                  .catch(function(reason){
                    console.log(reason);
                    if(reason.statusCode == 401){ 
                       helper.authorizeUser(bot,message);
                    }
                  });
             })
             .catch(function(reason){
               console.log(reason);
               if(reason.statusCode == 401){ 
                 helper.authorizeUser(bot,message);
               }
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
           console.log("Something went wrong with building a collection for the new user in the database!");
           //TODO not a bad idea to slack the user! 
         })
      }else{
         helper.authorizeUser(bot,message);
      }
    });
});

controller.hears('(.*)(axo)(d|f|t|i|[]{0})(\\s|[]{0})(\\d+)(.*)',['message_received'],function(bot,message) { 
      var channelId = message.channel;
      var columns = "name,id,priority,due_date,workflow_step,remaining_duration.duration_text,item_type,assigned_to,release,description";
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
                  nodeAxo.promisify(helper.axosoftApiMethod(nodeAxo, item_type).get, args)
                  .then(function(response){
                      if(response.data.length == 0){
                        helper.sendTextToSlack(slackToken, channelId, `I could not find item \`# ${message.match[5]}\``);
                      }else{
                        var axosoftData = helper.axosoftDataBuilder(axoBaseUrl, response.data[0]);
                        var params = {
                              token: slackToken,
                              channel:channelId,
                              mrkdwn: true,
                              attachments:JSON.stringify([{
                                  color: "#38B040",
                                  text: `<${axosoftData.link}|${axosoftData.number}>: ${axosoftData.name}`,
                                  fields: helper.formatAxosoftDataForSlack(axosoftData),
                                  mrkdwn_in:["text"]
                              }])
                        };
                        helper.makeRequest("GET","https://slack.com/api/chat.postMessage", params, function(err, response, body){});
                      }
                  })
                  .catch(function(error){
                    console.log(error.statusCode);
                    if(error.statusCode == 401){
                       helper.authorizeUser(bot,message);
                    }
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
                console.log("Something went wrong with building a collection for the new user in the database!");
              })
            }else{
              helper.authorizeUser(bot, message);
            }
       });
});

controller.hears(['help','Help','HELP'],['direct_message,direct_mention,mention'],function(bot, message){
    helper.retrieveDataFromDataBase(message.team, message.user,"teams")
    .then(function(returnedData){
        var slackAccessToken = returnedData.slackAccessToken;
        helper.attachmentMakerForHelpOptions()
        .then(function(attach){
          var params = {
                token: returnedData.slackAccessToken,
                channel: message.channel,
                mrkdwn: true,
                text: "Here is a list of commands you can use:",
                attachments:JSON.stringify(attach)
          };
          helper.makeRequest("GET","https://slack.com/api/chat.postMessage", params, function(err, response, body){});
        })
        .catch(function(reason){
          var test = "";
        });
    })
    .catch(function(reason){
       conbsole.log(reason);
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