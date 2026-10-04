export const EXAMPLES = {
  intervals: { name: 'Séries · 6 × 400 m', text: '10 min aquecimento fácil\n6 x 400 m a 4:00-4:15/km com 90 s recuperação entre séries\n10 min arrefecimento fácil' },
  tempo: { name: 'Tempo · 3 × 8 min', text: '15 min aquecimento\n3 x 8 min a 4:30-4:45/km com 2 min recuperação entre séries\n10 min arrefecimento' },
  easy: { name: 'Corrida fácil · Z2', text: '5 min aquecimento\n40 min em Z2\n5 min arrefecimento' },
  long: { name: 'Longo progressivo', text: '3 km a 6:00-6:20/km\n5 km a 5:30-5:45/km\n3 km a 5:00-5:15/km\n1 km arrefecimento' },
};
export const INTENSITIES = { warmup: 'Aquecimento', active: 'Corrida', interval: 'Série', recovery: 'Recuperação', rest: 'Descanso', cooldown: 'Arrefecimento' };
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const number = s => Number(String(s).replace(',', '.'));
export function paceSeconds(s) {
  const m = String(s).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m || +m[2] > 59 || +m[1] * 60 + +m[2] < 120 || +m[1] * 60 + +m[2] > 1800) throw new Error('Usa um ritmo entre 2:00 e 30:00 min/km.');
  return +m[1] * 60 + +m[2];
}
export function formatPace(s) { const n = Math.round(s); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; }
export function parseTarget(value) {
  const s = norm(value).replace(/[–—]/g, '-').replace(/(\d+)[′'](\d{2})[″']{1,2}/g, '$1:$2');
  const hits = [];
  const pace = s.match(/\b(\d{1,2}:\d{2})(?:\s*-\s*(\d{1,2}:\d{2}))?\s*(?:min\s*)?(?:\/\s*km|por\s+km)/);
  if (pace) { const a = paceSeconds(pace[1]), b = paceSeconds(pace[2] || pace[1]); hits.push({ kind: 'pace', low: Math.min(a,b), high: Math.max(a,b), match: pace[0] }); }
  const hr = s.match(/\b(\d{2,3})(?:\s*-\s*(\d{2,3}))?\s*bpm\b/);
  if (hr) hits.push({ kind: 'hr', low: Math.min(+hr[1], +(hr[2] || hr[1])), high: Math.max(+hr[1], +(hr[2] || hr[1])), match: hr[0] });
  const zone = s.match(/\b(?:z\s*|zona\s*|zone\s*)([1-5])\b/);
  if (zone) hits.push({ kind: 'zone', value: +zone[1], match: zone[0] });
  const speed = s.match(/\b(\d+(?:[.,]\d+)?)(?:\s*-\s*(\d+(?:[.,]\d+)?))?\s*km\s*\/\s*h\b/);
  if (speed) { const a = number(speed[1]), b = number(speed[2] || speed[1]); if (Math.min(a,b) < 2 || Math.max(a,b) > 30) throw new Error('Velocidade fora do intervalo 2–30 km/h.'); hits.push({ kind: 'pace', low: 3600 / Math.max(a,b), high: 3600 / Math.min(a,b), match: speed[0] }); }
  if (hits.length > 1) throw new Error('Esta etapa tem mais de um objetivo. Escolhe ritmo ou frequência cardíaca.');
  const target = hits[0] || { kind: 'open' };
  if (target.kind === 'hr' && (target.low < 40 || target.high > 240)) throw new Error('A frequência cardíaca deve estar entre 40 e 240 bpm.');
  return { target, remaining: target.match ? s.replace(target.match, '') : s };
}
export function targetLabel(t) {
  if (t.kind === 'pace') return `${formatPace(t.low)}${Math.round(t.high) !== Math.round(t.low) ? '–' + formatPace(t.high) : ''} /km`;
  if (t.kind === 'hr') return `${t.low}${t.low !== t.high ? '–'+t.high : ''} bpm`;
  if (t.kind === 'zone') return `FC · Z${t.value}`;
  return 'Sem objetivo';
}
export function durationLabel(d) {
  if (d.kind === 'open') return 'Até premir LAP';
  if (d.kind === 'distance') return d.value >= 1000 ? `${Number((d.value/1000).toFixed(2))} km` : `${d.value} m`;
  return d.value >= 60 ? `${Math.floor(d.value/60)}:${String(Math.round(d.value%60)).padStart(2,'0')} min` : `${d.value} s`;
}
export function parseStep(text, fallback = 'active') {
  const original = text.trim();
  if (/\b(ski|sled|lunge|wall\s*ball|wbs|emom|amrap|bike|swim|kcal|calorias|watts?|ftp)\b/i.test(norm(original))) throw new Error('Esta etapa não é um treino de corrida suportado.');
  const { target, remaining } = parseTarget(original);
  let s = remaining.replace(/\b\d+\s*(?:reps?|repeticoes|vezes)\b/g, '');
  const intensity = /warm\s*up|aquecimento/.test(s) ? 'warmup' : /cool\s*down|arrefecimento|desaquecimento/.test(s) ? 'cooldown' : /recuper|recovery|recover|jog/.test(s) ? 'recovery' : /descanso|rest|pausa/.test(s) ? 'rest' : fallback;
  const durations = [...s.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(horas?|hours?|hrs?|h|minutos?|minutes?|mins?|min|segundos?|seconds?|secs?|sec|s|km|quilometros?|kilometers?|metros?|meters?|m)\b/g)];
  let duration;
  if (durations.length === 1) {
    const [,v,u] = durations[0], n = number(v);
    duration = /^(km|quilo|kilo)/.test(u) ? { kind:'distance', value:n*1000 } : /^(m|metros?|meters?)$/.test(u) ? { kind:'distance', value:n } : { kind:'time', value:n * (/^(h|hora|hour|hr)/.test(u) ? 3600 : /^(min)/.test(u) ? 60 : 1) };
    s = s.replace(durations[0][0], '');
  } else if (durations.length === 2 && /^(h|hora|hour|hr)/.test(durations[0][2]) && /^min/.test(durations[1][2])) {
    duration = { kind:'time', value: number(durations[0][1])*3600 + number(durations[1][1])*60 };
    durations.forEach(m => { s = s.replace(m[0], ''); });
  } else if (durations.length > 1) throw new Error('Há várias durações nesta etapa. Separa cada etapa numa linha.');
  if (!duration) {
    const short = s.match(/\b(\d+)\s*[′']/);
    const clock = s.match(/\b(\d{1,2}):(\d{2})\b/);
    if (short) { duration = { kind:'time', value:+short[1]*60 }; s = s.replace(short[0], ''); }
    else if (clock && +clock[2] < 60) { duration = { kind:'time', value:+clock[1]*60 + +clock[2] }; s = s.replace(clock[0], ''); }
    else if (/\b(lap|aberto|open|manual|livre sem duracao)\b/.test(s)) duration = {kind:'open',value:0};
    else throw new Error('Falta uma duração. Escreve, por exemplo, «10 min», «400 m» ou «até LAP».');
  }
  if (/\d/.test(s)) throw new Error('Há números por interpretar nesta etapa. Usa unidades explícitas e ritmo no formato 4:30/km.');
  if (duration.kind !== 'open' && (duration.value <= 0 || duration.value > (duration.kind === 'time' ? 86400 : 200000))) throw new Error('A duração deve ser positiva e inferior a 24 h ou 200 km.');
  const step = { type:'step', intensity, name:INTENSITIES[intensity], duration, target: { ...target }, notes:original };
  delete step.target.match;
  return step;
}
function splitTop(text) {
  const result = []; let level = 0, start = 0;
  for (let i=0; i<text.length; i++) {
    if (text[i] === '(') level++;
    if (text[i] === ')') { level--; if (level < 0) throw new Error('Parênteses sem abertura.'); }
    if (level === 0 && /[\n;+]/.test(text[i])) { result.push(text.slice(start,i)); start=i+1; }
  }
  if (level !== 0) throw new Error('Fecha os parênteses do bloco de repetições.');
  result.push(text.slice(start)); return result.map(s=>s.trim()).filter(Boolean);
}
function parseBlock(text) {
  text = text.replace(/^(?:[-•*]\s*|\d+[.)]\s*)/, '').trim();
  const rep = text.match(/^(?:(?:repetir|repeat)\s+)?(\d{1,3})\s*(?:[x×]|vezes|times)\s*:?\s*(.+)$/is);
  if (!rep) return parseStep(text);
  const count = +rep[1]; if (count < 2 || count > 99) throw new Error('Usa entre 2 e 99 repetições.');
  let body = rep[2].trim(), steps, includeLastRecovery = true;
  if (body.startsWith('(') && body.endsWith(')')) {
    body = body.slice(1,-1);
    steps = splitTop(body).map(s=>parseStep(s,'interval'));
  } else {
    const separator = body.match(/\s+(?:com|with|c\/|rec\.?\s*:|recuperacao\s*:|recovery\s*:)\s*/i);
    if (separator) {
      const idx = separator.index;
      const work = body.slice(0,idx), rest = body.slice(idx+separator[0].length).replace(/\b(?:entre\s+(?:series|repeticoes)|between\s+(?:reps|sets)|apenas\s+entre\s+series)\b/gi, '');
      steps = [parseStep(work,'interval'),parseStep(`${rest} recuperação`,'recovery')];
      includeLastRecovery = /apos a ultima|after (?:the )?last/i.test(norm(body));
    } else steps = [parseStep(body,'interval')];
  }
  if (!steps.length || steps.length > 10) throw new Error('O bloco deve ter entre 1 e 10 etapas.');
  return { type:'repeat', count, steps, includeLastRecovery };
}
export function parseWorkout(input) {
  if (typeof input !== 'string' || !input.trim()) return { blocks:[], errors:[{ text:'', message:'Cola ou escreve um treino para começar.' }], warnings:[] };
  if (input.length > 12000) return { blocks:[], errors:[{text:'',message:'O texto é demasiado longo (máximo 12 000 caracteres).'}], warnings:[] };
  const clean = input.replace(/\r/g,'').replace(/[–—]/g,'-').replace(/\s+(?:e\s+)?depois\s+|\s+seguido\s+de\s+|\s+then\s+/gi,'\n').replace(/,\s*(?=\d+\s*(?:[x×]|min|km|m\b|s\b))/gi,'\n').replace(/\s+e\s+(?=\d+\s*(?:min|km|m\b))/gi,'\n');
  let parts; try { parts = splitTop(clean); } catch(e) { return {blocks:[],errors:[{text:'',message:e.message}],warnings:[]}; }
  const blocks = [], errors = [];
  for (const part of parts) { try { blocks.push(parseBlock(part)); } catch(e) { errors.push({text:part,message:e.message}); } }
  const warnings = [];
  const steps = blocks.flatMap(b=>b.type==='repeat'?b.steps:[b]);
  if (steps.some(s=>s.target.kind==='zone')) warnings.push('Z1–Z5 usam as zonas de frequência cardíaca configuradas no relógio.');
  if (steps.some(s=>s.target.kind==='open' && /facil|easy|forte|hard|tempo|rapido|rpe|limiar|threshold/i.test(norm(s.notes)))) warnings.push('Intensidades como «fácil» ou «forte» ficam nas notas; não foi inventado um ritmo ou uma zona.');
  if (blocks.some(b=>b.type==='repeat' && !b.includeLastRecovery)) warnings.push('A recuperação foi colocada entre as séries, sem recuperação após a última. Podes alterar esta opção no bloco.');
  if (parts.length > 50) errors.push({text:'',message:'Máximo de 50 blocos por treino.'});
  return {blocks,errors,warnings};
}
export function expandWorkout(blocks) {
  return blocks.flatMap(b => {
    if (b.type === 'step') return [b];
    return Array.from({length:b.count},(_,i)=>b.steps.filter((s,j)=>b.includeLastRecovery || i!==b.count-1 || j!==b.steps.length-1 || !['recovery','rest'].includes(s.intensity))).flat();
  });
}
export function summarize(blocks) {
  const steps = expandWorkout(blocks);
  let seconds = 0, meters = 0, unknownTime = false, unknownDistance = false;
  for (const s of steps) {
    const pace = s.target.kind==='pace' ? (s.target.low+s.target.high)/2 : null;
    if (s.duration.kind === 'time') { seconds += s.duration.value; if (pace) meters += s.duration.value/pace*1000; else unknownDistance=true; }
    else if (s.duration.kind === 'distance') { meters += s.duration.value; if (pace) seconds += s.duration.value/1000*pace; else unknownTime=true; }
    else { unknownTime=true; unknownDistance=true; }
  }
  return { seconds, meters, unknownTime, unknownDistance, steps:steps.length, estimated:steps.some(s=>s.target.kind==='pace') };
}
export function validateWorkout(blocks) {
  if (!Array.isArray(blocks) || !blocks.length || blocks.length > 50) throw new Error('O treino deve ter entre 1 e 50 blocos.');
  for (const b of blocks) {
    if (!['repeat','step'].includes(b.type)) throw new Error('Bloco inválido.');
    if (b.type==='repeat' && (!Number.isInteger(b.count) || b.count<2 || b.count>99 || !b.steps?.length || b.steps.length>10 || b.steps.some(s=>s.type!=='step'))) throw new Error('Bloco de repetições inválido.');
    for (const s of b.type==='repeat'?b.steps:[b]) {
      if (!INTENSITIES[s.intensity] || !String(s.name).trim()) throw new Error('Define o nome e o tipo de cada etapa.');
      if (!['time','distance','open'].includes(s.duration.kind) || !Number.isFinite(s.duration.value) || (s.duration.kind!=='open' && (s.duration.value<=0 || s.duration.value>(s.duration.kind==='time'?86400:200000)))) throw new Error('Duração inválida numa etapa.');
      const t=s.target;
      if (!['open','pace','hr','zone'].includes(t.kind)) throw new Error('Objetivo inválido.');
      if (t.kind==='zone' && (!Number.isInteger(t.value)||t.value<1||t.value>5)) throw new Error('Escolhe uma zona entre 1 e 5.');
      if (['pace','hr'].includes(t.kind) && (!Number.isFinite(t.low)||!Number.isFinite(t.high)||t.low>t.high||t.low<(t.kind==='pace'?120:40)||t.high>(t.kind==='pace'?1800:240))) throw new Error('Objetivo fora dos limites ou intervalo invertido.');
    }
  }
}
