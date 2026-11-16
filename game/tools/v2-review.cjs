/** Reproducible visual/interaction QA. Chromium+SwiftShader simulation, never physical-device certification.
 * node v2-review.cjs ROOT OUTPUT [scenes|walkthrough|perf] [beat-filter]
 * ROOT must have a development build for scenes/walkthrough. Results distinguish dev jumps, scripted input, CDP touch.
 */
const fs=require('fs'),path=require('path'),{pathToFileURL}=require('url');
const {chromium}=require(path.join(require('child_process').execSync('npm root -g').toString().trim(),'playwright'));
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),mode=process.argv[4]||'scenes',filter=process.argv[5];
fs.mkdirSync(out,{recursive:true});
const result={method:'Chromium headless + SwiftShader; 844x390 CSS px DPR1 touch emulation. Developer API scene entry and fixed simulation steps. CDP touch events for sticks/look/holds. No physical mobile hardware; no Safari certification.',mode,root,shots:[],checks:[],errors:[],requests:[]};
const save=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));
(async()=>{const {createServer}=await import(pathToFileURL(path.join(root,'game/tools/serve.mjs')).href);const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-dev-shm-usage']});result.browser=await b.version();
try{
 if(mode==='perf'){
 result.method='Chromium153 headless SwiftShader software rendering, real requestAnimationFrame wall-clock samples, adaptive quality active, one browser. UA and touch-point simulation only; no real iPhone/Android/iPad or Safari.';
 for(const [name,w,h,quality] of [['phone-landscape',844,390,'low'],['phone-portrait',390,844,'low'],['tablet-landscape',1024,768,'medium']]){
 if(filter&&filter!==name)continue;
 const ctx=await b.newContext({viewport:{width:w,height:h},hasTouch:true,isMobile:true,deviceScaleFactor:1,locale:'ar-QA',userAgent:name==='tablet-landscape'?'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15':name==='phone-portrait'?'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1':'Mozilla/5.0 (Linux; Android 13; Pixel 6a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'}),p=await ctx.newPage();
 await p.addInitScript(()=>Object.defineProperty(Navigator.prototype,'maxTouchPoints',{get:()=>5}));
 p.on('pageerror',e=>result.errors.push({profile:name,error:String(e)}));
 await p.goto('http://127.0.0.1:'+server.address().port+'/?dev=1&q='+quality+'&ch=1&beat=c1_wake',{waitUntil:'load'});
 await p.waitForFunction(()=>window.__G&&__G.state.mode==='play',{timeout:40000});
 await p.evaluate(()=>document.querySelectorAll('pre').forEach(e=>e.style.display='none'));await p.waitForTimeout(2500);
 const perf=await p.evaluate(()=>new Promise(resolve=>{const ms=[],G=__G;let last=0,start=performance.now();function f(t){if(last)ms.push(t-last);last=t;if(t-start<10000){requestAnimationFrame(f);return}ms.sort((a,b)=>a-b);const gl=G.renderer.getContext(),ex=gl.getExtension('WEBGL_debug_renderer_info');resolve({samples:ms.length,elapsed:t-start,p50:ms[Math.floor(ms.length*.5)],p95:ms[Math.floor(ms.length*.95)],mean:ms.reduce((a,b)=>a+b,0)/ms.length,renderer:ex?gl.getParameter(ex.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),draw:{calls:G.renderer.info.render.calls,triangles:G.renderer.info.render.triangles},resolution:[G.canvas.width,G.canvas.height],quality:G.quality.level,antialias:gl.getContextAttributes().antialias,userAgent:navigator.userAgent,maxTouchPoints:navigator.maxTouchPoints,state:{mode:G.state.mode,beat:G.state.beat}})}requestAnimationFrame(f)}));
 result.checks.push({profile:name,width:w,height:h,quality,...perf});await p.screenshot({path:path.join(out,name+'.jpg'),type:'jpeg',quality:75});save();console.log('PERF',JSON.stringify(result.checks.at(-1)));await ctx.close();
 }
 return;
}
 const scenes=[[1,'c1_wake'],[1,'c1_well'],[1,'c1_ride'],[2,'c2_storm'],[3,'c3_fire'],[3,'c3_polaris'],[3,'c3_wolves'],[4,'c4_search'],[5,'c5_walk'],[5,'c5_words']].filter(x=>!filter||filter.split(',').includes(x[1]));
 for(const [ch,beat] of mode==='scenes'?scenes:[[1,'full_story']]){
 const ctx=await b.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1,locale:'ar-QA'});const p=await ctx.newPage();p.on('pageerror',e=>result.errors.push({beat,error:String(e)}));p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('WebSocket'))result.errors.push({beat,console:m.text().slice(0,600)})});p.on('response',r=>{if(r.status()>=400&&!r.url().includes('/ws'))result.requests.push({beat,url:r.url(),status:r.status()})});
 await p.goto('http://127.0.0.1:'+server.address().port+'/?test=1&q=medium',{waitUntil:'load'});await p.waitForFunction(()=>window.__hs?.ready,{timeout:30000});
 await p.evaluate(()=>{const G=__hs.G;G.state.fastText=false;G.state.autoPlay=false;G.ui.menus.hideAll();document.querySelectorAll('pre').forEach(e=>e.style.display='none');});
 if(mode==='walkthrough'){
  result.walkthrough=await p.evaluate(async()=>{const events=[];for(const name of ['stars:found','wolf:telegraph','wolf:lunge','wolf:repelled','wolf:bite'])__hs.G.events.on(name,e=>events.push({type:name,id:e?.id||e?.wolf?.id||null,beat:__hs.G.state.beat,time:__hs.G.time.now,feint:!!e?.feint}));const run=await __hs.bot.runAll({maxSteps:150000,choices:{c2_ration:'child'},realtime:true});return{...run,events}});
  await p.screenshot({path:path.join(out,'story-end.jpg'),type:'jpeg',quality:80});
  console.log('WALKTHROUGH',JSON.stringify(result.walkthrough));save();await ctx.close();break;
 }
 await p.evaluate(async({ch,beat})=>{await __hs.chapter(ch,beat);for(let i=0;i<900;i++){await __hs.step(3);if(__hs.G.state.mode!=='loading'&&__hs.G.state.mode!=='boot')break;await new Promise(r=>setTimeout(r,15));}await __hs.step(beat==='c5_walk'||beat==='c3_wolves'?60:420)},{ch,beat});
 const cdp=await ctx.newCDPSession(p),tick=n=>p.evaluate(n=>__hs.step(n),n);
 async function shot(tag){const state=await p.evaluate(()=>{const G=__hs.G;G.renderer.render(G.scene,G.camera);const gl=G.renderer.getContext(),ex=gl.getExtension('WEBGL_debug_renderer_info');let wellContact=null;const rig=G.scene.getObjectByName('well-action');if(rig){const ropes=rig.children.filter(o=>o.isMesh&&o.geometry?.parameters?.radiusTop===0.012);const v=G.camera.position.clone();wellContact={progress:rig.userData.progress,holding:rig.userData.holding,bucket:G.scene.getObjectByName('moving-bucket')?.position.toArray(),palms:{}};for(const hand of ['handL','handR']){const sock=G.actors.player.actor.socket(hand);if(sock){const pt=sock.getWorldPosition(v).clone();let gap=Infinity;for(const r of ropes){const a=r.localToWorld(v.clone().set(0,-.5,0)),b=r.localToWorld(v.clone().set(0,.5,0)),ab=b.clone().sub(a),t=Math.max(0,Math.min(1,pt.clone().sub(a).dot(ab)/ab.lengthSq()));gap=Math.min(gap,pt.distanceTo(a.addScaledVector(ab,t)))}wellContact.palms[hand]={world:pt.toArray(),gapToRopeMeters:gap,gapToTargetMeters:rig.userData[hand==='handL'?'gripLeft':'gripRight']?pt.distanceTo(rig.userData[hand==='handL'?'gripLeft':'gripRight']):null}}}}return{wellContact,state:__hs.state(),text:document.querySelector('#ui')?.innerText,choice:G.ui.dialogue.choosing,typing:G.ui.dialogue.typing,verb:G.sys.interact.verb?.labelKey,camera:{yaw:G.actors.cam.yaw,pitch:G.actors.cam.pitch,pos:G.camera.position.toArray()},renderer:ex?gl.getParameter(ex.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),errors:__hs.errors.slice()};});const filename=beat+'_'+tag+'.jpg';await p.waitForTimeout(350);await p.screenshot({path:path.join(out,filename),type:'jpeg',quality:80,timeout:30000});result.shots.push({file:filename,...state});save();console.log('SHOT',filename,state.state.beat,state.state.mode);return state;}
 async function touch(type,x,y){await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1}]});await p.waitForTimeout(30);}
 async function drag(x,y,dx,dy,frames=120){await touch('touchStart',x,y);await tick(1);for(let i=1;i<=6;i++){await touch('touchMove',x+dx*i/6,y+dy*i/6);await tick(1)}await tick(frames);await touch('touchEnd');await tick(30);}
 if(beat==='c5_walk'||beat==='c3_wolves'){await shot('establishing');await tick(360);}
 await shot('start');
 if(['c1_wake','c1_ride','c2_storm','c4_search','c5_walk'].includes(beat)){
  const before=await p.evaluate(()=>__hs.state());await drag(110,290,0,-34,150);const after=await p.evaluate(()=>__hs.state());result.checks.push({beat,type:'CDP touch movement',before,after,distance:Math.hypot(after.player.x-before.player.x,after.player.z-before.player.z)});await shot('walk');await drag(650,205,90,-22,30);await shot('turn');
  await touch('touchStart',110,290);await touch('touchMove',110,246);await tick(45);await touch('touchCancel');await tick(90);result.checks.push({beat,type:'touch cancel',state:await p.evaluate(()=>__hs.state()),move:await p.evaluate(()=>({...__hs.G.input.move}))});
 }
 if(beat==='c3_polaris'){await drag(650,240,0,-120,90);await shot('sky');}
 if(beat==='c3_wolves'){await tick(720);await shot('late');}
 if(beat==='c1_well'||beat==='c3_fire'){
  // Walk with public movement vectors toward the objective, stop as soon as contextual verb becomes usable. No warp.
  const approach=await p.evaluate(async()=>{const G=__hs.G;await __hs.until(()=>{if(G.sys.interact.verb?.kind)return true;const t=G.sys.objectives.current?.at;if(!t)return true;__hs.bot.steer(t,.5);return false},750);G.input.clearSource('feed');await __hs.step(15);return __hs.state()});result.checks.push({beat,type:'walked to interaction',state:approach});await shot('inreach');
  const bb=await p.locator('.tb.ctx').boundingBox();if(bb){await touch('touchStart',bb.x+bb.width/2,bb.y+bb.height/2);for(let i=0;i<(beat==='c1_well'?14:7);i++){await tick(18);await shot('hold'+i)}await touch('touchEnd');await tick(150);await shot('after_hold');}
 }
 if(beat==='c3_fire'||beat==='c5_words'){
  for(let i=0;i<25;i++){await tick(240);const s=await shot('dialogue'+String(i).padStart(2,'0'));if(s.choice){const box=await p.locator('.choices .opt').first().boundingBox();if(box){await touch('touchStart',box.x+box.width/2,box.y+box.height/2);await tick(50);await touch('touchEnd');}}else if(s.state.mode==='dialogue'){await p.touchscreen.tap(430,315);await tick(3);}else if(s.state.mode==='play'&&i>3)break;}
 }
 result.checks.push({beat,type:'end-scene',state:await p.evaluate(()=>__hs.state()),errors:await p.evaluate(()=>__hs.errors)});save();await ctx.close();
 }
} catch(e){result.fatal=String(e.stack);console.error(e.stack);process.exitCode=1}finally{save();await b.close();server.close();}
})();
