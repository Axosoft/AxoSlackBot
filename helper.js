const request = require('request');
const config = require('./config.json');
const MongoClient = require('mongodb').MongoClient;
const qs = require('querystring');
const striptags = require('striptags');
const urlEncode = require('urlencode');
const nodeAxosoft = require('./nodeAxosoft.js');
const entities = require("entities");

module.exports = {
makeRequest: function(method, URL, params, callback){
                request({
                    url: URL,
                    qs: params,
                    method: method || "GET"
                  }, callback);
},

sendTextToSlack: function(slackToken, channelId, txt){
                    var params = {
                      token: slackToken,
                      channel: channelId,
                      text: txt
                    };
                    module.exports.makeRequest("POST", `https://slack.com/api/chat.postMessage`, params, function(error, response, body){
                      console.log(error);
                    });
},

formatText: function(body, message){
                var pageNumber = Math.ceil((body.metadata.total_count/body.metadata.page_size));
                var txt = "Here are";
                if(message.text.includes("my")) txt = txt + " your";
                txt = txt + " " +  message.match[2];

                if(message.text.match('(.*)(page)(\\s)(\\d+)(.*)') != null){
                  if(message.text.includes("closed")){
                    return `${txt} ${txt} items [in the last 30 days], page ${message.text.match('(.*)(page)(\\s)(\\d+)(.*)')[4]} of ${pageNumber}`
                  }else{
                    return `${txt} items ${message.text.match('(.*)(page)(\\s)(\\d+)(.*)')[4]} of ${pageNumber}`;
                  }
                }else{
                  if(message.text.includes("closed")){
                    return (pageNumber>1) ? txt = txt + `items [in the last 30 days], page 1 of ${pageNumber}` : txt = txt + "items [in the last 30 days]";
                  }else if(pageNumber>1){
                    return `${txt} items page 1 of ${pageNumber}`;
                  }else{
                    return `${txt} items`;
                  }
                }
},

sendDataToSlack: function(slackAccessToken, message, body, axoBaseUrl, axosoftToken){
                    var pageNumber = Math.ceil((body.metadata.total_count/body.metadata.page_size));
                    var myKeyWordTypedByUser = false;
                    if(message.match[1].includes("my")){
                      myKeyWordTypedByUser = true;
                    };

                    module.exports.attachmentMaker(body, axoBaseUrl, axosoftToken, myKeyWordTypedByUser)
                    .then(function(attach){
                          var params = {
                                token: slackAccessToken,
                                channel: message.channel,
                                mrkdwn: true,
                                text: module.exports.formatText(body, message),
                                attachments: JSON.stringify(attach) 
                          };
                          module.exports.makeRequest("GET","https://slack.com/api/chat.postMessage", params, function(err, response, body){});
                    }).catch(function(reason){
                        console.log(reason);
                    });
},

attachmentMaker: function (Body, axoBaseUrl, axosoftToken, myKeyWordExists){
                    return new Promise(function(resolve, reject){
                          var attachmentArrays = [];
                          var parentIds = [];
                          var axosoftData;
                          var indexOfitemsWithParent = [];

                          var formatDueDate = function(data){
                                  if((data.percent_complete != "100") && (data.due_date != null)){
                                    return '\`Due: ' + module.exports.timeFormat(data.due_date) + '\`';
                                  }else{
                                    return "";
                                  }
                          };

                          var formatCompletionDate = function(data){
                                  if(data != null){
                                    return '\`Closed: ' + module.exports.timeFormat(data) + '\`';
                                  }else{
                                    return "";
                                  }
                          };

                          for (x = 0; x < Body.data.length; x++) {
                                var axosoftData = module.exports.axosoftDataBuilder(axoBaseUrl, Body.data[x]);
                                if(myKeyWordExists)axosoftData.assigned_to = "";
                                const extraPromises = [];
                                const itemsWithParent = [];

                                if (axosoftData.parent.id > 0) {
                                  if((parentIds.indexOf(Body.data[x].parent.id) == -1)){
                                      parentIds.push(Body.data[x].parent.id);
                                  }
                                  indexOfitemsWithParent.push(x);
                                  itemsWithParent.push(Body.data[x]);
                                }else{
                                  var custom_1 = (axosoftData.custom_fields && axosoftData.custom_fields.custom_1) || '';
                                  if(Body.data[x].hasOwnProperty("completion_date")){
                                      axosoftData.completionDate = Body.data[x].completion_date;
                                      attachmentArrays.push({
                                        color: "#38B040",
                                        text: `<${axosoftData.link}| ${axosoftData.number}> ${custom_1}  *${axosoftData.name}*  ${axosoftData.assigned_to}  \`${axosoftData.workflow_step}\` ${formatCompletionDate(axosoftData.completionDate)}`,
                                        mrkdwn_in:["text"]
                                      });
                                  }else{
                                      attachmentArrays.push({
                                        color: "#38B040",
                                        text: `<${axosoftData.link}| ${axosoftData.number}> ${custom_1}  *${axosoftData.name}*  ${axosoftData.assigned_to}  \`${axosoftData.workflow_step}\` ${formatDueDate(Body.data[x])}`,
                                        mrkdwn_in:["text"]
                                      });
                                  }
                                }
                        }

                        module.exports.getParentName(parentIds, axoBaseUrl, axosoftToken)
                        .then(function(parentDictionary){
                            for(e=0; e < itemsWithParent.length; e++){
                              var item = itemsWithParent[e];
                              item.parent_name = parentDictionary[item.parent.id];
                              item.parent_link = `${axoBaseUrl}/viewitem?id=${item.parent.id}&type=${item.item_type}&force_use_number=true/`;
                              var data = module.exports.axosoftDataBuilder(axoBaseUrl, item);
                              if(myKeyWordExists)data.assigned_to = "";

                              var custom_1 = (data.custom_fields && data.custom_fields.custom_1) || '';
                              if(item.hasOwnProperty("completion_date")){
                                  data.completionDate = item.completion_date;
                                  attachmentArrays.splice(indexOfitemsWithParent[e],0,{
                                      color: "#38B040",
                                      text: `<${data.link}| ${data.number}> ${custom_1}  *${data.name}*  ${data.assigned_to}  \`${data.workflow_step}\` ${formatCompletionDate(data.completionDate)} \nParent ${data.parent.id}: <${data.parent_link}| ${data.parent_name}>`,
                                      mrkdwn_in:["text"]
                                  });
                              }else{
                                  attachmentArrays.splice(indexOfitemsWithParent[e],0,{
                                    color: "#38B040",
                                    text: `<${data.link}| ${data.number}> ${custom_1}  *${data.name}*  ${data.assigned_to}  \`${data.workflow_step}\` ${formatDueDate(item)} \nParent ${data.parent.id}: <${data.parent_link}| ${data.parent_name}>`,
                                    mrkdwn_in:["text"]
                                  });
                              }
                            }
                            resolve(attachmentArrays);
                        })
                        .catch(function(reason){
                          console.log(reason);
                        })
                    });
},

attachmentMakerForHelpOptions: function(){
                                  return new Promise(function(resolve, reject){
                                      var options = [
                                        "*axo + ID:* Shows detals of a single item, e.g. axo 5",
                                        "*get my items:* List of items currently assigned to you",
                                        "*get my updated items:* List of your most recently updated items",
                                        "*get my upcoming items:* List of your open items due in the next 2 weeks",
                                        "*get my closed items:* List of your items closed in the last 30 days",
                                        "*get my open items:* List of your items not yet completed",
                                        "You can remove *my* from any command to get items not assigned to you from Axosoft."
                                      ];

                                      var helpOpptionsArray = [];
                                      for(x=0; x<options.length; x++){
                                        helpOpptionsArray.push({
                                          color: "#38B040",
                                          text: options[x],
                                          mrkdwn_in:["text"]
                                        });
                                      }
                                      resolve(helpOpptionsArray);
                                  });
},

getParentName: function(parentIds, axoBaseUrl, axosoftToken){
                  var parentDictionary = {}; 
                  return new Promise(function(resolve, reject){
                      if(parentIds.length > 0){
                           var args = [{
                              access_token: axosoftToken,
                              filters: `id=in[${parentIds}]`,
                              columns: "name",
                            }];
                            var nodeAxo = new nodeAxosoft(axoBaseUrl, args[0].access_token);
                            nodeAxo.promisify(nodeAxo.axosoftApi.Features.get, args)
                            .then(function(response){
                              if(response.data.length != 0){
                                  for(x=0; x<response.data.length; x++){
                                    parentDictionary[response.data[x].id] = response.data[x].name;
                                  }
                                  resolve(parentDictionary);
                              }else{
                                console.log("helper.getParentName data.length == 0");
                              }
                            })
                            .catch(function(reason){
                              console.log(reason);
                              reject(reason);
                            });
                      }else{
                        resolve(parentDictionary);
                      } 
                  });
},

timeFormat: function(input){
                var parts = input.match(/(\d+)/g);
                date = new Date(parts[0], parts[1]-1, parts[2]); 

                var months = ["Jan", "Feb", "Mar", "Apr", "May", "June", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                var strDate = "";
                var day = date.getDate();
                var month = months[date.getMonth()];
                
                var today = new Date();
                today.setHours(0, 0, 0, 0);
                
                var yesterday = new Date();
                yesterday.setHours(0, 0, 0, 0);
                yesterday.setDate(yesterday.getDate() - 1);
                
                var tomorrow = new Date();
                tomorrow.setHours(0, 0, 0, 0);
                tomorrow.setDate(tomorrow.getDate() + 1);
                
                console.log(date.getTime()==today.getTime());
                
                if(today.getTime() == date.getTime()){
                    strDate = "Today";
                }else if(yesterday.getTime() == date.getTime()){
                    strDate = "Yesterday";
                }else if(tomorrow.getTime() == date.getTime()){
                    strDate = "Tomorrow";
                }else{
                    strDate = months[date.getMonth()] + " " +  date.getDate();
                }
                return strDate;
},

getUserIdAxosoft: function(axoBaseUrl, axoAccessToken){
                      return new Promise(function(resolve, reject){
                      var args = [{
                        access_token: axoAccessToken
                      }];
                      var nodeAxo = new nodeAxosoft(axoBaseUrl, args[0].access_token);
                      nodeAxo.promisify(nodeAxo.axosoftApi.Me.get)
                      .then(function(response){
                        resolve(response.data.id);
                      }).catch(function(reason){
                        reject(reason);
                      });
                      });
},

saveAxosoftAccessToken: function(userId, teamId, accessToken){
                          MongoClient.connect(config.mongoUri, function(err, database){
                              if(err) return console.log(err);
                              database.collection('users').findAndModify(
                              {id: userId, team_id: teamId}, 
                              [],
                              {$set: {axosoftAccessToken: accessToken}}, 
                              {},
                              function(err, object) {
                                  if (err){
                                      console.warn(err.message); 
                                  }else{
                                      console.dir(object);
                                  }
                              });
                          });
},

saveAxosoftUrl: function(data, baseUrl) {
                    MongoClient.connect(config.mongoUri, function(err, database){
                        if(err) return console.log(err);
                        database.collection('teams').findAndModify(
                          {id: data.team}, 
                          [],
                          {$set: {axosoftBaseURL: baseUrl}}, 
                          {},
                          function(err, object) {
                              if (err){
                                  console.warn(err.message); 
                              }else{
                                  console.dir(object);
                              }
                        });
                    });
},

checkAxosoftDataForUser: function(slackTeamId, slackUserId){
                            var one = new Promise(function(resolve, reject){
                                MongoClient.connect(config.mongoUri, function(err, database){
                                      if(err) {
                                        console.log(err);
                                      }else{
                                        database.collection('users').find({"team_id":slackTeamId, "id": slackUserId }).toArray(function(err, results){
                                          if(err){
                                            console.log(err);
                                          }else if(results.length == 0){
                                              //No collection 
                                              console.log(`There is no collection with this ${slackUserId} Id in the databbase! New collection is being created...`)
                                              reject("No collection")
                                          }else{
                                              if(results[0].axosoftAccessToken === undefined){
                                                console.log(`User with ${slackUserId} Id does not have axosoft access token in the database!`);
                                                reject("No axosoft Access Token"); 
                                              }else{
                                                resolve(results[0].axosoftAccessToken);
                                              }
                                          }
                                        });
                                      }
                                });
                            });

                            var two = new Promise(function(resolve, reject){
                                MongoClient.connect(config.mongoUri, function(err, database){
                                      if(err) {
                                        console.log(err);
                                      }else{
                                          database.collection('teams').find({"id":slackTeamId}).toArray(function(err, results){
                                              if(err){
                                                console.log(err);
                                                reject("Not able to connect to the database");
                                              }
                                              else{
                                                  if(results[0] === undefined){
                                                      console.log("There is no team with the speciftied id in our database!");
                                                      reject("No team");
                                                  }else if(results[0].axosoftBaseURL == undefined){
                                                      reject("No axosoft base url")
                                                  }else{
                                                      resolve(results[0].axosoftBaseURL);
                                                  }
                                              }
                                        });
                                      }
                                });
                            });
                            return Promise.all([one, two]);
},

retrieveDataFromDataBase: function(slackTeamId, slackUserId, documentName){
                              return new Promise(function(resolve, reject){
                                  var axosoftAccessToken, axosoftBaseURL, slackAccessToken, axosoftUserId;

                                  MongoClient.connect(config.mongoUri, function(err, database){
                                    if(err) {
                                      return console.log(err);
                                    };

                                    if(documentName === "users"){
                                        database.collection('users').find({"team_id":slackTeamId, "id": slackUserId }).toArray(function(err, results){
                                            if(err) return console.log(err);
                                              if(results[0] === undefined){
                                                console.log("There is no document with the specified slack user id in our database!");
                                                reject({axosoftAccessToken : null});
                                              }else{
                                                    if(results[0].axosoftAccessToken === undefined){
                                                      console.log("There is no userIdAxosoft within the found document!");
                                                      resolve({axosoftAccessToken: "-1"});
                                                    }else{
                                                        resolve({axosoftAccessToken: results[0].axosoftAccessToken});
                                                    }
                                              }
                                        });
                                    }else if(documentName === "teams"){
                                        database.collection('teams').find({"id":slackTeamId}).toArray(function(err, results){
                                            if(err){
                                              console.log(err);
                                              reject("Not able to connect to the database");
                                            }
                                            else{
                                                if(results[0] === undefined){
                                                    console.log("There is no team with the speciftied id in our database!");
                                                    reject("There is no team with the speciftied id in our database!");
                                                }else{
                                                      resolve({
                                                          axosoftBaseURL: results[0].axosoftBaseURL,
                                                          slackAccessToken: results[0].token
                                                      });
                                                }
                                            }
                                       });
                                    }
                                    database.close();
                                  }); 
                              });
},

createNewCollection: function(message){
                        return new Promise(function(resolve, reject){
                              MongoClient.connect(config.mongoUri, function(err, database){
                                  if(err) return console.log(err);
                                  database.collection('users').insertOne({
                                    team_id: message.team, 
                                    id: message.user
                                  });
                                  database.close();
                                  resolve("");
                              });
                        });
},

formatAxosoftBaseUrl: function(url){
                        if(url.indexOf("http") == -1){
                          return url = "http://"+url;
                        }
                        else{
                          return url;
                        }
},

axosoftLoginUrlBuilder: function(axosoftUrl, message){
                            var axosoftLoginUrl = axosoftUrl 
                            + '/auth?response_type=code'
                            + '&client_id='+ config.axosoftClientId
                            + '&redirect_uri=' + config.baseUri + "/authorizationCode"
                            + '&scope=read write'
                            + '&expiring=false'
                            + "&state="+ urlEncode(`userId=${message.user}&teamId=${message.team}&channelId=${message.channel}`);

                            return axosoftLoginUrl;
},

authorizeUser:function(bot, message){
                  module.exports.retrieveDataFromDataBase(message.team, message.user,"teams")
                    .then(function(returnedData){
                      if (returnedData.axosoftBaseURL == undefined) {
                          module.exports.authorizeUserwithoutCollection(bot, message);
                      }else {
                          var slackToken = returnedData.slackAccessToken;
                          var axosoftUrl = returnedData.axosoftBaseURL;
                          var axosoftLoginUrl = module.exports.axosoftLoginUrlBuilder(axosoftUrl, message);
                          module.exports.sendTextToSlack(slackToken, message.user, `I need permissions to talk to your Axosoft account. <${axosoftLoginUrl}|Click here to Authorize>` );
                      }
                    }).catch(function(reason){
                        console.log(reason);
                        module.exports.sendTextToSlack(slackToken, message.channel,"I could not connect to your Axosoft account.");
                    })
},

authorizeUserwithoutCollection:function(bot, message, returnedData){
                                  var saveAxoBaseUrl = false;
                                  var baseUrl, slackToken;
                                  module.exports.retrieveDataFromDataBase(message.team, message.user,"teams")
                                  .then(function(returnedData){
                                      if(returnedData.axosoftBaseURL == undefined){
                                        saveAxoBaseUrl = true;
                                      }
                                      bot.startConversation(message, function(err, convo) {
                                           if(saveAxoBaseUrl){
                                              convo.ask("What is the URL or your Axosoft account? i.e. https://example.axosoft.com", function(response, convo) {
                                                 baseUrl = module.exports.formatAxosoftBaseUrl(response.text.replace(/[<>]/g, ''));
                                              });
                                           }else{
                                              baseUrl = returnedData.axosoftBaseURL;
                                              slackToken = returnedData.slackAccessToken
                                           }
                                            module.exports.makeRequest('GET', baseUrl + '/api/version', {}, function(error, response, body){
                                              if(!error && response.statusCode == 200){
                                                var Body = JSON.parse(body);
                                                if(Body.data.hasOwnProperty("revision") && Body.data.revision >= 11218){
                                                  var axosoftLoginUrl = module.exports.axosoftLoginUrlBuilder(baseUrl, message);
                                                  if(saveAxoBaseUrl){
                                                    module.exports.saveAxosoftUrl(message, baseUrl);
                                                  }
                                                  convo.stop();
                                                  module.exports.sendTextToSlack(slackToken, message.user, `I need permissions to talk to your Axosoft account. <${axosoftLoginUrl}|Click here to Authorize>`);
                                                }
                                                else{
                                                  convo.say("Please upgrade your installation to Axosoft 17 or later");
                                                  convo.next();
                                                }
                                              }else{
                                                convo.say("Not a valid Axosoft URL");
                                                convo.next();
                                              }
                                            });
                                         });
                                })
                                  .catch(function(reason){
                                    console.log(reason);
                                  });
},

textBuilder: function(message){
                return new Promise(function(resolve, reject){
                            var requestedKeyWord = function(msg){
                              if(msg != "")return msg;
                              else return "";
                            };
                            var ofYourConditional = message.match.input.includes("my") ? 'of your ' : '';
                            var baseTxt = `I could not find any ${ofYourConditional}${requestedKeyWord(message.match[2])}${' ' + requestedKeyWord(message.match[3])}`;
                            resolve(baseTxt);
                });
},

paramsBuilder: function(axosoftUrl, axosoftToken, slackToken, message){
                  return new Promise(function(resolve, reject){
                      var params = {
                        access_token: axosoftToken,
                        columns: "name,id,item_type,priority,due_date,workflow_step,description,remaining_duration.duration_text,assigned_to,release,percent_complete,custom_fields.custom_1",
                        page_size: 10,
                        //default sort created_date_time desc
                        sort_fields: 'created_date_time DESC'
                      };

                      //paging
                      var page = 1;
                      var pageMatches = message.text.match(/(.*)(page\s)(\d+)/i);
                      if (pageMatches) {
                        page = pageMatches[3];
                        params.page = page;
                      }

                      if(message.match[2] == 'open '){
                        params.filters = 'completion_date="1899-01-01"';
                        params.sort_fields = 'last_updated_date_time DESC';
                      }else if(message.match[2] == 'closed '){
                        params.filters = 'completion_date=in[last30_days]';
                        params.sort_fields = 'completion_date DESC,last_updated_date_time DESC';
                      }else if(message.match[2] == 'updated '){
                        params.sort_fields = 'last_updated_date_time DESC';
                      }else if(message.match[2] == 'upcoming '){
                        var today = new Date();
                        Date.prototype.addDays = function(days){
                            var date = new Date(this.valueOf());
                            date.setDate(date.getDate() + days);
                            return date;
                        }
                        params.due_date = `[${today.addDays(-90).toISOString()}=${today.addDays(14).toISOString()}]`;
                        params.filters = 'completion_date="1899-01-01"';
                        params.sort_fields = 'due_date,last_updated_date_time DESC'
                      }else if(message.match[2] != ""){
                        module.exports.sendTextToSlack(slackToken, message.channel,"I am sorry but I am not able to understand what you are asking for!");
                        console.log("vague request from user!");
                        reject("vague Request");
                      }

                      if(message.match[1] == 'get my'){
                          module.exports.getUserIdAxosoft(axosoftUrl, axosoftToken, slackToken, message)
                            .then(function(userIdAxo){
                                params.filters = params.filters + `,assigned_to.id=${userIdAxo}`;
                                return resolve(params);
                            }).catch(function(reason){
                                return reject(reason);
                            })
                      }
                      else{
                        return resolve(params);
                      }
                  });
},

getParamsFromQueryString: function(query){
                              var object = new Object();
                              var params = query.state.split("&");
                              params.forEach(function(param) {
                                var kvp = param.split("=");
                                object[kvp[0]] = kvp[1];
                              });
                              return object;
},

formatAxosoftDataForSlack: function(object){
                  var dataArray = [];
                  var propertyName = null;
                  var keysArray = Object.keys(object);
                  keysArray.splice(keysArray.indexOf("description"), 1);
                  keysArray.push("description");

                  String.prototype.replaceAt = function(index, character) {
                      return this.substr(0, index) + character.toString() + this.substr(index+1);
                  }

                  for(x=0; x < keysArray.length; x++){
                      if(keysArray[x] == "link" || keysArray[x] == "id" || keysArray[x] == "number" || keysArray[x] == "name"){
                        continue;
                      }else if(typeof(object[keysArray[x]]) == "object"){ 
                          if(keysArray[x] == "parent" && object[keysArray[x]].id == 0){
                            continue;
                          }else{
                             dataArray.push({
                                  title: module.exports.titleBuilder(keysArray[x]).hasOwnProperty("title") ? module.exports.titleBuilder(keysArray[x])["title"] : module.exports.titleBuilder(keysArray[x]),
                                  value: ((object[keysArray[x]].hasOwnProperty("id")) && (object[keysArray[x]].id > 0)) ? `<${object.link.replaceAt( object.link.indexOf("=")+1, object.parent.id)} | ${object.parent.id}>`: `${object[keysArray[x]][Object.keys(object[keysArray[x]])[0]]}`,
                                  short: true
                              });
                          }
                      }else{
                          dataArray.push({
                              title: module.exports.titleBuilder(keysArray[x]).hasOwnProperty("title") ? module.exports.titleBuilder(keysArray[x])["title"] : module.exports.titleBuilder(keysArray[x]),
                              value: object[keysArray[x]],
                              short: (keysArray[x] == "description") ? false : true
                          });
                      }
                  }
                  return dataArray;
},

titleBuilder: function(name){
                  var titles = [
                    {value : "parent", title: "Parent"},
                    {value : "name", title: "Project"},
                    {value : "workflow_step", title: "Workflow Step"},
                    {value : "assigned_to", title: "Assigned To"},
                    {value : "priority", title: "Priority"},
                    {value : "custom_fields", title: "Work Item Type"},
                    {value : "due_date", title: "Due Date"},
                    {value : "remaining_duration", title: "Remaining Estimate"},
                    {value : "release", title: "Release"},
                    {value : "subitems", title: "SubItems"},
                    {value : "description", title: "Description"},
                  ];

                  var replaceAll =  function(find, replacement, value){
                                  var re = new RegExp(find, 'g');
                                  return value.replace(re, replacement);
                  };

                  var returnTitle = titles.find(function(item){
                      return name == item.value;
                  });
                  return (returnTitle != undefined) ? returnTitle : name.charAt(0).toUpperCase() + replaceAll("_", " ", name.slice(1));
},

trimDescription: function(string){
                    var index = 0;
                    if(string.charAt(900) == " "){
                      return string.slice(0, 900);
                    }else{
                      for(d=900; d > 0; d--){
                        if(string.charAt(d) == " "){
                          index = d;
                          break;
                        }
                      }
                      return string.slice(0, index)+ "...";
                    }
},

axosoftDataBuilder: function(baseUrl, data){
                        var axosoftData = new Object();
                        var propertyName = null;
                        axosoftData.link = `${baseUrl}/viewitem?id=${data.id}&type=${data.item_type}&force_use_number=true/`;
                        for(z=0; z < Object.keys(data).length; z++){
                            propertyName = Object.keys(data)[z];
                            if(data[propertyName] == null || data[propertyName] == ""){
                              axosoftData[propertyName] = "";
                            }else{
                                if(data[propertyName].hasOwnProperty("name")){
                                  axosoftData[propertyName] = (data[propertyName].name == null) ? "" : data[propertyName].name;
                                }else if(propertyName == "description"){
                                  var description = (data[propertyName].length > 900)? module.exports.trimDescription(entities.decodeHTML(data[propertyName])): entities.decodeHTML(data[propertyName]);
                                  axosoftData[propertyName] = striptags(description);
                                }else if(propertyName == "due_date"){
                                  axosoftData[propertyName] = module.exports.timeFormat(data[propertyName]);
                                }else{
                                  axosoftData[propertyName] = (data[propertyName] == null) ? "" : data[propertyName];
                                }
                            }
                        }
                        return axosoftData;
},

axosoftApiMethod: function(Axo, itemType){
                      if(itemType == "tasks"){
                        return Axo.axosoftApi.Tasks;
                      }else if(itemType == "incidents"){
                        return Axo.axosoftApi.Incidents;
                      }else{
                        return Axo.axosoftApi.Features;
                      }
},

};