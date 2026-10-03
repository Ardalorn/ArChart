'use strict';
// iCalendar (.ics) builder. Pure functions only (no DOM, no storage) so it can be tested in Node.
//
// Rules this file guarantees:
// 1. ONE EVENT PER DOSE, each with one display alarm that fires `leadMin` minutes before the dose.
// 2. TIMES are UTC instants, so "every X hours" doses stay exact whatever the calendar's time zone.
// 3. LINES end in CRLF and are folded so none is longer than 75 octets (RFC 5545), never splitting a character.
// 4. SIZE. Doses are written in the order given and writing stops before the file would pass `maxBytes`.
(root=>{
const CRLF='\r\n',FOLD_OCTETS=75,MS_MIN=60000,
 PRODID='-//ArChart//Medicine chart//EN',
 encoder=new TextEncoder(),
 octets=s=>encoder.encode(s).length;

// TEXT values: control characters out, then backslash, semicolon, comma and line breaks escaped.
const escText=s=>String(s??'')
 .replace(/\r\n?/g,'\n')
 .replace(/[^\P{Cc}\n\t]/gu,'')
 .replace(/[\\;,]/g,'\\$&')
 .replace(/\n/g,'\\n');

const utc=t=>new Date(t).toISOString().replace(/[-:]|\.\d+/g,'');   // 2026-10-05T08:00:00.000Z -> 20261005T080000Z

function fold(line){
 let cur='',len=0;
 const out=[];
 for(const ch of line){
  const n=octets(ch);
  if(len+n>FOLD_OCTETS){out.push(cur);cur=' ';len=1}   // a continuation line starts with one space, which counts
  cur+=ch;len+=n;
 }
 out.push(cur);
 return out.join(CRLF);
}

const lines=a=>a.map(fold).join(CRLF)+CRLF;

const event=(d,o)=>lines([
 'BEGIN:VEVENT',
 `UID:${d.uid}`,
 `DTSTAMP:${utc(o.now)}`,
 `DTSTART:${utc(d.t)}`,
 `DTEND:${utc(d.t+o.eventMin*MS_MIN)}`,
 `SUMMARY:${escText(d.summary)}`,
 ...d.description?[`DESCRIPTION:${escText(d.description)}`]:[],
 'BEGIN:VALARM',
 'ACTION:DISPLAY',
 `DESCRIPTION:${escText(d.summary)}`,
 `TRIGGER:-PT${o.leadMin}M`,
 'END:VALARM',
 'END:VEVENT'
]);

// doses: [{uid, t (ms), summary, description?}] in the order they should be written.
// Returns {text, count, truncated}; `count` doses were written, `truncated` is true if more would not fit.
function build(doses,{now,eventMin,leadMin,maxBytes}){
 const head=lines(['BEGIN:VCALENDAR','VERSION:2.0',`PRODID:${PRODID}`,'CALSCALE:GREGORIAN','METHOD:PUBLISH']),
  tail=lines(['END:VCALENDAR']);
 let size=octets(head)+octets(tail),body='',count=0,truncated=false;
 for(const d of doses){
  const e=event(d,{now,eventMin,leadMin}),n=octets(e);
  if(size+n>maxBytes){truncated=true;break}
  body+=e;size+=n;count++;
 }
 return{text:head+body+tail,count,truncated};
}

root.Ics={build,octets};
if(typeof module!=='undefined')module.exports=root.Ics;
})(globalThis);