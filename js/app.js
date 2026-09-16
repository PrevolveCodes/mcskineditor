import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const SIZE = 64;
const PIXELS = SIZE * SIZE * 4;

let d = new Uint8ClampedArray(PIXELS);
let undoStack = [];
let redoStack = [];
let tool = 'brush';
let brushSize = 1;
let opacity = 1;
let intensity = 1;
let fg = '#4aa3ff';
let grid = true;
let modelType = localStorage.getItem('skinforge:model') || 'classic';
let outerVisible = true;
let bodyVisible = true;
let down = false;
let strokeStart = null;
let strokeBase = null;
let cloneSource = null;
let selection = null;
let zoom2d = 8;
let db = null;
let pose = { head:[0,0,0], leftArm:0, rightArm:0 };

const skinCanvas = $('#skinCanvas');
const ctx = skinCanvas.getContext('2d', { willReadFrequently:true });
const textureCanvas = document.createElement('canvas');
textureCanvas.width = textureCanvas.height = SIZE;
const textureCtx = textureCanvas.getContext('2d', { willReadFrequently:true });
const texture = new THREE.CanvasTexture(textureCanvas);
texture.magFilter = THREE.NearestFilter;
texture.minFilter = THREE.NearestFilter;
texture.generateMipmaps = false;
texture.colorSpace = THREE.SRGBColorSpace;

const renderer = new THREE.WebGLRenderer({ canvas:$('#threeCanvas'), alpha:true, antialias:true, preserveDrawingBuffer:true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
const character = new THREE.Group();
scene.add(character);
const hemi = new THREE.HemisphereLight(0xffffff, 0x30343b, 2.0);
scene.add(hemi);
const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(5, 9, 7);
scene.add(keyLight);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const meshes = {};
const partGroups = {};
let cameraYaw = 0.35;
let cameraPitch = 0.05;
let cameraDistance = 9;
let cameraTarget = new THREE.Vector3(0, 3.5, 0);
let cameraDrag = null;
let currentBackground = null;

function px(x,y,v){ if(x>=0&&y>=0&&x<SIZE&&y<SIZE)d.set(v,(y*SIZE+x)*4); }
function get(x,y){ if(x<0||y<0||x>=SIZE||y>=SIZE)return [0,0,0,0]; const i=(y*SIZE+x)*4; return [d[i],d[i+1],d[i+2],d[i+3]]; }
function hex(h){ h=h.replace('#',''); if(h.length===3)h=h.split('').map(c=>c+c).join(''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16),255]; }
function same(a,b){ return a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2]&&a[3]===b[3]; }
function cloneData(){ return new Uint8ClampedArray(d); }
function setData(v){ d = new Uint8ClampedArray(v); renderTexture(); }
function saveState(){ undoStack.push(cloneData()); if(undoStack.length>100)undoStack.shift(); redoStack=[]; saveLocal(); }
function undo(){ if(!undoStack.length)return; redoStack.push(cloneData()); d=undoStack.pop(); renderTexture(); saveLocal(); }
function redo(){ if(!redoStack.length)return; undoStack.push(cloneData()); d=redoStack.pop(); renderTexture(); saveLocal(); }

function renderTexture(){
  const image=textureCtx.createImageData(SIZE,SIZE);
  image.data.set(d);
  textureCtx.putImageData(image,0,0);
  texture.needsUpdate=true;
  ctx.clearRect(0,0,SIZE,SIZE);
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(textureCanvas,0,0);
  drawGrid();
  drawSelection();
  updateModelStatus();
}
function drawGrid(){
  if(!grid)return;
  ctx.save();
  ctx.strokeStyle='rgba(255,255,255,.20)';
  ctx.lineWidth=.04;
  for(let i=0;i<=SIZE;i++){
    ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,SIZE);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(SIZE,i);ctx.stroke();
  }
  ctx.restore();
}
function drawSelection(){
  if(!selection)return;
  ctx.save();
  ctx.fillStyle='rgba(80,160,255,.18)';
  for(const key of selection){const [x,y]=key.split(',').map(Number);ctx.fillRect(x,y,1,1);}
  ctx.restore();
}
function cleanPNGCanvas(){
  const out=document.createElement('canvas');out.width=out.height=SIZE;
  const q=out.getContext('2d');q.imageSmoothingEnabled=false;q.putImageData(textureCtx.getImageData(0,0,SIZE,SIZE),0,0);return out;
}
window.SkinForge = {
  getTextureData(){ return cloneData(); },
  setTextureData(v){ setData(v); },
  getTextureDataUrl(){ return cleanPNGCanvas().toDataURL('image/png'); },
  getModelType(){ return modelType; },
  setModelType(v){ if(v==='classic'||v==='slim'){modelType=v;localStorage.setItem('skinforge:model',v);buildCharacter();} }
};

function point2D(e){
  const q=skinCanvas.getBoundingClientRect();
  return [Math.max(0,Math.min(63,Math.floor((e.clientX-q.left)/q.width*SIZE))),Math.max(0,Math.min(63,Math.floor((e.clientY-q.top)/q.height*SIZE)))];
}
function brushPixels(cx,cy,fn){
  const n=Math.max(1,Math.round(brushSize));
  const radius=(n-1)/2;
  for(let y=Math.floor(cy-radius);y<=Math.ceil(cy+radius);y++)for(let x=Math.floor(cx-radius);x<=Math.ceil(cx+radius);x++){
    const dx=x-cx,dy=y-cy;
    let inside=true;
    const shape=$('#brushShape')?.value||'Pixel';
    if(shape==='Pixel')inside=(x===cx&&y===cy);
    else if(shape==='Circle')inside=(dx*dx+dy*dy<=Math.max(1,radius*radius+radius));
    else if(shape==='Triangle')inside=(Math.abs(dx)<=radius && dy>=-radius && dy<=radius && Math.abs(dx)<=radius-(dy+radius)/2+0.5);
    if(inside)fn(x,y);
  }
}
function paintPixel(x,y,color){
  if(x<0||y<0||x>=SIZE||y>=SIZE)return;
  const old=get(x,y);let c=color;
  if(c[3]===0){px(x,y,[0,0,0,0]);return;}
  const a=Math.max(0,Math.min(1,opacity));
  px(x,y,[Math.round(old[0]*(1-a)+c[0]*a),Math.round(old[1]*(1-a)+c[1]*a),Math.round(old[2]*(1-a)+c[2]*a),255]);
}
function mirrorLimbPoint(x,y){
  const maps=[
    [40,56,16,32,32,48,48,64], [32,48,48,64,40,56,16,32],
    [0,16,16,32,16,32,48,64], [16,32,48,64,0,16,16,32]
  ];
  for(const [ax,bx,ay,by,cx,dx,cy,dy] of maps)if(x>=ax&&x<bx&&y>=ay&&y<by)return [cx+(x-ax),cy+(y-ay)];
  return null;
}
function applyBrush(x,y){
  let color=tool==='eraser'?[0,0,0,0]:hex(fg);
  brushPixels(x,y,(xx,yy)=>{
    if(tool==='clone'&&cloneSource){ const dx=xx-x,dy=yy-y; const c=get(cloneSource[0]+dx,cloneSource[1]+dy); paintPixel(xx,yy,c); }
    else paintPixel(xx,yy,color);
    if($('#mirrorX')?.classList.contains('active'))paintPixel(63-xx,yy,get(xx,yy));
    if($('#mirrorY')?.classList.contains('active'))paintPixel(xx,63-yy,get(xx,yy));
    if($('#mirrorLimb')?.classList.contains('active')){const m=mirrorLimbPoint(xx,yy);if(m)paintPixel(m[0],m[1],get(xx,yy));}
  });
}
function linePoints(x0,y0,x1,y1,fn){let dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,err=dx+dy;while(true){fn(x0,y0);if(x0===x1&&y0===y1)break;const e2=2*err;if(e2>=dy){err+=dy;x0+=sx}if(e2<=dx){err+=dx;y0+=sy}}}
function floodFill(x,y,color){
  const target=get(x,y);if(same(target,color))return;
  const q=[[x,y]],seen=new Set();
  while(q.length){const [cx,cy]=q.pop(),key=cx+','+cy;if(seen.has(key))continue;seen.add(key);if(!same(get(cx,cy),target))continue;px(cx,cy,color);if(cx>0)q.push([cx-1,cy]);if(cx<63)q.push([cx+1,cy]);if(cy>0)q.push([cx,cy-1]);if(cy<63)q.push([cx,cy+1]);}
}
function wandSelect(x,y){
  const target=get(x,y);const q=[[x,y]],seen=new Set(),out=new Set();
  while(q.length){const [cx,cy]=q.pop(),key=cx+','+cy;if(seen.has(key))continue;seen.add(key);if(!same(get(cx,cy),target))continue;out.add(key);if(cx>0)q.push([cx-1,cy]);if(cx<63)q.push([cx+1,cy]);if(cy>0)q.push([cx,cy-1]);if(cy<63)q.push([cx,cy+1]);}
  selection=out;renderTexture();
}
function applyAt(x,y){
  if(tool==='eyedropper'){fg='#'+get(x,y).slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join('');$('#fgColor').value=fg;return;}
  if(tool==='fill'){floodFill(x,y,hex(fg));renderTexture();return;}
  if(tool==='wand'){wandSelect(x,y);return;}
  if(tool==='clone'&&!cloneSource){cloneSource=[x,y];toast('Clone source selected');return;}
  if(tool==='line'&&strokeStart){linePoints(strokeStart[0],strokeStart[1],x,y,applyBrush);return;}
  if(tool==='move'&&strokeStart){const dx=x-strokeStart[0],dy=y-strokeStart[1];const old=strokeBase;d=new Uint8ClampedArray(PIXELS);for(let yy=0;yy<64;yy++)for(let xx=0;xx<64;xx++){const sx=xx-dx,sy=yy-dy;if(sx>=0&&sy>=0&&sx<64&&sy<64){const i=(sy*64+sx)*4;d.set(old.slice(i,i+4),(yy*64+xx)*4);}}renderTexture();return;}
  if(selection&&selection.size){for(const key of selection){const [sx,sy]=key.split(',').map(Number);applyBrush(sx,sy);}}
  else applyBrush(x,y);
}

skinCanvas.addEventListener('pointerdown',e=>{down=true;skinCanvas.setPointerCapture?.(e.pointerId);const p=point2D(e);strokeStart=p;strokeBase=cloneData();if(tool!=='eyedropper'&&tool!=='wand')saveState();applyAt(...p);renderTexture();});
skinCanvas.addEventListener('pointermove',e=>{const p=point2D(e);$('#cursorPos').textContent=`x: ${p[0]} y: ${p[1]}`;if(!down)return;if(tool==='line'||tool==='move'){d=new Uint8ClampedArray(strokeBase);applyAt(...p);renderTexture();}else{applyAt(...p);renderTexture();}});
skinCanvas.addEventListener('pointerup',e=>{if(!down)return;down=false;if(tool==='line'||tool==='move'){saveLocal();}else saveLocal();strokeStart=null;strokeBase=null;});
skinCanvas.addEventListener('pointercancel',()=>{down=false;strokeStart=null;strokeBase=null;});

const FACE_NAMES=['right','left','top','bottom','front','back'];
function uvRegion(x0,y0,x1,y1){return [x0,y0,x1,y1];}
function setBoxUV(geo,regions){
  const uv=geo.getAttribute('uv');
  for(let face=0;face<6;face++){
    const [x0,y0,x1,y1]=regions[face];
    const u0=x0/64,u1=x1/64,v0=1-y1/64,v1=1-y0/64;
    const off=geo.groups[face].start;
    const verts=[off,off+1,off+2,off+3,off+4,off+5];
    const vals=[[u1,v0],[u0,v0],[u0,v1],[u1,v0],[u0,v1],[u1,v1]];
    verts.forEach((idx,i)=>{uv.setXY(idx,vals[i][0],vals[i][1]);});
  }
  uv.needsUpdate=true;
}
function regionsFor(type,name,outer=false){
  const classic={
    head:[uvRegion(16,8,24,16),uvRegion(0,8,8,16),uvRegion(8,0,16,8),uvRegion(16,0,24,8),uvRegion(8,8,16,16),uvRegion(24,8,32,16)],
    body:[uvRegion(28,20,32,32),uvRegion(16,20,20,32),uvRegion(20,16,28,20),uvRegion(28,16,36,20),uvRegion(20,20,28,32),uvRegion(32,20,40,32)],
    rightArm:[uvRegion(48,20,52,32),uvRegion(40,20,44,32),uvRegion(44,16,48,20),uvRegion(48,16,52,20),uvRegion(44,20,48,32),uvRegion(52,20,56,32)],
    leftArm:[uvRegion(40,52,44,64),uvRegion(32,52,36,64),uvRegion(36,48,40,52),uvRegion(40,48,44,52),uvRegion(36,52,40,64),uvRegion(44,52,48,64)],
    rightLeg:[uvRegion(8,20,12,32),uvRegion(0,20,4,32),uvRegion(4,16,8,20),uvRegion(8,16,12,20),uvRegion(4,20,8,32),uvRegion(12,20,16,32)],
    leftLeg:[uvRegion(24,52,28,64),uvRegion(16,52,20,64),uvRegion(20,48,24,52),uvRegion(24,48,28,52),uvRegion(20,52,24,64),uvRegion(28,52,32,64)]
  };
  if(!outer)return classic[name];
  const o={
    head:[uvRegion(48,8,56,16),uvRegion(32,8,40,16),uvRegion(40,0,48,8),uvRegion(48,0,56,8),uvRegion(40,8,48,16),uvRegion(56,8,64,16)],
    body:[uvRegion(36,36,40,48),uvRegion(16,36,20,48),uvRegion(20,32,28,36),uvRegion(28,32,36,36),uvRegion(20,36,28,48),uvRegion(28,36,36,48)],
    rightArm:[uvRegion(52,36,56,48),uvRegion(40,36,44,48),uvRegion(44,32,48,36),uvRegion(48,32,52,36),uvRegion(44,36,48,48),uvRegion(48,36,52,48)],
    leftArm:[uvRegion(44,52,48,64),uvRegion(32,52,36,64),uvRegion(36,48,40,52),uvRegion(40,48,44,52),uvRegion(36,52,40,64),uvRegion(40,52,44,64)],
    rightLeg:[uvRegion(8,36,12,48),uvRegion(0,36,4,48),uvRegion(4,32,8,36),uvRegion(8,32,12,36),uvRegion(4,36,8,48),uvRegion(12,36,16,48)],
    leftLeg:[uvRegion(28,52,32,64),uvRegion(16,52,20,64),uvRegion(20,48,24,52),uvRegion(24,48,28,52),uvRegion(20,52,24,64),uvRegion(24,52,28,64)]
  };
  if(type==='slim'&&(name==='rightArm'||name==='leftArm')){
    const slim=name==='rightArm'
      ? [uvRegion(47,20,50,32),uvRegion(40,20,43,32),uvRegion(44,16,47,20),uvRegion(47,16,50,20),uvRegion(44,20,47,32),uvRegion(50,20,53,32)]
      : [uvRegion(41,52,44,64),uvRegion(32,52,35,64),uvRegion(36,48,39,52),uvRegion(39,48,42,52),uvRegion(36,52,39,64),uvRegion(42,52,45,64)];
    return slim;
  }
  return o[name];
}
function material(){return new THREE.MeshStandardMaterial({map:texture,transparent:true,alphaTest:.01,roughness:.85,metalness:0,side:THREE.FrontSide});}
function makePart(name,size,pos,outer=false){
  const geo=new THREE.BoxGeometry(...size);
  setBoxUV(geo,regionsFor(modelType,name,outer));
  const mesh=new THREE.Mesh(geo,material());
  mesh.name=(outer?'outer-':'')+name;
  mesh.userData.part=name;mesh.userData.outer=outer;
  mesh.position.set(...pos);
  character.add(mesh);
  meshes[(outer?'outer-':'')+name]=mesh;
  return mesh;
}
function makeLimb(name,size,pivot,outer=false){
  const group=new THREE.Group();group.name=(outer?'outer-':'')+name;group.position.set(...pivot);character.add(group);partGroups[(outer?'outer-':'')+name]=group;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material());
  setBoxUV(mesh.geometry,regionsFor(modelType,name,outer));
  mesh.position.y=-size[1]/2;mesh.userData.part=name;mesh.userData.outer=outer;group.add(mesh);meshes[(outer?'outer-':'')+name]=mesh;return mesh;
}
function clearCharacter(){while(character.children.length)character.remove(character.children[0]);for(const k of Object.keys(meshes))delete meshes[k];for(const k of Object.keys(partGroups))delete partGroups[k];}
function buildCharacter(){
  clearCharacter();
  makePart('head',[2,2,2],[0,5.4,0]);makePart('body',[2,2.6,1],[0,3.1,0]);
  const armW=modelType==='slim'?.75:1;
  makeLimb('rightArm',[armW,2.6,1],[-1.5,4.0,0]);makeLimb('leftArm',[armW,2.6,1],[1.5,4.0,0]);
  makeLimb('rightLeg',[1,2.6,1],[-.5,1.3,0]);makeLimb('leftLeg',[1,2.6,1],[.5,1.3,0]);
  makePart('head',[2.08,2.08,2.08],[0,5.4,0],true);makePart('body',[2.08,2.68,1.08],[0,3.1,0],true);
  makeLimb('rightArm',[armW+.10,2.7,1.08],[-1.5,4.0,0],true);makeLimb('leftArm',[armW+.10,2.7,1.08],[1.5,4.0,0],true);
  makeLimb('rightLeg',[1.08,2.7,1.08],[-.5,1.3,0],true);makeLimb('leftLeg',[1.08,2.7,1.08],[.5,1.3,0],true);
  applyVisibility();applyPose();fitCamera();
}
function applyVisibility(){
  Object.entries(meshes).forEach(([key,m])=>{const p=m.userData.part;if(m.userData.outer)m.visible=outerVisible;else m.visible=bodyVisible&&(!partGroups[p]||true);});
  $$('.part-eye').forEach(b=>{const p=b.dataset.part;b.classList.toggle('off',meshes[p]? !meshes[p].visible:false);});
}
function applyPose(){
  if(meshes.head){meshes.head.rotation.set(THREE.MathUtils.degToRad(pose.head[0]),THREE.MathUtils.degToRad(pose.head[1]),THREE.MathUtils.degToRad(pose.head[2]));meshes['outer-head'].rotation.copy(meshes.head.rotation);}
  ['leftArm','rightArm'].forEach(p=>{const a=THREE.MathUtils.degToRad(pose[p]);partGroups[p].rotation.z=a;partGroups['outer-'+p].rotation.z=a;});
}
function updateModelStatus(){const s=$('#modelStatus');if(s)s.textContent=`${modelType==='slim'?'Alex':'Steve'} · 64×64`;const sel=$('#modelType');if(sel)sel.value=modelType;}
function render3D(){renderer.render(scene,camera);}
function fitCamera(){const q=$('#viewport3d')?.getBoundingClientRect();if(!q||q.width<2||q.height<2)return;cameraTarget.set(0,3.4,0);cameraDistance=9;cameraYaw=.35;cameraPitch=.04;updateCamera();}
function updateCamera(){
  const maxPitch=Math.PI/2-.08;cameraPitch=Math.max(-maxPitch,Math.min(maxPitch,cameraPitch));
  const cp=Math.cos(cameraPitch);camera.position.set(cameraTarget.x+Math.sin(cameraYaw)*cp*cameraDistance,cameraTarget.y+Math.sin(cameraPitch)*cameraDistance,cameraTarget.z+Math.cos(cameraYaw)*cp*cameraDistance);camera.lookAt(cameraTarget);resizeRenderer();
}
function resizeRenderer(){const q=$('#viewport3d')?.getBoundingClientRect();if(!q||q.width<2||q.height<2)return;renderer.setSize(q.width,q.height,false);camera.aspect=q.width/q.height;camera.updateProjectionMatrix();render3D();}
function modelPointer(e){const rect=$('#threeCanvas').getBoundingClientRect();pointer.x=((e.clientX-rect.left)/rect.width)*2-1;pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(character.children,true);return hits.find(h=>h.object.visible&&h.object.userData.part);}
function paint3D(e){const hit=modelPointer(e);if(!hit||!hit.uv)return;const x=Math.max(0,Math.min(63,Math.floor(hit.uv.x*64)));const y=Math.max(0,Math.min(63,Math.floor((1-hit.uv.y)*64)));$('#cursorPos').textContent=`x: ${x} y: ${y}`;if(tool==='eyedropper'){const c=get(x,y);fg='#'+c.slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join('');$('#fgColor').value=fg;return;}if(!down){down=true;saveState();}applyAt(x,y);renderTexture();}
const canvas3d=$('#threeCanvas');
canvas3d.addEventListener('pointerdown',e=>{canvas3d.setPointerCapture?.(e.pointerId);cameraDrag={x:e.clientX,y:e.clientY,button:e.button,shift:e.shiftKey};if(e.button===0){paint3D(e);}});
canvas3d.addEventListener('pointermove',e=>{if(cameraDrag){const dx=e.clientX-cameraDrag.x,dy=e.clientY-cameraDrag.y;if(cameraDrag.button===2||cameraDrag.shift){cameraTarget.x-=dx*.01;cameraTarget.y+=dy*.01;updateCamera();}else if(down){paint3D(e);}else{cameraYaw-=dx*.01;cameraPitch-=dy*.01;updateCamera();}cameraDrag.x=e.clientX;cameraDrag.y=e.clientY;}});
canvas3d.addEventListener('pointerup',()=>{if(down){down=false;saveLocal();}cameraDrag=null;});
canvas3d.addEventListener('pointercancel',()=>{down=false;cameraDrag=null;});
canvas3d.addEventListener('contextmenu',e=>e.preventDefault());
canvas3d.addEventListener('wheel',e=>{e.preventDefault();cameraDistance=Math.max(5,Math.min(16,cameraDistance+e.deltaY*.012));updateCamera();},{passive:false});

function blank(){
  d.fill(0);
  for(let y=8;y<16;y++)for(let x=8;x<16;x++)px(x,y,[210,165,125,255]);
  for(let y=0;y<8;y++)for(let x=8;x<16;x++)px(x,y,[190,145,110,255]);
  for(let y=16;y<32;y++)for(let x=20;x<28;x++)px(x,y,[55,90,145,255]);
  for(let y=20;y<32;y++)for(let x=44;x<48;x++)px(x,y,[45,70,110,255]);
  for(let y=52;y<64;y++)for(let x=36;x<40;x++)px(x,y,[45,70,110,255]);
  for(let y=20;y<32;y++)for(let x=4;x<8;x++)px(x,y,[40,48,58,255]);
  for(let y=52;y<64;y++)for(let x=20;x<24;x++)px(x,y,[40,48,58,255]);
  undoStack=[];redoStack=[];selection=null;renderTexture();saveLocal();
}
function importPNG(file){
  const im=new Image();im.onload=()=>{try{if(im.width!==64||im.height!==64){toast('Minecraft skin PNGs must be exactly 64×64');return;}const z=document.createElement('canvas');z.width=z.height=64;const q=z.getContext('2d',{willReadFrequently:true});q.imageSmoothingEnabled=false;q.drawImage(im,0,0,64,64);d=new Uint8ClampedArray(q.getImageData(0,0,64,64).data);undoStack=[];redoStack=[];selection=null;renderTexture();saveLocal();toast('Skin imported');}finally{URL.revokeObjectURL(im.src);}};im.onerror=()=>toast('Could not read that PNG');im.src=URL.createObjectURL(file);
}
function download(){const a=document.createElement('a');a.href=cleanPNGCanvas().toDataURL('image/png');a.download='skinforge-skin.png';a.click();}
function toast(s){const q=$('#toast');if(!q)return;q.textContent=s;q.classList.add('show');setTimeout(()=>q.classList.remove('show'),1500);}

async function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('skinforge',2);req.onupgradeneeded=()=>{const dbx=req.result;if(!dbx.objectStoreNames.contains('skins'))dbx.createObjectStore('skins',{keyPath:'id'});};req.onsuccess=()=>{db=req.result;resolve();};req.onerror=reject;});}
function saveLocal(){if(!db)return;try{db.transaction('skins','readwrite').objectStore('skins').put({id:'current',texture:Array.from(d),updated:Date.now(),modelType});}catch(e){console.error('IndexedDB save failed',e);}}
async function loadLocal(){if(!db)return;const item=await new Promise((resolve,reject)=>{const req=db.transaction('skins').objectStore('skins').get('current');req.onsuccess=()=>resolve(req.result);req.onerror=reject;});if(item?.texture){d=new Uint8ClampedArray(item.texture);if(item.modelType==='classic'||item.modelType==='slim')modelType=item.modelType;}}

function wireUI(){
  $$('.tool').forEach(b=>b.onclick=()=>{$$('.tool').forEach(z=>z.classList.remove('active'));b.classList.add('active');tool=b.dataset.tool;});
  $('#brushSize').oninput=e=>brushSize=Math.max(1,Math.min(32,+e.target.value||1));
  $('#opacity').oninput=e=>{opacity=+e.target.value/100;$('#opacityOut').textContent=`${Math.round(opacity*100)}%`;};
  $('#intensity').oninput=e=>{$('#intensityOut').textContent=`${e.target.value}%`;intensity=+e.target.value/100;};
  $('#fgColor').oninput=e=>fg=e.target.value;
  $('#swapColors').onclick=()=>{const a=$('#fgColor'),b=$('#bgColor'),v=a.value;a.value=b.value;b.value=v;fg=a.value;};
  ['mirrorX','mirrorY','mirrorLimb'].forEach(id=>$('#'+id)?.addEventListener('click',()=>$('#'+id).classList.toggle('active')));
  $('#gridBtn').onclick=()=>{grid=!grid;$('#gridBtn').classList.toggle('active',grid);renderTexture();};
  $('#fitBtn').onclick=fitCamera;
  $('#uvBtn').onclick=()=>{const b=$('#uvBtn');b.classList.toggle('active');b.title=b.classList.contains('active')?'UV overlay enabled for the 2D texture':'UV overlay disabled';toast(b.classList.contains('active')?'UV overlay on':'UV overlay off');};
  $('#layerBtn').onclick=()=>{outerVisible=!outerVisible;$('#layerBtn').classList.toggle('active',outerVisible);applyVisibility();render3D();};
  $('#bodyVis').onclick=()=>{bodyVisible=!bodyVisible;$('#bodyVis').classList.toggle('off',!bodyVisible);applyVisibility();render3D();};
  $$('.part-eye').forEach(b=>b.onclick=()=>{const p=b.dataset.part;const base=meshes[p],outer=meshes['outer-'+p];const v=!base.visible;base.visible=v;if(outer)outer.visible=v&&outerVisible;b.classList.toggle('off',!v);});
  $('#armorVis')?.remove();
  $('#resetPose').onclick=()=>{pose={head:[0,0,0],leftArm:0,rightArm:0};$$('[data-rot]').forEach(i=>i.value=0);$('#leftArmPose').value=0;$('#rightArmPose').value=0;applyPose();render3D();};
  $$('[data-rot]').forEach(i=>i.oninput=()=>{pose.head[+({x:0,y:1,z:2}[i.dataset.axis])]=+i.value||0;applyPose();render3D();});
  $('#leftArmPose').oninput=e=>{pose.leftArm=+e.target.value;applyPose();render3D();};
  $('#rightArmPose').oninput=e=>{pose.rightArm=+e.target.value;applyPose();render3D();};
  $('#savePose').onclick=()=>{localStorage.setItem('skinforge:pose',JSON.stringify(pose));toast('Pose saved locally');};
  $('#newBtn').onclick=blank;
  $('#openBtn').onclick=()=>$('#fileInput').click();
  $('#fileInput').onchange=e=>{if(e.target.files[0])importPNG(e.target.files[0]);e.target.value='';};
  $('#downloadBtn').onclick=download;
  $('#saveBtn').onclick=()=>window.SkinCloud?.user?window.dispatchEvent(new CustomEvent('skinforge:cloud-save')):window.SkinCloud?.user;
  $('#undoBtn').onclick=undo;$('#redoBtn').onclick=redo;
  $('#fullscreenBtn').onclick=()=>document.documentElement.requestFullscreen?.();
  $$('.tab').forEach(b=>b.onclick=()=>{$$('.tab').forEach(z=>z.classList.remove('active'));b.classList.add('active');$('#viewport3d').classList.toggle('hidden',b.dataset.mode!=='3d');$('#viewport2d').classList.toggle('hidden',b.dataset.mode!=='2d');if(b.dataset.mode==='3d')resizeRenderer();});
  $$('.rtab').forEach(b=>b.onclick=()=>{$$('.rtab').forEach(z=>z.classList.remove('active'));b.classList.add('active');$$('.rpanel').forEach(p=>p.classList.add('hidden'));$('#'+b.dataset.rpanel+'Panel')?.classList.remove('hidden');});
  $('#modelType')?.addEventListener('change',e=>window.SkinForge.setModelType(e.target.value));
  $$('[data-menu]').forEach(b=>b.onclick=()=>{const menu={file:[['New',blank],['Open',()=>$('#fileInput').click()],['Export PNG',download]],edit:[['Undo',undo],['Redo',redo]],view:[['Fullscreen',()=>document.documentElement.requestFullscreen?.()],['Grid',()=>$('#gridBtn').click()],['Fit',fitCamera]],settings:[['Model: '+(modelType==='slim'?'Alex':'Steve'),()=>$('#modelType')?.focus()],help:[['About',()=>alert('SkinForge — browser-based Minecraft skin editor.')]]}[b.dataset.menu];const p=$('#menuPanel');if(!menu)return;p.innerHTML=menu.map(z=>`<button>${z[0]}</button>`).join('');p.classList.remove('hidden');p.querySelectorAll('button').forEach((z,i)=>z.onclick=()=>{p.classList.add('hidden');menu[i][1]()});});
  window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();}else if(e.key==='['){brushSize=Math.max(1,brushSize-1);$('#brushSize').value=brushSize;}else if(e.key===']'){brushSize=Math.min(32,brushSize+1);$('#brushSize').value=brushSize;}});
  window.addEventListener('resize',resizeRenderer);window.addEventListener('offline',()=>$('#syncState').textContent='Offline');window.addEventListener('online',()=>$('#syncState').textContent=window.SkinCloud?.user?'Cloud ready':'Local');
}

async function init(){
  try{await openDB();await loadLocal();}catch(e){console.error('Local storage initialization failed',e);}
  const savedPose=localStorage.getItem('skinforge:pose');if(savedPose)try{pose=JSON.parse(savedPose);}catch{}
  if(!d.some(Boolean))blank();
  wireUI();
  buildCharacter();
  renderTexture();
  resizeRenderer();
  updateModelStatus();
}
init();