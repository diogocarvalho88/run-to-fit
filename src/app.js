import { EXAMPLES, INTENSITIES, parseWorkout, parseTarget, expandWorkout, summarize, validateWorkout, durationLabel, targetLabel, formatPace, paceSeconds } from './workout.js';
import { encodeWorkout } from './fit.js';

const $ = id => document.getElementById(id);
const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state={blocks:[],errors:[],warnings:[]}, dirty=false;
const option = (v,label,current) => `<option value="${v}"${v===current?' selected':''}>${label}</option>`;
function getStep(b,s) { return s===null?state.blocks[b]:state.blocks[b].steps[s]; }
function canExport() {
  if(dirty || state.errors.length) return false;
  try { validateWorkout(state.blocks); return true; } catch { return false; }
}
function syncButton() { $('download').disabled=!canExport(); }
function renderStep(s,b,j=null,index='') {
  const loc=`data-b="${b}"${j===null?'':` data-s="${j}"`}`, t=s.target;
  const targetValue=t.kind==='pace'?`${formatPace(t.low)}${t.low===t.high?'':'-'+formatPace(t.high)}/km`:t.kind==='hr'?`${t.low}${t.low===t.high?'':'-'+t.high} bpm`:'';
  return `<details class="step ${escape(s.intensity)}" ${loc}><summary><span class="step-stripe"></span><span class="step-index">${escape(index)}</span><span class="step-text"><span class="step-title">${escape(s.name)}</span><span class="step-desc">${escape(durationLabel(s.duration))} · ${escape(targetLabel(t))}</span></span></summary><div class="step-editor">
    <label>Tipo<select data-field="intensity">${Object.entries(INTENSITIES).map(([v,n])=>option(v,n,s.intensity)).join('')}</select></label>
    <label>Nome<input data-field="name" value="${escape(s.name)}" maxlength="32" required></label>
    <label>Duração<select data-field="durationKind">${[['time','Tempo (min)'],['distance','Distância (m)'],['open','Até premir LAP']].map(([v,n])=>option(v,n,s.duration.kind)).join('')}</select></label>
    <label>Valor${s.duration.kind==='open'?'<input value="Manual · botão LAP" disabled>':`<input data-field="durationValue" type="number" min="0.01" max="${s.duration.kind==='time'?1440:200000}" step="any" value="${s.duration.kind==='time'?Number((s.duration.value/60).toFixed(4)):s.duration.value}" required>`}</label>
    <label>Objetivo<select data-field="targetKind">${[['open','Sem objetivo'],['pace','Ritmo (min/km)'],['hr','FC (bpm)'],['zone','Zona de FC']].map(([v,n])=>option(v,n,t.kind)).join('')}</select></label>
    ${t.kind==='zone'?`<label>Zona<select data-field="targetZone">${[1,2,3,4,5].map(v=>option(String(v),'Z'+v,String(t.value))).join('')}</select></label>`:t.kind==='open'?'<div></div>':`<label>${t.kind==='pace'?'Ritmo ou intervalo':'Bpm ou intervalo'}<input data-field="targetRange" value="${escape(targetValue)}" placeholder="${t.kind==='pace'?'4:30-4:45/km':'140-155 bpm'}" required></label>`}
    <button class="remove-step wide" type="button" data-action="remove-step">Remover etapa</button>
    </div></details>`;
}
function render() {
  const openKeys=[...$('steps').querySelectorAll('details[open]')].map(e=>`${e.dataset.b}:${e.dataset.s??''}`);
  $('steps').innerHTML=state.blocks.length?state.blocks.map((b,i)=>{
    if(b.type==='step')return renderStep(b,i,null,String(i+1).padStart(2,'0'));
    return `<div class="repeat-block" data-b="${i}"><div class="repeat-heading"><span aria-hidden="true">↻</span><input type="number" min="2" max="99" step="1" value="${b.count}" data-action="repeat-count" aria-label="Número de repetições no bloco ${i+1}"><span>repetições</span><button type="button" data-action="remove-block" aria-label="Remover bloco ${i+1}">Remover</button></div>${b.steps.map((s,j)=>renderStep(s,i,j,String.fromCharCode(65+j))).join('')}${['rest','recovery'].includes(b.steps.at(-1).intensity)?`<label class="last-recovery"><input type="checkbox" data-action="last-recovery" ${b.includeLastRecovery?'checked':''}>Recuperação após a última repetição</label>`:''}</div>`;
  }).join(''):'<div class="empty-state">As etapas do teu treino vão aparecer aqui.</div>';
  $('steps').querySelectorAll('details').forEach(e=>{if(openKeys.includes(`${e.dataset.b}:${e.dataset.s??''}`))e.open=true;});
  renderSummary();
  $('feedback').innerHTML=state.errors.length?`<div class="feedback error"><strong>Há partes do treino por interpretar.</strong><p>Corrige o texto e volta a interpretar. A descarga está bloqueada para evitar um treino incompleto.</p><ul>${state.errors.map(e=>`<li>${e.text?`<strong>${escape(e.text)}</strong><br>`:''}${escape(e.message)}</li>`).join('')}</ul></div>`:state.warnings.length?`<div class="feedback"><ul>${state.warnings.map(w=>`<li>${escape(w)}</li>`).join('')}</ul></div>`:'';
  syncButton();
}
function renderSummary() {
  const s=summarize(state.blocks);
  const time=s.seconds ? `${s.unknownTime?'≥ ':s.estimated?'≈ ':''}${Math.floor(s.seconds/60)}:${String(Math.round(s.seconds%60)).padStart(2,'0')}`:'—';
  const distance=s.meters?`${s.unknownDistance?'≥ ':s.estimated?'≈ ':''}${(s.meters/1000).toLocaleString('pt-PT',{maximumFractionDigits:2})}`:'—';
  $('summary').innerHTML=`<div class="stat"><dt>DURAÇÃO</dt><dd>${time}</dd><small>${s.unknownTime?'Parcial · há etapas sem ritmo':'minutos'}</small></div><div class="stat"><dt>DISTÂNCIA</dt><dd>${distance}<span style="font-size:14px;letter-spacing:0">${s.meters?' km':''}</span></dd><small>${s.unknownDistance?'Parcial · há etapas sem ritmo':s.estimated?'Estimativa pelo ritmo':'distância definida'}</small></div><div class="stat"><dt>ETAPAS</dt><dd>${s.steps}</dd><small>inclui repetições</small></div>`;
  const steps=expandWorkout(state.blocks);
  $('profile').innerHTML=steps.slice(0,250).map((s,i)=>`<span class="${s.intensity}" style="flex-grow:${Math.max(.25,s.duration.kind==='time'?s.duration.value/60:s.duration.kind==='distance'?s.duration.value/250:1)}" title="${escape(`${i+1}. ${s.name}: ${durationLabel(s.duration)}, ${targetLabel(s.target)}`)}"></span>`).join('');
  $('profile').setAttribute('aria-label',steps.map(s=>`${s.name}, ${durationLabel(s.duration)}`).join('; '));
  $('export-note').textContent=dirty?'O texto mudou. Volta a interpretar.':state.errors.length?'Corrige as partes por interpretar.':'Treino estruturado · .fit';
}
function interpret() {
  state=parseWorkout($('workout-text').value);dirty=false;
  $('edit-error').textContent='';$('download-status').textContent='';$('review-state').textContent=state.errors.length?'Rever texto':'Interpretado';
  render(); return {blocks:state.blocks.length,errors:state.errors,warnings:state.warnings};
}
function download() {
  if(!canExport())return;
  try {
    const bytes=encodeWorkout(state.blocks,$('workout-name').value),url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));
    const link=document.createElement('a'); link.href=url;link.download=($('workout-name').value.trim()||'treino-corrida').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w\s-]/g,'').replace(/\s+/g,'-').toLowerCase()+'.fit';
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    $('download-status').className='success';$('download-status').textContent='Ficheiro FIT validado e pronto. Copia-o para GARMIN/NewFiles no relógio.';
  } catch(e) { $('edit-error').textContent=e.message; }
}
$('interpret').addEventListener('click',interpret);
$('download').addEventListener('click',download);
$('workout-text').addEventListener('input',()=>{dirty=true;$('character-count').textContent=`${$('workout-text').value.length.toLocaleString('pt-PT')} / 12 000`;$('review-state').textContent='Texto alterado';$('export-note').textContent='O texto mudou. Volta a interpretar.';syncButton();});
$('workout-name').addEventListener('input',()=>{$('download-status').textContent='';});
document.querySelectorAll('[data-example]').forEach(btn=>btn.addEventListener('click',()=>{const ex=EXAMPLES[btn.dataset.example];$('workout-text').value=ex.text;$('workout-name').value=ex.name;interpret();$('character-count').textContent=`${ex.text.length} / 12 000`;}));
$('steps').addEventListener('change',e=>{
  const el=e.target,container=el.closest('[data-b]'); if(!container)return;
  const b=+container.dataset.b,j=container.dataset.s===undefined?null:+container.dataset.s;
  const old=structuredClone(state.blocks);
  try {
    if(el.dataset.action==='repeat-count')state.blocks[b].count=Number(el.value);
    else if(el.dataset.action==='last-recovery')state.blocks[b].includeLastRecovery=el.checked;
    else if(el.dataset.field) {
      const s=getStep(b,j),field=el.dataset.field;
      if(field==='name'){if(!el.value.trim())throw new Error('Dá um nome à etapa.');s.name=el.value.trim();}
      if(field==='intensity'){s.intensity=el.value;s.name=INTENSITIES[el.value];}
      if(field==='durationKind')s.duration={kind:el.value,value:el.value==='time'?300:el.value==='distance'?1000:0};
      if(field==='durationValue')s.duration.value=Number(el.value)*(s.duration.kind==='time'?60:1);
      if(field==='targetKind')s.target=el.value==='pace'?{kind:'pace',low:300,high:315}:el.value==='hr'?{kind:'hr',low:140,high:155}:el.value==='zone'?{kind:'zone',value:2}:{kind:'open'};
      if(field==='targetZone')s.target.value=Number(el.value);
      if(field==='targetRange') {
        let v=el.value.trim();if(s.target.kind==='pace'&&!/\/km\s*$/.test(v))v+='/km';if(s.target.kind==='hr'&&!/bpm\s*$/.test(v))v+=' bpm';
        const parsed=parseTarget(v);if(parsed.target.kind!==s.target.kind||parsed.remaining.trim())throw new Error('Usa um valor ou intervalo válido, por exemplo 4:30-4:45/km ou 140-155 bpm.');s.target=parsed.target;delete s.target.match;
      }
      s.notes=`${s.name}: ${durationLabel(s.duration)}; ${targetLabel(s.target)}`;
    }
    validateWorkout(state.blocks);$('edit-error').textContent='';$('download-status').textContent='';$('review-state').textContent='Ajustado';render();
  } catch(err){state.blocks=old;$('edit-error').textContent=err.message;syncButton();el.setAttribute('aria-invalid','true');$('download').disabled=true;}
});
$('steps').addEventListener('click',e=>{
  const el=e.target.closest('button[data-action]');if(!el)return;const c=el.closest('[data-b]'),b=+c.dataset.b;
  if(el.dataset.action==='remove-block')state.blocks.splice(b,1);
  else if(el.dataset.action==='remove-step'){if(c.dataset.s!==undefined){state.blocks[b].steps.splice(+c.dataset.s,1);if(!state.blocks[b].steps.length)state.blocks.splice(b,1);}else state.blocks.splice(b,1);}
  $('edit-error').textContent='';$('download-status').textContent='';render();
});
$('add-step').addEventListener('click',()=>{if(state.blocks.length>=50){$('edit-error').textContent='Máximo de 50 blocos por treino.';return;}state.blocks.push({type:'step',name:'Corrida',intensity:'active',duration:{kind:'time',value:300},target:{kind:'open'},notes:'Corrida'});render();$('steps').lastElementChild.open=true;});
$('workout-text').value=EXAMPLES.intervals.text;
interpret();$('review-state').textContent='Exemplo';$('character-count').textContent=`${EXAMPLES.intervals.text.length} / 12 000`;

// Progressive enhancement: the same local action is available to agents only
// where the browser implements the proposed WebMCP interface.
const context=document.modelContext;
if(context?.registerTool) {
  const lifecycle=new AbortController();
  try {Promise.resolve(context.registerTool({name:'interpret_running_workout',title:'Interpretar treino de corrida',description:'Replace the workout text and interpret it into visible running steps. Does not download a file.',inputSchema:{type:'object',properties:{text:{type:'string',maxLength:12000},name:{type:'string',maxLength:32}},required:['text'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(input){if(!input||typeof input.text!=='string'||input.text.length>12000||Object.keys(input).some(k=>!['text','name'].includes(k))||('name'in input&&typeof input.name!=='string'))throw new Error('Invalid workout input');$('workout-text').value=input.text;if(input.name)$('workout-name').value=input.name.slice(0,32);$('character-count').textContent=`${input.text.length} / 12 000`;return interpret();}},{signal:lifecycle.signal})).catch(()=>{});}catch{}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
