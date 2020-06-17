var Async = require('async'),
	Request = require('request'),
	Cheerio = require('cheerio');

var REQUEST_TIMEOUT_MS = 1000 * 10;

var MESSAGE_KINDS = {
	KIND_INFO: '💬',
	KIND_WARNING: '❗',
	KIND_QUESTION: '❓',
	KIND_FLAG: '🚩',
	KIND_MONEY: '💵',
	KIND_FIRE: '🔥',
};

var TELEGRAM_BOT_TOKEN;
var TAMTAM_BOT_TOKEN;


function setTelegramBotToken(token) {
	TELEGRAM_BOT_TOKEN = token;
}

function setTamTamBotToken(token) {
	TAMTAM_BOT_TOKEN = token;
}


/*
function sendToTamTam(moviePath, chatId, chatTitle, ret) {
	Request.post(`https://botapi.tamtam.chat/uploads?access_token=${TT_BOT_TOKEN}&type=video`, function(error, response, body) {


		var body = parseJSONObject(body);
		if (!body || typeof body.url !== 'string') return;

		console.info(body)

		Request.post({url: body.url, formData: {
			data: FS.createReadStream(moviePath)
		}}, function(error, httpResponse, body) {

			body = parseJSONObject(body);
			if (!body || typeof body.token !== 'string') return;

			console.info(body)

			function sendAtt() {
				Request.post({
				  uri: `https://botapi.tamtam.chat/messages?access_token=${TT_BOT_TOKEN}&chat_id=${chatId}`,
				  method: 'POST',
				  json: {
					 "text": chatTitle,
					 "attachments": [
					     {
					         "type": "video",
					         "payload": {
					             "token": body.token
					         }
					     }
					 ]
					}
				}, function(error, response, body) {

					if (typeof response === 'object' &&
						typeof response.body === 'object' &&
						response.body.code === 'attachment.not.ready') {
						console.info('retry')
						setTimeout(sendAtt, 1000);
					}

					else {
						console.info('ok')
						ret();
					}


				})

			}

			sendAtt();


		});

	});
}
*/

function getString(expression, fallback) {
	var result;
	try { result = typeof expression === 'function' ? expression() : expression; } catch (exception) {}
	if (typeof result === 'string') return result;
	if (arguments.length > 1) return fallback;
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
		method: 'POST',
		timeout: REQUEST_TIMEOUT_MS,
		json: {
			'text': text,
			'version': '0.3.0'
		}
	}, function(error, response, body) {
		ret(getString(() => body.message.body.text) !== text);
	});
}

function sendTextTelegram(id, text, ret) {
	if (!TELEGRAM_BOT_TOKEN) return ret(true);
	Request.post({
		uri: `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
		method: 'POST',
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

function sendText(ids, text, ret, prefix) {

	var errorIds = [];

	if (!(ids instanceof Array)) ids = [ids];
	if (typeof text !== 'string') return ret(ids);
	if (typeof ret !== 'function') ret = (function(){});
	if (typeof prefix !== 'string') prefix = MESSAGE_KINDS.KIND_INFO;

	text = ((prefix ? prefix + ' ' : '') + text);
	var telegramText = cleanupTextTelegram(text);
	var tamtamText = cleanupTextTamtam(text);

	Async.eachSeries(ids, function(id, nextId) {
		id = String(id);
		var chatOrUserId = id.slice(2);
		if (id.startsWith('tt')) {
			sendTextTamTam(chatOrUserId, tamtamText, function(error) {
				if (error) errorIds.push(chatOrUserId);
				nextId();
			});
		} else if (id.startsWith('tg')) {
			sendTextTelegram(chatOrUserId, telegramText, function(error) {
				if (error) errorIds.push(chatOrUserId);
				nextId();
			});
		} else {
			errorIds.push(chatOrUserId);
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
};