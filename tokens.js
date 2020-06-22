var TELEGRAM_BOT_TOKEN;
var TAMTAM_BOT_TOKEN;
var onChangeCallback;

function onChange(callback) {
	onChangeCallback = callback;
}

function setTelegramBotToken(token) {
	TELEGRAM_BOT_TOKEN = token;
	if (onChangeCallback) {
		onChangeCallback(TELEGRAM_BOT_TOKEN, TAMTAM_BOT_TOKEN);
	}
}

function setTamTamBotToken(token) {
	TAMTAM_BOT_TOKEN = token;
	if (onChangeCallback) {
		onChangeCallback(TELEGRAM_BOT_TOKEN, TAMTAM_BOT_TOKEN);
	}
}

function getTelegramBotToken() {
	return TELEGRAM_BOT_TOKEN;
}

function getTamtamBotToken() {
	return TAMTAM_BOT_TOKEN;
}

module.exports = {
	onChange,
	setTelegramBotToken,
	setTamTamBotToken,
	getTelegramBotToken,
	getTamtamBotToken,
};