const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('ott/index.html', 'utf8');
const start = html.indexOf('function fitTvImage(img)');
const end = html.indexOf('function escapeHtml', start);
const context = {window:{}};
vm.createContext(context);
vm.runInContext('(function(){' + html.slice(start,end) + '})();', context);
assert.equal(typeof context.window.fitTvImage,'function');
const img = {parentNode:{clientWidth:300,clientHeight:200},naturalWidth:400,naturalHeight:225,style:{}};
context.window.img = img;
// Reproduce inline handlers: the private closure is absent from this scope.
vm.runInNewContext('fitTvImage(img)',context.window);
assert.equal(img.style.width,'300px');
assert.equal(img.style.height,'169px');
assert.equal(img.style.top,'16px');
context.window.fitTvImage(null);
console.log('Inline TV image handler resolves globally and preserves proportions.');
