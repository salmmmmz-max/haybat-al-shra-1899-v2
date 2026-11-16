/** Isolated real renderer check: storm depth, wear and fire; no story modifications. */
export const assets=['dhari','well','campfire','camelsit','tent'];
export async function run(G,p={}) {
  G.world.terrain.build({seed:1899,duneAmp:3,flats:[{x:0,z:0,r:25,fall:20}]});
  G.world.sky.setPreset(p.night?'night':'morning',{duration:0});
  G.world.props.spawn('well',{x:0,z:0});
  G.world.props.spawn('tent',{x:8,z:4});
  G.world.props.spawn('camelsit',{x:-5,z:3});
  G.world.props.spawn('campfire',{x:0,z:6});
  G.world.props.fire(0,6,{size:1,lit:true});
  G.actors.player.spawn(1,3,Math.PI);
  const y=G.world.terrain.heightAt(0,0);
  G.actors.cam.cut([7,y+2.4,11],[0,y+1,2]);
  G.world.weather.setWind(250,0.65);
  if(p.storm)G.world.weather.storm(Number(p.storm));
  return {inspect:()=>({weather:G.world.weather.debug(),wear:G.world.terrain.wearCount,well:G.world.props.camBlockers.filter(b=>b.modelId==='well').map(b=>({opacity:b.mats.map(m=>m.opacity),transparent:b.mats.map(m=>m.transparent)}))})};
}
