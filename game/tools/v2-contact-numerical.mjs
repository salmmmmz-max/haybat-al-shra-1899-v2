/** CPU-only actual-rig regression: no WebGL, no browser FPS/device claims. Texture bytes are not decoded. */
import fs from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {createHumanoid} from '../src/actors/humanoid.js';
globalThis.self=globalThis;
globalThis.Image=class { constructor(){this.width=this.height=1;} set src(v){queueMicrotask(()=>this.onload?.());} };
globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const data=await fs.readFile(new URL('../../app/public/assets/models/dhari.glb',import.meta.url));
const gltf=await loader.parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
let slope=0;
const G={scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),time:{now:0},state:{},vrng:{next:()=>.5},shade:{patch:m=>m},
 assets:{instance(){const a=clone(gltf.scene);a.userData.animations=gltf.animations;return a},meta(){return {height:1.75}}},
 world:{terrain:{heightAt:(x,z)=>x*slope,normalAt(x,z,n){const q=1/Math.sqrt(1+slope*slope);n.x=-slope*q;n.y=q;n.z=0;}}}};
G.camera.position.set(3,2,3);
const actor=createHumanoid(G,'dhari'),bones={};actor.root.traverse(o=>{if(o.isBone)bones[o.name]=o});
const v=new THREE.Vector3(),mid=new THREE.Vector3(),upper=new THREE.Vector3(),fwd=new THREE.Vector3(1,0,0),left=new THREE.Vector3(),right=new THREE.Vector3();
actor.place(0,0,Math.PI/2);actor.play('idle');
const grip=()=>{actor.root.updateMatrixWorld(true);bones.LeftArm.getWorldPosition(mid);bones.RightArm.getWorldPosition(v);mid.add(v).multiplyScalar(.5).addScaledVector(fwd,.18);mid.y-=.12;upper.set(1.72,2.15,.18).sub(mid).normalize();left.copy(mid).addScaledVector(upper,.07);right.copy(mid).addScaledVector(upper,-.07);actor.setHandTargets({left,right,weight:1});};
for(let i=0;i<60;i++){grip();actor.update(1/60);}
const contacts=[];
for(const dt of [1/60,1/30,1/15]){
 actor.play('pull',{fade:.2,speed:.75});let max=0;
 for(let i=0;i<Math.round(12/dt);i++){
  grip();actor.update(dt);actor.root.updateMatrixWorld(true);
  for(const [bone,target] of [['LeftHand',left],['RightHand',right]]){bones[bone].getWorldPosition(v);max=Math.max(max,v.distanceTo(target));}
 }
 contacts.push({dt,maxErrorM:max,pass:max<=.01});
}
actor.setHandTargets(null);
const clearances=[];
for(const rise of [0,.18,-.18]){
 slope=rise;actor.place(0,0,Math.PI/3);
 for(const pose of ['idle','sit','idle','kneel','idle']){
  actor.play(pose,{fade:.35});let min=Infinity;
  for(let frame=0;frame<120;frame++){
   actor.update(1/60);actor.root.updateMatrixWorld(true);
   if(frame%4)continue;
   actor.root.traverse(m=>{if(!m.isSkinnedMesh)return;m.skeleton.update();for(let i=0;i<m.geometry.attributes.position.count;i++){m.getVertexPosition(i,v).applyMatrix4(m.matrixWorld);min=Math.min(min,v.y-G.world.terrain.heightAt(v.x,v.z));}});
  }
  clearances.push({slope:rise,pose,minClearanceM:min,pass:min>=-.005});
 }
}
const result={method:'CPU actual GLB skeleton/vertices; no image textures or rendering',contacts,clearances,pass:contacts.every(x=>x.pass)&&clearances.every(x=>x.pass)};
console.log(JSON.stringify(result,null,2));if(!result.pass)process.exitCode=1;
