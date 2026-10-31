'use strict';
/* Zenith & Zero Cribbage engine: two players, six-card deal, game to 121.
   Players: 0 you, 1 opponent. Cards {s,r}: s 0♠ 1♥ 2♦ 3♣, r 1 (ace) .. 13 (king). */
const Cribbage=(()=>{
 const val=c=>Math.min(10,c.r),same=(a,b)=>a&&b&&a.s===b.s&&a.r===b.r,WIN=121;
 function deck(){let d=[];for(let s=0;s<4;s++)for(let r=1;r<=13;r++)d.push({s,r});return d;}
 function shuffle(d,rnd){for(let i=d.length-1;i>0;i--){let j=Math.floor(rnd()*(i+1));[d[i],d[j]]=[d[j],d[i]];}return d;}
 const sort=h=>h.sort((a,b)=>a.r-b.r||a.s-b.s);
 /* ---------- hand scoring ---------- */
 function score(hand,starter,crib=false){let all=starter?[...hand,starter]:[...hand],items=[],n=all.length;
  for(let m=1;m<1<<n;m++){let pick=all.filter((_,i)=>m>>i&1);if(pick.length>=2&&pick.reduce((a,c)=>a+val(c),0)===15)items.push({type:'fifteen',pts:2,cards:pick});}
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if(all[i].r===all[j].r)items.push({type:'pair',pts:2,cards:[all[i],all[j]]});
  let counts=new Map();all.forEach(c=>counts.set(c.r,(counts.get(c.r)||0)+1));let ranks=[...counts.keys()].sort((a,b)=>a-b),best=[];
  for(let i=0;i<ranks.length;i++){let j=i;while(j+1<ranks.length&&ranks[j+1]===ranks[j]+1)j++;if(j-i+1>=3&&j-i+1>best.length)best=ranks.slice(i,j+1);i=j;}
  if(best.length){let combos=[[]];for(let r of best){let cs=all.filter(c=>c.r===r);combos=combos.flatMap(x=>cs.map(c=>[...x,c]));}combos.forEach(cards=>items.push({type:'run',pts:best.length,cards}));}
  let suit=hand[0]?.s;if(hand.length===4&&hand.every(c=>c.s===suit)){if(starter&&starter.s===suit)items.push({type:'flush',pts:5,cards:all});else if(!crib)items.push({type:'flush',pts:4,cards:[...hand]});}
  if(starter){let nob=hand.find(c=>c.r===11&&c.s===starter.s);if(nob)items.push({type:'nobs',pts:1,cards:[nob]});}
  return {total:items.reduce((a,x)=>a+x.pts,0),items};}
 /* ---------- pegging ---------- */
 function pegPoints(run,count){let items=[],last=run[run.length-1];if(count===15)items.push({type:'fifteen',pts:2});if(count===31)items.push({type:'thirtyone',pts:2});
  let k=1;while(k<run.length&&run[run.length-1-k].r===last.r)k++;if(k>=2)items.push({type:k===2?'pair':k===3?'pair3':'pair4',pts:[0,0,2,6,12][k]});
  for(let len=run.length;len>=3;len--){let tail=run.slice(-len).map(c=>c.r).sort((a,b)=>a-b);if(tail.every((r,i)=>!i||r===tail[i-1]+1)){items.push({type:'run',pts:len,len});break;}}
  return items;}
 /* ---------- game flow ---------- */
 function create(rnd=Math.random){let s={v:1,scores:[0,0],back:[0,0],dealer:rnd()<.5?0:1,handNo:0,phase:'discard',stats:null,log:[],history:[]};deal(s,rnd);return s;}
 function deal(s,rnd=Math.random){let d=shuffle(deck(),rnd);s.hands=[sort(d.slice(0,6)),sort(d.slice(6,12))];s.deck=d.slice(12);s.crib=[];s.starter=null;s.phase='discard';s.peg=null;s.show=null;s.events=[];s.kept=null;return s;}
 function add(s,p,pts,why){if(!pts||s.phase==='gameover')return;s.back[p]=s.scores[p];s.scores[p]=Math.min(WIN,s.scores[p]+pts);s.events.push({p,pts,why});if(s.scores[p]>=WIN){s.phase='gameover';s.winner=p;s.skunk=s.scores[1-p]<91?(s.scores[1-p]<61?2:1):0;}}
 function discard(s,mine,rnd=Math.random){if(s.phase!=='discard'||mine.length!==2)return false;let theirs=aiDiscard(s.hands[1],s.dealer===1);
  s.hands[0]=s.hands[0].filter(c=>!mine.some(x=>same(x,c)));s.hands[1]=s.hands[1].filter(c=>!theirs.some(x=>same(x,c)));s.crib=sort([...mine,...theirs]);s.kept=[[...s.hands[0]],[...s.hands[1]]];
  s.starter=s.deck[Math.floor(rnd()*s.deck.length)];s.events=[];s.phase='peg';if(s.starter.r===11)add(s,s.dealer,2,'heels');
  s.peg={turn:1-s.dealer,count:0,run:[],played:[],go:[false,false],last:null};return true;}
 const canPlay=(s,p)=>s.hands[p].some(c=>val(c)+s.peg.count<=31);
 function playable(s,p){return s.hands[p].filter(c=>val(c)+s.peg.count<=31);}
 function peg(s,p,c){let g=s.peg;if(s.phase!=='peg'||g.turn!==p||!s.hands[p].some(x=>same(x,c))||val(c)+g.count>31)return null;
  s.hands[p]=s.hands[p].filter(x=>!same(x,c));g.count+=val(c);g.run.push({...c,p});g.played.push({...c,p});g.last=p;s.events=[];
  let items=pegPoints(g.run,g.count);items.forEach(x=>add(s,p,x.pts,x.type));if(s.phase==='gameover')return items;
  if(g.count===31){reset(s,p);return items;}advance(s,p);return items;}
 function advance(s,p){let g=s.peg,o=1-p;if(!s.hands[0].length&&!s.hands[1].length){if(g.count>0&&g.count<31)add(s,g.last,1,'last');finishPeg(s);return;}
  if(canPlay(s,o)){g.turn=o;return;}if(canPlay(s,p)){if(!g.go[o]&&s.hands[o].length)s.events.push({p:o,pts:0,why:'saygo'});g.go[o]=true;g.turn=p;return;}
  /* nobody can play: go point to last player, start a new count */
  if(s.hands[o].length&&!g.go[o])s.events.push({p:o,pts:0,why:'saygo'});if(g.count<31)add(s,g.last,1,'go');reset(s,g.last);}
 function reset(s,lastP){let g=s.peg;g.count=0;g.run=[];g.go=[false,false];if(s.phase==='gameover')return;if(!s.hands[0].length&&!s.hands[1].length){finishPeg(s);return;}let o=1-lastP;g.turn=s.hands[o].length?o:lastP;}
 function finishPeg(s){if(s.phase==='gameover')return;s.phase='show';s.show={step:0};}
 /* show order: non-dealer hand, dealer hand, crib */
 function showItem(s){let nd=1-s.dealer,step=s.show.step;let who=step===0?nd:s.dealer,cards=step<2?s.kept[who]:s.crib;return {who,crib:step===2,cards,result:score(cards,s.starter,step===2)};}
 function showNext(s){if(s.phase!=='show')return false;let it=showItem(s);s.events=[];add(s,it.who,it.result.total,it.crib?'crib':'hand');s.history.push({step:s.show.step,who:it.who,pts:it.result.total});s.history=s.history.slice(-60);if(s.phase==='gameover')return true;s.show.step++;if(s.show.step>2){s.phase='done';}return true;}
 function nextDeal(s,rnd=Math.random){if(s.phase!=='done')return false;s.dealer=1-s.dealer;s.handNo++;deal(s,rnd);return true;}
 /* ---------- computer ---------- */
 function cribGuess(two,mine){let [a,b]=two,v=0;if(a.r===b.r)v+=2;if(val(a)+val(b)===15)v+=2;if(a.r===5)v+=1.5;if(b.r===5)v+=1.5;if(Math.abs(a.r-b.r)===1)v+=1;if(Math.abs(a.r-b.r)===2)v+=.5;if(a.s===b.s)v+=.2;v+=1.2;return mine?v:-v;}
 function aiDiscard(hand,myCrib){let best=null,known=hand;let rest=deck().filter(c=>!known.some(x=>same(x,c)));
  for(let i=0;i<6;i++)for(let j=i+1;j<6;j++){let keep=hand.filter((_,k)=>k!==i&&k!==j),two=[hand[i],hand[j]],sum=0;for(let st of rest)sum+=score(keep,st).total;let ev=sum/rest.length+cribGuess(two,myCrib);if(!best||ev>best.ev)best={ev,two};}
  return best.two;}
 function aiPeg(s,p){let opts=playable(s,p);if(opts.length<=1)return opts[0]||null;let g=s.peg,hand=s.hands[p];
  let rate=c=>{let count=g.count+val(c),run=[...g.run,c],pts=pegPoints(run,count).reduce((a,x)=>a+x.pts,0),v=pts*10;
   if(count===5||count===21)v-=6;if(count<15&&15-count===10)v-=4;if(count<31&&31-count===10)v-=3;
   if(g.run.length&&Math.abs(g.run[g.run.length-1].r-c.r)===1&&count<=29)v-=2;if(g.run.length&&g.run[g.run.length-1].r===c.r&&count+val(c)<=31)v-=1;
   if(!g.run.length){if(c.r===5)v-=5;if(val(c)<=4)v+=2;if(hand.some(x=>x!==c&&val(x)+val(c)===15))v+=1;}
   v-=val(c)*.15;if(count===31)v+=2;return v;};
  return opts.reduce((m,c)=>rate(c)>rate(m)?c:m);}
 return {create,deal,discard,peg,playable,canPlay,showItem,showNext,nextDeal,aiDiscard,aiPeg,score,pegPoints,val,same,WIN};
})();
if(typeof module!=='undefined')module.exports=Cribbage;
