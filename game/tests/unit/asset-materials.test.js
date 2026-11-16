import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createMaterialQuality} from '../../src/core/asset-materials.js';
import {createShade} from '../../src/core/shade.js';
import {createEvents} from '../../src/core/events.js';

test('quality switches loaded templates and live cloned actor materials, preserving shader hooks and ownership',()=>{
 const scene=new THREE.Scene(),template=new THREE.Group();
 const map=new THREE.Texture();
 template.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({map,roughness:0.9})));
 const G={scene,quality:{tier:'high'},renderer:{capabilities:{getMaxAnisotropy:()=>4}},shade:createShade(),events:createEvents(),world:{props:{camBlockers:[]}}};
 const Q=createMaterialQuality(G,()=>[template]);Q.convert(template);
 const actor=template.clone(true);actor.children[0].material=actor.children[0].material.clone();
 const original=actor.children[0].material; original.color.set(0x846341);
 const hook=sh=>{sh.uniforms.pose={value:0.4};};original.onBeforeCompile=hook;
 scene.add(actor);G.world.props.camBlockers.push({mats:[original]});
 G.quality.tier='low';G.events.emit('quality:changed',{tier:'low'});
 const cheap=actor.children[0].material;
 assert.ok(cheap.isMeshLambertMaterial);assert.ok(template.children[0].material.isMeshLambertMaterial);
 assert.equal(cheap.map,map);assert.equal(cheap.onBeforeCompile,hook);assert.equal(cheap.color.getHex(),0x846341);
 assert.equal(G.world.props.camBlockers[0].mats[0],cheap);
 cheap.opacity=0.35;cheap.transparent=true;cheap.color.set(0x123456);
 G.quality.tier='high';G.events.emit('quality:changed',{tier:'high'});
 assert.equal(actor.children[0].material,original);assert.ok(original.isMeshStandardMaterial);
 assert.equal(original.opacity,0.35);assert.equal(original.transparent,true);assert.equal(original.color.getHex(),0x123456);
 assert.equal(original.map,map);assert.equal(G.world.props.camBlockers[0].mats[0],original);
 let disposed=0;cheap.addEventListener('dispose',()=>disposed++);original.dispose();assert.equal(disposed,1);
});

for (const initialTier of ['low','medium']) test(initialTier+'-first assets can upgrade without losing normal maps or multi-material assignments',()=>{
 const normalMap=new THREE.Texture(),root=new THREE.Group();
 root.add(new THREE.Mesh(new THREE.BoxGeometry(),[new THREE.MeshStandardMaterial({normalMap}),new THREE.MeshStandardMaterial({color:0x778899})]));
 const G={scene:new THREE.Scene(),quality:{tier:initialTier},renderer:{capabilities:{getMaxAnisotropy:()=>4}},shade:createShade(),events:createEvents()};
 const Q=createMaterialQuality(G,()=>[root]);Q.convert(root);
 assert.ok(root.children[0].material.every(m=>m.isMeshLambertMaterial));
 Q.refresh('high');assert.ok(root.children[0].material.every(m=>m.isMeshStandardMaterial));assert.equal(root.children[0].material[0].normalMap,normalMap);
 Q.refresh('medium');assert.ok(root.children[0].material.every(m=>m.isMeshLambertMaterial));
 Q.refresh('low');assert.ok(root.children[0].material.every(m=>m.isMeshLambertMaterial));
});
