/* Zenith & Zero: an unmistakable end to a completed puzzle or card match. */
(function(root){
'use strict';
const words={
 en:['Congratulations!','You did it!','Puzzle complete','You won!','Game complete','This match went to your opponent. Ready for another?','Play again','Main menu','What would you like to do next?','Moves','Hints','Shuffles','Time','Score'],
 fr:['Félicitations !','Vous avez réussi !','Casse-tête terminé','Vous avez gagné !','Partie terminée','Cette partie revient à votre adversaire. On en fait une autre ?','Rejouer','Menu principal','Que souhaitez-vous faire maintenant ?','Coups','Indices','Mélanges','Temps','Score'],
 de:['Herzlichen Glückwunsch!','Geschafft!','Rätsel gelöst','Gewonnen!','Spiel beendet','Diese Partie ging an den Gegner. Noch eine Runde?','Erneut spielen','Hauptmenü','Wie möchtest du weitermachen?','Züge','Hinweise','Mischungen','Zeit','Punkte'],
 es:['¡Felicidades!','¡Lo has conseguido!','Rompecabezas completado','¡Has ganado!','Partida terminada','Esta partida fue para tu rival. ¿Otra partida?','Volver a jugar','Menú principal','¿Qué te gustaría hacer ahora?','Movimientos','Pistas','Mezclas','Tiempo','Puntuación'],
 it:['Congratulazioni!','Ce l’hai fatta!','Rompicapo completato','Hai vinto!','Partita terminata','Questa partita è andata all’avversario. Un’altra?','Gioca ancora','Menu principale','Cosa vuoi fare adesso?','Mosse','Suggerimenti','Mescolamenti','Tempo','Punteggio'],
 pt:['Parabéns!','Você conseguiu!','Quebra-cabeça concluído','Você venceu!','Partida encerrada','Seu adversário venceu esta partida. Vamos jogar outra?','Jogar novamente','Menu principal','O que você gostaria de fazer agora?','Jogadas','Dicas','Embaralhamentos','Tempo','Pontuação'],
 ru:['Поздравляем!','У вас получилось!','Головоломка решена','Вы победили!','Игра окончена','В этой партии победил соперник. Сыграем ещё?','Играть ещё','Главное меню','Что вы хотите сделать дальше?','Ходы','Подсказки','Перемешивания','Время','Счёт'],
 zh:['恭喜！','你做到了！','谜题已完成','你赢了！','对局结束','这局由对手获胜。再来一局吗？','再玩一次','主菜单','接下来想做什么？','步数','提示','洗牌次数','时间','得分'],
 ja:['おめでとうございます！','やりました！','パズル完成','あなたの勝ちです！','ゲーム終了','今回は相手の勝ちです。もう一度遊びますか？','もう一度遊ぶ','メインメニュー','次はどうしますか？','手数','ヒント','シャッフル','時間','スコア'],
 ko:['축하합니다!','해냈어요!','퍼즐 완성','승리했어요!','게임 종료','이번에는 상대가 이겼어요. 다시 해 볼까요?','다시 플레이','메인 메뉴','다음에는 무엇을 할까요?','이동','힌트','섞기','시간','점수']
};
const labels={moves:9,hints:10,shuffles:11,time:12,score:13};
let dialog,active=null,oldFocus=null,chosen=false,sequence=0;
const seen=new WeakSet();
function language(lang){const code=String(lang||root.ZZ_LANG||document.documentElement.lang||'en').toLowerCase().split(/[-_]/)[0];return words[code]?code:'en';}
function text(key,lang){return(words[language(lang)]||words.en)[key];}
function make(tag,cls,value){const e=document.createElement(tag);if(cls)e.className=cls;if(value!==undefined)e.textContent=String(value);return e;}
function ensure(){if(dialog)return;dialog=make('dialog','zz-victory');dialog.id='zz-victory';dialog.setAttribute('aria-labelledby','zz-victory-title');dialog.setAttribute('aria-describedby','zz-victory-description');document.body.append(dialog);
 dialog.addEventListener('cancel',e=>{e.preventDefault();choose('menu');});
 // Android back handlers in the games close the top dialog directly.
 dialog.addEventListener('close',()=>{if(!active)return;if(!chosen){const cb=active.menu;active=null;cb?.();}else active=null;sequence++;oldFocus?.isConnected&&oldFocus.focus?.({preventScroll:true});});
}
function choose(action){if(!active||chosen)return;chosen=true;const cb=active[action];dialog.close();cb?.();}
function show(options={}){
 if(active)return false;
 if(options.key&&typeof options.key==='object'){if(seen.has(options.key))return false;seen.add(options.key);}
 ensure();active=options;chosen=false;oldFocus=document.activeElement;dialog.replaceChildren();
 const lang=language(options.lang),w=words[lang],won=options.won!==false;dialog.lang=lang;dialog.dataset.outcome=won?'win':'complete';dialog.classList.remove('zz-victory-enter');
 const confetti=make('div','zz-victory-confetti');confetti.setAttribute('aria-hidden','true');if(won)for(let i=0;i<24;i++){const p=make('i');p.style.setProperty('--n',i);p.style.setProperty('--x',((i*37)%100)+'%');p.style.setProperty('--drift',((i%2?1:-1)*(20+i%5*12))+'px');confetti.append(p);}dialog.append(confetti);
 const medal=make('div','zz-victory-medal');medal.setAttribute('aria-hidden','true');medal.innerHTML=won?'<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44"/><path d="m29 50 14 14 29-30"/></svg>':'◇';dialog.append(medal);
 dialog.append(make('p','zz-victory-kicker',options.game||'ZENITH & ZERO'));
 const heading=make('h2','zz-victory-title',won?w[0]:w[4]);heading.id='zz-victory-title';dialog.append(heading);
 const description=make('p','zz-victory-description',won?(options.match?w[3]:w[2]):w[5]);description.id='zz-victory-description';dialog.append(description);
 if(options.subtitle)dialog.append(make('p','zz-victory-subtitle',options.subtitle));
 if(options.stats?.length){const stats=make('dl','zz-victory-stats');for(const [label,value]of options.stats){const group=make('div');group.append(make('dt','',labels[label]!==undefined?w[labels[label]]:label),make('dd','',value));stats.append(group);}dialog.append(stats);}
 // Content is built by the game (e.g. Sudoku score entry or the revealed Nonogram).
 if(options.content){const content=make('div','zz-victory-content');if(typeof options.content==='string')content.innerHTML=options.content;else content.append(options.content);dialog.append(content);}
 dialog.append(make('p','zz-victory-prompt',w[8]));const actions=make('div','zz-victory-actions');
 const again=make('button','zz-victory-again',w[6]),menu=make('button','zz-victory-menu',w[7]);again.type=menu.type='button';again.id='zz-victory-again';menu.id='zz-victory-menu';again.onclick=()=>choose('again');menu.onclick=()=>choose('menu');actions.append(again,menu);dialog.append(actions);
 dialog.showModal();const token=++sequence;root.requestAnimationFrame(()=>{if(sequence===token&&dialog.open)dialog.classList.add('zz-victory-enter');});again.focus({preventScroll:true});
 return true;
}
root.ZZWin={show,text,language,get active(){return!!active;},get dialog(){return dialog;}};
})(typeof window!=='undefined'?window:globalThis);
