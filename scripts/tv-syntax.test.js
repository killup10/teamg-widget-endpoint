const fs=require('node:fs'),vm=require('node:vm');
// Use the Acorn parser shipped with Node, without installing a TV runtime dependency.
const parserSource=process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'];
if(!parserSource)throw new Error('This Node version does not expose its Acorn parser.');
const parserExports={};vm.runInNewContext(parserSource,{exports:parserExports,module:{exports:parserExports}});
for(const path of ['ott/index.html','ott/native-player.js','ott/hls-variant.js']) {
  const text=fs.readFileSync(path,'utf8');
  const scripts=path.endsWith('.html')?[...text.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]):[text];
  for(const source of scripts)if(source.trim())parserExports.parse(source,{ecmaVersion:5,allowReserved:true});
  console.log(path+': ES5 syntax verified.');
}
