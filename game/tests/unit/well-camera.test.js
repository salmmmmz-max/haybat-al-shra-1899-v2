import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCam } from '../../src/actors/camera.js';

test('a solid well behind the player moves the camera to a clear side instead of a 0.9m close-up',()=>{
  const blocker={x:8,z:6,hx:1.5,hz:1.441,y0:0,y1:2.578,c:1,s:0,modelId:'well',want:0};
  const G={camera:new THREE.PerspectiveCamera(55,2,.2,2600),actors:{player:{pos:new THREE.Vector3(6.28,0,5.82),yaw:Math.PI/2,speed:0,mounted:null}},
    events:{on(){}},world:{terrain:{heightAt:()=>0},props:{camBlockers:[blocker],colliders:[{x:8,z:6,r:1.2,nc:true}]}},
    input:{look:{x:0,y:0}},vrng:{next:()=>.5},state:{},scope:{sleep:()=>Promise.resolve()}};
  const cam=createCam(G);cam.snap();cam.yaw=-Math.PI/2;
  for(let i=0;i<240;i++)cam.lateUpdate(1/60);
  assert.ok(G.camera.position.distanceTo(new THREE.Vector3(6.28,1.45,5.82))>3,'retain a readable body-sized frame');
  assert.equal(blocker.want,0,'stonework must never be made transparent');
  assert.ok(Math.abs(G.camera.position.x-8)>blocker.hx || Math.abs(G.camera.position.z-6)>blocker.hz,'lens outside solid box');
});
