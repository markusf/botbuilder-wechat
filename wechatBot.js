"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var botframework = require('botbuilder');
var WechatApi = require('wechat-api');
var wechat = require('wechat');
var WechatBot = (function (_super) {
    __extends(WechatBot, _super);
    function WechatBot(options) {
        _super.call(this);
        this.options = {
            maxSessionAge: 14400000,
            defaultDialogId: '/',
            minSendDelay: 1000,
            wechatAppId: null,
            wechatSecret: null,
            wechatToken: null
        };
        this.configure(options);
        this.setupWechat();
    }
    WechatBot.prototype.configure = function (options) {
        if (options) {
            for (var key in options) {
                if (options.hasOwnProperty(key)) {
                    this.options[key] = options[key];
                }
            }
        }
    };
    WechatBot.prototype.setupWechat = function () {
        this.wechatApi = new WechatApi(this.options.wechatAppId, this.options.wechatSecret);
        this.wechatCallbackHandler = wechat(this.getWechatConfiguration(), this.handleWechatMessage.bind(this));
    };
    WechatBot.prototype.getWechatConfiguration = function () {
        if (this.options.wechatAesKey && this.options.wechatAesKey.length > 0) {
            return {
                token: this.options.wechatToken,
                appid: this.options.wechatAppId,
                encodingAESKey: this.options.wechatAesKey
            };
        }
        return this.options.wechatToken;
    };
    WechatBot.prototype.beginDialog = function (address, dialogId, dialogArgs) {
        if (!this.hasDialog(dialogId)) {
            throw new Error('Invalid dialog passed to WechatBot.beginDialog().');
        }
        var message = address || {};
        var userId = message.to ? message.to.address : 'user';
        this.dispatchMessage(userId, message, null, dialogId, dialogArgs, true);
    };
    WechatBot.prototype.getWechatCallbackHandler = function () {
        return this.wechatCallbackHandler;
    };
    WechatBot.prototype.handleWechatMessage = function (req, res, next) {
        var wechatMsg = req.weixin;
        var msgType = wechatMsg.MsgType;
        if (msgType === 'text') {
            this.handleTextMessage(wechatMsg);
        }
        else if (msgType === 'voice') {
            this.handleVoiceMessage(wechatMsg);
        }
        res.status(200).end();
    };
    WechatBot.prototype.handleTextMessage = function (wechatMsg) {
        var msg = this.buildMessage(wechatMsg);
        this.dispatchMessage(wechatMsg.FromUserName, msg, null, this.options.defaultDialogId, this.options.defaultDialogArgs);
    };
    WechatBot.prototype.handleVoiceMessage = function (wechatMsg) {
        var voiceMessageParser = this.options.voiceMessageParser;
        if (!voiceMessageParser) {
            return;
        }
        var parserCallback = function (text) {
            var msg = this.buildMessage(wechatMsg, text);
            this.dispatchMessage(wechatMsg.FromUserName, msg, null, this.options.defaultDialogId, this.options.defaultDialogArgs);
        };
        parserCallback = parserCallback.bind(this);
        this.wechatApi.getMedia(wechatMsg.MediaId, function (err, data) {
            if (err) {
                console.log('error fetching media');
                return;
            }
            voiceMessageParser(data, parserCallback);
        });
    };
    WechatBot.prototype.buildMessage = function (wechatMsg, content) {
        var msg = {
            id: wechatMsg.MsgId,
            from: {
                channelId: 'wechat',
                address: wechatMsg.FromUserName
            },
            text: content || wechatMsg.Content
        };
        return msg;
    };
    WechatBot.prototype.sendWechatMessage = function (openId, message) {
        this.wechatApi.sendText(openId, message, function (err) {
            if (err) {
                console.log('Error sending message', err);
            }
        });
    };
    WechatBot.prototype.dispatchMessage = function (userId, message, callback, dialogId, dialogArgs, newSessionState) {
        var _this = this;
        if (newSessionState === void 0) { newSessionState = false; }
        var ses = new botframework.Session({
            localizer: this.options.localizer,
            minSendDelay: this.options.minSendDelay,
            dialogs: this,
            dialogId: dialogId,
            dialogArgs: dialogArgs
        });
        ses.on('send', function (reply) {
            _this.saveData(userId, ses.userData, ses.sessionState, function () {
                if (reply && reply.text) {
                    if (callback) {
                        callback(null, reply);
                        callback = null;
                    }
                    else if (message.id || message.conversationId) {
                        _this.sendWechatMessage(userId, reply.text);
                    }
                }
            });
        });
        ses.on('error', function (err) {
            if (callback) {
                callback(err, null);
                callback = null;
            }
            else {
                _this.emit('error', err, message);
            }
        });
        ses.on('quit', function () {
            _this.emit('quit', message);
        });
        this.getData(userId, function (err, userData, sessionState) {
            if (!err) {
                ses.userData = userData || {};
                ses.dispatch(newSessionState ? null : sessionState, message);
            }
            else {
                _this.emit('error', err, message);
            }
        });
    };
    WechatBot.prototype.getData = function (userId, callback) {
        var _this = this;
        if (!this.options.userStore) {
            this.options.userStore = new botframework.MemoryStorage();
        }
        if (!this.options.sessionStore) {
            this.options.sessionStore = new botframework.MemoryStorage();
        }
        var ops = 2;
        var userData, sessionState;
        this.options.userStore.get(userId, function (err, data) {
            if (!err) {
                userData = data;
                if (--ops == 0) {
                    callback(null, userData, sessionState);
                }
            }
            else {
                callback(err, null, null);
            }
        });
        this.options.sessionStore.get(userId, function (err, data) {
            if (!err) {
                if (data && (new Date().getTime() - data.lastAccess) < _this.options.maxSessionAge) {
                    sessionState = data;
                }
                if (--ops == 0) {
                    callback(null, userData, sessionState);
                }
            }
            else {
                callback(err, null, null);
            }
        });
    };
    WechatBot.prototype.saveData = function (userId, userData, sessionState, callback) {
        var ops = 2;
        function onComplete(err) {
            if (!err) {
                if (--ops == 0) {
                    callback(null);
                }
            }
            else {
                callback(err);
            }
        }
        this.options.userStore.save(userId, userData, onComplete);
        this.options.sessionStore.save(userId, sessionState, onComplete);
    };
    return WechatBot;
}(botframework.DialogCollection));
exports.WechatBot = WechatBot;
