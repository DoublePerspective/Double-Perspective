'use strict';
(function(){
const names=["Alpine Lake","Stillwater Lake","Ocean Breeze","Panoramic Valley","Forest Retreat","Autumn Lakeside","Coastal Sunset","Alpine Meadow","Maine Coon Kittens","Playful Puppies"];
const options=[{id:'plain',name:'Plain'},...names.map((name,i)=>({id:String(i+1),name}))];
const files={8:'alpine-meadow.webp',9:'maine-coon-kitten.webp'};
function photoFile(id){return 'backgrounds/'+(files[id]||id+'.webp');}
const key='as-background';
const container=document.getElementById('background-options');
function apply(id){const option=options.find(o=>o.id===id)||options[0];document.documentElement.dataset.background=option.id;document.body.style.setProperty('--scene',option.id==='plain'?'none':'url("'+photoFile(option.id)+'")');document.getElementById('background-name').textContent=option.name;container.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.background===option.id)));try{localStorage.setItem(key,option.id);}catch{}return option.id;}
options.forEach(option=>{const button=document.createElement('button');button.type='button';button.dataset.background=option.id;button.setAttribute('aria-pressed','false');const preview=document.createElement('span');preview.className='background-preview';if(option.id!=='plain'){const img=document.createElement('img');img.src=photoFile(option.id);img.alt='';img.loading='lazy';preview.append(img);}else preview.textContent='Plain';const label=document.createElement('span');label.textContent=option.name;button.append(preview,label);button.onclick=()=>apply(option.id);container.append(button);});
let saved='plain';try{saved=localStorage.getItem(key)||'plain';}catch{}apply(saved);
const opacityKey='as-playing-opacity';
const slider=document.getElementById('playing-opacity');
function setOpacity(raw){let value=raw===null||raw===''?84:Number(raw);if(!Number.isFinite(value))value=84;value=Math.round(Math.max(0,Math.min(100,value)));slider.value=String(value);document.getElementById('playing-opacity-value').textContent=value+'%';document.body.style.setProperty('--playing-opacity',value+'%');document.body.style.setProperty('--board-opacity',(value*32/84)+'%');document.querySelectorAll('[data-opacity]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.opacity)===value)));try{localStorage.setItem(opacityKey,String(value));}catch{}return value;}
let savedOpacity=null;try{savedOpacity=localStorage.getItem(opacityKey);}catch{}setOpacity(savedOpacity);
slider.oninput=()=>setOpacity(slider.value);
document.querySelectorAll('[data-opacity]').forEach(button=>button.onclick=()=>setOpacity(button.dataset.opacity));
['background-open','game-background'].forEach(id=>document.getElementById(id).onclick=()=>document.getElementById('background-dialog').showModal());
})();
