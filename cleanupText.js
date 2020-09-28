var Cheerio = require('cheerio'),
	Utils = require('./utils');

function telegram(text, icon) {
	if (typeof text === 'function') text = text('tg');
	if (typeof text !== 'string') return '';
	text = text.trim();
	text = text.replace(/[\n\t]+/g, ' ');
	text = text.replace(/[\n\t\s]*(<br\s*\/>|<br>)[\n\t\s]*/g, '\n');

	var $ = Cheerio.load(text, {
		decodeEntities: false
	});

	$('*').each(function() {
		var element = $(this);
		var tagName = this.tagName;
		if (![
			'html', 'body',
			'b', 'strong',
			'i', 'em',
			'u', 'ins',
			's', 'strike', 'del',
			'a',
			'code', 'pre',
		].includes(tagName)) {
			element.replaceWith(element.text());
		}
	});



	text = $('body').html();
	icon = Utils.getString(icon, '');
	if (icon) text = (icon + ' ' + text);

	return text;
}

function tamtam(text, icon) {
	if (typeof text === 'function') text = text('tt');
	if (typeof text !== 'string') return '';
	text = text.trim();
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
	text = $('body').html();
	icon = Utils.getString(icon, '');
	if (icon) text = (icon + ' ' + text);
	return text;
}


module.exports = {
	tamtam,
	telegram,
};