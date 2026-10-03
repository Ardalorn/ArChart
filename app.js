'use strict';
const KEY='medchart.v1',MS_SEC=1000,SEC_MIN=60,MIN_H=60,H_DAY=24,
MS_MIN=MS_SEC*SEC_MIN,MS_H=MS_MIN*MIN_H,MS_DAY=MS_H*H_DAY,HALF_DAY=MS_DAY/2,
LOCAL_LEN=16,DATE_LEN=10,DEFAULT_DAYS=7,
EXPORT_MAX_DAYS=90,PDF_MARGIN=14,PDF_GAP=8,PDF_TITLE_PT=18,PDF_BODY_PT=10,PDF_PAD=3,PDF_LINE=0.2,
INK='#17261f',LINE='#c3cdc7',PDF_NOTE_PT=8,REVOKE_DELAY_MS=1000,BYTES_KB=1024,ICS_MAX_KB=900,ICS_EVENT_MIN=15,ICS_ALARM_LEAD_MIN=0,
TIME_MSG='Enter the time as HH:MM, 24-hour (e.g. 14:30).',
DISCLAIMER='This chart plans and checks doses only against the limits you enter. It cannot check them against your prescription, and it does not check interactions between medicines. Follow the prescriber or pharmacist instructions, and ask them if unsure.';
const{MODE}=Planner;
const UNIT={DAYS:'days',MONTHS:'months',YEARS:'years',FOREVER:'forever'};
const RE={INT:/^\d+$/,TIME:/^([01]\d|2[0-3]):[0-5]\d$/};
const $=id=>document.getElementById(id);
const esc=s=>s.replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`);
const hm=t=>new Date(t).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
const dmy=t=>new Date(t).toLocaleDateString('en-GB',{month:'2-digit',day:'2-digit',year:'numeric'});
const stamp=t=>`${dmy(t)} ${hm(t)}`;
const toInput=t=>new Date(t-new Date(t).getTimezoneOffset()*MS_MIN).toISOString().slice(0,LOCAL_LEN);
const toDay=t=>toInput(t).slice(0,DATE_LEN);
const say=(t,bad=true,id='msg')=>{$(id).textContent=t;$(id).classList.toggle('err',bad)};
const focus=sel=>document.querySelector(sel)?.focus();
const doses=n=>n===1?'dose':'doses';
const longDay=t=>new Date(t).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

let st;try{st=JSON.parse(localStorage.getItem(KEY))}catch{}
st??={v:2,meds:[],log:[],plan:{start:Date.now(),n:DEFAULT_DAYS,unit:UNIT.DAYS}};
st=Planner.migrate(st);
const save=()=>localStorage.setItem(KEY,JSON.stringify(st));

function planEnd(){
 const{start,n,unit}=st.plan;
 if(unit===UNIT.FOREVER)return Infinity;
 const d=new Date(start);
 if(unit===UNIT.DAYS)d.setDate(d.getDate()+n);
 else if(unit===UNIT.MONTHS)d.setMonth(d.getMonth()+n);
 else d.setFullYear(d.getFullYear()+n);
 return d.getTime();
}
// Planning and dose-limit rules live in planner.js (pure functions, tested in tests/planner.test.js).
const limit=Planner.cap,dose=Planner.dose;
const offset=t=>-new Date(t).getTimezoneOffset()*MS_MIN;
const schedule=(m,until)=>Planner.schedule(m,st.log,st.plan.start,Math.min(until,planEnd()),offset);
const dayStart=()=>{const[y,m,d]=$('day').value.split('-').map(Number);return new Date(y,m-1,d).getTime()};
function resolve(base,hhmm){
 const[h,mi]=hhmm.split(':').map(Number),d=new Date(base);
 d.setHours(h,mi,0,0);
 let c=d.getTime();
 if(c-base>HALF_DAY)c-=MS_DAY;else if(base-c>HALF_DAY)c+=MS_DAY;
 return c;
}
const plain=m=>`${m.name}${m.strength?` ${m.strength}${m.unit}`:''}${m.units&&m.units!==1?` x ${m.units} per dose`:''}`;
const label=x=>esc(plain(x.m));

const statusOf=(x,now)=>x.l?(x.l.skip?'Skipped':`Taken ${stamp(x.l.t)}`):x.t<now?'Overdue':'Due';
function row(x,now,a){
 const{m,k,t,l}=x,manual=k===null,name=esc(m.name);
 const cls=l?(l.skip?'skip':'done'):!manual&&t<now?'late':'';
 const status=manual&&!l?'As needed':statusOf(x,now);
 const ctl=`data-take="${m.id}" data-k="${manual?'':k}" data-base="${manual?a+HALF_DAY:t}"`;
 const act=l
  ?`<button type="button" class="alt" data-undo="${l.id}" data-med="${m.id}" data-k="${manual?'':k}" aria-label="Undo ${name} ${l.skip?'skipped':'taken'} at ${hm(t)}">Undo</button>`
  :`<span class="act"><label class="time">Time taken<input type="time" value="${hm(manual?now:t)}" autocomplete="off"></label><span class="row"><button type="button" ${ctl} aria-label="Mark ${name} taken">Taken</button>${manual?'':`<button type="button" class="alt" ${ctl} data-skip="1" aria-label="Skip ${name} dose at ${hm(t)}">Skip</button>`}</span></span>`;
 return `<li class="dose ${cls}"><strong>${manual&&!l?'&mdash;':hm(t)}</strong><span>${label(x)} &mdash; <span class="st">${status}</span>${m.notes?`<br><small>${esc(m.notes)}</small>`:''}</span>${act}</li>`;
}
function render(){
 if(!$('day').value)return;
 const[y,mo,d]=$('day').value.split('-').map(Number),
 a=new Date(y,mo-1,d).getTime(),b=new Date(y,mo-1,d+1).getTime(),now=Date.now();
 const rows=[
  ...st.meds.flatMap(m=>schedule(m,b).filter(x=>x.t>=a)),
  ...st.meds.filter(m=>m.mode===MODE.MANUAL).map(m=>({m,k:null,t:a})),
  ...st.log.filter(e=>e.k===null&&e.t>=a&&e.t<b).map(l=>({m:st.meds.find(x=>x.id===l.medId),k:null,t:l.t,l}))
 ].filter(x=>x.m).sort((p,q)=>p.t-q.t);
 $('day-long').textContent=longDay(a)+(toDay(a)===toDay(now)?' (today)':'');
 $('extra').hidden=!st.meds.length;
 $('doses').innerHTML=rows.map(x=>row(x,now,a)).join('')||(st.meds.length?'<li class="dose">No doses on this day.</li>':'<li class="dose">No medicines yet. <a href="#meds">Add a medicine</a> to see doses here.</li>');
 const end=planEnd();
 $('range').textContent=`Plan: ${stamp(st.plan.start)} to ${end===Infinity?'no end date':stamp(end)}`;
 if(!$('overview').hidden)renderOverview();
 renderMeds();
}
const desc=Planner.describe;
function renderMeds(){
 const sel=$('x-med').value,now=Date.now();
 $('medlist').innerHTML=st.meds.map(m=>{
  const n=Planner.count24(m,st.log,now),lim=limit(m),next=Planner.nextOk(m,st.log,now);
  return `<li class="card row"><span>${label({m})}, ${desc(m)}<br><small>Last 24 h: ${n}${Number.isFinite(lim)?` of ${lim}`:''} dose(s)${dose(m)?`, ${Planner.amount(m,n)} ${esc(m.unit)}`:''}${next>now?`. Next dose possible from ${stamp(next)}`:''}${m.notes?`. ${esc(m.notes)}`:''}</small></span><span class="row"><button type="button" class="alt" data-edit="${m.id}" aria-label="Edit ${esc(m.name)}">Edit</button><button type="button" class="alt" data-rm="${m.id}" aria-label="Remove ${esc(m.name)}">Remove</button></span></li>`}).join('')||'<li>No medicines yet. Use the form below to add one.</li>';
 $('x-med').innerHTML=st.meds.map(m=>`<option value="${m.id}">${label({m})}</option>`).join('');
 if(sel)$('x-med').value=sel;
}
function renderPlan(){
 $('p-start').value=toInput(st.plan.start);$('p-n').value=st.plan.n;$('p-unit').value=st.plan.unit;
 $('w-n').hidden=st.plan.unit===UNIT.FOREVER;
}

function exportPdf(){
 if(!st.meds.length)return say('Add a medicine first.');
 const{jsPDF}=window.jspdf,doc=new jsPDF(),end=planEnd(),cap=st.plan.start+EXPORT_MAX_DAYS*MS_DAY;
 const doses=st.meds.flatMap(m=>schedule(m,Math.min(end,cap))).sort((p,q)=>p.t-q.t);
 const style={styles:{fontSize:PDF_BODY_PT,cellPadding:PDF_PAD,lineColor:LINE,lineWidth:PDF_LINE},headStyles:{fillColor:INK}};
 doc.setFontSize(PDF_TITLE_PT);doc.text('ArChart',PDF_MARGIN,PDF_MARGIN);
 doc.setFontSize(PDF_BODY_PT);
 doc.text(`Plan start ${stamp(st.plan.start)}, ${end===Infinity?'no end date':`ends ${stamp(end)}`}${end>cap?`. Showing the first ${EXPORT_MAX_DAYS} days.`:''}`,PDF_MARGIN,PDF_MARGIN+PDF_GAP);
 let y=PDF_MARGIN+PDF_GAP*2;
 if(doses.length){
  doc.autoTable({startY:y,head:[['Date','Due','Medicine','Taken at']],body:doses.map(x=>[dmy(x.t),hm(x.t),plain(x.m)+(x.m.notes?`\n${x.m.notes}`:''),x.l?(x.l.skip?'Skipped':hm(x.l.t)):'']),...style});
  y=doc.lastAutoTable.finalY+PDF_GAP;
 }
 const manual=st.meds.filter(m=>m.mode===MODE.MANUAL);
 if(manual.length)doc.autoTable({startY:y,head:[['As needed','Min gap','Max per 24 h','Taken at']],body:manual.map(m=>[plain(m)+(m.notes?`\n${m.notes}`:''),Planner.timing(m).minGap?Planner.dur(Planner.timing(m).minGap):'',Number.isFinite(limit(m))?limit(m):'','']),...style});
 const pg=doc.internal.pageSize,lines=doc.splitTextToSize(DISCLAIMER,pg.getWidth()-PDF_MARGIN*2);
 let ny=(doc.lastAutoTable?.finalY??y)+PDF_GAP;
 if(ny+lines.length*PDF_GAP>pg.getHeight()-PDF_MARGIN){doc.addPage();ny=PDF_MARGIN}
 doc.setFontSize(PDF_NOTE_PT);doc.text(lines,PDF_MARGIN,ny);
 doc.save('ArChart.pdf');
 say('PDF chart created.',false);
}

// One calendar event per upcoming, unlogged dose, each with an alarm. Written in time order across all medicines.
function exportIcs(){
 const now=Date.now(),until=Math.min(planEnd(),now+EXPORT_MAX_DAYS*MS_DAY),
  doses=st.meds.flatMap(m=>schedule(m,until).filter(x=>!x.l&&x.t>=now)
   .map(x=>({uid:`${m.id}-${x.k}@archart`,t:x.t,summary:plain(m),description:m.notes}))).sort((p,q)=>p.t-q.t);
 if(!doses.length)return say('No upcoming doses to put in a calendar file.');
 const r=Ics.build(doses,{now,eventMin:ICS_EVENT_MIN,leadMin:ICS_ALARM_LEAD_MIN,maxBytes:ICS_MAX_KB*BYTES_KB}),
  f=new File([r.text],`ArChart-doses-${toDay(now)}.ics`,{type:'text/calendar'}),a=document.createElement('a');
 a.href=URL.createObjectURL(f);a.download=f.name;a.click();
 setTimeout(()=>URL.revokeObjectURL(a.href),REVOKE_DELAY_MS);
 say(`Calendar file created with ${r.count} dose(s) up to ${stamp(doses[r.count-1].t)}.${r.truncated?' The file size limit was reached, so later doses are not included.':''}`,false);
}

// Recording what really happened is never blocked, but a dose outside the limit or minimum gap needs a confirmation.
function logDose(m,k,t,skip,msgId='msg'){
 const c=skip?{}:Planner.check(m,st.log,t),why=[];
 if(c.over)why.push(`would go over the limit of ${limit(m)} dose(s) in any 24 h`);
 if(c.tooSoon)why.push(`is less than ${Planner.dur(Planner.timing(m).minGap)} ${c.tooSoon.later?'before':'after'} the dose at ${stamp(c.tooSoon.at)}`);
 if(why.length&&!confirm(`${m.name}: this dose ${why.join(' and ')}. Log anyway?`))return;
 const id=crypto.randomUUID();
 st.log.push({id,medId:m.id,k,t,...skip&&{skip:true}});
 save();say(`${skip?'Skipped':'Logged'} ${m.name} at ${hm(t)}.`,false,msgId);render();
 return id;
}
$('doses').onclick=e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.undo){
  const l=st.log.find(x=>x.id===b.dataset.undo),m=l&&st.meds.find(x=>x.id===l.medId);
  st.log=st.log.filter(x=>x.id!==b.dataset.undo);save();
  say(m?`Undone: ${m.name} at ${hm(l.t)}.`:'',false);render();
  return focus(`[data-take="${b.dataset.med}"][data-k="${b.dataset.k}"]:not([data-skip])`);
 }
 const m=st.meds.find(x=>x.id===b.dataset.take),k=b.dataset.k===''?null:Number(b.dataset.k);
 if(b.dataset.skip){const id=logDose(m,k,Number(b.dataset.base),true);return id&&focus(`[data-undo="${id}"]`)}
 const box=b.closest('li').querySelector('input'),v=box.value.trim();
 if(!RE.TIME.test(v)){box.focus();return say(TIME_MSG)}
 const id=logDose(m,k,resolve(Number(b.dataset.base),v));
 if(id)focus(`[data-undo="${id}"]`);
};
$('extra').onsubmit=e=>{
 e.preventDefault();
 const m=st.meds.find(x=>x.id===$('x-med').value),v=$('x-time').value.trim();
 if(!m)return say('Add a medicine first.',true,'x-msg');
 if(!RE.TIME.test(v)){$('x-time').focus();return say(TIME_MSG,true,'x-msg')}
 if(logDose(m,null,resolve(dayStart()+HALF_DAY,v),false,'x-msg'))$('x-time').value='';
};
$('x-now').onclick=()=>{$('x-time').value=hm(Date.now())};
let editId=null;
const FIELDS=['name','str','unit','units','max','maxtotal','mode','hours','perday','notes'],
 formValues=()=>Object.fromEntries(FIELDS.map(k=>[k,$('f-'+k).value]));
// Shows how the entries resolve, e.g. which value was worked out when one frequency box is blank.
function showSummary(){
 const v=formValues(),r=Planner.parse({...v,name:v.name.trim()||'-'});
 $('f-sum').textContent=r.err?'':`Summary: ${Planner.describe(r.med)}. ${Planner.limitText(r.med)}`.trim();
}
function syncForm(){
 const manual=$('f-mode').value===MODE.MANUAL;
 $('w-perday').hidden=$('f-hint').hidden=manual;
 $('l-hours').textContent=manual?'Minimum hours between doses (optional, e.g. 4)':'Hours between doses (e.g. 3.5)';
 showSummary();
}
function endEdit(){
 editId=null;$('add').reset();syncForm();$('err').textContent='';
 $('f-submit').textContent='Add medicine';$('f-cancel').hidden=true;
}
function startEdit(m){
 editId=m.id;
 Object.entries({'f-name':m.name,'f-str':m.strength??'','f-unit':m.unit,'f-units':m.units??1,'f-max':m.max??'','f-maxtotal':m.maxTotal??'',
  'f-mode':m.mode,'f-hours':m.hours??'','f-perday':m.perDay??'','f-notes':m.notes||''}).forEach(([id,val])=>{$(id).value=val});
 syncForm();$('f-submit').textContent='Save changes';$('f-cancel').hidden=false;
 say('',false,'m-msg');$('add').scrollIntoView();$('f-name').focus();
}
$('medlist').onclick=e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.edit)return startEdit(st.meds.find(x=>x.id===b.dataset.edit));
 const m=st.meds.find(x=>x.id===b.dataset.rm);
 if(!m||!confirm(`Remove ${m.name} and its logged doses?`))return;
 if(editId===m.id)endEdit();
 const at=st.meds.indexOf(m);
 st.meds=st.meds.filter(x=>x.id!==m.id);st.log=st.log.filter(x=>x.medId!==m.id);
 save();render();say(`Removed ${m.name}.`,false,'m-msg');
 const next=st.meds[Math.min(at,st.meds.length-1)];
 (next&&document.querySelector(`[data-edit="${next.id}"]`)||$('hm')).focus();
};
$('f-mode').onchange=syncForm;
$('add').addEventListener('change',showSummary);
$('f-cancel').onclick=()=>{const id=editId;endEdit();focus(`[data-edit="${id}"]`)};
$('add').onsubmit=e=>{
 e.preventDefault();
 const r=Planner.parse(formValues());
 if(r.err){$('err').textContent=r.err.msg;$('f-'+r.err.field).focus();return}
 const was=editId;
 if(was)Object.assign(st.meds.find(x=>x.id===was),r.med);else st.meds.push({id:crypto.randomUUID(),...r.med});
 save();endEdit();render();
 say(was?`Saved changes to ${r.med.name}.`:`Added ${r.med.name}.`,false,'m-msg');
 if(was)focus(`[data-edit="${was}"]`);
};
function renderOverview(){
 const a=dayStart(),e=new Date(a);e.setDate(e.getDate()+Number($('ov-days').value));
 const now=Date.now(),rows=st.meds.flatMap(m=>schedule(m,e.getTime()).filter(x=>x.t>=a)).sort((p,q)=>p.t-q.t);
 const th=s=>`<th scope="col">${s}</th>`,td=s=>`<td>${s}</td>`;
 $('ov').innerHTML=`<caption>${dmy(a)} to ${dmy(e.getTime()-1)}</caption><thead><tr>${['Date','Due','Medicine','Status'].map(th).join('')}</tr></thead><tbody>${
  rows.map(x=>`<tr>${td(dmy(x.t))}${td(hm(x.t))}${td(label(x))}${td(statusOf(x,now))}</tr>`).join('')||'<tr><td colspan="4">No scheduled doses in this range.</td></tr>'}</tbody>`;
}
$('ov-days').onchange=renderOverview;
$('print-ov').onclick=()=>{document.body.classList.add('print-ov');window.print()};
window.addEventListener('afterprint',()=>document.body.classList.remove('print-ov'));
const backupFile=()=>new File([JSON.stringify(st)],`ArChart-backup-${toDay(Date.now())}.json`,{type:'application/json'});
$('bk-save').onclick=()=>{
 const f=backupFile(),a=document.createElement('a');
 a.href=URL.createObjectURL(f);a.download=f.name;a.click();
 setTimeout(()=>URL.revokeObjectURL(a.href),REVOKE_DELAY_MS);say('Backup downloaded.',false,'bk-msg');
};
$('bk-share').onclick=async()=>{
 const f=backupFile();
 if(!navigator.canShare?.({files:[f]}))return say('Sharing files is not supported here. Use Download backup.',true,'bk-msg');
 try{await navigator.share({files:[f]})}catch{}
};
$('bk-load').onchange=async e=>{
 const f=e.target.files[0];if(!f)return;
 try{
  const d=JSON.parse(await f.text());
  if(!Array.isArray(d.meds)||!Array.isArray(d.log)||!d.plan)throw new Error('shape');
  if(!confirm('Replace all data on this device with this backup?'))return;
  st=Planner.migrate(d);save();renderPlan();render();say('Backup restored.',false,'bk-msg');
 }catch{say('That file is not a valid backup.',true,'bk-msg')}
 finally{e.target.value=''}
};
$('p-start').onchange=e=>{const t=new Date(e.target.value).getTime();if(!Number.isNaN(t)){st.plan.start=t;save();render()}};
$('p-now').onclick=()=>{st.plan.start=Date.now();save();renderPlan();render()};
$('p-n').onchange=e=>{
 const s=e.target.value.trim();
 if(RE.INT.test(s)&&Number(s)>0){st.plan.n=Number(s);save();say('',false,'p-msg');render()}
 else{e.target.value=st.plan.n;say('Length must be a whole number above 0.',true,'p-msg')}
};
$('p-unit').onchange=e=>{st.plan.unit=e.target.value;save();renderPlan();render()};
const shift=n=>{const[y,m,d]=($('day').value||toDay(Date.now())).split('-').map(Number);$('day').value=toDay(new Date(y,m-1,d+n).getTime());render()};
$('prev').onclick=()=>shift(-1);$('next').onclick=()=>shift(1);
$('today').onclick=()=>{$('day').value=toDay(Date.now());render()};
$('day').onchange=render;
$('pdf').onclick=exportPdf;
$('ics').onclick=exportIcs;
const typing=()=>[...document.querySelectorAll('#doses input')].some(i=>i.value!==i.defaultValue);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!typing())render()});

// Marks the section being read in the navigation.
{
 const links=[...document.querySelectorAll('nav a[href^="#"]')],secs=links.map(a=>$(a.hash.slice(1))).filter(Boolean),
  mark=s=>links.forEach(a=>a.hash==='#'+s.id?a.setAttribute('aria-current','location'):a.removeAttribute('aria-current')),
  atEnd=()=>innerHeight+scrollY>=document.documentElement.scrollHeight-2;
 if(secs.length&&'IntersectionObserver' in window){
  const io=new IntersectionObserver(es=>{if(!atEnd())es.forEach(e=>e.isIntersecting&&mark(e.target))},{rootMargin:'-20% 0px -70% 0px'});
  secs.forEach(s=>io.observe(s));
  addEventListener('scroll',()=>{if(atEnd())mark(secs.at(-1))},{passive:true});
  mark(secs[0]);
 }
}

// Keeps focus and anchor jumps clear of the sticky header (WCAG 2.4.11). The offset is 0 while the header is not sticky.
{
 const hd=document.querySelector('header'),set=()=>document.documentElement.style.setProperty('--hdr',getComputedStyle(hd).position==='sticky'?`${hd.offsetHeight}px`:'0px');
 set();addEventListener('resize',set);
 if('ResizeObserver' in window)new ResizeObserver(set).observe(hd);
}
$('day').value=toDay(Date.now());$('disc').textContent=DISCLAIMER;$('bk-share').hidden=!navigator.canShare;
navigator.storage?.persist?.();renderPlan();syncForm();render();
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js');