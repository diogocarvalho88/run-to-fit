import test from 'node:test';
import assert from 'node:assert/strict';
import { Decoder, Stream } from '@garmin/fitsdk';
import { EXAMPLES, parseWorkout, parseStep, summarize, expandWorkout, validateWorkout } from '../src/workout.js';
import { encodeWorkout, workoutMessages } from '../src/fit.js';

function parse(text) { const p=parseWorkout(text);assert.deepEqual(p.errors,[],JSON.stringify(p.errors));return p.blocks; }
function decode(blocks,name='Teste') {
  const bytes=encodeWorkout(blocks,name),decoder=new Decoder(Stream.fromByteArray(bytes));
  assert.equal(decoder.isFIT(),true);assert.equal(decoder.checkIntegrity(),true);
  const result=decoder.read();assert.deepEqual(result.errors,[]);return result.messages;
}
test('all supplied workouts produce independently decodable running FIT workouts',()=>{
  for(const ex of Object.values(EXAMPLES)){
    const blocks=parse(ex.text),messages=decode(blocks,ex.name);
    assert.equal(messages.fileIdMesgs[0].type,'workout');
    assert.equal(messages.workoutMesgs[0].sport,'running');
    assert.equal(messages.workoutMesgs[0].numValidSteps,messages.workoutStepMesgs.length);
    messages.workoutStepMesgs.forEach((s,i)=>assert.equal(s.messageIndex,i));
  }
});
test('time and distance scales and pace-to-speed bounds match the FIT profile',()=>{
  const messages=decode(parse('10 min aquecimento\n400 m a 4:00-4:15/km')).workoutStepMesgs;
  assert.equal(messages[0].durationTime,600);assert.equal(messages[1].durationDistance,400);
  assert.equal(messages[1].targetType,'speed');assert.equal(messages[1].targetSpeedZone,0);
  assert.ok(Math.abs(messages[1].customTargetSpeedLow-1000/255)<.001);
  assert.ok(Math.abs(messages[1].customTargetSpeedHigh-1000/240)<.001);
});
test('absolute heart rate and configured HR zones encode differently',()=>{
  const steps=decode(parse('20 min a 140-155 bpm\n10 min em Z2')).workoutStepMesgs;
  assert.equal(steps[0].customTargetHeartRateLow,240);assert.equal(steps[0].customTargetHeartRateHigh,255);
  assert.equal(steps[0].targetHrZone,0);assert.equal(steps[1].targetHrZone,2);
});
test('recovery between sets yields exactly six efforts and five recoveries',()=>{
  const blocks=parse('10 min warmup\n6 x 400 m @ 4:00/km with 90 s recovery\n10 min cooldown');
  const expanded=expandWorkout(blocks);assert.equal(expanded.filter(s=>s.intensity==='interval').length,6);
  assert.equal(expanded.filter(s=>s.intensity==='recovery').length,5);
  const steps=decode(blocks).workoutStepMesgs,repeat=steps.find(s=>s.durationType==='repeatUntilStepsCmplt');
  assert.equal(repeat.durationStep,1);assert.equal(repeat.repeatSteps,5);
  assert.equal(steps.at(-2).intensity,'interval');
});
test('parenthesized repeats include all recoveries and the repeat points to the block start',()=>{
  const blocks=parse('5 min warmup\n4 x (3 min @ 4:30/km + 2 min recovery)\n5 min cooldown');
  assert.equal(expandWorkout(blocks).filter(s=>s.intensity==='recovery').length,4);
  const repeat=decode(blocks).workoutStepMesgs.find(s=>s.durationType==='repeatUntilStepsCmplt');
  assert.equal(repeat.durationStep,1);assert.equal(repeat.repeatSteps,4);
});
test('two repetitions with between-set recovery have no invalid repeat step',()=>{
  const steps=decode(parse('2 x 1 km a 5:00/km com 60 s recuperação')).workoutStepMesgs;
  assert.equal(steps.length,3);assert.equal(steps.filter(s=>s.durationType==='repeatUntilStepsCmplt').length,0);
});
test('manual LAP and qualitative intensity keep open duration and target',()=>{
  const steps=decode(parse('Aquecimento até LAP\n20 min fácil')).workoutStepMesgs;
  assert.equal(steps[0].durationType,'open');assert.equal(steps[1].targetType,'open');
  assert.match(steps[1].notes,/fácil/);
});
test('Portuguese and English units, decimals, clock durations and speed',()=>{
  assert.equal(parseStep('1,5 km fácil').duration.value,1500);
  assert.equal(parseStep('300 metros recuperação').duration.kind,'distance');
  assert.equal(parseStep('300 meters recovery').duration.value,300);
  assert.equal(parseStep('1 h 30 min corrida').duration.value,5400);
  assert.equal(parseStep("10' aquecimento").duration.value,600);
  assert.equal(parseStep('01:30 recuperação').duration.value,90);
  assert.equal(parseStep('20 min a 12 km/h').target.low,300);
  assert.equal(parseStep("1 km a 4'30''/km").target.low,270);
});
test('paragraphs preserve all comma-separated steps',()=>{
  const blocks=parse('10 min aquecimento, 6x400m a 4:00/km com 90 s recuperação, 10 min arrefecimento');
  assert.equal(blocks.length,3);
});
test('unrecognized lines, ambiguous numbers and incompatible instructions are blocked',()=>{
  for(const text of ['10 min aquecimento\nbanana\n5 min arrefecimento','400 m a 4:30','10 min ou 5 km','6 x 400 m com 90 s recuperação em 4 séries','20 min a 140 bpm em Z2','20 min a 4:99/km','10 min em Z6','5 min a 80% FCmax','15 kcal ski','0 min corrida','4 x (3 min + 1 min','2 x (3 min + 2 x (1 min + 1 min))']){
    assert.ok(parseWorkout(text).errors.length,text);
  }
});
test('partial totals do not assume a pace for easy runs',()=>{
  const s=summarize(parse('10 min aquecimento\n1 km a 5:00/km'));
  assert.equal(s.seconds,900);assert.equal(s.meters,1000);assert.equal(s.unknownDistance,true);assert.equal(s.unknownTime,false);
});
test('exports have independent identities and preserve UTF-8 names',()=>{
  const blocks=parse('5 min aquecimento');const a=decode(blocks,'Séries · rápido'),b=decode(blocks);
  assert.notEqual(a.fileIdMesgs[0].serialNumber,b.fileIdMesgs[0].serialNumber);
  assert.equal(a.workoutMesgs[0].wktName,'Séries · rápido');
});
test('edited invalid values and files exceeding the step cap are rejected',()=>{
  const blocks=parse('10 min corrida');blocks[0].duration.value=-1;
  assert.throws(()=>encodeWorkout(blocks));
  const long=parse(Array.from({length:26},()=> '2 x (1 min forte + 1 min recuperação)').join('\n'));
  assert.throws(()=>workoutMessages(long),/50 etapas/);
});
test('FIT repeat execution equals the visible expanded workout',()=>{
  for(const text of ['3 x 400 m com 90 s recuperação','3 x (400 m + 90 s recuperação)','2 x 400 m com 90 s recuperação','3 x (2 min + 3 min + 1 min descanso)']){
    const blocks=parse(text),steps=decode(blocks).workoutStepMesgs,result=[];
    for(let i=0;i<steps.length;i++){
      const s=steps[i];if(s.durationType==='repeatUntilStepsCmplt'){for(let round=1;round<s.repeatSteps;round++)result.push(...steps.slice(s.durationStep,i));}else result.push(s);
    }
    const visible=expandWorkout(blocks);
    assert.equal(result.length,visible.length);
    result.forEach((s,i)=>assert.equal(s.durationType==='time'?s.durationTime:s.durationDistance,visible[i].duration.value));
  }
});
