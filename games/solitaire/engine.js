'use strict';
const Solitaire=(()=>{
 const red=c=>c.s===1||c.s===2, deck=()=>Array.from({length:52},(_,id)=>({id,s:Math.floor(id/13),r:id%13+1,up:true}));
 function create(mode='klondike',draw=1,random=Math.random){let d=deck();for(let i=51;i>0;i--){let j=Math.floor(random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}let s={mode,draw,stock:[],waste:[],foundations:[[],[],[],[]],cells:[[],[],[],[]],columns:[],moves:0,removed:[]};
 if(mode==='spider'){d=[...d,...deck().map(c=>({...c,id:c.id+52}))].map(c=>({...c,s:0}));for(let i=d.length-1;i>0;i--){let j=Math.floor(random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}s.columns=Array.from({length:10},(_,i)=>d.splice(0,i<4?6:5).map((c,j)=>({...c,up:j===(i<4?5:4)})));s.stock=d;s.runs=0;}
 else if(mode==='tripeaks'){s.columns=[3,6,9,10].map(n=>d.splice(0,n));s.waste=[d.pop()];s.stock=d;}
 else if(mode==='pyramid'){s.columns=Array.from({length:7},(_,r)=>d.splice(0,r+1));s.waste=[d.pop()];s.stock=d;}
 else if(mode==='freecell'){s.columns=Array.from({length:8},()=>[]);d.forEach((c,i)=>s.columns[i%8].push(c));}
 else {s.columns=Array.from({length:7},(_,i)=>d.splice(0,i+1).map((c,j)=>({...c,up:j===i})));s.stock=d;}return s;}
 function pile(s,p){return p.kind==='waste'?s.waste:s[p.kind]?.[p.n];}
 function exposed(s,p){if(p.kind!=='columns')return true;if(s.mode==='tripeaks'){if(p.n===3)return true;let j=p.n===0?p.i*2:p.n===1?Math.floor(p.i/2)*3+p.i%2:p.i;return !s.columns[p.n+1][j]&&!s.columns[p.n+1][j+1];}return s.mode!=='pyramid'||p.n===6||(!s.columns[p.n+1][p.i]&&!s.columns[p.n+1][p.i+1]);}
 function valid(s,a,b){let src=pile(s,a),dst=pile(s,b);if(!src||!dst||(a.kind===b.kind&&a.n===b.n))return false;let i=a.i??src.length-1,c=src[i];if(!c?.up||['pyramid','tripeaks'].includes(s.mode))return false;let seq=src.slice(i);if(s.mode==='spider')return a.kind==='columns'&&b.kind==='columns'&&seq.every((x,j)=>x.up&&(!j||(seq[j-1].r===x.r+1&&seq[j-1].s===x.s)))&&(!dst.length||dst.at(-1).r===c.r+1);if(!seq.length||seq.some((c,j)=>j&&(!c.up||seq[j-1].r!==c.r+1||red(c)===red(seq[j-1]))))return false;
 if(b.kind==='foundations')return seq.length===1&&c.s===b.n&&c.r===dst.length+1;
 if(b.kind==='cells')return s.mode==='freecell'&&seq.length===1&&!dst.length;
 if(b.kind!=='columns')return false;let top=dst.at(-1);if(top?!(top.r===c.r+1&&red(top)!==red(c)):s.mode!=='freecell'&&c.r!==13)return false;
 if(s.mode==='freecell'){let free=s.cells.filter(x=>!x.length).length,empty=s.columns.filter((x,n)=>!x.length&&n!==b.n).length;return seq.length<=(free+1)*2**empty;}return true;}
 function settle(s){if(s.mode!=='spider')return;for(let p of s.columns){let run=p.slice(-13);if(run.length===13&&run.every((c,j)=>c.up&&c.r===13-j&&c.s===run[0].s)){s.removed.push(...p.splice(-13));s.runs++;if(p.length)p.at(-1).up=true;}}}
 function move(s,a,b){if(!valid(s,a,b))return false;let src=pile(s,a),i=a.i??src.length-1;pile(s,b).push(...src.splice(i));if(src.length)src.at(-1).up=true;s.moves++;settle(s);return true;}
 function draw(s){if(s.mode==='freecell')return false;if(s.mode==='spider'){if(s.stock.length<10||s.columns.some(p=>!p.length))return false;s.columns.forEach(p=>p.push({...s.stock.pop(),up:true}));s.moves++;settle(s);return true;}if(!s.stock.length){if(s.mode==='tripeaks'||!s.waste.length)return false;s.stock=s.waste.reverse();s.waste=[];}else for(let n=0;n<(['pyramid','tripeaks'].includes(s.mode)?1:s.draw)&&s.stock.length;n++)s.waste.push(s.stock.pop());s.moves++;return true;}
 function peak(s,p){let c=pile(s,p)?.[p.i];if(s.mode!=='tripeaks'||p.kind!=='columns'||!c||!exposed(s,p))return false;let gap=Math.abs(c.r-s.waste.at(-1).r);if(gap!==1&&gap!==12)return false;s.waste.push(c);s.columns[p.n][p.i]=null;s.moves++;return true;}
 function remove(s,a,b){if(s.mode!=='pyramid'||!exposed(s,a))return false;let src=pile(s,a),i=a.i??src.length-1,c=src?.[i];if(!c)return false;if(b){if(!exposed(s,b)||(a.kind===b.kind&&a.n===b.n&&a.i===b.i))return false;let dst=pile(s,b),j=b.i??dst.length-1,t=dst?.[j];if(!t||c.r+t.r!==13)return false;s.removed.push(t);if(b.kind==='columns')dst[j]=null;else dst.splice(j,1);}else if(c.r!==13)return false;s.removed.push(c);if(a.kind==='columns')src[i]=null;else src.splice(i,1);s.moves++;return true;}
 const won=s=>s.mode==='spider'?s.runs===8:['pyramid','tripeaks'].includes(s.mode)?s.columns.flat().every(c=>!c):s.foundations.every(p=>p.length===13);
 function hints(s){let sources=[];s.columns.forEach((p,n)=>p.forEach((c,i)=>{if(c?.up)sources.push({kind:'columns',n,i});}));if(s.waste.length)sources.push({kind:'waste',i:s.waste.length-1});s.cells.forEach((p,n)=>{if(p.length)sources.push({kind:'cells',n,i:0});});
 if(s.mode==='tripeaks')return sources.filter(p=>p.kind==='columns'&&exposed(s,p)&&[1,12].includes(Math.abs(pile(s,p)[p.i].r-s.waste.at(-1).r))).slice(0,1);
 if(s.mode==='pyramid'){sources=sources.filter(p=>exposed(s,p));for(let a of sources){if(pile(s,a)[a.i].r===13)return [a];for(let b of sources)if(a!==b&&pile(s,a)[a.i].r+pile(s,b)[b.i].r===13)return[a,b];}return [];}
 for(let kind of ['foundations','columns','cells'])for(let a of sources)for(let n=0;n<s[kind].length;n++){let b={kind,n};if(valid(s,a,b)&&!(kind==='columns'&&!s.columns[n].length&&a.i===0))return[a,b];}return [];}
 return {create,pile,valid,move,draw,remove,peak,won,hints,red,exposed};
})();
if(typeof module!=='undefined')module.exports=Solitaire;
