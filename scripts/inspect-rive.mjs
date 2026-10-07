import fs from 'node:fs';
const base = 'https://raw.githubusercontent.com/rive-app/rive-runtime/main/include/rive/generated/';
const paths = ['component','node','transform_component','world_transform_component','drawable','layout_component','artboard','shapes/shape','shapes/path','shapes/points_path','shapes/cubic_vertex','shapes/straight_vertex','shapes/vertex','shapes/parametric_path','shapes/rectangle','shapes/ellipse','shapes/paint/fill','shapes/paint/shape_paint','shapes/paint/solid_color'];
const types = new Map(); const fields = new Map();
const tree = await (await fetch('https://api.github.com/repos/rive-app/rive-runtime/git/trees/main?recursive=1')).json();
for (const item of tree.tree) {
 if (/^include\/rive\/generated\/(animation\/|shapes\/|layout_component_style|clipping_shape)/.test(item.path) && item.path.endsWith('_base.hpp')) {
   paths.push(item.path.replace('include/rive/generated/','').replace('_base.hpp',''));
 }
}
await Promise.all(paths.map(async path => {
 const response = await fetch(base + path + '_base.hpp'); if (!response.ok) return;
 const s = await response.text(); const type = s.match(/typeKey = (\d+)/); if(type)types.set(Number(type[1]),path);
 const props=Object.fromEntries([...s.matchAll(/(\w+)PropertyKey = (\d+)/g)].map(m=>[m[1],Number(m[2])]));
 for(const m of s.matchAll(/case (\w+)PropertyKey:([\s\S]*?)return true;/g)){const kind=m[2].match(/Core(\w+)Type::/);if(kind)fields.set(props[m[1]],{name:m[1],kind:kind[1]});}
}));
const bytes=fs.readFileSync('public/plant.riv');let offset=4;
function uint(){let n=0,shift=0,b;do{b=bytes[offset++];n+=(b&127)*2**shift;shift+=7;if(shift>56)throw Error('varint');}while(b&128);return n;}
console.log('version',uint(),uint(),'file',uint());
const keys=[];for(let k=uint();k;k=uint())keys.push(k);
for(let i=0;i<keys.length;i+=4){const packed=bytes.readUInt32LE(offset);offset+=4;for(let j=0;j<4&&i+j<keys.length;j++){if(!fields.has(keys[i+j]))fields.set(keys[i+j],{name:String(keys[i+j]),kind:['Uint','String','Double','Color'][(packed>>(j*2))&3]});}}
const objects=[];
while(offset<bytes.length){const start=offset;const type=uint();const props={};const positions={};let key;while((key=uint())){const f=fields.get(key);if(!f){console.log('UNKNOWN',key,'type',type,'offset',offset,'previous',objects.slice(-3));process.exit(1);}positions[f.name]=offset;let value;switch(f.kind){case 'Id':case 'Uint':value=uint();break;case 'Bool':value=bytes[offset++];break;case 'Double':value=bytes.readFloatLE(offset);offset+=4;break;case 'Color':value=bytes.readUInt32LE(offset);offset+=4;break;case 'String':{const len=uint();value=bytes.subarray(offset,offset+len).toString();offset+=len;break;}default:throw Error(f.kind);}props[f.name]=value;}objects.push({index:objects.length,start,end:offset,type,name:types.get(type),props,positions});if([1,18,20,3].includes(type))console.log(JSON.stringify(objects.at(-1)));}
