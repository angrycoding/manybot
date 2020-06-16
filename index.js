var Async = require('async'),
	Request = require('request'),
	Cheerio = require('cheerio');

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

function sendTextMessage(ids, text, ret) {

	var telegramText = 'ℹ ' + cleanupTextTelegram(text);
	var tamtamText = 'ℹ ' + cleanupTextTamtam(text);

	Async.eachSeries(ids, function(id, nextId) {

		id = String(id);

		if (id.startsWith('tt')) {

			if (!TAMTAM_BOT_TOKEN) return nextId();

			Request.post({
				uri: `https://botapi.tamtam.chat/messages?access_token=${TAMTAM_BOT_TOKEN}&user_id=${id.slice(2)}`,
				method: 'POST',
				json: {
					"text": tamtamText,
					"version": "0.3.0"
				}
			}, function(error, response, body) {
				nextId();
			});

		} else if (id.startsWith('tg')) {


			Request.post({
				uri: `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
				method: 'POST',
				json: {
					"chat_id": id.slice(2),
					"text": telegramText,
					"parse_mode": "HTML"
				}
			}, function(error, response, body) {
				if (error) console.info(error);
				console.info(body);
				nextId();
			});


		}

		else nextId();

	}, ret);
}

module.exports = {
	setTelegramBotToken: setTelegramBotToken,
	setTamTamBotToken: setTamTamBotToken,
	sendTextMessage: sendTextMessage
};