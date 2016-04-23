# Microsoft Bot Builder Wechat Integration

Connect your Bot to your Wechat Account!

## Requirements

This bot requires a Wechat Service Account with Server Callback Messages enabled.

## Get started

Step 1: Initialize Wechat Bot

```javascript
var wechatBotBuilder = require('./wechatBot');

var bot = new wechatBotBuilder.WechatBot({
  wechatAppId: 'wxa28b834343434',
  wechatSecret: '96e1fd0e72ff4343434',
  wechatToken: 'asdasd33'
});
```

Step 2: Integrate into your express like middleware

```javascript
app.use('/wc', bot.getWechatCallbackHandler());
```

A fully working sample can be found in `sample.js`
