const request = require('request');
const config = require('./config.json');
const MongoClient = require('mongodb').MongoClient;
const qs = require('querystring');
const striptags = require('striptags');
const urlEncode = require('urlencode');
const nodeAxosoft = require('./nodeAxosoft.js');
const entities = require("entities");
const store = require('./store.js');

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

filterTextMaker: function(message){
             return new Promise(function(resolve, reject){
                  var filterText = "";
                  module.exports.retrieveDataFromDataBase(message.team, message.user,"users")
                  .then(function(returnedData){
                          if(returnedData.filter.filterName != null){
                             filterText = ` filtered by \`${returnedData.filter.filterName}\``
                          }
                          resolve(filterText);
                  });
             }); 
},

formatText: function(body, message){
                return new Promise(function(resolve, reject){
                      var pageTotal = Math.ceil((body.metadata.total_count/body.metadata.page_size));
                      var page = body.metadata.page === 0 ? 1 : body.metadata.page;
                      var txt = "Here are ";
                      if(message.text.includes("my ")){
                        txt = txt + "your ";
                        addWhiteSpace = false;
                      }
                      if (message.match[2].length > 0) {
                        txt += message.match[2];
                      }

                      module.exports.filterTextMaker(message)
                      .then(function(filterName){
                            if(message.text.match('(.*)(page)(\\s)(\\d+)(.*)') != null){
                              if(message.text.includes("closed")){
                                resolve(`${txt}items ${filterName} [in the last 30 days] (page ${page} of ${pageTotal})`);
                              }else{
                                resolve(`${txt}items ${filterName} (page ${page} of ${pageTotal})`);
                              }
                            }else{
                              if(message.text.includes("closed")){
                                resolve((pageTotal>1) ? txt = txt + `items ${filterName} [in the last 30 days], (page 1 of ${pageTotal})` : txt = txt + `items ${filterName} [in the last 30 days]`);
                              }else if(pageTotal>1){
                                resolve(`${txt}items ${filterName} (page 1 of ${pageTotal})`);
                              }else{
                                resolve(`${txt}items ${filterName}`);
                              }
                            }
                      });
                });
},

sendDataToSlack: function(slackAccessToken, message, body, axoBaseUrl, axosoftToken){
                    var myKeyWordTypedByUser = false;
                    if(message.match[1].includes("my")){
                      myKeyWordTypedByUser = true;
                    };

                    module.exports.attachmentMaker(body, axoBaseUrl, axosoftToken, myKeyWordTypedByUser)
                    .then(function(attach){
                        module.exports.formatText(body, message)
                        .then(function(txt){
                            var params = {
                                  token: slackAccessToken,
                                  channel: message.channel,
                                  mrkdwn: true,
                                  text: txt,
                                  attachments: JSON.stringify(attach),
                                  replace_original: true
                            };

                            module.exports.makeRequest("GET","https://slack.com/api/chat.postMessage", params, function(err, response, body){});
                        });
                    }).catch(function(reason){
                        console.log(reason);
                    });
},

addFilterGroupLabel: function(attachmentArray, filters, addButton){
                       var myFiltersCount = filters.myFilters.length;
                       if(myFiltersCount == 0){
                          attachmentArray.splice(2, 0, {text: `\`[Other filters]\``, color: "#ffffff", mrkdwn_in:["text"]});
                       }else if(filters.otherFilters.length == 0){
                         attachmentArray.splice(2, 0, {text: `\`[My filters]\``, color: "#ffffff", mrkdwn_in:["text"]});
                       }else{
                         attachmentArray.splice(2, 0, {text: `\`[My filters]\``, color: "#ffffff", mrkdwn_in:["text"]});
                         attachmentArray.splice(myFiltersCount + 3, 0, {text: ` `, color: "#ffffff", mrkdwn_in:["text"]});
                         attachmentArray.splice(myFiltersCount + 4, 0, {text: `\`[Other filters]\``, color: "#ffffff", mrkdwn_in:["text"]});
                       }

                       (addButton) ? module.exports.addFilterButton(attachmentArray) : attachmentArray;
                       return attachmentArray;
},

addFilterButton: function(array){
                    var actionObject = [];
                    if(store.default.requestedPage == 0){
                      actionObject = [{
                           name: "nextfilterPage",
                           text: "Next 10 filters",
                           type: "button",
                           value: "nextfilterPage"
                       }]
                    }else if(store.default.requestedPage == store.default.filters.length || store.default.requestedPage == store.default.filters.length-1){
                      actionObject = [{
                            name: "previousfilterPage",
                            text: "Previous 10 filters",
                            type: "button",
                            value: "previousfilterPage"
                       }]
                    }else{
                      actionObject =[{
                            name: "previousfilterPage",
                            text: "Previous 10 filters",
                            type: "button",
                            value: "previousfilterPage"
                        },{
                           name: "nextfilterPage",
                           text: "Next 10 filters",
                           type: "button",
                           value: "nextfilterPage"
                       }]
                    }

                    array.push({
                        fallback: "You are unable to go to the next filter page",
                        callback_id: "filter_page",
                        color: "#333333",
                        attachment_type: "default",
                        actions: actionObject
                    });
},

sendFiltersToSlack: function(slackAccessToken, message, filters, bot){
                      module.exports.retrieveDataFromDataBase(message.team, message.user,"users")
                      .then(function(returnedData){
                          var myFiltersCount = filters[0].myFilters.length, currentStoredFilter, otherFiltersCount = filters[0].otherFilters.length, count = 0, addButton;
                          store.default.filters = filters;
                          store.default.slackAccessToken = slackAccessToken;
                          store.default.requestedPage = 0;

                          var dictionary = [], attachments = [{
                            title: `Please type in the number of the filter you would like to use.`,
                            color: "#ffffff"
                          }];

                          if(returnedData.filter == undefined || returnedData.filter.filterName == null){
                            attachments.push({text: `There is no filter currently applied.`,color: "#ffffff"});
                          }else{
                            attachments.push({text: `The current filter is \`[${returnedData.filter.filterName}]\`. type \`0\` to remove the current filter`, color: "#ffffff", mrkdwn_in:["text"]});
                            currentStoredFilter = returnedData.filter.filterName;
                          }

                          store.default.text = attachments[1].text;
                          ((myFiltersCount < 10) && (otherFiltersCount + myFiltersCount < 10)) ? count = otherFiltersCount + myFiltersCount : count = 10;
                          for(x=0; x<count; x++){
                              attachments.push({
                                text: `${x+1}:    ` + ((x < myFiltersCount)? filters[0].myFilters[x].name : filters[0].otherFilters[x- myFiltersCount].name),
                                color: "#333333"
                              });

                              dictionary.push({
                                number: x + 1,
                                filterName: (x < myFiltersCount)? filters[0].myFilters[x].name : filters[0].otherFilters[x-myFiltersCount].name,
                                filterId: (x < myFiltersCount)? filters[0].myFilters[x].id : filters[0].otherFilters[x-myFiltersCount].id
                              });

                              if(x == count-1) store.default.currentFiltersCount = count;
                          }

                          (filters.length > 1) ? addButton = true : addButton = false;
                          var attachmentArray = module.exports.addFilterGroupLabel(attachments, filters[0], addButton);

                          bot.startConversation(message, function(err, convo){
                                convo.ask({attachments:attachmentArray}, function(response, convo){
                                    var selectedFilter = dictionary.find(function(filter){
                                        return filter.number.toString() === response.text;
                                    });

                                    if(response.hasOwnProperty("original_message")){
                                      //meaning user clicked on the next/previous buttons
                                      if(response.original_message.text == "")convo.stop();
                                    }else if(response.text === "0"){
                                      module.exports.saveAxosoftFilter({number:0, filterName:null, filterId: null}, response);
                                      module.exports.sendTextToSlack(slackAccessToken, response.channel, `\`${currentStoredFilter}\` removed!`);
                                    }else if(selectedFilter === undefined){
                                      module.exports.sendTextToSlack(slackAccessToken, response.channel, "The entered filter number either is not valid or it does not exist. Please try again :slightly_smiling_face:");
                                    }else{
                                      module.exports.saveAxosoftFilter(selectedFilter, response);
                                      module.exports.sendTextToSlack(slackAccessToken, response.channel, `\`${selectedFilter.filterName}\` saved!`);
                                    }
                                    convo.stop();
                                });
                          });
                      })
},

sendNewFiltersToSlack: function(message){
                          //TODO make sure store.default != null
                          var requestPageNumber = 0, dictionary = [], addButton, attachments = [{
                            title: `Please type in the number of the filter you would like to use.`,
                            color: "#ffffff"
                          },{
                            text: store.default.text,
                            color: "#ffffff",
                            mrkdwn_in:["text"]
                          }];

                          var requestFilterPage = store.default.filters[store.default.requestedPage];
                          var count = requestFilterPage.myFilters.length + requestFilterPage.otherFilters.length;

                          for(e=0; e < count; e++){
                              attachments.push({
                                text: `${e+1}:    ` + ((e < requestFilterPage.myFilters.length)? requestFilterPage.myFilters[e].name : requestFilterPage.otherFilters[e - requestFilterPage.myFilters.length].name),
                                color: "#333333"
                              });

                              dictionary.push({
                                number: e + 1,
                                filterName: (e < requestFilterPage.myFilters.length)? requestFilterPage.myFilters[e].name : requestFilterPage.otherFilters[e - requestFilterPage.myFilters.length].name,
                                filterId: (e < requestFilterPage.myFilters.length)? requestFilterPage.myFilters[e].id : requestFilterPage.otherFilters[e - requestFilterPage.myFilters.length].id
                              });
                          }
                          store.default.dictionary = dictionary;
                          var attach = module.exports.addFilterGroupLabel(attachments, requestFilterPage, true);
                          var params = {
                              token: store.default.slackAccessToken,
                              ts: message.message_ts,
                              channel: message.channel,
                              mrkdwn: true,
                              attachments:JSON.stringify(attach)
                          };

                          module.exports.makeRequest("GET","https://slack.com/api/chat.update", params, function(err, response, body){
                            var Body = JSON.parse(body);
                            store.default.user = message.user;
                            store.default.channel = Body.channel;
                          });
 },

sendNewPageToSlack: function(slackAccessToken, axosoftBaseUrl, axosoftAccessToken, data, items){
                      var dataText = data.original_message.text;
                      var nextPageNumber, txt, currentPageNumber, myKeyWordExists;
                      currentPageNumber = parseInt(module.exports.currentPage(dataText));

                      (data.actions[0].name === "nextPage") ? nextPageNumber = currentPageNumber + 1 : nextPageNumber = currentPageNumber - 1 ;
                      txt = dataText.replace(currentPageNumber.toString(), nextPageNumber.toString());
                      (dataText.includes("your"))? myKeyWordExists = true : myKeyWordExists = false;

                      module.exports.attachmentMaker(items, axosoftBaseUrl, axosoftAccessToken, myKeyWordExists, data)
                      .then(function(attach){
                          var params = {
                                token: slackAccessToken,
                                ts: data.message_ts,
                                channel: data.channel.id,
                                mrkdwn: true,
                                text: txt,
                                attachments: JSON.stringify(attach)
                          };
                          module.exports.makeRequest("GET","https://slack.com/api/chat.update", params, function(err, response, body){});
                      })
                      .catch(function(reason){
                         module.exports.sendTextToSlack(slackAccessToken, data.channel.id, "Something went wrong with getting the items of next/previous page :astonished:");
                      });
},

attachmentMaker: function (Body, axoBaseUrl, axosoftToken, myKeyWordExists, msg){
                    return new Promise(function(resolve, reject){
                          var attachmentArrays = [];
                          var parentIds = [];
                          var axosoftData;
                          var indexOfitemsWithParent = [];
                          const itemsWithParent = [];

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
                                        text: `<${axosoftData.link}| ${axosoftData.number}>: ${custom_1}  *${axosoftData.name}*  ${axosoftData.assigned_to}  \`${axosoftData.workflow_step}\` ${formatCompletionDate(axosoftData.completionDate)}`,
                                        mrkdwn_in:["text"]
                                      });
                                  }else{
                                      attachmentArrays.push({
                                        color: "#38B040",
                                        text: `<${axosoftData.link}| ${axosoftData.number}>: ${custom_1}  *${axosoftData.name}*  ${axosoftData.assigned_to}  \`${axosoftData.workflow_step}\` ${formatDueDate(Body.data[x])}`,
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
                                      text: `<${data.link}| ${data.number}>: ${custom_1}  *${data.name}*  ${data.assigned_to}  \`${data.workflow_step}\` ${formatCompletionDate(data.completionDate)}\n\t(Parent) <${data.parent_link}|${data.parent.id}>: ${data.parent_name}`,
                                      mrkdwn_in:["text"]
                                  });
                              }else{
                                  attachmentArrays.splice(indexOfitemsWithParent[e],0,{
                                    color: "#38B040",
                                    text: `<${data.link}| ${data.number}>: ${custom_1}  *${data.name}*  ${data.assigned_to}  \`${data.workflow_step}\` ${formatDueDate(item)}\n\t(Parent) <${data.parent_link}|${data.parent.id}>: ${data.parent_name}`,
                                    mrkdwn_in:["text"]
                                  });
                              }
                            }
                            var attachArrays = module.exports.attachInteractiveButtons(attachmentArrays, Body, msg);
                            resolve(attachArrays);
                        })
                        .catch(function(reason){
                          reject(reason);
                        })
                    });
},

attachInteractiveButtons:function(attachArray, Body, data){
                            var txt, pageTotal = Math.ceil((Body.metadata.total_count/Body.metadata.page_size));
                            (data == undefined) ? txt = undefined : txt = data.original_message.text;

                            var currentPage = module.exports.currentPage(txt);
                            var obj = {
                                fallback: "You are unable to go to the next page",
                                callback_id: "nextPage",
                                color: "#FF8C00",
                                attachment_type: "default",
                            };

                            if(Body.data.length >= 10 || (currentPage == pageTotal - 1) || Body.metadata.page == pageTotal){
                                  if((currentPage == undefined && Body.metadata.page == 0) || (currentPage == "2" && data.actions[0].name == "previousPage" || Body.metadata.page == 1)){
                                        obj.actions = [{
                                            name: "nextPage",
                                            text: "Next 10 Items",
                                            type: "button",
                                            value: "nextPage"
                                        }];
                                        attachArray.push(obj);
                                  }else if(Body.metadata.page == pageTotal){
                                      obj.actions = [{
                                            name: "previousPage",
                                            text: "Previous 10 Items",
                                            type: "button",
                                            value: "previousPage"
                                      }];
                                      attachArray.push(obj);
                                  }else{
                                      obj.actions = [{
                                            name: "previousPage",
                                            text: "Previous 10 Items",
                                            type: "button",
                                            value: "previousPage"
                                            },{
                                            name: "nextPage",
                                            text: "Next 10 Items",
                                            type: "button",
                                            value: "nextPage"
                                      }];
                                      attachArray.push(obj);
                                  }
                            }
                            return attachArray;
},

attachmentMakerForHelpOptions: function(){
                                  return new Promise(function(resolve, reject){
                                      var options = [
                                        "*axo + ID:* Shows details of a single item, e.g. axo 5 (works in any room the Axosoft bot is in)",

                                        "*get my items:* List of items currently assigned to you"
                                        + "\n*get my updated items:* List of your most recently updated items"
                                        + "\n*get my upcoming items:* List of your open items due in the next 2 weeks"
                                        + "\n*get my closed items:* List of your items closed in the last 30 days"
                                        + "\n*get my open items:* List of your items not yet completed"
                                        + "\n*get my ranked items:* List of your items sorted by rank",

                                        "*get updated items:* List of all most recently updated items"
                                        + "\n*get upcoming items:* List of all open items due in the next 2 weeks"
                                        + "\n*get closed items:* List of all items closed in the last 30 days"
                                        + "\n*get open items:* List of all items not yet completed"
                                        + "\n*get ranked items:* List of all items sorted by rank",

                                        "Add 'page #' after any command to view items on that page, e.g. `get my upcoming items page 2`",
                                        
                                        "*update url:* Updates URL to your Axosoft account",

                                        'For any questions or feedback, contact <https://support.axosoft.com/|success@axosoft.com>'
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
                              include_inactive_projects: true,
                              include_inactive_releases: true
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
                                reject("noParentData");
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

checkAxosoftDataForUser: function(bot, message) {
                            var userData = {};
                            return new Promise(function(resolve, reject) {
                              MongoClient.connect(config.mongoUri, function(err, database){
                                module.exports.getAxosoftBaseUrl(bot, message, database)
                                .then(function(axosoftBaseURL){
                                  userData.axosoftBaseURL = axosoftBaseURL;
                                  var axosoftAccessToken = module.exports.getAxosoftAccessToken(bot, message, database, axosoftBaseURL)
                                  return axosoftAccessToken})
                                .then(function(axosoftAccessToken){
                                  userData.axosoftAccessToken = axosoftAccessToken;
                                  if(axosoftAccessToken){
                                    resolve(userData);
                                  }
                                    reject('no axosoft access token');
                                  })
                                  .catch(function(reason){
                                    console.log(reason);
                                  });
                                });
                              });
},

getAxosoftBaseUrl: function(bot, message, database) {
                      return new Promise(function(resolve, reject){
                          database.collection('teams').find({"id":message.team}).toArray(function(err, results){
                              if (!err && results.length > 0) {
                                  if (results[0].axosoftBaseURL == undefined) {
                                    resolve(module.exports.setAxosoftBaseUrl(bot, message));
                                  }else{
                                    resolve(results[0].axosoftBaseURL);
                                  }
                              }else{
                                console.log(err);
                                reject('Couldn\'t find URL.')
                              }
                          });
                      }); 
},

getAxosoftAccessToken: function(bot, message, database, axosoftBaseURL) {
                          return new Promise(function(resolve, reject){
                            database.collection('users').find({"id":message.user}).toArray(function(err, results){
                                if(!err & results.length > 0){
                                    if(results[0].axosoftAccessToken == undefined){
                                      module.exports.setAxosoftAccessToken(bot, message, axosoftBaseURL);
                                    }else{
                                      resolve(results[0].axosoftAccessToken);
                                    }
                                }else{
                                  module.exports.createNewUser(message)
                                  .then(function(){
                                    module.exports.setAxosoftAccessToken(bot, message, axosoftBaseURL);
                                  })
                                  reject('No user');
                                }
                              })
                          });
},

retrieveDataFromDataBase: function(slackTeamId, slackUserId, documentName){
                              return new Promise(function(resolve, reject){
                                  var axosoftAccessToken, axosoftBaseURL, slackAccessToken;

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
                                                        resolve({
                                                          axosoftAccessToken: results[0].axosoftAccessToken,
                                                          filter: results[0].axsoftFilter
                                                        });
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

createNewUser: function(message){
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
                        if(url.indexOf("https://") == -1 && url.indexOf("http://") == -1){
                          return url = "https://"+url;
                        }
                        // breaks if using http for hosted accnts 
                        else if (url.indexOf("http://") > -1 && url.indexOf(".axosoft.com") > -1){
                          return url.replace("http://", "https://")
                        } else {
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

setAxosoftAccessToken: function(bot, message, axosoftUrl){
                          var axosoftLoginUrl = module.exports.axosoftLoginUrlBuilder(axosoftUrl, message);
                          bot.reply(message, `I need permissions to talk to your Axosoft account. <${axosoftLoginUrl}|Click here to Authorize>`);
},

setAxosoftBaseUrl: function(bot, message){
                      return new Promise(function(resolve, reject) {
                              bot.startConversation(message, function(err, convo){
                                      convo.ask("Can you tell me the URL of your Axosoft account? i.e. https://example.axosoft.com", function(response, convo){
                                          var baseUrl = module.exports.formatAxosoftBaseUrl(response.text.replace(/[<>]/g, ''));

                                          module.exports.makeRequest('GET', baseUrl + '/api/version', {}, function(error, response, body){
                                              if(!error && response.statusCode == 200){
                                                var Body = JSON.parse(body);
                                                if(Body.data.hasOwnProperty("revision") && Body.data.revision >= 11218){
                                                  var axosoftLoginUrl = module.exports.axosoftLoginUrlBuilder(baseUrl, message);
                                                    module.exports.saveAxosoftUrl(message, baseUrl);
                                                    resolve(baseUrl);
                                                    convo.say("Got it :ok_hand:");
                                                    convo.next();
                                                } else {
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
},

authorizeUserwithoutCollection:function(bot, message, returnedData){
                                  var saveAxoBaseUrl = false;
                                  module.exports.retrieveDataFromDataBase(message.team, message.user,"teams")
                                  .then(function(returnedData){
                                      if(returnedData.axosoftBaseURL == undefined){
                                        saveAxoBaseUrl = true;
                                      }
                                      bot.startConversation(message, function(err, convo) {
                                          convo.ask("What is the URL or your Axosoft account? i.e. https://example.axosoft.com", function(response, convo) {
                                          var baseUrl = module.exports.formatAxosoftBaseUrl(response.text.replace(/[<>]/g, ''));
                                          module.exports.makeRequest('GET', baseUrl + '/api/version', {}, function(error, response, body){
                                            if(!error && response.statusCode == 200){
                                              var Body = JSON.parse(body);
                                              if(Body.data.hasOwnProperty("revision") && Body.data.revision >= 11218){
                                                var axosoftLoginUrl = module.exports.axosoftLoginUrlBuilder(baseUrl, message);
                                                if(saveAxoBaseUrl){
                                                  module.exports.saveAxosoftUrl(message, baseUrl);
                                                }
                                                convo.stop();
                                                module.exports.retrieveDataFromDataBase(message.team, message.user,"teams")
                                                  .then(function(returnedDataFromDb){
                                                    var slackToken = returnedDataFromDb.slackAccessToken;
                                                    module.exports.sendTextToSlack(slackToken, message.channel, `I need permissions to talk to your Axosoft account. <${axosoftLoginUrl}|Click here to Authorize>`);
                                                  })
                                                  .catch(function(reason){
                                                    //can not get slackToken from DB
                                                    module.exports.sendTextToSlack(slackToken, message.channel, "There was an error authorizing your account"); 
                                                  })
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
                            var baseTxt = `I could not find any ${ofYourConditional}${requestedKeyWord(message.match[2])}${requestedKeyWord(message.match[3])}`;
                            resolve(baseTxt);
                });
},

attachSelectedFilterToParams: function(message, params){
                                  return new Promise(function(resolve, reject){
                                      module.exports.retrieveDataFromDataBase(message.team, message.user,"users")
                                      .then(function(returnedData){
                                          if(returnedData.filter.filterName != null && returnedData.filter != undefined){
                                            params.filter_id = returnedData.filter.filterId
                                          }
                                          resolve(params);
                                      }).catch(function(reason){
                                          console.log(reason);
                                          resolve(params);
                                      })
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

                      module.exports.attachSelectedFilterToParams(message, params)
                      .then(function(params){
                            var keyWord = message.match[2].toLowerCase();
                            if(keyWord != "open " && keyWord != "closed " && keyWord != "updated " && keyWord != "ranked " && keyWord != "upcoming " && keyWord != ""){
                              module.exports.sendTextToSlack(slackToken, message.channel,"I don't understand what you want me to do. You can ask me 'help' for a list of supported commands");
                              reject("vague Request");
                            }

                            //paging
                            var page = 1;
                            var pageMatches = message.text.match(/(.*)(page\s)(\d+)/i);
                            if (pageMatches){
                                page = pageMatches[3];
                                params.page = page;
                            }

                            var editedParams = module.exports.attachFiltersToParamsBaseOnRequestedKeyWord(params, keyWord);
                            if(message.match[1] == 'get my'){
                                module.exports.getUserIdAxosoft(axosoftUrl, axosoftToken)
                                .then(function(userIdAxo){
                                    editedParams.filters = editedParams.filters + `,assigned_to.id=${userIdAxo}`;
                                    return resolve(editedParams);
                                }).catch(function(reason){
                                    return reject(reason);
                                })
                            }
                            else{
                              return resolve(editedParams);
                            }
                      });
                  });
},

attachFiltersToParamsBaseOnRequestedKeyWord: function(params, txt){
                                                if(txt.includes("open")){
                                                  params.filters = 'completion_date="1899-01-01"';
                                                  params.sort_fields = 'last_updated_date_time DESC';
                                                }else if(txt.includes("closed")){
                                                  params.filters = 'completion_date=in[last30_days]';
                                                  params.sort_fields = 'completion_date DESC,last_updated_date_time DESC';
                                                }else if(txt.includes("updated")){
                                                  params.sort_fields = 'last_updated_date_time DESC';
                                                }else if(txt.includes("ranked")){
                                                  params.sort_fields = 'rank';
                                                }else if(txt.includes("upcoming")){
                                                    var today = new Date();
                                                    Date.prototype.addDays = function(days){
                                                        var date = new Date(this.valueOf());
                                                        date.setDate(date.getDate() + days);
                                                        return date;
                                                    }
                                                    params.due_date = `[${today.addDays(-90).toISOString()}=${today.addDays(14).toISOString()}]`;
                                                    params.filters = 'completion_date="1899-01-01"';
                                                    params.sort_fields = 'due_date,last_updated_date_time DESC';
                                                }
                                                return params;
},

paramsBuilderForInteractiveButtons: function(returnedDataFromDb, data){
                                        return new Promise(function(resolve, reject){
                                            var currentPageNumber = parseInt(module.exports.currentPage(data.original_message.text));
                                            module.exports.retrieveDataFromDataBase(data.team.id, data.user.id,"users")
                                            .then(function(returnedData){
                                                var params = {
                                                    access_token: returnedData.axosoftAccessToken,
                                                    columns: "name,id,item_type,priority,due_date,workflow_step,description,remaining_duration.duration_text,assigned_to,release,percent_complete,custom_fields.custom_1",
                                                    page_size: 10,
                                                    sort_fields: 'created_date_time DESC',
                                                    page: (data.actions[0].name === "nextPage") ? currentPageNumber + 1 : currentPageNumber - 1
                                                };

                                                var editedParams = module.exports.attachFiltersToParamsBaseOnRequestedKeyWord(params, data.original_message.text);
                                                var message = {
                                                    team: data.team.id,
                                                    user: data.user.id
                                                };

                                                module.exports.attachSelectedFilterToParams(message, editedParams)
                                                .then(function(params){
                                                  if(data.original_message.text.includes("your")){
                                                      module.exports.getUserIdAxosoft(returnedDataFromDb.axosoftBaseURL, returnedData.axosoftAccessToken)
                                                      .then(function(axosoftUserId){
                                                          params.filters = params.filters + `,assigned_to.id=${axosoftUserId}`;
                                                          resolve(params);
                                                      })
                                                  }else{
                                                     resolve(params);
                                                  }
                                                });
                                            })
                                            .catch(function(reason){
                                                console.log(reason);
                                            })
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

formatAxosoftItemData: function(item){
                          var fieldsArray = [];

                          Array.prototype.attachData = function(obj){
                            if(obj.value.length > 0)
                            this.push(obj);
                          };

                          fieldsArray.attachData({
                            title: 'Project',
                            value: item['project'],
                            short: true
                          });

                          fieldsArray.attachData({
                            title: 'Release',
                            value: item['release'],
                            short: true
                          });

                          fieldsArray.attachData({
                            title: 'Workflow Step',
                            value: item['workflow_step'],
                            short: true
                          });

                          fieldsArray.attachData({
                            title: 'Assigned To',
                            value: item['assigned_to'],
                            short: true
                          });

                          fieldsArray.attachData({
                            title: 'Priority',
                            value: item['priority'],
                            short: true
                          });

                          if(item.hasOwnProperty("remaining_duration")){
                            fieldsArray.attachData({
                              title: 'Remaining Estimate',
                              value: item['remaining_duration']['duration_text'],
                              short: true
                            });
                          }

                          if (item['parent']['id'] > 0 ){
                            fieldsArray.attachData({
                              title: 'Parent',
                              value: `<${item.parent_link}|${item.parent.id}>`,
                              short: true
                            });
                          }

                          //if work item type exists
                          if(item['custom_fields'] != undefined){
                            fieldsArray.attachData({
                              title: 'Work Item Type',
                              value: item['custom_fields'],
                              short: true
                            });
                          }

                          if(item.hasOwnProperty("description")){
                            fieldsArray.attachData({
                              title: 'Description',
                              value: module.exports.trimDescription(item['description']),
                              short: false
                            });
                          }

                          return fieldsArray;
},

trimDescription: function(description){
                    if (description.length > 900) {
                      for(d=900; d > 0; d--){
                        if(description.charAt(d) == " "){
                          description = description.slice(0, d) + '...';
                          break;
                        }
                      }
                    }
                    return description;
},

axosoftDataBuilder: function(baseUrl, data){
                        var axosoftData = new Object();
                        var propertyName = null;
                        axosoftData.link = `${baseUrl}/viewitem?id=${data.id}&type=${data.item_type}&force_use_number=true/`;
                        axosoftData.parent_link = `${baseUrl}/viewitem?id=${data.parent.id}&type=${data.item_type}&force_use_number=true/`;
                        for(z=0; z < Object.keys(data).length; z++){
                            propertyName = Object.keys(data)[z];

                            if(!(data[propertyName] === null) && !(data[propertyName] === "")){
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
                      }else if(itemType == "defects"){
                        return Axo.axosoftApi.Defects;
                      }else{
                        return Axo.axosoftApi.Features;
                      }
},

axosoftFiltersBuilder: function(bot, message, axosoftData){
                          return new Promise(function(resolve, reject){
                                 var nodeAxo = new nodeAxosoft(axosoftData.axosoftBaseURL, axosoftData.axosoftAccessToken);
                                 var argArray = ["features"];
                                 nodeAxo.promisify(nodeAxo.axosoftApi.Filters.get, argArray)
                                 .then(function(filters){
                                   resolve(filters.data);
                                 })
                                 .catch(function(reason){
                                   console.log(reason);
                                   reject(reason);
                                 });
                          });
},

pageAxosoftFilters: function(filters, axosoftUserId){
                      var myFiltersLength = filters[0].myFilters.length;
                      var otherFiltersLength = filters[0].otherFilters.length;

                      var groupsCount = 0, dividendFilters = (myFiltersLength + otherFiltersLength)/10, axosoftPagedFilters = [];
                      (dividendFilters % 1 === 0) ? groupsCount = dividendFilters : groupsCount = Math.floor(dividendFilters) + 1;

                      var myF = [], otherF = [];
                      for(x=0; x<groupsCount; x++){
                        for(s=0; s<10; s++){
                          if(s + (x * 10) < myFiltersLength){
                            myF.push(filters[0].myFilters[s + (x * 10)]);
                          }

                          if(filters[0].otherFilters[s + (x * 10) - myFiltersLength] != undefined){
                            otherF.push(filters[0].otherFilters[s + (x * 10) - myFiltersLength]);
                          }
                        }

                        axosoftPagedFilters.push({
                          myFilters: (myF.length == 0) ? [] : myF,
                          otherFilters: (otherF.length) ? otherF : []
                        });
                        myF = [], otherF = [];
                      }
                      return axosoftPagedFilters;
},

//TODO catch block is required
categorizeAxosoftFilters: function(axosoftData ,axosoftFilters, bot, message){
                            return new Promise(function(resolve, reject){
                                module.exports.retrieveDataFromDataBase(message.team, message.user, "users")
                                .then(function(returnedData){
                                    if(returnedData.hasOwnProperty("axosoftUserId")){
                                        var separatedFilters = sepamodule.exports.filtersSeparator(axosoftFilters, returnedData.axosoftUserId);
                                        resolve(module.exports.pageAxosoftFilters(separatedFilters, axosoftUserId));
                                    }else{
                                       module.exports.getUserIdAxosoft(axosoftData.axosoftBaseURL, returnedData.axosoftAccessToken)
                                       .then(function(axosoftUserId){
                                         var separatedFilters = module.exports.filtersSeparator(axosoftFilters, axosoftUserId);
                                         resolve(module.exports.pageAxosoftFilters(separatedFilters, axosoftUserId));
                                       })
                                    }
                                })
                                .catch(function(reason){
                                  console.log(reason);
                                  reject(reason);
                                })
                            });
},

filtersSeparator: function(pagedAxosoftFilters, axosoftUserId){
                      var myFilters = [], otherFilters = [];
                      var pagesCount = pagedAxosoftFilters.length;

                      pagedAxosoftFilters.forEach(function(filter){
                        if(filter.user.id == axosoftUserId){
                            myFilters.push(filter);
                        }else{
                            otherFilters.push(filter);
                        }
                      });

                      return [{
                        myFilters: myFilters,
                        otherFilters: otherFilters
                      }];
},

saveAxosoftFilter: function(data, response){
                    var userId = response.user;
                    var teamId = response.team;
                    //TODO make sure document exists before storing the axosoftFilter in da database

                    MongoClient.connect(config.mongoUri,function(err, database){
                      if(err){
                        return console.log(err);
                      }else{
                        database.collection('users').findAndModify(
                           {id: userId, team_id: teamId},
                           [],
                           {$set: {axsoftFilter: data}},
                           {},
                           function(err, object){
                              if (err){
                                  console.warn(err.message); 
                              }else{
                                  console.dir(object);
                              }
                           }
                        );
                      }
                    });
},

validateRequstedPageNumber: function(message){
                              if(message[4].toLowerCase().includes("page")){
                                var pagingText = message[4].match(/(.*)(page\s)((-[0-9]+)|([0-9]+))/);
                                if(pagingText != null && pagingText[5] != 0 && pagingText[5] < 2147483647){
                                  return true;
                                }else{
                                  return false;
                                }
                              }else{
                                return true;
                              }
},

currentPage: function(txt){
                    if(txt != undefined){
                      var one = txt.lastIndexOf("page") + 5;
                      var two = txt.lastIndexOf("of") - 1;

                      var result = txt.substr(one, (two - one));
                      return result;
                    }
}

};