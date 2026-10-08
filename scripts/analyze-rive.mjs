import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.document = { createElement: () => ({ getContext: () => null }), body: {}, addEventListener() {} };
globalThis.window = { devicePixelRatio: 1, requestAnimationFrame: () => 0, cancelAnimationFrame() {}, addEventListener() {} };
const { RuntimeLoader } = require('@rive-app/canvas');
RuntimeLoader.setWasmBinary(Uint8Array.from(fs.readFileSync('node_modules/@rive-app/canvas/rive.wasm')).buffer);
const runtime = await RuntimeLoader.awaitInstance();
const report = [];
for (const path of ['식물.riv', '식물최종.riv', 'public/plant-final.riv']) {
 const file = await runtime.load(new Uint8Array(fs.readFileSync(path)));
 const artboards = [];
 for (let i=0;i<file.artboardCount();i++) {
  const art = file.artboardByIndex(i), animations=[], machines=[];
  for(let j=0;j<art.animationCount();j++) {const a=art.animationByIndex(j); animations.push({name:a.name, durationFrames:a.duration, durationSeconds:a.duration/a.fps, fps:a.fps,loop:a.loopValue});}
  for(let j=0;j<art.stateMachineCount();j++) {const m=art.stateMachineByIndex(j); const inst=new runtime.StateMachineInstance(m,art); const inputs=[]; for(let k=0;k<inst.inputCount();k++){const inp=inst.input(k);inputs.push({name:inp.name,type:inp.type});} machines.push({name:m.name,inputs});inst.delete();}
  artboards.push({name:art.name,bounds:art.bounds,animations,machines}); art.delete();
 }
 report.push({path,artboards}); file.delete();
}
fs.mkdirSync('design-output',{recursive:true});
fs.writeFileSync('design-output/rive-inventory.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
process.exit(0);


