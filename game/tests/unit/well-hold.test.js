import test from 'node:test';
import assert from 'node:assert/strict';
import { createInteract } from '../../src/systems/interact.js';

function fixture(){
  let down=false,edge=false;
  const G={state:{mode:'play',fastText:false},input:{held:()=>down,pressed:()=>edge},
    actors:{player:{pos:{x:0,z:0},mode:'foot'},cam:{yaw:0}},sys:{},
    world:{terrain:{heightAt:()=>0}},events:{emit(){}},scope:null};
  const I=createInteract(G);G.sys.interact=I;
  return {G,I,tick(dt,held,pressed=false){down=held;edge=pressed;I.update(dt);}};
}
test('well effort reports fill during the press, lowers on release, and fires only once',()=>{
  const f=fixture(),samples=[];let used=0;
  f.I.add({id:'well',at:{x:0,z:1},hold:2,once:true,onHold:s=>samples.push(s),onUse:()=>used++});
  f.tick(0.5,true,true);assert.equal(samples.at(-1).progress,0.25);assert.equal(samples.at(-1).holding,true);assert.equal(used,0);
  f.tick(0.125,false);assert.equal(samples.at(-1).holding,false);assert.equal(samples.at(-1).progress,0.125);
  f.tick(2,true,true);assert.equal(used,1);assert.equal(f.I.entries.length,0);
  f.tick(1,true);assert.equal(used,1);
});
test('walking out of range cancels effort and cannot complete by keeping the button down',()=>{
  const f=fixture(),samples=[];let used=0;
  f.I.add({id:'well',at:{x:0,z:1},hold:2,onHold:s=>samples.push(s),onUse:()=>used++});
  f.tick(0.8,true,true);f.G.actors.player.pos.x=10;f.tick(0.1,true);
  assert.equal(samples.at(-1).cancelled,true);assert.equal(samples.at(-1).progress,0);
  f.G.actors.player.pos.x=0;f.tick(2,true); // old press must not rearm the use entry
  assert.equal(used,0);
});
