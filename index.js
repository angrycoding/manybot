var FS = require('fs'),
	Async = require('async'),
	Request = require('request'),
	Cheerio = require('cheerio'),
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

function cleanupTextTelegram(text, icon) {
	text = String(text).trim();
	text = text.replace(/[\n\t]+/g, ' ')
	text = text.replace(/[\n\t\s]*(<br\s*\/>|<br>)[\n\t\s]*/g, '\n');
	icon = Utils.getString(icon, '');
	if (icon) text = (icon + ' ' + text);
	return text;
}

function cleanupTextTamtam(text, icon) {
	text = String(text).trim();
	text = text.replace(/[\n\t]+/g, ' ');
	text = text.replace(/[\n\t\s]*(<br\s*\/>|<br>)[\n\t\s]*/g, '\n');
	var $ = Cheerio.load(text, {
		decodeEntities: false
	});
	$('*').each(function() {
		var element = $(this);
		var tagName = this.tagName;
		if (tagName === 'a') {
			element.replaceWith(element.attr('href'));
		} else if (!['html', 'body', 'br'].includes(tagName)) {
			element.replaceWith(element.text());
		}
	});
	text = $('body').html();
	icon = Utils.getString(icon, '');
	if (icon) text = (icon + ' ' + text);
	return text;
}




function sendTextTelegram(chatIds, text, ret, icon) {
	chatIds = Utils.cleanupChatIds(chatIds, 'tg');
	var errorChatIds = Utils.getArray(() => chatIds.invalid, []);
	var validChatIds = Utils.getArray(() => chatIds.tg, []);
	if (typeof ret !== 'function') ret = Utils.DUMMY_FUNC;
	if (!validChatIds.length) return ret(errorChatIds.concat(validChatIds));
	if (!TELEGRAM_BOT_TOKEN) return ret(errorChatIds.concat(validChatIds));
	text = cleanupTextTelegram(text, icon);
	if (!text) return ret(errorChatIds.concat(validChatIds));
	Async.eachSeries(validChatIds, function(originalChatId, nextChatId) {
		var realChatId = (originalChatId.startsWith('tg') ? originalChatId.slice(2) : originalChatId);
		Request.post({
			uri: `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
			timeout: Settings.REQUEST_TIMEOUT_MS,
			json: {
				'chat_id': realChatId,
				'text': text,
				'parse_mode': 'HTML'
			}
		}, function(error, response, body) {
			if (Utils.getString(() => body.result.text) !== text) {
				errorChatIds.push(originalChatId);
			}
			nextChatId();
		});
	}, () => ret(errorChatIds));
}

function sendTextTamtam(chatIds, text, ret, icon) {
	chatIds = Utils.cleanupChatIds(chatIds, 'tt');
	var errorChatIds = Utils.getArray(() => chatIds.invalid, []);
	var validChatIds = Utils.getArray(() => chatIds.tt, []);
	if (typeof ret !== 'function') ret = Utils.DUMMY_FUNC;
	if (!validChatIds.length) return ret(errorChatIds.concat(validChatIds));
	if (!TAMTAM_BOT_TOKEN) return ret(errorChatIds.concat(validChatIds));
	text = cleanupTextTamtam(text, icon);
	if (!text) return ret(errorChatIds.concat(validChatIds));
	Async.eachSeries(validChatIds, function(originalChatId, nextChatId) {
		var realChatId = (originalChatId.startsWith('tt') ? originalChatId.slice(2) : originalChatId);
		Request.post({
			uri: `https://botapi.tamtam.chat/messages?access_token=${TAMTAM_BOT_TOKEN}&user_id=${realChatId}`,
			timeout: Settings.REQUEST_TIMEOUT_MS,
			json: {
				'version': '0.3.0',
				'text': text,
			}
		}, function(error, response, body) {
			if (Utils.getString(() => body.message.body.text) !== text) {
				errorChatIds.push(originalChatId);
			}
			nextChatId();
		});
	}, () => ret(errorChatIds));
}

function sendVideoTamtam(chatIds, path, ret, caption, icon) {
	chatIds = Utils.cleanupChatIds(chatIds, 'tt');
	var errorChatIds = Utils.getArray(() => chatIds.invalid, []);
	var validChatIds = Utils.getArray(() => chatIds.tt, []);
	if (typeof ret !== 'function') ret = Utils.DUMMY_FUNC;
	if (!validChatIds.length) return ret(errorChatIds.concat(validChatIds));
	if (!TAMTAM_BOT_TOKEN) return ret(errorChatIds.concat(validChatIds));
	if (!path.endsWith('.mp4')) return ret(errorChatIds.concat(validChatIds));
	caption = cleanupTextTamtam(caption, icon);
	Async.eachSeries(validChatIds, function(originalChatId, nextChatId) {
		Utils.createReadStream(path, (stream) => {
			if (!stream) {
				errorChatIds.push(originalChatId);
				return nextChatId();
			}
			Request.post({
				uri: `https://botapi.tamtam.chat/uploads?access_token=${TAMTAM_BOT_TOKEN}&type=video`,
				timeout: Settings.REQUEST_TIMEOUT_MS
			}, function(error, response, body) {
				var uploadUrl = Utils.getString(() => JSON.parse(body).url);
				if (!uploadUrl) {
					errorChatIds.push(originalChatId);
					return nextChatId();
				}
				Request.post({
					url: uploadUrl,
					timeout: Settings.UPDLOAD_TIMEOUT_MS,
					formData: { data: stream }
				}, function(error, response, body) {
					var fileToken = Utils.getString(() => JSON.parse(body).token);
					if (!fileToken) {
						errorChatIds.push(originalChatId);
						return nextChatId();
					}
					var attempts = 5, isSuccess = false;
					var realChatId = (originalChatId.startsWith('tt') ? originalChatId.slice(2) : originalChatId);
					Async.forever(function(nextAttempt) {
						if (!--attempts) return nextAttempt(true);
						Request.post({
							uri: `https://botapi.tamtam.chat/messages?access_token=${TAMTAM_BOT_TOKEN}&chat_id=${realChatId}`,
							timeout: Settings.REQUEST_TIMEOUT_MS,
							json: {
								'version': '0.3.0',
								'text': caption,
								'attachments': [{
									'type': 'video',
									'payload': {
										'token': fileToken
									}
								}]
							}
						}, function(error, response, body) {
							if (Utils.getString(() => body.code) === 'attachment.not.ready') {
								setTimeout(nextAttempt, 1000);
							} else {
								isSuccess = !!Utils.getString(() => body.message.body.mid);
								nextAttempt(true);
							}
						});
					}, function() {
						if (!isSuccess) errorChatIds.push(originalChatId);
						nextChatId();
					});
				});
			});
		});
	}, () => ret(errorChatIds));
}

function sendVideoTelegram(chatIds, path, ret, caption, icon) {
	chatIds = Utils.cleanupChatIds(chatIds, 'tg');
	var errorChatIds = Utils.getArray(() => chatIds.invalid, []);
	var validChatIds = Utils.getArray(() => chatIds.tg, []);
	if (typeof ret !== 'function') ret = Utils.DUMMY_FUNC;
	if (!validChatIds.length) return ret(errorChatIds.concat(validChatIds));
	if (!TELEGRAM_BOT_TOKEN) return ret(errorChatIds.concat(validChatIds));
	if (!path.endsWith('.mp4')) return ret(errorChatIds.concat(validChatIds));
	caption = cleanupTextTelegram(caption, icon);
	Utils.createReadStream(path, (streamOrId) => {
		if (!streamOrId) return ret(errorChatIds.concat(validChatIds));
		Async.eachSeries(validChatIds, function(originalChatId, nextChatId) {
			var realChatId = (originalChatId.startsWith('tg') ? originalChatId.slice(2) : originalChatId);
			Request.post({
				url: `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`,
				timeout: (
					streamOrId instanceof FS.ReadStream ?
					Settings.UPDLOAD_TIMEOUT_MS :
					Settings.REQUEST_TIMEOUT_MS
				),
				formData: {
					chat_id: realChatId,
					parse_mode: 'HTML',
					caption: caption,
					video: streamOrId
				}
			}, (error, response, body) => {
				var fileId = Utils.getString(() => JSON.parse(body).result.video.file_id);
				if (!fileId) {
					errorChatIds.push(originalChatId);
				} else if (streamOrId instanceof FS.ReadStream) {
					streamOrId = fileId;
				}
				nextChatId();
			});
		}, () => ret(errorChatIds));
	});
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





function sendText(chatIds, text, ret, icon) {
	ret = (typeof ret === 'function' ? ret : Utils.DUMMY_FUNC);
	chatIds = Utils.cleanupChatIds(chatIds);
	var errorChatIds = [];
	Async.eachOfSeries(chatIds, function(chatIds, type, nextType) {
		if (type === 'tg') {
			sendTextTelegram(chatIds, text, function(chatIds) {
				Array.prototype.push.apply(errorChatIds, chatIds);
				nextType();
			}, icon);
		} else if (type === 'tt') {
			sendTextTamtam(chatIds, text, function(chatIds) {
				Array.prototype.push.apply(errorChatIds, chatIds);
				nextType();
			}, icon);
		} else {
			Array.prototype.push.apply(errorChatIds, chatIds);
			nextType();
		}
	}, () => ret(errorChatIds));
}

function sendVideo(chatIds, path, ret, caption, icon) {
	ret = (typeof ret === 'function' ? ret : Utils.DUMMY_FUNC);
	chatIds = Utils.cleanupChatIds(chatIds);
	var errorChatIds = [];
	Async.eachOfSeries(chatIds, function(chatIds, type, nextType) {
		if (type === 'tg') {
			sendVideoTelegram(chatIds, path, function(chatIds) {
				Array.prototype.push.apply(errorChatIds, chatIds);
				nextType();
			}, caption, icon);
		} else if (type === 'tt') {
			sendVideoTamtam(chatIds, path, function(chatIds) {
				Array.prototype.push.apply(errorChatIds, chatIds);
				nextType();
			}, caption, icon);
		} else {
			Array.prototype.push.apply(errorChatIds, chatIds);
			nextType();
		}
	}, () => ret(errorChatIds));
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
		if (chatId) ON_CHAT_UPDATE_CALLBACK(`tg${chatId}`);
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
			if (chatId) ON_CHAT_UPDATE_CALLBACK(`tt${chatId}`);
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



var getChatInfo = require('./getChatInfo');




module.exports = {

	...MESSAGE_KINDS,

	sendTextTamtam,
	sendTextTelegram,
	sendVideoTamtam,
	sendVideoTelegram,

	getWebhookTelegram,
	getWebhookTamtam,
	deleteWebhookTelegram,
	deleteWebhookTamtam,
	setWebhookTelegram,
	setWebhookTamtam,


	sendText,
	sendVideo,
	processUpdate,
	setOnTextCallback,
	setOnChatUpdateCallback,

	...tokens,
	...getChatInfo

	// deleteWebhook
};