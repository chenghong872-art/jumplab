/* JumpLab AI：瀏覽器端姿態、跳躍接地與簡化跑步步態分析 */
(() => {
  const $ = id => document.getElementById(id);
  const video = $('video');
  const canvas = $('skeletonCanvas');
  const ctx = canvas.getContext('2d');
  const aiStatus = $('aiStatus');
  const toggle = $('skeletonToggle');
  const analyze = $('aiAnalyze');
  const stop = $('aiStop');
  const edges = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[27,29],[29,31],[24,26],[26,28],[28,30],[30,32]];
  const state = { pose:null, running:false, skeleton:true, frameReq:0, timer:0, groundY:null, calibration:[], liftFrames:0, contactFrames:0, jumpTakeoff:null, jumpLanding:null, gaitEvents:[], lastFootState:{left:'contact',right:'contact'}, mode:'jump', view:'side' };
  const say = text => { aiStatus.textContent = text; };
  const fps = () => Number($('fps').value) || 30;
  const visible = point => point && (point.visibility === undefined || point.visibility > .35);
  const mean = values => values.length ? values.reduce((a,b)=>a+b,0)/values.length : null;
  const points = lm => ({left:[lm[27],lm[29],lm[31]],right:[lm[28],lm[30],lm[32]]});
  const footY = (lm, side) => mean(points(lm)[side].filter(visible).map(p=>p.y));
  const contactThreshold = () => Math.max(.018,Math.min(.055,(state.groundY||.8)*.06));
  function resize(){if(video.videoWidth){canvas.width=video.videoWidth;canvas.height=video.videoHeight;}}
  function draw(results){
    resize();ctx.clearRect(0,0,canvas.width,canvas.height);if(!state.skeleton||!results.poseLandmarks)return;
    const lm=results.poseLandmarks;ctx.lineWidth=Math.max(2,canvas.width/320);ctx.strokeStyle='#20e0ff';ctx.fillStyle='#ffcf33';
    edges.forEach(([a,b])=>{if(!visible(lm[a])||!visible(lm[b]))return;ctx.beginPath();ctx.moveTo(lm[a].x*canvas.width,lm[a].y*canvas.height);ctx.lineTo(lm[b].x*canvas.width,lm[b].y*canvas.height);ctx.stroke();});
    lm.forEach((p,i)=>{if(i<11||!visible(p))return;ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,Math.max(3,canvas.width/180),0,Math.PI*2);ctx.fill();});
    if(state.groundY!==null){ctx.strokeStyle='#ffb020';ctx.lineWidth=2;ctx.setLineDash([8,6]);ctx.beginPath();ctx.moveTo(0,state.groundY*canvas.height);ctx.lineTo(canvas.width,state.groundY*canvas.height);ctx.stroke();ctx.setLineDash([]);}
  }
  function updateJumpResult(){if(state.jumpTakeoff===null||state.jumpLanding===null)return;const flight=Math.max(0,state.jumpLanding-state.jumpTakeoff),height=9.81*flight*flight/8*100;$('flight').textContent=flight.toFixed(3);$('height').textContent=height.toFixed(1);$('copy').disabled=false;$('saveTrial').disabled=false;$('summary').textContent=`AI 判定：腳底離地 ${state.jumpTakeoff.toFixed(3)} 秒，再次接地 ${state.jumpLanding.toFixed(3)} 秒；滯空 ${flight.toFixed(3)} 秒，跳高 ${height.toFixed(1)} 公分。`;}
  function registerGaitEvent(side,time,type){const last=state.gaitEvents[state.gaitEvents.length-1];if(last&&last.side===side&&last.type===type&&time-last.time<.18)return;state.gaitEvents.push({side,time,type});}
  function updateGaitResult(){const contacts=state.gaitEvents.filter(e=>e.type==='contact'),duration=contacts.length>1?contacts[contacts.length-1].time-contacts[0].time:0,cadence=duration>0?contacts.length/duration*60:0,text=`步數 ${contacts.length}｜步頻 ${cadence?cadence.toFixed(1):'—'} 步／分鐘｜${state.view==='side'?'側面':'正面'}分析`;$('summary').textContent=`跑步步態：${text}。這是 2D 影像估算，未包含實際距離比例。`;say(`步態分析中：${text}`);}
  function analyzeFrame(results){
    draw(results);const lm=results.poseLandmarks;if(!state.running||!lm)return;const leftY=footY(lm,'left'),rightY=footY(lm,'right'),values=[leftY,rightY].filter(x=>x!==null);if(!values.length)return;const now=video.currentTime,y=mean(values);
    if(state.mode==='jump'){
      if(state.calibration.length<24){state.calibration.push(y);state.groundY=Math.max(...state.calibration);say(`建立地面基準…${state.calibration.length}/24 個影格`);return;}
      const airborne=y<state.groundY-contactThreshold();
      if(state.jumpTakeoff===null){state.liftFrames=airborne?state.liftFrames+1:0;if(state.liftFrames>=3){state.jumpTakeoff=now;say(`腳底離地，起飛時間 ${now.toFixed(3)} 秒`);}}
      else if(state.jumpLanding===null){state.contactFrames=airborne?0:state.contactFrames+1;if(state.contactFrames>=4&&now-state.jumpTakeoff>.08){state.jumpLanding=now;state.running=false;video.pause();stop.disabled=true;analyze.disabled=false;updateJumpResult();say(`完成：離地 ${state.jumpTakeoff.toFixed(3)} 秒／接地 ${state.jumpLanding.toFixed(3)} 秒／滯空 ${(state.jumpLanding-state.jumpTakeoff).toFixed(3)} 秒`);}}
    }else{
      [['left',leftY],['right',rightY]].forEach(([side,value])=>{if(value===null)return;const baseline=state.groundY===null?value:state.groundY,contact=value>=baseline-contactThreshold(),previous=state.lastFootState[side];if(contact&&previous==='air')registerGaitEvent(side,now,'contact');if(!contact&&previous==='contact')registerGaitEvent(side,now,'flight');state.lastFootState[side]=contact?'contact':'air';});state.groundY=Math.max(state.groundY||0,y);updateGaitResult();
    }
  }
  async function init(){if(state.pose)return state.pose;if(!window.Pose)throw new Error('姿態模型尚未載入，請確認網路連線後重新整理');state.pose=new Pose({locateFile:file=>`https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`});state.pose.setOptions({modelComplexity:1,smoothLandmarks:true,enableSegmentation:false,minDetectionConfidence:.55,minTrackingConfidence:.55});state.pose.onResults(analyzeFrame);return state.pose;}
  async function oneFrame(){if(state.pose&&video.readyState>=2)await state.pose.send({image:video});}
  function nextFrame(){if(!state.running)return;if(video.requestVideoFrameCallback)state.frameReq=video.requestVideoFrameCallback(async()=>{await oneFrame();nextFrame();});else state.timer=setTimeout(async()=>{await oneFrame();nextFrame();},80);}
  toggle.onclick=async()=>{state.skeleton=!state.skeleton;canvas.hidden=!state.skeleton;toggle.textContent=`外骨骼：${state.skeleton?'開':'關'}`;if(state.skeleton){try{await init();await oneFrame();}catch(e){say(e.message);}}};
  analyze.onclick=async()=>{try{if(!video.src||!Number.isFinite(video.duration)){say('請先匯入可播放的影片');return;}await init();state.mode=$('gaitMode')?.value||'jump';state.view=$('viewMode')?.value||'side';state.running=true;state.groundY=null;state.calibration=[];state.liftFrames=0;state.contactFrames=0;state.jumpTakeoff=null;state.jumpLanding=null;state.gaitEvents=[];state.lastFootState={left:'contact',right:'contact'};$('flight').textContent='—';$('height').textContent='—';$('copy').disabled=true;$('saveTrial').disabled=true;stop.disabled=false;analyze.disabled=true;canvas.hidden=!state.skeleton;video.currentTime=0;await video.play();say(state.mode==='jump'?'跳躍分析中：先建立地面基準…':'跑步步態分析中：偵測左右腳交替接觸…');nextFrame();}catch(e){state.running=false;stop.disabled=true;analyze.disabled=false;say(`AI 啟動失敗：${e.message}`);}};
  stop.onclick=()=>{state.running=false;video.pause();stop.disabled=true;analyze.disabled=false;if(state.frameReq&&video.cancelVideoFrameCallback)video.cancelVideoFrameCallback(state.frameReq);if(state.timer)clearTimeout(state.timer);say('AI 已停止，可重新分析或手動複核');};
  video.addEventListener('loadedmetadata',resize);video.addEventListener('resize',resize);
})();
