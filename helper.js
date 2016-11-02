const request = require('request');
const config = require('./config.json');
const MongoClient = require('mongodb').MongoClient;
const qs = require('querystring');
const striptags = require('striptags');

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
                            return;
                          }
                  };

                  module.exports.attachmentMaker(body, axoBaseUrl, axosoftToken)
                  .then(function(attach){
                       params = {
                              token: slackAccessToken,
                              channel:channelId,
                              mrkdwn: true,
                              text: formatText(body),
                              attachments: JSON.stringify(attach) 
                        };
                        module.exports.makeRequest("GET","https://slack.com/api/chat.postMessage", params, function(err, response, body){});
                  }).catch(function(reason){
                      console.log(reason);
                  });
              },

// getParentName: function(parentId, axoBaseUrl, axosoftToken){
//                   return new Promise(function(resolve, reject){
//                        var params = {
//                           access_token: axosoftToken,
//                           filters: `id=${parentId}`,
//                           columns: "description,item_type,name,id,priority,due_date,workflow_step,,remaining_duration.duration_text,assigned_to,release,custom_fields.custom_1", 
//                         };
//                         module.exports.makeRequest("GET", `${axoBaseUrl}api/v5/features`, params, function(error, response, body){
//                           if(!error && response.statusCode == 200){
//                               var BODY = JSON.parse(body);
//                               if(BODY.data.length != 0){
//                                   resolve(BODY.data[0].name);
//                               }
//                           }
//                           else{
//                             //TODO
//                           }
//                         });
//                   });
// },

getParentName: function(parentIds, axoBaseUrl, axosoftToken){
                  var parentDictionary = {}; 
                  return new Promise(function(resolve, reject){
                      var params = {
                        access_token: axosoftToken,
                        //filters: `id=[${parentId}]`,
                        filters: `id=in[${parentIds}]`,
                        columns: "name",
                      };
                      module.exports.makeRequest("GET", `${axoBaseUrl}api/v5/features`, params, function(error, response, body){
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


attachmentMaker: function (Body, axoBaseUrl, axosoftToken){
        return new Promise(function(resolve, reject){
              var attachmentArrays = [];
              var parentIds = [];
              var itemType, axosoftData;

              var formatDueDate = function(data){
                      if((data.percent_complete != "100") && (data.due_date != null)){
                        return '\`Due: ' + module.exports.timeFormat(data.due_date) + '\`';
                      }else{
                        return "";
                      }
              };

              for (x = 0; x < Body.data.length; x++) {
                  axosoftData = {
                      link: `${axoBaseUrl}viewitem?id=${Body.data[x].id}&type=${Body.data[x].item_type}&force_use_number=true/`,
                      assignedTo: (function(){
                        if(Body.data[x].assigned_to.name != ""){
                          return Body.data[x].assigned_to.name;
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

            extraPromises.push(
                  module.exports.getParentName(parentIds, axoBaseUrl, axosoftToken)
                  .then(function(parentDictionary){
                      for(z=0; z < itemsWithParent.length; z++){
                        itemsWithParent[z].parent_name = parentDictionary[itemsWithParent[z].parent.id];
                        itemsWithParent[z].parent_link = `${axoBaseUrl}viewitem?id=${itemsWithParent[z].parent.id}&type=${itemsWithParent[z].item_type}&force_use_number=true/`;
                        var data = {
                            link: `${axoBaseUrl}viewitem?id=${itemsWithParent[z].id}&type=${itemsWithParent[z].item_type}&force_use_number=true/`,
                            parentLink: itemsWithParent[z].parent_link,
                            assignedTo: (function(){
                              if(itemsWithParent[z].assigned_to.name != ""){
                                return itemsWithParent[z].assigned_to.name;
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

                        attachmentArrays.push({
                          color: "#FF8000",
                          text: `<${data.link}| ${itemsWithParent[z].id}> ${data.workItemType} *${data.axosoftItemName}* \nParent ${data.parent}: <${data.parentLink}| ${data.parentName}>`,
                          mrkdwn_in:["text"]
                        });
                      }
                      resolve(attachmentArrays);
                  })
                  .catch(function(reason){
                    console.log(reason);
                  })
            );
        });
      },

// test: function(dic, itemsWithParent, attachment, Body){
//           for(z=0; z < itemsWithParent.length; z++){
//             itemsWithParent[z].parent_name = dic[itemsWithParent[z].parent.id];

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

makeAxosoftRequest: function(axosoftBaseUrl, axosoftAccessToken, controller, userId){ 
                        return new Promise(function(resolve, reject){
                          if(userId == undefined){
                              var params = {
                                access_token: axosoftAccessToken,
                                page_size: 5,
                                user_type: "user",
                                columns: "item_type,name,id,priority,due_date,workflow_step,custom_fields.custom_1"
                              };
                          }else{
                              var params = {
                                access_token: axosoftAccessToken,
                                page_size: 5,
                                user_type: "user",
                                user_id: userId,
                                columns: "item_type,name,id,priority,due_date,workflow_step,custom_fields.custom_1"
                            };
                          }

                            module.exports.makeRequest("GET",`${axosoftBaseUrl}${controller}`, params, function(error, response, body){
                               if(!error && response.statusCode == 200){
                                    var BODY = JSON.parse(body);
                                    if(BODY.data.length != 0){
                                      resolve(BODY);
                                    }
                                    reject("-1");
                                }
                                else{
                                  reject(null);
                                }
                            });
                        });
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

getUserIdAxosoft: function(axosoftBaseUrl,axosoftAccessToken, slackAccessToken, message){
                      return new Promise(function(resolve, reject){
                          module.exports.retrieveDataFromDataBase(message.team, message.user,"users")
                            .then(function(returnedDataFromDb){
                              var userIdAxosoft = returnedDataFromDb.userIdAxosoft;

                              //-1 means Document exists in collection but there is no userIdAxosoft
                              if(userIdAxosoft == "-1"){
                                module.exports.getUserEmailAddressFromSlack(message.user, slackAccessToken)
                                    .then(function(email){
                                      var _emailAddress = email;
                                      var params = {
                                          access_token: axosoftAccessToken,
                                          search_string: email
                                      };
                                      module.exports.makeRequest("GET", `${axosoftBaseUrl}api/v5/users`, params, function(error, response, body){
                                          if(!error && response.statusCode == 200){
                                              var BODY = JSON.parse(body);
                                              if(BODY.data.length == 0){
                                                 console.log(`no user found in axosoft with ${_emailAddress} email address!`);
                                                 return reject(`${_emailAddress}`);
                                              }else{
                                                //store userId in da database
                                                MongoClient.connect(config.mongoUri, function(err, database){
                                                  if(err) return console.log(err);
                                                  module.exports.updateDataBaseDocument(database, message.team, message.user, BODY.data[0].id, function() {
                                                      database.close();
                                                  });
                                                  return resolve(BODY.data[0].id);
                                                });
                                             }
                                          }else{
                                            //can not connect to axosoft
                                          }
                                      });
                                    }).catch(function(reason){
                                      //not able to get email address from slack!
                                    });
                              }
                              else{
                                return resolve(userIdAxosoft)
                              }
                            })
                            .catch(function(reason){
                                //null here means, there is no document with the specified id in our data base!
                                var userIdAxosoft;
                                if(reason.userIdAxosoft == null){ 
                                    module.exports.getUserEmailAddressFromSlack(message.user, slackAccessToken)
                                    .then(function(email){
                                      var _emailAddress = email;
                                      var params = {
                                          access_token: axosoftAccessToken,
                                          search_string: email
                                      };
                                      module.exports.makeRequest("GET", `${axosoftBaseUrl}api/v5/users`, params, function(error, response, body){
                                        if(!error && response.statusCode == 200){
                                            var BODY = JSON.parse(body);
                                            if(BODY.data.length == 0){
                                                console.log(`no user found in axosoft with ${_emailAddress} email address!`);
                                                return reject(`${_emailAddress}`);
                                            }else{
                                              MongoClient.connect(config.mongoUri, function(err, database){
                                                  if(err) return console.log(err);
                                                  database.collection('users').insertOne({
                                                    team_id: message.team, 
                                                    id: message.user,
                                                    userIdAxosoft: BODY.data[0].id
                                                  });
                                                  database.close();
                                                  return resolve(BODY.data[0].id);
                                             });
                                          }
                                        }else{
                                          //can not connect to axosoft
                                        }
                                      });
                                    })
                                    .catch(function(reason){
                                      //not able to get email address from slack!
                                    });
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
saveAxosoftUrl: function(userData, baseUrl) {
                  MongoClient.connect(config.mongoUri, function(err, database){
                      if(err) return console.log(err);
                      database.collection('teams').findAndModify(
                        {team_id: userData.team}, 
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
                                              }else{
                                                  if((results[0] === undefined) || (results[0].axosoftAccessToken === undefined)){
                                                    console.log("There is no document with the specified slack user id in our data base!");
                                                    reject("-1"); // -1 means no userAxosoftAccessToken exist!
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
                                                reject({userIdAxosoft : null});
                                              }else{
                                                    if(results[0].userIdAxosoft === undefined){
                                                      console.log("There is no userIdAxosoft within the found document!");
                                                      resolve({userIdAxosoft: "-1"});
                                                    }else{
                                                        resolve({userIdAxosoft: results[0].userIdAxosoft});
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
                                                      axosoftAccessToken: results[0].axoToken,
                                                      axosoftBaseURL: results[0].axosoftBaseUrl,
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

