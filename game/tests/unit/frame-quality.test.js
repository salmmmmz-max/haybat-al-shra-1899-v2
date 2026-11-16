import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoop } from '../../src/core/loop.js';

test('slow rendered frames reach quality unchanged while simulation stays bounded', () => {
  const oldRAF=globalThis.requestAnimationFrame, oldCancel=globalThis.cancelAnimationFrame;
  let frame; globalThis.requestAnimationFrame=fn=>{frame=fn;return 1;}; globalThis.cancelAnimationFrame=()=>{};
  try {
    const samples=[], scope={update(){}};
    const G={time:{dt:0,frame:0,now:0,scale:1},input:{sample(){}},quality:{onFrame:v=>samples.push(v)},rootScope:scope,levelScope:scope,scope,renderer:{render(){}},scene:{},camera:{}};
    const loop=createLoop(G);const at=performance.now();loop.start();frame(at+350);
    assert.ok(samples[0]>300,'a slow GPU frame must not be recorded as 16.7ms');
    assert.equal(G.time.dt,1/20,'simulation remains bounded');
    loop.resetClock();const resumed=performance.now();frame(resumed+16.7);
    assert.ok(samples[1]>=16 && samples[1]<30,'resumed tabs discard the hidden interval');
    loop.stop();
  } finally {globalThis.requestAnimationFrame=oldRAF;globalThis.cancelAnimationFrame=oldCancel;}
});
