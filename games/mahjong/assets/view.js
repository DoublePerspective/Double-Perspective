(function(root){
  function fit(tiles,width,height){
    const raw=tiles.map(t=>({id:t.id,x:t.x*49+t.y*70.805,y:t.y*50.575-t.x*35-t.z*24}));
    const minX=Math.min(...raw.map(p=>p.x))-8,minY=Math.min(...raw.map(p=>p.y))-8;
    const w=Math.max(...raw.map(p=>p.x))+124-minX,h=Math.max(...raw.map(p=>p.y))+114-minY;
    const scale=Math.max(.01,Math.min((Math.max(1,width)-24)/w,(Math.max(1,height)-24)/h,1.3));
    return {width:w*scale,height:h*scale,scale,positions:Object.fromEntries(raw.map(p=>[p.id,{x:(p.x-minX)*scale,y:(p.y-minY)*scale}]))};
  }
  const api={fit};if(typeof module!=='undefined')module.exports=api;else root.MahjongView=api;
})(globalThis);
