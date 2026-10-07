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
// 16:9 fast-path fills 100% without layout reflow
vm.runInNewContext('fitTvImage(img)',context.window);
assert.equal(img.style.width,'100%');
assert.equal(img.style.height,'100%');
// 4:3 proportional fit
const img43 = {parentNode:{clientWidth:300,clientHeight:200},naturalWidth:300,naturalHeight:300,style:{}};
context.window.img43 = img43;
vm.runInNewContext('fitTvImage(img43)',context.window);
assert.equal(img43.style.width,'200px');
assert.equal(img43.style.height,'200px');
assert.equal(img43.style.left,'50px');
context.window.fitTvImage(null);
console.log('Inline TV image handler resolves globally and preserves proportions.');
