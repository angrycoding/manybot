var FS = require('fs'),
	Async = require('async'),
	Request = require('request'),
	Cheerio = require('cheerio'),
	Utils = require('./utils');

var REQUEST_TIMEOUT_MS = 1000 * 10;
var UPDLOAD_TIMEOUT_MS = 1000 * 60;
var DUMMY_FUNC = (() => 0);

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

var TELEGRAM_BOT_TOKEN;
var TAMTAM_BOT_TOKEN;


function setTelegramBotToken(token) {
	TELEGRAM_BOT_TOKEN = token;
}

function setTamTamBotToken(token) {
	TAMTAM_BOT_TOKEN = token;
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
	if (typeof ret !== 'function') ret = DUMMY_FUNC;
	if (!validChatIds.length) return ret(errorChatIds.concat(validChatIds));
	if (!TELEGRAM_BOT_TOKEN) return ret(errorChatIds.concat(validChatIds));
	text = cleanupTextTelegram(text, icon);
	if (!text) return ret(errorChatIds.concat(validChatIds));
	Async.eachSeries(validChatIds, function(originalChatId, nextChatId) {
		var realChatId = (originalChatId.startsWith('tg') ? originalChatId.slice(2) : originalChatId);
		Request.post({
			uri: `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
			timeout: REQUEST_TIMEOUT_MS,
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
	if (typeof ret !== 'function') ret = DUMMY_FUNC;
	if (!validChatIds.length) return ret(errorChatIds.concat(validChatIds));
	if (!TAMTAM_BOT_TOKEN) return ret(errorChatIds.concat(validChatIds));
	text = cleanupTextTamtam(text, icon);
	if (!text) return ret(errorChatIds.concat(validChatIds));
	Async.eachSeries(validChatIds, function(originalChatId, nextChatId) {
		var realChatId = (originalChatId.startsWith('tt') ? originalChatId.slice(2) : originalChatId);
		Request.post({
			uri: `https://botapi.tamtam.chat/messages?access_token=${TAMTAM_BOT_TOKEN}&user_id=${realChatId}`,
			timeout: REQUEST_TIMEOUT_MS,
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
	if (typeof ret !== 'function') ret = DUMMY_FUNC;
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
				timeout: REQUEST_TIMEOUT_MS
			}, function(error, response, body) {
				var uploadUrl = Utils.getString(() => JSON.parse(body).url);
				if (!uploadUrl) {
					errorChatIds.push(originalChatId);
					return nextChatId();
				}
				Request.post({
					url: uploadUrl,
					timeout: UPDLOAD_TIMEOUT_MS,
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
							timeout: REQUEST_TIMEOUT_MS,
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
	if (typeof ret !== 'function') ret = DUMMY_FUNC;
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
					UPDLOAD_TIMEOUT_MS :
					REQUEST_TIMEOUT_MS
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

function sendText(chatIds, text, ret, icon) {
	ret = (typeof ret === 'function' ? ret : DUMMY_FUNC);
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
	ret = (typeof ret === 'function' ? ret : DUMMY_FUNC);
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

module.exports = {
	...MESSAGE_KINDS,
	setTelegramBotToken,
	setTamTamBotToken,
	sendTextTamtam,
	sendTextTelegram,
	sendVideoTamtam,
	sendVideoTelegram,
	sendText,
	sendVideo,
};