const fs=require('node:fs'),vm=require('node:vm');
// Use the Acorn parser shipped with Node, without installing a TV runtime dependency.
const parserSource=process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'];
if(!parserSource)throw new Error('This Node version does not expose its Acorn parser.');
const parserExports={};vm.runInNewContext(parserSource,{exports:parserExports,module:{exports:parserExports}});
function assertStrictEs5Functions(node, parent, grandParent, path) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'FunctionDeclaration') {
    const isTopOfProgram = parent && parent.type === 'Program';
    const isTopOfFunction = parent && parent.type === 'BlockStatement' && grandParent && (grandParent.type === 'FunctionDeclaration' || grandParent.type === 'FunctionExpression');
    if (!isTopOfProgram && !isTopOfFunction) {
      throw new Error(path + ': ES5 strict mode forbids block-scoped FunctionDeclaration (' + (node.id && node.id.name) + ' at line ' + (node.loc && node.loc.start.line) + ')');
    }
  }
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) {
      for (const child of v) assertStrictEs5Functions(child, node, parent, path);
    } else if (v && typeof v === 'object' && v.type) {
      assertStrictEs5Functions(v, node, parent, path);
    }
  }
}
for(const path of ['ott/index.html','ott/native-player.js','ott/hls-variant.js','ott/catalog-images.js']) {
  const text=fs.readFileSync(path,'utf8');
  const scripts=path.endsWith('.html')?[...text.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]):[text];
  for(const source of scripts)if(source.trim()){
    const ast=parserExports.parse(source,{ecmaVersion:5,allowReserved:false,locations:true});
    assertStrictEs5Functions(ast,null,null,path);
  }
  console.log(path+': ES5 syntax verified.');
}
for(const path of ['web/cabinet.html','web/payments.js','web/index.html','admin/index.html']) {
  const text=fs.readFileSync(path,'utf8');
  const scripts=path.endsWith('.html')?[...text.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]):[text];
  for(const source of scripts)if(source.trim())parserExports.parse(source,{ecmaVersion:2020,allowReserved:true});
  console.log(path+': Web syntax verified.');
}
