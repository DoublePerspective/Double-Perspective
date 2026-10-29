'use strict';
(() => {
 const base=document.currentScript&&document.currentScript.src?new URL('.',document.currentScript.src).href:document.baseURI;
 const tracks=[
  ['First Light Particles','music/first-light-particles.ogg'],
  ['Sunset Plains','music/sunset-plains.ogg'],
  ['Contemplation','music/contemplation.mp3'],
  ['Piano Emotional Solo 139','music/piano-emotional-solo-139.ogg'],
  ['Calm Theme','music/calm-theme.ogg']
 ];
 if(!document.getElementById('music-dialog'))document.body.insertAdjacentHTML('beforeend',"<dialog id=\"music-dialog\" aria-labelledby=\"music-heading\"><h2 id=\"music-heading\">A quieter soundtrack</h2><label class=\"setting\">Music on <input type=\"checkbox\" id=\"music-enabled\" role=\"switch\"></label><label class=\"setting\" for=\"music-volume\">Volume <output id=\"music-level\">25%</output></label><input id=\"music-volume\" class=\"music-volume\" type=\"range\" min=\"0\" max=\"100\" step=\"1\" value=\"25\"><label class=\"music-label\" for=\"music-track\">Track</label><select id=\"music-track\" class=\"music-select\"><option value=\"0\">First Light Particles</option><option value=\"1\">Sunset Plains</option><option value=\"2\">Contemplation</option><option value=\"3\">Piano Emotional Solo 139</option><option value=\"4\">Calm Theme</option></select><label class=\"music-label\" for=\"music-mode\">Playback</label><select id=\"music-mode\" class=\"music-select\"><option value=\"playlist\">Play all five tracks</option><option value=\"repeat\">Repeat selected track</option></select><p id=\"music-status\" role=\"status\" aria-live=\"polite\"></p><button class=\"design-done\" onclick=\"this.closest('dialog').close()\">Done</button></dialog><audio id=\"bg-music\" preload=\"none\"></audio>");
 if(!document.getElementById('music-open')){const button=document.createElement('button');button.type='button';button.id='music-open';button.textContent='♫ Music';button.setAttribute('aria-haspopup','dialog');const bar=document.querySelector('.zz-appearance-toolbar')||document.querySelector('header')||document.body;bar.append(button);}
 const audio=document.querySelector('#bg-music'),enabled=document.querySelector('#music-enabled'),volume=document.querySelector('#music-volume'),track=document.querySelector('#music-track'),mode=document.querySelector('#music-mode'),status=document.querySelector('#music-status'),level=document.querySelector('#music-level');
 let preferences;try{preferences=JSON.parse(localStorage.getItem('as-music'))||{};}catch{preferences={};}
 let settings={enabled:preferences.enabled!==false,volume:Number.isFinite(preferences.volume)?Math.max(0,Math.min(1,preferences.volume)):.25,track:Number.isInteger(preferences.track)&&preferences.track>=0&&preferences.track<tracks.length?preferences.track:0,mode:preferences.mode==='repeat'?'repeat':'playlist'};
 let unlocked=false,suspended=false,playingSource='',request=0;
 function save(){try{localStorage.setItem('as-music',JSON.stringify(settings));}catch{}}
 function controls(){enabled.checked=settings.enabled;volume.value=Math.round(settings.volume*100);level.textContent=volume.value+'%';track.value=String(settings.track);mode.value=settings.mode;audio.volume=settings.volume;audio.loop=settings.mode==='repeat';document.querySelector('#music-open').setAttribute('aria-label','Music settings, '+(settings.enabled?'on':'off'));}
 function sync(){
  controls();const ticket=++request;
  if(!settings.enabled||settings.volume===0||suspended||document.hidden){audio.pause();status.textContent=!settings.enabled?'Music is off.':settings.volume===0?'Volume is muted.':'Music paused.';return;}
  if(!unlocked){status.textContent='Music starts when you tap to play.';return;}
  const source=new URL(tracks[settings.track][1],base).href;if(source!==playingSource){audio.pause();audio.src=source;playingSource=source;audio.load();}
  status.textContent='Playing · '+tracks[settings.track][0];
  const playback=audio.play();if(playback?.catch)playback.catch(()=>{if(ticket===request)status.textContent='Playback paused. Tap Music on to retry.';});
 }
 function gesture(){if(!unlocked){unlocked=true;sync();}}
 document.addEventListener('pointerdown',gesture,{passive:true});document.addEventListener('keydown',gesture);
 enabled.onchange=()=>{settings.enabled=enabled.checked;unlocked=true;save();sync();};
 volume.oninput=()=>{settings.volume=Math.max(0,Math.min(100,Number(volume.value)||0))/100;save();sync();};
 track.onchange=()=>{settings.track=Math.max(0,Math.min(tracks.length-1,Number(track.value)||0));unlocked=true;save();sync();};
 mode.onchange=()=>{settings.mode=mode.value==='repeat'?'repeat':'playlist';save();sync();};
 audio.addEventListener('ended',()=>{if(settings.mode==='playlist'){settings.track=(settings.track+1)%tracks.length;save();sync();}});
 audio.addEventListener('error',()=>{status.textContent='This track could not play. Choose another track.';});
 document.addEventListener('visibilitychange',sync);window.addEventListener('pagehide',()=>audio.pause());window.addEventListener('pageshow',sync);
 document.querySelector('#music-open').onclick=()=>document.querySelector('#music-dialog').showModal();if(document.querySelector('#game-music'))document.querySelector('#game-music').onclick=()=>document.querySelector('#music-dialog').showModal();
 window.GameMusic={suspend(){suspended=true;sync();},resume(){suspended=false;sync();}};
 for(const [name,method] of [['__pause','suspend'],['__resume','resume']]){const previous=window[name];window[name]=(...args)=>{window.GameMusic[method]();return previous?.(...args);};}
 sync();
})();
