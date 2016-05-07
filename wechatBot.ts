import botframework = require('botbuilder');
import WechatApi = require('wechat-api');
import wechat = require('wechat');

export interface IWechatBotOptions {
    userStore?: botframework.IStorage;
    sessionStore?: botframework.IStorage;
    maxSessionAge?: number;
    localizer?: botframework.ILocalizer;
    minSendDelay?: number;
    defaultDialogId?: string;
    defaultDialogArgs?: any;
    wechatAppId: string;
    wechatSecret: string;
    wechatAesKey?: string;
    wechatToken: string;
    voiceMessageParser?: (payload: any, done: any) => void
}

export class WechatBot extends botframework.DialogCollection {
    private wechatApi;
    private wechatCallbackHandler;

    private options: IWechatBotOptions = {
        maxSessionAge: 14400000,    // <-- default max session age of 4 hours
        defaultDialogId: '/',
        minSendDelay: 1000,
        wechatAppId: null,
        wechatSecret: null,
        wechatToken: null
    };

    constructor(options: IWechatBotOptions) {
        super();
        this.configure(options);
        this.setupWechat();
    }

    public configure(options: IWechatBotOptions) {
        if (options) {
            for (var key in options) {
                if (options.hasOwnProperty(key)) {
                    (<any>this.options)[key] = (<any>options)[key];
                }
            }
        }
    }

    private setupWechat() {
      this.wechatApi = new WechatApi(this.options.wechatAppId, this.options.wechatSecret);
      this.wechatCallbackHandler = wechat(this.getWechatConfiguration(), this.handleWechatMessage.bind(this));
    }

    private getWechatConfiguration():any {
      if (this.options.wechatAesKey && this.options.wechatAesKey.length > 0) {
        return {
          token: this.options.wechatToken,
          appid: this.options.wechatAppId,
          encodingAESKey: this.options.wechatAesKey
        };
      }

      return this.options.wechatToken;
    }

    public beginDialog(address: botframework.IBeginDialogAddress, dialogId: string, dialogArgs?: any): void {
        // Validate args
        if (!this.hasDialog(dialogId)) {
            throw new Error('Invalid dialog passed to WechatBot.beginDialog().');
        }
        // Dispatch message
        var message: botframework.IMessage = address || {};
        var userId = message.to ? message.to.address : 'user';
        this.dispatchMessage(userId, message, null, dialogId, dialogArgs, true);
    }

    public getWechatCallbackHandler(): any {
      return this.wechatCallbackHandler;
    }

    private handleWechatMessage(req, res, next): void {
      var wechatMsg = req.weixin;

      var msgType = wechatMsg.MsgType;

      if (msgType === 'text') {
        this.handleTextMessage(wechatMsg);
      } else if (msgType === 'voice') {
        this.handleVoiceMessage(wechatMsg);
      }

      res.status(200).end();
    }

    private handleTextMessage(wechatMsg):void {
      /*
      { ToUserName: 'gh_9ea57aea7260',
        FromUserName: 'o2uw0uMOTq7bWQqB_-E7XsQ89EoQ',
        CreateTime: '1451199221',
        MsgType: 'text',
        Content: 't3sz',
        MsgId: '6232853194577323038' }
      */
      var msg = this.buildMessage(wechatMsg);

      this.dispatchMessage(wechatMsg.FromUserName,
        msg, null, this.options.defaultDialogId,
        this.options.defaultDialogArgs);
    }

    private handleVoiceMessage(wechatMsg):void {
      /*
      { ToUserName: 'gh_9ea57aea7260',
        FromUserName: 'o2uw0uMOTq7bWQqB_-E7XsQ89EoQ',
        CreateTime: '1462593320',
        MsgType: 'voice',
        MediaId: 'mMES0qZ_PrDOB0_Nk85NFg1PHKvbRDBZ8rs5GDTbc2tFpLKRJSJYNAR8-fVYKSCt',
        Format: 'amr',
        MsgId: '6281790477156573800',
        Recognition: '' }
      */
      var voiceMessageParser = this.options.voiceMessageParser;

      if (!voiceMessageParser) {
        return;
      }

      var parserCallback = function(text) {
        var msg = this.buildMessage(wechatMsg, text);
        this.dispatchMessage(wechatMsg.FromUserName,
          msg, null, this.options.defaultDialogId,
          this.options.defaultDialogArgs);
      };

      parserCallback = parserCallback.bind(this);

      this.wechatApi.getMedia(wechatMsg.MediaId, function(err, data) {
        if (err) {
          console.log('error fetching media');
          return;
        }
        voiceMessageParser(data, parserCallback);
      });
    }

    private buildMessage(wechatMsg, content?:string):any {
      var msg = {
        id: wechatMsg.MsgId,
        from: {
          channelId: 'wechat',
          address: wechatMsg.FromUserName
        },
        text: content || wechatMsg.Content
      };

      return msg;
    }

    private sendWechatMessage(openId: string, message: string): void {
      this.wechatApi.sendText(openId, message, function(err) {
        if (err) {
          console.log('Error sending message', err);
        }
      });
    }

    private dispatchMessage(userId: string, message: botframework.IMessage, callback: (err: Error, reply: botframework.IMessage) => void, dialogId: string, dialogArgs: any, newSessionState = false): void {
        var ses = new botframework.Session({
            localizer: this.options.localizer,
            minSendDelay: this.options.minSendDelay,
            dialogs: this,
            dialogId: dialogId,
            dialogArgs: dialogArgs
        });
        ses.on('send', (reply: botframework.IMessage) => {
            this.saveData(userId, ses.userData, ses.sessionState, () => {
                // If we have no message text then we're just saving state.
                if (reply && reply.text) {
                    if (callback) {
                      callback(null, reply);
                      callback = null;
                    } else if (message.id || message.conversationId) {
                      this.sendWechatMessage(userId, reply.text);
                    }
                }
            });
        });
        ses.on('error', (err: Error) => {
            if (callback) {
                callback(err, null);
                callback = null;
            } else {
                this.emit('error', err, message);
            }
        });
        ses.on('quit', () => {
            this.emit('quit', message);
        });

        // Dispatch message
        this.getData(userId, (err, userData, sessionState) => {
            if (!err) {
                ses.userData = userData || {};
                ses.dispatch(newSessionState ? null : sessionState, message);
            } else {
                this.emit('error', err, message);
            }
        });
    }

    private getData(userId: string, callback: (err: Error, userData: any, sessionState: botframework.ISessionState) => void) {
        // Ensure stores specified
        if (!this.options.userStore) {
            this.options.userStore = new botframework.MemoryStorage();
        }
        if (!this.options.sessionStore) {
            this.options.sessionStore = new botframework.MemoryStorage();
        }

        // Load data
        var ops = 2;
        var userData: any, sessionState: botframework.ISessionState;
        this.options.userStore.get(userId, (err, data) => {
            if (!err) {
                userData = data;
                if (--ops == 0) {
                    callback(null, userData, sessionState);
                }
            } else {
                callback(err, null, null);
            }
        });
        this.options.sessionStore.get(userId, (err: Error, data: botframework.ISessionState) => {
            if (!err) {
                if (data && (new Date().getTime() - data.lastAccess) < this.options.maxSessionAge) {
                    sessionState = data;
                }
                if (--ops == 0) {
                    callback(null, userData, sessionState);
                }
            } else {
                callback(err, null, null);
            }
        });
    }

    private saveData(userId: string, userData: any, sessionState: botframework.ISessionState, callback: (err: Error) => void) {
        var ops = 2;
        function onComplete(err: Error) {
            if (!err) {
                if (--ops == 0) {
                    callback(null);
                }
            } else {
                callback(err);
            }
        }
        this.options.userStore.save(userId, userData, onComplete);
        this.options.sessionStore.save(userId, sessionState, onComplete);
    }
}
