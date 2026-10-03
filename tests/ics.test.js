'use strict';
// Run with: node tests/ics.test.js   (no dependencies)
const assert=require('node:assert/strict');
const Ics=require('../ics.js');
const MIN=60000,H=60*MIN,FOLD_OCTETS=75,BYTES_KB=1024,MANY=500,TRUNC_KB=4;
let passed=0;
const test=(name,fn)=>{try{fn();passed++}catch(e){console.error(`FAIL: ${name}\n${e.stack}`);process.exitCode=1}};

const NOW=Date.UTC(2026,9,5,7,0),START=Date.UTC(2026,9,5,8,0);
const OPT={now:NOW,eventMin:15,leadMin:0,maxBytes:BYTES_KB*BYTES_KB};
const dose=(i,o={})=>({uid:`m-${i}@archart`,t:START+i*6*H,summary:'Paracetamol 500mg',description:'',...o});
const build=(ds,o={})=>Ics.build(ds,{...OPT,...o});
const unfold=t=>t.replace(/\r\n /g,'');
const physical=t=>t.split('\r\n').slice(0,-1);

test('every line ends in CRLF and the calendar is wrapped correctly',()=>{
 const{text}=build([dose(0)]);
 assert.ok(!/[^\r]\n/.test(text),'bare LF found');
 assert.ok(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
 assert.ok(text.endsWith('END:VCALENDAR\r\n'));
});

test('one VEVENT per dose, each with exactly one alarm',()=>{
 const{text,count}=build([dose(0),dose(1),dose(2)]);
 assert.equal(count,3);
 assert.equal((text.match(/BEGIN:VEVENT/g)||[]).length,3);
 assert.equal((text.match(/BEGIN:VALARM/g)||[]).length,3);
 assert.equal((text.match(/END:VALARM/g)||[]).length,3);
});

test('times are UTC instants and the event lasts eventMin',()=>{
 const{text}=build([dose(0)]);
 assert.ok(text.includes('DTSTART:20261005T080000Z'));
 assert.ok(text.includes('DTEND:20261005T081500Z'));
 assert.ok(text.includes('DTSTAMP:20261005T070000Z'));
});

test('alarm fires leadMin before the dose (0 => at the dose time)',()=>{
 assert.ok(build([dose(0)]).text.includes('TRIGGER:-PT0M'));
 assert.ok(build([dose(0)],{leadMin:10}).text.includes('TRIGGER:-PT10M'));
});

test('UIDs are kept as given (stable between exports) and unique per dose',()=>{
 const a=build([dose(0),dose(1)]).text,b=build([dose(0),dose(1)],{now:NOW+H}).text,ids=t=>t.match(/UID:.*/g);
 assert.deepEqual(ids(a),ids(b));
 assert.equal(new Set(ids(a)).size,2);
});

test('text is escaped: backslash, semicolon, comma, newline',()=>{
 const{text}=build([dose(0,{summary:'A, B; C\\D',description:'line1\nline2\r\nline3'})]);
 const u=unfold(text);
 assert.ok(u.includes('SUMMARY:A\\, B\\; C\\\\D'));
 assert.ok(u.includes('DESCRIPTION:line1\\nline2\\nline3'));
});

test('control characters are removed from text',()=>{
 const u=unfold(build([dose(0,{summary:'Ab\u0000c\u0007d'})]).text);
 assert.ok(u.includes('SUMMARY:Abcd'));
});

test('no description line when the notes are empty',()=>{
 const u=unfold(build([dose(0)]).text);
 assert.equal((u.match(/DESCRIPTION:/g)||[]).length,1);   // the alarm's only
});

test('no physical line is longer than 75 octets, and unfolding restores the text',()=>{
 const long='x'.repeat(300),multi='caf\u00e9 \u{1F48A} '.repeat(40),
  {text}=build([dose(0,{summary:long,description:multi})]);
 for(const l of physical(text))assert.ok(Ics.octets(l)<=FOLD_OCTETS,`too long: ${Ics.octets(l)}`);
 const u=unfold(text);
 assert.ok(u.includes(`SUMMARY:${long}`));
 assert.ok(u.includes(`DESCRIPTION:${multi}`));
});

test('folding never splits a multi-byte character',()=>{
 const{text}=build([dose(0,{summary:'\u{1F48A}'.repeat(60)})]);
 assert.ok(!text.includes('\uFFFD'));
 assert.ok(unfold(text).includes(`SUMMARY:${'\u{1F48A}'.repeat(60)}`));
});

test('size cap: stops before the limit, reports truncation, keeps whole events only',()=>{
 const ds=Array.from({length:MANY},(_,i)=>dose(i)),maxBytes=TRUNC_KB*BYTES_KB,r=build(ds,{maxBytes});
 assert.ok(r.truncated);
 assert.ok(r.count>0&&r.count<MANY);
 assert.ok(Ics.octets(r.text)<=maxBytes);
 assert.equal((r.text.match(/BEGIN:VEVENT/g)||[]).length,r.count);
 assert.equal((r.text.match(/END:VEVENT/g)||[]).length,r.count);
 assert.ok(r.text.endsWith('END:VCALENDAR\r\n'));
});

test('size cap: not truncated when everything fits',()=>{
 const r=build([dose(0),dose(1)]);
 assert.equal(r.truncated,false);
 assert.equal(r.count,2);
});

test('doses are written in the order given',()=>{
 const{text}=build([dose(2),dose(0),dose(1)]);
 assert.deepEqual(text.match(/UID:.*/g).map(l=>l.trim()),['UID:m-2@archart','UID:m-0@archart','UID:m-1@archart']);
});

console.log(`${passed} ics tests passed`);
