var FS = require('fs'),
	Async = require('async'),
	Request = require('request'),
	Utils = require('./utils');

var Settings = require('./settings');

var TELEGRAM_BOT_TOKEN;
var TAMTAM_BOT_TOKEN;

var tokens = require('./tokens');

tokens.onChange(function(tg, tt) {
	TELEGRAM_BOT_TOKEN = tg;
	TAMTAM_BOT_TOKEN = tt;
});

var MESSAGE_KINDS = {
	KIND_INFO: '💬',
	KIND_BALLOON1: '🗯',
	KIND_BALLOON2: '💭',
	KIND_WARNING: '❗',
	KIND_QUESTION: '❓',
	KIND_FLAG: '🚩',
	KIND_MONEY: '💵',
	KIND_FIRE: '🔥',
	KIND_BELL: '🔔',
	KIND_PLUG: '🔌',
	KIND_COLLISION: '💥',
	KIND_STAR: '⭐',
	KIND_STOP: '⛔',
	KIND_LIGHTING: '⚡',
	KIND_WARNING2: '🚨',
	KIND_ROCKET: '🚀',
	KIND_PARTY: '🥳',
	KIND_CAMERA: '🎥',
};

var ON_TEXT_CALLBACK;
var ON_CHAT_UPDATE_CALLBACK;

function findKeyValue(o, id) {

	if (typeof o !== 'object') return;
	if (o.hasOwnProperty(id)) return o[id];


	var result, p;
	for (p in o) {
		if( o.hasOwnProperty(p) && typeof o[p] === 'object' ) {
            result = findKeyValue(o[p], id);
            if(result){
                return result;
            }
        }
    }
    return result;
}


function setOnTextCallback(callback) {
	if (typeof callback === 'function') {
		ON_TEXT_CALLBACK = callback;
	}
}

function setOnChatUpdateCallback(callback) {
	if (typeof callback === 'function') {
		ON_CHAT_UPDATE_CALLBACK = callback;
	}
}









function getWebhookTelegram(ret) {
	if (!TELEGRAM_BOT_TOKEN) return ret([]);
	if (typeof ret !== 'function') ret = Utils.DUMMY_FUNC;
	Request.post({
		uri: `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`,
		timeout: Settings.REQUEST_TIMEOUT_MS,
	}, function(error, response, body) {
		var webhookUrl = Utils.getString(() => JSON.parse(body).result.url, '');
		ret(webhookUrl ? [webhookUrl] : []);
	});
}

function getWebhookTamtam(ret) {
	if (!TAMTAM_BOT_TOKEN) return ret([]);
	if (typeof ret !== 'function') ret = Utils.DUMMY_FUNC;
	Request.get({
		uri: `https://botapi.tamtam.chat/subscriptions?access_token=${TAMTAM_BOT_TOKEN}`,
		timeout: Settings.REQUEST_TIMEOUT_MS,
	}, function(error, response, body) {
		var subscriptions = Utils.getArray(() => JSON.parse(body).subscriptions, []);
		var urls = subscriptions.map(subscription => Utils.getString(() => subscription.url));
		ret(urls.filter(url => url));
	});
}

function deleteWebhookTelegram(ret) {
	if (!TELEGRAM_BOT_TOKEN) return ret([]);
	if (typeof ret !== 'function') ret = Utils.DUMMY_FUNC;
	Request.post({
		uri: `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`,
		timeout: Settings.REQUEST_TIMEOUT_MS,
	}, () => getWebhookTelegram(ret));
}

function deleteWebhookTamtam(ret) {
	if (!TAMTAM_BOT_TOKEN) return ret([]);
	if (typeof ret !== 'function') ret = Utils.DUMMY_FUNC;
	getWebhookTamtam(function(webhookUrls) {
		Async.eachSeries(webhookUrls, function(webhookUrl, nextWebhookUrl) {
			Request.delete({
				uri: `https://botapi.tamtam.chat/subscriptions?access_token=${TAMTAM_BOT_TOKEN}&url=${webhookUrl}`,
				timeout: Settings.REQUEST_TIMEOUT_MS,
			}, () => nextWebhookUrl());
		}, () => getWebhookTamtam(ret));
	});
}

function setWebhookTelegram(url, ret) {
	if (!TELEGRAM_BOT_TOKEN) return ret([]);
	if (typeof ret !== 'function') ret = Utils.DUMMY_FUNC;
	Request.post({
		uri: `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`,
		timeout: Settings.REQUEST_TIMEOUT_MS,
		json: {
			'url': url,
		}
	}, () => getWebhookTelegram(ret));
}

function setWebhookTamtam(url, ret) {
	if (!TAMTAM_BOT_TOKEN) return ret([]);
	if (typeof ret !== 'function') ret = Utils.DUMMY_FUNC;
	deleteWebhookTamtam(function() {
		Request.post({
			uri: `https://botapi.tamtam.chat/subscriptions?access_token=${TAMTAM_BOT_TOKEN}`,
			timeout: Settings.REQUEST_TIMEOUT_MS,
			json: {
				'version': '0.3.0',
				'url': url
			}
		}, () => getWebhookTamtam(ret));
	});
}






function onTGUpdateReceived(update) {
	var messageObj = (
		Utils.getObject(() => update.message) ||
		Utils.getObject(() => update.edited_message) ||
		Utils.getObject(() => update.channel_post) ||
		Utils.getObject(() => update.edited_channel_post) ||
		Utils.getObject(() => update.callback_query.message)
	),
	chatObj = Utils.getObject(() => messageObj.chat),
	chatType = Utils.getString(() => chatObj.type);
	if (chatType === 'private') {
		var message_id = Utils.getNumber(() => messageObj.message_id),
			text = Utils.getString(() => messageObj.text, ''),
			user_id = Utils.getNumber(() => messageObj.from.id),
			first_name = Utils.getString(() => messageObj.from.first_name);
		if (text.startsWith('/start ')) text = text.split(' ').pop();
		if (message_id && user_id && first_name && text && ON_TEXT_CALLBACK) {
			ON_TEXT_CALLBACK(text, `tg${user_id}`, first_name, message_id);
		}
	} else if (ON_CHAT_UPDATE_CALLBACK) {
		var chatId = Utils.getNumber(() => chatObj.id);
		if (chatId) ON_CHAT_UPDATE_CALLBACK(`tg${chatId}`, update);
	}
}

function onTTUpdateReceived(update) {
	var updateType = Utils.getString(() => update.update_type);
	if (updateType === 'bot_started') {
		var name = Utils.getString(() => update.user.name),
			user_id = Utils.getNumber(() => update.user.user_id),
			text = Utils.getString(() => update.payload, '');
		if (name && user_id && text && ON_TEXT_CALLBACK) {
			ON_TEXT_CALLBACK(text, `tt${user_id}`, name);
		}
	} else {
		var chat_type = Utils.getString(() => update.message.recipient.chat_type);
		if (chat_type === 'dialog') {
			if (updateType === 'message_created') {
				var name = Utils.getString(() => update.message.sender.name),
					user_id = Utils.getNumber(() => update.message.sender.user_id),
					text = Utils.getString(() => update.message.body.text, ''),
					message_id = Utils.getString(() => update.message.body.mid);
				if (name && user_id && text && message_id && ON_TEXT_CALLBACK) {
					ON_TEXT_CALLBACK(text, `tt${user_id}`, name, message_id);
				}
			}
		}
		else if (ON_CHAT_UPDATE_CALLBACK) {
			var chatId = Utils.getNumber(() => findKeyValue(update, 'chat_id'));
			if (chatId) ON_CHAT_UPDATE_CALLBACK(`tt${chatId}`, update);
		}
	}
}

function processUpdate(update) {
	if (typeof update === 'string')
		update = Utils.parseJSONObject(update);
	if (Utils.getNumber(() => update.update_id)) {
		onTGUpdateReceived(update);
	} else if (Utils.getNumber(() => update.timestamp)) {
		onTTUpdateReceived(update);
	}
}




module.exports = {

	...MESSAGE_KINDS,

	getWebhookTelegram,
	getWebhookTamtam,
	deleteWebhookTelegram,
	deleteWebhookTamtam,
	setWebhookTelegram,
	setWebhookTamtam,


	processUpdate,
	setOnTextCallback,
	setOnChatUpdateCallback,

	...tokens,
	...require('./sendFile'),
	...require('./sendText'),
	...require('./sendVideo'),
	...require('./getChatInfo')

	// deleteWebhook
};