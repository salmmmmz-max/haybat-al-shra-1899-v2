import * as THREE from 'three';
import { createHumanoid } from '../src/actors/humanoid.js';
export const assets = ['dhari','mani','fuhaid','misfer','moudi','jaber','camel'];
export async function run(G) {
  G.world.terrain.build({ seed: 5, duneAmp: 0, duneScale: 100, flats: [{x:0,z:0,r:300,fall:10}] });
  G.world.sky.setPreset('morning'); G.actors.player.spawn(60,60,0);
  G.camera.position.set(2.8,2.0,3.0);G.camera.lookAt(0,0.5,0);G.camera.updateMatrixWorld(true);
  const v=new THREE.Vector3();
  const minimum=a=>{let min=Infinity; a.root.updateMatrixWorld(true);a.root.traverse(m=>{if(!m.isSkinnedMesh)return;m.skeleton.update();for(let i=0;i<m.geometry.attributes.position.count;i++){m.getVertexPosition(i,v).applyMatrix4(m.matrixWorld);min=Math.min(min,v.y-G.world.terrain.heightAt(v.x,v.z));}});return min;};
  return { async run() {
    const out=[];
    for(const id of ['dhari','mani','fuhaid','jaber','misfer','moudi']) {
      const a=createHumanoid(G,id,{name:'v2-'+id});a.place(0,0,0);let lowest=Infinity;
      const times=[];
      for(const pose of ['idle','sit','idle','kneel','idle']) {
        a.play(pose,{fade:.35});let lo=Infinity;
        for(let i=0;i<100;i++){const t=performance.now();a.update(1/60);times.push(performance.now()-t);if(i%5===0)lo=Math.min(lo,minimum(a));}
        out.push({id,pose,minGarmentClearance:lo}); lowest=Math.min(lowest,lo);
      }
      times.sort((a,b)=>a-b);out.push({id,updateMedianMs:times[Math.floor(times.length*.5)],updateP95Ms:times[Math.floor(times.length*.95)]});a.dispose();
    }
    const c=G.actors.camels.spawn('v2-test-camel',{x:0,z:0});c.ridden=true;
    const a=createHumanoid(G,'dhari',{name:'v2-rider'});a.sitOn(c.saddle);let worst=0;
    for(const speed of [0,2.4,5.5,0])for(let i=0;i<120;i++){
      c.place(Math.sin(i/150)*2,i*speed/60,i/150);c.setSpeed(speed);c.update(1/60);a.update(1/60);a.root.updateMatrixWorld(true);
      if(i>60)for(const side of ['left','right']){
        const grip=c.saddle.userData.handGrips[side],hand=a.socket(side==='left'?'handL':'handR');const g=grip.getWorldPosition(new THREE.Vector3());hand.getWorldPosition(v);worst=Math.max(worst,v.distanceTo(g));
      }
    }
    out.push({riderMaxHandGripError:worst});a.dispose();G.actors.camels.remove('v2-test-camel');return out;
  }};
}
