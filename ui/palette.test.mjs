import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const client=readFileSync(new URL('./client.js',import.meta.url),'utf8');
const css=readFileSync(new URL('./styles.css',import.meta.url),'utf8');
const frames=[...css.matchAll(/([\d.]+)%,([\d.]+)%\{--cloud-core:var\(--palette-core-\d+,(#[a-f\d]+)\);--cloud-glint:var\(--palette-glint-\d+,(#[a-f\d]+)\)\}/g)].map(m=>({start:+m[1]*28.8,end:+m[2]*28.8,core:m[3],glint:m[4]}));
test('accelerated palette clock visits all fifteen holds and transitions then wraps',()=>{
 assert.equal(frames.length,15);assert.equal(new Set(frames.map(f=>f.core)).size,15);
 const sample=ms=>{const t=((ms/1000)%2880+2880)%2880;let i=frames.findLastIndex(f=>t>=f.start-0.000001);return {i,transition:t>frames[i].end+0.000001};};
 for(let loop=0;loop<3;loop++)for(let i=0;i<15;i++){
  assert(Math.abs(frames[i].start-i*192)<0.000001);assert(Math.abs(frames[i].end-(i*192+180))<0.000001);
  for(const seconds of [0,1,90,179.9])assert.deepEqual(sample((loop*2880+i*192+seconds)*1000),{i,transition:false});
  assert.deepEqual(sample((loop*2880+i*192+186)*1000),{i,transition:true});
 }
 assert.deepEqual(sample(2880000),{i:0,transition:false});assert(css.includes('100%{--cloud-core:var(--palette-next-core,#115357);--cloud-glint:var(--palette-next-glint,#5eddd1)}'));
});
test('palette is native CSS with static reduced-motion fallback and no JavaScript timers',()=>{
 assert(css.includes('@property --cloud-core'));assert(css.includes('cloud-palette-cycle 2880s linear infinite'));assert(css.includes('@media(prefers-reduced-motion:reduce){.space-background:after{animation:none!important;--cloud-core:#115357;--cloud-glint:#5eddd1}}'));
 assert(!client.slice(client.indexOf('// Shuffled palette bags')).includes('setInterval'));
});
test('every cloud preset preserves light-text contrast even at conservative maximum layer overlap',()=>{
 const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255),mix=(fg,bg,a)=>fg.map((v,i)=>v*a+bg[i]*(1-a));
 const lum=rgb=>rgb.reduce((a,v,i)=>a+(v<=.04045?v/12.92:((v+.055)/1.055)**2.4)*[.2126,.7152,.0722][i],0);
 for(const f of frames){let bg=rgb('#020202');for(const a of [.65,.5])bg=mix(rgb(f.core),bg,a);bg=mix(rgb('#7d838b'),bg,.27);bg=mix(rgb(f.glint),bg,.125);const ratio=(lum(rgb('#f0f1f4'))+.05)/(lum(bg)+.05);assert(ratio>=4.5,`${f.core}: ${ratio}`);}
});

test('shuffled bags cover all approved colours once, vary, and never repeat at boundaries',()=>{
 const values={},events={},background={style:{setProperty:(k,v)=>values[k]=v},addEventListener:(n,f)=>events[n]=f};
 vm.runInNewContext(client.slice(client.indexOf('// Shuffled palette bags')),{document:{getElementById:()=>background},Math});
 const bag=()=>Array.from({length:15},(_,i)=>values['--palette-core-'+i]);
 const expected=frames.map(f=>f.core).sort();let previous=null;const orders=new Set();
 for(let j=0;j<100;j++){
  const current=bag();assert.deepEqual([...current].sort(),expected);assert.notEqual(current[0],previous);orders.add(current.join(','));
  const nextFirst=values['--palette-next-core'];previous=current.at(-1);assert.notEqual(nextFirst,previous);
  events.animationiteration({animationName:'cloud-palette-cycle',pseudoElement:'::after'});assert.equal(bag()[0],nextFirst);
 }
 assert(orders.size>1);
 const before=bag();events.animationiteration({animationName:'wormhole-orbit',pseudoElement:'::before'});assert.deepEqual(bag(),before);
});

test('yellow uses the shared cloud treatment with no separate wormhole light patch',()=>{assert(!css.includes('space-yellow-cloud'));assert(!css.includes('yellow-intensity'));assert(!readFileSync(new URL('./template.html',import.meta.url),'utf8').includes('space-yellow-cloud'));assert(frames.some(f=>f.core==='#606000'&&f.glint==='#ffff00'));});
