import {paceTime} from './pacing.js';
// Eight photographed-style poses share a wrist anchor. Cross-fading the joint
// poses and moving the wrist/shadow independently avoids a sliding icon effect.
const ATLAS = new URL('./assets/hand-signals.png', import.meta.url).href;
const motionReduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const instructions = {
  hit:['HIT','指先でテーブルを2回、軽く叩く'],
  stand:['STAND','手のひらを伏せて、横に振る'],
  double:['DOUBLE','同額のチップを追加し、指で1枚を示す'],
  split:['SPLIT','2本の指で、2つのハンドを示す'],
  surrender:['SURRENDER','人差し指で、テーブルに横線を引く']
};
const posePosition = index => `${(index%4)*100/3}% ${Math.floor(index/4)*100}%`;

export class HandSignals {
  constructor(layer) {
    this.layer=layer;this.animations=[];this.token=0;
    this.image=new Image();this.image.src=ATLAS;
    this.loaded=this.image.decode().catch(()=>{});
  }
  stop(){this.token++;for(const a of this.animations)a.cancel();this.animations=[];this.layer.hidden=true;}
  async play(action){
    this.stop();const token=this.token;
    await this.loaded;if(token!==this.token)return;
    const [title,description]=instructions[action];
    const poses={hit:[0,1],stand:[2,3],double:[4,4],split:[4,5],surrender:[6,7]}[action];
    this.layer.className='gesture-overlay realistic-signal signal-'+action;
    this.layer.innerHTML='<span class="hand-contact" aria-hidden="true"></span><span class="hand-ground-shadow" aria-hidden="true"></span><div class="hand-wrist" aria-hidden="true"><span class="hand-pose pose-a"></span><span class="hand-pose pose-b"></span></div><span class="gesture-caption"><b>'+title+'</b>'+description+'</span>';
    for(const [i,el] of [...this.layer.querySelectorAll('.hand-pose')].entries()){el.style.backgroundImage=`url("${ATLAS}")`;el.style.backgroundPosition=posePosition(poses[i]);}
    this.layer.hidden=false;
    const wrist=this.layer.querySelector('.hand-wrist'),shadow=this.layer.querySelector('.hand-ground-shadow'),contact=this.layer.querySelector('.hand-contact'),second=this.layer.querySelector('.pose-b');
    const isReduced=motionReduced(),duration=paceTime(3400);
    const run=(el,frames,options={})=>{const a=el.animate(frames,{duration,fill:'both',easing:'linear',...options});this.animations.push(a);return a.finished.catch(()=>{});};
    const incoming={opacity:0,transform:'translate(30px,80px) rotate(12deg) scale(.87)',offset:0};
    const outgoing={opacity:0,transform:'translate(25px,65px) rotate(8deg) scale(.92)',offset:1};
    const trajectories={
      hit:[incoming,{opacity:1,transform:'translate(0,-13px) rotate(-8deg) scale(1)',offset:.23},{transform:'translate(0,7px) rotate(-8deg) scale(.97)',offset:.36},{transform:'translate(0,-12px) rotate(-8deg) scale(1)',offset:.49},{transform:'translate(0,7px) rotate(-8deg) scale(.97)',offset:.61},{opacity:1,transform:'translate(0,-8px) rotate(-8deg)',offset:.76},outgoing],
      stand:[incoming,{opacity:1,transform:'translate(-44px,0) rotate(-17deg) rotateX(26deg)',offset:.23},{transform:'translate(45px,-4px) rotate(12deg) rotateX(26deg)',offset:.43},{transform:'translate(-38px,0) rotate(-14deg) rotateX(26deg)',offset:.64},{opacity:1,transform:'translate(30px,-2px) rotate(9deg) rotateX(26deg)',offset:.82},outgoing],
      double:[incoming,{opacity:1,transform:'translate(0,8px) rotate(-9deg) scale(.96)',offset:.23},{transform:'translate(0,-18px) rotate(-9deg) scale(1.04)',offset:.43},{opacity:1,transform:'translate(0,-13px) rotate(-6deg) scale(1.02)',offset:.78},outgoing],
      split:[incoming,{opacity:1,transform:'translate(0,8px) rotate(-7deg)',offset:.22},{transform:'translate(0,-15px) rotate(-7deg)',offset:.40},{transform:'translate(-22px,-12px) rotate(-15deg)',offset:.57},{opacity:1,transform:'translate(24px,-12px) rotate(6deg)',offset:.78},outgoing],
      surrender:[incoming,{opacity:1,transform:'translate(-45px,3px) rotate(7deg) scale(.99)',offset:.25},{transform:'translate(-43px,10px) rotate(7deg) scale(.97)',offset:.34},{opacity:1,transform:'translate(48px,10px) rotate(7deg) scale(.97)',offset:.74},outgoing]
    };
    const still=[{opacity:0,transform:'none'},{opacity:1,transform:'none',offset:.15},{opacity:1,transform:'none',offset:.85},{opacity:0,transform:'none'}];
    const poseFrames=action==='hit'?[{opacity:0},{opacity:0,offset:.25},{opacity:1,offset:.35},{opacity:1,offset:.39},{opacity:0,offset:.49},{opacity:1,offset:.60},{opacity:1,offset:.64},{opacity:0,offset:.75},{opacity:0}]:action==='split'?[{opacity:0},{opacity:0,offset:.22},{opacity:1,offset:.42},{opacity:1}]:action==='stand'?[{opacity:0},{opacity:0,offset:.25},{opacity:1,offset:.43},{opacity:0,offset:.64},{opacity:.8,offset:.82},{opacity:0}]:[{opacity:0},{opacity:.7,offset:.35},{opacity:.8,offset:.75},{opacity:0}];
    const jointFrames=isReduced?[{opacity:1},{opacity:1}]:poseFrames;
    const promises=[run(wrist,isReduced?still:trajectories[action]),run(second,jointFrames),run(this.layer.querySelector('.pose-a'),jointFrames.map(frame=>({...frame,opacity:1-frame.opacity}))),run(shadow,isReduced?[{opacity:0},{opacity:0}]:[{opacity:0,transform:'translate(20px,24px) scale(.85)'},{opacity:.18,transform:'translate(0,5px) scale(1.04)',offset:.23},{opacity:.36,transform:'translate(0,0) scale(.94)',offset:.36},{opacity:.17,transform:'translate(0,8px) scale(1.06)',offset:.49},{opacity:.34,transform:'translate(0,0) scale(.94)',offset:.61},{opacity:.15,transform:'translate(18px,8px) scale(1.05)',offset:.80},{opacity:0}])];
    if(action==='hit'&&!isReduced)promises.push(run(contact,[{opacity:0,transform:'scale(.4)'},{opacity:0,offset:.31},{opacity:.7,transform:'scale(.7)',offset:.36},{opacity:0,transform:'scale(1.7)',offset:.47},{opacity:0,transform:'scale(.4)',offset:.56},{opacity:.7,transform:'scale(.7)',offset:.61},{opacity:0,transform:'scale(1.7)',offset:.74},{opacity:0}]));
    await Promise.all(promises);
    if(token===this.token){this.layer.hidden=true;this.animations.forEach(a=>a.cancel());this.animations=[];}
  }
}
