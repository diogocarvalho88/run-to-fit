import { validateWorkout } from './workout.js';

// Small implementation of the published FIT protocol. The Garmin SDK is used
// only in development tests as an independent decoder, not shipped to visitors.
const DURATION={time:0,distance:1,open:5,repeatUntilStepsCmplt:6};
const TARGET={speed:0,heartRate:1,open:2};
const INTENSITY={active:0,rest:1,warmup:2,cooldown:3,recovery:4,interval:5};
export function crc16(bytes) {
  let crc=0;
  for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc&1)?(crc>>>1)^0xa001:crc>>>1;}
  return crc;
}
function textBytes(value,max=32) {
  const encoder=new TextEncoder();let s=String(value);
  while(encoder.encode(s).length>=max)s=[...s].slice(0,-1).join('');
  return [...encoder.encode(s),0];
}
class FitWriter {
  bytes=[];
  u8(value){this.bytes.push(value&255);}
  u16(value){this.u8(value);this.u8(value>>>8);}
  u32(value){this.u16(value);this.u16(value>>>16);}
  message(global,local,fields){
    this.u8(0x40|local);this.u8(0);this.u8(0);this.u16(global);this.u8(fields.length);
    for(const [num,type,value] of fields){this.u8(num);this.u8(type===7?value.length:type===0?1:type===0x84?2:4);this.u8(type);}
    this.u8(local);
    for(const [,type,value] of fields){if(type===7)this.bytes.push(...value);else if(type===0)this.u8(value);else if(type===0x84)this.u16(value);else this.u32(value);}
  }
  close(){
    const header=new Uint8Array(14),view=new DataView(header.buffer);
    header[0]=14;header[1]=0x10;view.setUint16(2,2100,true);view.setUint32(4,this.bytes.length,true);header.set([46,70,73,84],8);view.setUint16(12,crc16(header.subarray(0,12)),true);
    const result=new Uint8Array(14+this.bytes.length+2);result.set(header);result.set(this.bytes,14);new DataView(result.buffer).setUint16(result.length-2,crc16(result.subarray(0,-2)),true);
    return result;
  }
}

function stepMessage(s,index) {
  const m = {messageIndex:index,wktStepName:s.name.slice(0,32),notes:(s.notes||'').slice(0,200),durationType:s.duration.kind,durationValue:s.duration.kind==='time'?Math.round(s.duration.value*1000):s.duration.kind==='distance'?Math.round(s.duration.value*100):0,targetType:'open',targetValue:0,intensity:s.intensity};
  const t = s.target;
  // Dynamic fields use raw values: ms, centimetres, mm/s and absolute
  // bpm + 100, as specified by the published FIT workout profile.
  if (t.kind==='pace') { m.targetType='speed'; m.customTargetValueLow=Math.round(1000*1000/t.high); m.customTargetValueHigh=Math.round(1000*1000/t.low); }
  if (t.kind==='hr') { m.targetType='heartRate'; m.customTargetValueLow=t.low+100; m.customTargetValueHigh=t.high+100; }
  if (t.kind==='zone') { m.targetType='heartRate'; m.targetValue=t.value; }
  return m;
}
export function workoutMessages(blocks) {
  validateWorkout(blocks);
  const messages=[];
  const append=s=>messages.push(stepMessage(s,messages.length));
  for (const b of blocks) {
    if (b.type==='step') { append(b); continue; }
    const last=b.steps.at(-1), omit=!b.includeLastRecovery && ['rest','recovery'].includes(last.intensity);
    const count=b.count-(omit?1:0), start=messages.length;
    b.steps.forEach(append);
    if (count>1) messages.push({messageIndex:messages.length,wktStepName:`Repetir ${count}x`,durationType:'repeatUntilStepsCmplt',durationValue:start,targetType:'open',targetValue:count});
    if (omit) b.steps.slice(0,-1).forEach(append);
  }
  if (messages.length>50) throw new Error('Este treino excede 50 etapas FIT. Reduz o número de blocos para melhorar a compatibilidade.');
  return messages;
}
export function encodeWorkout(blocks,name='Treino de corrida',options={}) {
  const messages=workoutMessages(blocks),writer=new FitWriter();
  const random = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(random); else random[0]=Math.floor(Math.random()*0xfffffffe)+1;
  // Unique identity avoids replacing other imported workouts on the device.
  const serial=options.serialNumber || (random[0]===0?1:random[0]===0xffffffff?0xfffffffe:random[0]);
  const timestamp=Math.floor(((options.date || new Date()).getTime()-631065600000)/1000);
  writer.message(0,0,[[0,0,5],[1,0x84,255],[2,0x84,1],[3,0x8c,serial],[4,0x86,timestamp]]);
  writer.message(26,1,[[4,0,1],[6,0x84,messages.length],[8,7,textBytes(String(name).trim()||'Treino de corrida')],[11,0,0]]);
  messages.forEach(m=>writer.message(27,2,[[254,0x84,m.messageIndex],[0,7,textBytes(m.wktStepName)],[1,0,DURATION[m.durationType]],[2,0x86,m.durationValue],[3,0,TARGET[m.targetType]],[4,0x86,m.targetValue],[5,0x86,m.customTargetValueLow||0],[6,0x86,m.customTargetValueHigh||0],...(m.intensity!==undefined?[[7,0,INTENSITY[m.intensity]]]:[]),...(m.notes?[[8,7,textBytes(m.notes,201)]]:[])]));
  const bytes=writer.close();
  if (crc16(bytes)!==0) throw new Error('Não foi possível validar a integridade do ficheiro FIT.');
  return bytes;
}
