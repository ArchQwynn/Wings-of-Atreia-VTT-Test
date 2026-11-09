/* Wings of Atreia VTT — Tactical Overlay layer
 * Separate map objects: auras, line/cone/circle/cube areas, and directional arrows.
 * Uses the existing canvas projection and grid scale; no token/asset records are modified.
 */
(() => {
  if (!window.localStorage) return;
  const KEY = "woa-vtt-tactical-overlays-v1";
  const SYNC_CHANNEL = "woa-vtt-tactical-overlay-sync";
  const MEASUREMENT_CHANNEL = "woa-vtt-shared-measurement";
  const tools = [
    ["select","Select Overlay: Off"],["measure","Measure Distance"],["aura","Token Aura"],["line","Line"],["cone","Cone"],
    ["circle","Circle / Radius"],["cube","Cube"],["arrow","Direction Arrow"]
  ];
  const ui = document.createElement("details");
  ui.className = "panel-group tactical-overlay-panel";
  ui.innerHTML = `
    <summary>Tactical Overlays</summary>
    <div class="overlay-content">
    <div class="overlay-tool-grid">${tools.map(([v,l])=>`<button type="button" data-overlay-tool="${v}" aria-pressed="false">${l}</button>`).join("")}</div>
    <div class="overlay-form-grid">
      <label>Distance Mode<select id="overlay-measure-mode"><option value="2d" selected>Components · Horizontal + Vertical</option><option value="3d">3D · Combined + Components</option></select></label>
      <label>Range (ft)<input id="overlay-range" type="number" min="5" max="300" step="5" value="30"></label>
      <label>Width (ft)<input id="overlay-width" type="number" min="5" max="100" step="5" value="10"></label>
      <label>Cone angle<select id="overlay-angle"><option value="30">30°</option><option value="45">45°</option><option value="60" selected>60°</option><option value="90">90°</option><option value="120">120°</option></select></label>
      <label>Color<input id="overlay-color" type="color" value="#55c8ff"></label>
      <label>Selected Overlay Visibility<select id="overlay-visibility" disabled><option value="gm">GM Only</option><option value="players">Players + GM</option></select></label>
      <label>Opacity <span id="overlay-opacity-value">28%</span><input id="overlay-opacity" type="range" min="8" max="75" value="28"></label>
      <label class="overlay-check"><input id="overlay-snap" type="checkbox" checked> Snap to 5-ft grid</label>
      <label class="overlay-check"><input id="overlay-attach" type="checkbox"> Attach aura to selected token</label>
    </div>
    <div class="editor-row"><button type="button" id="overlay-delete">Delete Selected</button><button type="button" id="overlay-clear">Clear Overlays</button></div>
    <p id="overlay-status" class="note">Choose a tool, then drag on the map. Auras can follow the selected token. Overlays are saved locally in this browser.</p>
    </div>
  `;
  const style = document.createElement("style");
  style.textContent = `
    .tactical-overlay-panel{display:block;padding:0;border:1px solid var(--line);border-radius:10px;background:rgba(8,15,27,.42)}
    .tactical-overlay-panel[open] > .overlay-content{display:grid;gap:9px;padding:12px}
    .overlay-tool-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
    .overlay-tool-grid button{font-size:.72rem;padding:8px 6px}
    .overlay-tool-grid button[aria-pressed="true"]{border-color:#8fd3ff;background:#21415a;box-shadow:inset 0 0 0 1px #8fd3ff}
    .overlay-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .overlay-form-grid label{display:grid;gap:4px;font-size:.7rem;color:#9aa8bd}
    .overlay-form-grid input:not([type=checkbox]):not([type=range]),.overlay-form-grid select{width:100%;min-width:0;padding:7px;border:1px solid #263247;border-radius:7px;background:#0d1626;color:#eef3ff}
    .overlay-form-grid input[type=color]{height:34px;padding:2px}
    .overlay-form-grid input[type=range]{width:100%;accent-color:#8fd3ff}
    .overlay-form-grid .overlay-check{display:flex;align-items:center;gap:6px}
    .overlay-form-grid .overlay-check input{accent-color:#8fd3ff}
    .tactical-overlay-panel .note{margin:0;line-height:1.4}
    @media(max-width:700px){.overlay-tool-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;
  document.head.appendChild(style);
  const panel = document.querySelector(".panel");
  const mapSection = [...(panel?.querySelectorAll("section") || [])].find(s => s.textContent.includes("BATTLEFIELD MAP"));
  if (mapSection) panel.insertBefore(ui, mapSection);
  else panel?.appendChild(ui);
  const $ = id => ui.querySelector("#"+id);
  const status = $("overlay-status");
  const selectedVisibility = $("overlay-visibility");
  const shapes = [];
  const syncChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(SYNC_CHANNEL) : null;
  const measurementChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(MEASUREMENT_CHANNEL) : null;
  try { const saved = JSON.parse(localStorage.getItem(KEY)||"[]"); if (Array.isArray(saved)) shapes.push(...saved.filter(s=>s&&typeof s==="object")); } catch {}
  let tool = "select", overlaySelectEnabled = false, overlayPointerSelecting = false, selected = null, drawing = null, dragging = null, measurement = null, sharedMeasurement = null, currentOpacity = opacityFallback();
  function opacityFallback(){return 0.28;}
  const active = () => (typeof state !== "undefined" && state);
  const gm = () => !active() || !sessionRoleEl || sessionRoleEl.value === "gm";
  function refreshSelectedVisibility(){
    const shape=shapes.find(item=>item.id===selected);
    selectedVisibility.value=shape?.visibility==="players"?"players":"gm";
    selectedVisibility.disabled=!gm()||!shape;
    selectedVisibility.closest("label").hidden=!!document.body.classList.contains("player-screen-mode");
    selectedVisibility.title=shape?"Set visibility for this selected overlay.":"Select an overlay to change its visibility.";
  }
  function publishToPlayerScreen(){
    if(!syncChannel||!gm()||document.body.classList.contains("player-screen-mode"))return;
    const playerShapes=shapes.filter(shape=>shape.visibility==="players");
    syncChannel.postMessage({type:"overlay-state",shapes:playerShapes});
  }
  const clamp = (v,min,max) => Math.max(min,Math.min(max,Number(v)||min));
  const range = () => clamp($("overlay-range").value,5,300)/FEET_PER_GRID;
  const width = () => clamp($("overlay-width").value,5,100)/FEET_PER_GRID;
  const opacity = () => clamp($("overlay-opacity").value,8,75)/100;
  const snap = p => $("overlay-snap").checked ? {x:Math.round(p.x),y:Math.round(p.y)} : p;
  function save(){
    try{localStorage.setItem(KEY,JSON.stringify(shapes));}
    catch{status.textContent="Overlay storage is full; export your scene and remove unused overlays."}
    publishToPlayerScreen();
    refreshSelectedVisibility();
  }
  function worldAt(clientX,clientY){
    const r=canvas.getBoundingClientRect(),sx=clientX-r.left,sy=clientY-r.top,{w,h}=size();
    if(state.view2d)return {x:(sx-w/2-state.camera.panX)/(CELL_PX*state.camera.zoom),y:-(sy-h/2-state.camera.panY)/(CELL_PX*state.camera.zoom)};
    const b=basis(),focal=Math.min(w,h)*.86*state.camera.zoom,cx=(sx-w/2)/focal,cy=(h*.56-sy)/focal;
    const den=b.f.z+cx*b.r.z+cy*b.u.z;
    if(Math.abs(den)<1e-5)return{x:0,y:0};
    const d=-b.pos.z/den;
    return {x:b.pos.x+d*(b.f.x+cx*b.r.x+cy*b.u.x),y:b.pos.y+d*(b.f.y+cx*b.r.y+cy*b.u.y)};
  }
  function tokenCenter(id){
    const t=state.tokens.find(t=>t.id===id);if(!t)return null;
    const p=tokenWorld(t);return{x:p.x,y:p.y};
  }
  function origin(s){if(s.kind==="aura"&&s.tokenId){const p=tokenCenter(s.tokenId);if(p)return p;}return{x:s.x,y:s.y};}
  function path(points,fill,stroke,color,lineWidth=2){
    if(points.length<2)return;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);points.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));
    if(fill){ctx.closePath();ctx.globalAlpha=currentOpacity;ctx.fillStyle=color;ctx.fill();ctx.globalAlpha=1;}
    if(stroke){ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.stroke();}
  }
  function worldCircle(x,y,r,steps=48){const a=[];for(let i=0;i<=steps;i++){const q=i/steps*Math.PI*2;a.push(project(x+Math.cos(q)*r,y+Math.sin(q)*r,terrainHeightAt(x,y)));}return a;}
  function screenGeometry(s){
    const o=origin(s);if(!o)return {polygon:[],segments:[]};
    const r=Math.max(1,Number(s.range)||6),w=Math.max(1,Number(s.width)||2);
    const end={x:Number(s.endX??o.x+r),y:Number(s.endY??o.y)},dx=end.x-o.x,dy=end.y,len=Math.hypot(dx,dy)||r,ang=Math.atan2(dy,dx);
    const P=(x,y)=>project(x,y,terrainHeightAt(x,y));
    let polygon=[],segments=[];
    if(s.kind==="aura"||s.kind==="circle"){
      polygon=worldCircle(o.x,o.y,r,64);
    }else if(s.kind==="line"){
      const half=w/2,px=-Math.sin(ang)*half,py=Math.cos(ang)*half;
      polygon=[[o.x+px,o.y+py],[o.x-px,o.y-py],[o.x+dx-px,o.y+dy-py],[o.x+dx+px,o.y+dy+py]].map(([x,y])=>P(x,y));
    }else if(s.kind==="cone"){
      const a=(Number(s.angle)||60)*Math.PI/180;polygon=[P(o.x,o.y)];
      for(let i=0;i<=32;i++){const q=ang-a/2+i*a/32;polygon.push(P(o.x+Math.cos(q)*r,o.y+Math.sin(q)*r));}
    }else if(s.kind==="cube"){
      const half=r/2,cs=Math.cos(ang),sn=Math.sin(ang);
      polygon=[[-half,-half],[half,-half],[half,half],[-half,half]].map(([x,y])=>P(o.x+x*cs-y*sn,o.y+x*sn+y*cs));
    }else if(s.kind==="arrow"){
      const a=P(o.x,o.y),b=P(end.x,end.y);
      segments=[[a,b]];
      const head=Math.max(10,Math.min(22,Math.hypot(b.x-a.x,b.y-a.y)*.18)),theta=Math.atan2(b.y-a.y,b.x-a.x);
      segments.push([b,{x:b.x-head*Math.cos(theta-.48),y:b.y-head*Math.sin(theta-.48)}]);
      segments.push([b,{x:b.x-head*Math.cos(theta+.48),y:b.y-head*Math.sin(theta+.48)}]);
    }
    if(polygon.length)segments=polygon.map((p,i)=>[p,polygon[(i+1)%polygon.length]]);
    return {polygon,segments};
  }
  function pointInPolygon(p,poly){
    let inside=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const a=poly[i],b=poly[j];
      if(((a.y>p.y)!==(b.y>p.y))&&(p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y||1e-9)+a.x))inside=!inside;
    }
    return inside;
  }
  function distanceToSegment(p,a,b){
    const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
    const t=den?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/den)):0;
    return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy));
  }
  function hitTestShape(s,p){
    const g=screenGeometry(s);
    if(g.polygon.length>=3&&pointInPolygon(p,g.polygon))return true;
    return g.segments.some(([a,b])=>distanceToSegment(p,a,b)<=12);
  }
  function drawShape(s){
    const o=origin(s);if(!o)return;
    const color=s.color||"#55c8ff",r=Math.max(1,Number(s.range)||6),w=Math.max(1,Number(s.width)||2);
    const end={x:Number(s.endX??o.x+r),y:Number(s.endY??o.y)},dx=end.x-o.x,dy=end.y,len=Math.hypot(dx,dy)||r,ang=Math.atan2(dy,dx);
    const P=(x,y)=>project(x,y,terrainHeightAt(x,y));
    if(s.kind==="aura"||s.kind==="circle"){
      path(worldCircle(o.x,o.y,r),true,true,color);
    }else if(s.kind==="line"){
      const half=w/2,px=-Math.sin(ang)*half,py=Math.cos(ang)*half;
      path([[o.x+px,o.y+py],[o.x-px,o.y-py],[o.x+dx-px,o.y+dy-py],[o.x+dx+px,o.y+dy+py]].map(([x,y])=>P(x,y)),true,true,color);
    }else if(s.kind==="cone"){
      const a=Number(s.angle)||60,pts=[P(o.x,o.y)];
      for(let i=0;i<=24;i++){const q=ang-a*Math.PI/360+i*(a*Math.PI/180)/24;pts.push(P(o.x+Math.cos(q)*r,o.y+Math.sin(q)*r));}
      path(pts,true,true,color);
    }else if(s.kind==="cube"){
      const half=r/2,cs=Math.cos(ang),sn=Math.sin(ang);
      const corners=[[-half,-half],[half,-half],[half,half],[-half,half]].map(([x,y])=>P(o.x+x*cs-y*sn,o.y+x*sn+y*cs));
      path([...corners,corners[0]],true,true,color);
    }else if(s.kind==="arrow"){
      const a=P(o.x,o.y),b=P(end.x,end.y),head=Math.max(10,Math.min(22,Math.hypot(b.x-a.x,b.y-a.y)*.18)),theta=Math.atan2(b.y-a.y,b.x-a.x);
      path([a,b],false,true,color,3);path([b,{x:b.x-head*Math.cos(theta-.48),y:b.y-head*Math.sin(theta-.48)},{x:b.x-head*Math.cos(theta+.48),y:b.y-head*Math.sin(theta+.48)}],false,true,color,3);
    }
    if(s.id===selected){const p=P(o.x,o.y);ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.stroke();}
  }
  function measuredObjectAt(clientX,clientY){
    const rect=canvas.getBoundingClientRect(),p={x:clientX-rect.left,y:clientY-rect.top};
    let found=null,best=Infinity;
    for(let i=state.tokens.length-1;i>=0;i--){
      const t=state.tokens[i],q=tokenProject(t),rad=Math.max(12,tokenRadius(t));
      if(Number.isFinite(q.x)&&Number.isFinite(q.y)){
        const d=Math.hypot(p.x-q.x,p.y-q.y);
        if(d<=rad+6&&d<best){found={tokenId:t.id,name:t.name||"Token"};best=d;}
      }
    }
    for(let i=(state.assets||[]).length-1;i>=0;i--){
      const a=state.assets[i],s=a._screen;if(!s)continue;
      const dx=p.x-s.x,dy=p.y-s.y,ang=-(s.rotation||0)*Math.PI/180;
      const rx=dx*Math.cos(ang)-dy*Math.sin(ang),ry=dx*Math.sin(ang)+dy*Math.cos(ang);
      if(Math.abs(rx)<=(s.hitWidth||s.width||16)/2+6&&Math.abs(ry)<=(s.hitHeight||s.height||16)/2+6){
        const d=Math.hypot(dx,dy);
        if(d<best){found={assetId:a.id,name:a.name||"Prop"};best=d;}
      }
    }
    return found;
  }
  function measurementPoint(endpoint){
    if(endpoint?.tokenId){
      const t=state.tokens.find(t=>t.id===endpoint.tokenId);
      if(t){const p=tokenWorld(t),z=terrainHeightAt(p.x,p.y)+Math.max(0,Math.min(MAX_ALTITUDE,Number(t.z)||0));return{x:p.x,y:p.y,z,name:t.name||"Token",token:t};}
    }
    if(endpoint?.assetId){
      const a=(state.assets||[]).find(a=>a.id===endpoint.assetId);
      if(a){const z=terrainHeightAt(a.x,a.y)+Math.max(0,Math.min(MAX_ALTITUDE,Number(a.z)||0));return{x:a.x,y:a.y,z,name:a.name||"Prop",asset:a};}
    }
    if(endpoint&&Number.isFinite(endpoint.x)&&Number.isFinite(endpoint.y))return{x:endpoint.x,y:endpoint.y,z:terrainHeightAt(endpoint.x,endpoint.y),name:"Point"};
    return null;
  }
  function increment5(value){
    const d=Math.abs(Number(value)||0);
    if(d<5)return 0;
    return Math.ceil((d-1e-8)/5)*5;
  }
  function distanceValues(start,end,modeOverride){
    const dx=Math.abs(end.x-start.x),dy=Math.abs(end.y-start.y);
    const horizontal=Math.round(Math.max(dx,dy))*FEET_PER_GRID;
    const rawVertical=end.z-start.z,vertical=increment5(rawVertical)*(rawVertical<0?-1:rawVertical>0?1:0);
    const mode=modeOverride||$("overlay-measure-mode").value;
    const total=mode==="3d"
      ?increment5(Math.sqrt(Math.pow(horizontal,2)+Math.pow(vertical,2)))
      :horizontal;
    return {horizontal,vertical,total,mode};
  }
  const measurementReadout=document.createElement("div");
  measurementReadout.className="player-measurement-readout";
  measurementReadout.style.cssText="position:absolute;top:58px;left:14px;z-index:29;display:none;max-width:min(420px,calc(100% - 28px));padding:8px 12px;border:1px solid rgba(255,232,120,.85);border-radius:8px;background:rgba(5,8,15,.94);color:#fff;font:700 13px system-ui;line-height:1.35;box-shadow:0 3px 14px rgba(0,0,0,.35);pointer-events:none;";
  document.querySelector(".stage-card")?.appendChild(measurementReadout);
  function drawMeasurement(target=measurement,modeOverride){
    if(!target?.end){measurementReadout.style.display="none";return;}
    const ap=measurementPoint(target.start),bp=measurementPoint(target.end);
    if(!ap||!bp)return;
    const a=project(ap.x,ap.y,ap.z),b=project(bp.x,bp.y,bp.z);
    if(!Number.isFinite(a.x)||!Number.isFinite(b.x))return;
    const values=distanceValues(ap,bp,modeOverride||target.mode);
    const label="H "+values.horizontal+" ft  |  V "+(values.vertical>0?"+":"")+values.vertical+" ft"+(values.mode==="3d"?"  |  3D "+values.total+" ft":"");
    measurementReadout.textContent=label;
    measurementReadout.style.display="block";
    ctx.save();ctx.strokeStyle="#ffe878";ctx.fillStyle="#ffe878";ctx.lineWidth=3;ctx.setLineDash([8,6]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);
    for(const p of [a,b]){ctx.beginPath();ctx.arc(p.x,p.y,5,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }
  function render(){if(!ctx||!active())return;ctx.save();for(const s of shapes){if(!gm()&&s.visibility!=="players")continue;try{currentOpacity=Number.isFinite(Number(s.opacity))?Number(s.opacity):opacity();drawShape(s)}catch{}}if(drawing&&gm()){try{currentOpacity=Number.isFinite(Number(drawing.opacity))?Number(drawing.opacity):opacity();drawShape(drawing)}catch{}}try{if(gm()&&tool!=="measure"&&sharedMeasurement)drawMeasurement(sharedMeasurement,sharedMeasurement.mode);else drawMeasurement()}catch{}ctx.restore();}
  // Called by the main scene renderer after terrain but before props/assets and tokens.
  window.drawTacticalOverlays=render;
  function refreshToolButtons(){
    ui.querySelectorAll("[data-overlay-tool]").forEach(b=>{
      const isSelect=b.dataset.overlayTool==="select";
      b.setAttribute("aria-pressed",String(isSelect?overlaySelectEnabled:b.dataset.overlayTool===tool&&tool!=="select"));
      if(isSelect)b.textContent="Select Overlay: "+(overlaySelectEnabled?"On":"Off");
    });
  }
  function setOverlaySelection(enabled, message){
    overlaySelectEnabled=!!enabled;
    tool="select";
    refreshToolButtons();
    if(message)status.textContent=message;
    else status.textContent=overlaySelectEnabled
      ?"Select Overlay is ON. Click or drag an overlay; it will turn OFF after you interact with one."
      :"Select Overlay is OFF. Tokens and props can be clicked normally.";
  }
  function choose(t){
    if(t==="select"){setOverlaySelection(!overlaySelectEnabled);return;}
    tool=t;overlaySelectEnabled=false;refreshToolButtons();
    if(t==="measure"){measurement=null;if(gm())sharedMeasurement=null;else publishMeasurement(null);refreshPlayerMeasureButton();status.textContent=$("overlay-measure-mode").value==="3d"?"3D Measure: click any token, prop, or asset for point A, then another object for point B. Shows horizontal and vertical components plus combined 3D distance, using 5-ft increments.":"Measure: click any token, prop, or asset for point A, then another object for point B. Shows horizontal and vertical components using 5-ft increments.";return;}
    status.textContent=t==="aura"?"Choose or select a token, then left-click the map once to place its aura.":"Drag on the map to set the shape's direction and size.";
  }
  ui.querySelectorAll("[data-overlay-tool]").forEach(b=>b.addEventListener("click",()=>choose(b.dataset.overlayTool)));
  let playerMeasureButton=null;
  if(document.body.classList.contains("player-screen-mode")){
    playerMeasureButton=document.createElement("button");
    playerMeasureButton.type="button";playerMeasureButton.className="player-measure-button";playerMeasureButton.textContent="Measure Distance";
    playerMeasureButton.style.cssText="position:absolute;top:14px;left:14px;z-index:30;padding:10px 14px;border:1px solid #8fd3ff;border-radius:9px;background:rgba(17,24,39,.96);color:#eef3ff;font:700 13px system-ui;box-shadow:0 3px 14px rgba(0,0,0,.35);";
    document.querySelector(".stage-card")?.appendChild(playerMeasureButton);
    playerMeasureButton.addEventListener("click",()=>{if(tool==="measure"){measurement=null;tool="select";refreshToolButtons();publishMeasurement(null);status.textContent="Measurement cancelled.";}else choose("measure");refreshPlayerMeasureButton();});
  }
  function refreshPlayerMeasureButton(){if(!playerMeasureButton)return;const activeMeasure=tool==="measure";playerMeasureButton.textContent=activeMeasure?"Cancel Measure":"Measure Distance";playerMeasureButton.setAttribute("aria-pressed",String(activeMeasure));}
  function publishMeasurement(value){if(!measurementChannel||gm())return;measurementChannel.postMessage({type:"player-measurement",measurement:value?{start:value.start,end:value.end,complete:!!value.complete,mode:value.mode||$("overlay-measure-mode").value}:null});}
  selectedVisibility.addEventListener("change",()=>{
    if(!gm())return;
    const shape=shapes.find(item=>item.id===selected);
    if(!shape)return;
    shape.visibility=selectedVisibility.value==="players"?"players":"gm";
    save();
    status.textContent=shape.visibility==="players"?"Selected overlay is visible to players and the GM.":"Selected overlay is visible to the GM only.";
  });
  sessionRoleEl?.addEventListener("change",refreshSelectedVisibility);
  window.addEventListener("storage",e=>{
    if(e.key===KEY&&!gm()){
      try{const saved=JSON.parse(e.newValue||"[]");if(Array.isArray(saved)){shapes.splice(0,shapes.length,...saved.filter(x=>x&&typeof x==="object"&&x.visibility==="players"));}}
      catch{}
    }
  });
  if(measurementChannel){
    measurementChannel.onmessage=e=>{
      const message=e.data;
      if(!gm()||message?.type!=="player-measurement")return;
      sharedMeasurement=message.measurement&&message.measurement.start&&message.measurement.end?message.measurement:null;
    };
  }
  if(syncChannel){
    syncChannel.onmessage=e=>{
      const message=e.data;
      if(!message||message.type!=="overlay-state"||gm())return;
      const incoming=Array.isArray(message.shapes)?message.shapes:[];
      shapes.splice(0,shapes.length,...incoming.filter(x=>x&&typeof x==="object"));
    };
    if(!gm())syncChannel.postMessage({type:"overlay-request"});
    else syncChannel.onmessage=e=>{
      const message=e.data;
      if(message?.type==="overlay-request")publishToPlayerScreen();
    };
  }
  refreshSelectedVisibility();
  if(gm())publishToPlayerScreen();
  refreshToolButtons();
  status.textContent="Select Overlay is OFF. Tokens and props can be clicked normally.";
  $("overlay-opacity").addEventListener("input",()=>{$("overlay-opacity-value").textContent=$("overlay-opacity").value+"%";const s=shapes.find(s=>s.id===selected);if(s){s.opacity=opacity();save();}});
  $("overlay-delete").addEventListener("click",()=>{const i=shapes.findIndex(s=>s.id===selected);if(i>=0){shapes.splice(i,1);selected=null;save();refreshSelectedVisibility();}});
  $("overlay-clear").addEventListener("click",()=>{if(!gm())return;if(confirm("Delete every tactical overlay?")){shapes.length=0;selected=null;save();}});
  canvas.addEventListener("pointerdown",e=>{
    // Measurement is available to everyone; editing tactical overlays remains GM-only.
    if(tool!=="measure"&&!gm())return;
    // Only primary-button presses interact with the canvas; right-click must never place objects.
    if(e.button!==0)return;
    if(tool==="measure"){
      e.preventDefault();e.stopImmediatePropagation();
      const object=measuredObjectAt(e.clientX,e.clientY);
      if(!object){status.textContent="Click directly on a token, prop, or asset to choose a measurement endpoint.";return;}
      const endpoint=object;
      if(!measurement||measurement.complete){measurement={start:endpoint,end:endpoint,complete:false,mode:$("overlay-measure-mode").value};publishMeasurement(measurement);status.textContent="Point A: "+(object.name||"object")+". Click a token, prop, or asset for point B.";}
      else{
        measurement.end=endpoint;measurement.complete=true;publishMeasurement(measurement);
        const ap=measurementPoint(measurement.start),bp=measurementPoint(measurement.end),v=distanceValues(ap,bp,measurement.mode);
        tool="select";overlaySelectEnabled=false;refreshToolButtons();refreshPlayerMeasureButton();
        status.textContent="Horizontal: "+v.horizontal+" ft; vertical: "+(v.vertical>0?"+":"")+v.vertical+" ft"+(v.mode==="3d"?"; combined 3D distance: "+v.total+" ft":"")+". Choose Measure Distance to measure again.";
      }
      return;
    }
    if(tool==="select"){
      if(!overlaySelectEnabled)return;
      const rect=canvas.getBoundingClientRect(),p={x:e.clientX-rect.left,y:e.clientY-rect.top};
      let best=null;
      // Test in reverse paint order so the visually topmost overlay is selected first.
      for(let i=shapes.length-1;i>=0;i--){if(hitTestShape(shapes[i],p)){best=shapes[i];break;}}
      selected=best?.id||null;
      refreshSelectedVisibility();
      if(best){
        overlayPointerSelecting=true;
        e.preventDefault();e.stopImmediatePropagation();
        if(!(best.kind==="aura"&&best.tokenId)){dragging={id:best.id};canvas.setPointerCapture?.(e.pointerId);}
        status.textContent=best.kind==="aura"&&best.tokenId
          ?"Aura selected. It follows its attached token."
          :"Overlay selected. Click anywhere inside its shape or on its outline; drag to reposition.";
      }
      return;
    }
    e.preventDefault();e.stopImmediatePropagation();
    const p=snap(worldAt(e.clientX,e.clientY)),token=state.tokens.find(t=>t.id===state.selected);
    if(tool==="aura"){
      const s={id:crypto.randomUUID?.()||String(Date.now()+Math.random()),kind:"aura",x:p.x,y:p.y,range:range(),width:width(),color:$("overlay-color").value,opacity:opacity(),visibility:"gm",tokenId:$("overlay-attach").checked&&token?token.id:null};
      shapes.push(s);selected=s.id;save();choose("select");return;
    }
    drawing={id:"preview",kind:tool,x:p.x,y:p.y,endX:p.x,endY:p.y,range:range(),width:width(),angle:Number($("overlay-angle").value),color:$("overlay-color").value,opacity:opacity()};
    canvas.setPointerCapture?.(e.pointerId);
  },true);
  canvas.addEventListener("pointermove",e=>{
    if(dragging){e.preventDefault();e.stopImmediatePropagation();const s=shapes.find(s=>s.id===dragging.id);if(s){const p=snap(worldAt(e.clientX,e.clientY));s.x=p.x;s.y=p.y;}return;}
    if(!drawing)return;e.preventDefault();e.stopImmediatePropagation();
    const p=snap(worldAt(e.clientX,e.clientY));drawing.endX=p.x;drawing.endY=p.y;
    const d=Math.hypot(p.x-drawing.x,p.y-drawing.y);
    if(d>.1)drawing.range=d;
  },true);
  canvas.addEventListener("pointerup",e=>{
    if(dragging){e.preventDefault();e.stopImmediatePropagation();dragging=null;save();overlayPointerSelecting=false;setOverlaySelection(false,"Overlay interaction complete. Select Overlay is OFF; tokens and props can be clicked normally.");return;}
    if(overlayPointerSelecting){e.preventDefault();e.stopImmediatePropagation();overlayPointerSelecting=false;setOverlaySelection(false,"Overlay selected. Select Overlay is now OFF; tokens and props can be clicked normally.");return;}
    if(!drawing)return;e.preventDefault();e.stopImmediatePropagation();
    drawing.id=crypto.randomUUID?.()||String(Date.now()+Math.random());
    drawing.visibility="gm";
    if(["line","arrow","cone"].includes(drawing.kind)&&Math.hypot(drawing.endX-drawing.x,drawing.endY-drawing.y)<.1)drawing.endX=drawing.x+drawing.range;
    if(drawing.kind==="circle"||drawing.kind==="cube")drawing.range=Math.max(1,Math.hypot(drawing.endX-drawing.x,drawing.endY-drawing.y));
    shapes.push(drawing);selected=drawing.id;drawing=null;save();choose("select");
  },true);
  canvas.addEventListener("pointercancel",()=>{drawing=null;dragging=null;overlayPointerSelecting=false;setOverlaySelection(false,"Select Overlay is OFF. Tokens and props can be clicked normally.");},true);
  $("overlay-range").addEventListener("change",()=>{const s=shapes.find(s=>s.id===selected);if(s){s.range=range();save();}});
  $("overlay-width").addEventListener("change",()=>{const s=shapes.find(s=>s.id===selected);if(s){s.width=width();save();}});
  // Keep the overlay renderer on top of the existing canvas scene.
  requestAnimationFrame(render);
})();
