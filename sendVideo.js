var FS = require('fs'),
	Async = require('async'),
	Request = require('request'),
	Tokens = require('./tokens'),
	Utils = require('./utils'),
	CleanupText = require('./cleanupText'),
	Settings = require('./settings');

function sendVideoTamtam(chatIds, path, ret, caption, icon) {
	chatIds = Utils.cleanupChatIds(chatIds, 'tt');
	var errorChatIds = Utils.getArray(() => chatIds.invalid, []);
	var validChatIds = Utils.getArray(() => chatIds.tt, []);
	if (typeof ret !== 'function') ret = Utils.DUMMY_FUNC;
	if (!validChatIds.length) return ret(errorChatIds.concat(validChatIds));
	var token = Tokens.getTamtamBotToken();
	if (!token) return ret(errorChatIds.concat(validChatIds));
	if (!path.endsWith('.mp4')) return ret(errorChatIds.concat(validChatIds));
	caption = CleanupText.tamtam(caption, icon);
	Async.eachSeries(validChatIds, function(originalChatId, nextChatId) {
		Utils.createReadStream(path, (stream) => {
			if (!stream) {
				errorChatIds.push(originalChatId);
				return nextChatId();
			}
			Request.post({
				uri: `https://botapi.tamtam.chat/uploads?access_token=${token}&type=video`,
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
							uri: `https://botapi.tamtam.chat/messages?access_token=${token}&chat_id=${realChatId}`,
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
	var token = Tokens.getTelegramBotToken();
	if (!token) return ret(errorChatIds.concat(validChatIds));
	if (!path.endsWith('.mp4')) return ret(errorChatIds.concat(validChatIds));
	caption = CleanupText.telegram(caption, icon);
	Utils.createReadStream(path, (streamOrId) => {
		if (!streamOrId) return ret(errorChatIds.concat(validChatIds));
		Async.eachSeries(validChatIds, function(originalChatId, nextChatId) {
			var realChatId = (originalChatId.startsWith('tg') ? originalChatId.slice(2) : originalChatId);
			Request.post({
				url: `https://api.telegram.org/bot${token}/sendVideo`,
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


module.exports = {
	sendVideo,
	sendVideoTamtam,
	sendVideoTelegram
};