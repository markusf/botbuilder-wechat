var builder = require('botbuilder');
var wechatBotBuilder = require('./wechatBot');
var express = require('express');
var app = express();
var http = require('http').Server(app);

var bot = new wechatBotBuilder.WechatBot({
  wechatAppId: process.env.wechatAppId,
  wechatSecret: process.env.wechatSecret,
  wechatToken: process.env.wechatToken
});

bot.add('/', [
  function (session) {
    builder.Prompts.text(session, "Hello... What's your name?");
  },
  function (session, results) {
    session.userData.name = results.response;
    builder.Prompts.number(session, "Hi " + results.response + ", How many years have you been coding?");
  },
  function (session, results) {
    session.userData.coding = results.response;
    builder.Prompts.choice(session, "What language do you code Node using?", ["JavaScript", "CoffeeScript", "TypeScript"]);
  },
  function (session, results) {
    session.userData.language = results.response.entity;
    session.send("Got it... " + session.userData.name +
    " you've been programming for " + session.userData.coding +
    " years and use " + session.userData.language + ".");
  }
]);

app.use('/wc', bot.getWechatCallbackHandler());

app.get('*', function(req, res) {
  res.status(404).end();
});

var port = process.env.PORT || 3000;

http.listen(port, function() {
  console.log('== Server started ==');
});
