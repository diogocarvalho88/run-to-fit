import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

test('visible flow: parse, reject incomplete text, edit a step, download FIT, and expose the same WebMCP action',async()=>{
  const dom=new JSDOM(await readFile('index.html','utf8'),{url:'https://example.com/run-to-fit/'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;
  const tools=[];document.modelContext={registerTool(tool){tools.push(tool);}};
  let blob=null,filename=null;
  const originalURL=URL.createObjectURL;URL.createObjectURL=value=>{blob=value;return 'blob:test';};
  const originalTimeout=globalThis.setTimeout;
  globalThis.setTimeout=(fn,ms)=>{const timer=originalTimeout(fn,ms);timer.unref?.();return timer;};
  dom.window.HTMLAnchorElement.prototype.click=function(){filename=this.download;};
  await import('../src/app.js');
  const $=id=>document.getElementById(id);
  assert.equal($('download').disabled,false);assert.equal(document.querySelectorAll('.repeat-block').length,1);
  assert.equal(document.querySelectorAll('details.step').length,4);
  $('workout-text').value='10 min aquecimento\nNão sei o que fazer';
  $('workout-text').dispatchEvent(new window.Event('input',{bubbles:true}));
  assert.equal($('download').disabled,true);
  $('interpret').click();assert.match($('feedback').textContent,/por interpretar/);assert.equal($('download').disabled,true);
  document.querySelector('[data-example="easy"]').click();assert.equal($('download').disabled,false);
  const duration=document.querySelector('[data-field="durationValue"]');duration.value='8';duration.dispatchEvent(new window.Event('change',{bubbles:true}));
  assert.match(document.querySelector('.step-desc').textContent,/8:00 min/);
  $('download').click();assert.ok(blob);assert.ok(filename.endsWith('.fit'));assert.ok(blob.size>100);
  assert.match($('download-status').textContent,/validado/);
  assert.equal(tools[0].name,'interpret_running_workout');
  const result=tools[0].execute({text:'20 min a 5:00/km',name:'Teste agente'});
  assert.equal(result.blocks,1);assert.equal($('workout-name').value,'Teste agente');
  assert.match(document.querySelector('.step-desc').textContent,/5:00/);
  const before=$('workout-text').value;assert.throws(()=>tools[0].execute({text:42}));assert.equal($('workout-text').value,before);
  URL.createObjectURL=originalURL;
  globalThis.setTimeout=originalTimeout;
  dom.window.close();
});

test('built single-file version opens independently and exports a real FIT file',async()=>{
  const html=await readFile('dist/run-to-fit.html','utf8');let blob=null;
  const dom=new JSDOM(html,{url:'file:///run-to-fit.html',runScripts:'dangerously',beforeParse(win){
    win.TextEncoder=TextEncoder;win.structuredClone=structuredClone;
    win.URL.createObjectURL=value=>{blob=value;return 'blob:test';};win.URL.revokeObjectURL=()=>{};
    win.HTMLAnchorElement.prototype.click=function(){};
  }});
  await new Promise(resolve=>dom.window.addEventListener('load',resolve,{once:true}));
  assert.equal(dom.window.document.getElementById('download').disabled,false);
  dom.window.document.getElementById('download').click();assert.ok(blob);assert.ok(blob.size>100);
  assert.equal(dom.window.document.querySelectorAll('details.step').length,4);
  dom.window.close();
});
