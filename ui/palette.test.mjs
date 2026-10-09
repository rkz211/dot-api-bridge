import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('./styles.css',import.meta.url),'utf8');
const frames=[...css.matchAll(/([\d.]+)%,([\d.]+)%\{--cloud-core:(#[a-f\d]+);--cloud-glint:(#[a-f\d]+)\}/g)].map(m=>({start:+m[1]*28.8,end:+m[2]*28.8,core:m[3],glint:m[4]}));
test('accelerated palette clock visits all fifteen holds and transitions then wraps',()=>{
 assert.equal(frames.length,15);assert.equal(new Set(frames.map(f=>f.core)).size,15);
 const sample=ms=>{const t=((ms/1000)%2880+2880)%2880;let i=frames.findLastIndex(f=>t>=f.start-0.000001);return {i,transition:t>frames[i].end+0.000001};};
 for(let loop=0;loop<3;loop++)for(let i=0;i<15;i++){
  assert(Math.abs(frames[i].start-i*192)<0.000001);assert(Math.abs(frames[i].end-(i*192+180))<0.000001);
  for(const seconds of [0,1,90,179.9])assert.deepEqual(sample((loop*2880+i*192+seconds)*1000),{i,transition:false});
  assert.deepEqual(sample((loop*2880+i*192+186)*1000),{i,transition:true});
 }
 assert.deepEqual(sample(2880000),{i:0,transition:false});assert(css.includes('100%{--cloud-core:#115357;--cloud-glint:#5eddd1}'));
});
test('palette is native CSS with static reduced-motion fallback and no JavaScript timers',()=>{
 assert(css.includes('@property --cloud-core'));assert(css.includes('cloud-palette-cycle 2880s linear infinite'));assert(css.includes('@media(prefers-reduced-motion:reduce){.space-background:after{animation:none!important;--cloud-core:#115357;--cloud-glint:#5eddd1}}'));
 assert(!readFileSync(new URL('./client.js',import.meta.url),'utf8').includes('cloud-palette'));
});
test('every cloud preset preserves light-text contrast even at conservative maximum layer overlap',()=>{
 const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255),mix=(fg,bg,a)=>fg.map((v,i)=>v*a+bg[i]*(1-a));
 const lum=rgb=>rgb.reduce((a,v,i)=>a+(v<=.04045?v/12.92:((v+.055)/1.055)**2.4)*[.2126,.7152,.0722][i],0);
 for(const f of frames){let bg=rgb('#020202');for(const a of [.65,.5])bg=mix(rgb(f.core),bg,a);bg=mix(rgb('#7d838b'),bg,.27);bg=mix(rgb(f.glint),bg,.125);const ratio=(lum(rgb('#f0f1f4'))+.05)/(lum(bg)+.05);assert(ratio>=4.5,`${f.core}: ${ratio}`);}
});

test("adjacent presets use visibly different hue families, including the loop boundary",()=>{
 const expected=['#115357', '#c64000', '#22513d', '#2b315c', '#304a2e', '#12465b', '#5e292e', '#354554', '#5c293f', '#19385f', '#532b52', '#1b4e50', '#412c59', '#294b47', '#473451'];assert.deepEqual(frames.map(f=>f.core),expected);
 const hue=h=>{const [r,g,b]=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;return ((max===r?(g-b)/d:max===g?(b-r)/d+2:(r-g)/d+4)*60+360)%360;};
 for(let i=0;i<frames.length;i++){const a=hue(frames[i].core),b=hue(frames[(i+1)%frames.length].core),d=Math.abs(a-b);assert(Math.min(d,360-d)>=35,`${i}: ${d}`);}
});
