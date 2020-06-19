var FS = require('fs'),
	Async = require('async'),
	Request = require('request'),
	Cheerio = require('cheerio');

var REQUEST_TIMEOUT_MS = 1000 * 10;
var UPDLOAD_TIMEOUT_MS = 1000 * 60;

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
	KIND_HOURGLASS: '⏳',
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

function getString(expression, fallback) {
	var result;
	try { result = typeof expression === 'function' ? expression() : expression; } catch (exception) {}
	if (typeof result === 'string') return result;
	if (arguments.length > 1) return fallback;
}

function fileExists(path) {
	return (
		FS.existsSync(path) &&
		FS.lstatSync(path).isFile()
	);
}

function cleanupTextTelegram(text) {
	text = String(text).trim();
	text = text.replace(/[\n\t]+/g, ' ')
	text = text.replace(/[\n\t\s]*(<br\s*\/>|<br>)[\n\t\s]*/g, '\n');
	return text;
}

function cleanupTextTamtam(text) {
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
	return $('body').html();
}

function sendTextTamTam(id, text, ret) {
	if (!TAMTAM_BOT_TOKEN) return ret(true);
	Request.post({
		uri: `https://botapi.tamtam.chat/messages?access_token=${TAMTAM_BOT_TOKEN}&user_id=${id}`,
		timeout: REQUEST_TIMEOUT_MS,
		json: {
			'version': '0.3.0',
			'text': text,
		}
	}, function(error, response, body) {
		ret(getString(() => body.message.body.text) !== text);
	});
}

function sendTextTelegram(id, text, ret) {
	if (!TELEGRAM_BOT_TOKEN) return ret(true);
	Request.post({
		uri: `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
		timeout: REQUEST_TIMEOUT_MS,
		json: {
			'chat_id': id,
			'text': text,
			'parse_mode': 'HTML'
		}
	}, function(error, response, body) {
		ret(getString(() => body.result.text) !== text);
	});
}

function sendText(ids, text, ret, icon) {

	var errorIds = [];

	if (!(ids instanceof Array)) ids = [ids];
	if (typeof text !== 'string') return ret(ids);
	if (typeof ret !== 'function') ret = (function(){});
	if (typeof icon !== 'string') icon = MESSAGE_KINDS.KIND_INFO;

	text = ((icon ? icon + ' ' : '') + text);
	var telegramText = cleanupTextTelegram(text);
	var tamtamText = cleanupTextTamtam(text);

	Async.eachSeries(ids, function(id, nextId) {
		id = String(id);
		var chatOrUserId = id.slice(2);
		if (id.startsWith('tt')) {
			sendTextTamTam(chatOrUserId, tamtamText, function(error) {
				if (error) errorIds.push(id);
				nextId();
			});
		} else if (id.startsWith('tg')) {
			sendTextTelegram(chatOrUserId, telegramText, function(error) {
				if (error) errorIds.push(id);
				nextId();
			});
		} else {
			errorIds.push(id);
			nextId();
		}
	}, function() {
		ret(errorIds.length ? errorIds : null);
	});
}

function sendVideoTelegram(id, streamOrId, ret, text) {
	if (!TELEGRAM_BOT_TOKEN) return ret();
	Request.post({
		uri: `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`,
		timeout: (
			typeof streamOrId === 'string' ?
			REQUEST_TIMEOUT_MS :
			UPDLOAD_TIMEOUT_MS
		),
		formData: {
			chat_id: id,
			parse_mode: 'HTML',
			caption: text,
			video: streamOrId
		}
	}, function optionalCallback(error, response, body) {
		ret(getString(() => JSON.parse(body).result.video.file_id));
	});
}

function sendVideoTamtam(id, streamOrId, ret, text) {
	if (!TAMTAM_BOT_TOKEN) return ret();
	console.info(typeof streamOrId)
	if (typeof streamOrId === 'string') {
		var attempts = 5, isSuccess = false;
		Async.forever(function(next) {
			if (!--attempts) return next(true);
			Request.post({
				uri: `https://botapi.tamtam.chat/messages?access_token=${TAMTAM_BOT_TOKEN}&chat_id=${id}`,
				timeout: REQUEST_TIMEOUT_MS,
				json: {
					'version': '0.3.0',
					'text': text,
					'attachments': [{
						'type': 'video',
						'payload': {
							'token': streamOrId
						}
					}]
				}
			}, function(error, response, body) {
				console.info(body)
				if (getString(() => body.code) === 'attachment.not.ready') {
					setTimeout(next, 1000);
				} else {
					isSuccess = !!getString(() => body.message.body.mid);
					next(true);
				}
			});
		}, function() {
			ret(!isSuccess);
		});
	} else {
		Request.post({
			uri: `https://botapi.tamtam.chat/uploads?access_token=${TAMTAM_BOT_TOKEN}&type=video`,
			timeout: REQUEST_TIMEOUT_MS
		}, function(error, response, body) {
			var uploadUrl = getString(() => JSON.parse(body).url);
			if (!uploadUrl) return ret();
			Request.post({
				url: uploadUrl,
				timeout: UPDLOAD_TIMEOUT_MS,
				formData: { data: streamOrId }
			}, function(error, response, body) {
				var fileId = getString(() => JSON.parse(body).token);
				if (!fileId) return ret();
				sendVideoTamtam(id, fileId, ret, text);
			});
		});
	}
}

function sendVideo(ids, path, ret, text) {

	var errorIds = [];
	if (!(ids instanceof Array)) ids = [ids];
	if (!fileExists(path)) return ret(ids);
	if (typeof text !== 'string') text = '';
	if (typeof ret !== 'function') ret = (function(){});

	var tgFileId;
	var telegramText = cleanupTextTelegram(text);
	var tamtamText = cleanupTextTamtam(text);


	Async.eachSeries(ids, function(id, nextId) {
		id = String(id);
		var chatOrUserId = id.slice(2);
		if (id.startsWith('tt')) {
			sendVideoTamtam(chatOrUserId, FS.createReadStream(path), function(fileId) {
				if (!fileId) errorIds.push(id);
				nextId();
			}, tamtamText);
		} else if (id.startsWith('tg')) {
			if (!tgFileId) tgFileId = FS.createReadStream(path);
			sendVideoTelegram(chatOrUserId, tgFileId, function(fileId) {
				if (!fileId) errorIds.push(id);
				else tgFileId = fileId;
				nextId();
			}, telegramText);
		} else {
			errorIds.push(id);
			nextId();
		}
	}, function() {
		ret(errorIds.length ? errorIds : null);
	});
}

module.exports = {
	...MESSAGE_KINDS,
	setTelegramBotToken: setTelegramBotToken,
	setTamTamBotToken: setTamTamBotToken,
	sendTextMessage: sendText,
	sendVideo: sendVideo
};