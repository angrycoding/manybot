var FS = require('fs');
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
		}).on('ready', function() {
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

module.exports = {
	getArray: getArray,
	getString: getString,
	fileExists: fileExists,
	cleanupChatIds: cleanupChatIds,
	createReadStream: createReadStream
};