const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const html = fs.readFileSync('ott/index.html','utf8');
const api = fs.readFileSync('ott-api.js','utf8');
const elements = {};
const ctx = {state:{auth:{token:'linked',login:'client'},subscription:{planName:'Premium VIP',months:3,expiresOn:'2026-11-30'},paymentServerDate:'2026-10-25'},
  $:id=>elements[id] || (elements[id]={style:{}}),stopActivationPolling(){},apiCall(){throw Error('Linked device must not generate activation codes');}};
vm.createContext(ctx);
vm.runInContext(html.slice(html.indexOf('function updateAccountCard('),html.indexOf('function startActivationPolling(')),ctx);
ctx.requestActivationCode();
assert.equal(elements.activationPending.style.display,'none');
assert.equal(elements.subscriptionCard.style.display,'');
assert.equal(elements.subscriptionPlan.textContent,'Premium VIP · 3 meses');
assert.equal(elements.subscriptionExpires.textContent,'30/11/2026');
ctx.state.subscription.expiresOn='2026-10-20';ctx.updateAccountCard();
assert.match(elements.subscriptionStatus.textContent,/finalizó/);
ctx.state.subscription=null;ctx.state.paymentDueDate='';ctx.updateAccountCard();
assert.equal(elements.subscriptionPlan.textContent,'Plan por confirmar');
assert.match(elements.subscriptionExpires.textContent,/Por confirmar/);
ctx.state.auth.token='';ctx.updateAccountCard();
assert.equal(elements.activationPending.style.display,'');assert.equal(elements.subscriptionCard.style.display,'none');

const ledger = require('../payment-ledger');
const backend = {require:()=>ledger};vm.createContext(backend);
vm.runInContext(api.slice(api.indexOf('async function deviceSubscription('),api.indexOf('const pub =')),backend);
(async()=>{
  const today=ledger.limaDate();
  let query;
  const cols={payments:{find:async q=>{query=q;return [
    {date:'2026-01-01',planId:'standard-1',created:'2026-01-01'},
    {date:today,planId:'vip-3',created:today},
    {date:today,planId:'sports-1',created:today+'x',voided:true},
    {date:'2099-01-01',planId:'cine-1'}
  ];}}};
  let result=await backend.deviceSubscription(cols,{_id:'tv',paymentDueDate:'2026-11-30'},{expires:'2026-12-31'});
  assert.equal(query.deviceId,'tv');assert.equal(result.planName,'Premium VIP');assert.equal(result.months,3);assert.equal(result.expiresOn,'2026-11-30');
  assert.equal(result.amountCents,undefined,'Client receives no payment amounts or history');
  result=await backend.deviceSubscription({payments:{find:async()=>[]}},{_id:'tv'},{});
  assert.equal(result.planName,'');assert.equal(result.expiresOn,'');
  console.log('Subscription card: linked/pending, no extra codes, real plan, expiry, missing data and void/future payments pass.');
})().catch(e=>{console.error(e);process.exitCode=1;});
