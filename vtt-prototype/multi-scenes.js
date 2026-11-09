(() => {
  'use strict';
  if(new URLSearchParams(location.search).get('mode')==='player')return;
  const DB_NAME='woa-vtt-scenes-db', DB_STORE='collections', DB_KEY='main';
  const LEGACY_KEY='woa-vtt-scene-v1';
  const COLLECTION_FORMAT='wings-of-atreia-vtt-scene-collection';
  const $=id=>document.getElementById(id);
  const status=$('scene-save-status');
  const activeSelect=$('scene-active-select');
  const tokenSelect=$('scene-transfer-token');
  const destinationSelect=$('scene-transfer-destination');
  const collectionFile=$('scene-collection-file');
  let collection=null, db=null, ready=false, saveQueue=Promise.resolve();
  const clone=value=>JSON.parse(JSON.stringify(value));
  const makeId=()=> 'scene-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
  const persistentFields=['name','glyph','color','borderColor','visibility','assignment','players','image','imageZoom','imageX','imageY','imageSlots','status','conditions','className','classResource','runeMarks','playerInfo'];
  const defaultCharacterFields=t=>{
    const out={};for(const k of persistentFields)if(t[k]!==undefined)out[k]=clone(t[k]);
    return out;
  };
  function openDB(){
    return new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)){reject(new Error('IndexedDB unavailable'));return}
      const request=indexedDB.open(DB_NAME,1);
      request.onupgradeneeded=()=>{const d=request.result;if(!d.objectStoreNames.contains(DB_STORE))d.createObjectStore(DB_STORE)};
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('Could not open scene storage'));
    });
  }
  function readStored(){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(DB_STORE,'readonly'),request=tx.objectStore(DB_STORE).get(DB_KEY);
      request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);
    });
  }
  function writeStored(value){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(value,DB_KEY);
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('Scene storage write failed'));tx.onabort=()=>reject(tx.error||new Error('Scene storage write aborted'));
    });
  }
  function activeScene(){return collection?.scenes.find(s=>s.id===collection.activeSceneId)||collection?.scenes[0]||null}
  function refreshSharedCharacters(snapshot){
    for(const token of snapshot.tokens||[])collection.characters[token.id]=defaultCharacterFields(token);
  }
  function applySharedCharacters(snapshot){
    const data=clone(snapshot);
    data.tokens=(data.tokens||[]).map(token=>({...token,...clone(collection.characters[token.id]||{})}));
    return data;
  }
  window.woaGetSceneUsage=()=>({
    sceneCount:collection?.scenes?.length||0,
    activeSceneName:activeScene()?.name||'No scene',
    collectionBytes:collection?new Blob([JSON.stringify(collection)]).size:0,
    ready
  });
  function persist(){
    if(!ready||!collection)return Promise.resolve();
    saveQueue=saveQueue.then(()=>writeStored(collection)).then(()=>{
      window.dispatchEvent(new CustomEvent('woa-scene-collection-updated'));
    }).catch(error=>{
      if(status)status.textContent='Could not save scene collection: '+(error.message||'storage error');
    });
    return saveQueue;
  }
  function saveActiveScene(showStatus=true){
    if(!ready||!collection)return;
    const scene=activeScene();if(!scene)return;
    const snapshot=sceneSnapshot();
    refreshSharedCharacters(snapshot);
    scene.data=snapshot;scene.updatedAt=new Date().toISOString();
    persist();
    if(showStatus&&status)status.textContent='Scene "'+scene.name+'" saved on this device.';
  }
  const originalApplyScene=applyScene;
  applyScene=function(data){originalApplyScene(applySharedCharacters(data));};
  saveSceneToBrowser=function(){saveActiveScene(true)};
  function renderSceneControls(){
    if(!collection)return;
    const scenes=collection.scenes;
    if(activeSelect){
      activeSelect.replaceChildren();
      scenes.forEach(scene=>{const option=document.createElement('option');option.value=scene.id;option.textContent=scene.name;activeSelect.append(option)});
      activeSelect.value=collection.activeSceneId;
    }
    if(destinationSelect){
      destinationSelect.replaceChildren();
      scenes.filter(s=>s.id!==collection.activeSceneId).forEach(scene=>{const option=document.createElement('option');option.value=scene.id;option.textContent=scene.name;destinationSelect.append(option)});
      destinationSelect.disabled=destinationSelect.options.length===0;
    }
    if(tokenSelect){
      const selected=state.tokens.find(t=>t.id===state.selected);
      tokenSelect.replaceChildren();
      state.tokens.forEach(token=>{const option=document.createElement('option');option.value=token.id;option.textContent=token.name||'Unnamed Token';tokenSelect.append(option)});
      if(selected)tokenSelect.value=selected.id;
      tokenSelect.disabled=!isGM()||state.tokens.length===0;
    }
    $('scene-delete')?.toggleAttribute('disabled',scenes.length<=1||!isGM());
    $('scene-rename')?.toggleAttribute('disabled',!isGM());
    $('scene-duplicate')?.toggleAttribute('disabled',!isGM());
    $('scene-new')?.toggleAttribute('disabled',!isGM());
    $('scene-export-collection')?.toggleAttribute('disabled',!isGM());
    $('scene-import-collection')?.toggleAttribute('disabled',!isGM());
    $('scene-transfer')?.toggleAttribute('disabled',!isGM()||!destinationSelect||destinationSelect.disabled||!state.tokens.length);
  }
  function newBlankSnapshot(){
    const data=clone(sceneSnapshot());
    data.terrain={};data.walls=[];data.map=null;data.attachments=[];data.gmNotesPins=[];data.assets=[];data.tokens=[];
    data.selected=null;data.combatTracker={round:1,turn:0};
    return data;
  }
  function addScene(name,data){
    const scene={id:makeId(),name:(name||'New Scene').trim().slice(0,80)||'New Scene',data:clone(data),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    collection.scenes.push(scene);collection.activeSceneId=scene.id;return scene;
  }
  function switchScene(id){
    const next=collection.scenes.find(s=>s.id===id);if(!next||next.id===collection.activeSceneId)return;
    saveActiveScene(false);
    collection.activeSceneId=next.id;
    applyScene(next.data);
    renderSceneControls();persist();
    if(status)status.textContent='Switched to "'+next.name+'". Previous scene saved automatically.';
  }
  function exportCollection(){
    saveActiveScene(false);
    const payload={format:COLLECTION_FORMAT,version:1,exportedAt:new Date().toISOString(),collection};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='wings-of-atreia-scene-collection.json';document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
    if(status)status.textContent='Scene collection export started.';
  }
  function importCollection(file){
    if(file.size>100_000_000){if(status)status.textContent='Collection is too large (maximum 100 MB).';return}
    file.text().then(text=>{
      const payload=JSON.parse(text),incoming=payload?.collection;
      if(payload?.format!==COLLECTION_FORMAT||payload.version!==1||!incoming||!Array.isArray(incoming.scenes)||incoming.scenes.length<1||incoming.scenes.length>200)throw new Error('Unsupported or invalid scene collection.');
      const ids=new Set();
      const scenes=incoming.scenes.map((scene,index)=>{
        if(!scene||typeof scene.id!=='string'||ids.has(scene.id)||typeof scene.name!=='string')throw new Error('Collection contains an invalid or duplicate scene.');
        ids.add(scene.id);validateScene(scene.data);
        return{id:scene.id,name:scene.name.slice(0,80)||('Scene '+(index+1)),data:scene.data,createdAt:scene.createdAt||new Date().toISOString(),updatedAt:scene.updatedAt||new Date().toISOString()};
      });
      const characters=incoming.characters&&typeof incoming.characters==='object'?incoming.characters:{};
      const active=scenes.some(s=>s.id===incoming.activeSceneId)?incoming.activeSceneId:scenes[0].id;
      saveActiveScene(false);
      collection={format:COLLECTION_FORMAT,version:1,activeSceneId:active,scenes,characters};
      const current=activeScene();applyScene(current.data);renderSceneControls();persist();
      if(status)status.textContent='Scene collection imported successfully.';
    }).catch(error=>{if(status)status.textContent='Collection import failed: '+(error.message||'invalid file')});
  }
  function transferToken(tokenIdOverride=null,destinationIdOverride=null){
    if(!isGM())return;
    const tokenId=tokenIdOverride||tokenSelect?.value, destinationId=destinationIdOverride||destinationSelect?.value;
    const token=state.tokens.find(t=>t.id===tokenId),destination=collection.scenes.find(s=>s.id===destinationId);
    if(!token||!destination||destination.id===collection.activeSceneId)return;
    if(!confirm('Transfer "'+(token.name||'token')+'" to "'+destination.name+'"? The token will be removed from this scene.'))return;
    saveActiveScene(false);
    const source=activeScene(),sourceData=clone(source.data);
    const moved=sourceData.tokens.find(t=>t.id===tokenId);if(!moved)return;
    sourceData.tokens=sourceData.tokens.filter(t=>t.id!==tokenId);
    sourceData.attachments=(sourceData.attachments||[]).filter(edge=>edge.a!=='token:'+tokenId&&edge.b!=='token:'+tokenId);
    sourceData.selected=sourceData.tokens.some(t=>t.id===sourceData.selected)?sourceData.selected:(sourceData.tokens[0]?.id||null);
    source.data=sourceData;source.updatedAt=new Date().toISOString();
    const target=clone(destination.data);
    target.tokens=target.tokens.filter(t=>t.id!==tokenId);
    target.tokens.push(clone(moved));
    target.selected=tokenId;
    destination.data=target;destination.updatedAt=new Date().toISOString();
    collection.characters[tokenId]=defaultCharacterFields(moved);
    applyScene(source.data);renderSceneControls();persist();
    if(status)status.textContent=(token.name||'Token')+' transferred to "'+destination.name+'". Character information was preserved.';
  }
  function initialize(){
    if(!isGM()&&status)status.textContent='Scene management is available to the GM.';
    openDB().then(async opened=>{
      db=opened;let saved=await readStored();
      if(saved&&saved.format===COLLECTION_FORMAT&&Array.isArray(saved.scenes)&&saved.scenes.length){
        collection=saved;
        collection.characters=collection.characters||{};
        if(!collection.scenes.some(s=>s.id===collection.activeSceneId))collection.activeSceneId=collection.scenes[0].id;
      }else{
        let legacy=null;try{const raw=localStorage.getItem(LEGACY_KEY);if(raw)legacy=validateScene(JSON.parse(raw))}catch{}
        collection={format:COLLECTION_FORMAT,version:1,activeSceneId:makeId(),characters:{},scenes:[]};
        const first=addScene('Scene 1',legacy||sceneSnapshot());
        collection.activeSceneId=first.id;
        refreshSharedCharacters(first.data);
        await persist();
      }
      ready=true;
      const current=activeScene();applyScene(current.data);
      refreshSceneUI();
      if(status)status.textContent='Scene collection ready · '+collection.scenes.length+' scene(s) stored on this device.';
      window.dispatchEvent(new CustomEvent('woa-scene-collection-updated'));
    }).catch(error=>{
      if(status)status.textContent='Multi-scene storage could not start: '+(error.message||'IndexedDB unavailable')+'. Existing single-scene controls remain available.';
    });
  }
  function refreshSceneUI(){renderSceneControls();const label=$('scene-active-name');if(label)label.textContent=activeScene()?.name||'No scene';}
  $('scene-new')?.addEventListener('click',()=>{
    if(!isGM()||!ready)return;
    const choice=prompt('Create a scene:\n1 = Blank battlefield\n2 = Duplicate current scene','1');
    if(choice===null)return;
    if(!['1','2'].includes(choice.trim())){if(status)status.textContent='Choose 1 for Blank or 2 for Duplicate.';return}
    saveActiveScene(false);
    const source=choice.trim()==='2'?sceneSnapshot():newBlankSnapshot();
    const name=prompt('Name the new scene:','Scene '+(collection.scenes.length+1));if(name===null)return;
    const scene=addScene(name,source);applyScene(scene.data);refreshSceneUI();persist();
    if(status)status.textContent='Created "'+scene.name+'".';
  });
  $('scene-duplicate')?.addEventListener('click',()=>{
    if(!isGM()||!ready)return;saveActiveScene(false);
    const name=prompt('Name the duplicated scene:',activeScene().name+' Copy');if(name===null)return;
    const scene=addScene(name,sceneSnapshot());applyScene(scene.data);refreshSceneUI();persist();
  });
  $('scene-rename')?.addEventListener('click',()=>{
    if(!isGM()||!ready)return;const scene=activeScene(),name=prompt('Rename scene:',scene.name);if(name===null)return;
    scene.name=name.trim().slice(0,80)||scene.name;scene.updatedAt=new Date().toISOString();refreshSceneUI();persist();
  });
  $('scene-delete')?.addEventListener('click',()=>{
    if(!isGM()||!ready||collection.scenes.length<=1)return;const scene=activeScene();
    if(!confirm('Delete "'+scene.name+'"? This cannot be undone.'))return;
    const index=collection.scenes.findIndex(s=>s.id===scene.id);collection.scenes.splice(index,1);
    const next=collection.scenes[Math.max(0,index-1)];collection.activeSceneId=next.id;applyScene(next.data);refreshSceneUI();persist();
    if(status)status.textContent='Deleted "'+scene.name+'".';
  });
  activeSelect?.addEventListener('change',()=>{if(ready&&isGM())switchScene(activeSelect.value)});
  $('scene-transfer')?.addEventListener('click',()=>transferToken());
  const objectMenu=$('object-context-menu');
  objectMenu?.addEventListener('click',event=>{
    const button=event.target.closest('[data-token-action="transfer-scene"]');if(!button||!isGM()||!ready)return;
    const token=state.tokens.find(t=>t.id===objectMenu.dataset.objectKey?.slice('token:'.length));
    if(!token)return;
    const choices=collection.scenes.filter(scene=>scene.id!==collection.activeSceneId);
    if(!choices.length){if(status)status.textContent='Create another scene before transferring a token.';return}
    const promptText=choices.map((scene,index)=>(index+1)+'. '+scene.name).join('\n');
    const answer=prompt('Transfer '+(token.name||'token')+' to which scene?\n'+promptText,'1');
    if(answer===null)return;
    const index=Number(answer)-1;if(!Number.isInteger(index)||index<0||index>=choices.length){if(status)status.textContent='Invalid destination scene selection.';return}
    transferToken(token.id,choices[index].id);
  });

  $('scene-export-collection')?.addEventListener('click',()=>{if(isGM()&&ready)exportCollection()});
  $('scene-import-collection')?.addEventListener('click',()=>{if(isGM())collectionFile?.click()});
  collectionFile?.addEventListener('change',()=>{const file=collectionFile.files?.[0];if(file)importCollection(file);collectionFile.value=''});
  const saveButton=document.querySelector('[data-action="save-scene"]');
  const loadButton=document.querySelector('[data-action="load-scene"]');
  const exportButton=document.querySelector('[data-action="export-scene"]');
  if(saveButton)saveButton.onclick=()=>saveActiveScene(true);
  if(loadButton)loadButton.onclick=()=>{if(ready){const scene=activeScene();applyScene(scene.data);if(status)status.textContent='Reloaded "'+scene.name+'".'}};
  if(exportButton)exportButton.onclick=()=>{if(ready){const blob=new Blob([JSON.stringify(sceneSnapshot(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(activeScene()?.name||'scene').replace(/[^a-z0-9-_]+/gi,'-')+'.json';document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url)}};
  document.addEventListener('woa-token-list-updated',renderSceneControls);
  const oldList=list;
  list=function(){oldList();if(ready)renderSceneControls()};
  const oldSelect=select;
  select=function(id){oldSelect(id);if(ready&&tokenSelect&&id)tokenSelect.value=id};
  const oldUpdateIdentityUI=updateIdentityUI;
  updateIdentityUI=function(){oldUpdateIdentityUI();if(ready)renderSceneControls()};
  sessionRoleEl.addEventListener('change',()=>{if(ready)renderSceneControls()});
  sessionPlayerNameEl.addEventListener('input',()=>{if(ready)renderSceneControls()});
  initialize();
})();