'use strict';
// Run with: node tests/planner.test.js   (no dependencies)
const assert=require('node:assert/strict');
const P=require('../planner.js');
const H=3600000,DAY=24*H,MIN=60000;
let passed=0;
const test=(name,fn)=>{try{fn();passed++}catch(e){console.error(`FAIL: ${name}\n${e.stack}`);process.exitCode=1}};

const S=Date.UTC(2026,9,5,8,0);                    // plan start used throughout
const reg=(o={})=>({id:'m',name:'Med',strength:null,unit:'mg',units:1,max:null,maxTotal:null,mode:'regular',hours:null,perDay:null,notes:'',...o});
const log=(...e)=>e.map(x=>({id:Math.random().toString(),medId:'m',...x}));
const sched=(m,l=[],days=7)=>P.schedule(m,l,S,S+days*DAY);
const times=(m,l,days)=>sched(m,l,days).map(x=>x.t);
const hh=t=>new Date(t).toISOString().slice(11,16);
// Largest number of doses inside any single rolling 24 h window (t-24h, t].
const worst=ts=>{const a=[...ts].sort((p,q)=>p-q);let w=0;for(const e of a)w=Math.max(w,a.filter(x=>x>e-DAY&&x<=e).length);return w};

// ---------- limit maths ----------
test('limit: whole-number maths where float division was wrong (3 x 0.1 units, max total 3 => 10 doses)',()=>{
 assert.equal(P.cap({strength:3,units:0.1,maxTotal:3}),10);
});
test('limit: lower of max doses and max total / dose',()=>{
 assert.equal(P.cap({strength:500,units:2,maxTotal:4000,max:6}),4);
 assert.equal(P.cap({strength:500,units:2,maxTotal:4000,max:3}),3);
 assert.equal(P.cap({strength:500,units:1,maxTotal:1100}),2);          // 2 x 500 = 1000 <= 1100, 3 x 500 would exceed
 assert.equal(P.cap({}),Infinity);
});
test('limit: decimal strengths are exact (1.25 mg x 1.2, max 6 mg => 4 doses)',()=>{
 assert.equal(P.cap({strength:1.25,units:1.2,maxTotal:6}),4);
 assert.equal(P.cap({strength:62.5,units:1,maxTotal:250}),4);
});
test('limit: sweep of ~360k strength/units/max-total combinations equals exact integer maths',()=>{
 // Whole strengths 1..300, units 0.1..5.0, max totals just below / at / just above multiples of one dose.
 // (The original floating-point version was wrong for 12,710 of the ~1.5M combinations in a wider sweep.)
 for(let s=1;s<=300;s++)for(let u=1;u<=50;u++)for(const mult of[2,3,4,5,7,8,10,12]){
  const b=Math.max(1,Math.round(s*u*mult/10));
  for(const mt of[b-1,b,b+1]){
   if(mt<1)continue;
   assert.equal(P.cap({strength:s,units:u/10,maxTotal:mt}),Math.floor(mt*10/(s*u)),`${s} x ${u/10}, max ${mt}`);
  }
 }
 // Two-decimal strengths and totals (scaled by 100).
 for(let s=5;s<=2000;s+=7)for(let u=1;u<=20;u+=3)for(const mt of[100,250,625,1000,5000]){
  assert.equal(P.cap({strength:s/100,units:u/10,maxTotal:mt/100}),Math.floor(mt*10/(s*u)),`${s/100} x ${u/10}, max ${mt/100}`);
 }
});

// ---------- frequency fields ----------
test('only hours: doses are H apart',()=>{
 const t=times(reg({hours:5}),[],2);
 assert.deepEqual(t.slice(0,4).map(hh),['08:00','13:00','18:00','23:00']);
 for(let i=1;i<t.length;i++)assert.equal(t[i]-t[i-1],5*H);
});
test('only doses over 24 h: 24 / N apart',()=>{
 assert.deepEqual(times(reg({perDay:3}),[],1).map(hh),['08:00','16:00','00:00']);
 assert.deepEqual(times(reg({perDay:2}),[],1).map(hh),['08:00','20:00']);
 assert.deepEqual(times(reg({perDay:1}),[],2).map(hh),['08:00','08:00']);
});
test('both fields: spread over 24 h, hours kept as the minimum gap',()=>{
 const m=reg({hours:4,perDay:3});
 assert.equal(P.timing(m).gap,8*H);
 assert.equal(P.timing(m).minGap,4*H);
 assert.match(P.describe(m),/3 doses over 24 h, every 8 h, at least 4 h apart/);
});
test('both fields that fit exactly (6 h x 4 = 24 h) give 6 h spacing',()=>{
 assert.equal(P.timing(reg({hours:6,perDay:4})).gap,6*H);
});
test('N that is not a divisor of 24 h rounds the gap UP to a whole minute',()=>{
 assert.equal(P.timing(reg({perDay:7})).gap,206*MIN);
 assert.ok(worst(times(reg({perDay:7}),[],10))<=7);
});
test('weekly / alternate-day work through hours',()=>{
 assert.equal(P.timing(reg({hours:168})).gap,7*DAY);
 assert.equal(P.timing(reg({hours:48})).gap,2*DAY);
 assert.match(P.describe(reg({hours:168})),/every 7 days/);
});
test('manual medicine has no planned doses; hours is only a minimum gap',()=>{
 const m=reg({mode:'manual',hours:4});
 assert.deepEqual(sched(m),[]);
 assert.equal(P.timing(m).minGap,4*H);
 assert.equal(P.describe(m),'as needed, at least 4 h apart');
});

// ---------- limit is enforced in the plan ----------
test('every 4 h with a 4-dose limit is widened to 6 h (evenly spread, exactly 4 per 24 h)',()=>{
 const m=reg({hours:4,max:4}),t=times(m,[],7);
 assert.equal(P.timing(m).gap,6*H);
 assert.equal(P.timing(m).widened,true);
 assert.deepEqual(t.slice(0,5).map(hh),['08:00','14:00','20:00','02:00','08:00']);
 assert.equal(worst(t),4);
 assert.match(P.describe(m),/widened from every 4 h so no more than 4 doses fall in any 24 h/);
});
test('every 5 h with a 4-dose limit becomes 6 h; 5 h grid would have allowed 5 in a day',()=>{
 assert.equal(worst(times(reg({hours:5}),[],7)),5);
 assert.equal(worst(times(reg({hours:5,max:4}),[],7)),4);
});
test('max total drives the limit: 3000 / 1000 per dose, every 6 h => 8 h spacing, 3 per day',()=>{
 const m=reg({hours:6,strength:1000,maxTotal:3000});
 assert.equal(P.cap(m),3);
 assert.deepEqual(times(m,[],1).map(hh),['08:00','16:00','00:00']);
});
test('limit not hit: spacing is left alone',()=>{
 const m=reg({hours:8,max:4});
 assert.equal(P.timing(m).widened,false);
 assert.equal(P.timing(m).gap,8*H);
});
test('exactly-the-limit: worst window equals the limit for every limit 1..24',()=>{
 for(let c=1;c<=24;c++)assert.equal(worst(times(reg({hours:1,max:c}),[],10)),c,`limit ${c}`);
 for(let n=1;n<=24;n++)assert.equal(worst(times(reg({perDay:n,max:n}),[],10)),n,`perDay ${n}`);
});

// ---------- form validation ----------
const raw=(o={})=>({name:'Med',str:'',unit:'mg',units:'1',max:'',maxtotal:'',mode:'regular',hours:'',perday:'',notes:'',...o});
const err=o=>P.parse(raw(o)).err;
test('parse: either frequency field may be blank, but not both (regular)',()=>{
 assert.equal(P.parse(raw({hours:'6'})).med.perDay,null);
 assert.equal(P.parse(raw({perday:'3'})).med.hours,null);
 assert.equal(P.parse(raw({hours:'4',perday:'3'})).med.hours,4);
 assert.equal(err({}).field,'hours');
});
test('parse: as needed needs no frequency; per-day is ignored',()=>{
 const r=P.parse(raw({mode:'manual',perday:'5'}));
 assert.equal(r.med.perDay,null);assert.equal(r.med.mode,'manual');
 assert.equal(P.parse(raw({mode:'manual',hours:'4'})).med.hours,4);
});
test('parse: contradictions are rejected',()=>{
 assert.equal(err({hours:'8',perday:'4'}).field,'perday');            // 4 x 8 h = 32 h
 assert.equal(err({hours:'48',perday:'1'}).field,'perday');
 assert.equal(err({perday:'4',max:'3'}).field,'perday');              // more doses than the limit
 assert.equal(err({perday:'4',str:'500',maxtotal:'1500'}).field,'perday');
 assert.equal(err({str:'500',maxtotal:'400',hours:'4'}).field,'maxtotal');
 assert.equal(err({maxtotal:'400',hours:'4'}).field,'str');
});
test('parse: number formats',()=>{
 assert.equal(P.parse(raw({str:'2.5',hours:'4'})).med.strength,2.5);
 assert.equal(P.parse(raw({str:'1.25',hours:'4'})).med.strength,1.25);
 for(const o of[{str:'1.255'},{str:'0'},{str:'abc'},{units:'0'},{units:'1.25'},{max:'0'},{max:'1.5'},{hours:'0'},{hours:'3.55'},{perday:'0'},{perday:'2.5'},{name:''}])
  assert.ok(err({hours:'4',...o}),JSON.stringify(o));
});
test('parse: hours alone with a limit is allowed (spacing widens, no error)',()=>{
 assert.ok(P.parse(raw({hours:'4',max:'4'})).med);
});

// ---------- migration of saved data ----------
test('migrate: legacy modes map to the two frequency fields; stale manual values are dropped',()=>{
 const s=P.migrate({meds:[
  {id:'a',mode:'every',hours:6,perDay:0},{id:'b',mode:'perday',hours:0,perDay:3},
  {id:'c',mode:'manual',hours:6,perDay:2},{id:'d',mode:'every',hours:null,perDay:null}],log:[],plan:{}});
 assert.deepEqual(s.meds.map(m=>[m.mode,m.hours,m.perDay]),[['regular',6,null],['regular',null,3],['manual',null,null],['manual',null,null]]);
 assert.equal(s.v,2);
 assert.strictEqual(P.migrate(s),s);                                      // idempotent
});

// ---------- logged doses ----------
test('regression: an extra dose logged AFTER a planned dose still counts (twice daily, limit 2)',()=>{
 const m=reg({perDay:2,max:2});
 const l=log({k:0,t:S},{k:null,t:S+13*H});                                // 08:00 taken, extra at 21:00
 const planned=sched(m,l,3).filter(x=>!x.l).map(x=>x.t),fixed=l.map(x=>x.t);
 assert.ok(!planned.some(t=>t>S&&t<S+DAY),`planned ${planned.map(hh)}`);   // 20:00 would make 3 in 24 h
 for(const p of planned)assert.ok(worst([...fixed,p])<=2);
});
test('regression: forgotten dose logged earlier than existing ones is flagged (limit 3)',()=>{
 const m=reg({max:3,mode:'manual'});
 const l=log({k:null,t:S},{k:null,t:S+H},{k:null,t:S+2*H});
 assert.equal(P.check(m,l,S-H).over,true);
 assert.equal(P.check(m,l,S+3*H).over,true);
 assert.equal(P.check(m,l,S+DAY).over,undefined);                        // exactly 24 h after the first is allowed
 assert.equal(P.check(m,l,S+DAY-MIN).over,true);
});
test('skipped doses do not count toward the limit',()=>{
 const m=reg({max:1,mode:'manual'});
 assert.deepEqual(P.check(m,log({k:0,t:S,skip:true}),S+H),{});
});
test('minimum gap check looks both ways',()=>{
 const m=reg({mode:'manual',hours:4});
 const l=log({k:null,t:S});
 assert.deepEqual(P.check(m,l,S+3*H),{tooSoon:{at:S,later:false}});
 assert.deepEqual(P.check(m,l,S+4*H),{});
 assert.deepEqual(P.check(m,l,S-3*H),{tooSoon:{at:S,later:true}});
});
test('late dose pushes the next one (anchor to actual time)',()=>{
 const m=reg({hours:8});
 const t=sched(m,log({k:0,t:S+90*MIN}),2).map(x=>x.t);
 assert.equal(t[1],S+90*MIN+8*H);
});
test('skipped dose keeps the planned grid',()=>{
 const m=reg({hours:8});
 const t=sched(m,log({k:0,t:S,skip:true}),2).map(x=>x.t);
 assert.equal(t[1],S+8*H);
});
test('extra dose between planned doses pushes the next planned dose',()=>{
 const m=reg({hours:8});
 const t=sched(m,log({k:null,t:S+3*H}),2).map(x=>x.t);
 assert.equal(t[1],S+11*H);
});
test('limit reached by logged doses: planned dose waits until the oldest drops out',()=>{
 const m=reg({perDay:4,max:4});
 // 4 doses taken 08:00-11:00 (all logged), next planned must be >= 08:00 next day
 const l=log({k:0,t:S},{k:1,t:S+H},{k:2,t:S+2*H},{k:3,t:S+3*H});
 const next=sched(m,l,3).find(x=>!x.l);
 assert.ok(next.t>=S+DAY,hh(next.t));
});
test('nextOk reports when another dose becomes possible',()=>{
 const m=reg({mode:'manual',max:2,hours:1});
 const l=log({k:null,t:S},{k:null,t:S+2*H});
 assert.equal(P.nextOk(m,l,S+3*H),S+DAY);
 assert.equal(P.nextOk(m,[],S),S);
 assert.equal(P.nextOk(reg({mode:'manual',hours:4}),log({k:null,t:S}),S+H),S+4*H);
});
test('count24 uses the same window as the limit',()=>{
 const l=log({k:null,t:S},{k:null,t:S+DAY});
 assert.equal(P.count24(reg(),l,S+DAY),1);                                // first dose is exactly 24 h old: outside
});

// ---------- randomised property test: the limit can never be exceeded by a planned dose ----------
function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
test('property: every window containing a planned dose is within the limit (random plans, random logs)',()=>{
 const r=rng(20261003),pick=a=>a[Math.floor(r()*a.length)];
 let cases=0,withLogs=0;
 for(let i=0;i<1500;i++){
  const c=pick([1,2,3,4,5,6,8,12]);
  const m=reg({hours:pick([null,1,2,3.5,4,5,6,7,8,12,24]),perDay:pick([null,null,1,2,3,4]),max:pick([c,null]),
   strength:pick([null,500]),units:1,maxTotal:null});
  if(m.strength)m.maxTotal=500*c;
  if(!m.hours&&!m.perDay)m.hours=6;
  const parsed=P.parse({name:'x',str:m.strength??'',unit:'mg',units:'1',max:m.max??'',maxtotal:m.maxTotal??'',mode:'regular',hours:m.hours??'',perday:m.perDay??'',notes:''});
  if(parsed.err)continue;                                                // contradictory entries are refused by the form
  const med={id:'m',...parsed.med},cp=P.cap(med),base=sched(med,[],10);
  const l=[];
  for(const x of base.slice(0,Math.floor(r()*base.length*0.6))){
   const roll=r();
   if(roll<0.5)l.push({id:'a'+x.k,medId:'m',k:x.k,t:x.t+Math.round((r()-0.4)*5*H/MIN)*MIN});
   else if(roll<0.65)l.push({id:'a'+x.k,medId:'m',k:x.k,t:x.t,skip:true});
  }
  for(let j=0;j<Math.floor(r()*4);j++)l.push({id:'e'+j,medId:'m',k:null,t:S+Math.round(r()*8*DAY/MIN)*MIN});
  if(l.length)withLogs++;
  const out=P.schedule(med,l,S,S+10*DAY),planned=out.filter(x=>!x.l).map(x=>x.t),
   fixed=l.filter(e=>!e.skip).map(e=>e.t),all=[...planned,...fixed].sort((p,q)=>p-q);
  cases++;
  for(const p of planned){
   // window ends at every dose that could share a 24 h span with p
   for(const e of all.filter(e=>e>=p&&e-p<DAY)){
    const n=all.filter(x=>x>e-DAY&&x<=e).length;
    assert.ok(n<=cp,`case ${i}: window ending ${new Date(e).toISOString()} holds ${n} > ${cp} (planned ${new Date(p).toISOString()}) ${JSON.stringify(med)}`);
   }
  }
  assert.ok(new Set(out.map(x=>x.k)).size===out.length,'duplicate k');
 }
 assert.ok(cases>800&&withLogs>500,`only ${cases} cases, ${withLogs} with logs`);
});
test('property: with no logs, spacing is uniform, >= minimum gap, and never above the limit',()=>{
 for(const hours of[null,0.5,1,2.3,3.5,4,5,7,8,13,24])for(const perDay of[null,1,2,3,5,7,11])for(const max of[null,1,2,3,4,6,9,24]){
  if(!hours&&!perDay)continue;
  const r=P.parse({name:'x',str:'',unit:'',units:'1',max:max??'',maxtotal:'',mode:'regular',hours:hours??'',perday:perDay??'',notes:''});
  if(r.err)continue;
  const med={id:'m',...r.med},tm=P.timing(med),t=times(med,[],12);
  for(let i=1;i<t.length;i++){assert.equal(t[i]-t[i-1],tm.gap);assert.ok(t[i]-t[i-1]>=tm.minGap)}
  assert.ok(worst(t)<=P.cap(med),`${JSON.stringify(r.med)}`);
 }
});

// ---------- clock changes (Europe/London 2026: back 25 Oct 01:00 UTC, forward 29 Mar 01:00 UTC) ----------
const BACK=Date.UTC(2026,9,25,1),FWD=Date.UTC(2027,2,28,1),
 london=t=>(t>=BACK&&t<FWD)?0:H;                       // GMT between the two changes, otherwise BST (autumn 2026 / spring 2027 only)
const lt=t=>new Date(t+london(t)).toISOString().slice(11,16);
const SB=Date.UTC(2026,9,22,7,0);                      // 08:00 BST
test('once/twice/three times a day keep their clock time when the clocks go back',()=>{
 for(const [n,want] of [[1,['08:00']],[2,['08:00','20:00']],[3,['08:00','16:00','00:00']]]){
  const t=P.schedule(reg({perDay:n}),[],SB,SB+10*DAY,london).map(x=>lt(x.t));
  assert.deepEqual([...new Set(t)].sort(),[...want].sort(),`perDay ${n}: ${t.join(' ')}`);
 }
});
test('every X hours stays in real elapsed time across a clock change',()=>{
 const t=P.schedule(reg({hours:8}),[],SB,SB+10*DAY,london).map(x=>x.t);
 for(let i=1;i<t.length;i++)assert.equal(t[i]-t[i-1],8*H);
});
test('clock change never breaks the limit or minimum gap (back and forward)',()=>{
 for(const [s0,e0] of [[SB,SB+10*DAY],[FWD-4*DAY,FWD+4*DAY]]){
  const fwd=(t=>t>=FWD?H:t>=BACK?0:H);
  for(const o of [{perDay:1,max:1},{perDay:3,max:3,hours:4},{hours:24,max:1}]){
   const m=reg(o),t=P.schedule(m,[],s0,e0,fwd).map(x=>x.t);
   assert.ok(worst(t)<=P.cap(m),JSON.stringify(o));
   for(let i=1;i<t.length;i++)assert.ok(t[i]-t[i-1]>=P.timing(m).minGap);
  }
 }
});

// ---------- performance ----------
test('performance: a year of hourly doses schedules quickly',()=>{
 const t0=Date.now();
 const out=P.schedule(reg({hours:1,max:12}),[],S,S+365*DAY);
 assert.ok(out.length>=365*12);
 assert.ok(Date.now()-t0<2000,`${Date.now()-t0} ms`);
});

console.log(`${passed} tests passed${process.exitCode?' (with failures above)':''}`);
