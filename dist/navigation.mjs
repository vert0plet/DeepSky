export const PAGE_ORDER=['catalog','sky','tonight','lists','journal','settings'];
export function pageDirection(from,to){return Math.sign(PAGE_ORDER.indexOf(to)-PAGE_ORDER.indexOf(from));}

export function animatePage(element,direction){
 if(!element||!direction||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 element.getAnimations().forEach(animation=>animation.cancel());
 element.animate([{opacity:.35,transform:`translateX(${direction*30}px)`},{opacity:1,transform:'translateX(0)'}],{duration:190,easing:'cubic-bezier(.2,.75,.25,1)'});
}
