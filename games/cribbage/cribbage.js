'use strict';
(()=>{
const C=Cribbage,t=window.ZZC,$=s=>document.querySelector(s),KEY='zz-cribbage-v1',STATS='zz-cribbage-stats';
const RANK=['','A','2','3','4','5','6','7','8','9','10','J','Q','K'],SUIT=['♠','♥','♦','♣'],SUITN=['spades','hearts','diamonds','clubs'];
function read(k,f){try{return JSON.parse(localStorage.getItem(k))??f;}catch{return f;}}
function write(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}}
let st=read(KEY,null),sel=[],hint=[],msg='',timer=null;
if(!st||st.v!==1)st=null;

/* ---------- static text ---------- */
document.documentElement.dataset.theme=read('as-theme','light');
$('#theme').onclick=()=>{let th=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=th;write('as-theme',th);};
$('#edition').textContent=window.EDITION==='pro'?'· PRO':'· FREE';$('#banner').hidden=window.EDITION==='pro';
$('#kicker').textContent=t('THE CRIBBAGE BOARD');$('#headline').innerHTML='';$('#headline').append(t('Peg by peg,'),document.createElement('br'),t('a quiet game.'));$('#tagline').textContent=t('A classic board. A patient opponent.');
$('#play-title').textContent=t('Cribbage');$('#play-sub').textContent=t('Play against the computer · first to 121');$('#rules').textContent=t('How to play');
$('#home').textContent='← '+t('Menu');$('#title').textContent=t('Cribbage');$('#name-me').textContent=t('You');$('#name-them').textContent=t('Opponent');
$('#hint').textContent='✧ '+t('Hint');$('#new').textContent=t('New game');$('#help-open').textContent=t('How to play');$('#game-designs').textContent=t('Card design');$('#game-music').textContent='♫ '+t('Music');
$('#starter-label').textContent=t('Starter');$('#help-title').textContent=t('Cribbage');$('#help-text').textContent=t('HELP');$('#board').setAttribute('aria-label',t('Cribbage board'));
$('#rules').onclick=$('#help-open').onclick=()=>$('#help').showModal();$('#game-designs').onclick=$('#card-designs').onclick=()=>$('#design-dialog').showModal();$('#game-music').onclick=()=>$('#music-open').click();

/* ---------- card designs (shared with the collection) ---------- */
const designs=['parchment','sage','linen','mist','dusk'];
function setDesign(name){if(!designs.includes(name))name='parchment';document.documentElement.dataset.deck=name;write('as-card-design',name);document.querySelectorAll('[data-design]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.design===name)));$('#design-name').textContent=name[0].toUpperCase()+name.slice(1);}
setDesign(read('as-card-design','parchment'));document.querySelectorAll('[data-design]').forEach(b=>b.onclick=()=>setDesign(b.dataset.design));

/* ---------- cards ---------- */
function pips(c){const suit=SUIT[c.s],pairs=ys=>ys.flatMap(y=>[[29,y],[71,y]]);
 const layouts={1:[[50,83]],2:[[50,48],[50,118]],3:[[50,48],[50,83],[50,118]],4:pairs([48,118]),5:[...pairs([48,118]),[50,83]],6:pairs([48,83,118]),7:[...pairs([48,83,118]),[50,65.5]],8:[...pairs([48,83,118]),[50,65.5],[50,100.5]],9:[...pairs([45,70,95,120]),[50,82.5]],10:[...pairs([45,70,95,120]),[50,57.5],[50,107.5]]};
 const body=c.r<=10?layouts[c.r].map(([x,y])=>'<text class="card-pip" x="'+x+'" y="'+y+'"'+(y>84?' transform="rotate(180 '+x+' '+y+')"':'')+'>'+suit+'</text>').join(''):'<text class="court-rank" x="50" y="75">'+RANK[c.r]+'</text><text class="court-suit" x="50" y="112">'+suit+'</text>';
 return '<svg class="pip-face" viewBox="0 0 100 145" aria-hidden="true" focusable="false">'+body+'</svg>';}
function label(c){return t.lang==='en'?`${['','Ace','2','3','4','5','6','7','8','9','10','Jack','Queen','King'][c.r]} of ${SUITN[c.s]}`:RANK[c.r]+' '+t(SUITN[c.s]);}
function cardEl(c,cls=''){let b=document.createElement('button');b.type='button';b.className='card cb-card'+(c.s===1||c.s===2?' red':'')+(cls?' '+cls:'');b.setAttribute('aria-label',label(c));b.innerHTML=`<span class="corner" aria-hidden="true"><span class="rank">${RANK[c.r]}</span><span class="suit">${SUIT[c.s]}</span></span>`+pips(c);return b;}
function backEl(){let d=document.createElement('span');d.className='card back cb-card';d.setAttribute('aria-hidden','true');return d;}
const same=C.same;

/* ---------- menu ---------- */
function stats(){let s=read(STATS,{played:0,won:0,best:0});$('#stats').textContent=t('Games won: {0} of {1}',s.won,s.played)+(s.best?' · '+t('Best hand: {0}',s.best):'');
 let live=st&&st.phase!=='gameover';$('#resume').hidden=!live;$('#resume').textContent=t('Continue your game')+' →';$('#play-title').textContent=live?t('New game'):t('Cribbage');}
stats();
$('#resume').onclick=()=>show();
$('#play').onclick=()=>{if(st&&st.phase!=='gameover'&&!confirm(t('Start a new game? The current game will end.')))return;st=C.create();sel=[];hint=[];msg='';save();show();};
$('#home').onclick=()=>{clearTimeout(timer);$('#game').hidden=true;$('#menu').hidden=false;stats();};
$('#new').onclick=()=>{if(st.phase!=='gameover'&&!confirm(t('Start a new game? The current game will end.')))return;clearTimeout(timer);st=C.create();sel=[];hint=[];msg='';save();render();step();};
function show(){$('#menu').hidden=true;$('#game').hidden=false;window.scrollTo(0,0);render();step();}
function save(){write(KEY,st);}
window.GameSave={save};

/* ---------- messages ---------- */
const who=p=>p===0?t('You'):t('Opponent');
function describe(events){let parts=[];for(let e of events){if(e.why==='saygo')parts.push(t('{0}: Go.',who(e.p)));else if(['fifteen','thirtyone','pair','pair3','pair4','go','last'].includes(e.why))parts.push(who(e.p)+': '+t(e.why));else if(e.why==='heels')parts.push(t('heels'));else if(e.why==='run')parts.push(who(e.p)+': '+t('run',String(e.pts)));}return parts.join(' · ');}

/* ---------- computer turns ---------- */
function step(){clearTimeout(timer);if(!st||$('#game').hidden)return;
 if(st.phase==='peg'&&st.peg.turn===1){timer=setTimeout(()=>{let c=C.aiPeg(st,1);if(c){C.peg(st,1,c);msg=describe(st.events);afterScore();}save();render();step();},780);}}
function afterScore(){if(st.phase==='gameover'&&!st.recorded){st.recorded=true;let s=read(STATS,{played:0,won:0,best:0});s.played++;if(st.winner===0)s.won++;write(STATS,s);if(st.winner===0){let w=read('as-wins',{});w.cribbage=(w.cribbage||0)+1;write('as-wins',w);}}}

/* ---------- player actions ---------- */
function tap(c){if(st.phase==='discard'){let i=sel.findIndex(x=>same(x,c));if(i>=0)sel.splice(i,1);else if(sel.length<2)sel.push(c);else{sel.shift();sel.push(c);}hint=[];render();return;}
 if(st.phase!=='peg'||st.peg.turn!==0)return;if(C.val(c)+st.peg.count>31){msg=t('That card would take the count past 31.');render();return;}
 C.peg(st,0,c);hint=[];msg=describe(st.events);afterScore();save();render();step();}
$('#hint').onclick=()=>{if(st.phase==='discard'){hint=C.aiDiscard(st.hands[0],st.dealer===0);msg=t('Hint: the outlined cards are good for the crib.');}else if(st.phase==='peg'&&st.peg.turn===0){hint=[C.aiPeg(st,0)];msg=t('Hint: play the outlined card.');}render();};

/* ---------- board ---------- */
function holeXY(n,lane){/* n 1..120 */let row=n<=60?0:1,i=n<=60?n-1:120-n,x=22+i*5+Math.floor(i/5)*1.6,y=lane*36+10+row*12;return [x,y];}
function drawBoard(){let svg=$('#board'),h='<rect x="1" y="1" width="358" height="72" rx="10" class="cb-wood"/>';
 for(let lane=0;lane<2;lane++){for(let n=1;n<=120;n++){let [x,y]=holeXY(n,lane);h+=`<circle cx="${x.toFixed(1)}" cy="${y}" r="1.5" class="cb-hole"/>`;}
  h+=`<circle cx="352" cy="${lane*36+16}" r="2.4" class="cb-hole cb-finish"/><circle cx="11" cy="${lane*36+10}" r="1.25" class="cb-hole"/><circle cx="11" cy="${lane*36+22}" r="1.25" class="cb-hole"/>`;}
 h+='<line x1="10" y1="37" x2="350" y2="37" class="cb-divider"/>';
 /* pegs: lane 0 = you, lane 1 = opponent */
 for(let p=0;p<2;p++){let lane=p,pos=n=>n<=0?[11,lane*36+(n===0?10:22)]:n>=121?[352,lane*36+16]:holeXY(n,lane);
  let back=st.back[p],front=st.scores[p];let [bx,by]=pos(back===front?-1:back);let [fx,fy]=pos(front);
  h+=`<circle cx="${bx}" cy="${by}" r="3.3" class="cb-peg ${p?'them':'me'} cb-back"/><circle cx="${fx}" cy="${fy}" r="3.9" class="cb-peg ${p?'them':'me'}"/>`;}
 svg.innerHTML=h;}

/* ---------- render ---------- */
function render(){if(!st)return;drawBoard();$('#score-me').textContent=st.scores[0];$('#score-them').textContent=st.scores[1];
 $('#dealer-note').textContent=t('Dealer')+': '+who(st.dealer);
 let ownCrib=st.dealer===0;$('#crib-label').textContent=ownCrib?t('Your crib'):t('Their crib');
 /* opponent */
 let opp=$('#opp-hand');opp.replaceChildren();let oppCards=st.phase==='discard'?6:st.hands[1].length;for(let i=0;i<oppCards;i++)opp.append(backEl());$('#opp-label').textContent=t('Opponent');
 /* starter and crib */
 let sEl=$('#starter');sEl.replaceChildren();if(st.starter){let e=cardEl(st.starter);e.disabled=true;sEl.append(e);}else sEl.append(backEl());
 let cEl=$('#crib');cEl.replaceChildren();if(st.crib.length||st.phase!=='discard'){let b=backEl();b.dataset.n=st.crib.length;cEl.append(b);}
 /* pegging pile */
 let pile=$('#pile'),count=$('#count');pile.replaceChildren();let showBox=$('#show');showBox.hidden=true;
 if(st.phase==='peg'||(st.peg&&st.phase==='gameover'&&!st.show)){let run=st.peg.run.length?st.peg.run:[];run.forEach((c,i)=>{let e=cardEl(c,c.p?'cb-theirs':'cb-mine');e.disabled=true;e.style.left=(i*22)+'px';pile.append(e);});pile.style.width=(run.length?(run.length-1)*22+64:64)+'px';count.textContent=t('Count')+' '+st.peg.count;}
 else{pile.style.width='64px';count.textContent='';}
 if(st.phase==='show'||(st.phase==='gameover'&&st.show)){let it=C.showItem(st);showBox.hidden=false;renderShow(it,showBox);}
 /* hand */
 let handEl=$('#hand'),hand=st.phase==='show'||st.phase==='done'?(st.kept?st.kept[0]:st.hands[0]):st.hands[0];handEl.replaceChildren();
 let w=handEl.clientWidth||340,cw=Math.max(54,Math.min(88,w/5.4)),gap=hand.length>1?Math.min(cw+8,(w-cw)/(hand.length-1)):0,start=(w-(cw+gap*(hand.length-1)))/2;handEl.style.setProperty('--cw',cw+'px');
 let playable=st.phase==='peg'&&st.peg.turn===0?C.playable(st,0):null;
 hand.forEach((c,i)=>{let cls=[];if(sel.some(x=>same(x,c)))cls.push('cb-up');if(hint.some(x=>same(x,c)))cls.push('cb-hint');if(playable&&!playable.some(x=>same(x,c)))cls.push('cb-off');if(st.phase==='show'||st.phase==='done')cls.push('cb-rest');
  let e=cardEl(c,cls.join(' '));e.style.left=(start+i*gap)+'px';e.onclick=()=>tap(c);handEl.append(e);});
 /* action + notice */
 let act=$('#action');act.replaceChildren();let line=msg;
 const btn=(text,fn,primary=true)=>{let b=document.createElement('button');b.type='button';b.textContent=text;if(primary)b.className='cb-primary';b.onclick=fn;act.append(b);return b;};
 if(st.phase==='discard'){line=(line?line+' ':'')+t(ownCrib?'Choose two cards for your crib.':'Choose two cards for their crib.');let b=btn(t('Send to crib')+` (${sel.length}/2)`,()=>{C.discard(st,sel);sel=[];hint=[];msg=describe(st.events);afterScore();save();render();step();});b.disabled=sel.length!==2;}
 else if(st.phase==='peg'){if(st.peg.turn===0)line=(line?line+' ':'')+t('Your turn. Play a card.');else if(!line)line=t('Waiting for the opponent…');}
 else if(st.phase==='show'){btn(t('Continue'),()=>{let it=C.showItem(st);C.showNext(st);if(it.who===0)best(it.result.total);msg='';afterScore();save();render();});}
 else if(st.phase==='done'){btn(t('Next deal'),()=>{C.nextDeal(st);msg='';sel=[];hint=[];save();render();step();});}
 if(st.phase==='gameover'){line=(st.winner===0?t('You win!'):t('The opponent wins.'))+(st.skunk?' '+t('Skunk!'):'')+(msg?'\n'+msg:'');btn(t('New game'),()=>{st=C.create();msg='';sel=[];hint=[];save();render();step();});}
 $('#notice').textContent=line;$('#hint').disabled=!(st.phase==='discard'||(st.phase==='peg'&&st.peg.turn===0));}
function best(n){let s=read(STATS,{played:0,won:0,best:0});if(n>s.best){s.best=n;write(STATS,s);}}
function renderShow(it,box){let title=it.crib?(it.who===0?t('Your crib'):t('Their crib')):(it.who===0?t('Your hand'):t('Their hand'));
 box.innerHTML='<div class="cb-show-head"><b></b><output></output></div><div class="cb-show-cards"></div><ul class="cb-show-list"></ul>';box.querySelector('b').textContent=title;box.querySelector('output').textContent=t('{0} points',it.result.total);
 let cards=box.querySelector('.cb-show-cards');[...it.cards,st.starter].forEach((c,i)=>{let e=cardEl(c,i===it.cards.length?'cb-starter':'');e.disabled=true;cards.append(e);});
 let groups={fifteen:[],pair:[],run:[],flush:[],nobs:[]};it.result.items.forEach(x=>groups[x.type].push(x));let list=box.querySelector('ul');
 const names={fifteen:'Fifteens',pair:'Pairs',run:'Runs',flush:'Flush',nobs:'Nobs'};let any=false;
 for(let k in groups){let g=groups[k];if(!g.length)continue;any=true;let pts=g.reduce((a,x)=>a+x.pts,0),li=document.createElement('li');li.innerHTML='<span></span><b></b>';li.querySelector('span').textContent=t(names[k])+(g.length>1?` ×${g.length}`:'');li.querySelector('b').textContent='+'+pts;list.append(li);}
 if(!any){let li=document.createElement('li');li.textContent=t('No points');list.append(li);}}
window.addEventListener('resize',()=>{if(!$('#game').hidden)render();});

/* ---------- Android back button ---------- */
window.__back=()=>{let d=document.querySelector('dialog[open]');if(d){d.close();return;}if(!$('#game').hidden){$('#home').click();return;}window.AndroidApp?.exit?.();};
window.__pause=()=>{if(st)save();};
window.ZZCribbage={get state(){return st;},set state(v){st=v;},render};
})();
