'use strict';
/* Hearts and Spades inside Zenith & Zero Solitaire. Adds two menu choices and a card-table screen. */
(()=>{
const T=Tricks,t=window.ZZT,$=s=>document.querySelector(s),KEY='zz-tricks-v1';
const RANK=['','A','2','3','4','5','6','7','8','9','10','J','Q','K','A'],SUIT=['♠','♥','♦','♣'],SUITN=['spades','hearts','diamonds','clubs'];
function read(k,f){try{return JSON.parse(localStorage.getItem(k))??f;}catch{return f;}}
function write(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}}
let st=null,timer=null,event='',passSel=[],hint=[],showLast=false,lastTimer=null;
const names=()=>[t('You'),t('West'),st?.game==='spades'?t('Partner'):t('North'),t('East')];

/* ---------- menu entries ---------- */
const choices=$('.choices');
[['hearts','♥','amber','Avoid hearts and the queen of spades'],['spades','♠','','Team up with your partner · bid and take tricks']].forEach(([mode,sym,cls,sub])=>{
 let b=document.createElement('button');b.type='button';b.dataset.trick=mode;b.innerHTML=`<span class="symbol ${cls}">${sym}</span><div><b></b><small></small></div><span>→</span>`;
 b.querySelector('b').textContent=t(mode==='hearts'?'Hearts':'Spades');b.querySelector('small').textContent=t(sub);b.onclick=()=>open(mode);choices.append(b);});

/* ---------- screen ---------- */
const sec=document.createElement('section');sec.id='trick';sec.hidden=true;sec.innerHTML=`
<nav><button id="tr-home" type="button"></button><b id="tr-title"></b><button id="tr-scores" type="button"></button></nav>
<p id="tr-sub" class="tr-sub"></p>
<div class="tr-table"><div class="tr-seat" data-seat="2"></div><div class="tr-seat" data-seat="1"></div><div class="tr-center" id="tr-center"></div><div class="tr-seat" data-seat="3"></div></div>
<div class="tr-me"><div class="tr-seat tr-seat-me" data-seat="0"></div></div>
<p id="tr-notice" role="status" aria-live="polite"></p>
<div id="tr-action"></div>
<div id="tr-hand" aria-label="Your hand"></div>
<div class="tools"><button id="tr-hint" type="button"></button><button id="tr-last" type="button"></button><button id="tr-new" type="button"></button><button id="tr-rules" type="button"></button><button id="tr-design" type="button"></button><button id="tr-music" type="button"></button></div>`;
$('#game').after(sec);
const dlg=document.createElement('dialog');dlg.id='tr-score-dialog';dlg.innerHTML='<h2></h2><div class="tr-score-body"></div><button type="button" class="design-done"></button>';document.body.append(dlg);
dlg.querySelector('button').onclick=()=>dlg.close();
const help=document.createElement('dialog');help.id='tr-help';help.innerHTML='<h2></h2><p></p><button type="button" class="design-done"></button>';document.body.append(help);help.querySelector('button').onclick=()=>help.close();
$('#tr-home').textContent='← '+t('Menu');$('#tr-scores').textContent=t('Scores');$('#tr-hint').textContent='✧ '+t('Hint');$('#tr-last').textContent=t('Last trick');$('#tr-new').textContent=t('New game');$('#tr-rules').textContent=t('How to play');$('#tr-design').textContent=t('Card design');$('#tr-music').textContent='♫ '+t('Music');
dlg.querySelector('button').textContent=t('Done');help.querySelector('button').textContent=t('Done');

/* ---------- cards ---------- */
function label(c){return t.lang==='en'?`${['','Ace','2','3','4','5','6','7','8','9','10','Jack','Queen','King','Ace'][c.r]} of ${SUITN[c.s]}`:RANK[c.r]+' '+t(SUITN[c.s]);}
function cardEl(c,cls=''){let b=document.createElement('button');b.type='button';b.className='card tr-card'+(c.s===1||c.s===2?' red':'')+(cls?' '+cls:'');b.setAttribute('aria-label',label(c));
 b.innerHTML=`<span class="corner" aria-hidden="true"><span class="rank">${RANK[c.r]}</span><span class="suit">${SUIT[c.s]}</span></span>`+(typeof cardPips==='function'?cardPips({s:c.s,r:c.r===14?1:c.r}):'');return b;}
function backEl(){let d=document.createElement('span');d.className='card back tr-card';d.setAttribute('aria-hidden','true');return d;}

/* ---------- save / open ---------- */
function save(){let all=read(KEY,{});all[st.game]=st;write(KEY,all);}
function open(mode){let saved=read(KEY,{})[mode];st=saved&&saved.v===1&&saved.phase!=='gameover'?saved:T.create(mode);if(!saved||saved.phase==='gameover')save();
 event='';passSel=[];hint=[];$('#menu').hidden=true;$('#game').hidden=true;sec.hidden=false;window.scrollTo(0,0);render();step();}
function home(){clearTimeout(timer);sec.hidden=true;$('#menu').hidden=false;}
$('#tr-home').onclick=home;
$('#tr-new').onclick=()=>{if(st.phase!=='gameover'&&!confirm(t('Start a new game? The current game will end.')))return;clearTimeout(timer);st=T.create(st.game);save();event='';passSel=[];hint=[];render();step();};
$('#tr-rules').onclick=()=>{help.querySelector('h2').textContent=t(st.game==='hearts'?'Hearts':'Spades');help.querySelector('p').textContent=t(st.game==='hearts'?'HELP_HEARTS':'HELP_SPADES');help.showModal();};
$('#tr-design').onclick=()=>$('#design-dialog')?.showModal();$('#tr-music').onclick=()=>$('#music-open')?.click();
$('#tr-scores').onclick=scores;
$('#tr-last').onclick=()=>{if(!st.last)return;showLast=true;render();clearTimeout(lastTimer);lastTimer=setTimeout(()=>{showLast=false;render();},2600);};
$('#tr-hint').onclick=()=>{if(st.phase==='pass'){hint=T.aiPass(st.hands[0]);say(t('Hint: the outlined cards are good to pass.'));}
 else if(st.phase==='play'&&st.turn===0&&st.trick.length<4){hint=[T.aiPlay(st,0)];say(t('Hint: play the outlined card.'));}
 else if(st.phase==='bid'&&st.turn===0){say(t('Suggested: {0}',bidName(T.aiBid(st.hands[0]))));}render();};
document.querySelectorAll('[data-design]').forEach(b=>b.addEventListener('click',()=>{if(!sec.hidden)render();}));
window.addEventListener('resize',()=>{if(!sec.hidden)render();});
const bidName=n=>n===0?t('Nil'):String(n);
function say(m){event=m;}

/* ---------- computer turns ---------- */
function step(){clearTimeout(timer);if(!st||sec.hidden)return;
 if(st.phase==='bid'&&st.turn!==0){timer=setTimeout(()=>{T.bid(st,st.turn,T.aiBid(st.hands[st.turn]));save();render();step();},450);return;}
 if(st.phase!=='play')return;
 if(st.trick.length===4){timer=setTimeout(()=>{let w=T.collect(st);hint=[];say(w===0?t('You take the trick.'):t('{0} takes the trick.',names()[w]));if(st.phase==='gameover')record();save();render();step();},1150);return;}
 if(st.turn!==0){timer=setTimeout(()=>{T.play(st,st.turn,T.aiPlay(st,st.turn));save();render();step();},520);}}
function record(){let won=st.game==='hearts'?st.result.winner===0:st.result.winner===0;let s=read('zz-tricks-stats',{});let m=s[st.game]||{played:0,won:0};m.played++;if(won)m.won++;s[st.game]=m;write('zz-tricks-stats',s);
 if(won){let w=read('as-wins',{});w[st.game]=(w[st.game]||0)+1;write('as-wins',w);let el=$('#stats');if(el){let total=Object.values(w).reduce((a,b)=>a+b,0);el.textContent=`Your quiet victories · ${total} games completed`;}}}

/* ---------- player actions ---------- */
function tapCard(c){if(st.phase==='pass'){let i=passSel.findIndex(x=>T.same(x,c));if(i>=0)passSel.splice(i,1);else if(passSel.length<3)passSel.push(c);hint=[];render();return;}
 if(st.phase!=='play'||st.turn!==0||st.trick.length===4)return;
 if(!T.legal(st,0).some(x=>T.same(x,c))){say({follow:t('Follow the suit that was led.'),firstTrick:t('No points on the first trick.'),lead2c:t('The 2 of clubs leads the first trick.'),heartsBroken:t('Hearts are not broken yet.'),spadesBroken:t('Spades are not broken yet.')}[T.why(st,0,c)]);render();return;}
 T.play(st,0,c);hint=[];event='';if(st.trickNo===0)st.received=null;save();render();step();}

/* ---------- render ---------- */
function seatInfo(p){if(st.game==='hearts'){let pts=T.points(st.taken[p]);return `${st.scores[p]}${pts?` · +${pts}`:''}`;}
 let b=st.bids?.[p];return b===null||b===undefined?'…':`${t('Bid')} ${bidName(b)} · ${t('Won')} ${st.tricks[p]}`;}
function render(){if(!st)return;let n=names();$('#tr-title').textContent=t(st.game==='hearts'?'Hearts':'Spades');
 $('#tr-sub').textContent=st.game==='hearts'?t('Game to 100 · lowest score wins'):`${t('Us')} ${st.scores[0]} (${t('Bags')} ${st.bags[0]}) · ${t('Them')} ${st.scores[1]} (${t('Bags')} ${st.bags[1]})`;
 sec.querySelectorAll('.tr-seat').forEach(el=>{let p=+el.dataset.seat;el.classList.toggle('tr-turn',(st.phase==='play'||st.phase==='bid')&&st.turn===p&&st.trick.length<4);el.classList.toggle('tr-team',st.game==='spades'&&p%2===0);
  el.innerHTML=`<b></b><small></small>${p?'<span class="tr-count"></span>':''}`;el.querySelector('b').textContent=n[p];el.querySelector('small').textContent=seatInfo(p);if(p)el.querySelector('.tr-count').textContent=st.hands[p].length?'🂠 '+st.hands[p].length:'';});
 /* center trick */
 let center=$('#tr-center');center.replaceChildren();let trick=showLast&&st.last?st.last.trick:st.trick;
 trick.forEach(x=>{let el=cardEl(x.c,'tr-slot tr-s'+x.p);el.tabIndex=-1;el.disabled=true;if(showLast&&st.last.winner===x.p)el.classList.add('tr-win');center.append(el);});
 if(showLast){let cap=document.createElement('span');cap.className='tr-cap';cap.textContent=t('Last trick')+' · '+n[st.last.winner];center.append(cap);}
 /* hand */
 let handEl=$('#tr-hand'),hand=st.hands[0],legal=st.phase==='play'&&st.turn===0&&st.trick.length<4?T.legal(st,0):null;handEl.replaceChildren();
 let w=handEl.clientWidth||340,cw=Math.max(50,Math.min(84,w*.16)),gap=hand.length>1?Math.min(cw+6,(w-cw)/(hand.length-1)):0,start=(w-(cw+gap*(hand.length-1)))/2;
 handEl.style.setProperty('--cw',cw+'px');
 hand.forEach((c,i)=>{let cls=[];if(legal&&!legal.some(x=>T.same(x,c)))cls.push('tr-off');if(passSel.some(x=>T.same(x,c)))cls.push('tr-up');if(hint.some(x=>T.same(x,c)))cls.push('tr-hint');if(st.received?.some(x=>T.same(x,c)))cls.push('tr-new');
  let el=cardEl(c,cls.join(' '));el.style.left=(start+i*gap)+'px';el.style.zIndex=i+1;el.onclick=()=>tapCard(c);handEl.append(el);});
 /* action area + notice */
 let act=$('#tr-action');act.replaceChildren();let msg=event;
 if(st.phase==='pass'){msg=(msg?msg+' ':'')+t(['Choose three cards to pass left.','Choose three cards to pass right.','Choose three cards to pass across.'][st.passDir]);let b=document.createElement('button');b.type='button';b.className='tr-primary';b.textContent=t('Pass cards')+` (${passSel.length}/3)`;b.disabled=passSel.length!==3;b.onclick=()=>{T.pass(st,passSel);passSel=[];hint=[];event=t('You received the highlighted cards.');save();render();step();};act.append(b);}
 else if(st.phase==='bid'){if(st.turn===0){msg=t('How many tricks will you take?')+' '+t('Suggested: {0}',bidName(T.aiBid(st.hands[0])));let g=document.createElement('div');g.className='tr-bids';let sug=T.aiBid(st.hands[0]);for(let k=0;k<=13;k++){let b=document.createElement('button');b.type='button';b.textContent=bidName(k);if(k===sug)b.classList.add('tr-sug');b.onclick=()=>{T.bid(st,0,k);event='';save();render();step();};g.append(b);}act.append(g);}else msg=t('Waiting for the other players…');}
 else if(st.phase==='play'){if(st.turn===0&&st.trick.length<4){if(st.handNo%4===3&&st.trickNo===0&&st.game==='hearts'&&!event)msg=t('No passing this hand.');msg=(msg?msg+' ':'')+t('Your turn. Choose a card.');}}
 else if(st.phase==='handover'||st.phase==='gameover'){msg=summary();let b=document.createElement('button');b.type='button';b.className='tr-primary';b.textContent=st.phase==='gameover'?t('New game'):t('Next hand');b.onclick=()=>{if(st.phase==='gameover')st=T.create(st.game);else T.next(st);event='';passSel=[];hint=[];save();render();step();};act.append(b);let sb=document.createElement('button');sb.type='button';sb.textContent=t('Scores');sb.onclick=scores;act.append(sb);}
 $('#tr-notice').textContent=msg;$('#tr-last').disabled=!st.last;$('#tr-hint').disabled=!((st.phase==='pass')||(st.phase==='bid'&&st.turn===0)||(st.phase==='play'&&st.turn===0&&st.trick.length<4));}
function summary(){let r=st.result,n=names(),out=[t('Hand over.')];
 if(st.game==='hearts'){if(r.moon>=0)out.push(r.moon===0?t('You shot the moon! Everyone else takes 26.'):t('{0} shot the moon.',n[r.moon]));out.push(t('This hand')+': '+r.points.map((v,i)=>n[i]+' +'+v).join(' · '));}
 else r.teams.forEach((x,i)=>{let bits=[`${i?t('Them'):t('Us')}: ${t('Bid')} ${x.contract} · ${t('Won')} ${x.won} · ${x.pts>=0?'+':''}${x.pts}`];x.nils.forEach(z=>bits.push(n[z.p]+' '+t(z.ok?'Nil made':'Nil failed')));if(x.penalty)bits.push(t('Bag penalty')+' −'+100*x.penalty);out.push(bits.join(' · '));});
 if(st.phase==='gameover')out.push(st.game==='hearts'?(r.winner===0?t('You win the game!'):t('{0} wins the game.',n[r.winner])):(r.winner===0?t('Your team wins the game!'):t('The other team wins the game.')));
 return out.join('\n');}
function scores(){let n=names();dlg.querySelector('h2').textContent=t('Scores');let heads=st.game==='hearts'?n:[t('Us'),t('Them')];
 let rows=st.history.map((h,i)=>`<tr><td>${i+1}</td>${h.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('');
 dlg.querySelector('.tr-score-body').innerHTML=`<table class="tr-table-scores"><thead><tr><th>${t('Hand')}</th>${heads.map(h=>`<th></th>`).join('')}</tr></thead><tbody>${rows}</tbody><tfoot><tr><th>${t('Total')}</th>${st.scores.map(v=>`<th>${v}</th>`).join('')}</tr></tfoot></table><p class="tr-sub">${st.game==='hearts'?t('Game to 100 · lowest score wins'):t('Game to 500 · teams of two')}</p>`;
 dlg.querySelectorAll('thead th').forEach((th,i)=>{if(i)th.textContent=heads[i-1];});dlg.showModal();}

/* ---------- Android back button ---------- */
const prevBack=window.__back;window.__back=()=>{let d=document.querySelector('dialog[open]');if(d){d.close();return;}if(!sec.hidden){home();return;}if(prevBack){prevBack();return;}let g=$('#game');if(g&&!g.hidden){$('#home')?.click();return;}window.AndroidApp?.exit?.();};
window.ZZTricks={open,get state(){return st;}};
})();
