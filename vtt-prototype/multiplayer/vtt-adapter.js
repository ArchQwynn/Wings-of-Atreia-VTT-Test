(function(root){
'use strict';
const F=root.WoAMultiplayerFoundation,params=new URLSearchParams(location.search),playerMode=params.get('mode')==='player',sessionId=params.get('session');
const $=id=>document.getElementById(id),s={peer:null,role:null,connection:null,connections:new Map(),pending:new Map(),approved:new Map(),generation:1,revision:0,sessionId:null,attemptId:null,transfer:null,lastPublishedSerialized:null,lastPublishedSceneRevision:null,pendingSceneRevision:null,pendingSceneData:null,pendingCameraSync:false,pendingCameraState:null,pendingGmPing:null,publishTimer:null,movementRequests:new Map(),snapshotTransfers:new Map(),reconnectTimer:null,reconnecting:false};
const ui={status:$('multiplayer-status'),host:$('multiplayer-host'),join:$('multiplayer-join'),joinGate:$('player-join-gate'),hostButton:$('multiplayer-start-host'),joinButton:$('multiplayer-request-join'),name:$('multiplayer-display-name'),invite:$('multiplayer-invite'),copy:$('multiplayer-copy-invite'),queue:$('multiplayer-join-queue'),connected:$('multiplayer-connected-players'),moveQueue:$('multiplayer-movement-queue'),playerState:$('multiplayer-player-state'),end:$('multiplayer-end-session')};
function status(t,k){if(ui.status){ui.status.textContent=t;ui.status.dataset.state=k||'info'}}
function id(){return root.crypto?.randomUUID?.()||'woa-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)}
function storageGet(key){try{return localStorage.getItem(key)}catch(_){return null}}
function storageSet(key,value){try{localStorage.setItem(key,value)}catch(_){}}
function rosterKey(peerId){return 'woa-vtt-approved-'+peerId}
function loadRoster(peerId){try{const data=JSON.parse(storageGet(rosterKey(peerId))||'{}');return data&&typeof data==='object'?data:{}}catch(_){return {}}}
function saveRoster(peerId,roster){try{storageSet(rosterKey(peerId),JSON.stringify(roster))}catch(_){}}
function playerCredentialKey(peerId){return 'woa-vtt-player-credential-'+peerId}
function savedPlayerCredential(peerId){try{return JSON.parse(storageGet(playerCredentialKey(peerId))||'null')}catch(_){return null}}
function savePlayerCredential(peerId,value){try{storageSet(playerCredentialKey(peerId),JSON.stringify(value))}catch(_){}}

function packet(type,payload){return F.createMessage(type,payload,{hostGeneration:s.generation,revision:s.revision})}
function send(c,type,payload){if(!c?.open)return false;try{c.send(packet(type,payload));return true}catch(e){status(e.message,'error');return false}}
function invitation(){const u=new URL(location.href);u.searchParams.set('mode','player');u.searchParams.set('session',s.sessionId);return u.toString()}
function setMode(){if(ui.host)ui.host.hidden=playerMode;if(ui.join)ui.join.hidden=!playerMode;if(ui.end)ui.end.hidden=s.role!=='host';if(playerMode)document.body.classList.add('player-join-gate')}
function movementQueueRender(){
 if(!ui.moveQueue)return;ui.moveQueue.replaceChildren();
 if(!s.movementRequests.size){ui.moveQueue.textContent='No pending movement requests.';return}
 s.movementRequests.forEach((request,requestId)=>{
  const row=document.createElement('div');row.className='multiplayer-request';
  const label=document.createElement('span');
  label.textContent=request.playerName+' · '+(request.objectType==='asset'?'Asset: ':'Token: ')+(request.objectId||request.tokenId)+' · X '+request.proposed.x+', Y '+request.proposed.y+', Z '+request.proposed.z+' ft'+(request.approving?' · Approved — waiting for player synchronization':'');
  const yes=document.createElement('button');yes.type='button';yes.textContent=request.approving?'Syncing…':'Approve';yes.disabled=!!request.approving;
  yes.onclick=()=>{
   if(request.approving)return;
   const result=root.WoAVTTMultiplayerHooks?.applyApprovedMovement?.(request);
   if(!result?.ok){
    const message=result?.message||'Movement could not be applied.';
    root.WoAVTTMultiplayerHooks?.clearPendingMovement?.(requestId);
    send(request.connection,'ACTION_RESULT',{requestId,ok:false,message});
    s.movementRequests.delete(requestId);movementQueueRender();status(message,'error');return
   }
   s.revision++;let sent=0,requesterTransferStarted=false;
   for(const [conn,approved] of s.approved){
    const scene=snapshot(approved?.name||''),isRequester=conn===request.connection;
    if(scene&&sendSnapshot(conn,scene,s.pendingCameraSync,isRequester?requestId:null)){
     sent++;if(isRequester)requesterTransferStarted=true
    }
    sendCameraState(conn)
   }
   const sceneRevision=root.WoAVTTMultiplayerHooks?.getSceneRevision?.();
   if(sent&&Number.isSafeInteger(sceneRevision))s.lastPublishedSceneRevision=sceneRevision;
   if(requesterTransferStarted){
    request.approving=true;
    movementQueueRender();
    status('Movement approved · waiting for '+request.playerName+' to receive and apply the updated scene.','info');
   }else{
    request.approving=false;
    movementQueueRender();
    status('Movement was applied on the GM screen, but the player scene could not be sent. The request remains available to retry.','error');
   }
  };
  const no=document.createElement('button');no.type='button';no.textContent='Reject';no.disabled=!!request.approving;
  no.onclick=()=>{
   root.WoAVTTMultiplayerHooks?.clearPendingMovement?.(requestId);
   send(request.connection,'ACTION_RESULT',{requestId,ok:false,message:'The GM rejected this movement request.'});
   s.movementRequests.delete(requestId);movementQueueRender();status('Movement request rejected.')
  };
  row.append(label,yes,no);ui.moveQueue.append(row)
 })
}
function queueRender(){if(!ui.queue)return;ui.queue.replaceChildren();if(!s.pending.size){ui.queue.textContent='No pending join requests.';return}s.pending.forEach((entry,conn)=>{const row=document.createElement('div');row.className='multiplayer-request';const label=document.createElement('span');label.textContent=entry.name+' is requesting to join';const yes=document.createElement('button');yes.type='button';yes.textContent='Approve';yes.onclick=()=>approve(conn);const no=document.createElement('button');no.type='button';no.textContent='Reject';no.onclick=()=>reject(conn);row.append(label,yes,no);ui.queue.append(row)})}
function connectedPlayersRender(){if(!ui.connected)return;ui.connected.replaceChildren();if(!s.approved.size){ui.connected.textContent='No players connected.';return}s.approved.forEach(entry=>{const row=document.createElement('div');row.className='multiplayer-request';const name=document.createElement('span');name.textContent=entry.name||'Unnamed player';const state=document.createElement('span');state.className='multiplayer-player-status';state.textContent='Connected';row.append(name,state);ui.connected.append(row)})}
function snapshot(playerName=''){return root.WoAVTTMultiplayerHooks?.buildPlayerSnapshot?.(playerName)||null}
function sendCameraState(conn){if(!s.pendingCameraState&&!s.pendingGmPing)return;send(conn,'CAMERA_VIEW_UPDATE',{enabled:s.pendingCameraSync,camera:s.pendingCameraState?.camera||null,view2d:s.pendingCameraState?.view2d===true,gmPing:s.pendingGmPing||null})}
function splitUtf8Chunks(value,maxBytes=28*1024){
 const chunks=[];let part='',bytes=0;
 for(const character of value){
  const size=typeof TextEncoder!=='undefined'?new TextEncoder().encode(character).length:unescape(encodeURIComponent(character)).length;
  if(bytes+size>maxBytes&&part){chunks.push(part);part='';bytes=0}
  part+=character;bytes+=size;
 }
 if(part)chunks.push(part);
 return chunks;
}
function sendSnapshot(conn,data=snapshot(s.approved.get(conn)?.name||''),cameraSync=s.pendingCameraSync,requestId=null){
 const playerName=s.approved.get(conn)?.name||'player';
 const fail=(message)=>{if(requestId)send(conn,'ACTION_RESULT',{requestId,ok:false,message});status(message,'error');return false};
 if(!data){send(conn,'ERROR',{message:'Player scene snapshot is not available.'});return fail('SYNC ERROR: could not build scene snapshot for '+playerName+'.')}
 const serialized=JSON.stringify(data);
 if(serialized.length>2600000){send(conn,'ERROR',{message:'This scene is too large for the initial multiplayer transfer (2.5 MB limit).'});return fail('SYNC ERROR: scene snapshot exceeds 2.5 MB.')}
 const chunks=splitUtf8Chunks(serialized),total=chunks.length,transferId=id();
 s.snapshotTransfers.set(transferId,{connection:conn,playerName,revision:s.revision,requestId,startedAt:Date.now()});
 if(!send(conn,'STATE_SNAPSHOT',{transferId,total,byteLength:serialized.length,cameraSync:cameraSync===true})){
  s.snapshotTransfers.delete(transferId);return fail('SYNC ERROR: could not start scene transfer to '+playerName+'.');
 }
 for(let index=0;index<total;index++){
  if(!send(conn,'STATE_UPDATE',{transferId,index,total,data:chunks[index]})){
   s.snapshotTransfers.delete(transferId);return fail('SYNC ERROR: scene transfer to '+playerName+' stopped at chunk '+(index+1)+' of '+total+'.');
  }
 }
 status('Snapshot sent to '+playerName+' · revision '+s.revision+' · awaiting receipt.','info');
 return true
}
function publishScene(message){
 if(s.role!=='host'||!message)return;
 if(typeof message.cameraSync==='boolean')s.pendingCameraSync=message.cameraSync;
 if(Object.prototype.hasOwnProperty.call(message,'gmPing'))s.pendingGmPing=message.gmPing||null;
 const camera=message.data?.camera||message.camera,view2d=message.data?message.data.view2d===true:message.view2d===true;
 if(camera)s.pendingCameraState={camera,view2d};
 if(s.pendingCameraSync){for(const conn of s.approved.keys())sendCameraState(conn)}
 else{for(const conn of s.approved.keys())send(conn,'CAMERA_VIEW_UPDATE',{enabled:false})}
 if(!message.data||!s.approved.size)return;
 const sceneRevision=Number.isSafeInteger(message.sceneRevision)?message.sceneRevision:null;
 if(message.forceScene===true){
  if(s.publishTimer){clearTimeout(s.publishTimer);s.publishTimer=null}
  s.pendingSceneData=null;s.pendingSceneRevision=null;
  s.revision++;let sent=0;
  for(const [conn,approved] of s.approved){
   const name=approved?.name||'',data=snapshot(name);
   if(data&&sendSnapshot(conn,data,s.pendingCameraSync))sent++;
   sendCameraState(conn)
  }
  if(sent&&sceneRevision!==null)s.lastPublishedSceneRevision=sceneRevision;
  status(sent?'GM movement sent to '+sent+' connected player screen(s).':'SYNC ERROR: GM movement could not be sent to any connected player. ',sent?'good':'error');
  return
 }
 if(sceneRevision!==null&&sceneRevision===s.lastPublishedSceneRevision)return;
 s.pendingSceneData=message.data;s.pendingSceneRevision=sceneRevision;
 if(s.publishTimer)return;
 s.publishTimer=setTimeout(()=>{
  s.publishTimer=null;
  const data=s.pendingSceneData,revision=s.pendingSceneRevision;
  s.pendingSceneData=null;s.pendingSceneRevision=null;
  if(!data||!s.approved.size)return;
  s.revision++;let sent=0;
  for(const [conn,approved] of s.approved){const name=approved?.name||'';if(sendSnapshot(conn,snapshot(name),s.pendingCameraSync))sent++;sendCameraState(conn)}
  if(sent&&revision!==null)s.lastPublishedSceneRevision=revision;
  if(!sent)status('SYNC ERROR: no player scene snapshots could be sent · revision '+s.revision+'.','error')
 },180)
}
function sendInitialScene(conn,name){s.revision++;const initial=snapshot(name);if(initial){s.pendingCameraState={camera:initial.camera,view2d:initial.view2d===true};s.pendingCameraSync=$('player-camera-sync')?.checked===true}if(sendSnapshot(conn,initial,s.pendingCameraSync)){const sceneRevision=root.WoAVTTMultiplayerHooks?.getSceneRevision?.();if(Number.isSafeInteger(sceneRevision))s.lastPublishedSceneRevision=sceneRevision}sendCameraState(conn)}
function approve(conn){const entry=s.pending.get(conn);if(!entry)return;s.pending.delete(conn);const token=id();const approved={name:entry.name,token};s.approved.set(conn,approved);const roster=loadRoster(s.sessionId);roster[token]={name:entry.name,approvedAt:Date.now()};saveRoster(s.sessionId,roster);connectedPlayersRender();send(conn,'JOIN_ACCEPTED',{displayName:entry.name,reconnectToken:token});sendInitialScene(conn,entry.name);queueRender();status(entry.name+' approved. Initial scene sent.')}
function reject(conn){if(!s.pending.has(conn))return;send(conn,'JOIN_REJECTED',{reason:'The GM declined this request.'});s.pending.delete(conn);conn.close();queueRender();status('Join request rejected.')}
function acceptConnection(conn){conn.on('data',raw=>{const v=F.validateMessage(raw);if(!v.ok){send(conn,'ERROR',{message:v.error});return}const m=v.message;if(m.hostGeneration!==s.generation)return;if(m.type==='JOIN_REQUEST'){const name=String(m.payload.characterName||m.payload.displayName||'').trim().slice(0,40),token=String(m.payload.reconnectToken||'');if(!name){send(conn,'JOIN_REJECTED',{reason:'A display name is required.'});return}const roster=loadRoster(s.sessionId),saved=token&&roster[token];if(saved&&saved.name===name){s.approved.set(conn,{name,token});connectedPlayersRender();send(conn,'JOIN_ACCEPTED',{displayName:name,reconnectToken:token,reconnected:true});sendInitialScene(conn,name);status(name+' reconnected automatically.','good');return}if(s.pending.size+s.approved.size>=25){send(conn,'JOIN_REJECTED',{reason:'Session is full.'});return}s.pending.set(conn,{name,attemptId:m.payload.attemptId||id()});queueRender();status(name+' is waiting for GM approval.');}else if(m.type==='ACTION_REQUEST'&&s.approved.has(conn)){const p=m.payload||{},entry=s.approved.get(conn);const objectType=p.objectType||(p.action==='MOVE_TOKEN'?'token':'');const objectId=p.objectId||p.tokenId;if(p.action!=='MOVE_OBJECT'&&p.action!=='MOVE_TOKEN'||!['token','asset'].includes(objectType)||typeof p.requestId!=='string'||p.requestId.length>100||typeof objectId!=='string'||!p.base||!p.proposed||![p.base.x,p.base.y,p.base.z,p.proposed.x,p.proposed.y,p.proposed.z].every(Number.isFinite)){send(conn,'ACTION_RESULT',{requestId:p.requestId||'',ok:false,message:'Invalid movement request.'});return}if(s.movementRequests.has(p.requestId))return;const request={...p,objectType,objectId,tokenId:objectType==='token'?objectId:undefined,playerName:entry.name,connection:conn,createdAt:Date.now()};s.movementRequests.set(p.requestId,request);root.WoAVTTMultiplayerHooks?.setPendingMovement?.(request);movementQueueRender();status(entry.name+' submitted a movement request.');}else if((m.type==='SNAPSHOT_RECEIVED'||m.type==='SNAPSHOT_APPLIED')&&s.approved.has(conn)){const transfer=s.snapshotTransfers.get(m.payload.transferId);if(!transfer||transfer.connection!==conn)return;if(m.type==='SNAPSHOT_RECEIVED'){transfer.receivedAt=Date.now();status(transfer.playerName+' received all scene data · revision '+transfer.revision+' · applying scene…','info')}else{transfer.appliedAt=Date.now();s.snapshotTransfers.delete(m.payload.transferId);if(transfer.requestId){send(conn,'ACTION_RESULT',{requestId:transfer.requestId,ok:true,message:'Movement approved and synchronized.'});s.movementRequests.delete(transfer.requestId);movementQueueRender()}status(transfer.playerName+' synchronized successfully · revision '+transfer.revision+'.','good')}}else if(m.type==='STATE_SNAPSHOT_REQUEST'&&s.approved.has(conn)){sendSnapshot(conn);}});conn.on('close',()=>{s.pending.delete(conn);s.approved.delete(conn);for(const [transferId,transfer] of s.snapshotTransfers){if(transfer.connection===conn)s.snapshotTransfers.delete(transferId)}for(const [requestId,request] of s.movementRequests){if(request.connection===conn){root.WoAVTTMultiplayerHooks?.clearPendingMovement?.(requestId);s.movementRequests.delete(requestId)}}movementQueueRender();queueRender();connectedPlayersRender();status('A participant disconnected.')});conn.on('error',e=>status('Player connection error: '+e.message,'error'))}
function startHost(){if(!root.Peer){status('PeerJS failed to load. Check internet access and reload.','error');return}if(s.peer)return;s.role='host';const savedHostId=storageGet('woa-vtt-host-peer-id');status(savedHostId?'Restoring GM session…':'Starting GM session…');try{s.peer=savedHostId?new Peer(savedHostId):new Peer()}catch(e){status('Could not start GM session: '+e.message,'error');return}s.peer.on('open',peerId=>{s.sessionId=peerId;storageSet('woa-vtt-host-peer-id',peerId);if(ui.invite)ui.invite.value=invitation();const roster=loadRoster(peerId);status(Object.keys(roster).length?'GM session restored. Previously approved players can reconnect automatically.':'Session ready. Share the invitation link.','good')});s.peer.on('connection',acceptConnection);s.peer.on('disconnected',()=>{status('GM signaling disconnected. Reconnecting…','error');try{s.peer?.reconnect()}catch(_){}});s.peer.on('error',e=>{if(e.type==='unavailable-id'&&savedHostId){status('Restoring GM session ID… please wait and try again in a moment.','error')}else status('PeerJS: '+e.type+' — '+e.message,'error')});setMode()}
function connectPlayer(name){
 if(!s.peer||!sessionId||s.connection?.open||s.reconnecting)return;
 s.reconnecting=true;
 const credential=savedPlayerCredential(sessionId),c=s.peer.connect(sessionId,{reliable:true});
 s.connection=c;
 c.on('open',()=>{
  s.reconnecting=false;
  send(c,'JOIN_REQUEST',{characterName:name,displayName:name,attemptId:s.attemptId||id(),reconnectToken:credential?.token||''});
  status(credential?.token?'Reconnecting to the GM session…':'Join request sent. Waiting for GM approval.');
  if(ui.playerState)ui.playerState.textContent=credential?.token?'Reconnecting to GM session…':'Request submitted. Waiting for the Game Master to approve you.';
 });
 c.on('data',raw=>{
  const v=F.validateMessage(raw);if(!v.ok){status(v.error,'error');return}
  const m=v.message;if(m.hostGeneration!==s.generation)return;
  if(m.type==='JOIN_ACCEPTED'){
   if(m.payload.reconnectToken)savePlayerCredential(sessionId,{name,token:m.payload.reconnectToken});
   status(m.payload.reconnected?'Reconnected. Restoring the tabletop…':'Approved. Waiting for the tabletop…','good');
   if(ui.playerState)ui.playerState.textContent='Approved by GM. Loading scene…';
  }else if(m.type==='JOIN_REJECTED'){
   status(m.payload.reason||'Join request declined.','error');
   if(ui.playerState)ui.playerState.textContent=(m.payload.reason||'The Game Master declined your request.')+' You may try again.';
   if(ui.joinButton)ui.joinButton.disabled=false;if(ui.name)ui.name.focus();
  }else if(m.type==='STATE_SNAPSHOT'&&m.payload.transferId){
   s.transfer={id:m.payload.transferId,total:m.payload.total,parts:new Array(m.payload.total),received:0,cameraSync:m.payload.cameraSync===true};status('Receiving GM scene…');
  }else if(m.type==='STATE_UPDATE'&&s.transfer&&m.payload.transferId===s.transfer.id){
   const t=s.transfer;
   if(Number.isInteger(m.payload.index)&&m.payload.index>=0&&m.payload.index<t.total&&typeof m.payload.data==='string'&&!t.parts[m.payload.index]){
    t.parts[m.payload.index]=m.payload.data;t.received++;
    if(t.received===t.total){
     try{
      const data=JSON.parse(t.parts.join(''));s.revision=m.revision;send(c,'SNAPSHOT_RECEIVED',{transferId:t.id,revision:m.revision});
      const applied=root.WoAVTTMultiplayerHooks?.receiveRemoteScene?.({type:'scene',data,cameraSync:t.cameraSync,onApplied:()=>{send(c,'SNAPSHOT_APPLIED',{transferId:t.id,revision:m.revision});status('GM scene applied after the active drag ended · revision '+m.revision+'.','good')}});
      if(applied===false||applied==null)throw new Error('The Player screen could not accept the received scene. Check the browser console for details.');
      if(applied===true){send(c,'SNAPSHOT_APPLIED',{transferId:t.id,revision:m.revision});status('GM scene received and applied.','good')}
      else status('GM scene received · waiting for the active drag to finish before applying.','info');
      document.body.classList.remove('player-join-gate');if(ui.playerState)ui.playerState.textContent='Connected to GM session.';
     }catch(e){status('Scene sync failed: '+e.message,'error');if(ui.playerState)ui.playerState.textContent='Scene sync failed: '+e.message}
     finally{s.transfer=null}
    }
   }
  }else if(m.type==='CAMERA_VIEW_UPDATE'){root.WoAVTTMultiplayerHooks?.receiveRemoteCamera?.(m.payload||{});}
  else if(m.type==='ACTION_RESULT'){root.WoAVTTMultiplayerHooks?.movementResult?.(m.payload||{});}
  else if(m.type==='SESSION_CLOSED'){s.intentionalClose=true;status('GM ended the session.','error');}
  else if(m.type==='ERROR')status(m.payload.message||'Session error.','error');
 });
 c.on('close',()=>{
  s.connection=null;s.reconnecting=false;
  if(s.intentionalClose)return;
  status('GM connection lost. Reconnecting automatically…','error');
  if(ui.playerState)ui.playerState.textContent='Connection interrupted. Reconnecting automatically…';
  if(!s.reconnectTimer)s.reconnectTimer=setTimeout(()=>{s.reconnectTimer=null;connectPlayer(name)},2500);
 });
 c.on('error',()=>{
  s.reconnecting=false;
  if(!s.reconnectTimer)s.reconnectTimer=setTimeout(()=>{s.reconnectTimer=null;connectPlayer(name)},3000);
 });
}
function join(){
 if(!root.Peer){status('PeerJS failed to load. Check internet access and reload.','error');return}
 const saved=savedPlayerCredential(sessionId),name=String(ui.name?.value||saved?.name||'').trim().slice(0,40);
 if(!name){if(ui.playerState)ui.playerState.textContent='Please enter your Character Name.';ui.name?.focus();return}
 if(!sessionId){status('Open the GM invitation link to join.','error');return}
 if(s.peer)return;
 storageSet('woa-vtt-player-name-'+sessionId,name);
 s.role='player';s.attemptId=id();s.intentionalClose=false;
 if(ui.joinButton)ui.joinButton.disabled=true;
 if(ui.playerState)ui.playerState.textContent='Connecting to the Game Master…';
 status('Connecting to GM…');s.peer=new Peer();
 s.peer.on('open',()=>connectPlayer(name));
 s.peer.on('disconnected',()=>{
  status('Signaling disconnected. Attempting to reconnect…','error');
  try{s.peer?.reconnect()}catch(_){}
  if(!s.reconnectTimer)s.reconnectTimer=setTimeout(()=>{s.reconnectTimer=null;connectPlayer(name)},2500);
 });
 s.peer.on('error',e=>{
  status('PeerJS: '+e.type+' — '+e.message,'error');
  if(!s.reconnectTimer)s.reconnectTimer=setTimeout(()=>{s.reconnectTimer=null;connectPlayer(name)},3000);
 });
 setMode();
}function close(destroy=true){if(s.publishTimer)clearTimeout(s.publishTimer);s.publishTimer=null;s.pendingSceneData=null;s.pendingSceneRevision=null;s.lastPublishedSceneRevision=null;s.lastPublishedSerialized=null;s.pending.forEach((_,c)=>{send(c,'SESSION_CLOSED',{});c.close()});s.approved.forEach(c=>{send(c,'SESSION_CLOSED',{});c.close()});s.pending.clear();s.approved.clear();s.movementRequests.forEach((request,requestId)=>root.WoAVTTMultiplayerHooks?.clearPendingMovement?.(requestId));s.movementRequests.clear();s.snapshotTransfers.clear();movementQueueRender();connectedPlayersRender();if(destroy&&s.peer)s.peer.destroy();s.peer=null;s.role=null;s.sessionId=null;if(ui.invite)ui.invite.value='';setMode();queueRender();status('Multiplayer session closed.')}
ui.hostButton?.addEventListener('click',startHost);ui.joinButton?.addEventListener('click',join);ui.end?.addEventListener('click',()=>close());ui.copy?.addEventListener('click',()=>{if(ui.invite?.value)navigator.clipboard?.writeText(ui.invite.value).then(()=>status('Invitation link copied.','good')).catch(()=>status('Copy failed. Select and copy the link.','error'))});
setMode();connectedPlayersRender();if(playerMode&&!sessionId)status('Open the GM invitation link to join a remote session.');if(playerMode&&sessionId){const saved=savedPlayerCredential(sessionId);if(saved?.name){if(ui.name)ui.name.value=saved.name;setTimeout(()=>join(),250)}}
root.WoAVTTMultiplayer=Object.freeze({getState:()=>({role:s.role,sessionId:s.sessionId,connectedPlayers:s.approved.size,pendingPlayers:s.pending.size,pendingMovementRequests:s.movementRequests.size,revision:s.revision}),publishScene,requestMovement:payload=>s.role==='player'&&s.connection?.open?send(s.connection,'ACTION_REQUEST',{...payload,action:'MOVE_OBJECT'}):false,close:()=>close()});
})(window);
