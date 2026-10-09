// Dependency-free behavioral smoke tests. These do not replace real-browser visual QA.
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HTML, renderUi } from '../ui.mjs';
class Element {
  constructor(tag, document) { this.style={setProperty(){}};this.tagName=tag.toUpperCase();this.document=document;this.children=[];this.attributes={};this.events={};this.dataset={};this.value='';this.disabled=false;this.hidden=false;this.className='';this._text='';this.parentNode=null; }
  set textContent(v){this._text=String(v);this.children=[];}
  get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
  append(...items){for(let item of items){if(typeof item==='string')item=this.document.createTextNode(item);item.parentNode=this;this.children.push(item);}}
  prepend(...items){for(const item of items.reverse()){item.parentNode=this;this.children.unshift(item);}}
  replaceChildren(...items){this.children=[];this._text='';this.append(...items);}
  setAttribute(k,v){this.attributes[k]=String(v);if(k==='class')this.className=String(v);if(k==='id')this.id=String(v);}
  getAttribute(k){return k==='id'?this.id:k==='class'?this.className:this.attributes[k];}
  addEventListener(k,f){(this.events[k]??=[]).push(f);}
  fire(k){for(const f of this.events[k]||[])f({preventDefault(){},target:this});}
  focus(){this.document.activeElement=this;}
  select(){}
  scrollIntoView(){}
  reportValidity(){return true;}
  get isConnected(){return true;}
  matches(sel){
    const attrs=[...sel.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)];
    sel=sel.replace(/\[[^\]]+\]/g,'');
    for(const [,key,val] of attrs){const actual=key.startsWith('data-')?this.dataset[key.slice(5).replace(/-([a-z])/g,(_,a)=>a.toUpperCase())]:this.getAttribute(key);if(actual===undefined || (val!==undefined&&actual!==val))return false;}
    const id=sel.match(/#([\w-]+)/)?.[1];if(id&&this.id!==id)return false;
    for(const [,cls] of sel.matchAll(/\.([\w-]+)/g))if(!this.className.split(' ').includes(cls))return false;
    const tag=sel.match(/^[a-z][a-z0-9-]*/i)?.[0];return !tag || tag.toUpperCase()===this.tagName;
  }
  querySelectorAll(selector){
    const found=[];
    const walk=(n)=>{for(const child of n.children){for(const choice of selector.split(',')){const chain=choice.trim().split(/\s+/);if(!child.matches(chain.at(-1)))continue;let parent=child.parentNode;let index=chain.length-2;while(index>=0&&parent){if(parent.matches(chain[index]))index--;parent=parent.parentNode;}if(index<0){found.push(child);break;}}walk(child);}};
    walk(this);return found;
  }
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
}
class Document extends Element {
  constructor(){super('document');this.document=this;this.body=this;}
  createElement(tag){return new Element(tag,this);}
  createTextNode(text){const node=new Element('#text',this);node.textContent=text;return node;}
  getElementById(id){return this.querySelector('#'+id);}
}
const fixtures=()=>[
{id:'first',name:'Example Service',description:'Read your work.',keyHelpUrl:'https://example.com/keys',keyHelpText:'Create an API key in your provider account.',accessDescription:'Read permitted documents.',baseUrl:'https://api.example.com/v1',authLabel:'Authorization: Bearer token',binding:'binding-1',status:'needs_key',source:'none',lastTest:null,canSave:true},
{id:'hosted',name:'Hosted Service',description:'Already prepared.',accessDescription:'Read public updates.',baseUrl:'https://api.example.com/v2',authLabel:'X-API-Key',binding:'binding-2',status:'ready',source:'hosted',lastTest:{ok:true,message:'Checked',at:'2026-10-08T18:00:00Z'},canSave:true}];
async function setup(mode='default',searchQuery=''){
  const document=new Document(); document.documentElement=document;
  for(const [tag,id] of [['div','connection-list'],['div','connection-panel'],['input','service-search'],['div','network-banner'],['span','connection-count'],['div','announcer'],['div','space-background']]){const el=document.createElement(tag);el.id=id;document.append(el);}
  let connections=fixtures();if(mode==='empty')connections=[];if(mode==='attention'){connections[0].status='needs_attention';connections[0].source='saved';connections[0].lastTest={ok:false,message:'Check key permissions.'};}if(mode==='xss')connections[0].name='<img onerror=alert(1)>';
  const requests=[],copied=[],windowEvents={};
  const navigator={onLine:mode!=='offline',clipboard:{writeText:async v=>{copied.push(v);}}};
  const fetch=async(url,options)=>{
    requests.push({url,options});
    if(mode==='load-error'&&options.method==='GET')return{ok:false,status:503,json:async()=>({})};
    if(options.method==='GET')return{ok:true,status:200,json:async()=>JSON.parse(JSON.stringify({connections,storageAvailable:mode!=='no-storage'}))};
    const payload=JSON.parse(options.body);
    if(url.endsWith('/prepare')){const c={...fixtures()[0],...payload,id:'prepared',status:'needs_key'};connections.push(c);return{ok:true,status:201,json:async()=>({connection:c})};}
    const id=url.split('/')[3],action=url.split('/')[4],c=connections.find(x=>x.id===id);
    if(mode==='conflict'){c.binding='changed-binding';return{ok:false,status:409,json:async()=>({message:'do not show raw mutation body'})};}
    if(mode.startsWith('diagnostic:'))return {ok:false,status:422,json:async()=>({code:mode.split(':')[1],providerStatus:503,message:'FAKE_SECRET_DO_NOT_RENDER'})};
    if(mode==='response-lost')throw new Error('No connection');
    if(action==='disconnect'){c.status='disabled';c.source='none';c.lastTest=null;}
    else if(mode==='failed'){c.status='needs_attention';c.source='saved';c.lastTest={ok:false,message:'The key was rejected.'};}
    else {c.status='ready';if(action==='key')c.source='saved';c.lastTest=mode==='untested'?null:{ok:true,message:'Connection checked'};}
    return{ok:true,status:200,json:async()=>({connection:c,message:'Completed'})};
  };
  const window={addEventListener:(name,handler)=>{(windowEvents[name]??=[]).push(handler);},matchMedia:()=>({matches:mode==='reduced-motion',addEventListener(){}})};
  const context={document,navigator,window,location:{origin:'https://private-bridge.example',search:searchQuery},URL,fetch,AbortController,setTimeout,clearTimeout,Date,console};
  vm.runInNewContext(readFileSync(new URL('./client.js',import.meta.url),'utf8'),context);
  const settle=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};await settle();
  const get=(id)=>document.getElementById(id);
  const findButton=(text)=>document.querySelectorAll('button').find(b=>b.textContent===text);
  const click=async(text)=>{const b=findButton(text);assert(b,'Missing button: '+text);assert(!b.disabled,'Button disabled: '+text);b.fire('click');await settle();};
  const search=(text)=>{get('service-search').value=text;get('service-search').fire('input');};
  const save=async()=>{get('api-key').value='FAKE_VALUE_ONLY_FOR_LOCAL_TEST';get('confirm-destination').checked=true;get('api-key').parentNode.fire('submit');await settle();};
  return{document,get,findButton,click,search,save,requests,copied,settle,windowEvents,navigator};
}
const results=[];
let t=await setup();assert.equal(t.get('api-key').type,'password');assert.equal(t.get('api-key').value,'');assert.equal(t.document.querySelectorAll('.connection-card').length,2);results.push('prepared form');
await t.save();assert(t.document.textContent.includes('Your key is saved and hidden.'));assert(!t.document.textContent.includes('FAKE_VALUE'));let post=t.requests.find(r=>r.options.method==='POST');assert.equal(post.options.headers['X-Bridge-UI'],'1');assert.equal(JSON.parse(post.options.body).expectedBinding,'binding-1');assert.equal(post.options.redirect,'error');assert(!post.url.includes('FAKE_VALUE'));results.push('save, clear, binding, JSON headers, no redirects');
await t.click('Replace key');assert.equal(t.get('api-key').value,'');await t.click('Cancel');assert(!t.get('api-key'));results.push('replace / cancel');
await t.click('Disconnect');assert(t.document.textContent.includes('does not revoke'));await t.click('Keep connection');assert(!t.findButton('Disconnect this bridge'));await t.click('Disconnect');await t.click('Disconnect this bridge');assert(t.document.textContent.includes('provider’s key has not been revoked'));results.push('disconnect / cancel / disabled');
t=await setup();const hosted=t.document.querySelectorAll('.connection-card')[1];hosted.fire('click');assert(!t.get('api-key'));assert(t.document.textContent.includes('no need to enter a key'));await t.click('Copy handoff');assert(t.copied[0].includes('Connection ID: hosted'));results.push('hosted ready / handoff');
t.search('https://example.com/instructions.md?utm=hello');await t.click('Copy request for your dot');assert(t.copied[1].includes('https://example.com/instructions.md'));assert(!t.copied[1].includes('utm=hello'));results.push('unknown URL / safe copy');
t.search('sk-EXAMPLE_FAKE_VALUE_ONLY_FOR_TESTING');assert.equal(t.get('service-search').value,'');assert(!t.findButton('Copy request for your dot'));assert(!t.document.textContent.includes('sk-EXAMPLE'));assert(t.document.textContent.includes('That looks like a key'));results.push('token input blocked');
t.search('https://example.com/docs?api_key=FAKE');assert.equal(t.get('service-search').value,'');assert(!t.findButton('Copy request for your dot'));results.push('credential URL blocked');
t.search('New Service');t.get('manual-auth').value='bearer';t.get('manual-base-url').value='https://api.example.com/new';t.get('manual-access').value='Read public data';t.get('manual-base-url').parentNode.parentNode.fire('submit');await t.settle();assert(t.document.textContent.includes('New Service'));assert(t.get('api-key'));post=t.requests.filter(r=>r.options.method==='POST').at(-1);assert.equal(post.url,'/api/connections/prepare');assert.equal('key' in JSON.parse(post.options.body),false);results.push('manual draft only');
t=await setup('failed');await t.save();assert(t.findButton('Retry test'));assert(!t.document.textContent.includes('Your key is saved and hidden'));results.push('failed test');
t=await setup('untested');await t.save();assert(t.document.textContent.includes('Ready for your dot'));assert(!t.document.textContent.includes('Connection checked'));results.push('untested truthfulness');
t=await setup('conflict');await t.save();assert(t.document.textContent.includes('connection settings changed'));assert.equal(t.get('api-key').value,'');assert(!t.document.textContent.includes('raw mutation body'));results.push('stale binding / no raw error echo');
for(const [code,copy] of [['key_format','format was rejected'],['provider_rejected','provider rejected'],['provider_network','connection error or timeout'],['provider_response','could not safely process'],['check_configuration','could not prepare'],['storage_unavailable','storage step failed'],['provider_http','HTTP 503'],['unknown_code','HTTP 422']]){t=await setup('diagnostic:'+code);await t.save();assert(t.document.textContent.includes(copy),code);assert(!t.document.textContent.includes('FAKE_SECRET_DO_NOT_RENDER'));assert.equal(t.get('api-key').value,'');}results.push('safe stage diagnostics and unknown-code fallback');
t=await setup('response-lost');await t.save();assert(t.document.textContent.includes('change may have completed'));assert(t.findButton('Save & test').disabled);results.push('ambiguous request disables retry until refresh');
t=await setup('no-storage');assert(!t.get('api-key'));assert(t.document.textContent.includes('Key saving isn’t available'));results.push('storage unavailable');
t=await setup('empty');assert(t.document.textContent.includes('No services prepared yet'));results.push('empty');
t=await setup('load-error');assert(!t.get('network-banner').hidden);results.push('load error');
t=await setup('offline');assert(t.findButton('Save & test').disabled);results.push('offline');
t=await setup('xss');assert.equal(t.document.querySelectorAll('img').length,0);assert(t.document.textContent.includes('<img onerror=alert(1)>'));results.push('untrusted text not HTML');
assert(renderUi({nonce:'nonce1234567890'}).includes('data-bridge-script nonce="nonce1234567890"'));assert(renderUi({nonce:'nonce1234567890'}).includes('data-bridge-style nonce="nonce1234567890"'));assert.throws(()=>renderUi({nonce:'"><script>'}));assert(!/localStorage|sessionStorage|innerHTML|outerHTML|eval\(/.test(readFileSync(new URL('./client.js',import.meta.url),'utf8')));assert.equal((HTML.match(/<script /g)||[]).length,1);results.push('CSP nonce / no storage / no dynamic HTML');
t=await setup('default','?connect=hosted');assert(t.document.textContent.includes('Hosted Service'));assert(!t.get('api-key'));results.push('prepared link selects intended service');
t=await setup('default','?connect=missing_service');assert(!t.get('api-key'));assert(t.document.textContent.includes('Ask your dot'));results.push('missing prepared link does not select another key destination');
t=await setup();assert.equal(t.get('space-background').getAttribute('data-pulse'),undefined);await t.save();assert.equal(t.get('space-background').getAttribute('data-pulse'),'a');await t.click('Test connection');assert.equal(t.get('space-background').getAttribute('data-pulse'),'b');await t.click('Test connection');assert.equal(t.get('space-background').getAttribute('data-pulse'),'a');await t.click('Disconnect');await t.click('Disconnect this bridge');assert.equal(t.get('space-background').getAttribute('data-pulse'),'a');results.push('pulse only follows successful save/test; repeated success restarts; disconnect does not pulse');
for(const mode of ['failed','conflict','response-lost','diagnostic:provider_rejected']){t=await setup(mode);await t.save();assert.equal(t.get('space-background').getAttribute('data-pulse'),undefined,mode);}results.push('failed and unconfirmed operations never pulse');
t=await setup('reduced-motion');await t.save();await t.click('Test connection');assert.equal(t.get('space-background').getAttribute('data-pulse'),undefined);const styles=readFileSync(new URL('./styles.css',import.meta.url),'utf8');assert(styles.includes('@media(prefers-reduced-motion:reduce){.space-background:before,.space-background:after,.space-wormhole:before,.space-signal{animation:none!important}.space-signal{display:none}}'));assert(HTML.includes('id="space-background" class="space-background" aria-hidden="true"'));results.push('reduced motion suppresses pulse and all decorative CSS animation; background hidden from assistive technology');
console.log(JSON.stringify({passed:results.length,checks:results,limits:'DOM simulation, not browser layout or real provider verification.'},null,2));
