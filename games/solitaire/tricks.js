'use strict';
/* Zenith & Zero: Hearts and Spades engine with computer players.
   Seats: 0 You (south), 1 West, 2 North, 3 East. Play runs clockwise 0 → 1 → 2 → 3.
   Cards: {s,r} with s 0♠ 1♥ 2♦ 3♣ and r 2..14 (ace high). */
const Tricks=(()=>{
 const SP=0,HE=1,DI=2,CL=3;
 const id=c=>c.s*13+c.r-2, same=(a,b)=>a&&b&&a.s===b.s&&a.r===b.r;
 const isQS=c=>c.s===SP&&c.r===12;
 function deck(){let d=[];for(let s=0;s<4;s++)for(let r=2;r<=14;r++)d.push({s,r});return d;}
 function shuffle(d,rnd){for(let i=d.length-1;i>0;i--){let j=Math.floor(rnd()*(i+1));[d[i],d[j]]=[d[j],d[i]];}return d;}
 const order=[SP,HE,CL,DI];
 function sortHand(h){return h.sort((a,b)=>order.indexOf(a.s)-order.indexOf(b.s)||a.r-b.r);}
 function create(game,rnd=Math.random){let s={game,v:1,handNo:0,scores:game==='hearts'?[0,0,0,0]:[0,0],bags:[0,0],history:[],phase:'deal',dealer:3};deal(s,rnd);return s;}
 function deal(s,rnd=Math.random){let d=shuffle(deck(),rnd);s.hands=[0,1,2,3].map(p=>sortHand(d.slice(p*13,p*13+13)));s.trick=[];s.taken=[[],[],[],[]];s.tricks=[0,0,0,0];s.broken=false;s.trickNo=0;s.played=[];s.last=null;s.result=null;
  if(s.game==='hearts'){s.passDir=s.handNo%4;s.phase=s.passDir===3?'play':'pass';if(s.phase==='play')startPlay(s);}
  else{s.dealer=(s.dealer+1)%4;s.bids=[null,null,null,null];s.turn=(s.dealer+1)%4;s.phase='bid';}
  return s;}
 function startPlay(s){s.phase='play';if(s.game==='hearts'){s.turn=s.hands.findIndex(h=>h.some(c=>c.s===CL&&c.r===2));}else s.turn=(s.dealer+1)%4;s.leader=s.turn;}
 const passTarget=(p,dir)=>dir===0?(p+1)%4:dir===1?(p+3)%4:(p+2)%4;
 function aiPass(hand){let n=[0,0,0,0];hand.forEach(c=>n[c.s]++);let hasQ=hand.some(isQS),lowSpades=hand.filter(c=>c.s===SP&&c.r<12).length;
  let score=c=>{let v=c.r;if(isQS(c))v=lowSpades>=4?5:100;else if(c.s===SP&&c.r>12)v=lowSpades>=4&&!hasQ?6:hasQ&&lowSpades>=3?8:90;else if(c.s===HE)v=c.r+10;if(n[c.s]<=2&&c.s!==SP)v+=6;return v;};
  return [...hand].sort((a,b)=>score(b)-score(a)).slice(0,3);}
 function pass(s,mine){if(s.phase!=='pass'||mine.length!==3)return false;let gifts=[0,1,2,3].map(p=>p===0?mine:aiPass(s.hands[p]));
  gifts.forEach((g,p)=>{s.hands[p]=s.hands[p].filter(c=>!g.some(x=>same(x,c)));});
  gifts.forEach((g,p)=>{let t=passTarget(p,s.passDir);s.hands[t].push(...g.map(c=>({...c,from:p})));sortHand(s.hands[t]);});
  s.received=s.hands[0].filter(c=>c.from!==undefined).map(c=>({s:c.s,r:c.r}));s.hands.forEach(h=>h.forEach(c=>delete c.from));startPlay(s);return true;}
 /* ---- bidding (spades) ---- */
 function aiBid(hand){let by=[0,1,2,3].map(x=>hand.filter(c=>c.s===x).map(c=>c.r).sort((a,b)=>b-a)),t=0;
  for(let x of [HE,DI,CL]){let h=by[x];if(h.includes(14))t+=1;if(h.includes(13))t+=h.includes(14)?.9:h.length>=2?.7:.2;if(h.includes(12)&&h.length>=3&&(h.includes(14)||h.includes(13)))t+=.4;}
  let sp=by[SP];if(sp.includes(14))t+=1;if(sp.includes(13))t+=sp.length>=2?1:.4;if(sp.includes(12))t+=sp.length>=3?.8:.3;t+=Math.max(0,sp.length-3)*.9;
  if(sp.length>=3)for(let x of [HE,DI,CL]){if(!by[x].length)t+=1;else if(by[x].length===1)t+=.5;}
  if(t<1.1&&sp.length<=3&&!sp.some(r=>r>=11)&&![HE,DI,CL].some(x=>by[x].some(r=>r>=13)))return 0;
  return Math.max(1,Math.min(13,Math.round(t)));}
 function bid(s,p,n){if(s.phase!=='bid'||s.turn!==p||!(n>=0&&n<=13))return false;s.bids[p]=n;s.turn=(p+1)%4;if(s.bids.every(b=>b!==null))startPlay(s);return true;}
 /* ---- play ---- */
 function legal(s,p){let h=s.hands[p];if(!h.length)return[];if(s.trick.length){let suit=s.trick[0].c.s,f=h.filter(c=>c.s===suit);if(f.length)return f;
   if(s.game==='hearts'&&s.trickNo===0){let safe=h.filter(c=>c.s!==HE&&!isQS(c));if(safe.length)return safe;let noQ=h.filter(c=>!isQS(c));return noQ.length?noQ:h;}return h;}
  if(s.game==='hearts'){if(s.trickNo===0)return h.filter(c=>c.s===CL&&c.r===2);if(!s.broken){let o=h.filter(c=>c.s!==HE);if(o.length)return o;}}
  else if(!s.broken){let o=h.filter(c=>c.s!==SP);if(o.length)return o;}return h;}
 function why(s,p,c){/* reason a card is not legal, as a message key */
  if(s.trick.length){let suit=s.trick[0].c.s;if(c.s!==suit&&s.hands[p].some(x=>x.s===suit))return 'follow';return 'firstTrick';}
  if(s.game==='hearts'&&s.trickNo===0)return 'lead2c';return s.game==='hearts'?'heartsBroken':'spadesBroken';}
 function winnerOf(s,trick){let lead=trick[0].c.s,best=trick[0];for(let t of trick){let c=t.c,b=best.c;if(s.game==='spades'&&c.s===SP&&b.s!==SP){best=t;continue;}if(c.s===b.s&&c.r>b.r)best=t;}return best.p;}
 const points=cards=>cards.reduce((n,c)=>n+(c.s===HE?1:isQS(c)?13:0),0);
 function play(s,p,c){if(s.phase!=='play'||s.turn!==p||s.trick.length===4)return false;if(!legal(s,p).some(x=>same(x,c)))return false;
  s.hands[p]=s.hands[p].filter(x=>!same(x,c));s.trick.push({p,c:{s:c.s,r:c.r}});s.played.push({s:c.s,r:c.r});
  if(s.game==='hearts'&&c.s===HE)s.broken=true;if(s.game==='spades'&&c.s===SP)s.broken=true;
  if(s.trick.length<4)s.turn=(p+1)%4;else s.turn=-1;return true;}
 function collect(s){if(s.trick.length!==4)return null;let w=winnerOf(s,s.trick);s.taken[w].push(...s.trick.map(t=>t.c));s.tricks[w]++;s.last={trick:s.trick,winner:w};s.trick=[];s.trickNo++;s.turn=w;s.leader=w;if(s.trickNo===13)endHand(s);return w;}
 function endHand(s){s.phase='handover';let r={};if(s.game==='hearts'){let pts=s.taken.map(points),moon=pts.indexOf(26);if(moon>=0)pts=pts.map((_,i)=>i===moon?0:26);r={points:pts,moon};pts.forEach((v,i)=>s.scores[i]+=v);
   let max=Math.max(...s.scores),min=Math.min(...s.scores);if(max>=100&&s.scores.filter(v=>v===min).length===1){s.phase='gameover';r.winner=s.scores.indexOf(min);}}
  else{r.teams=[0,1].map(t=>{let seats=[t,t+2],contract=seats.reduce((n,p)=>n+(s.bids[p]>0?s.bids[p]:0),0),won=seats.reduce((n,p)=>n+(s.bids[p]>0?s.tricks[p]:0),0),nilTricks=seats.reduce((n,p)=>n+(s.bids[p]===0?s.tricks[p]:0),0),pts=0,bags=0,nils=[];
     if(contract>0){if(won>=contract){pts+=contract*10+(won-contract);bags+=won-contract;}else pts-=contract*10;}
     seats.forEach(p=>{if(s.bids[p]===0){let ok=s.tricks[p]===0;pts+=ok?100:-100;nils.push({p,ok});}});bags+=nilTricks;pts+=nilTricks;
     s.bags[t]+=bags;let penalty=0;while(s.bags[t]>=10){s.bags[t]-=10;pts-=100;penalty++;}s.scores[t]+=pts;return{contract,won,pts,bags,nils,penalty};});
   let [a,b]=s.scores;if((a>=500||b>=500||a<=-200||b<=-200)&&a!==b){s.phase='gameover';r.winner=a>b?0:1;}}
  s.result=r;s.history.push(s.game==='hearts'?r.points:r.teams.map(t=>t.pts));s.history=s.history.slice(-40);return r;}
 function next(s,rnd=Math.random){if(s.phase!=='handover')return false;s.handNo++;deal(s,rnd);return true;}
 /* ---- computer play ---- */
 function remaining(s,suit){let gone=s.played.filter(c=>c.s===suit).map(c=>c.r);return [14,13,12,11,10,9,8,7,6,5,4,3,2].filter(r=>!gone.includes(r));}
 function aiPlay(s,p){let opts=legal(s,p);if(opts.length===1)return opts[0];return s.game==='hearts'?heartsMove(s,p,opts):spadesMove(s,p,opts);}
 const lo=a=>a.reduce((m,c)=>c.r<m.r?c:m),hi=a=>a.reduce((m,c)=>c.r>m.r?c:m);
 function heartsMove(s,p,opts){let hand=s.hands[p],qOut=s.played.some(isQS)||hand.some(isQS);
  if(!s.trick.length){let holdQ=hand.some(isQS);let score=c=>{let v=c.r;if(c.s===SP&&(holdQ||c.r>=12))v+=20;if(c.s===SP&&!holdQ&&!qOut&&c.r<12)v-=4;if(c.s===HE)v+=3;let len=hand.filter(x=>x.s===c.s).length;v+=len*.3;return v;};return opts.reduce((m,c)=>score(c)<score(m)?c:m);}
  let suit=s.trick[0].c.s,winning=Math.max(...s.trick.filter(t=>t.c.s===suit).map(t=>t.c.r)),pts=points(s.trick.map(t=>t.c)),last=s.trick.length===3;
  if(opts[0].s===suit){let under=opts.filter(c=>c.r<winning);if(under.length)return hi(under);
   if(last&&pts===0){let safe=opts.filter(c=>!isQS(c));return hi(safe.length?safe:opts);}
   if(suit===SP){let safe=opts.filter(c=>!isQS(c));return lo(safe.length?safe:opts);}return last?hi(opts):lo(opts);}
  let q=opts.find(isQS);if(q)return q;if(!s.played.some(isQS)&&!hand.some(isQS)){let big=opts.filter(c=>c.s===SP&&c.r>12);if(big.length)return hi(big);}
  let hearts=opts.filter(c=>c.s===HE);if(hearts.length)return hi(hearts);
  let len=x=>hand.filter(c=>c.s===x).length;return opts.reduce((m,c)=>(c.r-len(c.s)*.6)>(m.r-len(m.s)*.6)?c:m);}
 function spadesMove(s,p,opts){let hand=s.hands[p],partner=(p+2)%4,team=p%2,nil=s.bids[p]===0,partnerNil=s.bids[partner]===0;
  let contract=[team,team+2].reduce((n,x)=>n+(s.bids[x]>0?s.bids[x]:0),0),won=[team,team+2].reduce((n,x)=>n+(s.bids[x]>0?s.tricks[x]:0),0),need=contract-won;
  let beats=(c,b)=>(c.s===b.s&&c.r>b.r)||(c.s===SP&&b.s!==SP);
  if(!s.trick.length){if(nil)return lo(opts);let masters=opts.filter(c=>c.s!==SP&&remaining(s,c.s)[0]===c.r);if(need>0&&masters.length)return hi(masters);
   let non=opts.filter(c=>c.s!==SP);if(non.length){let len=x=>hand.filter(c=>c.s===x).length;let best=non.filter(c=>c.r<12);let pool=best.length?best:non;return pool.reduce((m,c)=>len(c.s)>len(m.s)||(len(c.s)===len(m.s)&&c.r<m.r)?c:m);}
   let topSp=opts.find(c=>remaining(s,SP)[0]===c.r);return need>0&&topSp?topSp:lo(opts);}
  let wi=winnerOf(s,s.trick),wc=s.trick.find(t=>t.p===wi).c,last=s.trick.length===3,winners=opts.filter(c=>beats(c,wc)),losers=opts.filter(c=>!beats(c,wc));
  if(nil){if(losers.length)return hi(losers);return lo(opts);}
  if(wi===partner&&!partnerNil){let sure=last||(wc.s!==SP?remaining(s,wc.s).filter(r=>r>wc.r&&!hand.some(c=>c.s===wc.s&&c.r===r)).length===0&&!s.trick.some(t=>t.c.s===SP):remaining(s,SP).filter(r=>r>wc.r).every(r=>hand.some(c=>c.s===SP&&c.r===r)));if(sure)return losers.length?lo(losers):lo(opts);}
  if((need>0||partnerNil&&wi===partner)&&winners.length){let pick=last?lo(winners):(()=>{let sameSuit=winners.filter(c=>c.s===wc.s||c.s===s.trick[0].c.s);let pool=sameSuit.length?sameSuit:winners;let tops=pool.filter(c=>c.s!==SP&&remaining(s,c.s)[0]===c.r);return tops.length?lo(tops):(pool[0].s===s.trick[0].c.s?hi(pool):lo(pool));})();return pick;}
  if(need<=0&&losers.length)return hi(losers);return losers.length?lo(losers):lo(opts);}
 return {create,deal,pass,aiPass,bid,aiBid,legal,why,play,collect,next,aiPlay,winnerOf,points,sortHand,same,isQS,id};
})();
if(typeof module!=='undefined')module.exports=Tricks;
