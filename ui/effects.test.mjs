import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const template=readFileSync(new URL('./template.html',import.meta.url),'utf8'),css=readFileSync(new URL('./styles.css',import.meta.url),'utf8'),client=readFileSync(new URL('./client.js',import.meta.url),'utf8');
test('lens and six particle elements stay decorative, with no JavaScript animation loop',()=>{assert(template.includes('id="space-background" class="space-background" aria-hidden="true"'));assert.equal((template.match(/class="space-particle p\d"/g)||[]).length,6);assert(template.includes('class="space-lens"'));assert(!client.includes('particle-infall'));assert(!client.includes('requestAnimationFrame'));});
test('particle effects remain bounded and disappear for reduced motion',()=>{assert(css.includes('animation:particle-infall 12s linear infinite'));for(const delay of [2,4,6,8,10])assert(css.includes(`animation-delay:-${delay}s`));assert(css.includes('@media(prefers-reduced-motion:reduce){.space-particle{display:none;animation:none!important}}'));assert(css.includes('.space-wormhole{z-index:1}'));});

import vm from 'node:vm';
test('energy scales with speed, caps brightness and pool size, and ignores touch/reduced motion',()=>{
 const handlers={},traces=[],media={matches:true,addEventListener:(n,f)=>handlers.media=f};
 const make=()=>({dataset:{},style:{setProperty(k,v){this[k]=v}},append(){}});
 const background=make();
 const document={hidden:false,getElementById:()=>background,createElement:tag=>{const e=make();if(tag==='span')traces.push(e);return e},documentElement:{addEventListener:(n,f)=>handlers[n]=f},addEventListener:(n,f)=>handlers[n]=f};
 const window={matchMedia:()=>media,addEventListener:(n,f)=>handlers[n]=f};
 vm.runInNewContext(client.slice(client.indexOf('// Event-driven energy')), {window,document});
 const move=(x,t,type='mouse')=>handlers.pointermove({pointerType:type,clientX:x,clientY:100,timeStamp:t});
 assert.equal(traces.length,12);move(0,0);move(5,40);const slow=+traces[0].style['--energy'];move(105,80);assert(+traces[1].style['--energy']>slow);assert(+traces[1].style['--energy']<=.67);
 for(let i=3;i<30;i++)move(i*100,i*40);assert.equal(traces.length,12);
 handlers.blur();assert(traces.every(e=>!e.dataset.flash));move(10,1300,'touch');assert(traces.every(e=>!e.dataset.flash));
 media.matches=false;move(0,1400);move(90,1440);assert(traces.every(e=>!e.dataset.flash));
 media.matches=true;document.hidden=true;move(0,1500);move(90,1540);assert(traces.every(e=>!e.dataset.flash));
 assert(!css.includes('--pointer-x'));assert(css.includes('mix-blend-mode:soft-light'));
});
