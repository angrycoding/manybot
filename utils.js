var FS = require('fs');
var Request = require('request');
var Settings = require('./settings');
var DUMMY_FUNC = (() => 0);
var SUPPORTED_PREFIXES = ['tt', 'tg'];

function getString(expression, fallback) {
	var result;
	try { result = typeof expression === 'function' ? expression() : expression; } catch (exception) {}
	if (typeof result === 'string') return result;
	if (arguments.length > 1) return fallback;
}

function getArray(expression, fallback) {
	var result;
	try { result = typeof expression === 'function' ? expression() : expression; } catch (exception) {}
	if (result instanceof Array) return result;
	if (arguments.length > 1) return fallback;
}

function getBoolean(expression, fallback) {
	var result;
	try { result = typeof expression === 'function' ? expression() : expression; } catch (exception) {}
	if (typeof result === 'boolean') return result;
	if (arguments.length > 1) return fallback;
}

function getObject(expression, fallback) {
	var result;
	try { result = typeof expression === 'function' ? expression() : expression; } catch (exception) {}
	if (typeof result === 'object' && result !== null) return result;
	return fallback;
}

function getNumber(expression, fallback) {
	var result;
	try { result = typeof expression === 'function' ? expression() : expression; } catch (exception) {}
	if (typeof result === 'number' && !isNaN(result)) return result;
	return fallback;
}

function parseJSONObject(value, fallback) {
	try {
		value = JSON.parse(value);
		if (typeof value === 'object') return value;
	} catch (exception) {}
	return fallback;
}

function arrayGroup(array, grouper) {
	array = getArray(array, [array]);
	if (typeof grouper !== 'function') {
		var str = String(grouper);
		grouper = () => str;
	}
	var result = {};
	for (var c = 0; c < array.length; c++) {
		var item = array[c];
		var group = grouper(item);
		group = getArray(group, [group]);
		if (group.length > 1) item = group[1];
		group = getString(group[0], '').trim();
		if (!group) continue;
		if (!result.hasOwnProperty(group)) {
			result[group] = [];
		}
		result[group].push(item);
	}
	return result;
}

function createReadStream(path, ret) {
	if (typeof ret !== 'function') return;
	try {
		if (!fileExists(path)) return ret();
		FS.createReadStream(path).on('error', function() {
			this.removeAllListeners();
			this.close();
			ret();
		}).on('open', function() {
			this.removeAllListeners();
			ret(this);
		});
	} catch (error) {
		ret();
	}
}

function fileExists(path) {
	return (
		FS.existsSync(path) &&
		FS.lstatSync(path).isFile()
	);
}

function cleanupChatIds(chatIds, defaultPrefix) {

	if (!SUPPORTED_PREFIXES.includes(defaultPrefix)) {
		defaultPrefix = '';
	}

	chatIds = getArray(chatIds, [chatIds]).map(chatId => {
		if (typeof chatId !== 'string') chatId = '';
		chatId = chatId.trim();
		if (SUPPORTED_PREFIXES.includes(chatId)) chatId = '';
		return chatId;
	});

	chatIds = chatIds.filter(chatId => {
		if (!chatId) return false;
		var prefix = SUPPORTED_PREFIXES.find(prefix => chatId.startsWith(prefix));
		return (prefix || !SUPPORTED_PREFIXES.some(prefix => chatIds.includes(prefix + chatId)));
	});

	chatIds = Array.from((new Set(chatIds)).values());

	return arrayGroup(chatIds, chatId => {
		var prefix = SUPPORTED_PREFIXES.find(prefix => chatId.startsWith(prefix));
		if (defaultPrefix) {
			return (!prefix || prefix === defaultPrefix ? defaultPrefix : 'invalid');
		} else {
			return (prefix ? prefix : 'invalid');
		}
	});
}

function sendFileTelegram(token, method, originalChatId, streamOrId, caption, ret) {
	var fieldName = (method === 'sendVideo' ? 'video' : 'document');
	var realChatId = (originalChatId.startsWith('tg') ? originalChatId.slice(2) : originalChatId);
	Request.post({
		url: `https://api.telegram.org/bot${token}/${method}`,
		timeout: (
			streamOrId instanceof FS.ReadStream ?
			Settings.UPDLOAD_TIMEOUT_MS :
			Settings.REQUEST_TIMEOUT_MS
		),
		formData: {
			chat_id: realChatId,
			parse_mode: 'HTML',
			caption: caption,
			[fieldName]: streamOrId
		}
	}, (error, response, body) => {
		var fileId = getString(() => JSON.parse(body).result[fieldName].file_id);
		ret(fileId);
	});
}


const getRandomInt = (min, max) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

const getRandomLetterOrDigit = () => {
	if (Math.round(Math.random())) return String(getRandomInt(0, 9));
	var letter = String.fromCharCode(getRandomInt(97, 122));
	if (Math.round(Math.random())) letter = letter.toUpperCase();
	return letter;
};

const generateRandomString = (length) => {
	var result = '';
	var flag = false;
	var time = new Date().getTime().toString(16).split('');
	while (result.length < length) {
		var tc = (flag = !flag && time.shift());
		if (!tc) tc = getRandomLetterOrDigit();
		if (Math.round(Math.random())) tc = tc.toUpperCase();
		result += tc;
	}
	return result;
};

module.exports = {
	DUMMY_FUNC: (() => 0),
	getArray: getArray,
	getBoolean: getBoolean,
	getString: getString,
	getNumber: getNumber,
	getObject: getObject,
	parseJSONObject: parseJSONObject,
	fileExists: fileExists,
	cleanupChatIds: cleanupChatIds,
	createReadStream: createReadStream,
	sendFileTelegram: sendFileTelegram,
	generateRandomString: generateRandomString
};