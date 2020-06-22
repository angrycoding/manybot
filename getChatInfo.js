var Crypto = require('crypto'),
	Request = require('request'),
	Cache = require('persistent-cache'),
	ImageType = require('image-type'),
	Tokens = require('./tokens'),
	Utils = require('./utils'),
	Settings = require('./settings');

var fileStorage = Cache({
	// cache for 7 days
	duration: 1000 * 60 * 60 * 24 * 7
});

function getCacheKey(key) {
	key = Utils.getString(key, '');
	return Crypto.createHash('md5').update(key).digest('hex');
}

function remoteImageToBase64(imageUrl, ret) {
	imageUrl = Utils.getString(imageUrl, '');
	if (!imageUrl) return ret();
	Request.get({
		uri: imageUrl,
		encoding: null,
		timeout: Settings.DOWNLOAD_TIMEOUT_MS
	}, function(error, response, body) {
		var imageType = Utils.getObject(() => ImageType(body), {});
		if (!['jpg', 'png'].includes(imageType.ext)) return ret();
		var imageData = Utils.getString(() => body.toString('base64'));
		if (!imageData) return ret();
		ret(`data:${imageType.mime};base64,${imageData}`);
	});
}

function getFileTelegram(fileId, ret) {
	if (typeof ret !== 'function') return;
	var token = Tokens.getTelegramBotToken();
	fileId = Utils.getString(fileId, '');
	if (!fileId || !token) return ret();
	var cacheKey = getCacheKey(`getFileTelegram-${fileId}`);
	var cachedFile = Utils.getString(fileStorage.getSync(cacheKey), '');
	if (cachedFile) return ret(cachedFile);
	Request.post({
		uri: `https://api.telegram.org/bot${token}/getFile`,
		timeout: Settings.REQUEST_TIMEOUT_MS,
		json: {'file_id': fileId}
	}, function(error, response, body) {
		var filePath = Utils.getString(() => body.result.file_path);
		if (!filePath) return ret();
		remoteImageToBase64(`https://api.telegram.org/file/bot${token}/${filePath}`, function(base64image) {
			if (base64image) fileStorage.putSync(cacheKey, base64image);
			ret(base64image);
		});
	});
}

function getFileTamtam(fileUrl, ret) {
	if (typeof ret !== 'function') return;
	fileUrl = Utils.getString(fileUrl, '');
	if (!fileUrl) return ret();
	var cacheKey = getCacheKey(`getFileTamtam-${fileUrl}`);
	var cachedFile = Utils.getString(fileStorage.getSync(cacheKey), '');
	if (cachedFile) return ret(cachedFile);
	remoteImageToBase64(fileUrl, function(base64image) {
		if (base64image) fileStorage.putSync(cacheKey, base64image);
		ret(base64image);
	});
}

function getChatInfoTamtam(chatId, ret) {
	if (typeof ret !== 'function') return;
	var token = Tokens.getTamtamBotToken();
	if (!token) return ret();
	chatId = Utils.getString(chatId, '');
	var realChatId = (chatId.startsWith('tt') ? chatId.slice(2) : chatId);
	if (!realChatId) return ret();
	Request.get({
		uri: `https://botapi.tamtam.chat/chats/${realChatId}?access_token=${token}`,
		timeout: Settings.REQUEST_TIMEOUT_MS
	}, function(error, response, body) {
		body = Utils.parseJSONObject(body);
		var chatType = Utils.getString(() => body.type);
		if (!chatType || chatType === 'dialog') return ret();
		var ownerId = Utils.getNumber(() => body.owner_id);
		if (!ownerId) return ret();
		getFileTamtam(Utils.getString(() => body.icon.url, ''), function(chatPhotoBase64) {
			ret(
				`tt${ownerId}`,
				Utils.getString(() => body.title, ''),
				Utils.getString(() => body.description),
				chatPhotoBase64
			);
		});
	});
}

function getChatInfoTelegram(chatId, ret) {
	if (typeof ret !== 'function') return;
	var token = Tokens.getTelegramBotToken();
	if (!token) return ret();
	chatId = Utils.getString(chatId, '');
	var realChatId = (chatId.startsWith('tg') ? chatId.slice(2) : chatId);
	if (!realChatId) return ret();
	Request.post({
		uri: `https://api.telegram.org/bot${token}/getChatAdministrators`,
		timeout: Settings.REQUEST_TIMEOUT_MS,
		json: {'chat_id': realChatId}
	}, function(error, response, body) {
		var users = Utils.getArray(() => body.result, []);
		var ownerId = Utils.getNumber(() => users.find(user => user.status === 'creator').user.id);
		if (!ownerId) return ret();
		Request.post({
			uri: `https://api.telegram.org/bot${token}/getChat`,
			timeout: Settings.REQUEST_TIMEOUT_MS,
			json: {'chat_id': realChatId}
		}, function(error, response, body) {
			if (String(Utils.getNumber(() => body.result.id)) !== realChatId) return ret();
			getFileTelegram(Utils.getString(() => body.result.photo.small_file_id, ''), function(chatPhotoBase64) {
				ret(
					`tg${ownerId}`,
					Utils.getString(() => body.result.title, ''),
					Utils.getString(() => body.result.description, ''),
					Utils.getString(chatPhotoBase64, '')
				);
			});
		});
	});
}

function getChatInfo(chatId, ret) {
	if (typeof ret !== 'function') return;
	if (chatId.startsWith('tt')) {
		getChatInfoTamtam(chatId, ret);
	} else if (chatId.startsWith('tg')) {
		getChatInfoTelegram(chatId, ret);
	} else ret();
}

module.exports = {
	getChatInfo,
	getChatInfoTelegram,
	getChatInfoTamtam
};