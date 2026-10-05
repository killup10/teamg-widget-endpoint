'use strict';
function toVtt(input) {
  if (typeof input !== 'string' || Buffer.byteLength(input, 'utf8') > 2 * 1024 * 1024) throw new Error('Subtítulo demasiado grande (máximo 2 MB).');
  let text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!/\d{2}:\d{2}(?::\d{2})?[.,]\d{3}\s*-->\s*\d{2}:\d{2}(?::\d{2})?[.,]\d{3}/.test(text)) throw new Error('El archivo debe contener subtítulos SRT o WebVTT de texto.');
  if (!/^WEBVTT(?:\s|$)/.test(text)) text = 'WEBVTT\n\n' + text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return text + '\n';
}
module.exports = {toVtt};
