const request = require('request');
const config = require('./config.json');
const MongoClient = require('mongodb').MongoClient;
const qs = require('querystring');
const striptags = require('striptags');
const urlEncode = require('urlencode');

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
                if(message.text.includes("my")){
                  txt = txt + " your";
                }
                txt = txt + " " +  message.match[2];

                if(message.text.match('(.*)(page)(\\s)(\\d+)(.*)') != null){
                  return `${txt} items ${message.text.match('(.*)(page)(\\s)(\\d+)(.*)')[4]} of ${pageNumber}`;
                }else if(pageNumber>1){
                  return `${txt} items page 1 of ${pageNumber}`;
                }else if(message.text.includes("closed")){
                  return txt = txt + "items [within last 30 days]";
                }else{
                  return `${txt} items`
                };
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
                          var itemType, axosoftData;
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
                                axosoftData = {
                                    link: `${axoBaseUrl}/viewitem?id=${Body.data[x].id}&type=${Body.data[x].item_type}&force_use_number=true/`,
                                    assignedTo: (function(){
                                      if(Body.data[x].assigned_to.name != "" ){
                                        if(myKeyWordExists){
                                          return "";
                                        }else{
                                          return Body.data[x].assigned_to.name;
                                        }
                                      }else{
                                        return "[None]";
                                      }
                                    }).call(),
                                    parent: Body.data[x].parent.id,
                                    axosoftItemName: Body.data[x].name,
                                    workFlowStep: Body.data[x].workflow_step.name,
                                    axosoftId: Body.data[x].number, 
                                    itemType: Body.data[x].item_type,
                                    workItemType: (function(){
                                      if(Body.data[x].hasOwnProperty("custom_fields")){
                                        return Body.data[x].custom_fields.custom_1;
                                      }else{
                                        return "[None]";
                                      }
                                    }).call()
                                };

                                const extraPromises = [];
                                const itemsWithParent = [];
                                
                                if (axosoftData.parent > 0) {
                                  if((parentIds.indexOf(Body.data[x].parent.id) == -1)){
                                      parentIds.push(Body.data[x].parent.id);
                                  }
                                  indexOfitemsWithParent.push(x);
                                  itemsWithParent.push(Body.data[x]);
                                }else{
                                  if(Body.data[x].hasOwnProperty("completion_date")){
                                      axosoftData.completionDate = Body.data[x].completion_date;
                                      attachmentArrays.push({
                                        color: "#38B040",
                                        text: `<${axosoftData.link}| ${axosoftData.axosoftId}> ${axosoftData.workItemType}  *${axosoftData.axosoftItemName}* \n ${axosoftData.assignedTo}  \`${axosoftData.workFlowStep}\` ${formatCompletionDate(axosoftData.completionDate)}`,
                                        mrkdwn_in:["text"]
                                      });
                                  }else{
                                      attachmentArrays.push({
                                        color: "#38B040",
                                        text: `<${axosoftData.link}| ${axosoftData.axosoftId}> ${axosoftData.workItemType}  *${axosoftData.axosoftItemName}* \n ${axosoftData.assignedTo}  \`${axosoftData.workFlowStep}\` ${formatDueDate(Body.data[x])}`,
                                        mrkdwn_in:["text"]
                                      });
                                  }
                                }
                        }

                        module.exports.getParentName(parentIds, axoBaseUrl, axosoftToken)
                        .then(function(parentDictionary){
                            for(z=0; z < itemsWithParent.length; z++){
                              itemsWithParent[z].parent_name = parentDictionary[itemsWithParent[z].parent.id];
                              itemsWithParent[z].parent_link = `${axoBaseUrl}/viewitem?id=${itemsWithParent[z].parent.id}&type=${itemsWithParent[z].item_type}&force_use_number=true/`;
                              var data = {
                                  link: `${axoBaseUrl}/viewitem?id=${itemsWithParent[z].id}&type=${itemsWithParent[z].item_type}&force_use_number=true/`,
                                  parentLink: itemsWithParent[z].parent_link,
                                  assignedTo: (function(){
                                    if(itemsWithParent[z].assigned_to.name != ""){
                                      if(myKeyWordExists){
                                        return "";
                                      }else{
                                        return itemsWithParent[z].assigned_to.name;
                                      }
                                    }else{
                                      return "[None]";
                                    }
                                  }).call(),
                                  parent: itemsWithParent[z].parent.id,
                                  parentName: itemsWithParent[z].parent_name,
                                  axosoftItemName: itemsWithParent[z].name,
                                  workFlowStep: itemsWithParent[z].workflow_step.name,
                                  axosoftId: itemsWithParent[z].number, 
                                  itemType: itemsWithParent[z].item_type,
                                  workItemType: (function(){
                                    if(itemsWithParent[z].hasOwnProperty("custom_fields")){
                                      return itemsWithParent[z].custom_fields.custom_1;
                                    }else{
                                      return "[None]";
                                    }
                                  }).call()
                              };

                              if(itemsWithParent[z].hasOwnProperty("completion_date")){
                                  data.completionDate = itemsWithParent[z].completion_date;
                                  attachmentArrays.splice(indexOfitemsWithParent[z],0,{
                                      color: "#38B040",
                                      text: `<${data.link}| ${data.axosoftId}> ${data.workItemType}  *${data.axosoftItemName}* \n ${data.assignedTo}  \`${data.workFlowStep}\` ${formatCompletionDate(data.completionDate)} \nParent ${data.parent}: <${data.parentLink}| ${data.parentName}>`,
                                      mrkdwn_in:["text"]
                                  });
                              }else{
                                  attachmentArrays.splice(indexOfitemsWithParent[z],0,{
                                    color: "#38B040",
                                    text: `<${data.link}| ${data.axosoftId}> ${data.workItemType}  *${data.axosoftItemName}* \n ${data.assignedTo}  \`${data.workFlowStep}\` ${formatDueDate(itemsWithParent[z])} \nParent ${data.parent}: <${data.parentLink}| ${data.parentName}>`,
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

getParentName: function(parentIds, axoBaseUrl, axosoftToken){
                  var parentDictionary = {}; 
                  return new Promise(function(resolve, reject){
                      var params = {
                        access_token: axosoftToken,
                        filters: `id=in[${parentIds}]`,
                        columns: "name",
                      };
                      module.exports.makeRequest("GET", `${axoBaseUrl}/api/v5/features`, params, function(error, response, body){
                        if(!error && response.statusCode == 200){
                            var BODY = JSON.parse(body);
                            if(BODY.data.length != 0){
                              for(x=0; x<BODY.data.length; x++){
                                parentDictionary[BODY.data[x].id] = BODY.data[x].name;
                              }
                              resolve(parentDictionary);
                            }
                        }
                      })
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
                            var params = {
                              access_token: axoAccessToken
                            }
                            module.exports.makeRequest('GET', axoBaseUrl + '/api/v5/me/', params, function(error, response, body){
                                if(!error && response.statusCode == 200){
                                   resolve(JSON.parse(body).data.id);
                                }
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
                                              console.log(`There is no collection with this ${slackUserId} Id in the data base! New collection is being created...`)
                                              reject("No collection")
                                          }else{
                                              if(results[0].axosoftAccessToken === undefined){
                                                console.log(`User with ${slackUserId} Id does not have axosoft access token in the data base!`);
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
                                                reject("Not able to connect to the data base");
                                              }
                                              else{
                                                  if(results[0] === undefined){
                                                      console.log("There is no team with the speciftied id in our data base!");
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

checkForProperty: function(object, propertyName){
                      var formatDueDate = function(dueDate){
                          if(dueDate == null)return '';
                          else return module.exports.timeFormat(dueDate);
                      };

                    if(propertyName.includes(".")){
                        var afterDotPropertyName = propertyName.substr(propertyName.indexOf('.') + 1);
                        var beforeDotPropertyName = propertyName.substr(0, propertyName.indexOf('.'));

                        if(!object.hasOwnProperty(beforeDotPropertyName)){
                          return null;
                        }

                        if((object[beforeDotPropertyName])[afterDotPropertyName] == null || (object[beforeDotPropertyName])[afterDotPropertyName] == ""){
                          return null;
                        }
                        else{
                          return (object[beforeDotPropertyName])[afterDotPropertyName];
                        }
                    }
                    else{
                      if(!object.hasOwnProperty(propertyName)){
                          return null;
                        }else if(propertyName == "description"){
                          if(object[propertyName] == ""){
                            return null;
                          }else{
                            return striptags(object[propertyName]);
                          }
                        }else if(propertyName == "assigned_to"){
                          if(((object[propertyName])["name"] == "") || ((object[propertyName])["name"] == null)){
                            return null;
                          }else{
                            return (object[propertyName])["name"];
                          }
                        }
                        else if(propertyName == "due_date"){
                          if((object[propertyName] == "") || (object[propertyName] == null)){
                            return null;
                          }else{
                            return formatDueDate(object[propertyName]);
                          }
                        }
                        else{
                          return object[propertyName];
                        }
                    }
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
                                                console.log("There is no document with the specified slack user id in our data base!");
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
                                              reject("Not able to connect to the data base");
                                            }
                                            else{
                                                if(results[0] === undefined){
                                                    console.log("There is no team with the speciftied id in our data base!");
                                                    reject("There is no team with the speciftied id in our data base!");
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

authorizeUser:function(bot, message){
                  module.exports.retrieveDataFromDataBase(message.team, message.user,"teams")
                    .then(function(returnedData){
                      if (returnedData.axosoftBaseURL == undefined) {
                          module.exports.authorizeUserwithoutCollection(bot, message);
                      }else {
                          var slackToken = returnedData.slackAccessToken;
                          var axosoftUrl = returnedData.axosoftBaseURL;
                          var axosoftLoginUrl = axosoftUrl 
                          + '/auth?response_type=code'
                          + '&client_id='+ config.axosoftClientId
                          + '&redirect_uri=' + config.baseUri + "/authorizationCode"
                          + '&scope=read write'
                          + '&expiring=false'
                          + "&state="+ urlEncode(`userId=${message.user}&teamId=${message.team}&channelId=${message.channel}`);

                          module.exports.sendTextToSlack(slackToken, message.channel, `Yo, you are not authorized from Axosoft! <${axosoftLoginUrl}| Authorize me>` )
                      }
                    }).catch(function(reason){
                        console.log(reason);
                        module.exports.sendTextToSlack(slackToken, message.channel,"I could not find the required data in database to get data from axosoft!");
                    })
},

authorizeUserwithoutCollection:function(bot, message, returnedData){
                                  var saveAxoBaseUrl = false;
                                  module.exports.retrieveDataFromDataBase(message.team, message.user,"teams")
                                  .then(function(returnedData){
                                      if(returnedData.axosoftBaseURL == undefined){
                                        saveAxoBaseUrl = true;
                                      }
                                      bot.startConversation(message, function(err, convo) {
                                          convo.ask("what's your base URL holmes? i.e. https://example.axosoft.com", function(response, convo) {
                                          var baseUrl = module.exports.formatAxosoftBaseUrl(response.text.replace(/[<>]/g, ''));
                                          module.exports.makeRequest('GET', baseUrl + '/api/version', {}, function(error, response, body){
                                            if(!error && response.statusCode == 200){
                                              var Body = JSON.parse(body);
                                              if(Body.data.hasOwnProperty("revision") && Body.data.revision >= 11218){
                                                var axosoftLoginUrl = baseUrl 
                                                + '/auth?response_type=code'
                                                + '&client_id='+ config.axosoftClientId
                                                + '&redirect_uri=' + config.baseUri + "/authorizationCode"
                                                + '&scope=read write'
                                                + '&expiring=false'
                                                + "&state="+ urlEncode(`userId=${message.user}&teamId=${message.team}&channelId=${message.channel}`);

                                                if(saveAxoBaseUrl){
                                                  module.exports.saveAxosoftUrl(message, baseUrl);
                                                }
                                                convo.stop();
                                                module.exports.retrieveDataFromDataBase(message.team, message.user,"teams")
                                                  .then(function(returnedDataFromDb){
                                                    var slackToken = returnedDataFromDb.slackAccessToken;
                                                    module.exports.sendTextToSlack(slackToken, message.channel, `Yo, you are not authorized from Axosoft! <${axosoftLoginUrl}|Authorize me>`);
                                                  })
                                                  .catch(function(reason){
                                                    //can not get slackToken from DB
                                                    module.exports.sendTextToSlack(slackToken, message.channel, "There is an error!"); 
                                                  })
                                              }
                                              else{
                                                convo.say("Please upgrade to Axosoft 17 or later");
                                                convo.next();
                                              }
                                            }else{
                                              convo.say("Not a valid Axosoft URL");
                                              convo.next();
                                            }
                                          });
                                          });
                                      });
                                })
                                  .catch(function(reason){
                                    console.log(reason);
                                  });
},

replaceAll: function(find, replacement, value){
                var re = new RegExp(find, 'g');
                return value.replace(re, replacement);
},

//TODO refactor this method
formatAxoData: function(object){ 
                  var returnDataObject = [];
                  for (k in object) {
                      if(k == "link" || k == "axosoftItemName" || k == "axosoftId"){
                        continue;
                      }
                      else if (object[k] != null){
                        if(k == "Description"){
                            returnDataObject.push({
                              title: k,
                              value: object[k],
                              short: false
                            });
                        }else if(k == "Parent"){
                            var indexVal = object.link.indexOf("=")+1;

                            String.prototype.replaceAt = function(index, character) {
                                return this.substr(0, index) + character + this.substr(object.link.indexOf("&"));
                            };
                            var parentLink = object.link.replaceAt(indexVal, object[k].toString());

                            returnDataObject.push({
                              title: k,
                              value: `<${parentLink} | ${object[k]}>`,
                              short: true
                            });
                        }else if( k == "SubItems"){
                          if(object[k] > 0){
                              returnDataObject.push({
                              title: k,
                              value: object[k],
                              short: true
                            });
                          }
                          else{
                            continue;
                          }
                        }else{
                            returnDataObject.push({
                              title: module.exports.replaceAll("_", " ", k),
                              value: object[k],
                              short: true
                            });
                        }
                      }
                      else{
                        if(k == "Parent"){
                          continue;
                        }
                        else{
                            returnDataObject.push({
                              title: module.exports.replaceAll("_", " ", k),
                              value: "[None]",
                              short: true
                            });
                        }
                      }
                  }
                  return returnDataObject;
},

textBuilder: function(message, params){
                return new Promise(function(resolve, reject){
                            var requestedKeyWord = function(msg){
                              if(msg != "")return msg;
                              else return "";
                            };

                            var baseTxt = `I could not find any ${requestedKeyWord(message.match[2])} ${requestedKeyWord(message.match[3])}`;
                            if(message.match.input.includes("my")){
                              if(message.text.includes("page")){
                                resolve(`${baseTxt} assigned to you on page \`${params.page}\` in Axosoft!`);
                              }else{
                                resolve(`${baseTxt} assigned to you in Axosoft!`);
                              }
                            }else{
                              if(params.hasOwnProperty("filters") && (message.text.includes("page"))){
                                resolve(`${baseTxt} on page \`${params.page}\` in Axosoft!`);
                              }else{
                                resolve(`${baseTxt} in Axosoft!`);
                              }
                            }
                });
},

paramsBuilder: function(axosoftUrl, axosoftToken, slackToken, message){
                  return new Promise(function(resolve, reject){
                      var params = {
                        access_token: axosoftToken,
                        columns: "name,id,item_type,priority,due_date,workflow_step,description,remaining_duration.duration_text,assigned_to,release,percent_complete,custom_fields.custom_1",
                        page_size: 10
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
                      }else if(message.match[2] == 'closed '){
                        params.filters = 'completion_date=in[last30_days]';
                      }else if(message.match[2] == 'updated '){
                        params.sort_fields = 'last_updated_date_time DESC';
                      }else if(message.match[2] == 'upcoming '){
                        var today = new Date();
                        Date.prototype.addDays = function(days){
                            var date = new Date(this.valueOf());
                            date.setDate(date.getDate() + days);
                            return date;
                        }

                        params.due_date = `[${today.toISOString()}=${today.addDays(14).toISOString()}]`;
                        params.filters = 'completion_date="1899-01-01"';
                      }

                      if(message.match[1] == 'get my'){
                          module.exports.getUserIdAxosoft(axosoftUrl, axosoftToken, slackToken, message)
                            .then(function(userIdAxo){
                                params.filters = `assigned_to.id=${userIdAxo}`;
                                return resolve(params);
                            }).catch(function(reason){
                                return reject(reason);
                            })
                      }
                      else{
                        return resolve(params);
                      }
                  });
}

};