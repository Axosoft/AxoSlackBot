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

sendDataToSlack: function(slackAccessToken, channelId, body, axoBaseUrl, axosoftToken){
                  var pageNumber = Math.ceil((body.metadata.total_count/body.metadata.page_size));
                  var params; 
                  var formatWorkItemType = function(workItemType){
                    if(workItemType == null)return '';
                    else{
                      return `\n *Work Item Type:* ${axosoftData.workItemType}`;
                    }
                  };

                  var formatText = function(body){
                          if(body.metadata.total_count > body.metadata.page_size){
                              if(body.requestedPage != undefined){
                                return `Here are your items (page ${body.requestedPage} of ${pageNumber})`;
                              }
                              else{
                                return `Here are your items (page 1 of ${pageNumber})`;
                              }
                          }
                          else{
                             return '\`Due: ' + module.exports.timeFormat(dueDate) + '\`';
                          }
                  };

                  var formatText = function(txt){
                          if(body.requestedPage != undefined){
                             return `Here are your items (page ${body.requestedPage} of ${pageNumber})`;
                          }else if(pageNumber>1){
                             return `page 1 of ${pageNumber}`
                          }else{
                            return
                          };
                  };

                  const extraPromises = [];
                  const itemsWithParent = [];
                  if (axosoftData.parent > 0) {
                    if((parentIds.indexOf(Body.data[x].parent.id) == -1)){
                        parentIds.push(Body.data[x].parent.id);
                    }
                    itemsWithParent.push(Body.data[x]);
                  }else{
                     if(Body.data[x].hasOwnProperty("completion_date")){
                          axosoftData.completionDate = Body.data[x].completion_date;
                          attachmentArrays.push({
                            color: "#FF8000",
                            text: `<${axosoftData.link}| ${axosoftData.axosoftId}> ${axosoftData.workItemType}  *${axosoftData.axosoftItemName}* \n ${axosoftData.assignedTo}  \`${axosoftData.workFlowStep}\` ${'\`Closed: ' + module.exports.timeFormat(axosoftData.completionDate) + '\`'}`,
                            mrkdwn_in:["text"]
                          });
                      }else{
                          attachmentArrays.push({
                            color: "#FF8000",
                            text: `<${axosoftData.link}| ${axosoftData.axosoftId}> ${axosoftData.workItemType}  *${axosoftData.axosoftItemName}* \n ${axosoftData.assignedTo}  \`${axosoftData.workFlowStep}\` ${formatDueDate(Body.data[x])}`,
                            mrkdwn_in:["text"]
                          });
                      }
                  }
            }

                  for (x = 0; x < body.data.length; x++) {
                        axosoftData = {
                            link: `http://localhost/OnTimeWeb/viewitem?id=${body.data[x].id}&type=${body.data[x].item_type}&force_use_number=true/`,
                            axosoftItemName: body.data[x].name,
                            workFlowStep: body.data[x].workflow_step.name,
                            axosoftId: body.data[x].id, 
                            //itemType: body.data[x].item_type,
                            workItemType: (function(){
                              if(itemsWithParent[z].hasOwnProperty("custom_fields")){
                                return itemsWithParent[z].custom_fields.custom_1;
                              }else{
                                return "[None]";
                              }
                            }).call()
                           
                        };

                        if((body.data[x].completion_date != null) && (body.data[x].due_date == null)){
                              axosoftData.completionDate = body.data[x].completion_date;
                              attachmentArrays.push({
                                color: "#36a64f",
                                text: `<${axosoftData.link}| Axo:${axosoftData.axosoftId}>  ${formatWorkItemType(axosoftData.workItemType)} \`${axosoftData.workFlowStep}\` ${axosoftData.axosoftItemName} ${'\`Completion Date: ' + axosoftData.completionDate + '\`'}`,
                                mrkdwn_in:["text"]
                              });
                        }else{
                            axosoftData.dueDate = body.data[x].due_date;
                            attachmentArrays.push({
                              color: "#36a64f",
                              text: `<${axosoftData.link}| Axo:${axosoftData.axosoftId}>  ${formatWorkItemType(axosoftData.workItemType)} \`${axosoftData.workFlowStep}\` ${axosoftData.axosoftItemName} ${formatDueDate(axosoftData.dueDate)}`,
                              mrkdwn_in:["text"]
                            });
                        }
                  }

                  var params = {
                        token: slackAccessToken,
                        channel:channelId,
                        mrkdwn: true,
                        text: formatText(body),
                        attachments: JSON.stringify(attachmentArrays) 
                  };
                  module.exports.makeRequest("GET","https://slack.com/api/chat.postMessage", params, function(err, response, body){
                    if(err)console.log(err);
                  });
              },

//             attachmentArrays.push({
//                color: "#FF8000",
//                text: `<${`${axoBaseUrl}viewitem?id=${Body.data[x].id}&type=${Body.data[x].item_type}&force_use_number=true/`}| Axo${axosoftData.itemType.substring(0,1)}:${axosoftData.axosoftId}> ${axosoftData.workItemType}  *${axosoftData.axosoftItemName}* \n ${axosoftData.assignedTo}  \`${axosoftData.workFlowStep}\` ${formatDueDate(Body.data[x])}`,
//                mrkdwn_in:["text"]
//             });
//           }
// },

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
              
              if (today.getTime() == date.getTime()) {
                  strDate = "Today";
              } else if (yesterday.getTime() == date.getTime()) {
                  strDate = "Yesterday";
              } else if (tomorrow.getTime() == date.getTime()) {
                  strDate = "Tomorrow";
              } else {
                  strDate = months[date.getMonth()] + " " + date.getDate();
              }
              return strDate;
},

//TODO this method should have => MongoClient.connect within its body!
updateDataBaseDocument: function(database, team, user, userIdAxosoft, callback) {
                            database.collection('users').findAndModify(
                            {id: user, team_id: team}, 
                            [],  
                            {$set: {userIdAxosoft: userIdAxosoft}}, 
                            {}, 
                            function(err, object) {
                                if (err){
                                    console.warn(err.message); 
                                }else{
                                    console.dir(object);
                                }
                            });
                      },

getUserEmailAddressFromSlack: function(slackUserId, slackAccessToken){
                                  return new Promise(function(resolve, reject) {
                                    var params = {
                                      token: slackAccessToken,
                                      user: slackUserId
                                    };

                                     module.exports.makeRequest("GET", `https://slack.com/api/users.info`, params, function(error, response, body){
                                          if(!error && response.statusCode == 200){
                                              var BODY = JSON.parse(body);
                                              userEmail = BODY.user.profile.email;
                                              resolve(userEmail);
                                            }else{
                                              reject(error);
                                            }
                                     });
                                  });
                              },

assignAxoId: function(message, params, axoBaseUrl, axosoftToken){
                return new Promise(function(resolve, reject){
                if(message.match[1] == 'get my') {
                   module.exports.getUserIdAxosoft(axoBaseUrl, axosoftToken)
                   .then(function(axosoftUserId){
                     params.filters = `assigned_to.id=${axosoftUserId}`;
                     resolve(params);
                   })
                   .catch(function(reason){
                     console.log(reason);
                   });
                 }
                 else{
                   resolve(params);
                 }
                });
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

saveAxosoftAcessToken: function(userId, teamId, accessToken){
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

checkForAxosoftAccessTokenForUser: function(slackTeamId, slackUserId){
                                return new Promise(function(resolve, reject){
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
                          if((url.indexOf("http://") == -1) || (url.indexOf("https://")) == -1){
                            return url = "http://"+url;
                          }
                          else{
                            return url;
                          }
},

authorizeUserWithoutAccessToken:function(bot, message){
        module.exports.retrieveDataFromDataBase(message.team, message.user,"teams")
          .then(function(returnedData){
            if (returnedData.axosoftBaseURL == undefined) {
                //module.exports.authorizeUserwithoutCollection(bot, message);
            }else {
                //axosoftBaseURL exists in database!
                var slackToken = returnedData.slackAccessToken;
                var axosoftUrl = returnedData.axosoftBaseURL;
                var axosoftLoginUrl = axosoftUrl 
                + '/auth?response_type=code'
                + '&client_id='+ config.axosoftClientId
                + '&redirect_uri=' + config.redirectUri + "authorizationCode" 
                + '&scope=read write'
                + '&expiring=false'
                //+ `&state=${axosoftUrl}`+ urlEncode(`&userId=${message.user}&teamId=${message.team}&channelId=${message.channel}`);
                + "&state="+ urlEncode(`userId=${message.user}&teamId=${message.team}&channelId=${message.channel}`);
                
                module.exports.sendTextToSlack(slackToken, message.channel, `Yo, you are not authorized from Axosoft! <${axosoftLoginUrl}| Authorize me>` )
            }

          }).catch(function(reason){
             console.log(reason);
             module.exports.sendTextToSlack(slackToken, message.channel,"I could not find the required data in database to get data from axosoft!");
          })
},

authorizeUserwithoutCollection:function(bot, message){
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
                              + '&redirect_uri=' + config.redirectUri + "authorizationCode" 
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
                                  // can not get slackToken from DB . TODO figure out a handler here 
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
}


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
                                //return "[None]";
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

paramsBuilder: function(axosoftUrl, axosoftToken, slackToken, message){
                  return new Promise(function(resolve, reject){
                      var params = {
                        access_token: axosoftToken,
                        //columns: "item_type,name,id,priority,due_date,workflow_step,custom_fields.custom_1",
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
                      }
                      if(message.match[2] == 'closed '){
                        params.sort_fields = 'completion_date DESC';
                      }
                      if(message.match[2] == 'updated '){
                        params.sort_fields = 'last_updated_date_time DESC';
                      }
                      if(message.match[1] == 'get my'){
                          module.exports.getUserIdAxosoft(axosoftUrl, axosoftToken, slackToken, message)
                            .then(function(userIdAxo){
                                params.filters = `assigned_to.id=${userIdAxo}`;
                                return resolve(params)
                            }).catch(function(reason){
                                  //module.exports.sendTextToSlack(slackToken, channelId, `I could not find a user with \`${reason}\` email address in axosoft!`);
                                  return reject(reason);
                            })
                      }
                      else{
                        return resolve(params);
                      }
                  });
              }

};

