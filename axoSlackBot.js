const config = require('./config.json');
const helper = require('./helper.js');
const nodeAxosoft = require('./nodeAxosoft.js');
const Botkit = require('botkit');
const request = require('request');
const MongoClient = require('mongodb').MongoClient;
const ObjectId = require('mongodb').ObjectID
const mongoStorage = require('botkit-storage-mongo')({mongoUri: config.mongoUri});
const urlEncode = require('urlencode');
const controller = Botkit.slackbot({storage: mongoStorage, interactive_replies: true});
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
        //var axoBaseUrl = req.headers.referer.substr(0, req.headers.referer.indexOf("auth"));
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

        helper.retrieveDataFromDataBase(teamId, userId, 'teams')
        .then(function(returnedDataFromDb){
          helper.makeRequest("GET", `${returnedDataFromDb.axosoftBaseURL}/api/oauth2/token`, params, function(error, response, body){
              var Body = JSON.parse(body);
              if(Body.access_token != null){
                  helper.saveAxosoftAccessToken(userId, teamId, Body.access_token);
                  helper.retrieveDataFromDataBase(teamId, userId,"teams")
                  .then(function(returnedDataFromDb){
                    slackToken = returnedDataFromDb.slackAccessToken;
                    helper.sendTextToSlack(slackToken, userId, "Authorization successful!");
                    res.send('<html><head><title>Axosoft Slack Authorized</title></head><body><h1>Authorization successful</h1><br/><h4>please close this window</h4></body></html>');
                  }).catch(function(reason){
                    console.log(reason);
                  });
              }else{
                  res.send('<html><head><title>Axosoft Slack Authorized</title></head><body><h1>Authorization failed</h1><br/><h4></h4></body></html>');
              }
          });
        })
        .then(function(axoBaseUrl) {
          
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

controller.hears('(get my|get) (.*)(items)(.*)',['direct_message,direct_mention,mention,ambient'],function(bot, message){
    var channelId = message.channel;
    var validNumber = helper.validateRequstedPageNumber(message.match);

    helper.checkAxosoftDataForUser(bot, message)
    .then(function(userData){
          helper.retrieveDataFromDataBase(message.team, message.user,"teams")
          .then(function(returnedData){
                var axoBaseUrl = returnedData.axosoftBaseURL;
                var slackToken = returnedData.slackAccessToken;

                if(validNumber){
                     helper.paramsBuilder(axoBaseUrl, userData.axosoftAccessToken, slackToken, message)
                      .then(function(args){
                          var nodeAxo = new nodeAxosoft(helper.replaceAxoUrl(axoBaseUrl), args.access_token);
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
                              helper.sendDataToSlack(slackToken, message, response, axoBaseUrl, userData.axosoftAccessToken);
                            }
                          })
                          .catch(function(reason){
                            console.log(reason);
                            if(reason.statusCode == 401){
                              helper.setAxosoftAccessToken(bot,message, axoBaseUrl);
                            }
                          });
                      })
                      .catch(function(reason){
                        console.log(reason);
                        if(reason.statusCode == 401){
                          helper.setAxosoftAccessToken(bot,message, axoBaseUrl);
                        }
                      });
                }else{
                   helper.sendTextToSlack(slackToken, channelId, "Not a valid page number! :ghost:");
                }
          })
          .catch(function(reason){
              //axosoftBaseURL does not exists!
              console.log(reason);
          });
    })
    .catch(function(reason){
      console.log(reason);
      if(reason == "No user"){
         helper.createNewUser(message)
         .then(function(val){
           helper.authorizeUserwithoutCollection(bot, message);
         }).catch(function(reason){
           console.log("Something went wrong with building a collection for the new user in the database!");
           //TODO not a bad idea to slack the user! 
         })
      }
    });
});

controller.hears('(.*)(axo)(d|f|t|i|[]{0})(\\s|[]{0})(\\d+)(.*)',['direct_message,direct_mention,mention,ambient'],function(bot,message) { 
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
    
       helper.checkAxosoftDataForUser(bot, message)
       .then(function(userData){
            helper.retrieveDataFromDataBase(message.team, message.user,"teams")
            .then(function(returnedData){
                  var axoBaseUrl = returnedData.axosoftBaseURL;
                  var slackToken = returnedData.slackAccessToken;
                  if(item_id > 2147483647){
                    helper.sendTextToSlack(slackToken, channelId, `I could not find item \`# ${item_id}\``);
                  }else{
                       var args = [{
                          access_token: userData.axosoftAccessToken,
                          filters: `id=${item_id}`,
                          columns: formatColumns(item_type), 
                          page_size: 10
                        }];
                        var nodeAxo = new nodeAxosoft(axoBaseUrl, userData.axosoftAccessToken);
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
                                        text: `<${axosoftData.link}|${axosoftData.number}>: ${axosoftData.name}${axosoftData.has_attachments ? ' :paperclip:' : ''}`,
                                        fields: helper.formatAxosoftItemData(axosoftData),
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
                  }
                        var nodeAxo = new nodeAxosoft(axoBaseUrl, args[0].access_token);
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

controller.hears(['update url','Update Url','UPDATE URL'],['direct_message,direct_mention,mention'],function(bot, message){
    bot.startConversation(message, function(err, convo){
        convo.ask("Can you tell me the URL of your Axosoft account? i.e. https://example.axosoft.com", function(response, convo){
            var baseUrl = helper.formatAxosoftBaseUrl(response.text.replace(/[<>]/g, ''));
            helper.makeRequest('GET', baseUrl + '/api/version', {}, function(error, response, body){
                if(!error && response.statusCode == 200){
                  var Body = JSON.parse(body);
                  if(Body.data.hasOwnProperty("revision") && Body.data.revision >= 11218){
                    var axosoftLoginUrl = helper.axosoftLoginUrlBuilder(baseUrl, message);
                      helper.saveAxosoftUrl(message, baseUrl);
                      convo.say("Your base url got updated!");
                      convo.next();
                    }else{
                      convo.say("I can only talk to Axosoft v17 or later.  Please upgrade your Axosoft version.");
                      convo.next();
                    }
                }else{
                  convo.say("This doesn't seem to be an Axosoft URL");
                  convo.next();
                }
            });
          });
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
          console.log(reason);
        });
    })
    .catch(function(reason){
       conbsole.log(reason);
    });
});

controller.hears(['filters','Filters','FILTERS'],['direct_message,direct_mention,mention'],function(bot, message){
    helper.axosoftFiltersBuilder(bot, message)
    .then(function(axosoftFilters){
      helper.filterButtons(bot, message, axosoftFilters.data);
    })
    .catch(function(reason){
      console.log(reason);
    });
});

//receive an interactive message, and reply with a message that will replace the original
controller.on('interactive_message_callback', function(bot, message) {
    var data = JSON.parse(message.payload);
    helper.saveAxosoftFilter(data);
    bot.replyInteractive(message, {
        text: `You selected \`${data.actions[0].name}\` filter!`
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