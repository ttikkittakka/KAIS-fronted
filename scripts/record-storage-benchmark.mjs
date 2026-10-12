// Synthetic Node + memory-storage benchmark; not mobile or real browser quota evidence.
import { loadTs } from './helpers/load-ts.mjs';
const store=loadTs(new URL('../src/app/record-store.ts',import.meta.url));
const {localDay}=loadTs(new URL('../src/app/daily-checkin.ts',import.meta.url));
const data=new Map([['little-garden.local-owner.v1','benchmark-device']]);
globalThis.localStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
const records=Array.from({length:3650},(_,i)=>{const day=new Date(2016,0,1+i);const date=localDay(day);return {...store.emptyRecord(),date,userId:'benchmark-device',answers:['good','normal','good','normal'],note:'가'.repeat(300),photoId:'benchmark-device:'+date+':p',photoComment:'나'.repeat(100),stage:'care',completedCareIds:['water','rest','music'],careRecommendations:Array.from({length:7},(_,j)=>({date:localDay(new Date(2016,0,1+i-j)),ids:['water','rest','music'],title:'오늘은 나를 위해 잠깐 시간을 내볼까요?'}))};});
const raw=JSON.stringify(records);data.set(store.RECORDS_KEY,raw);
let start=performance.now();store.readRecords();const coldReadMs=performance.now()-start;
start=performance.now();for(let i=0;i<100;i++)store.readRecords();const cached100ReadsMs=performance.now()-start;
start=performance.now();store.saveRecord({...store.readRecords()[0],note:'수정한 한마디'});const saveMs=performance.now()-start;
console.log(JSON.stringify({records:records.length,utf16Bytes:raw.length*2,coldReadMs,cached100ReadsMs,saveMs,photoBlobsLoaded:0,environment:'Node and memory localStorage adapter'},null,2));
