var Async = require('async'),
	Request = require('request'),
	Tokens = require('./tokens'),
	Utils = require('./utils'),
	CleanupText = require('./cleanupText'),
	Settings = require('./settings');

function sendTextTelegram(chatIds, text, ret, icon) {
	chatIds = Utils.cleanupChatIds(chatIds, 'tg');
	var errorChatIds = Utils.getArray(() => chatIds.invalid, []);
	var validChatIds = Utils.getArray(() => chatIds.tg, []);
	if (typeof ret !== 'function') ret = Utils.DUMMY_FUNC;
	if (!validChatIds.length) return ret(errorChatIds.concat(validChatIds));
	var token = Tokens.getTelegramBotToken();
	if (!token) return ret(errorChatIds.concat(validChatIds));
	text = CleanupText.telegram(text, icon);
	if (!text) return ret(errorChatIds.concat(validChatIds));
	Async.eachLimit(validChatIds, Settings.MAX_PARALLEL_OP_COUNT, function(originalChatId, nextChatId) {
		var realChatId = (originalChatId.startsWith('tg') ? originalChatId.slice(2) : originalChatId);
		Request.post({
			uri: `https://api.telegram.org/bot${token}/sendMessage`,
			timeout: Settings.REQUEST_TIMEOUT_MS,
			json: {
				'chat_id': realChatId,
				'text': text,
				'parse_mode': 'HTML'
			}
		}, function(error, response, body) {
			if (!Utils.getString(() => body.result.text) ||
				!Utils.getNumber(() => body.result.message_id)) {
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
	var token = Tokens.getTamtamBotToken();
	if (!token) return ret(errorChatIds.concat(validChatIds));
	text = CleanupText.tamtam(text, icon);
	if (!text) return ret(errorChatIds.concat(validChatIds));
	Async.eachLimit(validChatIds, Settings.MAX_PARALLEL_OP_COUNT, function(originalChatId, nextChatId) {
		var realChatId = (originalChatId.startsWith('tt') ? originalChatId.slice(2) : originalChatId);
		Request.post({
			uri: (
				realChatId.startsWith('-') ?
				`https://botapi.tamtam.chat/messages?access_token=${token}&chat_id=${realChatId}&disable_link_preview=true` :
				`https://botapi.tamtam.chat/messages?access_token=${token}&user_id=${realChatId}&disable_link_preview=true`
			),
			timeout: Settings.REQUEST_TIMEOUT_MS,
			json: {
				'version': Settings.TAMTAM_API_VERSION,
				'text': text,
				// 'attachments': [{
				// 	type: 'inline_keyboard',
				// 	payload: {
				// 		buttons: [
				// 			[{
				// 				type: 'link',
				// 				text: 'some-text',
				// 				url: 'https://habr.com'
				// 			}]
				// 		]
				// 	}
				// }]
			}
		}, function(error, response, body) {
			if (!Utils.getString(() => body.message.body.text) ||
				!Utils.getString(() => body.message.body.mid)) {
				errorChatIds.push(originalChatId);
			}
			nextChatId();
		});
	}, () => ret(errorChatIds));
}

function sendText(chatIds, text, ret, icon) {
	ret = (typeof ret === 'function' ? ret : Utils.DUMMY_FUNC);
	chatIds = Utils.cleanupChatIds(chatIds);
	var errorChatIds = [];
	Async.eachOf(chatIds, function(chatIds, type, nextType) {
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


module.exports = {
	sendTextTelegram,
	sendTextTamtam,
	sendText
};