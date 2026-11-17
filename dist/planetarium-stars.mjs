import {equatorial,transform,dot} from './planetarium-math.mjs?v=59d02c126dc7cb25';

// Conservative 15° RA / 10° Dec tiles avoid projecting the entire HYG selection
// every animation frame. A tile's 10° bounding radius includes its corners.
export function indexStarTiles(stars){
 const tiles=new Map();
 for(const star of stars){
  const ra=Math.floor(star.star[0]/15),dec=Math.min(17,Math.floor((star.star[1]+90)/10)),key=ra+':'+dec;
  if(!tiles.has(key))tiles.set(key,{eq:equatorial(ra*15+7.5,dec*10-85),stars:[]});
  tiles.get(key).stars.push(star);
 }
 return [...tiles.values()];
}
export function tilesInView(tiles,matrix,view,width,height,fov){
 const corner=Math.atan(Math.hypot(width,height)/Math.min(width,height)*Math.tan(fov*Math.PI/360));
 const threshold=Math.cos(Math.min(Math.PI,corner+10.5*Math.PI/180));
 return tiles.filter(tile=>dot(transform(matrix,tile.eq),view.forward)>=threshold);
}
