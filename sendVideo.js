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
	Async.eachLimit(validChatIds, Settings.MAX_PARALLEL_OP_COUNT, function(originalChatId, nextChatId) {
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
					var attempts = Settings.TT_UPLOAD_MAX_ATTEMPTS, isSuccess = false;
					var realChatId = (originalChatId.startsWith('tt') ? originalChatId.slice(2) : originalChatId);
					const captionStr = CleanupText.tamtam(caption, icon, originalChatId);
					Async.forever(function(nextAttempt) {
						if (!--attempts) return nextAttempt(true);
						Request.post({
							uri: (
								realChatId.startsWith('-') ?
								`https://botapi.tamtam.chat/messages?access_token=${token}&chat_id=${realChatId}` :
								`https://botapi.tamtam.chat/messages?access_token=${token}&user_id=${realChatId}`
							),
							timeout: Settings.REQUEST_TIMEOUT_MS,
							json: {
								'version': Settings.TAMTAM_API_VERSION,
								'text': captionStr,
								'attachments': [{
									'type': 'video',
									'payload': {
										'token': fileToken
									}
								}]
							}
						}, function(error, response, body) {
							if (Utils.getString(() => body.code) === 'attachment.not.ready') {
								setTimeout(nextAttempt, Settings.TT_UPLOAD_INTERVAL_MS);
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
	Utils.createReadStream(path, (stream) => {
		if (!stream) return ret(errorChatIds.concat(validChatIds));
		var originalChatId = validChatIds.shift();
		Utils.sendFileTelegram(token, 'sendVideo', originalChatId, stream, CleanupText.telegram(caption, icon, originalChatId), (fileId) => {
			if (!fileId) {
				errorChatIds.push(originalChatId);
				ret(errorChatIds.concat(validChatIds));
			} else {
				Async.eachLimit(validChatIds, Settings.MAX_PARALLEL_OP_COUNT, (originalChatId, nextChatId) => {
					Utils.sendFileTelegram(token, 'sendVideo', originalChatId, fileId, CleanupText.telegram(caption, icon, originalChatId), (fileId) => {
						if (!fileId) errorChatIds.push(originalChatId);
						nextChatId();
					});
				}, () => ret(errorChatIds));
			}
		});
	});
}

function sendVideo(chatIds, path, ret, caption, icon) {
	ret = (typeof ret === 'function' ? ret : Utils.DUMMY_FUNC);
	chatIds = Utils.cleanupChatIds(chatIds);
	var errorChatIds = [];
	Async.eachOf(chatIds, function(chatIds, type, nextType) {
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