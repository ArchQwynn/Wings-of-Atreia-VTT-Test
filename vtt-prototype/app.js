const playerScreenMode=new URLSearchParams(location.search).get('mode')==='player';
const sessionRoleEl=document.getElementById('session-role'),sessionPlayerNameEl=document.getElementById('session-player-name'),playerNameWrap=document.getElementById('player-name-wrap'),permissionStatusEl=document.getElementById('permission-status');
const tokenClassEl=document.getElementById('token-class'),tokenNameEl=document.getElementById('token-name'),tokenGlyphEl=document.getElementById('token-glyph'),tokenColorEl=document.getElementById('token-color'),tokenFootprintEl=document.getElementById('token-footprint'),tokenVisibilityEl=document.getElementById('token-visibility'),tokenAssignmentEl=document.getElementById('token-assignment'),tokenPlayersEl=document.getElementById('token-players'),tokenImageFileEl=document.getElementById('token-image-file'),tokenImageStatusEl=document.getElementById('token-image-status');
const tokenImageCache=new Map();


const canvas=document.getElementById('scene'),ctx=canvas?.getContext('2d'),selectionEl=document.getElementById('selection'),altitudeEl=document.getElementById('altitude'),movementEl=document.getElementById('movement-readout'),tokenList=document.getElementById('tokens');
const FEET_PER_GRID=5,ALTITUDE_STEP=5,MAX_ALTITUDE=120,MIN_ZOOM=.35,MAX_ZOOM=10,GRID_RADIUS=40,CELL_PX=42,NEAR=.5;
const terrainTypeEl=document.getElementById('terrain-type'),terrainHeightEl=document.getElementById('terrain-height'),terrainStatusEl=document.getElementById('terrain-status');
const assetNameEl=document.getElementById('asset-name'),assetImageFileEl=document.getElementById('asset-image-file'),assetSwapImageFileEl=document.getElementById('asset-swap-image-file'),assetWidthEl=document.getElementById('asset-width'),assetDepthEl=document.getElementById('asset-depth'),assetRotationEl=document.getElementById('asset-rotation'),assetAltitudeEl=document.getElementById('asset-altitude'),assetVisibilityEl=document.getElementById('asset-visibility'),assetStatusEl=document.getElementById('asset-status');
const assetImageCache=new Map();
const imageFramingLimits={zoom:{min:1,max:10,step:.05},x:{min:-.8,max:.8,step:.02},y:{min:-.8,max:.8,step:.02}};
function imageFramingValue(obj,axis){return axis==='zoom'?Math.max(1,Math.min(10,Number(obj?.imageZoom)||1)):Math.max(-.8,Math.min(.8,Number(obj?.['image'+axis.toUpperCase()])||0))}
function updateImageFramingReadout(type,obj){const root=document.querySelector('[data-image-framing="'+type+'"]');if(!root)return;root.querySelectorAll('[data-image-value]').forEach(el=>{const axis=el.dataset.imageValue,value=imageFramingValue(obj,axis);el.textContent=axis==='zoom'?value.toFixed(2)+'×':value.toFixed(2)});root.querySelectorAll('[data-image-zoom-object]').forEach(slider=>{slider.value=String(imageFramingValue(obj,'zoom'));slider.disabled=!obj?.image||!!obj?.locked||!isGM()});root.querySelectorAll('[data-image-adjust-object]').forEach(button=>{button.disabled=!obj?.image||!!obj?.locked||!isGM()})}
let imageFramingActive=false,imageFramingSaveTimer=null,imageFramingBroadcastTimer=null;function scheduleImageFramingSave(){clearTimeout(imageFramingSaveTimer);clearTimeout(imageFramingBroadcastTimer);imageFramingSaveTimer=setTimeout(()=>{imageFramingActive=false;saveSceneToBrowser();if(!playerScreenMode&&isGM()&&playerScreenChannel)broadcastPlayerScene()},350)}function adjustObjectImageFraming(type,axis,delta){if(!isGM())return;const obj=type==='token'?state.tokens.find(t=>t.id===state.selected):state.assets.find(a=>a.id===state.selectedAsset);if(!obj?.image||obj.locked)return;const current=imageFramingValue(obj,axis),limits=imageFramingLimits[axis];if(!limits)return;const next=Math.max(limits.min,Math.min(limits.max,Math.round((current+delta)*1000)/1000));if(next===current)return;recordUndo();imageFramingActive=true;if(axis==='zoom')obj.imageZoom=next;else obj['image'+axis.toUpperCase()]=next;updateImageFramingReadout(type,obj);scheduleImageFramingSave()}
document.querySelectorAll('[data-image-adjust-object]').forEach(button=>button.addEventListener('click',()=>adjustObjectImageFraming(button.dataset.imageAdjustObject,button.dataset.imageAdjustAxis,Number(button.dataset.imageAdjustDelta)||0)));document.querySelectorAll('[data-image-zoom-object]').forEach(slider=>{slider.addEventListener('input',()=>{if(!isGM())return;const type=slider.dataset.imageZoomObject,obj=type==='token'?state.tokens.find(t=>t.id===state.selected):state.assets.find(a=>a.id===state.selectedAsset);if(!obj?.image||obj.locked)return;if(slider.dataset.undoRecorded!=='true'){recordUndo();slider.dataset.undoRecorded='true'}imageFramingActive=true;obj.imageZoom=Math.max(1,Math.min(10,Number(slider.value)||1));const root=document.querySelector('[data-image-framing="'+type+'"]'),readout=root?.querySelector('[data-image-value="zoom"]');if(readout)readout.textContent=obj.imageZoom.toFixed(2)+'×'});slider.addEventListener('change',()=>{if(slider.dataset.undoRecorded==='true'){slider.dataset.undoRecorded='false';scheduleImageFramingSave()}})});
function applyMobileLayout(){const narrow=window.innerWidth<=850,layout=document.querySelector('.layout'),stage=document.querySelector('.stage-card'),panel=document.querySelector('.panel');if(!layout||!stage||!panel)return;if(narrow){Object.assign(layout.style,{display:'flex',flexDirection:'column',width:'100%',maxWidth:'100vw',minWidth:'0',height:'auto',minHeight:'0',overflowX:'hidden'});Object.assign(stage.style,{order:'1',width:'100%',maxWidth:'100%',minWidth:'0',height:window.innerWidth<=520?'58dvh':'62dvh',minHeight:'320px',flex:'none',borderRight:'0'});Object.assign(panel.style,{order:'2',display:'flex',flexDirection:'column',alignItems:'stretch',width:'100%',maxWidth:'100%',minWidth:'0',boxSizing:'border-box',height:'auto',minHeight:'0',maxHeight:'none',overflowX:'hidden',overflowY:'visible'});}else{for(const key of ['display','flex-direction','width','max-width','min-width','height','min-height','overflow-x'])layout.style.removeProperty(key);for(const key of ['order','width','max-width','min-width','height','min-height','flex','border-right'])stage.style.removeProperty(key);for(const key of ['order','display','flex-direction','align-items','width','max-width','min-width','box-sizing','height','min-height','max-height','overflow-x','overflow-y'])panel.style.removeProperty(key);}}
addEventListener('resize',applyMobileLayout);applyMobileLayout();
const state={combatRound:1,combatTurn:0,camera:{yaw:-.65,elevation:.68,distance:60,zoom:1,targetX:0,targetY:0,targetZ:0},selected:'ranger',selectedTokenIds:['ranger'],selectedAssetIds:[],selectionBox:null,drag:null,pointers:new Map(),pinchDistance:null,lastPinchMid:null,view2d:false,movingToken:null,moveOffset:{x:0,y:0},moveStart:null,moveUndoSnapshot:null,moveDistance:0,movementIndicator:null,pendingMovementIndicators:[],gmPing:null,gmPingPlacement:false,terrain:{},terrainMode:false,walls:[],selectedWall:null,wallPlacement:false,wallDraft:null,movingWall:null,wallMoveStart:null,wallMoveUndoSnapshot:null,mapImage:null,mapWidth:24,mapHeight:24,mapOpacity:.78,mapLocked:true,movingMap:null,mapMoveStart:null,mapMoveUndoSnapshot:null,gridColor:'#8fd3ff',gridOpacity:.30,assets:[],selectedAsset:null,movingAsset:null,assetMoveOffset:{x:0,y:0},groupMoveStart:null,attachments:[],objectGroups:[],gmNotesPins:[],gmNotesPinMode:false,openGmNotePinId:null,pendingAssetImage:null,pendingPlacement:null,tokens:[{id:'ranger',name:'Ranger',x:-4,y:1,z:60,glyph:'R',size:1,color:'#65d6a1',footprint:1,assignment:'all',players:[]},{id:'balaur',name:'Balaur Soldier',x:3,y:0,z:30,glyph:'B',size:1,color:'#e06b6b',footprint:1,assignment:'gm',players:[]},{id:'enemy',name:'Aerial Enemy',x:1,y:-3,z:90,glyph:'E',size:1,color:'#e3b65b',footprint:1,assignment:'unassigned',players:[]}]};
function resize(){if(!ctx)return;const d=Math.min(devicePixelRatio||1,2),r=canvas.getBoundingClientRect(),w=Math.max(1,r.width),h=Math.max(1,r.height);canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);ctx.setTransform(d,0,0,d,0,0)}
addEventListener('resize',resize);resize();
function size(){const r=canvas.getBoundingClientRect();return{w:Math.max(1,r.width),h:Math.max(1,r.height)}}
function tokenWorld(t){const f=Math.max(1,t.footprint||1),bx=t._dragX??t.x,by=t._dragY??t.y;return{x:bx+(f-1)/2,y:by+(f-1)/2}}
function objectKey(type,id){return type+':'+id}
function objectFromKey(key){if(!key)return null;const i=key.indexOf(':'),type=key.slice(0,i),id=key.slice(i+1);return type==='token'?state.tokens.find(o=>o.id===id):type==='asset'?state.assets.find(o=>o.id===id):null}
function updateObjectLockButton(type,obj){const button=document.querySelector('[data-action="'+(type==='token'?'token-lock':'asset-lock')+'"]');if(button){button.textContent=obj?.locked?'Unlock '+(type==='token'?'Token':'Asset'):'Lock '+(type==='token'?'Token':'Asset');button.disabled=!isGM()||!obj;button.hidden=!obj}}
function toggleObjectLock(type,id){if(!isGM())return;const obj=objectFromKey(objectKey(type,id));if(!obj)return;recordUndo();obj.locked=!obj.locked;if(obj.locked){if(type==='token'&&state.movingToken===obj){delete obj._dragX;delete obj._dragY;state.movingToken=null}if(type==='asset'&&state.movingAsset===obj)state.movingAsset=null}if(type==='token'){list();select(obj.id)}else{updateObjectLockButton('asset',obj);syncAssetEditor(obj);render()}saveSceneToBrowser();if(sceneSaveStatus)sceneSaveStatus.textContent=(obj.locked?'Locked ':'Unlocked ')+(obj.name||'object')+(obj.locked?' against movement and all editing.':'.')}
function objectLabel(key){const o=objectFromKey(key);return o?(o.name|| (key.startsWith('token:')?'Token':'Asset'))+' ['+(key.startsWith('token:')?'Token':'Asset')+']':key}
function attachmentGroup(startKey){const seen=new Set([startKey]),queue=[startKey];while(queue.length){const k=queue.shift();for(const edge of state.attachments||[]){const next=edge.a===k?edge.b:edge.b===k?edge.a:null;if(next&&!seen.has(next)&&objectFromKey(next)){seen.add(next);queue.push(next)}}}return [...seen].map(key=>({key,obj:objectFromKey(key)})).filter(x=>x.obj)}
function captureGroupPositions(type,id){const keys=new Set([objectKey(type,id),...selectedObjectKeys()]);for(const key of [...keys])for(const member of attachmentGroup(key))keys.add(member.key);return [...keys].map(key=>({key,obj:objectFromKey(key)})).filter(({obj})=>obj).map(({key,obj})=>({key,x:Number(obj._dragX??obj.x)||0,y:Number(obj._dragY??obj.y)||0,z:Number(obj.z)||0}))}
function refreshAttachmentControls(){const a=document.getElementById('attachment-object-a'),b=document.getElementById('attachment-object-b'),listEl=document.getElementById('attachment-list');if(!a||!b)return;const oldA=a.value,oldB=b.value,items=[...state.tokens.map(t=>({key:objectKey('token',t.id),label:'Token: '+t.name})),...state.assets.map(x=>({key:objectKey('asset',x.id),label:'Asset: '+x.name}))];for(const sel of [a,b]){sel.innerHTML='';const first=document.createElement('option');first.value='';first.textContent='Choose an object';sel.appendChild(first);items.forEach(item=>{const o=document.createElement('option');o.value=item.key;o.textContent=item.label;sel.appendChild(o)})}if(items.some(x=>x.key===oldA))a.value=oldA;if(items.some(x=>x.key===oldB))b.value=oldB;if(listEl){listEl.textContent=state.attachments.length?state.attachments.map(e=>objectLabel(e.a)+' ↔ '+objectLabel(e.b)).join(' · '):'No attached objects.'}}
function applyGroupPositionDelta(startPositions,dx,dy){for(const p of startPositions){const obj=objectFromKey(p.key);if(!obj||obj.locked)continue;if(p.key.startsWith('token:')){obj._dragX=p.x+dx;obj._dragY=p.y+dy}else{obj.x=p.x+dx;obj.y=p.y+dy}}}
function changeRequestedGroupAltitude(type,id,nextZ){const anchor=objectFromKey(objectKey(type,id));if(!anchor||anchor.locked)return{ok:false,message:'The requested object is unavailable or locked.'};const group=attachmentGroup(objectKey(type,id)).filter(x=>x.obj).map(x=>({key:x.key,obj:x.obj,z:Number(x.obj.z)||0}));const old=Number(anchor.z)||0,dz=Number(nextZ)-old;if(!Number.isFinite(dz))return{ok:false,message:'The requested altitude is invalid.'};if(group.some(p=>!p.obj.locked&&(p.z+dz<0||p.z+dz>MAX_ALTITUDE)))return{ok:false,message:'The requested altitude cannot be applied because an attached object would exceed the altitude limit. Adjust the attached group and try again.'};return{ok:true,apply:()=>{group.forEach(p=>{if(!p.obj.locked)p.obj.z=p.z+dz});return Math.abs((Number(anchor.z)||0)-Number(nextZ))<=.001}}}
function changeGroupAltitude(type,id,nextZ){const anchor=objectFromKey(objectKey(type,id));if(!anchor||anchor.locked)return;const group=captureGroupPositions(type,id),old=Number(anchor.z)||0;let dz=Number(nextZ)-old;const minDz=Math.max(...group.map(p=>-p.z)),maxDz=Math.min(...group.map(p=>MAX_ALTITUDE-p.z));dz=Math.max(minDz,Math.min(maxDz,dz));group.forEach(p=>{const obj=objectFromKey(p.key);if(obj&&!obj.locked)obj.z=Math.max(0,Math.min(MAX_ALTITUDE,p.z+dz))})}
let pendingAttachmentAction=null;
function positionContextSubmenu(row){
 const panel=row?.querySelector('.context-submenu-panel');if(!panel)return;
 if(window.matchMedia?.('(hover:none),(pointer:coarse)').matches){panel.style.position='';panel.style.left='';panel.style.right='';panel.style.top='';return}
 panel.style.position='fixed';panel.style.right='auto';panel.style.left='0px';panel.style.top='0px';
 const anchor=row.querySelector('.context-submenu-trigger')?.getBoundingClientRect();if(!anchor)return;
 const margin=8,vv=window.visualViewport,vw=vv?.width||window.innerWidth,vh=vv?.height||window.innerHeight,ox=vv?.offsetLeft||0,oy=vv?.offsetTop||0;
 const width=Math.min(258,Math.max(180,vw-margin*2));panel.style.width=width+'px';panel.style.maxHeight=Math.max(120,Math.min(vh-margin*2,520))+'px';
 const measured=panel.getBoundingClientRect(),height=Math.min(measured.height,vh-margin*2),rightSpace=ox+vw-anchor.right,leftSpace=anchor.left-ox;
 const x=(rightSpace>=width+margin||rightSpace>=leftSpace)?anchor.right-2:anchor.left-width+2;
 const y=Math.max(oy+margin,Math.min(oy+vh-height-margin,anchor.top-5));
 panel.style.left=Math.max(ox+margin,Math.min(ox+vw-width-margin,x))+'px';panel.style.top=y+'px';
}
function hideObjectContextMenu(){const menu=document.getElementById('object-context-menu');if(menu){menu.hidden=true;menu.querySelectorAll('.context-submenu-panel').forEach(panel=>{panel.style.left='';panel.style.top='';panel.style.right='';panel.style.position=''})}}
function setAttachmentMode(action,key){pendingAttachmentAction={action,key};hideObjectContextMenu();const obj=objectFromKey(key);if(sceneSaveStatus)sceneSaveStatus.textContent=(action==='attach'?'Attach '+(obj?.name||'object')+': click another object.':'Detach '+(obj?.name||'object')+': click an object directly attached to it.')+' Press Escape to cancel.'}
function applyPendingAttachment(targetKey){const pending=pendingAttachmentAction;if(!pending)return true;pendingAttachmentAction=null;if(targetKey===pending.key){if(sceneSaveStatus)sceneSaveStatus.textContent='Choose a different object.';return true}const exists=objectFromKey(targetKey),source=objectFromKey(pending.key);if(!exists||!source)return true;const same=e=>(e.a===pending.key&&e.b===targetKey)||(e.a===targetKey&&e.b===pending.key);if(pending.action==='attach'){if(state.attachments.some(same)){if(sceneSaveStatus)sceneSaveStatus.textContent='Those objects are already attached.';return true}recordUndo();state.attachments.push({a:pending.key,b:targetKey});if(sceneSaveStatus)sceneSaveStatus.textContent='Attached '+objectLabel(pending.key)+' to '+objectLabel(targetKey)+'.'}else{if(!state.attachments.some(same)){if(sceneSaveStatus)sceneSaveStatus.textContent='Those objects are not directly attached.';return true}recordUndo();state.attachments=state.attachments.filter(e=>!same(e));if(sceneSaveStatus)sceneSaveStatus.textContent='Detached '+objectLabel(pending.key)+' from '+objectLabel(targetKey)+'.'}saveSceneToBrowser();return true}
function refreshTokenClassResourceControls(token,menu){
 const wrap=menu.querySelector('[data-token-resource-submenu]'),body=menu.querySelector('[data-token-resource-fields]');
 if(!wrap||!body)return;
 const cls=CLASS_RESOURCE_DEFS[token.className]?token.className:'';
 wrap.hidden=!cls;
 body.replaceChildren();
 if(!cls){body.textContent='No class assigned.';return}
 if(cls==='Assassin'){
  const targets=runeMarksForAssassin(token.id),summary=document.createElement('strong');
  summary.textContent='Targets Marked: '+targets.length+' / 3';body.appendChild(summary);
  const toggle=document.createElement('button');toggle.type='button';toggle.className='rune-mark-toggle';
  toggle.textContent=runeMarkModeAssassinId===token.id?'Cancel Mark Target':'＋ Mark Target';
  toggle.disabled=!isGM()||!!token.locked;toggle.setAttribute('aria-pressed',String(runeMarkModeAssassinId===token.id));
  toggle.addEventListener('click',()=>{if(!isGM()||token.locked)return;runeMarkModeAssassinId=runeMarkModeAssassinId===token.id?null:token.id;refreshTokenMenu(token);updateClassResourcePanel(token);if(sceneSaveStatus)sceneSaveStatus.textContent=runeMarkModeAssassinId?'Mark Target mode: click an enemy token. Press Escape to cancel.':'Mark Target mode cancelled.'});
  body.appendChild(toggle);
  const note=document.createElement('small');note.textContent='Mark up to 3 targets, with up to 3 marks on each. Click a target on the map while Mark Target mode is active.';body.appendChild(note);
  return;
 }
 const values=normalizeClassResource(cls,token.classResource);
 CLASS_RESOURCE_DEFS[cls].forEach(resource=>{
  const value=values[resource],row=document.createElement('div');row.className='class-resource-row';
  const title=document.createElement('strong');title.textContent=resource;
  const numbers=document.createElement('div');numbers.className='class-resource-values';
  const current=document.createElement('input');current.type='number';current.min='0';current.max='9999';current.step='1';current.value=String(value.current);current.disabled=!isGM()||!!token.locked;current.dataset.tokenResourceInput='current';current.dataset.tokenResourceName=resource;current.setAttribute('aria-label',resource+' current');
  const slash=document.createElement('span');slash.textContent='/';
  const maximum=document.createElement('input');maximum.type='number';maximum.min='0';maximum.max='9999';maximum.step='1';maximum.value=String(value.maximum);maximum.disabled=!isGM()||!!token.locked;maximum.dataset.tokenResourceInput='maximum';maximum.dataset.tokenResourceName=resource;maximum.setAttribute('aria-label',resource+' maximum');
  numbers.append(current,slash,maximum);row.append(title,numbers);body.appendChild(row);
 });
 if(!isGM()){const note=document.createElement('small');note.textContent='View only · The GM manages resource values.';body.appendChild(note)}
}
function setupObjectContextMenu(){
 const menu=document.getElementById('object-context-menu');if(!menu)return;
 const tokenTools=menu.querySelector('[data-token-tools]');
 const resourceMenu=menu.querySelector('[data-token-resource-submenu]');
 const refreshTokenMenu=t=>{
  if(!tokenTools)return;tokenTools.hidden=!t;if(resourceMenu&&!t)resourceMenu.hidden=true;if(!t)return;
  const nameInput=menu.querySelector('[data-token-name]'),borderColor=menu.querySelector('[data-token-border-color]');if(nameInput){nameInput.value=t.name||'';nameInput.disabled=!isGM()||!!t.locked}if(borderColor){borderColor.value=/^#[0-9a-f]{6}$/i.test(t.borderColor||'')?t.borderColor:'#0b1320';borderColor.disabled=!isGM()||!!t.locked}
  const value=menu.querySelector('[data-token-size]');if(value)value.value=String(Math.max(1,Math.min(8,Number(t.footprint)||1)));
  menu.querySelectorAll('[data-token-slot]').forEach(button=>{const slot=Number(button.dataset.tokenSlot),saved=!!t.imageSlots?.[slot];button.disabled=!saved||!!t.locked;button.textContent='Use Image '+(slot+1)+(saved?'':' · Empty')});
  const swap=menu.querySelector('[data-token-action="swap-image"]');if(swap)swap.disabled=!!t.locked;
  const altitude=menu.querySelector('[data-token-altitude-slider]');if(altitude){altitude.value=String(Math.max(0,Math.min(MAX_ALTITUDE,Number(t.z)||0)));altitude.disabled=!!t.locked}
  if(value)value.disabled=!!t.locked;
  const readout=menu.querySelector('[data-token-altitude]');if(readout)readout.textContent=(Number(t.z)||0)+' ft';
  const classSelect=menu.querySelector('[data-token-class]'),accessSelect=menu.querySelector('[data-token-assignment]'),playersInput=menu.querySelector('[data-token-players]'),playersWrap=menu.querySelector('[data-token-players-wrap]');
  if(classSelect){classSelect.value=CLASS_RESOURCE_DEFS[t.className]?t.className:'';classSelect.disabled=!isGM()||!!t.locked}
  refreshTokenClassResourceControls(t,menu);
  if(accessSelect){accessSelect.value=t.visibility==='gm'||t.assignment==='gm'?'gm':['specific','all','unassigned'].includes(t.assignment)?t.assignment:'all';accessSelect.disabled=!isGM()||!!t.locked}
  if(playersInput)playersInput.value=(t.players||[]).join(', ');
  if(playersWrap)playersWrap.hidden=accessSelect?.value!=='specific';
  if(playersInput)playersInput.disabled=!isGM()||!!t.locked;
  const playerInfo=t.playerInfo||{name:true};menu.querySelectorAll('[data-player-info]').forEach(input=>{input.checked=input.dataset.playerInfo==='name'?playerInfo.name!==false:!!playerInfo[input.dataset.playerInfo];input.disabled=!isGM()||!!t.locked});
  const statusFields={hpCurrent:menu.querySelector('[data-token-hp-current]'),hpMaximum:menu.querySelector('[data-token-hp-maximum]'),tempHp:menu.querySelector('[data-token-temp-hp]'),ac:menu.querySelector('[data-token-ac]')};
  const statusData=t.status&&typeof t.status==='object'?t.status:{};
  if(statusFields.hpCurrent){statusFields.hpCurrent.value=String(Math.max(0,Number(statusData.hpCurrent)||0));statusFields.hpCurrent.disabled=!isGM()||!!t.locked}
  if(statusFields.hpMaximum){statusFields.hpMaximum.value=String(Math.max(0,Number(statusData.hpMaximum)||0));statusFields.hpMaximum.disabled=!isGM()||!!t.locked}
  if(statusFields.tempHp){statusFields.tempHp.value=String(Math.max(0,Number(statusData.tempHp)||0));statusFields.tempHp.disabled=!isGM()||!!t.locked}
  if(statusFields.ac){statusFields.ac.value=String(Math.max(0,Number.isFinite(Number(statusData.ac))?Number(statusData.ac):10));statusFields.ac.disabled=!isGM()||!!t.locked}
  const lifeStatus=menu.querySelector('[data-token-life-status]');if(lifeStatus){lifeStatus.value=['Alive','Unconscious','Dead'].includes(statusData.lifeStatus)?statusData.lifeStatus:'Alive';lifeStatus.disabled=!isGM()||!!t.locked}
  const conditionSelect=menu.querySelector('[data-token-condition-select]'),conditionList=menu.querySelector('[data-token-condition-list]'),conditionApply=menu.querySelector('[data-token-condition-apply]');
  const active=normalizeTokenConditions(t.conditions);
  if(conditionSelect){const selected=conditionSelect.value;[...conditionSelect.options].forEach(option=>{if(option.value)option.disabled=active.some(c=>c.name===option.value)});if(selected&&active.some(c=>c.name===selected))conditionSelect.value='';}
  if(conditionApply)conditionApply.disabled=!isGM()||!conditionSelect?.value||!!t.locked;
  if(conditionList){conditionList.replaceChildren();if(!active.length){const empty=document.createElement('small');empty.textContent='No active Conditions.';conditionList.appendChild(empty)}else active.forEach(condition=>{const row=document.createElement('div');row.className='context-condition-row';const label=document.createElement('span');label.textContent=condition.name+' · '+(condition.durationType==='until-removed'?'Until removed':condition.remaining+' '+(condition.durationType==='turn'?'turn(s)':'round(s)'));const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.title='Remove '+condition.name;remove.dataset.tokenConditionRemove=condition.name;remove.disabled=!!t.locked;row.append(label,remove);conditionList.appendChild(row)})}
 };
 menu.querySelector('[data-token-name-apply]')?.addEventListener('click',()=>{
  const t=objectFromKey(menu.dataset.objectKey),input=menu.querySelector('[data-token-name]');if(!t||!menu.dataset.objectKey?.startsWith('token:')||!isGM()||t.locked||!input)return;
  const name=input.value.trim().slice(0,120);if(!name){if(sceneSaveStatus)sceneSaveStatus.textContent='Token name cannot be empty.';return}
  if(name===(t.name||''))return;recordUndo();t.name=name;list();select(t.id);saveSceneToBrowser();if(sceneSaveStatus)sceneSaveStatus.textContent='Renamed token to '+name+'.';
 });
 menu.querySelector('[data-token-border-color]')?.addEventListener('change',e=>{
  const t=objectFromKey(menu.dataset.objectKey);if(!t||!menu.dataset.objectKey?.startsWith('token:')||!isGM()||t.locked)return;
  const color=e.target.value;if(!/^#[0-9a-f]{6}$/i.test(color)||color===(t.borderColor||'#0b1320'))return;
  recordUndo();t.borderColor=color;saveSceneToBrowser();render();
 });
 menu.querySelector('[data-token-name]')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();menu.querySelector('[data-token-name-apply]')?.click()}});
 menu.addEventListener('pointerover',e=>{const row=e.target.closest('.context-submenu');if(!row||e.pointerType==='touch')return;menu.querySelectorAll('.context-submenu.is-open').forEach(el=>{if(el!==row&&!el.contains(row)&&!row.contains(el))el.classList.remove('is-open')});row.classList.add('is-open');positionContextSubmenu(row)});
 menu.addEventListener('pointerleave',()=>menu.querySelectorAll('.context-submenu.is-open').forEach(el=>el.classList.remove('is-open')));
 menu.addEventListener('change',e=>{
  const input=e.target.closest('[data-token-resource-input]');if(!input)return;
  const key=menu.dataset.objectKey,t=objectFromKey(key);if(!t||!key.startsWith('token:')||!isGM()||t.locked)return;
  const resource=input.dataset.tokenResourceName,kind=input.dataset.tokenResourceInput;
  if(!(CLASS_RESOURCE_DEFS[t.className]||[]).includes(resource))return;
  const row=input.closest('.class-resource-row'),current=row?.querySelector('[data-token-resource-input="current"]'),maximum=row?.querySelector('[data-token-resource-input="maximum"]');
  if(!current||!maximum)return;
  saveClassResourceValue(t,resource,current,maximum);
 });
 menu.addEventListener('change',e=>{
  const infoInput=e.target.closest('[data-player-info]');if(infoInput){const key=menu.dataset.objectKey,t=objectFromKey(key);if(!t||!key.startsWith('token:')||!isGM()||t.locked)return;const field=infoInput.dataset.playerInfo;t.playerInfo={name:true,hp:false,ac:false,conditions:false,classResource:false,altitude:false,...(t.playerInfo||{}),[field]:infoInput.checked};recordUndo();saveSceneToBrowser();if(sceneSaveStatus)sceneSaveStatus.textContent='Player Screen information settings updated for '+(t.name||'token')+'.';return}
  if(!e.target.matches('[data-token-hp-current],[data-token-hp-maximum],[data-token-temp-hp],[data-token-ac],[data-token-life-status]'))return;
  const key=menu.dataset.objectKey,t=objectFromKey(key);if(!t||!key.startsWith('token:')||!isGM()||t.locked)return;
  const read=(selector,fallback,max)=>{const el=menu.querySelector(selector),n=Math.floor(Number(el?.value));const value=Number.isFinite(n)?Math.max(0,Math.min(max,n)):fallback;if(el)el.value=String(value);return value};
  const next={hpCurrent:read('[data-token-hp-current]',0,9999),hpMaximum:read('[data-token-hp-maximum]',0,9999),tempHp:read('[data-token-temp-hp]',0,9999),ac:read('[data-token-ac]',10,999),lifeStatus:menu.querySelector('[data-token-life-status]')?.value||'Alive'};
  if(!['Alive','Unconscious','Dead'].includes(next.lifeStatus))next.lifeStatus='Alive';
  const prev=t.status&&typeof t.status==='object'?t.status:{hpCurrent:0,hpMaximum:0,tempHp:0,ac:10,lifeStatus:'Alive'};
  if(Object.keys(next).every(k=>String(prev[k]??(k==='ac'?10:k==='lifeStatus'?'Alive':0))===String(next[k])))return;
  recordUndo();t.status=next;saveSceneToBrowser();updateSelectionInfo();if(sceneSaveStatus)sceneSaveStatus.textContent='Status updated for '+(t.name||'token')+'.';
 });
 menu.addEventListener('click',e=>{
  const trigger=e.target.closest('[data-submenu-trigger]');
  if(trigger){const row=trigger.closest('.context-submenu');if(row){const open=row.classList.contains('is-open');Array.from(row.parentElement?.children||[]).filter(el=>el.classList?.contains('context-submenu')).forEach(el=>el.classList.remove('is-open'));if(!open){row.classList.add('is-open');positionContextSubmenu(row)}}return}

  const conditionApply=e.target.closest('[data-token-condition-apply]'),conditionRemove=e.target.closest('[data-token-condition-remove]');
  if(conditionApply||conditionRemove){
   const key=menu.dataset.objectKey,t=objectFromKey(key);if(!t||!key.startsWith('token:')||!isGM()||t.locked)return;
   const current=normalizeTokenConditions(t.conditions);
   if(conditionApply){
    const selectEl=menu.querySelector('[data-token-condition-select]'),typeEl=menu.querySelector('[data-token-condition-duration]'),countEl=menu.querySelector('[data-token-condition-count]'),name=selectEl?.value,type=typeEl?.value||'until-removed';
    if(!APPROVED_CONDITIONS.includes(name)||current.some(c=>c.name===name))return;
    const remaining=type==='until-removed'?null:Math.max(1,Math.min(99,Math.floor(Number(countEl?.value)||1)));
    recordUndo();t.conditions=[...current,{name,durationType:['turn','round'].includes(type)?type:'until-removed',remaining}];
    if(selectEl)selectEl.value='';
    if(sceneSaveStatus)sceneSaveStatus.textContent=name+' applied to '+(t.name||'token')+'.';
   }else{
    const name=conditionRemove.dataset.tokenConditionRemove;if(!current.some(c=>c.name===name))return;
    recordUndo();t.conditions=current.filter(c=>c.name!==name);
    if(sceneSaveStatus)sceneSaveStatus.textContent=name+' removed from '+(t.name||'token')+'.';
   }
   saveSceneToBrowser();updateConditionsPanel(t);refreshTokenMenu(t);return;
  }
  const bulkVisibilityButton=e.target.closest('[data-bulk-visibility]');
  if(bulkVisibilityButton){if(!isGM())return;const mode=bulkVisibilityButton.dataset.bulkVisibility;const keys=JSON.parse(menu.dataset.bulkObjectKeys||'[]');hideObjectContextMenu();state.selectedTokenIds=keys.filter(key=>key.startsWith('token:')).map(key=>key.slice(6));state.selectedAssetIds=keys.filter(key=>key.startsWith('asset:')).map(key=>key.slice(6));setSelectedObjectsVisibility(mode);return}
  const tokenButton=e.target.closest('[data-token-action],[data-token-slot]');
  if(tokenButton){
   const key=menu.dataset.objectKey,t=objectFromKey(key);if(!t||!key.startsWith('token:'))return;
   const action=tokenButton.dataset.tokenAction;
   if(tokenButton.dataset.tokenSlot!==undefined){const slot=tokenButton.dataset.tokenSlot;hideObjectContextMenu();document.querySelector('[data-image-slot-action="token-use"][data-image-slot="'+slot+'"]')?.click();return}
   if(action==='swap-image'){hideObjectContextMenu();tokenImageFileEl?.click();return}

  }
  const button=e.target.closest('button[data-object-action]');if(!button)return;
  const key=menu.dataset.objectKey,action=button.dataset.objectAction,obj=objectFromKey(key);hideObjectContextMenu();if(!obj)return;
  if(action==='rename'){
   if(!isGM()||obj.locked){if(sceneSaveStatus)sceneSaveStatus.textContent='Unlock this object before renaming it.';return}
   const next=prompt('Enter a name for this '+(key.startsWith('token:')?'token':'prop / asset')+':',obj.name||'');if(next===null)return;
   const name=next.trim().slice(0,120);if(!name){if(sceneSaveStatus)sceneSaveStatus.textContent='Name cannot be empty.';return}
   recordUndo();obj.name=name;if(key.startsWith('token:')){list();select(obj.id)}else{syncAssetEditor(obj);refreshAttachmentControls()}
   saveSceneToBrowser();if(sceneSaveStatus)sceneSaveStatus.textContent='Renamed object to '+name+'.';
  }else if(action==='attach'||action==='detach')setAttachmentMode(action,key);
 });
 const conditionSelect=menu.querySelector('[data-token-condition-select]'),conditionApply=menu.querySelector('[data-token-condition-apply]');
  conditionSelect?.addEventListener('change',()=>{if(conditionApply)conditionApply.disabled=!isGM()||!conditionSelect.value||!!objectFromKey(menu.dataset.objectKey)?.locked;});
  const conditionDuration=menu.querySelector('[data-token-condition-duration]'),conditionCountWrap=menu.querySelector('[data-token-condition-count-wrap]');
  conditionDuration?.addEventListener('change',()=>{if(conditionCountWrap)conditionCountWrap.hidden=conditionDuration.value==='until-removed';});
  const altitudeSlider=menu.querySelector('[data-token-altitude-slider]');
 altitudeSlider?.addEventListener('input',e=>{
  const key=menu.dataset.objectKey,t=objectFromKey(key);if(!t||!key.startsWith('token:')||!canControlToken(t)||t.locked)return;
  const next=Math.max(0,Math.min(MAX_ALTITUDE,Math.round(Number(e.target.value)/ALTITUDE_STEP)*ALTITUDE_STEP));
  if(next===(Number(t.z)||0))return;
  if(!isGM()&&isPlayerSession()){if(!pendingMoveProposal)showMovementProposal({requestId:'move-'+Date.now()+'-'+Math.random().toString(36).slice(2),objectType:'token',objectId:t.id,tokenId:t.id,base:{x:t.x,y:t.y,z:Number(t.z)||0},proposed:{x:t.x,y:t.y,z:next}});else if(pendingMoveProposal.objectId===t.id&&!pendingMoveProposal.submitted){pendingMoveProposal.proposed.z=next;movementRequestStatus('Change proposed · X '+pendingMoveProposal.proposed.x+', Y '+pendingMoveProposal.proposed.y+', Z '+next+' ft. Submit for GM approval or cancel.')}else return;const readout=menu.querySelector('[data-token-altitude]');if(readout)readout.textContent=next+' ft';return}
  if(!altitudeSlider.dataset.undoRecorded){recordUndo();altitudeSlider.dataset.undoRecorded='1'}
  changeGroupAltitude('token',t.id,next);list();select(t.id);saveSceneToBrowser();broadcastPlayerScene();
  const readout=menu.querySelector('[data-token-altitude]');if(readout)readout.textContent=t.z+' ft';
 });
 altitudeSlider?.addEventListener('change',()=>{delete altitudeSlider.dataset.undoRecorded});
 menu.querySelector('[data-token-size]')?.addEventListener('change',e=>{
  const key=menu.dataset.objectKey,t=objectFromKey(key);if(!t||!key.startsWith('token:')||!isGM()||t.locked)return;
  const next=Math.max(1,Math.min(8,Number(e.target.value)||1));if(next===(Number(t.footprint)||1))return;
  recordUndo();t.footprint=next;list();select(t.id);saveSceneToBrowser();if(sceneSaveStatus)sceneSaveStatus.textContent=t.name+' size changed to '+next+'×'+next+' squares.';
 });
 menu.querySelector('[data-token-class]')?.addEventListener('change',e=>{
  const key=menu.dataset.objectKey,t=objectFromKey(key);if(!t||!key.startsWith('token:')||!isGM()||t.locked)return;
  const next=CLASS_RESOURCE_DEFS[e.target.value]?e.target.value:'';
  if((t.className||'')===next)return;
  recordUndo();const wasAssassin=t.className==='Assassin';t.className=next;t.classResource=normalizeClassResource(next,t.classResource);
  if(wasAssassin&&next!=='Assassin'){state.tokens.forEach(target=>{target.runeMarks=normalizeRuneMarks(target.runeMarks).filter(mark=>mark.assassinId!==t.id)});if(runeMarkModeAssassinId===t.id)runeMarkModeAssassinId=null}
  list();select(t.id);saveSceneToBrowser();refreshTokenMenu(t);if(sceneSaveStatus)sceneSaveStatus.textContent=(next||'No class')+' assigned to '+(t.name||'token')+'.';
 });
 menu.querySelector('[data-token-assignment]')?.addEventListener('change',e=>{
  const key=menu.dataset.objectKey,t=objectFromKey(key);if(!t||!key.startsWith('token:')||!isGM()||t.locked)return;
  const next=['gm','all','unassigned','specific'].includes(e.target.value)?e.target.value:'all';
  const playersWrap=menu.querySelector('[data-token-players-wrap]');if(playersWrap)playersWrap.hidden=next!=='specific';
  if(t.assignment===next&&(next!=='gm'||t.visibility==='gm'))return;
  recordUndo();t.assignment=next;t.visibility=next==='gm'?'gm':'players';
  list();select(t.id);saveSceneToBrowser();refreshTokenMenu(t);
  if(sceneSaveStatus)sceneSaveStatus.textContent='Token access set to '+assignmentLabel(t)+'.';
 });
 menu.querySelector('[data-token-players]')?.addEventListener('change',e=>{
  const key=menu.dataset.objectKey,t=objectFromKey(key);if(!t||!key.startsWith('token:')||!isGM()||t.locked||t.assignment!=='specific')return;
  const players=[...new Set(e.target.value.split(',').map(name=>name.trim()).filter(Boolean))].slice(0,50);
  if(JSON.stringify(players)===JSON.stringify(t.players||[]))return;
  recordUndo();t.players=players;list();select(t.id);saveSceneToBrowser();refreshTokenMenu(t);
  if(sceneSaveStatus)sceneSaveStatus.textContent=players.length?'Specific access assigned to: '+players.join(', ')+'.':'Specific access selected; no player names assigned yet.';
 });
 document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target))hideObjectContextMenu()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(runeMarkModeAssassinId){const source=state.tokens.find(t=>t.id===runeMarkModeAssassinId);runeMarkModeAssassinId=null;if(source)updateClassResourcePanel(source)}pendingAttachmentAction=null;hideObjectContextMenu();if(sceneSaveStatus)sceneSaveStatus.textContent='Object action cancelled.'}});
 canvas.addEventListener('contextmenu',e=>{
  e.preventDefault();
  const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,t=hit(x,y),a=t?null:hitAsset(x,y),obj=t||a;const playerAltitudeOnly=!isGM()&&isPlayerSession()&&!!t&&canControlToken(t);if(!isGM()&&!playerAltitudeOnly)return;if(!obj)return;
  const key=objectKey(t?'token':'asset',obj.id),selectionBefore=selectedObjectKeys(),preserveSelection=selectionBefore.length>1&&selectionBefore.includes(key);
  if(!preserveSelection){if(t)select(t.id);else{state.selected=null;state.selectedTokenIds=[];state.selectedAsset=obj.id;state.selectedAssetIds=[obj.id];updateClassResourcePanel(null);syncAssetEditor(obj)}}
  const bulkKeys=preserveSelection?selectionBefore:[key];menu.dataset.objectKey=key;menu.dataset.bulkObjectKeys=JSON.stringify(bulkKeys);
  const bulkPanel=menu.querySelector('[data-bulk-visibility-panel]');if(bulkPanel)bulkPanel.hidden=!isGM()||bulkKeys.length<1;
  if(t){refreshTokenMenu(t)}else{if(tokenTools)tokenTools.hidden=true;refreshTokenMenu(null)}menu.classList.toggle('player-altitude-only',playerAltitudeOnly);
  const attached=state.attachments.filter(edge=>edge.a===key||edge.b===key).length;
  menu.querySelector('[data-object-action="detach"]')?.toggleAttribute('disabled',!attached);
  menu.hidden=false;menu.style.maxHeight=Math.max(120,window.innerHeight-16)+'px';menu.style.overflowY='auto';menu.style.left=Math.max(8,Math.min(window.innerWidth-menu.offsetWidth-8,e.clientX))+'px';
  menu.style.top=Math.max(8,Math.min(window.innerHeight-menu.offsetHeight-8,e.clientY))+'px';
 });
}

function basis(){const c=state.camera,cp=Math.cos(c.elevation),sp=Math.sin(c.elevation),sy=Math.sin(c.yaw),cy=Math.cos(c.yaw);const f={x:sy*cp,y:cy*cp,z:-sp},r={x:cy,y:-sy,z:0},u={x:r.y*f.z,y:-r.x*f.z,z:r.x*f.y-r.y*f.x},pos={x:c.targetX-f.x*c.distance,y:c.targetY-f.y*c.distance,z:c.targetZ/5-f.z*c.distance};return{pos,f,r,u}}
function project(x,y,z){const{w,h}=size();if(state.view2d)return{x:w/2+x*CELL_PX*state.camera.zoom+state.camera.panX,y:h/2-y*CELL_PX*state.camera.zoom+state.camera.panY,depth:1,scale:state.camera.zoom};const b=basis(),q={x:x-b.pos.x,y:y-b.pos.y,z:z/5-b.pos.z},cx=q.x*b.r.x+q.y*b.r.y+q.z*b.r.z,cy=q.x*b.u.x+q.y*b.u.y+q.z*b.u.z,depth=q.x*b.f.x+q.y*b.f.y+q.z*b.f.z,focal=Math.min(w,h)*.86*state.camera.zoom,s=focal/Math.max(NEAR,depth);return{x:w/2+cx*s,y:h*.56-cy*s,depth,scale:s/CELL_PX}}
function terrainHeightAt(x,y){const gx=snapCell(x),gy=snapCell(y),tile=state.terrain[gx+','+gy];if(!tile)return 0;const high=Math.max(0,Number(tile.height)||0);if(tile.type!=='ramp')return high;const low=Math.max(0,Math.min(high,Number(tile.startHeight)||0)),fx=x-gx,fy=y-gy;switch(tile.direction||'north'){case'east':return low+(high-low)*(fx+.5);case'west':return low+(high-low)*(.5-fx);case'south':return low+(high-low)*(.5-fy);default:return low+(high-low)*(fy+.5)}}
function footprintTerrainBase(x,y,width,depth,rotation=0){
 const w=Math.max(1,Number(width)||1),d=Math.max(1,Number(depth)||1),cx=x+(w-1)/2,cy=y+(d-1)/2,angle=Number(rotation)||0,cos=Math.cos(angle),sin=Math.sin(angle);
 const centerHeight=terrainHeightAt(cx,cy);
 const samplesPerCell=8,totalX=Math.ceil(w*samplesPerCell),totalY=Math.ceil(d*samplesPerCell),total=totalX*totalY;
 let overlapsRaisedTerrain=false,maxHeight=centerHeight;
 for(let j=0;j<totalY;j++)for(let i=0;i<totalX;i++){
  const lx=((i+.5)/totalX-.5)*w,ly=(.5-(j+.5)/totalY)*d;
  const wx=cx+lx*cos-ly*sin,wy=cy+lx*sin+ly*cos,gx=snapCell(wx),gy=snapCell(wy),tile=state.terrain[gx+','+gy];
  if(tile)overlapsRaisedTerrain=true;
  const height=terrainHeightAt(wx,wy);if(height>maxHeight)maxHeight=height;
 }
 // Any overlap with raised terrain lifts the whole footprint to its highest
 // sampled terrain elevation. This applies to every footprint size.
 return overlapsRaisedTerrain?maxHeight:centerHeight;
}
function tokenTerrainBase(t){const f=Math.max(1,Number(t.footprint)||1);return footprintTerrainBase(Number(t._dragX??t.x)||0,Number(t._dragY??t.y)||0,f,f)}
function assetTerrainBase(a){return footprintTerrainBase(Number(a.x)||0,Number(a.y)||0,Math.max(1,Number(a.width)||1),Math.max(1,Number(a.depth)||1),(Number(a.rotation)||0)*Math.PI/180)}
function tokenProject(t){const p=tokenWorld(t),terrainZ=tokenTerrainBase(t),altitude=Math.max(0,Math.min(MAX_ALTITUDE,Number(t.z)||0));return project(p.x,p.y,terrainZ+altitude)}
function groundProject(t){const p=tokenWorld(t);return project(p.x,p.y,tokenTerrainBase(t))}
function tokenRadius(t){const f=Math.max(1,t.footprint||1),p=groundProject(t);if(state.view2d)return Math.max(4,CELL_PX*state.camera.zoom*f*.5);if(!Number.isFinite(p.scale)||p.scale<=0)return 8;return Math.max(5,p.scale*CELL_PX*f*.5)}
function tokenHeightRadius(t){const p=groundProject(t),scale=state.view2d?CELL_PX*state.camera.zoom:Math.max(4,(Number(p.scale)||1)*CELL_PX),legacyHeight=Math.max(1,Number(t.footprint)||1)*CELL_PX;return Math.max(8,(Math.max(16,Math.min(2000,Number(t.heightPx)||legacyHeight))/CELL_PX)*scale*.5)}
const line=(a,b)=>{ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y)};
function gridPointValid(p){return Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.depth)&&p.depth>NEAR&&Math.abs(p.x)<1e5&&Math.abs(p.y)<1e5}
function drawGridLine(points){let drawing=false,last=null;for(const p of points){const ok=gridPointValid(p);if(ok&&!drawing){ctx.beginPath();ctx.moveTo(p.x,p.y);drawing=true;last=p}else if(ok&&drawing){if(last&&Math.abs(p.x-last.x)<Math.max(250,window.innerWidth*2)&&Math.abs(p.y-last.y)<Math.max(250,window.innerHeight*2)){ctx.lineTo(p.x,p.y);last=p}else{ctx.stroke();ctx.beginPath();ctx.moveTo(p.x,p.y);last=p}}else if(drawing){ctx.stroke();drawing=false;last=null}}if(drawing)ctx.stroke()}
function gridBoundary(min,max){const world=[[min,min],[max,min],[max,max],[min,max]];if(state.view2d)return world.map(([x,y])=>project(x,y,0));const{w,h}=size(),b=basis(),focal=Math.min(w,h)*.86*state.camera.zoom;const camera=world.map(([x,y])=>{const q={x:x-b.pos.x,y:y-b.pos.y,z:-b.pos.z};return{cx:q.x*b.r.x+q.y*b.r.y+q.z*b.r.z,cy:q.x*b.u.x+q.y*b.u.y+q.z*b.u.z,depth:q.x*b.f.x+q.y*b.f.y+q.z*b.f.z}});const clipped=[];for(let i=0;i<camera.length;i++){const a=camera[i],b2=camera[(i+1)%camera.length],ain=a.depth>NEAR,bin=b2.depth>NEAR;if(ain)clipped.push(a);if(ain!==bin){const t=(NEAR+.001-a.depth)/(b2.depth-a.depth);clipped.push({cx:a.cx+(b2.cx-a.cx)*t,cy:a.cy+(b2.cy-a.cy)*t,depth:NEAR+.001})}}return clipped.map(p=>({x:w/2+p.cx*focal/p.depth,y:h*.56-p.cy*focal/p.depth,depth:p.depth,scale:focal/(p.depth*CELL_PX)}))}
const mapImageCache=new Map();
let mapRenderLayer=null,mapRenderCtx=null;
function getMapImage(src){if(!src)return null;let img=mapImageCache.get(src);if(!img){img=new Image();img.src=src;mapImageCache.set(src,img)}return img}
function drawMapImage(){
 if(!state.mapImage)return;
 const img=getMapImage(state.mapImage);if(!img||!img.complete||!img.naturalWidth)return;
 const mw=Math.max(1,Math.min(500,Number(state.mapWidth)||24)),mh=Math.max(1,Math.min(500,Number(state.mapHeight)||24)),cx=Number(state.mapX)||0,cy=Number(state.mapY)||0;
 const sw=img.naturalWidth,sh=img.naturalHeight,cropX=0,cropY=0,cropW=sw,cropH=sh,alpha=Math.max(.05,Math.min(1,Number(state.mapOpacity)||.78));
 // Subdivide the map into small projected quads. This approximates perspective
 // projection much more closely than stretching the whole image across two
 // large affine triangles, which can look like it wobbles while orbiting.
 // A moderate mesh keeps the image aligned to the ground-plane grid
 // without creating tens of thousands of triangles for large maps.
 // Reuse the offscreen canvas rather than allocating one on every animation frame.
 const divisionsX=state.view2d?1:Math.min(64,Math.max(32,Math.ceil(mw/8)));
 const divisionsY=state.view2d?1:Math.min(64,Math.max(32,Math.ceil(mh/8)));
 const projected=[],{w,h}=size(),pixelRatio=canvas.width/w;
 if(!mapRenderLayer||mapRenderLayer.width!==canvas.width||mapRenderLayer.height!==canvas.height){
  mapRenderLayer=document.createElement('canvas');mapRenderLayer.width=canvas.width;mapRenderLayer.height=canvas.height;
  mapRenderCtx=mapRenderLayer.getContext('2d');
 }
 const layer=mapRenderLayer,mapCtx=mapRenderCtx;
 mapCtx.setTransform(1,0,0,1,0,0);mapCtx.clearRect(0,0,layer.width,layer.height);
 mapCtx.setTransform(pixelRatio,0,0,pixelRatio,0,0);
 for(let j=0;j<=divisionsY;j++){
  projected[j]=[];
  for(let i=0;i<=divisionsX;i++){
   const wx=cx-mw/2+mw*i/divisionsX,wy=cy+mh/2-mh*j/divisionsY;
   projected[j][i]=project(wx,wy,0);
  }
 }
 const triangle=(src,dst)=>{
  const [s0,s1,s2]=src,[d0,d1,d2]=dst,den=s0.x*(s1.y-s2.y)+s1.x*(s2.y-s0.y)+s2.x*(s0.y-s1.y);
  if(Math.abs(den)<.0001)return;
  const a=(d0.x*(s1.y-s2.y)+d1.x*(s2.y-s0.y)+d2.x*(s0.y-s1.y))/den;
  const c=(d0.x*(s2.x-s1.x)+d1.x*(s0.x-s2.x)+d2.x*(s1.x-s0.x))/den;
  const e=(d0.x*(s1.x*s2.y-s2.x*s1.y)+d1.x*(s2.x*s0.y-s0.x*s2.y)+d2.x*(s0.x*s1.y-s1.x*s0.y))/den;
  const b=(d0.y*(s1.y-s2.y)+d1.y*(s2.y-s0.y)+d2.y*(s0.y-s1.y))/den;
  const d=(d0.y*(s2.x-s1.x)+d1.y*(s0.x-s2.x)+d2.y*(s1.x-s0.x))/den;
  const f=(d0.y*(s1.x*s2.y-s2.x*s1.y)+d1.y*(s2.x*s0.y-s0.x*s2.y)+d2.y*(s0.x*s1.y-s1.x*s0.y))/den;
  const center={x:(d0.x+d1.x+d2.x)/3,y:(d0.y+d1.y+d2.y)/3};
  const expanded=[d0,d1,d2].map(p=>{const dx=p.x-center.x,dy=p.y-center.y,len=Math.max(.001,Math.hypot(dx,dy));return{x:p.x+dx/len*.8,y:p.y+dy/len*.8}});
  mapCtx.save();mapCtx.beginPath();mapCtx.moveTo(expanded[0].x,expanded[0].y);mapCtx.lineTo(expanded[1].x,expanded[1].y);mapCtx.lineTo(expanded[2].x,expanded[2].y);mapCtx.closePath();mapCtx.clip();mapCtx.transform(a,b,c,d,e,f);mapCtx.drawImage(img,0,0,sw,sh);mapCtx.restore();
 };
 for(let j=0;j<divisionsY;j++)for(let i=0;i<divisionsX;i++){
  const x0=cropX+cropW*i/divisionsX,x1=cropX+cropW*(i+1)/divisionsX,y0=cropY+cropH*j/divisionsY,y1=cropY+cropH*(j+1)/divisionsY;
  const s00={x:x0,y:y0},s10={x:x1,y:y0},s11={x:x1,y:y1},s01={x:x0,y:y1};
  const p00=projected[j][i],p10=projected[j][i+1],p11=projected[j+1][i+1],p01=projected[j+1][i];
  if([p00,p10,p11,p01].some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.depth<=NEAR))continue;
  triangle([s00,s10,s11],[p00,p10,p11]);triangle([s00,s11,s01],[p00,p11,p01]);
 }
 ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(layer,0,0,w,h);ctx.restore();
}
function grid(){const{w,h}=size(),min=-GRID_RADIUS-.5,max=GRID_RADIUS+.5,boundary=gridBoundary(min,max),gridColor=/^#[0-9a-f]{6}$/i.test(state.gridColor||'')?state.gridColor:'#8fd3ff',gridOpacity=Math.max(0,Math.min(1,Number(state.gridOpacity??.30)));const rgba=(color,alpha)=>{const value=parseInt(color.slice(1),16);return'rgba('+(value>>16)+','+((value>>8)&255)+','+(value&255)+','+alpha+')'};if(boundary.length<3||boundary.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return;const pathBoundary=()=>{ctx.beginPath();ctx.moveTo(boundary[0].x,boundary[0].y);for(let i=1;i<boundary.length;i++)ctx.lineTo(boundary[i].x,boundary[i].y);ctx.closePath()};ctx.save();pathBoundary();ctx.fillStyle='#172230';ctx.fill();ctx.clip();drawMapImage();ctx.strokeStyle=rgba(gridColor,gridOpacity);ctx.lineWidth=1;for(let i=-GRID_RADIUS;i<=GRID_RADIUS+1;i++){const a=[],b=[],fixed=i-.5;for(let s=0;s<=82;s++){const q=min+(max-min)*s/82;a.push(project(fixed,q,0));b.push(project(q,fixed,0))}drawGridLine(a);drawGridLine(b)}ctx.restore();ctx.save();pathBoundary();ctx.strokeStyle=rgba(gridColor,Math.min(1,gridOpacity*1.4));ctx.lineWidth=1.5;ctx.stroke();ctx.restore()}
function drawTerrainTriangle(tri){const pts=tri.points;if(!pts||pts.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return;ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);pts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.closePath();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.fillStyle=tri.color;ctx.fill()}
function drawTerrainLabel(item){ctx.save();ctx.font='700 10px system-ui';ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(item.label,item.x,item.y);ctx.restore()}
function drawTerrain(){
 const palette={ground:'#58734d',hill:'#79965a',mountain:'#8b929c',cliff:'#77717a',canopy:'#286b45',platform:'#9a7955',ramp:'#b58b58'};
 const sideColors=['#303943','#39434d','#424d58','#353e48'];
 const tiles=Object.entries(state.terrain).map(([key,t])=>{const xy=key.split(',').map(Number);const height=Math.max(0,Math.min(120,Number(t.height)||0));return{x:xy[0],y:xy[1],type:t.type||'hill',height,startHeight:Math.max(0,Math.min(height,Number(t.startHeight)||0)),direction:['north','south','east','west'].includes(t.direction)?t.direction:'north'};});
 const tileMap=new Map(tiles.map(t=>[t.x+','+t.y,t]));
 const corners=t=>[[t.x-.5,t.y-.5],[t.x+.5,t.y-.5],[t.x+.5,t.y+.5],[t.x-.5,t.y+.5]];
 const cornerHeights=t=>{if(t.type!=='ramp')return[t.height,t.height,t.height,t.height];const lo=Math.max(0,Math.min(t.height,Number(t.startHeight)||0)),hi=t.height;return({north:[lo,lo,hi,hi],south:[hi,hi,lo,lo],east:[lo,hi,hi,lo],west:[hi,lo,lo,hi]}[t.direction])};
 const poly=(pts,color,outline=true)=>{if(pts.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return;ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);pts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.closePath();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.fillStyle=color;ctx.fill();if(outline){ctx.strokeStyle='#17212a';ctx.lineWidth=1;ctx.stroke()}};
 const surfaces=[];
 for(const t of tiles){
  const c=corners(t),hs=cornerHeights(t),topWorld=c.map((p,i)=>({x:p[0],y:p[1],z:hs[i]}));
  // Every raised tile has four opaque sides. Adjacent terrain only reduces the
  // wall to the actual exposed height difference; no transparent canvas fills.
  if(!state.view2d&&t.height>0){
   const neighbors=[[t.x,t.y-1],[t.x+1,t.y],[t.x,t.y+1],[t.x-1,t.y]];
   const cameraBasis=basis(),cameraX=-cameraBasis.f.x,cameraY=-cameraBasis.f.y;
   for(let i=0;i<4;i++){
    const j=(i+1)%4,edgeX=c[j][0]-c[i][0],edgeY=c[j][1]-c[i][1],outwardX=edgeY,outwardY=-edgeX;
    // Only draw terrain walls facing the camera. Back-facing walls are hidden
    // by the solid terrain volume and can otherwise incorrectly cover top faces
    // when perspective-projected face depths overlap.
    if(outwardX*cameraX+outwardY*cameraY<=.0001)continue;
    const n=tileMap.get(neighbors[i][0]+','+neighbors[i][1]);let lowA=0,lowB=0;
    if(n){const nh=cornerHeights(n),nc=corners(n),findHeight=pt=>{for(let k=0;k<4;k++)if(Math.abs(nc[k][0]-pt[0])<.001&&Math.abs(nc[k][1]-pt[1])<.001)return nh[k];return n.height};const neighborA=findHeight(c[i]),neighborB=findHeight(c[j]);
     // Resolve the shared edge as one height profile. Where this tile is lower
     // than its neighbor, it contributes no wall; where it is higher, its wall
     // ends exactly at the neighbor's corresponding corner heights.
     if(hs[i]<=neighborA+.001&&hs[j]<=neighborB+.001)continue;
     lowA=Math.min(hs[i],neighborA);lowB=Math.min(hs[j],neighborB);
    }
    if(Math.abs(hs[i]-lowA)<.001&&Math.abs(hs[j]-lowB)<.001)continue;
    // Build the exposed wall from the shared edge's exact corner heights.
    // Clip each endpoint independently so sloped ramp joins produce a tapered
    // wall instead of a full-height rectangular slab or a gap at one corner.
    const world=[{x:c[i][0],y:c[i][1],z:hs[i]},{x:c[j][0],y:c[j][1],z:hs[j]},{x:c[j][0],y:c[j][1],z:lowB},{x:c[i][0],y:c[i][1],z:lowA}];
    if(world.every((p,k)=>k<2||Math.abs(p.z-world[k===2?1:0].z)<.001))continue;
    const pts=world.map(p=>project(p.x,p.y,p.z));
    const depths=world.map(p=>project(p.x,p.y,p.z).depth),depth=depths.reduce((sum,d)=>sum+d,0)/depths.length;
    // Shade taller exposed drops more deeply so stepped cliffs and ramp joins
    // remain legible without drawing diagonal outlines across triangulated faces.
    const exposedHeight=(Math.max(0,hs[i]-lowA)+Math.max(0,hs[j]-lowB))/2;
    const wallColor=exposedHeight>=40?'#252e38':exposedHeight>=20?sideColors[i]:exposedHeight>=10?'#46525e':'#53606b';
    surfaces.push({kind:'wall',points:pts,vertexDepths:depths,color:wallColor,depth,faceDepthMin:Math.min(...depths)});
   }
  }
  const worldTop=topWorld,pts=worldTop.map(p=>project(p.x,p.y,p.z)),depth=worldTop.reduce((sum,p)=>sum+project(p.x,p.y,p.z).depth,0)/worldTop.length;
  surfaces.push({kind:'top',tile:t,points:pts,vertexDepths:worldTop.map(p=>project(p.x,p.y,p.z).depth),color:palette[t.type]||palette.hill,depth});
 }
 // Use average camera-space depth of each actual face; farther terrain is drawn
 // first and nearer opaque walls naturally cover whatever lies behind them.
 const triangles=[];
 for(const f of surfaces){for(const ids of [[0,1,2],[0,2,3]])triangles.push({points:ids.map(i=>f.points[i]),depths:ids.map(i=>f.vertexDepths?.[i]||f.depth||Infinity),color:f.color,kind:f.kind,tile:f.tile,depth:ids.reduce((sum,i)=>sum+(f.vertexDepths?.[i]||f.depth||0),0)/3})}
 triangles.sort((a,b)=>(b.depth||0)-(a.depth||0));
 // Return terrain faces so they can be depth-sorted together with walls, props and tokens.
 // Terrain labels are also returned as depth events, preserving their occlusion behavior.
 const labelEvents=[];for(const f of surfaces){if(f.kind!=='top')continue;const t=f.tile,c=project(t.x,t.y,t.type==='ramp'?((Math.max(0,Math.min(t.height,Number(t.startHeight)||0))+t.height)/2):t.height),cellPixels=(c.scale||0)*CELL_PX;if(cellPixels<38||c.depth<=NEAR||c.x<-100||c.x>size().w+100||c.y<-100||c.y>size().h+100)continue;labelEvents.push({tile:t,c,label:t.type==='ramp'?'Ramp '+t.direction+' '+t.height+'ft':t.type+' '+t.height+'ft'})}
 const pointInTriangle=(p,a,b,c)=>{const den=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(den)<1e-8)return false;const u=((b.y-c.y)*(p.x-c.x)+(c.x-b.x)*(p.y-c.y))/den,v=((c.y-a.y)*(p.x-c.x)+(a.x-c.x)*(p.y-c.y))/den,w=1-u-v;return u>=-1e-5&&v>=-1e-5&&w>=-1e-5};
 const labels=[];for(const {tile,c,label} of labelEvents){ctx.save();ctx.font='700 10px system-ui';const textWidth=ctx.measureText(label).width,textHeight=12;const samples=[];for(let sx=-textWidth/2;sx<=textWidth/2;sx+=Math.max(2,Math.min(5,textWidth/8)))for(let sy=-textHeight/2;sy<=textHeight/2;sy+=3)samples.push({x:c.x+sx,y:c.y+sy});samples.push({x:c.x+textWidth/2,y:c.y},{x:c.x-textWidth/2,y:c.y});let hidden=false;for(const tri of triangles){if(tri.tile===tile||tri.depth>=c.depth-.75)continue;if(samples.some(p=>pointInTriangle(p,tri.points[0],tri.points[1],tri.points[2]))){hidden=true;break}}if(!hidden)labels.push({x:c.x,y:c.y,label,depth:c.depth});ctx.restore()}
 return{triangles,labels};
}

function wallPoints(w){
 const z1=terrainHeightAt(w.x1,w.y1)+(Number(w.altitude)||0),z2=terrainHeightAt(w.x2,w.y2)+(Number(w.altitude)||0),h=Math.max(5,Number(w.height)||10);
 return{a:project(w.x1,w.y1,z1),b:project(w.x2,w.y2,z2),at:project(w.x1,w.y1,z1+h),bt:project(w.x2,w.y2,z2+h)};
}
function drawWallPoly(points,color,selected,stroke=true){
 if(points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.depth<=NEAR))return;
 ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);ctx.closePath();
 ctx.fillStyle=color;ctx.fill();if(stroke){ctx.strokeStyle=selected?'#ffe08a':'#202b37';ctx.lineWidth=selected?2.5:1.2;ctx.stroke();}
}
function wallDepth(w){
 const x=(w.x1+w.x2)/2,y=(w.y1+w.y2)/2,z=terrainHeightAt(x,y)+(Number(w.altitude)||0)+Math.max(5,Number(w.height)||10)/2;
 return project(x,y,z).depth;
}
function drawWall(w){
 const dx=w.x2-w.x1,dy=w.y2-w.y1,len=Math.hypot(dx,dy);if(len<.02)return;
 const half=Math.max(1,Number(w.thickness)||1)/10,nx=-dy/len*half,ny=dx/len*half;
 const z1=terrainHeightAt(w.x1,w.y1)+(Number(w.altitude)||0),z2=terrainHeightAt(w.x2,w.y2)+(Number(w.altitude)||0),h=Math.max(5,Number(w.height)||10),c=w.color||'#788695',sel=w.id===state.selectedWall;
 if(state.view2d){
  const footprint=[project(w.x1+nx,w.y1+ny,0),project(w.x2+nx,w.y2+ny,0),project(w.x2-nx,w.y2-ny,0),project(w.x1-nx,w.y1-ny,0)];
  drawWallPoly(footprint,c,sel);
 }else{
  const p1=[project(w.x1+nx,w.y1+ny,z1),project(w.x2+nx,w.y2+ny,z2),project(w.x2+nx,w.y2+ny,z2+h),project(w.x1+nx,w.y1+ny,z1+h)];
  const p2=[project(w.x2-nx,w.y2-ny,z2),project(w.x1-nx,w.y1-ny,z1),project(w.x1-nx,w.y1-ny,z1+h),project(w.x2-nx,w.y2-ny,z2+h)];
  const startCap=[p1[0],p2[1],p2[2],p1[3]],endCap=[p1[1],p2[0],p2[3],p1[2]],top=[p1[3],p1[2],p2[3],p2[2]];
  const first=!w._depthSegment||w._depthSegmentIndex===0,last=!w._depthSegment||w._depthSegmentIndex===w._depthSegmentCount-1;
  ctx.save();ctx.filter='brightness(.76)';drawWallPoly(p2,c,sel,false);ctx.restore();
  drawWallPoly(p1,c,sel,false);
  const edge=(a,b)=>{ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=sel?'#ffe08a':'#202b37';ctx.lineWidth=sel?2.5:1.2;ctx.stroke()};
  edge(p1[0],p1[1]);edge(p1[3],p1[2]);edge(p2[0],p2[1]);edge(p2[3],p2[2]);
  if(first){ctx.save();ctx.filter='brightness(.62)';drawWallPoly(startCap,c,sel);ctx.restore()}
  if(last){ctx.save();ctx.filter='brightness(.82)';drawWallPoly(endCap,c,sel);ctx.restore()}
  ctx.save();ctx.filter='brightness(1.18)';drawWallPoly(top,c,sel,false);ctx.restore();
 }
 if(sel&&isGM()&&!w.locked&&!w._depthSegment){const q=wallPoints(w);for(const p of [q.a,q.b]){ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fillStyle='#ffe08a';ctx.fill();ctx.strokeStyle='#202b37';ctx.stroke()}}
}
function drawWallDraft(){
 if(!state.wallDraft)return;
 const a=project(state.wallDraft.x1,state.wallDraft.y1,0),b=project(state.wallDraft.x2,state.wallDraft.y2,0);
 ctx.save();ctx.setLineDash([7,5]);ctx.strokeStyle='#ffe08a';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.restore();
}
function pointInWallPoly(x,y,points){
 if(!points||points.length<3||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return false;
 let inside=false;
 for(let i=0,j=points.length-1;i<points.length;j=i++){
  const xi=points[i].x,yi=points[i].y,xj=points[j].x,yj=points[j].y;
  const crosses=((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi);
  if(crosses)inside=!inside;
 }
 return inside;
}
function distanceToWallSegment(px,py,a,b){
 const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;
 if(l2<.001)return Math.hypot(px-a.x,py-a.y);
 const t=Math.max(0,Math.min(1,((px-a.x)*dx+(py-a.y)*dy)/l2));
 return Math.hypot(px-(a.x+t*dx),py-(a.y+t*dy));
}
function hitWall(x,y){
 let found=null,bestDepth=Infinity;
 for(const w of state.walls||[]){
  const dx=w.x2-w.x1,dy=w.y2-w.y1,len=Math.hypot(dx,dy);if(len<.02)continue;
  const half=Math.max(1,Number(w.thickness)||1)/10,nx=-dy/len*half,ny=dx/len*half;
  const z1=terrainHeightAt(w.x1,w.y1)+(Number(w.altitude)||0),z2=terrainHeightAt(w.x2,w.y2)+(Number(w.altitude)||0),h=Math.max(5,Number(w.height)||10);
  const base1=project(w.x1+nx,w.y1+ny,z1),base2=project(w.x2+nx,w.y2+ny,z2),base3=project(w.x2-nx,w.y2-ny,z2),base4=project(w.x1-nx,w.y1-ny,z1);
  let polygons=[];
  if(state.view2d){
   polygons=[[project(w.x1+nx,w.y1+ny,0),project(w.x2+nx,w.y2+ny,0),project(w.x2-nx,w.y2-ny,0),project(w.x1-nx,w.y1-ny,0)]];
  }else{
   const top1=project(w.x1+nx,w.y1+ny,z1+h),top2=project(w.x2+nx,w.y2+ny,z2+h),top3=project(w.x2-nx,w.y2-ny,z2+h),top4=project(w.x1-nx,w.y1-ny,z1+h);
   polygons=[[base1,base2,top2,top1],[base3,base4,top4,top3],[base1,base4,top4,top1],[base2,base3,top3,top2],[top1,top2,top3,top4]];
  }
  const hit=polygons.some(poly=>pointInWallPoly(x,y,poly))||polygons.some(poly=>poly.some((p,i)=>distanceToWallSegment(x,y,p,poly[(i+1)%poly.length])<9));
  if(hit){const depth=wallDepth(w);if(depth<bestDepth){bestDepth=depth;found=w}}
 }
 return found;
}
function syncWallEditor(w){
 const el=id=>document.getElementById(id),lock=el('wall-lock'),update=el('wall-update'),del=el('wall-delete'),status=el('wall-status');
 if(!w){if(lock){lock.textContent='Lock Wall';lock.disabled=true}if(update)update.disabled=true;if(del)del.disabled=true;['wall-name','wall-placement-mode','wall-snap-mode','wall-altitude','wall-height','wall-thickness','wall-color'].forEach(id=>{if(el(id))el(id).disabled=!isGM()});if(status)status.textContent=state.wallPlacement?'Drag on the battlefield to draw a wall.':'Select a wall to edit it.';return}
 el('wall-name').value=w.name||'Wall';el('wall-placement-mode').value=w.placement==='free'?'free':'grid';el('wall-snap-mode').value=w.snapMode==='corner'?'corner':'center';el('wall-altitude').value=String(w.altitude||0);el('wall-height').value=String(w.height||10);el('wall-thickness').value=String(w.thickness||1);el('wall-color').value=w.color||'#788695';
 ['wall-name','wall-placement-mode','wall-snap-mode','wall-altitude','wall-height','wall-thickness','wall-color'].forEach(id=>{el(id).disabled=!!w.locked||!isGM()});
 lock.textContent=w.locked?'Unlock Wall':'Lock Wall';lock.disabled=!isGM();update.disabled=!isGM()||!!w.locked;del.disabled=!isGM();
 status.textContent=(w.name||'Wall')+(w.locked?' · LOCKED. Unlock before editing.':' selected. Drag an endpoint to reshape it or the wall body to move it.');
}
function wallSettings(){const el=id=>document.getElementById(id);return{placement:el('wall-placement-mode').value==='free'?'free':'grid',snapMode:['corner','line'].includes(el('wall-snap-mode').value)?el('wall-snap-mode').value:'center',name:(el('wall-name').value||'Wall').trim().slice(0,80)||'Wall',altitude:Math.max(0,Math.min(120,Math.round((Number(el('wall-altitude').value)||0)/5)*5)),height:Math.max(5,Math.min(120,Math.round((Number(el('wall-height').value)||10)/5)*5)),thickness:Math.max(1,Math.min(30,Number(el('wall-thickness').value)||1)),color:el('wall-color').value}}
function finishWallPlacement(){
 const d=state.wallDraft;if(!d)return;state.wallDraft=null;const v=wallSettings(),p1=v.placement==='grid'?snapWallPoint(d.x1,d.y1,v.snapMode):{x:Math.round(d.x1*100)/100,y:Math.round(d.y1*100)/100},p2=v.placement==='grid'?snapWallPoint(d.x2,d.y2,v.snapMode):{x:Math.round(d.x2*100)/100,y:Math.round(d.y2*100)/100},x1=p1.x,y1=p1.y,x2=p2.x,y2=p2.y;
 if(Math.hypot(x2-x1,y2-y1)<.15){document.getElementById('wall-status').textContent='Wall placement cancelled: draw a longer segment.';return}
 const w={id:'wall-'+Date.now(),name:v.name,x1,y1,x2,y2,altitude:v.altitude,height:v.height,thickness:v.thickness,color:v.color,placement:v.placement,snapMode:v.snapMode,locked:false};
 recordUndo();state.walls.push(w);state.selectedWall=w.id;state.selected=null;state.selectedAsset=null;syncWallEditor(w);saveSceneToBrowser();
}
function updateWallFromEditor(){const w=state.walls.find(v=>v.id===state.selectedWall);if(!w||w.locked||!isGM())return;const v=wallSettings();recordUndo();Object.assign(w,{name:v.name,placement:v.placement,snapMode:v.snapMode,altitude:v.altitude,height:v.height,thickness:v.thickness,color:v.color});syncWallEditor(w);saveSceneToBrowser()}

function drawGroundFootprint(x,y,width,depth,rotation,selected,fillStyle){
 const angle=Number(rotation)||0,cos=Math.cos(angle),sin=Math.sin(angle);
 const local=[[-width/2,-depth/2],[width/2,-depth/2],[width/2,depth/2],[-width/2,depth/2]];
 const baseZ=footprintTerrainBase(x-(width-1)/2,y-(depth-1)/2,width,depth,angle);const points=local.map(([lx,ly])=>{const wx=x+lx*cos-ly*sin,wy=y+lx*sin+ly*cos;return project(wx,wy,baseZ)});
 if(points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.depth<=NEAR))return;
 ctx.save();ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);ctx.closePath();
 ctx.fillStyle=fillStyle||'rgba(3,7,13,.82)';ctx.strokeStyle=selected?'rgba(255,255,255,.95)':'rgba(143,211,255,.78)';ctx.lineWidth=selected?2.5:1.5;ctx.fill();ctx.stroke();ctx.restore();
}
function drawAllGroundFootprints(){
  if(state.view2d)return;
  state.assets.filter(canSeeAsset).forEach(a=>{
   const width=Math.max(1,Number(a.width)||1),depth=Math.max(1,Number(a.depth)||1),centerX=a.x+(width-1)/2,centerY=a.y+(depth-1)/2;
   drawGroundFootprint(centerX,centerY,width,depth,(Number(a.rotation)||0)*Math.PI/180,(state.selectedAssetIds||[]).includes(a.id)||a.id===state.selectedAsset,'rgba(3,7,13,.35)');
  });
  visibleTokens().forEach(t=>{
   const world=tokenWorld(t),f=Math.max(1,Number(t.footprint)||1),selected=t.id===state.selected||(state.selectedTokenIds||[]).includes(t.id);
   drawGroundFootprint(world.x,world.y,f,f,0,selected,'rgba(3,7,13,.35)');
  });
 }
function ground(t){
 if(state.view2d)return;
 const world=tokenWorld(t),g=project(world.x,world.y,tokenTerrainBase(t)),p=tokenProject(t);
 if(g.depth<=NEAR||p.depth<=NEAR)return;
 const f=Math.max(1,Number(t.footprint)||1),alt=Math.max(0,Number(t.z)||0),selected=t.id===state.selected||(state.selectedTokenIds||[]).includes(t.id);
 
 if(alt>0){ctx.save();ctx.strokeStyle=selected?'rgba(255,255,255,.9)':'rgba(143,211,255,.7)';ctx.setLineDash([5,5]);ctx.beginPath();line(g,p);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#e6f0fa';ctx.font='700 9px system-ui';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillText(`${alt} ft`,g.x,g.y-8);ctx.restore()}
}
function drawAsset(a){
 const width=Math.max(1,Number(a.width)||1),depth=Math.max(1,Number(a.depth)||1),centerX=a.x+(width-1)/2,centerY=a.y+(depth-1)/2,centerTerrainZ=terrainHeightAt(centerX,centerY),terrainZ=assetTerrainBase(a),terrainLift=terrainZ-centerTerrainZ,altitude=Math.max(0,Math.min(MAX_ALTITUDE,Number(a.z)||0));
 const groundPoint=project(centerX,centerY,terrainZ),elevatedPoint=project(centerX,centerY,terrainZ+altitude);
 const standee=state.view2d||a.displayStyle!=='flat',p=standee?elevatedPoint:groundPoint;
 if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.depth<=NEAR||groundPoint.depth<=NEAR)return;
 const img=getAssetImage(a.image);if(!img||!img.complete||!img.naturalWidth)return;
 const scale=state.view2d?CELL_PX*state.camera.zoom:Math.max(4,groundPoint.scale*CELL_PX),rotation=(Number(a.rotation)||0)*Math.PI/180;
 const pixelMode=a.sizeMode==='pixel',worldPixelScale=scale/CELL_PX,w=pixelMode?Math.max(16,Math.min(1200,Number(a.imageWidthPx)||180))*worldPixelScale:width*scale,h=(Number.isFinite(Number(a.heightPx))&&Number(a.heightPx)>0?Math.max(16,Math.min(2000,Number(a.heightPx))):(pixelMode?Math.max(16,Math.min(1200,Number(a.imageHeightPx)||180)):depth*CELL_PX))*worldPixelScale;
 const standW=Math.max(width*scale,w)+20,standH=Math.max(depth*scale,h)+16;
 if(standee){
  // Draw a visible stand base on the battlefield surface, then anchor the upright
  // image by its bottom edge so it rises from the base instead of extending below it.
  if(!state.view2d)
  if(altitude>0){
   ctx.save();ctx.strokeStyle=a.id===state.selectedAsset?'rgba(255,224,138,.98)':'rgba(143,211,255,.95)';ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(groundPoint.x,groundPoint.y);ctx.lineTo(elevatedPoint.x,elevatedPoint.y);ctx.stroke();ctx.setLineDash([]);
   ctx.fillStyle='#e6f0fa';ctx.font='700 10px system-ui';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillText(altitude+' ft',groundPoint.x,groundPoint.y-7);ctx.restore();
  }
  const imageZoom=Math.max(1,Math.min(10,Number(a.imageZoom)||1)),imageX=Math.max(-.8,Math.min(.8,Number(a.imageX)||0)),imageY=Math.max(-.8,Math.min(.8,Number(a.imageY)||0)),drawW=w*imageZoom,drawH=h*imageZoom,imageBottom=p.y,imageCenterY=(state.view2d?p.y:imageBottom-drawH/2)+imageY*h*imageZoom;
  ctx.save();ctx.translate(p.x+imageX*w*imageZoom,imageCenterY);ctx.rotate(rotation);ctx.drawImage(img,-drawW/2,-drawH/2,drawW,drawH);ctx.restore();
  // Standee artwork is visual only for pointer selection. Its ground footprint
  // is the sole clickable area, allowing clicks through transparent artwork.
  const footprintCorners=[[-width/2,-depth/2],[width/2,-depth/2],[width/2,depth/2],[-width/2,depth/2]];
  const hitPolygon=footprintCorners.map(([lx,ly])=>{
   const wx=centerX+lx*Math.cos(rotation)-ly*Math.sin(rotation),wy=centerY+lx*Math.sin(rotation)+ly*Math.cos(rotation);
   return project(wx,wy,terrainZ);
  }).filter(q=>Number.isFinite(q.x)&&Number.isFinite(q.y)&&q.depth>NEAR).map(q=>({x:q.x,y:q.y}));
  a._screen={x:p.x+imageX*w*imageZoom,y:imageCenterY,width:drawW,height:drawH,hitPolygon,standeeHit:true,rotation:Number(a.rotation)||0};
  return;
 }
 // Flat assets are textures laid onto the world ground plane, like the battle map,
 // rather than camera-facing billboards. Subdivide the texture to follow perspective.
 const imageZoom=Math.max(1,Math.min(10,Number(a.imageZoom)||1)),imageX=Math.max(-.8,Math.min(.8,Number(a.imageX)||0)),imageY=Math.max(-.8,Math.min(.8,Number(a.imageY)||0)),cos=Math.cos(rotation),sin=Math.sin(rotation),divisions=state.view2d?1:6,sw=img.naturalWidth,sh=img.naturalHeight,cropW=sw/imageZoom,cropH=sh/imageZoom,cropX=sw/2-cropW/2-imageX*sw,cropY=sh/2-cropH/2-imageY*sh,projected=[];
 for(let j=0;j<=divisions;j++){
  projected[j]=[];
  for(let i=0;i<=divisions;i++){
   const lx=(i/divisions-.5)*width,ly=(.5-j/divisions)*depth;
   const wx=centerX+lx*cos-ly*sin,wy=centerY+lx*sin+ly*cos,wz=terrainHeightAt(wx,wy)+terrainLift;
   projected[j][i]=project(wx,wy,wz);
  }
 }
 const triangle=(src,dst)=>{
  const [s0,s1,s2]=src,[d0,d1,d2]=dst,den=s0.x*(s1.y-s2.y)+s1.x*(s2.y-s0.y)+s2.x*(s0.y-s1.y);
  if(Math.abs(den)<.0001)return;
  const aa=(d0.x*(s1.y-s2.y)+d1.x*(s2.y-s0.y)+d2.x*(s0.y-s1.y))/den;
  const cc=(d0.x*(s2.x-s1.x)+d1.x*(s0.x-s2.x)+d2.x*(s1.x-s0.x))/den;
  const ee=(d0.x*(s1.x*s2.y-s2.x*s1.y)+d1.x*(s2.x*s0.y-s0.x*s2.y)+d2.x*(s0.x*s1.y-s1.x*s0.y))/den;
  const bb=(d0.y*(s1.y-s2.y)+d1.y*(s2.y-s0.y)+d2.y*(s0.y-s1.y))/den;
  const dd=(d0.y*(s2.x-s1.x)+d1.y*(s0.x-s2.x)+d2.y*(s1.x-s0.x))/den;
  const ff=(d0.y*(s1.x*s2.y-s2.x*s1.y)+d1.y*(s2.x*s0.y-s0.x*s2.y)+d2.y*(s0.x*s1.y-s1.x*s0.y))/den;
  ctx.save();ctx.beginPath();ctx.moveTo(d0.x,d0.y);ctx.lineTo(d1.x,d1.y);ctx.lineTo(d2.x,d2.y);ctx.closePath();ctx.clip();ctx.transform(aa,bb,cc,dd,ee,ff);ctx.drawImage(img,0,0,sw,sh);ctx.restore();
 };
 for(let j=0;j<divisions;j++)for(let i=0;i<divisions;i++){
  const x0=sw*i/divisions,x1=sw*(i+1)/divisions,y0=sh*j/divisions,y1=sh*(j+1)/divisions;
  const s00={x:x0,y:y0},s10={x:x1,y:y0},s11={x:x1,y:y1},s01={x:x0,y:y1};
  const p00=projected[j][i],p10=projected[j][i+1],p11=projected[j+1][i+1],p01=projected[j+1][i];
  if([p00,p10,p11,p01].some(q=>!Number.isFinite(q.x)||!Number.isFinite(q.y)||q.depth<=NEAR))continue;
  triangle([s00,s10,s11],[p00,p10,p11]);triangle([s00,s11,s01],[p00,p11,p01]);
 }
 a._screen={x:groundPoint.x,y:groundPoint.y,width:width*scale,height:depth*scale,hitWidth:width*scale+12,hitHeight:depth*scale+12,rotation:Number(a.rotation)||0};
}
function getAssetImage(src){if(!src)return null;let img=assetImageCache.get(src);if(!img){img=new Image();img.onload=()=>{};img.src=src;assetImageCache.set(src,img)}return img}
function syncAssetEditor(a){
 if(!a)return;
 const mode=document.getElementById('asset-size-mode'),iw=document.getElementById('asset-image-width-px'),ih=document.getElementById('asset-image-height-px'),display=document.getElementById('asset-display-style');
 if(assetNameEl)assetNameEl.value=a.name||'Prop';
 if(mode)mode.value=a.sizeMode==='pixel'?'pixel':'grid';
 if(display)display.value=a.displayStyle==='flat'?'flat':'standee';
 if(assetVisibilityEl)assetVisibilityEl.value=a.visibility==='gm'?'gm':'players';
 if(iw)iw.value=String(Math.round(Number(a.imageWidthPx)||180));
 if(ih)ih.value=String(Math.round(Number(a.imageHeightPx)||180));const ah=document.getElementById('asset-height-px');if(ah)ah.value=String(Math.round(Number(a.heightPx)||(a.sizeMode==='pixel'?Number(a.imageHeightPx)||180:(Number(a.depth)||2)*CELL_PX)));
 if(assetWidthEl)assetWidthEl.value=String(a.width||2);
 if(assetDepthEl)assetDepthEl.value=String(a.depth||2);
 if(assetRotationEl)assetRotationEl.value=String(Number(a.rotation)||0);
 if(assetAltitudeEl)assetAltitudeEl.value=String(Number(a.z)||0);
 updateImageFramingReadout('asset',a);updateImageFramingReadout('token',null);
 const assetReset=document.querySelector('[data-action="asset-image-reset"]');if(assetReset)assetReset.disabled=!a.image||!!a.locked||!isGM();
 if(assetStatusEl)assetStatusEl.textContent='Selected: '+(a.name||'Prop')+(a.locked?' · LOCKED. Unlock it before editing.':'. Adjust the dimensions, then click Update Asset to apply your changes.');updateObjectLockButton('asset',a);
}
function updateSelectedAssetFromEditor(){
 const a=state.assets.find(item=>item.id===state.selectedAsset);
 if(!a||!isGM()||a.locked){if(a?.locked&&assetStatusEl)assetStatusEl.textContent='This asset is locked. Unlock it before editing.';return}
 const mode=document.getElementById('asset-size-mode'),iw=document.getElementById('asset-image-width-px'),ih=document.getElementById('asset-image-height-px'),ah=document.getElementById('asset-height-px'),display=document.getElementById('asset-display-style');
 a.name=assetNameEl.value.trim()||'Prop';
 a.visibility=assetVisibilityEl?.value==='gm'?'gm':'players';
 a.sizeMode=mode?.value==='pixel'?'pixel':'grid';
 a.displayStyle=display?.value==='flat'?'flat':'standee';
 a.imageWidthPx=Math.max(16,Math.min(1200,Number(iw?.value)||180));
 a.imageHeightPx=Math.max(16,Math.min(1200,Number(ih?.value)||180));a.heightPx=Math.max(16,Math.min(2000,Number(ah?.value)||240));
 a.width=Math.max(1,Math.min(12,Number(assetWidthEl.value)||1));
 a.depth=Math.max(1,Math.min(12,Number(assetDepthEl.value)||1));
 a.rotation=Number(assetRotationEl.value)||0;
 changeGroupAltitude('asset',a.id,Math.max(0,Math.min(MAX_ALTITUDE,Number(assetAltitudeEl.value)||0)));
 if(assetStatusEl)assetStatusEl.textContent='Updated placed asset: '+a.name+'.';
 saveSceneToBrowser();
}
function hitAsset(x,y){let found=null,best=Infinity;for(const a of state.assets.filter(canSeeAsset)){const s=a._screen;if(!s)continue;let inside=false;if(s.standeeHit&&Array.isArray(s.hitPolygon)&&s.hitPolygon.length===4){let crossing=false;for(let i=0,j=s.hitPolygon.length-1;i<s.hitPolygon.length;j=i++){const pi=s.hitPolygon[i],pj=s.hitPolygon[j];if(((pi.y>y)!==(pj.y>y))&&(x<(pj.x-pi.x)*(y-pi.y)/(pj.y-pi.y)+pi.x))crossing=!crossing}inside=crossing}else{const dx=x-s.x,dy=y-s.y,ang=-(s.rotation||0)*Math.PI/180,rx=dx*Math.cos(ang)-dy*Math.sin(ang),ry=dx*Math.sin(ang)+dy*Math.cos(ang);inside=Math.abs(rx)<=(s.hitWidth||s.width)/2+8&&Math.abs(ry)<=(s.hitHeight||s.height)/2+8}if(inside){const d=Math.hypot(x-s.x,y-s.y);if(d<best){best=d;found=a}}}return found}
function drawToken(t){
 const p=tokenProject(t);if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.depth<=NEAR)return;
 const r=tokenRadius(t),hr=tokenHeightRadius(t);if(!Number.isFinite(r)||r<=0)return;
 ground(t);
 const flat=state.view2d,screenY=flat?p.y:p.y-hr,tokenSelected=(state.selectedTokenIds||[]).includes(t.id)||t.id===state.selected;
 ctx.save();ctx.translate(p.x,screenY);ctx.shadowColor='rgba(0,0,0,.7)';ctx.shadowBlur=6;
 ctx.beginPath();ctx.ellipse(0,0,r,hr,0,0,Math.PI*2);ctx.fillStyle=t.color||'#7aa7ff';ctx.fill();ctx.shadowBlur=0;
 ctx.save();ctx.beginPath();ctx.ellipse(0,0,Math.max(1,r-2),Math.max(1,hr-2),0,0,Math.PI*2);ctx.clip();
 const tokenImage=t.image?getTokenImage(t.image):null;
 if(tokenImage?.complete&&tokenImage.naturalWidth>0){
  const side=Math.max(tokenImage.naturalWidth,tokenImage.naturalHeight),zoom=Math.max(1,Math.min(10,Number(t.imageZoom)||1)),drawW=(r-2)*2*zoom,drawH=(hr-2)*2*zoom,dx=(Number(t.imageX)||0)*(r-2)*2*zoom,dy=(Number(t.imageY)||0)*(hr-2)*2*zoom;
  ctx.drawImage(tokenImage,-drawW/2+dx,-drawH/2+dy,drawW*tokenImage.naturalWidth/side,drawH*tokenImage.naturalHeight/side);
 }else{ctx.fillStyle='#08111d';ctx.font=`800 ${Math.max(12,r*.72)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t.glyph||'•',0,-2)}
 ctx.restore();
 const markSource=state.tokens.find(x=>x.id===runeMarkModeAssassinId),markEntry=normalizeRuneMarks(t.runeMarks).find(m=>m.assassinId===runeMarkModeAssassinId),markEligible=!!markSource&&t.id!==markSource.id&&(markEntry?markEntry.count<3:runeMarksForAssassin(markSource.id).length<3);
 ctx.lineWidth=markEligible?5:tokenSelected?4:2;ctx.strokeStyle=markEligible?'#ffd166':(/^#[0-9a-f]{6}$/i.test(t.borderColor||'')?t.borderColor:'#0b1320');
 ctx.beginPath();ctx.ellipse(0,0,r,hr,0,0,Math.PI*2);ctx.stroke();
 ctx.fillStyle='#fff';ctx.font=`700 ${Math.max(8,Math.min(12,r*.3))}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowColor='rgba(0,0,0,.9)';ctx.shadowBlur=3;ctx.fillText(`${t.z} ft`,0,flat?hr*.72:hr*.52);ctx.restore();
 t._screen={x:p.x,y:screenY,radius:r,halfHeight:hr,halfSize:null};
}
function getTokenImage(src){
 if(!src)return null;
 let img=tokenImageCache.get(src);
 if(img){tokenImageCache.delete(src);tokenImageCache.set(src,img);return img}
 // Keep the decoded-image cache bounded. Swapped-out images otherwise remain
 // referenced for the lifetime of the page and can accumulate substantial memory.
 while(tokenImageCache.size>=32){const oldest=tokenImageCache.keys().next().value;tokenImageCache.delete(oldest)}
 img=new Image();img.src=src;tokenImageCache.set(src,img);return img
 }

document.querySelector('[data-action="token-image-reset"]')?.addEventListener('click',()=>{const t=state.tokens.find(x=>x.id===state.selected);if(!t||!t.image||t.locked||!isGM())return;recordUndo();delete t.imageZoom;delete t.imageX;delete t.imageY;loadEditor(t);updateImageFramingReadout('token',t);render();saveSceneToBrowser()});
document.querySelector('[data-action="asset-image-reset"]')?.addEventListener('click',()=>{const a=state.assets.find(x=>x.id===state.selectedAsset);if(!a||!a.image||a.locked||!isGM())return;recordUndo();delete a.imageZoom;delete a.imageX;delete a.imageY;syncAssetEditor(a);updateImageFramingReadout('asset',a);render();saveSceneToBrowser()});



function resetCamera(){state.camera={yaw:-.65,elevation:.68,distance:60,zoom:1,targetX:0,targetY:0,targetZ:0,panX:0,panY:0};state.drag=null;state.pointers.clear();state.pinchDistance=null;state.lastPinchMid=null;state.movingToken=null;state.moveStart=null;resize()}
function drawMovementRuler(){if(!state.movingToken||!state.moveStart)return;const t=state.movingToken,f=Math.max(1,t.footprint||1),sx=state.moveStart.x,sy=state.moveStart.y,ex=snapCell(t._dragX??t.x),ey=snapCell(t._dragY??t.y);const start={...t,x:sx,y:sy},end={...t,x:ex,y:ey};const a=tokenProject(start),b=tokenProject(end);if(!Number.isFinite(a.x)||!Number.isFinite(b.x)||a.depth<=NEAR||b.depth<=NEAR)return;const squares=Math.max(Math.abs(ex-sx),Math.abs(ey-sy)),feet=squares*FEET_PER_GRID;ctx.save();ctx.strokeStyle='rgba(255,235,120,.95)';ctx.fillStyle='rgba(255,235,120,.95)';ctx.lineWidth=3;ctx.setLineDash([8,6]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);const mx=(a.x+b.x)/2,my=(a.y+b.y)/2-12;ctx.font='700 13px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';const label=`${feet} ft · ${squares} square${squares===1?'':'s'}`;const tw=ctx.measureText(label).width+16;ctx.fillStyle='rgba(5,8,15,.9)';ctx.beginPath();ctx.roundRect(mx-tw/2,my-12,tw,24,7);ctx.fill();ctx.fillStyle='#fff';ctx.fillText(label,mx,my);ctx.restore()}
function drawGmPing(){const ping=state.gmPing;if(!ping)return;const now=Date.now();if(now>=ping.expiresAt){state.gmPing=null;return}const p=project(ping.x,ping.y,terrainHeightAt(ping.x,ping.y)+.5);if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.depth<=NEAR)return;const age=Math.max(0,now-ping.startedAt),phase=(age%900)/900,radius=12+phase*30,alpha=.9*(1-phase*.65);ctx.save();ctx.translate(p.x,p.y);ctx.lineWidth=3;ctx.strokeStyle='rgba(91,218,255,'+alpha+')';ctx.fillStyle='rgba(91,218,255,'+(alpha*.18)+')';ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(0,0,10+Math.sin(age/110)*2,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.strokeStyle='rgba(225,250,255,.98)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-15,0);ctx.lineTo(-6,0);ctx.moveTo(15,0);ctx.lineTo(6,0);ctx.moveTo(0,-15);ctx.lineTo(0,-6);ctx.moveTo(0,15);ctx.lineTo(0,6);ctx.stroke();ctx.restore()}
function drawPendingMovementIndicators(){if(!isGM())return;for(const m of state.pendingMovementIndicators||[]){const a=project(m.from.x,m.from.y,terrainHeightAt(m.from.x,m.from.y)+.4),b=project(m.to.x,m.to.y,terrainHeightAt(m.to.x,m.to.y)+.4);if(!Number.isFinite(a.x)||!Number.isFinite(b.x)||a.depth<=NEAR||b.depth<=NEAR)continue;ctx.save();ctx.strokeStyle='rgba(255,190,70,.95)';ctx.fillStyle='rgba(255,190,70,.95)';ctx.lineWidth=3;ctx.setLineDash([7,5]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(b.x,b.y,7,0,Math.PI*2);ctx.fill();ctx.restore()}}
function drawMovementIndicator(){const m=state.movementIndicator;if(!m)return;const fromX=m.from.x,fromY=m.from.y,toX=m.to.x,toY=m.to.y;if(m.type!=='asset'&&!state.tokens.some(t=>t.id===m.tokenId))return;const from=project(fromX,fromY,terrainHeightAt(fromX,fromY)+.25),to=project(toX,toY,terrainHeightAt(toX,toY)+.25);if(!Number.isFinite(from.x)||!Number.isFinite(to.x)||from.depth<=NEAR||to.depth<=NEAR)return;const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy);if(length<2)return;const angle=Math.atan2(dy,dx),head=12;ctx.save();ctx.lineCap='round';ctx.strokeStyle='rgba(255,205,90,.98)';ctx.fillStyle='rgba(255,205,90,.98)';ctx.lineWidth=3;ctx.setLineDash([9,7]);ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x, to.y);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(to.x,to.y);ctx.lineTo(to.x-head*Math.cos(angle-.55),to.y-head*Math.sin(angle-.55));ctx.lineTo(to.x-head*Math.cos(angle+.55),to.y-head*Math.sin(angle+.55));ctx.closePath();ctx.fill();ctx.beginPath();ctx.arc(from.x,from.y,8,0,Math.PI*2);ctx.fillStyle='rgba(255,205,90,.22)';ctx.fill();ctx.lineWidth=3;ctx.strokeStyle='rgba(255,205,90,1)';ctx.stroke();ctx.beginPath();ctx.arc(from.x,from.y,2.5,0,Math.PI*2);ctx.fillStyle='#fff4c2';ctx.fill();ctx.restore()}
 function drawSelectionBox(){const b=state.selectionBox;if(!b)return;const x=Math.min(b.x,b.x2),y=Math.min(b.y,b.y2),w=Math.abs(b.x2-b.x),h=Math.abs(b.y2-b.y);ctx.save();ctx.fillStyle=b.type==='token'?'rgba(83,174,255,.16)':'rgba(255,194,92,.16)';ctx.strokeStyle=b.type==='token'?'rgba(105,190,255,.98)':'rgba(255,205,112,.98)';ctx.lineWidth=1.5;ctx.setLineDash([6,4]);ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);ctx.restore()}
function completeBoxSelection(){const b=state.selectionBox;if(!b)return;const x1=Math.min(b.x,b.x2),x2=Math.max(b.x,b.x2),y1=Math.min(b.y,b.y2),y2=Math.max(b.y,b.y2);if(b.type==='mixed'){const ts=visibleTokens().filter(t=>{const p=t._screen;return p&&p.x>=x1&&p.x<=x2&&p.y>=y1&&p.y<=y2}).map(t=>t.id),as=state.assets.filter(canSeeAsset).filter(o=>{const p=o._screen;if(!p)return false;const hw=(p.hitWidth||p.width||0)/2,hh=(p.hitHeight||p.height||0)/2;return p.x+hw>=x1&&p.x-hw<=x2&&p.y+hh>=y1&&p.y-hh<=y2}).map(o=>o.id);state.selectedTokenIds=ts;state.selectedAssetIds=as;state.selected=ts[0]||null;state.selectedAsset=as[0]||null;if(ts.length){select(ts[0]);state.selectedTokenIds=ts;state.selectedAssetIds=as;state.selectedAsset=as[0]||null;}else if(as.length)syncAssetEditor(state.assets.find(o=>o.id===as[0]));if(sceneSaveStatus)sceneSaveStatus.textContent=(ts.length+as.length)+' objects selected.';}else if(b.type==='token'){const ids=visibleTokens().filter(t=>{const p=t._screen;return p&&p.x>=x1&&p.x<=x2&&p.y>=y1&&p.y<=y2}).map(t=>t.id);state.selectedTokenIds=ids;state.selectedAssetIds=[];state.selectedAsset=null;state.selected=ids[0]||null;if(ids.length){select(ids[0]);state.selectedTokenIds=ids;[...tokenList.children].forEach(el=>el.classList.toggle('selected',ids.includes(el.dataset.id)))}else{state.selected=null;updateClassResourcePanel(null);selectionEl.hidden=true;selectionEl.textContent='';altitudeEl.textContent='Altitude: —';[...tokenList.children].forEach(el=>el.classList.remove('selected'))}if(sceneSaveStatus)sceneSaveStatus.textContent=ids.length+' token'+(ids.length===1?'':'s')+' selected.'}else{const ids=state.assets.filter(canSeeAsset).filter(a=>{const p=a._screen;if(!p)return false;const hw=(p.hitWidth||p.width||0)/2,hh=(p.hitHeight||p.height||0)/2;return p.x+hw>=x1&&p.x-hw<=x2&&p.y+hh>=y1&&p.y-hh<=y2}).map(a=>a.id);state.selectedAssetIds=ids;state.selectedTokenIds=[];state.selected=null;updateClassResourcePanel(null);state.selectedAsset=ids[0]||null;if(ids.length)syncAssetEditor(state.assets.find(o=>o.id===ids[0]));if(sceneSaveStatus)sceneSaveStatus.textContent=ids.length+' prop/asset'+(ids.length===1?'':'s')+' selected.'}state.selectionBox=null}
function updateSceneObjectBrowser(force=false){
 const host=document.getElementById('scene-object-list'),count=document.getElementById('scene-object-count'),search=document.getElementById('scene-object-search'),filter=document.getElementById('scene-object-filter');
 if(!host||!count)return;
 const browser=host.closest('details')||host.closest('section');if(browser)browser.hidden=playerScreenMode||!isGM();
 if(playerScreenMode||!isGM())return;
 const query=(search?.value||'').trim().toLocaleLowerCase(),kind=filter?.value||'all';
 const objects=[...state.tokens.map(o=>({type:'token',obj:o,name:o.name||'Unnamed Token',id:o.id})),...state.assets.map(o=>({type:'asset',obj:o,name:o.name||'Unnamed Asset',id:o.id}))];
 const signature=JSON.stringify({scene:objects.map(x=>[x.type,x.id,x.name,x.obj.x,x.obj.y,x.obj.z,x.obj.visibility,x.obj.assignment,x.obj.locked]),selected:state.selected,selectedAsset:state.selectedAsset,selectedTokenIds:state.selectedTokenIds,selectedAssetIds:state.selectedAssetIds,query,kind});
 if(!force&&host.dataset.signature===signature)return;host.dataset.signature=signature;
 const filtered=objects.filter(x=>(kind==='all'||x.type===kind)&&x.name.toLocaleLowerCase().includes(query));
 count.textContent=filtered.length+' of '+objects.length+' object'+(objects.length===1?'':'s');host.replaceChildren();
 if(!filtered.length){const empty=document.createElement('p');empty.className='note';empty.textContent=objects.length?'No matching objects.':'No objects in this scene.';host.append(empty);return}
 for(const group of [{type:'token',title:'Tokens'},{type:'asset',title:'Assets & Props'}]){
  const entries=filtered.filter(x=>x.type===group.type);if(!entries.length)continue;
  const heading=document.createElement('div');heading.className='scene-object-group-heading';heading.textContent=group.title+' ('+entries.length+')';host.append(heading);
  for(const entry of entries){
   const o=entry.obj,button=document.createElement('button');button.type='button';button.className='scene-object-entry';
   const selected=entry.type==='token'?((state.selectedTokenIds||[state.selected]).includes(o.id)):((state.selectedAssetIds||[]).includes(o.id)||state.selectedAsset===o.id);
   if(selected)button.classList.add('selected');
   const title=document.createElement('span');title.className='scene-object-name';title.textContent=entry.name;
   const meta=document.createElement('small'),flags=[];if(o.locked)flags.push('Locked');if(o.hidden)flags.push('Hidden');if(o.visibility==='gm'||(entry.type==='token'&&o.assignment==='gm'))flags.push('GM only');else if(entry.type==='token'&&o.assignment==='unassigned')flags.push('Unassigned');meta.textContent=flags.join(' · ')||(entry.type==='token'?'Token':'Asset');
   button.append(title,meta);button.addEventListener('click',()=>locateSceneObject(entry.type,entry.id));host.append(button);
  }
 }
}
function locateSceneObject(type,id){
 if(!isGM())return;const obj=type==='token'?state.tokens.find(x=>x.id===id):state.assets.find(x=>x.id===id);if(!obj)return;
 state.selectedWall=null;syncWallEditor(null);
 const width=Math.max(1,Number(obj.width)||1),depth=Math.max(1,Number(obj.depth)||1);
 const x=type==='token'?tokenWorld(obj).x:obj.x+(width-1)/2,y=type==='token'?tokenWorld(obj).y:obj.y+(depth-1)/2,z=Math.max(0,Number(obj.z)||0)+(type==='token'?tokenTerrainBase(obj):assetTerrainBase(obj));
 if(state.view2d){state.camera.panX=-x*CELL_PX*state.camera.zoom;state.camera.panY=y*CELL_PX*state.camera.zoom}else{state.camera.targetX=x;state.camera.targetY=y;state.camera.targetZ=z}
 if(type==='token'){select(id);list()}
 else{state.selected=null;state.selectedTokenIds=[];state.selectedAsset=id;state.selectedAssetIds=[id];updateClassResourcePanel(null);syncAssetEditor(obj);[...tokenList.children].forEach(e=>e.classList.remove('selected'))}
 updateSceneObjectBrowser(true);render();
}
document.getElementById('scene-object-search')?.addEventListener('input',()=>updateSceneObjectBrowser(true));
document.getElementById('scene-object-filter')?.addEventListener('change',()=>updateSceneObjectBrowser(true));

function render(){const{w,h}=size();if(!imageFramingActive&&!playerScreenMode&&isGM()&&playerScreenChannel){const now=performance.now();if(now-lastPlayerBroadcast>120){lastPlayerBroadcast=now;broadcastPlayerScene()}}updateSelectionInfo();updateConditionsPanel(state.tokens.find(t=>t.id===state.selected));updateSceneObjectBrowser();ctx.clearRect(0,0,w,h);ctx.fillStyle='#101927';ctx.fillRect(0,0,w,h);grid();const terrainRender=drawTerrain();if(state.view2d)terrainRender.triangles.forEach(drawTerrainTriangle);terrainRender.labels.forEach(drawTerrainLabel);state.assets.filter(canSeeAsset).filter(a=>a.displayStyle==='flat').forEach(drawAsset);if(typeof window.drawTacticalOverlays==='function')window.drawTacticalOverlays();const depthItems=[
 ...(!state.view2d?terrainRender.triangles.map(tri=>({type:'terrain',item:tri,depth:tri.depth})):[]),
 ...(!state.view2d?state.assets.filter(canSeeAsset).map(a=>{const width=Math.max(1,Number(a.width)||1),depth=Math.max(1,Number(a.depth)||1),x=a.x+(width-1)/2,y=a.y+(depth-1)/2;return{type:'footprint',item:{x,y,width,depth,rotation:(Number(a.rotation)||0)*Math.PI/180,selected:(state.selectedAssetIds||[]).includes(a.id)||a.id===state.selectedAsset},depth:project(x,y,assetTerrainBase(a)).depth}}):[]),
 ...(!state.view2d?visibleTokens().map(t=>{const world=tokenWorld(t),f=Math.max(1,Number(t.footprint)||1);return{type:'footprint',item:{x:world.x,y:world.y,width:f,depth:f,rotation:0,selected:t.id===state.selected||(state.selectedTokenIds||[]).includes(t.id)},depth:project(world.x,world.y,tokenTerrainBase(t)).depth}}):[]),
 ...(state.walls||[]).flatMap(w=>{
 if(state.view2d)return[{type:'wall',item:w,depth:wallDepth(w)}];
 const length=Math.hypot(w.x2-w.x1,w.y2-w.y1),segmentCount=Math.max(1,Math.ceil(length/Math.max(1,FEET_PER_GRID/4)));
 return Array.from({length:segmentCount},(_,i)=>{
  const overlap=Math.min(.025/Math.max(length,.001),.12/segmentCount);
  const t0=Math.max(0,i/segmentCount-overlap),t1=Math.min(1,(i+1)/segmentCount+overlap),segment={...w,
   x1:w.x1+(w.x2-w.x1)*t0,y1:w.y1+(w.y2-w.y1)*t0,
   x2:w.x1+(w.x2-w.x1)*t1,y2:w.y1+(w.y2-w.y1)*t1,
   _depthSegment:true,_depthSegmentIndex:i,_depthSegmentCount:segmentCount
  };
  return{type:'wall',item:segment,depth:wallDepth(segment)};
 });
}),
 ...state.assets.filter(canSeeAsset).filter(a=>a.displayStyle!=='flat').map(a=>{const x=a.x+(Math.max(1,Number(a.width)||1)-1)/2,y=a.y+(Math.max(1,Number(a.depth)||1)-1)/2,z=assetTerrainBase(a)+Math.max(0,Math.min(MAX_ALTITUDE,Number(a.z)||0));return{type:'asset',item:a,depth:project(x,y,z).depth}}),
 ...visibleTokens().map(t=>({type:'token',item:t,depth:tokenProject(t).depth}))
].filter(entry=>Number.isFinite(entry.depth)).sort((a,b)=>{
 // Keep the supporting terrain top face behind an object standing on that tile.
 // Triangle-centroid depth can otherwise put part of the supporting surface
 // in front of the prop, making it appear buried inside the raised terrain.
 const supportTile=entry=>{
  if(entry.type==='terrain'&&entry.item.kind==='top')return{x:entry.item.tile.x,y:entry.item.tile.y};
  if(entry.type==='footprint')return{x:snapCell(entry.item.x),y:snapCell(entry.item.y)};
  if(entry.type==='asset')return{x:snapCell(entry.item.x+(Math.max(1,Number(entry.item.width)||1)-1)/2),y:snapCell(entry.item.y+(Math.max(1,Number(entry.item.depth)||1)-1)/2)};
  if(entry.type==='token'){const p=tokenWorld(entry.item);return{x:snapCell(p.x),y:snapCell(p.y)}}
  return null;
 };
 const at=supportTile(a),bt=supportTile(b);
 if(a.type==='terrain'&&a.item.kind==='top'&&bt&&at.x===bt.x&&at.y===bt.y)return -1;
 if(b.type==='terrain'&&b.item.kind==='top'&&at&&at.x===bt.x&&at.y===bt.y)return 1;
 return b.depth-a.depth;
});
depthItems.forEach(entry=>entry.type==='terrain'?drawTerrainTriangle(entry.item):entry.type==='wall'?drawWall(entry.item):entry.type==='asset'?drawAsset(entry.item):entry.type==='token'?drawToken(entry.item):drawGroundFootprint(entry.item.x,entry.item.y,entry.item.width,entry.item.depth,entry.item.rotation,entry.item.selected,'rgba(3,7,13,.35)'));
if(state.pendingPlacement){ctx.save();ctx.globalAlpha=.62;if(state.pendingPlacement.kind==='token')drawToken(state.pendingPlacement.object);else drawAsset(state.pendingPlacement.object);ctx.restore()}
drawWallDraft();drawMovementRuler();drawMovementIndicator();drawPendingMovementIndicators();drawGmPing();drawGmNotesPins();drawSelectionBox();const hud=document.getElementById('camera-readout');if(hud)hud.textContent=`${state.view2d?'2D':'3D'} · Each grid = ${FEET_PER_GRID} ft · zoom ${state.camera.zoom.toFixed(2)}×`;const altitudeHud=document.getElementById('altitude'),selectedToken=state.tokens.find(t=>t.id===state.selected);if(altitudeHud){if(selectedToken&&canSeeToken(selectedToken)){const wp=tokenWorld(selectedToken),terrain=Math.round(tokenTerrainBase(selectedToken)*10)/10,above=Math.round(Number(selectedToken.z)||0),overall=Math.round((terrain+above)*10)/10;altitudeHud.textContent=`Overall altitude: ${overall} ft · Terrain: ${terrain} ft · Above terrain: ${above} ft`}else altitudeHud.textContent='Altitude: —'}if(movementEl){if(state.movingToken)movementEl.textContent=`Horizontal movement: ${state.moveDistance} ft · ${Math.ceil(state.moveDistance/FEET_PER_GRID)} square${Math.ceil(state.moveDistance/FEET_PER_GRID)===1?'':'s'}`;else if(state.moveDistance)movementEl.textContent=`Last horizontal movement: ${state.moveDistance} ft · ${Math.ceil(state.moveDistance/FEET_PER_GRID)} square${Math.ceil(state.moveDistance/FEET_PER_GRID)===1?'':'s'}`;else movementEl.textContent='Horizontal movement: — · Adjust altitude separately'}requestAnimationFrame(render)}requestAnimationFrame(render);
function isGM(){return sessionRoleEl.value==='gm'}
function isPlayerSession(){return playerScreenMode||window.WoAVTTMultiplayer?.getState?.().role==='player'}
let playerScreenChannel=null,lastPlayerBroadcast=0,playerScreenCameraInitialized=false,playerSceneRevision=0,lastBroadcastSceneRevision=-1;
function buildPlayerSceneSnapshot(playerName=''){try{const data=sceneSnapshot();data.tokens=data.tokens.filter(t=>!t.hidden&&t.visibility!=='gm'&&t.assignment!=='gm'&&(t.assignment!=='specific'||(t.players||[]).some(p=>String(p).trim().toLowerCase()===String(playerName||'').trim().toLowerCase()))).map(t=>{const restricted=t.assignment==='unassigned',info=restricted?(t.playerInfo||{name:true,appearance:true,description:true}):{name:true,appearance:true,description:true,hp:true,ac:true,conditions:true,classResource:true,altitude:true,size:true};const out={...t,playerInfo:info,name:info.name===false?'':t.name,description:info.description===false?'':(t.description||''),runeMarks:[]};if(restricted){out.status={hpCurrent:info.hp?(t.status?.hpCurrent||0):0,hpMaximum:info.hp?(t.status?.hpMaximum||0):0,tempHp:info.hp?(t.status?.tempHp||0):0,ac:info.ac?(t.status?.ac??10):10,lifeStatus:'Alive'};out.conditions=info.conditions?(t.conditions||[]):[];if(!info.classResource){out.classResource={};out.className=''}}if(info.appearance===false){out.image='';out.imageSlots=[];out.glyph='•';out.color='#7b8794';out.borderColor='#46515c'}return out});const tokenIds=new Set(data.tokens.map(t=>t.id));data.assets=data.assets.filter(a=>!a.hidden&&(a.assignment||(a.visibility==='gm'?'gm':'all'))!=='gm'&&((a.assignment||(a.visibility==='gm'?'gm':'all'))!=='specific'||(a.players||[]).some(p=>String(p).trim().toLowerCase()===String(playerName||'').trim().toLowerCase()))).map(a=>{const restricted=a.assignment==='unassigned',info=restricted?(a.playerInfo||{name:true,appearance:true,description:true}):{name:true,appearance:true,description:true,size:true,altitude:true};const out={...a,playerInfo:info,name:info.name===false?'':a.name,description:info.description===false?'':(a.description||'')};if(info.appearance===false){out.image='';out.imageSlots=[]}return out});data.objectGroups=[];const movement=data.movementIndicator;if(movement&&((movement.type==='token'&&!data.tokens.some(t=>t.id===movement.tokenId))||(movement.type==='asset'&&!data.assets.some(a=>a.id===movement.assetId))))data.movementIndicator=null;data.gmNotesPins=[];data.attachments=(data.attachments||[]).filter(e=>{const ok=k=>k.startsWith('token:')?tokenIds.has(k.slice(6)):k.startsWith('asset:')?data.assets.some(x=>x.id===k.slice(6)):true;return ok(e.a)&&ok(e.b)});data.selected=data.tokens.some(t=>t.id===state.selected)?state.selected:null;data.identity={role:'player',playerName:String(playerName||'').trim()};return data}catch(error){console.warn('Player Screen snapshot skipped:',error);return null}}
function broadcastPlayerScene(){
 try{
  const cameraSync=document.getElementById('player-camera-sync')?.checked===true;
  const gmPing=state.gmPing&&Date.now()<state.gmPing.expiresAt?{x:state.gmPing.x,y:state.gmPing.y,startedAt:state.gmPing.startedAt,expiresAt:state.gmPing.expiresAt}:null;
  let message;
  if(lastBroadcastSceneRevision!==playerSceneRevision){
   const data=buildPlayerSceneSnapshot(sessionPlayerNameEl.value.trim());if(!data)return;
   message={type:'scene',data,selectedTokenId:data.selected,gmPing,cameraSync,sceneRevision:playerSceneRevision};
   lastBroadcastSceneRevision=playerSceneRevision;
  }else{
   message={type:'camera',camera:{...state.camera},view2d:state.view2d===true,gmPing,cameraSync};
  }
  playerScreenChannel?.postMessage(message);window.WoAVTTMultiplayer?.publishScene?.(message);return message;
 }catch(error){console.warn('Player Screen sync skipped:',error)}
}
function renderPlayerInfo(token){const panel=document.getElementById('player-token-info');if(!panel)return;panel.replaceChildren();if(!token){panel.hidden=true;return}const info=token.playerInfo||{name:true};const add=(label,value)=>{const row=document.createElement('div');row.className='player-info-row';const strong=document.createElement('strong');strong.textContent=label;const span=document.createElement('span');span.textContent=value;row.append(strong,span);panel.append(row)};panel.hidden=false;const heading=document.createElement('div');heading.className='player-info-title';heading.textContent=info.name===false?'Selected Token':(token.name||'Token');panel.append(heading);if(info.hp)add('HP',(token.status?.hpCurrent||0)+' / '+(token.status?.hpMaximum||0)+(token.status?.tempHp?' · Temp '+token.status.tempHp:''));if(info.ac)add('AC',String(token.status?.ac??10));if(info.conditions)add('Conditions',(token.conditions||[]).map(c=>c.name).join(', ')||'None');if(info.classResource){const defs=CLASS_RESOURCE_DEFS[token.className]||[];const vals=normalizeClassResource(token.className,token.classResource);if(defs.length)add('Resources',defs.map(k=>k+': '+vals[k].current+' / '+vals[k].maximum).join(' · '));}if(info.altitude)add('Altitude',(Number(token.z)||0)+' ft');}
function receivePlayerScene(message){
 const remotePlayer=window.WoAVTTMultiplayer?.getState?.().role==='player';
 if((!playerScreenMode&&!remotePlayer)||!message)return false;
 if(message.type==='camera'){
  const ping=message.gmPing;
  if(ping&&Number.isFinite(Number(ping.x))&&Number.isFinite(Number(ping.y))&&Number(ping.expiresAt)>Date.now())state.gmPing={x:Number(ping.x),y:Number(ping.y),startedAt:Number(ping.startedAt)||Date.now(),expiresAt:Number(ping.expiresAt)};else state.gmPing=null;
  if(message.cameraSync===true)receiveRemoteCamera({enabled:true,camera:message.camera,view2d:message.view2d===true});
  return true;
 }
 if(message.type!=='scene'||!message.data)return false;if(state.movingToken||state.movingAsset){queuedPlayerSceneMessage=message;return 'queued'}const data=message.data,remoteName=String(data.identity?.playerName||''),localCamera=message.cameraSync!==true?{...state.camera}:null,localView2d=state.view2d;const ping=message.gmPing;if(ping&&Number.isFinite(Number(ping.x))&&Number.isFinite(Number(ping.y))&&Number(ping.expiresAt)>Date.now())state.gmPing={x:Number(ping.x),y:Number(ping.y),startedAt:Number(ping.startedAt)||Date.now(),expiresAt:Number(ping.expiresAt)};else state.gmPing=null;data.identity={role:'player',playerName:remoteName};const interaction={pointers:new Map(state.pointers),drag:state.drag?{...state.drag}:null,pinchDistance:state.pinchDistance,lastPinchMid:state.lastPinchMid?{...state.lastPinchMid}:null};try{applyScene(data);if(message.cameraSync!==true)state.view2d=localView2d;document.querySelectorAll('[data-action="2d"]').forEach(b=>{b.textContent='2D / 3D';b.setAttribute('aria-pressed',String(state.view2d));b.title=state.view2d?'Switch to 3D View':'Switch to 2D Fallback'});if(localCamera)state.camera=localCamera;state.pointers=interaction.pointers;state.drag=interaction.drag;state.pinchDistance=interaction.pinchDistance;state.lastPinchMid=interaction.lastPinchMid;sessionRoleEl.value='player';sessionPlayerNameEl.value=remoteName;state.selected=message.selectedTokenId||null;state.selectedAsset=null;updateSelectionInfo();renderPlayerInfo(state.tokens.find(t=>t.id===state.selected)||null);playerScreenCameraInitialized=true;return true;}catch(error){console.error('Player Screen update failed:',error);return false}}

let pendingMoveProposal=null;
let queuedPlayerSceneMessage=null;
function flushQueuedPlayerScene(){if(queuedPlayerSceneMessage&&!state.movingToken&&!state.movingAsset){const message=queuedPlayerSceneMessage;queuedPlayerSceneMessage=null;const applied=receivePlayerScene(message)===true;if(applied)message.onApplied?.();}}
let movementRequestUi=null;
function movementRequestStatus(message){if(movementRequestUi){const status=movementRequestUi.querySelector('[data-move-request-status]');if(status)status.textContent=message}}
function ensureMovementRequestUi(){if(movementRequestUi)return movementRequestUi;const stage=document.querySelector('.stage-card');if(!stage)return null;const wrap=document.createElement('div');wrap.className='player-movement-request';wrap.hidden=true;const status=document.createElement('span');status.dataset.moveRequestStatus='';status.textContent='Proposed movement';const button=document.createElement('button');button.type='button';button.textContent='Submit Change Request';button.addEventListener('click',()=>{if(!pendingMoveProposal||pendingMoveProposal.submitted)return;const api=window.WoAVTTMultiplayer;if(!api?.requestMovement){movementRequestStatus('Not connected to a GM session.');return}const payload={requestId:pendingMoveProposal.requestId,objectType:pendingMoveProposal.objectType||'token',objectId:pendingMoveProposal.objectId||pendingMoveProposal.tokenId,tokenId:pendingMoveProposal.tokenId,base:pendingMoveProposal.base,proposed:pendingMoveProposal.proposed};if(api.requestMovement(payload)){pendingMoveProposal.submitted=true;button.disabled=true;cancelButton.disabled=true;cancelButton.hidden=true;movementRequestStatus('Request sent. Waiting for GM approval.')}else movementRequestStatus('Could not send request. Check your connection.')});const cancelButton=document.createElement('button');cancelButton.type='button';cancelButton.textContent='Cancel Request';cancelButton.className='secondary';cancelButton.addEventListener('click',()=>{if(!pendingMoveProposal||pendingMoveProposal.submitted)return;clearMovementProposal('Movement request cancelled. The token has been returned to its last position.')});wrap.append(status,button,cancelButton);stage.append(wrap);movementRequestUi=wrap;return wrap}
function showMovementProposal(proposal){pendingMoveProposal=proposal;const ui=ensureMovementRequestUi();if(ui){ui.hidden=false;const button=ui.querySelector('button');const cancel=ui.querySelector('button.secondary');button.disabled=!!proposal.submitted;button.textContent='Submit Change Request';if(cancel){cancel.hidden=!!proposal.submitted;cancel.disabled=!!proposal.submitted}movementRequestStatus('Change proposed · X '+proposal.proposed.x+', Y '+proposal.proposed.y+', Z '+proposal.proposed.z+' ft. Submit for GM approval or cancel.')}}
function clearMovementProposal(message){if(pendingMoveProposal){const obj=objectFromKey(objectKey(pendingMoveProposal.objectType||'token',pendingMoveProposal.objectId||pendingMoveProposal.tokenId));if(obj){const restore=pendingMoveProposal.authoritative||pendingMoveProposal.base;obj.x=restore.x;obj.y=restore.y;obj.z=restore.z;delete obj._dragX;delete obj._dragY;if(pendingMoveProposal.objectType==='token'){const menu=document.getElementById('object-context-menu'),slider=menu?.querySelector('[data-token-altitude-slider]'),readout=menu?.querySelector('[data-token-altitude]');if(slider)slider.value=String(restore.z);if(readout)readout.textContent=restore.z+' ft'}}for(const p of pendingMoveProposal.localGroup||[]){const target=objectFromKey(p.key);if(target){target.x=p.x;target.y=p.y;target.z=p.z;delete target._dragX;delete target._dragY}}}if(pendingMoveProposal&&state.movementIndicator?.type===(pendingMoveProposal.objectType||'token')&&((state.movementIndicator.tokenId||state.movementIndicator.assetId)===(pendingMoveProposal.objectId||pendingMoveProposal.tokenId)))state.movementIndicator=null;pendingMoveProposal=null;if(movementRequestUi){movementRequestUi.hidden=true;movementRequestUi.querySelectorAll('button').forEach(b=>{b.disabled=false;b.hidden=false})}if(message)movementRequestStatus(message);render()}
function setPendingMovementRequest(request){if(!isGM()||!request)return;const type=request.objectType||(request.tokenId?'token':'asset'),id=request.objectId||request.tokenId;if(!['token','asset'].includes(type)||!id)return;const obj=objectFromKey(objectKey(type,id));if(!obj)return;const width=type==='asset'?Math.max(1,Number(obj.width)||1):Math.max(1,Number(obj.footprint)||1),depth=type==='asset'?Math.max(1,Number(obj.depth)||1):Math.max(1,Number(obj.footprint)||1);const ox=(width-1)/2,oy=(depth-1)/2;state.pendingMovementIndicators=state.pendingMovementIndicators.filter(m=>m.requestId!==request.requestId);state.pendingMovementIndicators.push({requestId:request.requestId,type,tokenId:type==='token'?id:undefined,assetId:type==='asset'?id:undefined,from:{x:request.base.x+ox,y:request.base.y+oy},to:{x:request.proposed.x+ox,y:request.proposed.y+oy}});render()}
function clearPendingMovementRequest(requestId){state.pendingMovementIndicators=state.pendingMovementIndicators.filter(m=>m.requestId!==requestId);render()}
function applyApprovedPlayerMovement(request){
 if(!isGM()||!request)return{ok:false,message:'Only the GM can approve movement.'};
 const type=request.objectType||(request.tokenId?'token':'asset'),id=request.objectId||request.tokenId,obj=objectFromKey(objectKey(type,id));
 if(!obj||obj.hidden||obj.locked||obj.visibility==='gm'||(type==='token'&&obj.assignment==='gm'))return{ok:false,message:'That object is no longer available for player movement.'};
 const player=String(request.playerName||'').trim().toLowerCase();
 if(obj.assignment==='specific'&&!(obj.players||[]).some(p=>String(p).trim().toLowerCase()===player))return{ok:false,message:'That object is no longer assigned to this player.'};
 if(obj.assignment!=='specific'&&obj.assignment!=='all')return{ok:false,message:'That object is not assigned to players for movement.'};
 if(type==='asset'&&!canSeeAsset(obj))return{ok:false,message:'That asset is no longer visible to players.'};
 if(type==='asset'&&obj.assignment==='specific'&&!(obj.players||[]).some(p=>String(p).trim().toLowerCase()===player))return{ok:false,message:'That asset is no longer assigned to this player.'};
 if(type==='asset'&&obj.assignment!=='specific'&&obj.assignment!=='all')return{ok:false,message:'That asset is not assigned to players for movement.'};
 const b=request.base,p=request.proposed;
 if(!b||!p||![p.x,p.y,p.z,b.x,b.y,b.z].every(Number.isFinite)||Math.abs(p.x)>10000||Math.abs(p.y)>10000||p.z<0||p.z>MAX_ALTITUDE||p.z%ALTITUDE_STEP!==0)return{ok:false,message:'The proposed position is invalid.'};
 const alreadyAtRequested=Math.abs(obj.x-p.x)<.001&&Math.abs(obj.y-p.y)<.001&&Math.abs((Number(obj.z)||0)-p.z)<.001;
 const stillAtOriginal=Math.abs(obj.x-b.x)<.001&&Math.abs(obj.y-b.y)<.001&&Math.abs((Number(obj.z)||0)-b.z)<.001;
 if(!alreadyAtRequested&&!stillAtOriginal)return{ok:false,message:'The object has moved to a different position since this request. Move it to the requested destination or ask the player to submit a new request.'};
 if(!alreadyAtRequested){
  const altitudeResult=changeRequestedGroupAltitude(type,obj.id,p.z);
  if(!altitudeResult.ok)return{ok:false,message:altitudeResult.message};
  recordUndo();
  if(!altitudeResult.apply())return{ok:false,message:'The requested altitude could not be applied exactly.'};
  const old={x:obj.x,y:obj.y},width=type==='asset'?Math.max(1,Number(obj.width)||1):Math.max(1,Number(obj.footprint)||1),depth=type==='asset'?Math.max(1,Number(obj.depth)||1):Math.max(1,Number(obj.footprint)||1),ox=(width-1)/2,oy=(depth-1)/2;
  obj.x=snapCell(p.x);obj.y=snapCell(p.y);
  state.movementIndicator={type,...(type==='token'?{tokenId:obj.id}:{assetId:obj.id}),from:{x:old.x+ox,y:old.y+oy},to:{x:obj.x+ox,y:obj.y+oy}};
 }
 clearPendingMovementRequest(request.requestId);list();if(type==='token')select(obj.id);saveSceneToBrowser();
 if(sceneSaveStatus)sceneSaveStatus.textContent=alreadyAtRequested?'Approved the movement already performed by the GM for '+(obj.name||type)+'.':'Approved movement request for '+(obj.name||type)+'.';
 return{ok:true,alreadyApplied:alreadyAtRequested};
}
function receiveRemoteCamera(message){if(!message||message.enabled!==true||!message.camera||typeof message.camera!=='object')return;const camera=message.camera;for(const key of ['yaw','elevation','distance','zoom','targetX','targetY','targetZ','panX','panY'])if(Number.isFinite(Number(camera[key])))state.camera[key]=Number(camera[key]);state.view2d=message.view2d===true;document.querySelectorAll('[data-action="2d"]').forEach(b=>{b.textContent='2D / 3D';b.setAttribute('aria-pressed',String(state.view2d));b.title=state.view2d?'Switch to 3D View':'Switch to 2D Fallback'});}
function receiveMovementResult(result){if(!pendingMoveProposal)return;if(result?.requestId&&result.requestId!==pendingMoveProposal.requestId){console.warn('Movement result ID mismatch; resolving the sole pending player proposal.',result.requestId,pendingMoveProposal.requestId)}if(result?.ok){pendingMoveProposal=null;if(movementRequestUi){movementRequestUi.hidden=true;movementRequestUi.querySelectorAll('button').forEach(b=>{b.disabled=false;b.hidden=false})}movementRequestStatus(result.message||'Movement approved.');render()}else clearMovementProposal(result?.message||'The GM rejected this movement request.');}

window.WoAVTTMultiplayerHooks={buildPlayerSnapshot:buildPlayerSceneSnapshot,receiveRemoteScene:receivePlayerScene,receiveRemoteCamera,applyApprovedMovement:applyApprovedPlayerMovement,movementResult:receiveMovementResult,setPendingMovement:setPendingMovementRequest,clearPendingMovement:clearPendingMovementRequest,getSceneRevision:()=>playerSceneRevision};
function currentPlayer(){return sessionPlayerNameEl.value.trim().toLowerCase()}
function canControlAsset(a){if(!a||a.locked)return false;if(isGM())return true;const assignment=a.assignment||(a.visibility==='gm'?'gm':'all');return assignment==='all'||(assignment==='specific'&&(a.players||[]).some(p=>String(p).trim().toLowerCase()===currentPlayer()))}
function canSeeAsset(a){if(!a||a.hidden)return false;if(isGM())return true;const assignment=a.assignment||(a.visibility==='gm'?'gm':'all');if(assignment==='gm')return false;if(assignment==='all'||assignment==='unassigned')return true;return assignment==='specific'&&(a.players||[]).some(p=>String(p).trim().toLowerCase()===currentPlayer())}
function canSeeToken(t){if(t.hidden)return false;if(isGM())return true;if(t.visibility==='gm'||t.assignment==='gm')return false;if(t.assignment==='all'||t.assignment==='unassigned')return true;if(t.assignment==='specific')return (t.players||[]).some(p=>String(p).trim().toLowerCase()===currentPlayer());return false}
function canControlToken(t){if(t.locked)return false;if(isGM())return true;if(t.assignment==='all')return true;if(t.assignment==='specific')return (t.players||[]).some(p=>p.trim().toLowerCase()===currentPlayer());return false}
function visibleTokens(){return state.tokens.filter(canSeeToken)}
function updateIdentityUI(){const gm=isGM();updateGmNotePinModeUI();if(!gm&&runeMarkModeAssassinId){const source=state.tokens.find(t=>t.id===runeMarkModeAssassinId);runeMarkModeAssassinId=null;if(source)updateClassResourcePanel(source)}playerNameWrap.hidden=gm;permissionStatusEl.textContent=gm?'GM preview: all tokens and management controls are available.':'Player preview: only All Players tokens and tokens specifically assigned to your name are visible. Unassigned and GM-only tokens are hidden.';document.querySelectorAll('[data-action="token-add"],[data-action="token-update"],[data-action="token-delete"],[data-action="token-lock"],[data-action="asset-lock"],[data-action="wall-placement"],[data-action="wall-update"],[data-action="wall-lock"],[data-action="wall-delete"],[data-action="save-scene"],[data-action="load-scene"],[data-action="export-scene"],[data-action="import-scene"],[data-action="terrain-toggle"],[data-action="asset-add"],[data-action="asset-delete"],[data-action="end-turn"],[data-action="end-round"], [data-action="reset-combat-clock"]').forEach(b=>b.disabled=!gm);assetEditControls?.forEach(el=>el.disabled=!gm);if(!gm&&state.wallPlacement){state.wallPlacement=false;state.wallDraft=null;document.querySelectorAll('[data-action="wall-placement"]').forEach(b=>{b.textContent='Place Wall';b.classList.remove('active')});syncWallEditor(state.walls.find(w=>w.id===state.selectedWall)||null)}if(!gm&&state.terrainMode){state.terrainMode=false;const terrainButton=document.querySelector('[data-action="terrain-toggle"]');if(terrainButton){terrainButton.textContent="Paint Terrain: Off";terrainButton.classList.remove("active");}}const t=state.tokens.find(x=>x.id===state.selected);if(t&&!canSeeToken(t)){state.selected=visibleTokens()[0]?.id||null;state.movingToken=null;state.moveStart=null}list();syncWallEditor(state.walls.find(w=>w.id===state.selectedWall)||null)}
sessionRoleEl.onchange=updateIdentityUI;sessionPlayerNameEl.oninput=updateIdentityUI;
let runeMarkModeAssassinId=null;
function assignmentLabel(t){if(t.assignment==='specific')return t.players?.length?`Players: ${t.players.join(", ")}`:'Specific players';if(t.assignment==='gm')return 'GM Only';if(t.assignment==='unassigned')return 'Unassigned';return 'All Players'}
const CLASS_RESOURCE_DEFS={Gladiator:['Momentum'],Templar:['Resolve'],Assassin:['Rune Marks'],Ranger:['Focus'],Sorcerer:['Aether Focus'],Spiritmaster:['Spirit Bond'],Cleric:['Divine Grace'],Chanter:['Cadence'],Aethertech:['Aether Core','Heat'],Gunslinger:['Tempo'],Songweaver:['Resonance']};
function loadEditor(t){if(!t)return;if(tokenClassEl)tokenClassEl.value=CLASS_RESOURCE_DEFS[t.className]?t.className:'';tokenNameEl.value=t.name;tokenGlyphEl.value=t.glyph||'';tokenColorEl.value=t.color||'#65d6a1';tokenFootprintEl.value=String(t.footprint||1);const tokenHeightEl=document.getElementById('token-height-px');if(tokenHeightEl)tokenHeightEl.value=String(Math.round(Number(t.heightPx)||(Number(t.footprint)||1)*CELL_PX));if(tokenVisibilityEl)tokenVisibilityEl.value=t.visibility==='gm'?'gm':'players';tokenAssignmentEl.value=t.assignment||'all';tokenPlayersEl.value=(t.players||[]).join(', ');tokenPlayersEl.hidden=tokenAssignmentEl.value!=='specific';if(tokenImageStatusEl)tokenImageStatusEl.textContent=t.image?'Custom image attached. Drag the preview or use zoom and offsets to align it.':'No custom image; using the token glyph.';if(tokenImageFileEl)tokenImageFileEl.value='';updateImageFramingReadout('token',t);updateImageFramingReadout('asset',null);updateImageControlState(t);updateClassResourcePanel(t)}
function updateImageControlState(t){const reset=document.querySelector('[data-action="token-image-reset"]');if(reset)reset.disabled=!t?.image||!!t?.locked||!isGM();updateImageFramingReadout('token',t)}
function updateAltitudeDisplay(t){const slider=document.getElementById('token-altitude-slider'),value=document.getElementById('altitude-value'),detail=document.getElementById('altitude-detail');if(slider)slider.value=String(Math.max(0,Math.min(MAX_ALTITUDE,Math.round((Number(t?.z)||0)/ALTITUDE_STEP)*ALTITUDE_STEP)));if(value)value.textContent=t?`${t.z} ft above terrain`:'— ft';if(detail){if(!t){detail.textContent='Select a token to adjust its altitude.'}else{const p=tokenWorld(t),terrain=Math.round(tokenTerrainBase(t)*10)/10,above=Math.round(Number(t.z)||0),overall=Math.round((terrain+above)*10)/10;detail.textContent=`${t.name} · Overall altitude: ${overall} ft · Terrain: ${terrain} ft · Height above terrain: ${above} ft`}}}
const APPROVED_CONDITIONS=["Blinded","Charmed","Deafened","Frightened","Grappled","Incapacitated","Invisible","Paralyzed","Petrified","Poisoned","Prone","Restrained","Stunned","Unconscious"];
function normalizeTokenConditions(conditions){
 if(!Array.isArray(conditions))return [];
 const result=[];
 conditions.forEach(entry=>{
  const name=typeof entry==='string'?entry:String(entry?.name||'');
  if(!APPROVED_CONDITIONS.includes(name)||result.some(c=>c.name===name))return;
  const type=entry&&typeof entry==='object'&&['turn','round'].includes(entry.durationType)?entry.durationType:'until-removed';
  const remaining=type==='until-removed'?null:Math.max(1,Math.min(99,Math.floor(Number(entry.remaining)||1)));
  result.push({name,durationType:type,remaining});
 });
 return result;
}
function updateTurnCounter(){
 const el=document.getElementById('turn-counter');
 if(el)el.textContent='Round '+Math.max(1,Number(state.combatRound)||1)+' · Turn '+Math.max(0,Number(state.combatTurn)||0);
}
updateTurnCounter();
function runeMarksForAssassin(assassinId){return state.tokens.flatMap(target=>{const mark=(target.runeMarks||[]).find(m=>m.assassinId===assassinId&&m.count>0);return mark?[{target,count:mark.count}]:[]})}
function normalizeRuneMarks(raw){if(!Array.isArray(raw))return[];const merged=new Map();raw.slice(0,100).forEach(m=>{if(!m||typeof m.assassinId!=='string')return;const count=Math.max(0,Math.min(3,Math.floor(Number(m.count)||0)));if(count)merged.set(m.assassinId,Math.min(3,(merged.get(m.assassinId)||0)+count))});return [...merged].map(([assassinId,count])=>({assassinId,count}))}
function updateConditionsPanel(token){
 const nameEl=document.getElementById('condition-token-name'),listEl=document.getElementById('condition-list');
 const controls=document.getElementById('condition-controls'),selectEl=document.getElementById('condition-select'),removeList=document.getElementById('condition-remove-list'),applyButton=document.querySelector('[data-condition-apply]');
 if(!nameEl||!listEl)return;
 const valid=!!token&&canSeeToken(token);
 if(!valid){
  nameEl.textContent='No token selected';listEl.textContent='Select a token to view its active Conditions.';
  if(controls)controls.hidden=true;if(removeList){removeList.replaceChildren();removeList.dataset.conditionsKey='';}return;
 }
 nameEl.textContent=token.name||'Unnamed Token';
 const active=normalizeTokenConditions(token.conditions);
 listEl.replaceChildren();
 const runeMarks=normalizeRuneMarks(token.runeMarks).filter(mark=>state.tokens.some(t=>t.id===mark.assassinId&&t.className==='Assassin'));
 if(runeMarks.length){const heading=document.createElement('strong');heading.textContent='Rune Marks';heading.className='condition-remove-heading';listEl.appendChild(heading);runeMarks.forEach(mark=>{const assassin=state.tokens.find(t=>t.id===mark.assassinId),item=document.createElement('div');item.className='condition-entry';const label=document.createElement('span');label.textContent=(assassin?.name||'Unknown Assassin')+' · '+mark.count+' / 3';item.appendChild(label);listEl.appendChild(item)})}

 if(!active.length){const empty=document.createElement('small');empty.textContent='No active Conditions.';listEl.appendChild(empty)}
 else active.forEach(condition=>{
  const item=document.createElement('div');item.className='condition-entry';
  const label=document.createElement('span');label.textContent=condition.name;
  const duration=document.createElement('small');
  duration.textContent=condition.durationType==='until-removed'?'Until removed':condition.remaining+' '+(condition.durationType==='turn'?'turn(s)':'round(s)');
  item.append(label,duration);listEl.appendChild(item);
 });
 if(controls)controls.hidden=!isGM();
 if(selectEl){const selected=selectEl.value;for(const option of selectEl.options)if(option.value)option.disabled=active.some(c=>c.name===option.value);if(selected&&active.some(c=>c.name===selected))selectEl.value='';}
 if(applyButton)applyButton.disabled=!isGM()||!selectEl||!selectEl.value||active.some(c=>c.name===selectEl.value);
 if(removeList){
  const removeKey=(isGM()?active.map(c=>c.name+':'+c.durationType+':'+c.remaining).join('|'):'')+'|'+(isGM()?'gm':'player');
  if(removeList.dataset.conditionsKey!==removeKey){
   removeList.replaceChildren();removeList.dataset.conditionsKey=removeKey;
   if(isGM()&&active.length){
    const heading=document.createElement('div');heading.className='condition-remove-heading';heading.textContent='Remove Condition';removeList.appendChild(heading);
    active.forEach(condition=>{
     const button=document.createElement('button');button.type='button';button.className='condition-remove-button';button.dataset.conditionRemove=condition.name;button.textContent='Remove '+condition.name;removeList.appendChild(button);
    });
   }
  }
 }
}
function advanceCombatClock(type){
 if(!isGM()){if(sceneSaveStatus)sceneSaveStatus.textContent='Only the GM can advance combat turns.';return;}
 if(type==='turn')state.movementIndicator=null;
 recordUndo();
 const key=type==='turn'?'combatTurn':'combatRound';
 if(type==='turn')state.combatTurn=Math.max(0,Number(state.combatTurn)||0)+1;
 else{state.combatRound=Math.max(1,Number(state.combatRound)||1)+1;state.combatTurn=0;}
 let expired=0;
 state.tokens.forEach(token=>{
  const before=normalizeTokenConditions(token.conditions);
  token.conditions=before.flatMap(condition=>{
   if(condition.durationType!==type)return [condition];
   const remaining=condition.remaining-1;
   if(remaining<=0){expired++;return [];}
   return [{...condition,remaining}];
  });
 });
 updateTurnCounter();saveSceneToBrowser();
 if(sceneSaveStatus)sceneSaveStatus.textContent=(type==='turn'?'Turn advanced.':'Round '+state.combatRound+' started.')+(expired?' '+expired+' Condition'+(expired===1?'':'s')+' expired.':'');
 render();
}
const conditionPanel=document.getElementById('condition-panel');
if(conditionPanel)conditionPanel.addEventListener('click',event=>{
 const apply=event.target.closest('[data-condition-apply]'),remove=event.target.closest('[data-condition-remove]');
 if(!apply&&!remove)return;
 if(!isGM()){if(sceneSaveStatus)sceneSaveStatus.textContent='Only the GM can change token Conditions.';return;}
 const token=state.tokens.find(t=>t.id===state.selected);
 if(!token||!canSeeToken(token)){if(sceneSaveStatus)sceneSaveStatus.textContent='Select a token before changing its Conditions.';return;}
 const current=normalizeTokenConditions(token.conditions);
 if(apply){
  const selectEl=document.getElementById('condition-select'),typeEl=document.getElementById('condition-duration-type'),valueEl=document.getElementById('condition-duration-value'),name=selectEl?.value,type=typeEl?.value||'until-removed';
  if(!APPROVED_CONDITIONS.includes(name)||current.some(c=>c.name===name))return;
  const remaining=type==='until-removed'?null:Math.max(1,Math.min(99,Math.floor(Number(valueEl?.value)||1)));
  recordUndo();token.conditions=[...current,{name,durationType:['turn','round'].includes(type)?type:'until-removed',remaining}];
  selectEl.value='';saveSceneToBrowser();
  if(sceneSaveStatus)sceneSaveStatus.textContent=name+' applied to '+(token.name||'token')+'.';
 }else if(remove){
  const name=remove.dataset.conditionRemove;
  if(!current.some(c=>c.name===name))return;
  recordUndo();token.conditions=current.filter(c=>c.name!==name);saveSceneToBrowser();
  if(sceneSaveStatus)sceneSaveStatus.textContent=name+' removed from '+(token.name||'token')+'.';
 }
 updateConditionsPanel(token);
});
if(conditionPanel){
 const selectEl=document.getElementById('condition-select'),applyButton=conditionPanel.querySelector('[data-condition-apply]');
 const typeEl=document.getElementById('condition-duration-type'),valueWrap=document.getElementById('condition-duration-value-wrap');
 const refreshApply=()=>{if(applyButton)applyButton.disabled=!isGM()||!selectEl?.value;};
 selectEl?.addEventListener('change',refreshApply);
 typeEl?.addEventListener('change',()=>{if(valueWrap)valueWrap.hidden=typeEl.value==='until-removed';});
}
function updateSelectionInfo(){
 if(playerScreenMode){renderPlayerInfo(state.tokens.find(t=>t.id===state.selected)||null);selectionEl.hidden=true;return}
 const asset=state.selectedAsset?state.assets.find(a=>a.id===state.selectedAsset):null;
 const token=!asset&&state.selected?state.tokens.find(t=>t.id===state.selected):null;
 if(asset&&canSeeAsset(asset)){
  const x=Math.round((Number(asset.x)||0)*FEET_PER_GRID*10)/10,y=Math.round((Number(asset.y)||0)*FEET_PER_GRID*10)/10,z=Math.round(Number(asset.z)||0);
  selectionEl.hidden=false;selectionEl.textContent=`${asset.name||'Unnamed Prop / Asset'} · Prop / Asset\nX: ${x} ft · Y: ${y} ft · Elevation: ${z} ft`;
 }else if(token&&canSeeToken(token)){
  const p=tokenWorld(token),x=Math.round(p.x*FEET_PER_GRID*10)/10,y=Math.round(p.y*FEET_PER_GRID*10)/10,terrain=Math.round(tokenTerrainBase(token)*10)/10,above=Math.round(Number(token.z)||0),overall=Math.round((terrain+above)*10)/10;
  const resources=CLASS_RESOURCE_DEFS[token.className]||[],resourceValues=normalizeClassResource(token.className,token.classResource),resourceText=token.className==='Assassin'?'Rune Marks: '+runeMarksForAssassin(token.id).length+' / 3 targets':resources.length?resources.map(resource=>resource+': '+resourceValues[resource].current+' / '+resourceValues[resource].maximum).join(' · '):'No class resource';
  const conditions=normalizeTokenConditions(token.conditions),statusText=conditions.length?conditions.map(condition=>condition.name+(condition.durationType==='until-removed'?'':' ('+condition.remaining+' '+(condition.durationType==='turn'?'turn(s)':'round(s)')+')')).join(', '):'None';
  const runeText=normalizeRuneMarks(token.runeMarks).map(mark=>{const assassin=state.tokens.find(t=>t.id===mark.assassinId);return(assassin?.name||'Unknown Assassin')+' × '+mark.count}).join(' · ');
  const playerAssignedVitals=token.assignment==='all'||(token.assignment==='specific'&&(token.players||[]).some(name=>name.trim().toLowerCase()===currentPlayer()));
  const canViewVitals=isGM()||playerAssignedVitals;
  const visibleStatus=canViewVitals?(token.status&&typeof token.status==='object'?token.status:{}):null;
  const privateStatusText=visibleStatus?'\nHP: '+(Number(visibleStatus.hpCurrent)||0)+' / '+(Number(visibleStatus.hpMaximum)||0)+' · Temp HP: '+(Number(visibleStatus.tempHp)||0)+' · AC: '+(Number.isFinite(Number(visibleStatus.ac))?Number(visibleStatus.ac):10)+' · Life: '+(['Alive','Unconscious','Dead'].includes(visibleStatus.lifeStatus)?visibleStatus.lifeStatus:'Alive'):'';
  selectionEl.hidden=false;selectionEl.textContent=(token.name||'Unnamed Token')+' · Token'+(token.locked?' · 🔒 LOCKED':'')+'\nX: '+x+' ft · Y: '+y+' ft · Overall altitude: '+overall+' ft\nResources: '+resourceText+'\nConditions: '+statusText+privateStatusText+(runeText?'\nRune Marks: '+runeText:'');
 }else{selectionEl.hidden=true;selectionEl.textContent=''}
}
function select(id){if(playerScreenMode||!id)return;if(state.movementIndicator&&state.movementIndicator.tokenId!==id)state.movementIndicator=null;const t=state.tokens.find(x=>x.id===id);if(!t||!canSeeToken(t))return;state.selected=id;state.selectedTokenIds=[id];state.selectedAssetIds=[];const p=tokenWorld(t);selectionEl.textContent=`${t.name}${t.locked?' · 🔒 LOCKED':''} · X ${p.x*FEET_PER_GRID} ft · Y ${p.y*FEET_PER_GRID} ft · Z ${t.z} ft · ${t.footprint||1}×${t.footprint||1} squares · ${assignmentLabel(t)}`;altitudeEl.textContent=`Altitude: ${t.z} ft`;updateAltitudeDisplay(t);[...tokenList.children].forEach(e=>e.classList.toggle('selected',(state.selectedTokenIds||[state.selected]).includes(e.dataset.id)));loadEditor(t);const lockButton=document.querySelector('[data-action="token-lock"]');if(lockButton){lockButton.textContent=t.locked?'Unlock Token':'Lock Token';lockButton.disabled=!isGM()}updateObjectLockButton('token',t);updateImageControlState(t);updateClassResourcePanel(t)}
function list(){tokenList.innerHTML='';visibleTokens().forEach(t=>{const e=document.createElement('div');e.className='token';e.dataset.id=t.id;const p=tokenWorld(t),f=t.footprint||1;e.innerHTML=`<span>${t.name}<small>${t.locked?'🔒 Locked · ':''}${assignmentLabel(t)}</small></span><small>${t.z} ft · (${p.x*FEET_PER_GRID}, ${p.y*FEET_PER_GRID}) · ${f}×${f} squares</small>`;e.onclick=()=>select(t.id);tokenList.appendChild(e)});refreshAttachmentControls();select(state.selected)}
list();
syncWallEditor(null);
setupObjectContextMenu();
canvas.addEventListener('contextmenu',e=>{if(!isGM())return;const assassin=state.tokens.find(t=>t.id===state.selected);if(!assassin||assassin.className!=='Assassin')return;const rect=canvas.getBoundingClientRect(),target=hit(e.clientX-rect.left,e.clientY-rect.top);if(!target||!normalizeRuneMarks(target.runeMarks).some(m=>m.assassinId===assassin.id))return;e.preventDefault();e.stopImmediatePropagation();removeRuneMark(assassin.id,target.id)},true);
document.getElementById('token-altitude-slider')?.addEventListener('input',e=>{const t=state.tokens.find(x=>x.id===state.selected);if(!t||!canControlToken(t)||t.locked){updateAltitudeDisplay(t);return}const next=Math.max(0,Math.min(MAX_ALTITUDE,Math.round(Number(e.target.value)/ALTITUDE_STEP)*ALTITUDE_STEP));if(next===t.z)return;recordUndo();changeGroupAltitude('token',t.id,next);e.target.value=String(t.z);altitudeEl.textContent=`Altitude: ${t.z} ft`;updateAltitudeDisplay(t);const p=tokenWorld(t);selectionEl.textContent=`${t.name}${t.locked?' · 🔒 LOCKED':''} · X ${p.x*FEET_PER_GRID} ft · Y ${p.y*FEET_PER_GRID} ft · Z ${t.z} ft · ${t.footprint||1}×${t.footprint||1} squares · ${assignmentLabel(t)}`;saveSceneToBrowser();});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
function hit(x,y){let out=null,bd=1e9;const touchPad=window.matchMedia&&window.matchMedia('(pointer:coarse)').matches?14:6;for(const t of visibleTokens()){const s=t._screen;if(s){const dx=Math.abs(x-s.x),dy=Math.abs(y-s.y),inside=s.halfSize!==null&&s.halfSize!==undefined?dx<=s.halfSize+touchPad&&dy<=s.halfSize+touchPad:Math.hypot(dx,dy)<=s.radius+touchPad,d=Math.hypot(dx,dy);if(inside&&d<bd){bd=d;out=t}}}return out}
function screenToGround(sx,sy){const{w,h}=size();if(state.view2d)return{x:(sx-w/2-state.camera.panX)/(CELL_PX*state.camera.zoom),y:-(sy-h/2-state.camera.panY)/(CELL_PX*state.camera.zoom)};const b=basis(),f=Math.min(w,h)*.86*state.camera.zoom,nx=(sx-w/2)/f,ny=-(sy-h*.56)/f,dir={x:b.f.x+nx*b.r.x+ny*b.u.x,y:b.f.y+nx*b.r.y+ny*b.u.y,z:b.f.z+nx*b.r.z+ny*b.u.z};if(Math.abs(dir.z)<.001)return{x:0,y:0};const tt=-b.pos.z/dir.z;return{x:b.pos.x+dir.x*tt,y:b.pos.y+dir.y*tt}}
function snapCell(v){return Math.floor(v+0.5)}
function updatePendingPlacementFromPointer(clientX,clientY){
 const pending=state.pendingPlacement;if(!pending)return;
 const rect=canvas.getBoundingClientRect(),ground=screenToGround(clientX-rect.left,clientY-rect.top),obj=pending.object;
 if(pending.kind==='token'){
  const footprint=Math.max(1,Number(obj.footprint)||1);
  obj.x=snapCell(ground.x-(footprint-1)/2);obj.y=snapCell(ground.y-(footprint-1)/2);
 }else{
  const width=Math.max(1,Number(obj.width)||1),depth=Math.max(1,Number(obj.depth)||1);
  obj.x=snapCell(ground.x-(width-1)/2);obj.y=snapCell(ground.y-(depth-1)/2);
 }
}
function cancelPendingPlacement(){
 if(!state.pendingPlacement)return;
 const name=state.pendingPlacement.name||'object';state.pendingPlacement=null;
 if(sceneSaveStatus)sceneSaveStatus.textContent='Placement cancelled for "'+name+'". Nothing was added to the scene.';
 const libraryStatus=document.getElementById('asset-library-status');if(libraryStatus)libraryStatus.textContent='Placement cancelled.';
 render();
}
function beginLibraryPlacement(kind,payload,name){
 if(!isGM()||!['token','asset'].includes(kind)||!payload||typeof payload!=='object')return false;
 if(state.pendingPlacement)cancelPendingPlacement();
 const copy=JSON.parse(JSON.stringify(payload));
 copy.id=(kind==='token'?'token-library-':'asset-library-')+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
 copy.x=0;copy.y=0;copy.z=Math.max(0,Number(copy.z)||0);copy.locked=false;copy.hidden=false;
 state.pendingPlacement={kind,object:copy,name:String(name||copy.name||'Library object')};
 const rect=canvas.getBoundingClientRect();updatePendingPlacementFromPointer(rect.left+rect.width/2,rect.top+rect.height/2);
 if(sceneSaveStatus)sceneSaveStatus.textContent='Placing "'+state.pendingPlacement.name+'": move the cursor and left-click to place. Press Esc or right-click to cancel.';
 const libraryStatus=document.getElementById('asset-library-status');if(libraryStatus)libraryStatus.textContent='Move the preview over the map. Left-click to place; Esc or right-click to cancel.';
 return true;
}
window.beginVttAssetPlacement=beginLibraryPlacement;
canvas.addEventListener('pointermove',e=>{if(!state.pendingPlacement||state.pointers.has(e.pointerId))return;updatePendingPlacementFromPointer(e.clientX,e.clientY)});
addEventListener('keydown',e=>{if(e.key==='Escape'&&state.pendingPlacement){e.preventDefault();cancelPendingPlacement()}});

function snapWallPoint(x,y,mode){if(mode==='corner')return{x:Math.round(x-.5)+.5,y:Math.round(y-.5)+.5};if(mode==='line'){const a={x:Math.round(x),y:Math.round(y-.5)+.5},b={x:Math.round(x-.5)+.5,y:Math.round(y)};return Math.hypot(x-a.x,y-a.y)<=Math.hypot(x-b.x,y-b.y)?a:b}return{x:Math.round(x),y:Math.round(y)}}
const gmNotePopup=document.getElementById('gm-note-popup'),gmNoteText=document.getElementById('gm-note-text'),gmNoteStatus=document.getElementById('gm-note-status'),gmNoteHover=document.getElementById('gm-note-hover');
function updateGmNotePinModeUI(){const b=document.querySelector('[data-action="gm-note-pin-toggle"]');if(b){b.textContent=state.gmNotesPinMode?'Cancel Pin Placement':'＋ Place GM Note Pin';b.classList.toggle('active',!!state.gmNotesPinMode);b.setAttribute('aria-pressed',String(!!state.gmNotesPinMode))}if(!isGM()){state.gmNotesPinMode=false;state.openGmNotePinId=null;closeGmNotePopup();if(gmNoteHover)gmNoteHover.hidden=true}}
function closeGmNotePopup(){if(gmNotePopup)gmNotePopup.hidden=true}
function renderGmNotePopup(){if(!isGM()||!gmNotePopup)return;const pin=state.gmNotesPins.find(p=>p.id===state.openGmNotePinId);if(!pin){closeGmNotePopup();return}const p=project(pin.x,pin.y,0),rect=canvas.getBoundingClientRect(),stage=canvas.closest('.stage-card').getBoundingClientRect();gmNotePopup.style.left=Math.max(8,Math.min(stage.width-300,p.x+rect.left-stage.left+14))+'px';gmNotePopup.style.top=Math.max(8,Math.min(stage.height-210,p.y+rect.top-stage.top-20))+'px';gmNoteText.value=pin.note||'';gmNoteStatus.textContent='Grid ('+pin.x+', '+pin.y+')';gmNotePopup.hidden=false}
function drawGmNotesPins(){if(!isGM())return;for(const pin of state.gmNotesPins||[]){const p=project(pin.x,pin.y,0);if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.depth<=NEAR)continue;ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle='#f0b84b';ctx.strokeStyle='#3b2608';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,-5,7,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(-5,-1);ctx.lineTo(0,8);ctx.lineTo(5,-1);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#18202b';ctx.font='bold 8px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('N',0,-5);ctx.restore();pin._screen={x:p.x,y:p.y}}}
function hitGmNotePin(x,y){if(!isGM())return null;let best=null,distance=16;for(const pin of state.gmNotesPins||[]){const p=pin._screen;if(!p)continue;const d=Math.hypot(x-p.x,y-(p.y-2));if(d<distance){best=pin;distance=d}}return best}
canvas.addEventListener('pointermove',e=>{if(!isGM()||state.pointers.size||state.gmNotesPinMode){if(gmNoteHover)gmNoteHover.hidden=true;return}const r=canvas.getBoundingClientRect(),pin=hitGmNotePin(e.clientX-r.left,e.clientY-r.top);if(!pin||!pin.note){gmNoteHover.hidden=true;return}gmNoteHover.textContent=pin.note;gmNoteHover.style.left=Math.min(r.width-270,e.clientX-r.left+14)+'px';gmNoteHover.style.top=Math.min(r.height-100,e.clientY-r.top+14)+'px';gmNoteHover.hidden=false});
document.querySelector('[data-action="gm-note-pin-toggle"]')?.addEventListener('click',()=>{if(!isGM())return;state.gmNotesPinMode=!state.gmNotesPinMode;state.openGmNotePinId=null;closeGmNotePopup();updateGmNotePinModeUI();if(sceneSaveStatus)sceneSaveStatus.textContent=state.gmNotesPinMode?'Click a map grid cell to place a GM-only note pin.':'Pin placement cancelled.'});
document.getElementById('gm-note-save')?.addEventListener('click',()=>{if(!isGM())return;const pin=state.gmNotesPins.find(p=>p.id===state.openGmNotePinId);if(!pin)return;recordUndo();pin.note=gmNoteText.value.slice(0,5000);saveSceneToBrowser();gmNoteStatus.textContent='Note saved.'});
document.getElementById('gm-note-clear')?.addEventListener('click',()=>{if(!isGM())return;const pin=state.gmNotesPins.find(p=>p.id===state.openGmNotePinId);if(!pin||!confirm('Clear the text in this note?'))return;recordUndo();pin.note='';gmNoteText.value='';saveSceneToBrowser();gmNoteStatus.textContent='Note cleared.'});
document.getElementById('gm-note-delete')?.addEventListener('click',()=>{if(!isGM())return;const pin=state.gmNotesPins.find(p=>p.id===state.openGmNotePinId);if(!pin||!confirm('Delete this GM note pin and its note?'))return;recordUndo();state.gmNotesPins=state.gmNotesPins.filter(p=>p.id!==pin.id);state.openGmNotePinId=null;closeGmNotePopup();saveSceneToBrowser()});
document.getElementById('gm-note-close')?.addEventListener('click',()=>{state.openGmNotePinId=null;closeGmNotePopup()});
canvas.addEventListener('pointerdown',e=>{
 if(state.pendingPlacement){
  if(e.button===2){e.preventDefault();cancelPendingPlacement();return}
  if(e.button!==0)return;
  e.preventDefault();const pending=state.pendingPlacement;updatePendingPlacementFromPointer(e.clientX,e.clientY);
  const copy=pending.object;state.pendingPlacement=null;recordUndo();
  if(pending.kind==='token'){
   state.tokens.push(copy);state.selectedAsset=null;state.selectedAssetIds=[];select(copy.id);list();
  }else{
   state.assets.push(copy);state.selected=null;state.selectedTokenIds=[];state.selectedAsset=copy.id;state.selectedAssetIds=[copy.id];
   updateClassResourcePanel(null);syncAssetEditor(copy);refreshAttachmentControls();
  }
  updateSceneObjectBrowser(true);saveSceneToBrowser();
  if(sceneSaveStatus)sceneSaveStatus.textContent='Placed "'+(pending.name||copy.name||'Library object')+'" in the scene.';
  const libraryStatus=document.getElementById('asset-library-status');if(libraryStatus)libraryStatus.textContent='Placed "'+(pending.name||copy.name||'Library object')+'".';
  render();return;
 }
 if(state.gmPingPlacement&&isGM()&&e.button===0){e.preventDefault();const rect=canvas.getBoundingClientRect(),g=screenToGround(e.clientX-rect.left,e.clientY-rect.top),now=Date.now();state.gmPing={x:g.x,y:g.y,startedAt:now,expiresAt:now+4500};state.gmPingPlacement=false;const button=document.querySelector('[data-action="gm-ping-toggle"]');if(button){button.classList.remove('active');button.setAttribute('aria-pressed','false');button.textContent='Ping Location'}if(sceneSaveStatus)sceneSaveStatus.textContent='Attention ping sent to the Player Screen.';broadcastPlayerScene();return}e.preventDefault();canvas.setPointerCapture(e.pointerId);state.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(e.button===0&&state.pointers.size===1&&isGM()){const pin=hitGmNotePin(x,y);if(pin){state.openGmNotePinId=state.openGmNotePinId===pin.id?null:pin.id;state.gmNotesPinMode=false;updateGmNotePinModeUI();renderGmNotePopup();state.pointers.delete(e.pointerId);state.drag=null;return}if(state.openGmNotePinId){state.openGmNotePinId=null;closeGmNotePopup()}if(state.gmNotesPinMode){const g=screenToGround(x,y),px=snapCell(g.x),py=snapCell(g.y);recordUndo();const created={id:'gm-note-'+Date.now(),x:px,y:py,note:''};state.gmNotesPins.push(created);state.openGmNotePinId=created.id;state.gmNotesPinMode=false;updateGmNotePinModeUI();renderGmNotePopup();saveSceneToBrowser();state.pointers.delete(e.pointerId);state.drag=null;return}}if(e.button===2){const rightToken=hit(x,y),rightAsset=rightToken?null:hitAsset(x,y);if(rightToken||rightAsset){state.drag=null;state.movingToken=null;state.movingAsset=null;state.moveStart=null;state.pointers.delete(e.pointerId);return}}if(runeMarkModeAssassinId&&e.button===0&&state.pointers.size===1){const target=hit(x,y);if(target)addRuneMark(runeMarkModeAssassinId,target.id);else if(sceneSaveStatus)sceneSaveStatus.textContent='Click a highlighted enemy token to place a Rune Mark.';state.pointers.delete(e.pointerId);state.drag=null;state.movingToken=null;state.movingAsset=null;return}if(pendingAttachmentAction&&e.button===0&&state.pointers.size===1){const target=hit(x,y),assetTarget=target?null:hitAsset(x,y),targetKey=target?objectKey('token',target.id):assetTarget?objectKey('asset',assetTarget.id):null;if(targetKey){e.preventDefault();applyPendingAttachment(targetKey);state.pointers.delete(e.pointerId);state.drag=null;state.movingToken=null;state.movingAsset=null;return}}if(isGM()&&e.button===0&&state.pointers.size===1&&state.mapImage&&!state.mapLocked&&!state.terrainMode&&!state.wallPlacement&&!state.pendingPlacement&&!state.gmNotesPinMode&&!runeMarkModeAssassinId&&!pendingAttachmentAction&&!hit(x,y)&&!hitAsset(x,y)&&!hitWall(x,y)){const g=screenToGround(x,y),mw=Math.max(1,Number(state.mapWidth)||24),mh=Math.max(1,Number(state.mapHeight)||24),cx=Number(state.mapX)||0,cy=Number(state.mapY)||0;if(g.x>=cx-mw/2&&g.x<=cx+mw/2&&g.y>=cy-mh/2&&g.y<=cy+mh/2){state.movingMap=true;state.mapMoveStart={x:g.x,y:g.y,mapX:cx,mapY:cy};state.mapMoveUndoSnapshot=captureUndoSnapshot();state.movingToken=null;state.movingAsset=null;state.drag=null;return}}if(state.wallPlacement&&isGM()&&e.button===0&&state.pointers.size===1){const g=screenToGround(x,y);state.wallDraft={x1:g.x,y1:g.y,x2:g.x,y2:g.y};state.drag=null;state.movingToken=null;state.movingAsset=null;return}if(state.pointers.size===1&&e.button===2&&isGM()&&state.terrainMode){const g=screenToGround(x,y),cx=snapCell(g.x),cy=snapCell(g.y),key=cx+','+cy;if(state.terrain[key]){recordUndo();delete state.terrain[key];terrainStatusEl.textContent='Erased terrain at ('+cx+', '+cy+').'}else terrainStatusEl.textContent='No terrain tile at ('+cx+', '+cy+').';state.drag=null;state.movingToken=null;state.moveStart=null;state.pointers.delete(e.pointerId);return}if(state.pointers.size===1&&e.button===1){state.drag={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false,mode:state.view2d?'pan':'rotate'};state.movingToken=null;state.moveStart=null;return}if(state.terrainMode&&isGM()&&e.button===0&&state.pointers.size===1){const g=screenToGround(x,y),cx=snapCell(g.x),cy=snapCell(g.y),key=cx+','+cy,type=terrainTypeEl.value,height=Number(terrainHeightEl.value)||0,direction=document.getElementById('terrain-direction').value,startHeight=type==='ramp'?Math.min(height,Number(document.getElementById('terrain-start-height').value)||0):0;if(type==='erase'){if(state.terrain[key])recordUndo();delete state.terrain[key];terrainStatusEl.textContent='Choose a terrain type to paint; right-click erases while Paint Terrain is On.'}else{recordUndo();state.terrain[key]={type,height,direction,...(type==='ramp'?{startHeight}:{})};terrainStatusEl.textContent=type==='ramp'?'Painted ramp from '+startHeight+' ft to '+height+' ft, high edge '+direction+' at ('+cx+', '+cy+').':'Painted '+type+' at ('+cx+', '+cy+') · '+height+' ft.'}state.pointers.delete(e.pointerId);saveSceneToBrowser();return}if(state.pointers.size===1&&e.button===0&&isGM()&&(e.ctrlKey||e.shiftKey)){state.selectionBox={type:e.ctrlKey&&e.shiftKey?'mixed':e.ctrlKey?'token':'asset',x,y,x2:x,y2:y};state.drag=null;state.movingToken=null;state.movingAsset=null;state.groupMoveStart=null;return}if(state.pointers.size===1&&e.button===0&&!state.wallPlacement){const tokenUnder=hit(x,y),assetUnder=tokenUnder?null:hitAsset(x,y),wall=hitWall(x,y),objectDepth=tokenUnder?tokenProject(tokenUnder).depth:assetUnder?project(assetUnder.x+(Math.max(1,Number(assetUnder.width)||1)-1)/2,assetUnder.y+(Math.max(1,Number(assetUnder.depth)||1)-1)/2,assetTerrainBase(assetUnder)+Math.max(0,Math.min(MAX_ALTITUDE,Number(assetUnder.z)||0))).depth:Infinity,wallIsFront=!!wall&&(!tokenUnder&&!assetUnder||state.view2d||wallDepth(wall)<=objectDepth);if(wallIsFront){state.selectedWall=wall.id;state.selected=null;state.selectedAsset=null;state.selectedTokenIds=[];state.selectedAssetIds=[];updateClassResourcePanel(null);syncWallEditor(wall);const pts=wallPoints(wall),ds=Math.hypot(x-pts.a.x,y-pts.a.y),de=Math.hypot(x-pts.b.x,y-pts.b.y),handle=Math.min(ds,de)<14?(ds<de?'start':'end'):null;if(isGM()&&!wall.locked){state.movingWall={wall,handle};const g=screenToGround(x,y);state.wallMoveStart={x1:wall.x1,y1:wall.y1,x2:wall.x2,y2:wall.y2,gx:g.x,gy:g.y};state.wallMoveUndoSnapshot=captureUndoSnapshot()}if(wall.locked)state.pointers.delete(e.pointerId);return}else if(!wallIsFront){state.selectedWall=null;syncWallEditor(null)}}if(state.pointers.size===1){const t=hit(x,y);if(t&&(canControlToken(t)||(isGM()&&t.locked))&&!(isPlayerSession()&&!isGM()&&pendingMoveProposal)){state.selectedWall=null;syncWallEditor(null);const keepTokenGroup=(state.selectedTokenIds||[]).includes(t.id);if(!keepTokenGroup){state.selectedAsset=null;state.selectedAssetIds=[];state.selectedTokenIds=[t.id]}state.selected=t.id;if(!keepTokenGroup)select(t.id);else{const ids=[...state.selectedTokenIds],assets=[...state.selectedAssetIds];select(t.id);state.selectedTokenIds=ids;state.selectedAssetIds=assets;[...tokenList.children].forEach(el=>el.classList.toggle('selected',ids.includes(el.dataset.id)))}if(canControlToken(t)&&!t.locked){state.movingToken=t;const g=screenToGround(x,y),tw=tokenWorld(t);state.moveOffset={x:tw.x-g.x,y:tw.y-g.y};state.moveStart={x:t.x,y:t.y,z:t.z};state.moveUndoSnapshot=captureUndoSnapshot();state.moveDistance=0;t._dragX=t.x;t._dragY=t.y;state.groupMoveStart=captureGroupPositions('token',t.id)}}else{const a=hitAsset(x,y);if(a&&(isGM()||canControlAsset(a))&&!(isPlayerSession()&&!isGM()&&pendingMoveProposal)){state.selectedWall=null;syncWallEditor(null);if(state.movementIndicator&&state.movementIndicator.assetId!==a.id)state.movementIndicator=null;const keepAssetGroup=(state.selectedAssetIds||[]).includes(a.id);if(!keepAssetGroup){state.selected=null;state.selectedTokenIds=[];state.selectedAssetIds=[a.id]}state.selectedAsset=a.id;updateClassResourcePanel(null);syncAssetEditor(a);if(!a.locked){state.movingAsset=a;const g=screenToGround(x,y);state.assetMoveOffset={x:a.x-g.x,y:a.y-g.y};state.moveStart={x:a.x,y:a.y};state.groupMoveStart=captureGroupPositions('asset',a.id);state.moveUndoSnapshot=captureUndoSnapshot()}state.drag=null;return}state.drag={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false,mode:e.button===0?'pan':e.button===2?'rotate':state.view2d?'pan':'rotate'}}}else{const p=[...state.pointers.values()];state.pinchDistance=dist(p[0],p[1]);state.lastPinchMid=mid(p[0],p[1]);state.drag=null;state.movingToken=null;state.moveStart=null;state.moveUndoSnapshot=null}},{passive:false});
canvas.addEventListener('pointermove',e=>{if(!state.pointers.has(e.pointerId))return;e.preventDefault();state.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(state.movingMap&&state.pointers.size===1){const g=screenToGround(x,y),start=state.mapMoveStart;if(start){state.mapX=start.mapX+(g.x-start.x);state.mapY=start.mapY+(g.y-start.y)}return}if(state.selectionBox&&state.pointers.size===1){state.selectionBox.x2=x;state.selectionBox.y2=y;return}if(state.wallDraft&&state.pointers.size===1){const g=screenToGround(x,y);state.wallDraft.x2=g.x;state.wallDraft.y2=g.y;return}if(state.movingWall&&state.pointers.size===1){const g=screenToGround(x,y),m=state.movingWall,start=state.wallMoveStart;if(start){if(m.handle==='start'){const p=m.wall.placement==='free'?{x:g.x,y:g.y}:snapWallPoint(g.x,g.y,m.wall.snapMode);m.wall.x1=p.x;m.wall.y1=p.y}else if(m.handle==='end'){const p=m.wall.placement==='free'?{x:g.x,y:g.y}:snapWallPoint(g.x,g.y,m.wall.snapMode);m.wall.x2=p.x;m.wall.y2=p.y}else{const dx=Math.round(g.x-start.gx),dy=Math.round(g.y-start.gy);m.wall.x1=start.x1+dx;m.wall.y1=start.y1+dy;m.wall.x2=start.x2+dx;m.wall.y2=start.y2+dy}}return}if(state.movingAsset&&state.pointers.size===1){const g=screenToGround(x,y),a=state.movingAsset,desiredX=g.x+state.assetMoveOffset.x,desiredY=g.y+state.assetMoveOffset.y,base=state.groupMoveStart?.find(p=>p.key===objectKey('asset',a.id));if(base)applyGroupPositionDelta(state.groupMoveStart,desiredX-base.x,desiredY-base.y);if(state.moveStart){const width=Math.max(1,Number(a.width)||1),depth=Math.max(1,Number(a.depth)||1),ox=(width-1)/2,oy=(depth-1)/2;state.movementIndicator={type:'asset',assetId:a.id,from:{x:state.moveStart.x+ox,y:state.moveStart.y+oy},to:{x:a.x+ox,y:a.y+oy}};}return}if(state.movingToken&&state.pointers.size===1){const g=screenToGround(x,y),t=state.movingToken,f=Math.max(1,t.footprint||1),desiredX=g.x+state.moveOffset.x-(f-1)/2,desiredY=g.y+state.moveOffset.y-(f-1)/2,base=state.groupMoveStart?.find(p=>p.key===objectKey('token',t.id));if(base)applyGroupPositionDelta(state.groupMoveStart,desiredX-base.x,desiredY-base.y);const snappedX=snapCell(desiredX),snappedY=snapCell(desiredY);if(state.moveStart)state.moveDistance=Math.max(Math.abs(snappedX-state.moveStart.x),Math.abs(snappedY-state.moveStart.y))*FEET_PER_GRID;select(t.id);return}if(state.pointers.size>1){const q=[...state.pointers.values()],d=dist(q[0],q[1]),m=mid(q[0],q[1]);if(state.pinchDistance){state.camera.zoom=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,state.camera.zoom*d/state.pinchDistance));if(state.lastPinchMid){if(state.view2d){state.camera.panX+=m.x-state.lastPinchMid.x;state.camera.panY+=m.y-state.lastPinchMid.y}else{state.camera.targetX-=(m.x-state.lastPinchMid.x)/(CELL_PX*state.camera.zoom);state.camera.targetY+=(m.y-state.lastPinchMid.y)/(CELL_PX*state.camera.zoom)}}}state.pinchDistance=d;state.lastPinchMid=m;return}if(!state.drag)return;const dx=e.clientX-state.drag.lastX,dy=e.clientY-state.drag.lastY;if(state.view2d){state.camera.panX+=dx;state.camera.panY+=dy}else if(state.drag.mode==='pan'){const scale=Math.max(1.5,Math.min(8,state.camera.distance/(8*state.camera.zoom)))*1.8, b=basis(), right=b.r, upLen=Math.hypot(b.u.x,b.u.y)||1, upX=b.u.x/upLen, upY=b.u.y/upLen, sx=dx/(CELL_PX*state.camera.zoom)*scale, sy=dy/(CELL_PX*state.camera.zoom)*scale;state.camera.targetX-=right.x*sx;state.camera.targetY-=right.y*sx;state.camera.targetX+=upX*sy;state.camera.targetY+=upY*sy}else{state.camera.yaw+=dx*.012;state.camera.elevation=Math.max(.38,Math.min(.95,state.camera.elevation+dy*.006))}state.drag.lastX=e.clientX;state.drag.lastY=e.clientY});
function end(e){if(state.movingMap){const changed=Math.abs(state.mapX-state.mapMoveStart.mapX)>.001||Math.abs(state.mapY-state.mapMoveStart.mapY)>.001;if(changed){state.mapX=Math.round(state.mapX*100)/100;state.mapY=Math.round(state.mapY*100)/100;recordUndo(state.mapMoveUndoSnapshot);mapXEl.value=String(state.mapX);mapYEl.value=String(state.mapY);saveSceneToBrowser();if(mapStatusEl)mapStatusEl.textContent='Map repositioned. Map position saved.'}state.movingMap=null;state.mapMoveStart=null;state.mapMoveUndoSnapshot=null;state.pointers.delete(e.pointerId);state.drag=null;return}if(state.wallDraft){finishWallPlacement();state.pointers.delete(e.pointerId);state.drag=null;return}if(state.movingWall){const w=state.movingWall.wall,mode=w.placement==='free'?'free':'grid',p1=mode==='grid'?snapWallPoint(w.x1,w.y1,w.snapMode):{x:Math.round(w.x1*100)/100,y:Math.round(w.y1*100)/100},p2=mode==='grid'?snapWallPoint(w.x2,w.y2,w.snapMode):{x:Math.round(w.x2*100)/100,y:Math.round(w.y2*100)/100};w.x1=p1.x;w.y1=p1.y;w.x2=p2.x;w.y2=p2.y;if(state.wallMoveUndoSnapshot&&(Math.abs(w.x1-state.wallMoveStart.x1)>.001||Math.abs(w.y1-state.wallMoveStart.y1)>.001||Math.abs(w.x2-state.wallMoveStart.x2)>.001||Math.abs(w.y2-state.wallMoveStart.y2)>.001))recordUndo(state.wallMoveUndoSnapshot);state.movingWall=null;state.wallMoveStart=null;state.wallMoveUndoSnapshot=null;syncWallEditor(w);saveSceneToBrowser();state.pointers.delete(e.pointerId);state.drag=null;return}if(state.selectionBox){completeBoxSelection();state.pointers.delete(e.pointerId);if(!state.pointers.size){state.drag=null;state.pinchDistance=null;state.lastPinchMid=null}return}if(state.movingAsset||state.movingToken){const moved=state.groupMoveStart||[],movedToken=state.movingToken,movedAsset=state.movingAsset,start=state.moveStart;let changed=false;for(const p of moved){const obj=objectFromKey(p.key);if(!obj||obj.locked)continue;if(p.key.startsWith('token:')){const nx=snapCell(obj._dragX??obj.x),ny=snapCell(obj._dragY??obj.y);if(nx!==p.x||ny!==p.y)changed=true;obj.x=nx;obj.y=ny;delete obj._dragX;delete obj._dragY}else{const nx=snapCell(obj.x),ny=snapCell(obj.y);if(nx!==p.x||ny!==p.y)changed=true;obj.x=nx;obj.y=ny}}if(changed&&state.moveUndoSnapshot&&!(!isGM()&&isPlayerSession()))recordUndo(state.moveUndoSnapshot);if(changed&&!isGM()&&isPlayerSession()&&(movedToken||movedAsset)&&start){const obj=movedToken||movedAsset,type=movedToken?'token':'asset',id=obj.id,proposed={x:obj.x,y:obj.y,z:Number(obj.z)||0},base={x:start.x,y:start.y,z:Number(start.z)||0};showMovementProposal({requestId:'move-'+Date.now()+'-'+Math.random().toString(36).slice(2),objectType:type,objectId:id,tokenId:movedToken?id:undefined,base,proposed,localGroup:moved.map(p=>({key:p.key,x:p.x,y:p.y,z:p.z}))});for(const p of moved){const target=objectFromKey(p.key);if(target){target.x=p.x;target.y=p.y;target.z=p.z;delete target._dragX;delete target._dragY}}}else if(changed&&movedToken&&start&&(movedToken.x!==start.x||movedToken.y!==start.y))state.movementIndicator={type:'token',tokenId:movedToken.id,from:{x:start.x,y:start.y},to:{x:movedToken.x,y:movedToken.y}};else if(movedAsset&&start){const width=Math.max(1,Number(movedAsset.width)||1),depth=Math.max(1,Number(movedAsset.depth)||1),ox=(width-1)/2,oy=(depth-1)/2,live=state.movementIndicator;if(live?.type==='asset'&&live.assetId===movedAsset.id){live.from={x:start.x+ox,y:start.y+oy};live.to={x:movedAsset.x+ox,y:movedAsset.y+oy};}else if(Math.abs(movedAsset.x-start.x)>.001||Math.abs(movedAsset.y-start.y)>.001){state.movementIndicator={type:'asset',assetId:movedAsset.id,from:{x:start.x+ox,y:start.y+oy},to:{x:movedAsset.x+ox,y:movedAsset.y+oy}};}}if(!isGM()&&isPlayerSession()&&changed)state.movementIndicator=null;state.groupMoveStart=null;state.moveUndoSnapshot=null;state.movingAsset=null;state.movingToken=null;state.moveStart=null;list()}state.pointers.delete(e.pointerId);if(!state.pointers.size){state.drag=null;state.pinchDistance=null;state.lastPinchMid=null}}canvas.addEventListener('pointerup',e=>{end(e);saveSceneToBrowser();if(isGM())broadcastPlayerScene();flushQueuedPlayerScene()});canvas.addEventListener('pointercancel',e=>{end(e);flushQueuedPlayerScene()});let mapWheelUndoTimer=null,mapWheelSaveTimer=null,mapWheelUndoPending=false;canvas.addEventListener('wheel',e=>{e.preventDefault();if(isGM()&&state.mapImage&&!state.mapLocked){if(!mapWheelUndoPending){recordUndo();mapWheelUndoPending=true}const factor=e.deltaY>0?.9:1.1,oldWidth=Math.max(1,Number(state.mapWidth)||24),oldHeight=Math.max(1,Number(state.mapHeight)||24),nextWidth=Math.max(1,Math.min(500,Math.round(oldWidth*factor*10)/10)),nextHeight=Math.max(1,Math.min(500,Math.round(oldHeight*factor*10)/10));state.mapWidth=nextWidth;state.mapHeight=nextHeight;if(mapWidthEl)mapWidthEl.value=String(nextWidth);if(mapHeightEl)mapHeightEl.value=String(nextHeight);if(mapStatusEl)mapStatusEl.textContent='Map zoom: '+nextWidth+' × '+nextHeight+' squares. Scroll while unlocked to resize; lock the map to return to camera zoom.';render();clearTimeout(mapWheelUndoTimer);mapWheelUndoTimer=setTimeout(()=>{mapWheelUndoPending=false},350);clearTimeout(mapWheelSaveTimer);mapWheelSaveTimer=setTimeout(()=>saveSceneToBrowser(),250);return}const previousZoom=state.camera.zoom,nextZoom=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,previousZoom*(e.deltaY>0?.9:1.11)));if(state.view2d&&previousZoom>0){const ratio=nextZoom/previousZoom;state.camera.panX*=ratio;state.camera.panY*=ratio;}state.camera.zoom=nextZoom;saveSceneToBrowser()},{passive:false});
function addRuneMark(assassinId,targetId){if(!isGM())return;const assassin=state.tokens.find(t=>t.id===assassinId),target=state.tokens.find(t=>t.id===targetId);if(!assassin||assassin.className!=='Assassin'||!target||target.id===assassin.id)return;const marks=normalizeRuneMarks(target.runeMarks),existing=marks.find(m=>m.assassinId===assassinId),targets=runeMarksForAssassin(assassinId);if(existing&&existing.count>=3){sceneSaveStatus.textContent='This target already has the maximum of 3 Rune Marks from '+assassin.name+'.';return}if(!existing&&targets.length>=3){sceneSaveStatus.textContent=assassin.name+' has already marked 3 different targets.';return}recordUndo();const next=marks.filter(m=>m.assassinId!==assassinId);next.push({assassinId,count:(existing?.count||0)+1});target.runeMarks=next;saveSceneToBrowser();updateClassResourcePanel(assassin);if(sceneSaveStatus)sceneSaveStatus.textContent='Added Rune Mark to '+target.name+' ('+((existing?.count||0)+1)+' / 3).'}
function removeRuneMark(assassinId,targetId){if(!isGM())return;const assassin=state.tokens.find(t=>t.id===assassinId),target=state.tokens.find(t=>t.id===targetId);if(!assassin||assassin.className!=='Assassin'||!target)return;const marks=normalizeRuneMarks(target.runeMarks),existing=marks.find(m=>m.assassinId===assassinId);if(!existing)return;recordUndo();target.runeMarks=marks.map(m=>m.assassinId===assassinId?{...m,count:m.count-1}:m).filter(m=>m.count>0);saveSceneToBrowser();updateClassResourcePanel(assassin);if(sceneSaveStatus)sceneSaveStatus.textContent='Removed one Rune Mark from '+target.name+'.'}
function normalizeClassResource(className,data){const names=CLASS_RESOURCE_DEFS[className]||[];const values={};names.forEach(name=>{const v=data&&data[name]||{};values[name]={current:Math.max(0,Math.floor(Number(v.current)||0)),maximum:Math.max(0,Math.floor(Number(v.maximum)||0))}});return values}
function updateClassResourcePanel(token){const name=document.getElementById('class-resource-token-name'),body=document.getElementById('class-resource-fields');if(!name||!body)return;body.replaceChildren();if(!token||!canSeeToken(token)){name.textContent='No token selected';body.textContent='Select a token to view its class resource.';return}name.textContent=token.name||'Unnamed Token';const cls=token.className;if(!CLASS_RESOURCE_DEFS[cls]){body.textContent='No class assigned — no class resource to track.';return}if(cls==='Assassin'){const targets=runeMarksForAssassin(token.id),summary=document.createElement('strong');summary.textContent='Targets Marked: '+targets.length+' / 3';body.appendChild(summary);const toggle=document.createElement('button');toggle.type='button';toggle.className='rune-mark-toggle';toggle.textContent=runeMarkModeAssassinId===token.id?'Cancel Mark Target':'＋ Mark Target';toggle.disabled=!isGM();toggle.setAttribute('aria-pressed',String(runeMarkModeAssassinId===token.id));toggle.addEventListener('click',()=>{if(!isGM())return;runeMarkModeAssassinId=runeMarkModeAssassinId===token.id?null:token.id;updateClassResourcePanel(token);if(sceneSaveStatus)sceneSaveStatus.textContent=runeMarkModeAssassinId?'Mark Target mode: click an enemy token. Press Escape to cancel.':'Mark Target mode cancelled.'});body.appendChild(toggle);const list=document.createElement('div');list.className='rune-mark-target-list';if(!targets.length){const empty=document.createElement('small');empty.textContent='No targets marked.';list.appendChild(empty)}targets.forEach(({target,count})=>{const row=document.createElement('div');row.className='rune-mark-target';const label=document.createElement('span');label.textContent=(target.name||'Unnamed Token')+' · '+count+' / 3';const remove=document.createElement('button');remove.type='button';remove.textContent='−';remove.title='Remove one Rune Mark';remove.disabled=!isGM();remove.addEventListener('click',()=>removeRuneMark(token.id,target.id));row.append(label,remove);list.appendChild(row)});body.appendChild(list);const note=document.createElement('small');note.textContent=isGM()?'Mark up to 3 targets, with up to 3 marks on each. Click a target on the map while Mark Target mode is active. Right-click a marked target to remove one mark.':'View only · The GM manages Rune Marks.';body.appendChild(note);return}const values=normalizeClassResource(cls,token.classResource);CLASS_RESOURCE_DEFS[cls].forEach(resource=>{const v=values[resource],row=document.createElement('div');row.className='class-resource-row';const title=document.createElement('strong');title.textContent=resource;const numbers=document.createElement('div');numbers.className='class-resource-values';const current=document.createElement('input');current.type='number';current.min='0';current.max='9999';current.step='1';current.value=String(v.current);current.setAttribute('aria-label',resource+' current');const slash=document.createElement('span');slash.textContent='/';const maximum=document.createElement('input');maximum.type='number';maximum.min='0';maximum.max='9999';maximum.step='1';maximum.value=String(v.maximum);maximum.setAttribute('aria-label',resource+' maximum');current.disabled=maximum.disabled=!isGM();current.addEventListener('change',()=>saveClassResourceValue(token,resource,current,maximum));maximum.addEventListener('change',()=>saveClassResourceValue(token,resource,current,maximum));numbers.append(current,slash,maximum);row.append(title,numbers);body.appendChild(row)});if(!isGM()){const note=document.createElement('small');note.textContent='View only · The GM manages resource values.';body.appendChild(note)}}
function saveClassResourceValue(token,resource,current,maximum){if(!isGM()||!token||!state.tokens.includes(token))return;const max=Math.max(0,Math.min(9999,Math.floor(Number(maximum.value)||0))),cur=Math.max(0,Math.min(9999,Math.floor(Number(current.value)||0)));if(Number(current.value)!==cur)current.value=String(cur);if(Number(maximum.value)!==max)maximum.value=String(max);if(token.classResource?.[resource]?.current===cur&&token.classResource?.[resource]?.maximum===max)return;recordUndo();token.classResource=normalizeClassResource(token.className,{...(token.classResource||{}),[resource]:{current:cur,maximum:max}});saveSceneToBrowser();if(sceneSaveStatus)sceneSaveStatus.textContent=resource+' updated for '+token.name+'.'}
function editorData(){const assignment=tokenAssignmentEl.value;return{heightPx:Math.max(16,Math.min(2000,Number(document.getElementById('token-height-px')?.value)||Math.max(16,(Number(tokenFootprintEl.value)||1)*CELL_PX))),name:tokenNameEl.value.trim()||'New Token',glyph:tokenGlyphEl.value.trim().slice(0,2)||'•',color:tokenColorEl.value,footprint:Math.max(1,Math.min(8,Number(tokenFootprintEl.value)||1)),visibility:tokenVisibilityEl?.value==='gm'?'gm':'players',assignment,players:assignment==='specific'?tokenPlayersEl.value.split(',').map(x=>x.trim()).filter(Boolean):[],className:tokenClassEl?.value||'',classResource:normalizeClassResource(tokenClassEl?.value||'',state.tokens.find(t=>t.id===state.selected)?.classResource)}}
async function prepareTokenImage(file){if(!file||!/^image\/(png|webp|jpeg)$/.test(file.type))throw new Error('Choose a PNG, WebP, or JPG image.');if(file.size>12*1024*1024)throw new Error('Image is too large. Choose a file under 12 MB.');const source=await createImageBitmap(file);try{const side=1024,scale=Math.min(1,side/Math.max(source.width,source.height)),w=Math.max(1,Math.round(source.width*scale)),h=Math.max(1,Math.round(source.height*scale)),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const c=canvas.getContext('2d');c.drawImage(source,0,0,w,h);const toBlob=type=>new Promise(resolve=>canvas.toBlob(resolve,type,.86));let blob=await toBlob('image/webp');if(!blob)blob=await toBlob('image/png');if(!blob)throw new Error('The browser could not optimize this image.');if(blob.size>675000)throw new Error('The optimized image is still too large. Try a simpler or smaller image.');const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error||new Error('Could not read optimized image.'));reader.readAsDataURL(blob)});return data}finally{source.close?.()}}
assetImageFileEl?.addEventListener('change',async()=>{const file=assetImageFileEl.files?.[0];if(!file)return;if(!isGM()){assetStatusEl.textContent='Only the GM can add assets.';assetImageFileEl.value='';return}try{if(!/^image\/(png|webp|jpeg)$/.test(file.type))throw new Error('Choose a PNG, WebP, or JPG image.');if(file.size>12*1024*1024)throw new Error('Choose an image under 12 MB.');const source=await createImageBitmap(file);try{const side=1024,scale=Math.min(1,side/Math.max(source.width,source.height)),w=Math.max(1,Math.round(source.width*scale)),h=Math.max(1,Math.round(source.height*scale)),c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(source,0,0,w,h);let data=c.toDataURL('image/webp',.9);if(!data.startsWith('data:image/webp'))data=c.toDataURL('image/png');if(data.length>900000)throw new Error('Optimized image exceeds 900 KB. Try a smaller or simpler image.');state.pendingAssetImage=data;assetStatusEl.textContent='Image ready. Set its footprint, rotation, and height, then add it.'}finally{source.close?.()}}catch(err){assetStatusEl.textContent=err.message||'Could not load image.';state.pendingAssetImage=null}finally{assetImageFileEl.value=''}});
assetSwapImageFileEl?.addEventListener('change',async()=>{const file=assetSwapImageFileEl.files?.[0];if(!file)return;if(!isGM()){assetStatusEl.textContent='Only the GM can swap asset images.';assetSwapImageFileEl.value='';return}const a=state.assets.find(item=>item.id===state.selectedAsset);if(!a){assetStatusEl.textContent='Select a placed prop or asset on the battlefield first.';assetSwapImageFileEl.value='';return}if(a.locked){assetStatusEl.textContent='This asset is locked. Unlock it before changing its image.';assetSwapImageFileEl.value='';return}try{const data=await prepareTokenImage(file);recordUndo();a.image=data;syncAssetEditor(a);assetStatusEl.textContent='Image swapped for '+(a.name||'asset')+'. Position, size, altitude, rotation, and other settings were preserved.';saveSceneToBrowser()}catch(err){assetStatusEl.textContent=err.message||'Could not read that image.'}finally{assetSwapImageFileEl.value=''}});
tokenImageFileEl?.addEventListener('change',async()=>{const file=tokenImageFileEl.files?.[0],t=state.tokens.find(x=>x.id===state.selected);if(!file)return;if(!isGM()){tokenImageStatusEl.textContent='Only the GM can change token images.';tokenImageFileEl.value='';return}if(!t){tokenImageStatusEl.textContent='Select a token first.';tokenImageFileEl.value='';return}if(t.locked){tokenImageStatusEl.textContent='Unlock this token before changing its image.';tokenImageFileEl.value='';return}try{const data=await prepareTokenImage(file);recordUndo();t.image=data;tokenImageCache.delete(data);tokenImageStatusEl.textContent='Token image swapped. Position, size, altitude, access, and other settings were preserved. Choose another image anytime to swap again.';list();select(t.id);saveSceneToBrowser()}catch(err){tokenImageStatusEl.textContent=err.message||'Could not read that image.'}finally{tokenImageFileEl.value=''}});

document.querySelectorAll('[data-image-slot-action]').forEach(button=>button.addEventListener('click',()=>{
 const kind=button.dataset.imageSlotAction,slot=Number(button.dataset.imageSlot),isToken=kind.startsWith('token-');
 if(!isGM()){(isToken?tokenImageStatusEl:assetStatusEl).textContent='Only the GM can save or use image slots.';return}
 if(isToken){
  const t=state.tokens.find(x=>x.id===state.selected);
  if(!t){tokenImageStatusEl.textContent='Select a token first.';return}
  if(t.locked){tokenImageStatusEl.textContent='Unlock this token before changing its saved images.';return}
  if(kind==='token-save'){
   if(!t.image){tokenImageStatusEl.textContent='Swap in an image first, then save it to a slot.';return}
   recordUndo();t.imageSlots=Array.isArray(t.imageSlots)?t.imageSlots.slice(0,3):[];t.imageSlots[slot]=t.image;tokenImageStatusEl.textContent='Current token image saved to slot '+(slot+1)+'.';saveSceneToBrowser();return;
  }
  const saved=t.imageSlots?.[slot];if(!saved){tokenImageStatusEl.textContent='Token image slot '+(slot+1)+' is empty. Swap in an image and save it to this slot first.';return}
  recordUndo();t.image=saved;tokenImageCache.delete(saved);tokenImageStatusEl.textContent='Switched to saved token image '+(slot+1)+'.';list();select(t.id);saveSceneToBrowser();return;
 }
 const a=state.assets.find(x=>x.id===state.selectedAsset);
 if(!a){assetStatusEl.textContent='Select a placed prop or asset first.';return}
 if(kind==='asset-save'){
  if(a.locked){assetStatusEl.textContent='This asset is locked. Unlock it before changing saved images.';return}if(!a.image){assetStatusEl.textContent='Swap in an image first, then save it to a slot.';return}
  recordUndo();a.imageSlots=Array.isArray(a.imageSlots)?a.imageSlots.slice(0,3):[];a.imageSlots[slot]=a.image;assetStatusEl.textContent='Current prop/asset image saved to slot '+(slot+1)+'.';saveSceneToBrowser();return;
 }
 if(a.locked){assetStatusEl.textContent='This asset is locked. Unlock it before changing saved images.';return}const saved=a.imageSlots?.[slot];if(!saved){assetStatusEl.textContent='Prop/asset image slot '+(slot+1)+' is empty. Swap in an image and save it to this slot first.';return}
 recordUndo();a.image=saved;syncAssetEditor(a);assetStatusEl.textContent='Switched to saved prop/asset image '+(slot+1)+'. Position, size, altitude, and other settings were preserved.';saveSceneToBrowser();
}));
document.querySelector('[data-action="token-image-remove"]')?.addEventListener('click',()=>{const t=state.tokens.find(x=>x.id===state.selected);if(!t||!isGM()||t.locked)return;if(!t.image){tokenImageStatusEl.textContent='This token has no custom image.';return}recordUndo();delete t.image;list();select(t.id);saveSceneToBrowser();tokenImageStatusEl.textContent='Custom image removed.'});
const gridColorEl=document.getElementById('grid-color'),gridOpacityEl=document.getElementById('grid-opacity'),gridOpacityValue=document.getElementById('grid-opacity-value');
function updateGridDisplay(save=true){if(!isGM())return;state.gridColor=/^#[0-9a-f]{6}$/i.test(gridColorEl?.value||'')?gridColorEl.value:'#8fd3ff';state.gridOpacity=Math.max(0,Math.min(1,(Number(gridOpacityEl?.value)||0)/100));if(gridOpacityValue)gridOpacityValue.textContent=Math.round(state.gridOpacity*100)+'%';if(save)saveSceneToBrowser()}
gridColorEl?.addEventListener('change',()=>{recordUndo();updateGridDisplay(true)});
let gridOpacityUndoRecorded=false;
gridOpacityEl?.addEventListener('input',()=>{if(!gridOpacityUndoRecorded){recordUndo();gridOpacityUndoRecorded=true}updateGridDisplay(false)});
gridOpacityEl?.addEventListener('change',()=>{if(!gridOpacityUndoRecorded)recordUndo();gridOpacityUndoRecorded=false;updateGridDisplay(true)});
const mapLockButton=document.querySelector('[data-action="map-lock-toggle"]');
mapLockButton?.addEventListener('click',()=>{if(!isGM()||!state.mapImage)return;recordUndo();state.mapLocked=!state.mapLocked;mapLockButton.textContent=state.mapLocked?'Unlock Map':'Lock Map';mapLockButton.setAttribute('aria-pressed',String(state.mapLocked));if(mapStatusEl)mapStatusEl.textContent=state.mapLocked?'Map locked. It cannot be moved.':'Map unlocked. Drag the map on an empty area to reposition it.';saveSceneToBrowser()});
const mapFileEl=document.getElementById('map-image-file'),mapWidthEl=document.getElementById('map-width'),mapHeightEl=document.getElementById('map-height'),mapXEl=document.getElementById('map-x'),mapYEl=document.getElementById('map-y'),mapOpacityEl=document.getElementById('map-opacity'),mapStatusEl=document.getElementById('map-status');
mapFileEl?.addEventListener('change',async()=>{const file=mapFileEl.files?.[0];if(!file)return;if(!isGM()){mapStatusEl.textContent='Only the GM can set the battlefield map.';mapFileEl.value='';return}try{if(!/^image\/(png|webp|jpeg)$/.test(file.type))throw new Error('Choose a PNG, WebP, or JPG image.');if(file.size>20*1024*1024)throw new Error('Choose a map image under 20 MB.');const source=await createImageBitmap(file);try{const side=2048,scale=Math.min(1,side/Math.max(source.width,source.height)),w=Math.max(1,Math.round(source.width*scale)),h=Math.max(1,Math.round(source.height*scale)),c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(source,0,0,w,h);let data=c.toDataURL('image/webp',.86);if(data.length>1800000)data=c.toDataURL('image/jpeg',.78);if(data.length>1800000)throw new Error('Map image is still too large after optimization. Try a smaller image.');recordUndo();state.mapImage=data;mapWidthEl.value=String(state.mapWidth||24);mapHeightEl.value=String(state.mapHeight||24);mapXEl.value=String(state.mapX||0);mapYEl.value=String(state.mapY||0);mapOpacityEl.value=String(Math.round((state.mapOpacity??.78)*100));mapStatusEl.textContent='Map image loaded ('+w+' × '+h+' px). Set its grid dimensions, then click Apply Map Settings.';saveSceneToBrowser()}finally{source.close?.()}}catch(err){mapStatusEl.textContent=err.message||'Could not load map image.'}finally{mapFileEl.value=''}});
document.querySelector('[data-action="map-apply"]')?.addEventListener('click',()=>{if(!isGM())return;recordUndo();state.mapWidth=Math.max(1,Math.min(500,Number(mapWidthEl.value)||24));state.mapHeight=Math.max(1,Math.min(500,Number(mapHeightEl.value)||24));state.mapX=Math.max(-200,Math.min(200,Number(mapXEl.value)||0));state.mapY=Math.max(-200,Math.min(200,Number(mapYEl.value)||0));state.mapOpacity=Math.max(.05,Math.min(1,(Number(mapOpacityEl.value)||78)/100));if(!state.mapImage){mapStatusEl.textContent='Upload a map image first.';return}mapStatusEl.textContent='Map applied: '+state.mapWidth+' × '+state.mapHeight+' squares.';saveSceneToBrowser()});
document.querySelector('[data-action="map-clear"]')?.addEventListener('click',()=>{if(!isGM())return;recordUndo();state.mapImage=null;mapStatusEl.textContent='Map image removed.';saveSceneToBrowser()});
const assetEditControls=[assetNameEl,assetWidthEl,assetDepthEl,assetRotationEl,assetAltitudeEl,assetVisibilityEl,tokenVisibilityEl,document.getElementById('asset-size-mode'),document.getElementById('asset-display-style'),document.getElementById('asset-image-width-px'),document.getElementById('asset-image-height-px'),document.getElementById('asset-height-px')].filter(Boolean);
// Asset editor values remain pending until the GM clicks Update Asset.
tokenAssignmentEl.onchange=()=>{tokenPlayersEl.hidden=tokenAssignmentEl.value!=='specific'};
const undoHistory=[],redoHistory=[];
const MAX_UNDO_ACTIONS=20;
function captureUndoSnapshot(){
 try{
  // sceneSnapshot already builds fresh records for mutable scene entities.
  // Keep large immutable image data URLs as shared string references instead
  // of JSON-serializing and duplicating every image for every Undo step.
  const snapshot=sceneSnapshot();
  snapshot.terrain=JSON.parse(JSON.stringify(state.terrain||{}));
  return snapshot;
 }catch(e){return null}
 }
function recordUndo(snapshot=captureUndoSnapshot()){if(!snapshot)return;undoHistory.push(snapshot);redoHistory.length=0;if(undoHistory.length>MAX_UNDO_ACTIONS)undoHistory.shift()}
function undoLastAction(){if(!undoHistory.length){if(sceneSaveStatus)sceneSaveStatus.textContent='Nothing to undo.';return}const previous=undoHistory.pop(),current=captureUndoSnapshot();if(current)redoHistory.push(current);try{applyScene(previous);saveSceneToBrowser();if(sceneSaveStatus)sceneSaveStatus.textContent='Undo complete · '+undoHistory.length+' undo action'+(undoHistory.length===1?'':'s')+' remaining.'}catch(e){if(current)redoHistory.pop();undoHistory.push(previous);if(sceneSaveStatus)sceneSaveStatus.textContent='Undo failed: '+(e.message||'could not restore previous state')}}
function redoLastAction(){if(!redoHistory.length){if(sceneSaveStatus)sceneSaveStatus.textContent='Nothing to redo.';return}const next=redoHistory.pop(),current=captureUndoSnapshot();if(current)undoHistory.push(current);try{applyScene(next);saveSceneToBrowser();if(sceneSaveStatus)sceneSaveStatus.textContent='Redo complete · '+redoHistory.length+' redo action'+(redoHistory.length===1?'':'s')+' remaining.'}catch(e){if(current)undoHistory.pop();redoHistory.push(next);if(sceneSaveStatus)sceneSaveStatus.textContent='Redo failed: '+(e.message||'could not restore next state')}}
for(const b of document.querySelectorAll('button'))b.onclick=()=>{const a=b.dataset.action,t=state.tokens.find(x=>x.id===state.selected);if(!isGM()&&['token-add','token-update','token-delete','token-lock','asset-lock'].includes(a))return;if((a==='up'||a==='down')&&t&&!canControlToken(t))return;if(['token-update','token-delete'].includes(a)&&t?.locked)return;if(a==='asset-update'&&state.assets.find(x=>x.id===state.selectedAsset)?.locked){assetStatusEl.textContent='This asset is locked. Unlock it before editing.';return}if(a==='asset-add'&&isGM()){if(!state.pendingAssetImage){assetStatusEl.textContent='Choose an image file first.';return}const asset={id:'asset-'+Date.now(),name:assetNameEl.value.trim()||'Prop',image:state.pendingAssetImage,imageZoom:1,imageX:0,imageY:0,x:0,y:0,z:Math.max(0,Math.min(MAX_ALTITUDE,Number(assetAltitudeEl.value)||0)),width:Math.max(1,Math.min(12,Number(assetWidthEl.value)||1)),depth:Math.max(1,Math.min(12,Number(assetDepthEl.value)||1)),sizeMode:document.getElementById('asset-size-mode')?.value||'grid',displayStyle:document.getElementById('asset-display-style')?.value||'standee',visibility:assetVisibilityEl?.value==='gm'?'gm':'players',imageWidthPx:Math.max(16,Math.min(1200,Number(document.getElementById('asset-image-width-px')?.value)||180)),imageHeightPx:Math.max(16,Math.min(1200,Number(document.getElementById('asset-image-height-px')?.value)||180)),heightPx:Math.max(16,Math.min(2000,Number(document.getElementById('asset-height-px')?.value)||240)),rotation:Number(assetRotationEl.value)||0};beginLibraryPlacement('asset',asset,asset.name);assetStatusEl.textContent='Move the asset preview over the map and left-click to place it. Press Esc or right-click to cancel.';return}if(a==='asset-update'&&isGM()){const asset=state.assets.find(x=>x.id===state.selectedAsset);if(!asset){assetStatusEl.textContent='Select an asset on the battlefield first.';return}recordUndo();updateSelectedAssetFromEditor();render();return}if(a==='asset-delete'&&isGM()){const i=state.assets.findIndex(x=>x.id===state.selectedAsset);if(i>=0&&state.assets[i].locked){assetStatusEl.textContent='This asset is locked. Unlock it before deleting.';return}if(i>=0){recordUndo();const removed=state.assets[i];state.assets.splice(i,1);state.attachments=state.attachments.filter(e=>e.a!==objectKey('asset',removed.id)&&e.b!==objectKey('asset',removed.id));state.selectedAsset=null;refreshAttachmentControls();assetStatusEl.textContent='Selected asset removed.';saveSceneToBrowser()}else assetStatusEl.textContent='Select an asset on the battlefield first.';return}if(a==='token-add'){const d=editorData(),n={id:'token-'+Date.now(),name:d.name,x:0,y:0,z:0,glyph:d.glyph,color:d.color,footprint:d.footprint,heightPx:d.heightPx,visibility:d.visibility,assignment:d.assignment,players:d.players,className:d.className,classResource:normalizeClassResource(d.className,{})};beginLibraryPlacement('token',n,n.name);if(tokenImageStatusEl)tokenImageStatusEl.textContent='Move the token preview over the map and left-click to place it. Press Esc or right-click to cancel.';return}if(a==='token-update'&&t&&isGM()){recordUndo();const wasAssassin=t.className==='Assassin';Object.assign(t,editorData());if(wasAssassin&&t.className!=='Assassin'){state.tokens.forEach(target=>{target.runeMarks=normalizeRuneMarks(target.runeMarks).filter(m=>m.assassinId!==t.id)});if(runeMarkModeAssassinId===t.id)runeMarkModeAssassinId=null}list();select(t.id);saveSceneToBrowser();return}if(a==='token-delete'&&t&&isGM()){recordUndo();const i=state.tokens.indexOf(t);if(i>=0)state.tokens.splice(i,1);state.tokens.forEach(target=>{target.runeMarks=normalizeRuneMarks(target.runeMarks).filter(m=>m.assassinId!==t.id)});if(runeMarkModeAssassinId===t.id)runeMarkModeAssassinId=null;state.attachments=state.attachments.filter(e=>e.a!==objectKey('token',t.id)&&e.b!==objectKey('token',t.id));state.selected=state.tokens[0]?.id||null;list();saveSceneToBrowser();return}if(a==='token-lock'&&t&&isGM()){toggleObjectLock('token',t.id)}if(a==='asset-lock'&&isGM()&&state.selectedAsset){toggleObjectLock('asset',state.selectedAsset)}if(a==='wall-placement'&&isGM()){state.wallPlacement=!state.wallPlacement;state.wallDraft=null;b.textContent=state.wallPlacement?'Cancel Wall Placement':'Place Wall';b.classList.toggle('active',state.wallPlacement);document.getElementById('wall-status').textContent=state.wallPlacement?'Drag on the battlefield to draw a wall.':'Wall placement cancelled.';return}if(a==='wall-update'&&isGM()){updateWallFromEditor();return}if(a==='wall-lock'&&isGM()&&state.selectedWall){const w=state.walls.find(v=>v.id===state.selectedWall);if(w){recordUndo();w.locked=!w.locked;syncWallEditor(w);saveSceneToBrowser()}return}if(a==='wall-delete'&&isGM()&&state.selectedWall){const i=state.walls.findIndex(v=>v.id===state.selectedWall);if(i>=0&&state.walls[i].locked){document.getElementById('wall-status').textContent='This wall is locked. Unlock it before deleting.';return}if(i>=0){recordUndo();state.walls.splice(i,1);state.selectedWall=null;syncWallEditor(null);saveSceneToBrowser()}return}if(a==='terrain-toggle'&&isGM()){state.terrainMode=!state.terrainMode;b.textContent=state.terrainMode?'Paint Terrain: On':'Paint Terrain: Off';b.classList.toggle('active',state.terrainMode);terrainStatusEl.textContent=state.terrainMode?'Click grid squares to paint.':'Terrain painting paused.'}if(a==='terrain-ramp'&&isGM()){terrainTypeEl.value='ramp';state.terrainMode=true;document.querySelectorAll('[data-action="terrain-toggle"]').forEach(x=>{x.textContent='Paint Terrain: On';x.classList.add('active')});b.classList.add('active');terrainStatusEl.textContent='Ramp mode selected. Set the lower edge elevation and high edge elevation, then click a grid square.'}if(a==='reset')resetCamera();if(a==='2d'){state.view2d=!state.view2d;state.camera.panX=0;state.camera.panY=0;if(!state.view2d){state.camera.targetX=0;state.camera.targetY=0}b.textContent='2D / 3D';b.setAttribute('aria-pressed',String(state.view2d));b.title=state.view2d?'Switch to 3D View':'Switch to 2D Fallback'}if(a==='up'&&t&&t.z<MAX_ALTITUDE&&canControlToken(t)&&!t.locked){recordUndo();changeGroupAltitude('token',t.id,Math.min(MAX_ALTITUDE,t.z+ALTITUDE_STEP));updateAltitudeDisplay(t)}if(a==='down'&&t&&t.z>0&&canControlToken(t)&&!t.locked){recordUndo();changeGroupAltitude('token',t.id,Math.max(0,t.z-ALTITUDE_STEP));updateAltitudeDisplay(t)}if(a==='yaw-left')state.camera.yaw-=.28;if(a==='yaw-right')state.camera.yaw+=.28;if(a==='pitch-up')state.camera.elevation=Math.min(.95,state.camera.elevation+.1);if(a==='pitch-down')state.camera.elevation=Math.max(.38,state.camera.elevation-.1);if(a==='end-turn'){advanceCombatClock('turn');return}if(a==='end-round'){advanceCombatClock('round');return}if(a==='reset-combat-clock'){if(!isGM())return;if(!window.confirm('Reset the combat counter to Round 1 · Turn 0? Active Conditions and their durations will remain unchanged.'))return;recordUndo();state.combatRound=1;state.combatTurn=0;updateTurnCounter();saveSceneToBrowser();if(sceneSaveStatus)sceneSaveStatus.textContent='Combat counter reset to Round 1 · Turn 0. Active Conditions were not changed.';return}list();saveSceneToBrowser()};

const SCENE_STORAGE_KEY='woa-vtt-scene-v1';
const sceneSaveStatus=document.getElementById('scene-save-status');
const sceneImportFile=document.getElementById('scene-import-file');
function sceneSnapshot(){
  return {format:'wings-of-atreia-vtt-scene',version:1,savedAt:new Date().toISOString(),
    combatTracker:{round:Math.max(1,Number(state.combatRound)||1),turn:Math.max(0,Number(state.combatTurn)||0)},
    gridDisplay:{color:/^#[0-9a-f]{6}$/i.test(state.gridColor||'')?state.gridColor:'#8fd3ff',opacity:Math.max(0,Math.min(1,Number(state.gridOpacity??.30)))},
    terrain:state.terrain,
    walls:(state.walls||[]).map(w=>({id:String(w.id),name:String(w.name||"Wall"),x1:Number(w.x1)||0,y1:Number(w.y1)||0,x2:Number(w.x2)||0,y2:Number(w.y2)||0,altitude:Math.max(0,Math.min(MAX_ALTITUDE,Number(w.altitude)||0)),height:Math.max(5,Math.min(120,Number(w.height)||10)),thickness:Math.max(1,Math.min(30,Number(w.thickness)||1)),color:/^#[0-9a-f]{6}$/i.test(w.color||"")?w.color:"#788695",placement:w.placement==="free"?"free":"grid",locked:!!w.locked})),
    map:state.mapImage?{image:state.mapImage,locked:state.mapLocked!==false,width:Math.max(1,Math.min(500,Number(state.mapWidth)||24)),height:Math.max(1,Math.min(500,Number(state.mapHeight)||24)),x:Number(state.mapX)||0,y:Number(state.mapY)||0,opacity:Math.max(.05,Math.min(1,Number(state.mapOpacity)||.78))}:null,
    attachments:state.attachments.map(e=>({a:String(e.a),b:String(e.b)})),objectGroups:(state.objectGroups||[]).map(g=>({id:String(g.id),name:String(g.name||'Group').slice(0,80),members:Array.isArray(g.members)?g.members.map(String):[],hidden:!!g.hidden})),
    gmNotesPins:(state.gmNotesPins||[]).map(p=>({id:String(p.id),x:Number(p.x)||0,y:Number(p.y)||0,note:String(p.note||'').slice(0,5000)})),
    movementIndicator:state.movementIndicator&&['token','asset'].includes(state.movementIndicator.type)?{type:state.movementIndicator.type,...(state.movementIndicator.type==='token'?{tokenId:String(state.movementIndicator.tokenId||'')}:{assetId:String(state.movementIndicator.assetId||'')}),from:{x:Number(state.movementIndicator.from?.x)||0,y:Number(state.movementIndicator.from?.y)||0},to:{x:Number(state.movementIndicator.to?.x)||0,y:Number(state.movementIndicator.to?.y)||0}}:null,
    assets:state.assets.map(a=>({id:String(a.id),name:String(a.name||'Prop'),locked:!!a.locked,hidden:!!a.hidden,image:typeof a.image==='string'&&/^data:image\/(webp|png|jpeg);base64,/.test(a.image)&&a.image.length<=900000?a.image:'',imageSlots:Array.isArray(a.imageSlots)?a.imageSlots.slice(0,3):[],x:Number(a.x)||0,y:Number(a.y)||0,z:Math.max(0,Math.min(MAX_ALTITUDE,Number(a.z)||0)),width:Math.max(1,Math.min(12,Number(a.width)||1)),depth:Math.max(1,Math.min(12,Number(a.depth)||1)),sizeMode:a.sizeMode==='pixel'?'pixel':'grid',displayStyle:a.displayStyle==='flat'?'flat':'standee',visibility:a.visibility==='gm'?'gm':'players',imageWidthPx:Math.max(16,Math.min(1200,Number(a.imageWidthPx)||180)),imageHeightPx:Math.max(16,Math.min(1200,Number(a.imageHeightPx)||180)),heightPx:Math.max(16,Math.min(2000,Number(a.heightPx)||240)),imageZoom:Math.max(1,Math.min(10,Number(a.imageZoom)||1)),imageX:Math.max(-.8,Math.min(.8,Number(a.imageX)||0)),imageY:Math.max(-.8,Math.min(.8,Number(a.imageY)||0)),rotation:Number(a.rotation)||0,hidden:!!a.hidden})).filter(a=>a.image),
    tokens:state.tokens.map(t=>({id:String(t.id),name:String(t.name||'Token'),visibility:t.visibility==='gm'?'gm':'players',x:Number.isFinite(t._dragX)?t._dragX:Number(t.x)||0,y:Number.isFinite(t._dragY)?t._dragY:Number(t.y)||0,z:Math.max(0,Math.min(MAX_ALTITUDE,Number(t.z)||0)),glyph:String(t.glyph||'•'),color:/^#[0-9a-f]{6}$/i.test(t.color||'')?t.color:'#65d6a1',footprint:Math.max(1,Math.min(8,Math.round(Number(t.footprint)||1))),heightPx:Math.max(16,Math.min(2000,Number(t.heightPx)||Math.max(16,(Number(t.footprint)||1)*CELL_PX))),assignment:['gm','specific','all','unassigned'].includes(t.assignment)?t.assignment:'all',players:Array.isArray(t.players)?t.players.map(String):[],...(typeof t.image==='string'&&/^data:image\/(webp|png|jpeg);base64,/.test(t.image)&&t.image.length<=900000?{image:t.image}:{}),...(t.image?{imageZoom:Math.max(1,Math.min(10,Number(t.imageZoom)||1)),imageX:Math.max(-.8,Math.min(.8,Number(t.imageX)||0)),imageY:Math.max(-.8,Math.min(.8,Number(t.imageY)||0))}:{}),imageSlots:Array.isArray(t.imageSlots)?t.imageSlots.slice(0,3):[],locked:!!t.locked,hidden:!!t.hidden,conditions:normalizeTokenConditions(t.conditions),className:CLASS_RESOURCE_DEFS[t.className]?t.className:'',classResource:normalizeClassResource(t.className,t.classResource),runeMarks:normalizeRuneMarks(t.runeMarks),playerInfo:t.playerInfo&&typeof t.playerInfo==='object'?{name:t.playerInfo.name!==false,hp:!!t.playerInfo.hp,ac:!!t.playerInfo.ac,conditions:!!t.playerInfo.conditions,classResource:!!t.playerInfo.classResource,altitude:!!t.playerInfo.altitude}:{name:true,hp:false,ac:false,conditions:false,classResource:false,altitude:false},status:(()=>{const v=t.status&&typeof t.status==='object'?t.status:{};return{hpCurrent:Math.max(0,Math.min(9999,Math.floor(Number(v.hpCurrent)||0))),hpMaximum:Math.max(0,Math.min(9999,Math.floor(Number(v.hpMaximum)||0))),tempHp:Math.max(0,Math.min(9999,Math.floor(Number(v.tempHp)||0))),ac:Math.max(0,Math.min(999,Math.floor(Number.isFinite(Number(v.ac))?Number(v.ac):10))),lifeStatus:['Alive','Unconscious','Dead'].includes(v.lifeStatus)?v.lifeStatus:'Alive'}})()})),
    selected:state.selected,camera:{yaw:state.camera.yaw,elevation:state.camera.elevation,distance:state.camera.distance,zoom:state.camera.zoom,targetX:state.camera.targetX,targetY:state.camera.targetY,targetZ:state.camera.targetZ,panX:state.camera.panX,panY:state.camera.panY},
    view2d:state.view2d,identity:{role:sessionRoleEl.value,playerName:sessionPlayerNameEl.value}
  };
}
function validateScene(data){
  if(!data||data.format!=='wings-of-atreia-vtt-scene'||data.version!==1||!Array.isArray(data.tokens)||data.tokens.length>500)throw new Error('This is not a supported Wings of Atreia scene file.');
  const ids=new Set();
  const tokens=data.tokens.map((t,i)=>{
    if(!t||typeof t!=='object')throw new Error('Scene contains an invalid token.');
    const id=String(t.id||'token-'+i);if(ids.has(id))throw new Error('Scene contains duplicate token IDs.');ids.add(id);
    const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
    const assignment=['gm','specific','all','unassigned'].includes(t.assignment)?t.assignment:'all';
    const visibility=t.visibility==='gm'?'gm':'players';
    return{id,name:String(t.name||'Token').slice(0,120),imageSlots:Array.isArray(t.imageSlots)?t.imageSlots.slice(0,3).filter(v=>typeof v==='string'&&/^data:image\/(webp|png|jpeg);base64,/.test(v)&&v.length<=900000):[],x:num(t.x),y:num(t.y),z:Math.max(0,Math.min(MAX_ALTITUDE,num(t.z))),glyph:String(t.glyph||'•').slice(0,2),color:/^#[0-9a-f]{6}$/i.test(t.color||'')?t.color:'#65d6a1',footprint:Math.max(1,Math.min(8,Math.round(num(t.footprint,1)))),heightPx:Math.max(16,Math.min(2000,num(t.heightPx,Math.max(16,num(t.footprint,1)*CELL_PX)))),visibility,assignment,players:Array.isArray(t.players)?t.players.map(p=>String(p).slice(0,80)).slice(0,50):[],...(typeof t.image==='string'&&/^data:image\/(webp|png|jpeg);base64,/.test(t.image)&&t.image.length<=900000?{image:t.image}:{}),...(typeof t.image==='string'&&/^data:image\/(webp|png|jpeg);base64,/.test(t.image)?{imageZoom:Math.max(1,Math.min(10,num(t.imageZoom,1))),imageX:Math.max(-.8,Math.min(.8,num(t.imageX,0))),imageY:Math.max(-.8,Math.min(.8,num(t.imageY,0)))}:{}),locked:!!t.locked,hidden:!!t.hidden,conditions:normalizeTokenConditions(t.conditions),className:CLASS_RESOURCE_DEFS[t.className]?t.className:'',classResource:normalizeClassResource(t.className,t.classResource),runeMarks:normalizeRuneMarks(t.runeMarks),playerInfo:t.playerInfo&&typeof t.playerInfo==='object'?{name:t.playerInfo.name!==false,hp:!!t.playerInfo.hp,ac:!!t.playerInfo.ac,conditions:!!t.playerInfo.conditions,classResource:!!t.playerInfo.classResource,altitude:!!t.playerInfo.altitude}:{name:true,hp:false,ac:false,conditions:false,classResource:false,altitude:false},status:(()=>{const v=t.status&&typeof t.status==='object'?t.status:{};return{hpCurrent:Math.max(0,Math.min(9999,Math.floor(num(v.hpCurrent)))),hpMaximum:Math.max(0,Math.min(9999,Math.floor(num(v.hpMaximum)))),tempHp:Math.max(0,Math.min(9999,Math.floor(num(v.tempHp)))),ac:Math.max(0,Math.min(999,Math.floor(num(v.ac,10)))),lifeStatus:['Alive','Unconscious','Dead'].includes(v.lifeStatus)?v.lifeStatus:'Alive'}})()};
  });
  const assassinIds=new Set(tokens.filter(t=>t.className==='Assassin').map(t=>t.id));tokens.forEach(t=>{t.runeMarks=normalizeRuneMarks(t.runeMarks).filter(m=>assassinIds.has(m.assassinId)&&m.assassinId!==t.id)});
  const c=data.camera&&typeof data.camera==='object'?data.camera:{};
  const num=(v,d)=>Number.isFinite(Number(v))?Number(v):d;
  const camera={yaw:num(c.yaw,-.65),elevation:Math.max(.38,Math.min(.95,num(c.elevation,.68))),distance:Math.max(5,Math.min(500,num(c.distance,60))),zoom:Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,num(c.zoom,1))),targetX:num(c.targetX,0),targetY:num(c.targetY,0),targetZ:num(c.targetZ,0),panX:num(c.panX,0),panY:num(c.panY,0)};
  const terrain={};if(data.terrain&&typeof data.terrain==='object')Object.entries(data.terrain).slice(0,5000).forEach(([key,t])=>{if(!/^-?\d+,-?\d+$/.test(key)||!t)return;const type=['ground','hill','mountain','cliff','canopy','platform','ramp'].includes(t.type)?t.type:'hill',direction=['north','south','east','west'].includes(t.direction)?t.direction:'north',height=Math.max(0,Math.min(120,Math.round((Number(t.height)||0)/5)*5));if(height)terrain[key]={type,height,direction,...(type==='ramp'?{startHeight:Math.max(0,Math.min(height,Math.round((Number(t.startHeight)||0)/5)*5))}:{})}});
  const walls=Array.isArray(data.walls)?data.walls.slice(0,1000).filter(w=>w&&typeof w==="object").map((w,i)=>({id:String(w.id||"wall-"+i).slice(0,100),name:String(w.name||"Wall").slice(0,80),x1:num(w.x1),y1:num(w.y1),x2:num(w.x2),y2:num(w.y2),altitude:Math.max(0,Math.min(MAX_ALTITUDE,Math.round(num(w.altitude)/5)*5)),height:Math.max(5,Math.min(120,Math.round(num(w.height,10)/5)*5)),thickness:Math.max(1,Math.min(30,num(w.thickness,1))),color:/^#[0-9a-f]{6}$/i.test(w.color||"")?w.color:"#788695",placement:w.placement==="free"?"free":"grid",locked:!!w.locked})) : [];
  const assets=Array.isArray(data.assets)?data.assets.slice(0,300).filter(a=>a&&typeof a.image==='string'&&/^data:image\/(webp|png|jpeg);base64,/.test(a.image)&&a.image.length<=900000).map((a,i)=>({id:String(a.id||'asset-'+i),name:String(a.name||'Prop').slice(0,120),image:a.image,imageSlots:Array.isArray(a.imageSlots)?a.imageSlots.slice(0,3).filter(v=>typeof v==='string'&&/^data:image\/(webp|png|jpeg);base64,/.test(v)&&v.length<=900000):[],x:num(a.x),y:num(a.y),z:Math.max(0,Math.min(MAX_ALTITUDE,num(a.z))),width:Math.max(1,Math.min(12,num(a.width,1))),depth:Math.max(1,Math.min(12,num(a.depth,1))),sizeMode:a.sizeMode==='pixel'?'pixel':'grid',displayStyle:a.displayStyle==='flat'?'flat':'standee',visibility:a.visibility==='gm'?'gm':'players',imageWidthPx:Math.max(16,Math.min(1200,num(a.imageWidthPx,180))),imageHeightPx:Math.max(16,Math.min(1200,num(a.imageHeightPx,180))),heightPx:Math.max(16,Math.min(2000,num(a.heightPx,240))),imageZoom:Math.max(1,Math.min(10,num(a.imageZoom,1))),imageX:Math.max(-.8,Math.min(.8,num(a.imageX))),imageY:Math.max(-.8,Math.min(.8,num(a.imageY))),rotation:num(a.rotation),locked:!!a.locked,hidden:!!a.hidden})):[];
  const map=data.map&&typeof data.map==='object'&&typeof data.map.image==='string'&&/^data:image\/(webp|png|jpeg);base64,/.test(data.map.image)&&data.map.image.length<=1800000?{image:data.map.image,locked:data.map.locked!==false,width:Math.max(1,Math.min(500,num(data.map.width,24))),height:Math.max(1,Math.min(500,num(data.map.height,24))),x:num(data.map.x),y:num(data.map.y),opacity:Math.max(.05,Math.min(1,num(data.map.opacity,.78)))}:null;
  const validKeys=new Set([...tokens.map(t=>objectKey('token',t.id)),...assets.map(a=>objectKey('asset',a.id))]);const edgeSet=new Set();const attachments=Array.isArray(data.attachments)?data.attachments.slice(0,1000).filter(e=>e&&validKeys.has(e.a)&&validKeys.has(e.b)&&e.a!==e.b).filter(e=>{const k=[e.a,e.b].sort().join('|');if(edgeSet.has(k))return false;edgeSet.add(k);return true}).map(e=>({a:e.a,b:e.b})):[];
  const objectGroups=Array.isArray(data.objectGroups)?data.objectGroups.slice(0,200).filter(g=>g&&typeof g==='object').map((g,i)=>({id:String(g.id||'group-'+i).slice(0,100),name:String(g.name||'Group').slice(0,80),members:Array.isArray(g.members)?[...new Set(g.members.filter(k=>typeof k==='string'&&validKeys.has(k)))].slice(0,500):[],hidden:!!g.hidden})).filter(g=>g.members.length):[];
  const gmNotesPins=Array.isArray(data.gmNotesPins)?data.gmNotesPins.slice(0,500).filter(p=>p&&typeof p==='object').map((p,i)=>({id:String(p.id||'gm-note-'+i).slice(0,100),x:num(p.x),y:num(p.y),note:String(p.note||'').slice(0,5000)})):[];
  const movementRaw=data.movementIndicator&&typeof data.movementIndicator==='object'?data.movementIndicator:null;const movementIndicator=movementRaw&&movementRaw.type==='token'&&tokens.some(t=>t.id===String(movementRaw.tokenId))?{type:'token',tokenId:String(movementRaw.tokenId),from:{x:num(movementRaw.from?.x),y:num(movementRaw.from?.y)},to:{x:num(movementRaw.to?.x),y:num(movementRaw.to?.y)}}:movementRaw&&movementRaw.type==='asset'&&assets.some(a=>a.id===String(movementRaw.assetId))?{type:'asset',assetId:String(movementRaw.assetId),from:{x:num(movementRaw.from?.x),y:num(movementRaw.from?.y)},to:{x:num(movementRaw.to?.x),y:num(movementRaw.to?.y)}}:null;
  const gridDisplay=data.gridDisplay&&typeof data.gridDisplay==='object'?{color:/^#[0-9a-f]{6}$/i.test(data.gridDisplay.color||'')?data.gridDisplay.color:'#8fd3ff',opacity:Math.max(0,Math.min(1,num(data.gridDisplay.opacity,.30)))}:{color:'#8fd3ff',opacity:.30};
  return{tokens,terrain,assets,walls,attachments,objectGroups,gmNotesPins,movementIndicator,map,gridDisplay,camera,combatTracker:data.combatTracker&&typeof data.combatTracker==='object'?{round:Math.max(1,Math.min(99999,Math.floor(Number.isFinite(Number(data.combatTracker.round))?Number(data.combatTracker.round):1))),turn:Math.max(0,Math.min(999999,Math.floor(Number.isFinite(Number(data.combatTracker.turn))?Number(data.combatTracker.turn):0)))}:{round:1,turn:0},selected:tokens.some(t=>t.id===data.selected)?data.selected:(tokens[0]?.id||null),view2d:!!data.view2d,identity:data.identity&&typeof data.identity==='object'?data.identity:{}};
}
function applyScene(data){
  runeMarkModeAssassinId=null;
  const scene=validateScene(data);
  state.tokens=scene.tokens;state.movementIndicator=scene.movementIndicator||null;state.objectGroups=scene.objectGroups||[];state.combatRound=scene.combatTracker.round;state.combatTurn=scene.combatTracker.turn;updateTurnCounter();state.attachments=scene.attachments||[];state.gmNotesPins=scene.gmNotesPins||[];state.openGmNotePinId=null;state.gmNotesPinMode=false;closeGmNotePopup();updateGmNotePinModeUI();state.terrain=scene.terrain;state.mapImage=scene.map?.image||null;state.mapWidth=scene.map?.width||24;state.mapHeight=scene.map?.height||24;state.mapX=scene.map?.x||0;state.mapY=scene.map?.y||0;state.mapOpacity=scene.map?.opacity??.78;state.mapLocked=scene.map?.locked!==false;const mapLockButton=document.querySelector('[data-action="map-lock-toggle"]');if(mapLockButton){mapLockButton.textContent=state.mapLocked?'Unlock Map':'Lock Map';mapLockButton.setAttribute('aria-pressed',String(state.mapLocked))}state.gridColor=scene.gridDisplay?.color||'#8fd3ff';state.gridOpacity=scene.gridDisplay?.opacity??.30;const gridColorEl=document.getElementById('grid-color'),gridOpacityEl=document.getElementById('grid-opacity'),gridOpacityValue=document.getElementById('grid-opacity-value');if(gridColorEl)gridColorEl.value=state.gridColor;if(gridOpacityEl)gridOpacityEl.value=String(Math.round(state.gridOpacity*100));if(gridOpacityValue)gridOpacityValue.textContent=Math.round(state.gridOpacity*100)+'%';state.assets=scene.assets||[];state.walls=scene.walls||[];state.selectedWall=null;syncWallEditor(null);state.selectedAsset=null;state.movingAsset=null;state.camera=scene.camera;state.selected=scene.selected;state.view2d=scene.view2d;
  state.wallPlacement=false;state.wallDraft=null;state.movingWall=null;state.wallMoveStart=null;state.wallMoveUndoSnapshot=null;document.querySelectorAll('[data-action="wall-placement"]').forEach(b=>{b.textContent='Place Wall';b.classList.remove('active')});state.drag=null;state.pointers.clear();state.pinchDistance=null;state.lastPinchMid=null;state.movingToken=null;state.moveStart=null;state.moveDistance=0;
  if(!playerScreenMode&&(scene.identity.role==='player'||scene.identity.role==='gm'))sessionRoleEl.value=scene.identity.role;else if(playerScreenMode)sessionRoleEl.value='player';
  if(typeof scene.identity.playerName==='string')sessionPlayerNameEl.value=scene.identity.playerName;
  document.querySelectorAll('[data-action="2d"]').forEach(b=>{b.textContent='2D / 3D';b.setAttribute('aria-pressed',String(state.view2d));b.title=state.view2d?'Switch to 3D View':'Switch to 2D Fallback'});
  updateIdentityUI();resize();list();refreshAttachmentControls();refreshObjectGroupControls();if(state.selected)select(state.selected);
}
function refreshObjectGroupControls(){const sel=document.getElementById('object-group-select'),summary=document.getElementById('object-group-summary');if(!sel)return;const old=sel.value;sel.replaceChildren();const first=document.createElement('option');first.value='';first.textContent='Choose a group';sel.appendChild(first);(state.objectGroups||[]).forEach(g=>{const o=document.createElement('option');o.value=g.id;o.textContent=g.name+(g.hidden?' · Hidden':'');sel.appendChild(o)});if((state.objectGroups||[]).some(g=>g.id===old))sel.value=old;const g=state.objectGroups.find(x=>x.id===sel.value);if(summary)summary.textContent=g?g.members.map(objectLabel).join(' · ')+' — '+g.members.length+' object(s) · '+(g.hidden?'Hidden':'Visible'):'Create a group from selected tokens and assets.'}
function selectedObjectKeys(){return [...(state.selectedTokenIds||[]).map(id=>objectKey('token',id)),...(state.selectedAssetIds||[]).map(id=>objectKey('asset',id))].filter(k=>objectFromKey(k))}
function setSelectedObjectsVisibility(mode){
 if(!isGM())return;
 const keys=[...new Set(selectedObjectKeys())].filter(key=>objectFromKey(key));
 if(keys.length<1){if(sceneSaveStatus)sceneSaveStatus.textContent='Select at least one object to change visibility.';return}
 const gmOnly=mode==='gm',nextAssignment=gmOnly?'gm':'all',nextVisibility=gmOnly?'gm':'players';
 const changed=keys.some(key=>{const obj=objectFromKey(key);return obj&&(obj.assignment!==nextAssignment||obj.visibility!==nextVisibility)});
 if(!changed){if(sceneSaveStatus)sceneSaveStatus.textContent='Selected objects already have that visibility.';return}
 recordUndo();
 keys.forEach(key=>{const obj=objectFromKey(key);if(!obj)return;obj.assignment=nextAssignment;obj.visibility=nextVisibility});
 state.selectedTokenIds=keys.filter(key=>key.startsWith('token:')).map(key=>key.slice(6));
 state.selectedAssetIds=keys.filter(key=>key.startsWith('asset:')).map(key=>key.slice(6));
 list();
 const selectedToken=state.tokens.find(t=>t.id===state.selectedTokenIds[0]);
 if(selectedToken)select(selectedToken.id);
 state.selectedTokenIds=keys.filter(key=>key.startsWith('token:')).map(key=>key.slice(6));
 state.selectedAssetIds=keys.filter(key=>key.startsWith('asset:')).map(key=>key.slice(6));
 state.selectedAsset=state.selectedAssetIds[0]||null;
 if(state.selectedAsset){const asset=state.assets.find(a=>a.id===state.selectedAsset);if(asset)syncAssetEditor(asset)}
 refreshAttachmentControls();updateSceneObjectBrowser(true);render();
 saveSceneToBrowser();broadcastPlayerScene();
 if(sceneSaveStatus)sceneSaveStatus.textContent=(gmOnly?'GM Only':'Visible to Players')+' applied to '+keys.length+' selected objects. Their other properties and attachments were preserved.';
}
function createObjectGroup(){if(!isGM())return;const input=document.getElementById('object-group-name'),name=input?.value.trim().slice(0,80),members=selectedObjectKeys();if(!name){sceneSaveStatus.textContent='Enter a group name.';return}if(!members.length){sceneSaveStatus.textContent='Select objects first. Ctrl+drag selects tokens, Shift+drag assets, Ctrl+Shift+drag both.';return}if(state.objectGroups.some(g=>g.name.toLowerCase()===name.toLowerCase())){sceneSaveStatus.textContent='A group with that name already exists.';return}recordUndo();const g={id:'group-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),name,members,hidden:false};state.objectGroups.push(g);input.value='';refreshObjectGroupControls();document.getElementById('object-group-select').value=g.id;refreshObjectGroupControls();saveSceneToBrowser();sceneSaveStatus.textContent='Created group "'+name+'" with '+members.length+' object(s).'}
function setObjectGroupVisibility(hidden){if(!isGM())return;const id=document.getElementById('object-group-select')?.value,g=state.objectGroups.find(x=>x.id===id);if(!g){sceneSaveStatus.textContent='Choose a group first.';return}recordUndo();g.hidden=hidden;g.members.forEach(k=>{const o=objectFromKey(k);if(o)o.hidden=hidden});state.selectedTokenIds=[];state.selectedAssetIds=[];state.selected=null;state.selectedAsset=null;selectionEl.hidden=true;selectionEl.textContent='';refreshObjectGroupControls();list();render();saveSceneToBrowser();sceneSaveStatus.textContent=(hidden?'Hid ':'Displayed ')+g.name+' ('+g.members.length+' objects).'}
function deleteObjectGroup(){if(!isGM())return;const sel=document.getElementById('object-group-select'),g=state.objectGroups.find(x=>x.id===sel?.value);if(!g)return;recordUndo();state.objectGroups=state.objectGroups.filter(x=>x.id!==g.id);refreshObjectGroupControls();saveSceneToBrowser();sceneSaveStatus.textContent='Deleted group "'+g.name+'". Its objects were not deleted.'}
const SCENE_MAP_DB_NAME='woa-vtt-local-assets';
const SCENE_MAP_STORE='scene-media';
let sceneSaveQueue=Promise.resolve();
 let sceneMapStorageInitialized=false,lastStoredSceneMapImage=null;
function openSceneMapDb(){
 return new Promise((resolve,reject)=>{
  if(!('indexedDB' in window)){reject(new Error('IndexedDB is unavailable'));return}
  const request=indexedDB.open(SCENE_MAP_DB_NAME,1);
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(SCENE_MAP_STORE))db.createObjectStore(SCENE_MAP_STORE)};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||new Error('Could not open local media storage'));
 });
}
async function storeSceneMapImage(image){
 const db=await openSceneMapDb();
 try{await new Promise((resolve,reject)=>{const tx=db.transaction(SCENE_MAP_STORE,'readwrite'),store=tx.objectStore(SCENE_MAP_STORE);if(image)store.put(image,'battlefield-map');else store.delete('battlefield-map');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('Could not save battlefield map'));tx.onabort=()=>reject(tx.error||new Error('Battlefield map save was aborted'))})}
 finally{db.close()}
}
async function readSceneMapImage(){
 const db=await openSceneMapDb();
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction(SCENE_MAP_STORE,'readonly'),request=tx.objectStore(SCENE_MAP_STORE).get('battlefield-map');request.onsuccess=()=>resolve(typeof request.result==='string'?request.result:null);request.onerror=()=>reject(request.error||new Error('Could not read battlefield map'))})}
 finally{db.close()}
}
function saveSceneToBrowser(){
 playerSceneRevision++;
 const snapshot=sceneSnapshot(),mapImage=snapshot.map?.image||null;
 if(snapshot.map)snapshot.map.image='';
 sceneSaveQueue=sceneSaveQueue.then(async()=>{
  try{
   // The battlefield map is stored separately. Token edits and image-framing
   // adjustments should not rewrite a potentially large map image each time.
   if(!sceneMapStorageInitialized||mapImage!==lastStoredSceneMapImage){
    await storeSceneMapImage(mapImage);
    lastStoredSceneMapImage=mapImage;
    sceneMapStorageInitialized=true;
   }
   localStorage.setItem(SCENE_STORAGE_KEY,JSON.stringify(snapshot));
   sceneSaveStatus.textContent='Scene saved in this browser on this device.';
  }catch(e){
   // Fall back to the previous single-record format if IndexedDB is unavailable.
   try{const fallback=sceneSnapshot();localStorage.setItem(SCENE_STORAGE_KEY,JSON.stringify(fallback));sceneSaveStatus.textContent='Scene saved in this browser. (Using standard browser storage.)'}
   catch(storageError){sceneSaveStatus.textContent='Could not save locally. Browser storage may be unavailable or full.'}
  }
 });
 return sceneSaveQueue;
}
async function restoreSceneOnStartup(){
 try{
  const raw=localStorage.getItem(SCENE_STORAGE_KEY);if(!raw)return;
  const saved=JSON.parse(raw);
  if(saved.map&&typeof saved.map.image==='string'&&saved.map.image.length){
   // Migrate older scenes that stored the full map in localStorage.
   await storeSceneMapImage(saved.map.image);
   lastStoredSceneMapImage=saved.map.image;
   sceneMapStorageInitialized=true;
  }else if(saved.map){
   try{saved.map.image=await readSceneMapImage()}catch(error){saved.map.image=null}
   lastStoredSceneMapImage=saved.map.image||null;
   sceneMapStorageInitialized=true;
  }else{
   lastStoredSceneMapImage=null;
   sceneMapStorageInitialized=true;
  }
  applyScene(saved);
  sceneSaveStatus.textContent=state.mapImage?'Restored your last scene and battlefield map from this browser.':'Restored your last scene from this browser.';
 }catch(e){sceneSaveStatus.textContent='Saved scene could not be restored: '+(e.message||'invalid scene data')}
}
document.getElementById("object-group-create")?.addEventListener("click",createObjectGroup);
document.getElementById("object-group-hide")?.addEventListener("click",()=>setObjectGroupVisibility(true));
document.getElementById("object-group-show")?.addEventListener("click",()=>setObjectGroupVisibility(false));
document.getElementById("object-group-delete")?.addEventListener("click",deleteObjectGroup);
document.getElementById("object-group-select")?.addEventListener("change",refreshObjectGroupControls);
document.querySelector('[data-action="save-scene"]').onclick=saveSceneToBrowser;
document.querySelector('[data-action="load-scene"]').onclick=()=>{
  try{const raw=localStorage.getItem(SCENE_STORAGE_KEY);if(!raw){sceneSaveStatus.textContent='No saved scene found in this browser yet.';return}recordUndo();applyScene(JSON.parse(raw));sceneSaveStatus.textContent='Saved scene loaded.'}
  catch(e){sceneSaveStatus.textContent='Could not load the saved scene: '+(e.message||'invalid scene data')}
};
document.querySelector('[data-action="export-scene"]').onclick=()=>{
  try{const blob=new Blob([JSON.stringify(sceneSnapshot(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='wings-of-atreia-scene.json';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);sceneSaveStatus.textContent='Scene JSON export started.'}
  catch(e){sceneSaveStatus.textContent='Could not export the scene.'}
};
document.querySelector('[data-action="import-scene"]').onclick=()=>sceneImportFile.click();
sceneImportFile.addEventListener('change',async()=>{
  const file=sceneImportFile.files?.[0];if(!file)return;
  try{if(file.size>25_000_000)throw new Error('Scene file is too large (maximum 25 MB).');const data=JSON.parse(await file.text());recordUndo();applyScene(data);saveSceneToBrowser();sceneSaveStatus.textContent='Scene imported and saved in this browser.'}
  catch(e){sceneSaveStatus.textContent='Import failed: '+(e.message||'could not read scene file')}
  finally{sceneImportFile.value=''}
});

let vttClipboard=null;
function selectedClipboardObject(){
 const token=state.tokens.find(t=>t.id===state.selected);
 if(token&&canControlToken(token))return{type:'token',data:JSON.parse(JSON.stringify(token))};
 const asset=state.assets.find(a=>a.id===state.selectedAsset);
 if(asset&&isGM())return{type:'asset',data:JSON.parse(JSON.stringify(asset))};
 return null;
}
function pasteClipboardObject(){
 if(!vttClipboard)return;
 if(vttClipboard.type==='asset'&&!isGM())return;
 const rect=canvas.getBoundingClientRect(),ground=screenToGround(rect.width/2,rect.height/2),x=snapCell(ground.x),y=snapCell(ground.y);
 recordUndo();
 const copy=JSON.parse(JSON.stringify(vttClipboard.data));
 copy.id=(vttClipboard.type==='token'?'token-copy-':'asset-copy-')+Date.now()+'-'+Math.floor(Math.random()*100000);
 copy.name=String(copy.name|| (vttClipboard.type==='token'?'Token':'Prop')).slice(0,108)+' (Copy)';
 copy.x=x;copy.y=y;
 delete copy._screen;delete copy._dragX;delete copy._dragY;
 if(vttClipboard.type==='token'){
  if(!isGM()&&copy.assignment==='gm')copy.assignment='specific';
  state.tokens.push(copy);state.selectedAsset=null;select(copy.id);list();
 }else{
  state.assets.push(copy);state.selectedAsset=copy.id;state.selected=null;updateClassResourcePanel(null);syncAssetEditor(copy);refreshAttachmentControls();
 }
 saveSceneToBrowser();
}
document.addEventListener('keydown',e=>{
 if(e.key!=='Delete'||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey)return;
 const target=e.target,typing=target&&(/INPUT|TEXTAREA|SELECT/.test(target.tagName)||target.isContentEditable);
 if(typing||!isGM()||state.pendingPlacement)return;
 if(state.selectedAsset&&state.assets.some(a=>a.id===state.selectedAsset)){
  const button=document.querySelector('[data-action="asset-delete"]');
  if(button&&!button.disabled){e.preventDefault();button.click()}
  return;
 }
 if(state.selected&&state.tokens.some(t=>t.id===state.selected)){
  const button=document.querySelector('[data-action="token-delete"]');
  if(button&&!button.disabled){e.preventDefault();button.click()}
 }
});
document.addEventListener('keydown',e=>{
 const mod=e.ctrlKey||e.metaKey;if(!mod||e.altKey)return;
 const key=e.key.toLowerCase(),target=e.target,typing=target&&(/INPUT|TEXTAREA|SELECT/.test(target.tagName)||target.isContentEditable);
 if(key==='z'&&!e.shiftKey){if(!isGM()||typing)return;e.preventDefault();undoLastAction();return}
 if((key==='y'||(key==='z'&&e.shiftKey))){if(!isGM()||typing)return;e.preventDefault();redoLastAction();return}
 if(key==='s'){if(typing||!isGM())return;e.preventDefault();saveSceneToBrowser();return}
 if(key==='l'){if(typing||!isGM())return;e.preventDefault();const raw=localStorage.getItem(SCENE_STORAGE_KEY);if(!raw){if(sceneSaveStatus)sceneSaveStatus.textContent='No saved scene found in this browser yet.';return}try{recordUndo();applyScene(JSON.parse(raw));sceneSaveStatus.textContent='Saved scene loaded.'}catch(err){sceneSaveStatus.textContent='Could not load the saved scene: '+(err.message||'invalid scene data')}return}
 if(typing)return;
 if(key==='c'){const selected=selectedClipboardObject();if(!selected)return;e.preventDefault();vttClipboard=selected;if(sceneSaveStatus)sceneSaveStatus.textContent='Copied '+(selected.data.name||'object')+' to the VTT clipboard.';return}
 if(key==='x'){if(!isGM())return;const selected=selectedClipboardObject();if(!selected)return;e.preventDefault();vttClipboard=selected;recordUndo();if(selected.type==='token'){state.tokens=state.tokens.filter(t=>t.id!==selected.data.id);state.tokens.forEach(target=>{target.runeMarks=normalizeRuneMarks(target.runeMarks).filter(m=>m.assassinId!==selected.data.id)});if(runeMarkModeAssassinId===selected.data.id)runeMarkModeAssassinId=null;state.attachments=state.attachments.filter(edge=>edge.a!==objectKey('token',selected.data.id)&&edge.b!==objectKey('token',selected.data.id));state.selected=state.tokens[0]?.id||null;select(state.selected);list()}else{state.assets=state.assets.filter(a=>a.id!==selected.data.id);state.attachments=state.attachments.filter(edge=>edge.a!==objectKey('asset',selected.data.id)&&edge.b!==objectKey('asset',selected.data.id));state.selectedAsset=null;refreshAttachmentControls()}saveSceneToBrowser();if(sceneSaveStatus)sceneSaveStatus.textContent='Cut '+(selected.data.name||'object')+'.';return}
 if(key==='v'){if(!vttClipboard)return;e.preventDefault();pasteClipboardObject()}
});
// Ctrl+Shift+L is provided as a reliable alternative because browsers reserve Ctrl+L for the address bar.
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='l'&&!e.altKey){if(e.target&&(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable))return;if(!isGM())return;e.preventDefault();const raw=localStorage.getItem(SCENE_STORAGE_KEY);if(!raw){if(sceneSaveStatus)sceneSaveStatus.textContent='No saved scene found in this browser yet.';return}try{recordUndo();applyScene(JSON.parse(raw));sceneSaveStatus.textContent='Saved scene loaded.'}catch(err){sceneSaveStatus.textContent='Could not load the saved scene: '+(err.message||'invalid scene data')}}});

// Restore the most recent local scene only after all scene controls are registered.
if(playerScreenMode){sessionRoleEl.value='player';sessionPlayerNameEl.value='';document.body.classList.add('player-screen-mode');playerScreenChannel=new BroadcastChannel('woa-vtt-player-screen');playerScreenChannel.onmessage=e=>receivePlayerScene(e.data);}else{playerScreenChannel=new BroadcastChannel('woa-vtt-player-screen');const cameraSyncToggle=document.getElementById('player-camera-sync');cameraSyncToggle?.addEventListener('change',()=>{broadcastPlayerScene();});document.getElementById('open-player-screen')?.addEventListener('click',()=>{const url=new URL(location.href);url.searchParams.set('mode','player');window.open(url.toString(),'woa-player-screen','popup,width=1280,height=800');});}
if(!playerScreenMode){const pingButton=document.querySelector('[data-action="gm-ping-toggle"]');pingButton?.addEventListener('click',()=>{if(!isGM())return;state.gmPingPlacement=!state.gmPingPlacement;pingButton.classList.toggle('active',state.gmPingPlacement);pingButton.setAttribute('aria-pressed',String(state.gmPingPlacement));pingButton.textContent=state.gmPingPlacement?'Cancel Ping':'Ping Location';if(sceneSaveStatus)sceneSaveStatus.textContent=state.gmPingPlacement?'Ping mode: click a location on the battlefield. Press Escape to cancel.':'Ping placement cancelled.'});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.gmPingPlacement){state.gmPingPlacement=false;if(pingButton){pingButton.classList.remove('active');pingButton.setAttribute('aria-pressed','false');pingButton.textContent='Ping Location'}if(sceneSaveStatus)sceneSaveStatus.textContent='Ping placement cancelled.'}});restoreSceneOnStartup();}
