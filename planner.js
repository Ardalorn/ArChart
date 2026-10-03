'use strict';
// Dose planning rules. Pure functions only (no DOM, no storage) so they can be tested in Node.
//
// Rules this file guarantees:
// 1. LIMIT. A medicine's limit is the lower of "max doses" and floor(max total / dose size), worked
//    out in whole numbers (no floating-point rounding). No rolling 24 h window may hold more doses
//    than that. A window is (t - 24 h, t], so a dose exactly 24 h after another is allowed.
// 2. FREQUENCY. "Hours between doses" (H) and "doses over 24 hours" (N) may each be blank.
//    Only H: doses are H apart.            Only N: doses are 24 h / N apart.
//    Both: doses are 24 h / N apart and H is the minimum gap (H x N must fit in 24 h).
//    If the limit allows fewer doses than the spacing would give, the spacing is widened to
//    24 h / limit, so doses stay evenly spread and the limit is met exactly, never exceeded.
// 3. LOGGED DOSES. Taken doses and extra doses are fixed points. Planned doses move later, never
//    earlier, until every rolling window that contains them is within the limit.
(root=>{
const MS_MIN=60000,MS_H=60*MS_MIN,MS_DAY=24*MS_H,MIN_DAY=1440,MAX_STEPS=100000,MAX_SPAN_TENTHS=240,
 MODE={MANUAL:'manual',REGULAR:'regular'},
 RE={INT:/^\d+$/,DEC1:/^\d+(\.\d)?$/,DEC2:/^\d+(\.\d{1,2})?$/};
const asc=(a,b)=>a-b,
 pos=x=>Number.isFinite(x)&&x>0?x:null,
 scaled=(x,k)=>Math.round(x*k),                      // exact integer from a short decimal
 hoursMs=h=>scaled(h,10)*6*MS_MIN,                   // hours (1 dp) to whole milliseconds
 dayDiv=n=>Math.ceil(MIN_DAY/n)*MS_MIN,              // 24 h / n rounded UP to a whole minute, so n doses never squeeze into 24 h
 doseQ=m=>scaled(m.strength||0,100)*scaled(m.units??1,10),   // one dose as an integer (strength x100, units x10)
 dose=m=>doseQ(m)/1000,
 amount=(m,n)=>n*doseQ(m)/1000,                      // n doses in strength units, without float noise
 byTotal=m=>m.maxTotal&&doseQ(m)?Math.floor(scaled(m.maxTotal,100)*10/doseQ(m)):Infinity,
 cap=m=>Math.min(m.max||Infinity,byTotal(m)),        // most doses allowed in any rolling 24 h
 plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;

// Sorted-array helpers.
const lower=(a,x)=>{let lo=0,hi=a.length;while(lo<hi){const i=(lo+hi)>>1;if(a[i]<x)lo=i+1;else hi=i}return lo},
 upper=(a,x)=>{let lo=0,hi=a.length;while(lo<hi){const i=(lo+hi)>>1;if(a[i]<=x)lo=i+1;else hi=i}return lo},
 between=(a,lo,hi)=>a.slice(upper(a,lo),lower(a,hi)),   // lo < x < hi
 insert=(a,x)=>{a.splice(upper(a,x),0,x)};

function dur(ms){
 const mins=Math.round(ms/MS_MIN);
 if(mins>=2*MIN_DAY&&mins%MIN_DAY===0)return`${mins/MIN_DAY} days`;
 const h=Math.floor(mins/60),r=mins%60;
 return h?`${h} h${r?` ${r} min`:''}`:`${r} min`;
}

// How a medicine's entries resolve: spacing between planned doses, minimum gap, limit.
function timing(m){
 const c=cap(m),minGap=pos(m.hours)?hoursMs(m.hours):0;
 if(m.mode!==MODE.REGULAR||!(pos(m.hours)||pos(m.perDay)))return{regular:false,gap:0,base:0,minGap,cap:c,widened:false,wall:false};
 const base=pos(m.perDay)?dayDiv(m.perDay):hoursMs(m.hours),
  fit=Number.isFinite(c)?dayDiv(c):0,gap=Math.max(base,fit);
 // "times a day" and whole-day gaps keep their clock time when the clocks change; "every X hours" is real elapsed time.
 return{regular:true,gap,base,minGap,cap:c,widened:gap>base,wall:!!pos(m.perDay)||gap%MS_DAY===0};
}
function describe(m){
 const t=timing(m);
 if(!t.regular)return`as needed${t.minGap?`, at least ${dur(t.minGap)} apart`:''}`;
 const n=Math.ceil(MS_DAY/t.gap),exact=MS_DAY%t.gap===0;
 let s=pos(m.perDay)&&!t.widened?`${plural(m.perDay,'dose')} over 24 h, every ${dur(t.gap)}`
  :`every ${dur(t.gap)} (${exact?'':'up to '}${plural(n,'dose')} in 24 h)`;
 if(pos(m.perDay)&&pos(m.hours)&&t.minGap<t.gap)s+=`, at least ${dur(t.minGap)} apart`;
 if(t.widened)s+=`, widened from every ${dur(t.base)} so no more than ${plural(t.cap,'dose')} fall in any 24 h`;
 return s;
}
function limitText(m){
 const c=cap(m);
 if(!Number.isFinite(c))return'';
 return`Limit: ${plural(c,'dose')} in any 24 h${doseQ(m)?` (${amount(m,c)}${m.unit?` ${m.unit}`:''})`:''}`;
}

// Form strings in, medicine (or the first problem) out. `field` is the form field's id suffix.
function parse(raw){
 const v=k=>String(raw[k]??'').trim(),fail=(field,msg)=>({err:{field,msg}}),
  manual=v('mode')===MODE.MANUAL,num=k=>v(k)?Number(v(k)):null,
  okInt=k=>RE.INT.test(v(k))&&Number(v(k))>0,okDec=(k,re)=>re.test(v(k))&&Number(v(k))>0,
  units=v('units')||'1';
 if(!v('name'))return fail('name','Enter a medicine name.');
 if(v('str')&&!okDec('str',RE.DEC2))return fail('str','Strength must be a number above 0 with at most two decimal places, e.g. 2.5.');
 if(!(RE.DEC1.test(units)&&Number(units)>0))return fail('units','Units per dose: a number with at most one decimal place, e.g. 0.5.');
 if(v('max')&&!okInt('max'))return fail('max','Max doses must be a whole number above 0.');
 if(v('maxtotal')){
  if(!okDec('maxtotal',RE.DEC2))return fail('maxtotal','Max total must be a number above 0 with at most two decimal places.');
  if(!v('str'))return fail('str','Enter a strength to use a max total.');
 }
 if(v('hours')&&!okDec('hours',RE.DEC1))return fail('hours','Hours between doses: a number above 0 with at most one decimal place, e.g. 3.5.');
 if(!manual&&v('perday')&&!okInt('perday'))return fail('perday','Doses over 24 hours must be a whole number above 0.');
 if(!manual&&!v('hours')&&!v('perday'))return fail('hours','Enter the hours between doses, the doses over 24 hours, or both. You can leave one blank.');
 const med={name:v('name'),strength:num('str'),unit:v('unit'),units:Number(units),max:num('max'),maxTotal:num('maxtotal'),
  mode:manual?MODE.MANUAL:MODE.REGULAR,hours:num('hours'),perDay:manual?null:num('perday'),notes:v('notes')},
  c=cap(med);
 if(med.maxTotal&&c<1)return fail('maxtotal','Max total is smaller than a single dose.');
 if(med.hours&&med.perDay&&scaled(med.hours,10)*med.perDay>MAX_SPAN_TENTHS)
  return fail('perday',`${plural(med.perDay,'dose')} at least ${med.hours} h apart would take ${scaled(med.hours,10)*med.perDay/10} h, which is more than 24 h. Lower the hours or the number of doses.`);
 if(med.perDay&&med.perDay>c)return fail('perday',`${plural(med.perDay,'dose')} over 24 hours is more than the limit of ${plural(c,'dose')} in any 24 h.`);
 return{med};
}

// Saved data from before v2 used modes "every" / "perday" and could hold stale values on "manual".
function migrate(s){
 if(!s||!Array.isArray(s.meds)||s.v>=2)return s;
 s.meds=s.meds.map(m=>{
  const reg=m.mode===MODE.REGULAR,
   hours=m.mode==='every'||reg?pos(m.hours):null,perDay=m.mode==='perday'||reg?pos(m.perDay):null;
  return{...m,mode:hours||perDay?MODE.REGULAR:MODE.MANUAL,hours,perDay};
 });
 s.v=2;
 return s;
}

// Earliest time >= t where one more dose keeps every rolling 24 h window at or under c doses.
// `fixed` = logged doses, `placed` = planned doses already placed; both sorted.
function room(fixed,placed,t,c){
 if(!Number.isFinite(c))return t;
 for(;;){
  const pts=[...between(fixed,t-MS_DAY,t+MS_DAY),...between(placed,t-MS_DAY,t+MS_DAY)].sort(asc),
   i0=upper(pts,t);
  pts.splice(i0,0,t);
  let next=null;
  for(let i=Math.max(0,i0-c);i<=i0&&i+c<pts.length;i++)
   if(pts[i+c]-pts[i]<MS_DAY)next=pts[i]+MS_DAY;    // c+1 doses inside 24 h: move past the oldest
  if(next===null)return t;
  t=next;
 }
}

// Planned doses for a regular medicine from `start` up to `end`. Each dose anchors to the previous
// ACTUAL taken time; a skipped dose keeps the planned grid; an extra (unscheduled) dose pushes the next
// planned dose later; the limit pushes planned doses later.
function schedule(m,log,start,end,off=()=>0){   // off(t) = local UTC offset in ms at time t
 const tm=timing(m),
  step=(at,gap)=>{                                  // at + gap, on the local clock when tm.wall
   if(!tm.wall)return at+gap;
   const w=at+off(at)+gap;let g=w-off(w);g=w-off(g);
   return Math.max(g,at+tm.minGap,at+1);              // never closer than the minimum gap
  };
 if(!tm.regular)return[];
 const mine=log.filter(e=>e.medId===m.id),
  none=e=>e.k===null||e.k===undefined,
  byK=new Map(mine.filter(e=>!none(e)).map(e=>[e.k,e])),
  taken=mine.filter(e=>!e.skip).map(e=>e.t).sort(asc),
  extras=mine.filter(e=>none(e)&&!e.skip).map(e=>e.t).sort(asc),
  placed=[],out=[];
 let t=start;
 for(let k=0;t<end&&k<MAX_STEPS;k++){
  const l=byK.get(k);
  let others=taken;
  if(l&&!l.skip){others=taken.slice();others.splice(others.indexOf(l.t),1)}   // a logged dose must not block itself
  t=room(others,placed,t,tm.cap);
  out.push({m,k,t,l});
  const at=l?l.t:t;
  if(!l)insert(placed,t);
  t=step(at,tm.gap);
  for(const x of extras)if(x>at&&x<t)t=step(x,tm.gap);
 }
 return out;
}

// Problems with recording a dose at time t: over the limit in any 24 h window that contains it,
// or closer than the minimum gap to a neighbouring dose. Returns {} when fine.
function check(m,log,t){
 const mine=log.filter(e=>e.medId===m.id&&!e.skip).map(e=>e.t).sort(asc),
  c=cap(m),{minGap}=timing(m),i0=upper(mine,t),out={};
 if(Number.isFinite(c)){
  const pts=[...mine];pts.splice(i0,0,t);
  for(let i=Math.max(0,i0-c);i<=i0&&i+c<pts.length;i++)if(pts[i+c]-pts[i]<MS_DAY){out.over=true;break}
 }
 if(minGap){
  const prev=i0>0?mine[i0-1]:null,next=i0<mine.length?mine[i0]:null;
  if(prev!==null&&t-prev<minGap)out.tooSoon={at:prev,later:false};
  else if(next!==null&&next-t<minGap)out.tooSoon={at:next,later:true};
 }
 return out;
}
// Earliest time at or after `from` when another dose would be within the limit and the minimum gap.
function nextOk(m,log,from){
 const mine=log.filter(e=>e.medId===m.id&&!e.skip).map(e=>e.t).sort(asc),{minGap}=timing(m),i0=upper(mine,from);
 return room(mine,[],minGap&&i0>0?Math.max(from,mine[i0-1]+minGap):from,cap(m));
}
const count24=(m,log,t)=>log.filter(e=>e.medId===m.id&&!e.skip&&e.t>t-MS_DAY&&e.t<=t).length;

root.Planner={MODE,MS_DAY,cap,dose,amount,timing,describe,limitText,dur,parse,migrate,schedule,check,nextOk,count24};
if(typeof module!=='undefined')module.exports=root.Planner;
})(globalThis);