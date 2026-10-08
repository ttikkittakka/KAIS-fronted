import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const matrix=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
class Path { constructor(){this.commands=[];} moveTo(...v){this.commands.push(['M',v]);} lineTo(...v){this.commands.push(['L',v]);} bezierCurveTo(...v){this.commands.push(['C',v]);} closePath(){this.commands.push(['Z',[]]);} addPath(p,m){ const a=[m.a,m.b,m.c,m.d,m.e,m.f]; this.commands.push(...p.commands.map(([c,v])=>[c,v.flatMap((_,i)=>i%2?[]:[a[0]*v[i]+a[2]*v[i+1]+a[4],a[1]*v[i]+a[3]*v[i+1]+a[5]])])); } get d(){return this.commands.map(([c,v])=>c+v.join(' ')).join(' ');} }
globalThis.Path2D=Path;
globalThis.DOMMatrix=class {a=1;b=0;c=0;d=1;e=0;f=0;};
globalThis.document={createElement:()=>({getContext:()=>null}),body:{},addEventListener(){}};
globalThis.window={devicePixelRatio:1,requestAnimationFrame:()=>0,cancelAnimationFrame(){},addEventListener(){}};
const {RuntimeLoader}=require('@rive-app/canvas');
RuntimeLoader.setWasmBinary(Uint8Array.from(fs.readFileSync('node_modules/@rive-app/canvas/rive.wasm')).buffer);
const rt=await RuntimeLoader.awaitInstance();
const file=await rt.load(new Uint8Array(fs.readFileSync('public/plant-final.riv')));
fs.mkdirSync('design-output/rive-first-frame-diagnostic',{recursive:true});
for(const [name,kind,time] of [['basic','machine',0],['basic','machine',1/60],['basic','machine',0.5],['basic','machine',1],['basic','machine',2],['lowlow_ver.','machine',0],['lowlow_ver.','machine',1/60],['idle','animation',0],['idle','animation',1/60],['low_energy','animation',0]]) {
 const art=file.artboardByName('Artboard 1');
 const player=kind==='machine'?new rt.StateMachineInstance(art.stateMachineByName(name),art):new rt.LinearAnimationInstance(art.animationByName(name),art);
 for(let i=0;i<Math.round(time*60);i++){if(kind==='machine')player.advanceAndApply(1/60);else {player.advance(1/60);player.apply(1);art.advance(1/60);}}
 const parts=[], defs=[], stack=[];let mat=[1,0,0,1,0,0],clips=[];
 const ctx={globalAlpha:1,globalCompositeOperation:'source-over',canvas:{width:500,height:500},
  createRadialGradient(x,y,r,cx,cy,cr){return this.gradient("radialGradient",`cx="${cx}" cy="${cy}" r="${cr}" fx="${x}" fy="${y}"`);}, createLinearGradient(x,y,cx,cy){return this.gradient("linearGradient",`x1="${x}" y1="${y}" x2="${cx}" y2="${cy}"`);}, gradient(tag,attrs){const id="gradient"+defs.length, stops=[]; const index=defs.push("")-1;return {addColorStop(offset,color){stops.push(`<stop offset="${offset}" stop-color="${color}"/>`);defs[index]=`<${tag} id="${id}" gradientUnits="userSpaceOnUse" ${attrs}>${stops.join("")}</${tag}>`;},toString(){return `url(#${id})`;}};}, clearRect(){},save(){stack.push({mat:[...mat],clips:[...clips]});},restore(){({mat,clips}=stack.pop());},transform(...b){mat=matrix(mat,b);},
  clip(p,rule){const id='clip'+defs.length;defs.push(`<clipPath id="${id}"><path d="${p.d}" transform="matrix(${mat})" clip-rule="${rule}"/></clipPath>`);clips.push(id);},
  fill(p,rule){this.draw(p,`fill="${this.fillStyle}" fill-rule="${rule}"`);},
  stroke(p){this.draw(p,`fill="none" stroke="${this.strokeStyle}" stroke-width="${this.lineWidth}" stroke-linecap="${this.lineCap}" stroke-linejoin="${this.lineJoin}"`);},
  draw(p,style){parts.push(clips.map(id=>`<g clip-path="url(#${id})">`).join('')+`<path d="${p.d}" transform="matrix(${mat})" ${style} opacity="${this.globalAlpha}"/>`+'</g>'.repeat(clips.length));}
 };
 const renderer=rt.makeRenderer({width:500,height:500,getContext:()=>ctx});renderer.beginFrame();art.draw(renderer);rt.resolveAnimationFrame();
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"><defs>${defs.join('')}</defs>${parts.join('')}</svg>`;
 const slug=name+'-'+Math.round(time*60);
 fs.writeFileSync(`design-output/rive-first-frame-diagnostic/${slug}.svg`,svg);
 await require('sharp')(Buffer.from(svg)).png().toFile(`design-output/rive-first-frame-diagnostic/${slug}.png`);
 console.log(slug,parts.length);
 player.delete();renderer.delete();art.delete();
}
file.delete();process.exit(0);



