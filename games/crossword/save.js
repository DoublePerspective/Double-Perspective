'use strict';
function createSaveStore(storage,key,version=1){
 const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(36);};
 let seq=0,blocked=false,status='empty';
 function slot(s){try{let raw=storage.getItem(key+'.'+s);if(!raw)return null;let e=JSON.parse(raw);if(!Number.isSafeInteger(e.seq)||!Number.isInteger(e.version)||typeof e.data!=='string'||hash(e.data)!==e.sum)return null;return{...e,value:JSON.parse(e.data)};}catch{return null;}}
 function load(){let slots=['a','b'].map(slot).filter(Boolean).sort((a,b)=>b.seq-a.seq);seq=slots[0]?.seq||0;blocked=slots.some(s=>s.version>version);if(blocked){status='future';return null;}let newest=slots[0];if(!newest){try{status=storage.getItem(key+'.a')||storage.getItem(key+'.b')?'corrupt':'empty';}catch{status='unavailable';}return null;}if(newest.version!==version){blocked=true;status='migration';return null;}status='ok';return newest.value;}
 function save(value){if(blocked)return false;try{let data=JSON.stringify(value);if(data.length>200000)return false;let next=seq+1,e={seq:next,version,data,sum:hash(data)};storage.setItem(key+'.'+(next%2?'a':'b'),JSON.stringify(e));seq=next;status='ok';return true;}catch{return false;}}
 load();return{load,save,get status(){return status;},get blocked(){return blocked;}};
}
if(typeof module!=='undefined')module.exports=createSaveStore;
