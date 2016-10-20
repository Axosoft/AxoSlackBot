const request = require('request');
const config = require('./config.json');
const MongoClient = require('mongodb').MongoClient;
const qs = require('querystring');

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

sendDataToSlack: function(slackAccessToken, channelId, body){
                  var attachmentArrays = [];
                  var pageNumber = Math.ceil((body.metadata.total_count/body.metadata.page_size));
                  var itemType, axosoftData;

                  var formatDueDate = function(dueDate){
                          if(dueDate == null)return '';
                          else{
                            return '\`Due: ' + module.exports.timeFormat(dueDate) + '\`';
                          } 
                  };

                  var formatText = function(txt){
                          if(body.requestedPage != undefined)return `Here are your items (page ${body.requestedPage} of ${pageNumber})`;
                          else return;
                  };

                  var formatWorkItemType = function(workItemType){
                    if(workItemType == null)return '';
                    else{
                      return `\n *Work Item Type:* ${axosoftData.workItemType}`;
                    }
                  };

                  for (x = 0; x < body.data.length; x++) {
                        axosoftData = {
                            link: `http://localhost/OnTimeWeb/viewitem?id=${body.data[x].id}&type=${body.data[x].item_type}&force_use_number=true/`,
                            axosoftItemName: body.data[x].name,
                            workFlowStep: body.data[x].workflow_step.name,
                            axosoftId: body.data[x].id, 
                            itemType: body.data[x].item_type,
                            workItemType: (function(){
                              if(!body.data[x].hasOwnProperty("custom_fields.custom1")){
                                return null;
                              }else{
                                return body.data[x].custom_fields.custom_1;
                              }
                            }).call()
                        };

                        if((body.data[x].completion_date != null) && (body.data[x].due_date == null)){
                              axosoftData.completionDate = body.data[x].completion_date;
                              attachmentArrays.push({
                                color: "#36a64f",
                                text: `<${axosoftData.link}| Axo${axosoftData.itemType.substring(0,1)}:${axosoftData.axosoftId}>  ${formatWorkItemType(axosoftData.workItemType)} \`${axosoftData.workFlowStep}\` ${axosoftData.axosoftItemName} ${'\`Completion Date: ' + axosoftData.completionDate + '\`'}`,
                                mrkdwn_in:["text"]
                              });
                        }else{
                            axosoftData.dueDate = body.data[x].due_date;
                            attachmentArrays.push({
                              color: "#36a64f",
                              text: `<${axosoftData.link}| Axo${axosoftData.itemType.substring(0,1)}:${axosoftData.axosoftId}>  ${formatWorkItemType(axosoftData.workItemType)} \`${axosoftData.workFlowStep}\` ${axosoftData.axosoftItemName} ${formatDueDate(axosoftData.dueDate)}`,
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
                  module.exports.makeRequest("GET","https://slack.com/api/chat.postMessage", params, function(err, response, body){});
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
              
              if (today.getTime() == date.getTime()) {
                  strDate = "Today";
              } else if (yesterday.getTime() == date.getTime()) {
                  strDate = "Yesterday";
              } else if (tomorrow.getTime() == date.getTime()) {
                  strDate = "Tomorrow";
              } else {
                  strDate = months[date.getMonth()] + "-" + date.getDate();
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
                                      module.exports.makeRequest("GET", `${axosoftBaseUrl}users`, params, function(error, response, body){
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
                                      module.exports.makeRequest("GET", `${axosoftBaseUrl}users`, params, function(error, response, body){
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
                                                console.log("There is no document with the specified id in our data base!");
                                                reject({
                                                  userIdAxosoft : null
                                                });
                                            }else{
                                                  if(results[0].userIdAxosoft === undefined){
                                                    console.log("There is no userIdAxosoft within the found document!");
                                                    resolve({
                                                      userIdAxosoft: "-1"
                                                    });
                                                  }else{
                                                      resolve({
                                                        userIdAxosoft: results[0].userIdAxosoft
                                                      });
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



