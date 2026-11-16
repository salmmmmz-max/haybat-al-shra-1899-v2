/** A scoped, articulated well action: effort drives the bucket while the button is held. */
import * as THREE from 'three';
import { use } from './kit.js';

// The supplied well is one welded mesh, including a motionless rope and bucket.
// Keep the stonework and timber, replacing only the central hanging apparatus on this instance.
function freeApparatus(G, at, ground) {
  let well = null;
  G.world.props.root.traverse(o => { if (o.userData.modelId === 'well' && Math.hypot(o.position.x-at.x,o.position.z-at.z)<0.2) well=o; });
  const restored=[]; const v=new THREE.Vector3();
  if (well) {
    well.userData.pinLod?.(true);
    well.updateMatrixWorld(true);
    well.traverse(o=>{
      if (!o.isMesh || !o.geometry.index) return;
      const source=o.geometry, pos=source.attributes.position, idx=source.index, keep=[];
      for(let i=0;i<idx.count;i+=3){
        let inside=0;
        for(let j=0;j<3;j++){
          v.fromBufferAttribute(pos,idx.getX(i+j)).applyMatrix4(o.matrixWorld);
          const x=v.x-at.x,y=v.y-ground,z=v.z-at.z;
          // The authored bucket hangs 0.6 m west of the asset pivot, not at its centre.
          const bucketRegion=x>-.88 && x<-.16 && z>-.08 && z<.56 && y>.82 && y<1.65;
          const ropeRegion=x>-.72 && x<-.22 && z>-.08 && z<.4 && y>=1.55 && y<2.24;
          if(bucketRegion||ropeRegion) inside++;
        }
        if(inside<3)keep.push(idx.getX(i),idx.getX(i+1),idx.getX(i+2));
      }
      const clone=source.clone(); clone.setIndex(keep); o.geometry=clone;
      restored.push(()=>{o.geometry=source;clone.dispose();});
    });
  }
  return ()=>{ restored.forEach(fn=>fn()); well?.userData.pinLod?.(false); };
}

/** Reusable by the dry first well and the final water scene. All handles die with the beat. */
export async function pullWellBucket(G,d,{at,label,id='well',seconds=3.6,muddy=false}) {
  const pl=G.actors.player, cam=G.actors.cam, ground=G.world.terrain.heightAt(at.x,at.z);
  const group=new THREE.Group();group.name='well-action';G.scene.add(group);
  const restored=freeApparatus(G,at,ground);
  const ropeMat=G.shade.patch(new THREE.MeshLambertMaterial({color:0x8b7350}));
  const timberMat=G.shade.patch(new THREE.MeshLambertMaterial({color:0x493723}));
  const metalMat=G.shade.patch(new THREE.MeshLambertMaterial({color:0x594d39}));
  const ropeGeo=new THREE.CylinderGeometry(0.012,0.012,1,6,1);
  const pulley=new THREE.Mesh(new THREE.TorusGeometry(0.13,0.028,6,20),timberMat);
  pulley.position.set(at.x,ground+2.15,at.z);pulley.rotation.y=Math.PI/2;group.add(pulley);
  const bucket=new THREE.Group();bucket.name='moving-bucket';group.add(bucket);
  const body=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.14,0.3,14,1,true),timberMat);body.position.y=-0.18;bucket.add(body);
  const bottom=new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.14,0.025,14),timberMat);bottom.position.y=-0.32;bucket.add(bottom);
  const hoop=new THREE.Mesh(new THREE.TorusGeometry(0.18,0.014,5,16),metalMat);hoop.rotation.x=Math.PI/2;hoop.position.y=-0.03;bucket.add(hoop);
  const handle=new THREE.Mesh(new THREE.TorusGeometry(0.17,0.011,5,16,Math.PI),metalMat);handle.position.y=-0.02;bucket.add(handle);
  const waterMat=G.shade.patch(new THREE.MeshLambertMaterial({color:muddy?0x66513a:0x5b827e}));
  const water=new THREE.Mesh(new THREE.CircleGeometry(0.16,16),waterMat);water.rotation.x=-Math.PI/2;water.position.y=-0.07;bucket.add(water);
  const ropes=Array.from({length:5},(_,i)=>{const m=new THREE.Mesh(ropeGeo,ropeMat);m.name='well-rope-'+i;group.add(m);return m;});
  const up=new THREE.Vector3(0,1,0),dir=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3();
  const left=new THREE.Vector3(),right=new THREE.Vector3(),tail=new THREE.Vector3();
  const shoulderL=pl.actor.root.getObjectByName('LeftArm'),shoulderR=pl.actor.root.getObjectByName('RightArm');
  const center=new THREE.Vector3(),sl=new THREE.Vector3(),sr=new THREE.Vector3(),gripAxis=new THREE.Vector3();
  group.userData.gripLeft=left;group.userData.gripRight=right;
  const stance={x:at.x-1.72,z:at.z-0.18};
  const stanceY=G.world.terrain.heightAt(stance.x,stance.z);
  let progress=0,held=false,completed=false,grip=false,active=true,started=false,handsReleased=false,settle=0,lastSound=-99;
  let limit=null;
  const connect=(m,a,b)=>{dir.subVectors(b,a);m.position.copy(a).add(b).multiplyScalar(0.5);m.scale.set(1,dir.length(),1);m.quaternion.setFromUnitVectors(up,dir.normalize());};
  const releaseHands=()=>{handsReleased=true;pl.actor.setHandTargets(null);pl.pose(null);};
  const cleanup=()=>{
    if(!active)return;active=false;
    releaseHands();pl.setScripted(false);if(limit)limit.remove();
    cam.release({duration:0.5});group.removeFromParent();restored();
    const gs=new Set(),ms=new Set();group.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material)ms.add(o.material);});
    gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());
  };
  d.own({remove:cleanup});
  const shot={x:at.x-3.8,y:ground+2.8,z:at.z+4.6};
  const look={x:at.x-0.65,y:ground+1.35,z:at.z};
  d.spawn(async child=>{await child.task(dt=>{
    if(!active)return true;
    const pulse=held?Math.sin(progress*Math.PI*6):0;
    // Both palms share the same taut line; the effort clip supplies body weight, IK closes contact.
    if(started&&!handsReleased&&shoulderL&&shoulderR){
      pl.actor.root.updateMatrixWorld(true);
      shoulderL.getWorldPosition(sl);shoulderR.getWorldPosition(sr);
      center.copy(sl).add(sr).multiplyScalar(.5);
      center.x+=Math.sin(pl.yaw)*.18;center.z+=Math.cos(pl.yaw)*.18;center.y-=.12+.045*pulse;
    }else center.set(at.x,ground+1.18,at.z);
    // The rope can swing from the pulley; grip points follow the chest's reachable envelope.
    // This retains arm lengths through the full effort clip instead of stretching wrists to a fixed world line.
    gripAxis.set(at.x,ground+2.15,at.z).sub(center).normalize();
    left.copy(center).addScaledVector(gripAxis,.07);right.copy(center).addScaledVector(gripAxis,-.07);
    if(started&&!handsReleased) tail.set(at.x-1.42,stanceY+0.1,at.z-0.16);
    else tail.set(at.x,ground+0.1,at.z);
    if(completed)settle=Math.min(1,settle+dt/0.7);
    bucket.position.set(at.x-0.72*settle,ground+0.63+progress*1.0-0.35*settle,at.z-0.05);
    bucket.rotation.z=held?Math.sin(progress*14)*0.025:0;
    a.set(at.x,ground+2.15,at.z);b.copy(bucket.position);b.y+=0.15;connect(ropes[0],a,b);
    connect(ropes[1],a,left);connect(ropes[2],left,right);connect(ropes[3],right,tail);
    // Short loose end resting on the used apron, never floating under the hand.
    b.set(tail.x-0.3,tail.y-0.06,tail.z+0.16);connect(ropes[4],tail,b);
    pulley.rotation.x=-progress*8;
    if(started && !completed){
      if(held!==grip){grip=held;pl.pose(held?'pull':'idle',{fade:0.2,speed:0.75});}
      pl.actor.setHandTargets({left,right,weight:1});
      if(held && G.time.now-lastSound>1.2){lastSound=G.time.now;G.audio.sfx('sfx_pulley',{at,volume:0.4});}
    }
    group.userData.progress=progress;group.userData.holding=held;
  });});
  await d.near(at,3.6);
  // A small, visible approach seats both feet outside the stone rim before reaching for the line.
  await cam.cine([{pos:shot,look,dur:0.65,skippable:false}]);
  await pl.moveTo(stance.x,stance.z,{speed:1.35,stop:0.08});
  pl.setScripted(false);pl.yaw=Math.atan2(at.x-pl.pos.x,at.z-pl.pos.z);
  limit=d.own(pl.limit('well-pull',{speed:0,run:false}));
  pl.pose('idle');started=true;
  // Take the line before enabling a pressure-driven lift: no floating palms at the first press.
  await d.wait(G.state.fastText?0.05:0.45);
  try {
    await use(G,d,{id,at:stance,radius:1,label,hold:seconds,onHold:s=>{progress=s.progress;held=s.holding;}});
    progress=1;held=false;completed=true;
    await d.wait(G.state.fastText?0.05:0.65);
    releaseHands();if(limit){limit.remove();limit=null;}
    G.audio.sfx('sfx_water',{at,volume:muddy?0.25:0.6});
    // Keep the result readable while the first reaction is spoken; beat cleanup returns the follow camera.
  } catch(e){cleanup();throw e;}
}
