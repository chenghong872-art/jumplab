(() => {
  const $=id=>document.getElementById(id), video=$('video'), canvas=$('skeletonCanvas'), ctx=canvas.getContext('2d');
  const aiStatus=$('aiStatus'), toggle=$('skeletonToggle'), analyze=$('aiAnalyze'), stop=$('aiStop');
  const EDGES=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[27,31],[24,26],[26,28],[28,32]];
  let pose=null, skeletonOn=true, running=false, frameReq=0, timer=0, tMark=null, lMark=null, ground=null, samples=0, confidence=0;
  const say=t=>aiStatus.textContent=t;
  function resize(){if(video.videoWidth){canvas.width=video.videoWidth;canvas.height=video.videoHeight}}
  function draw(results){
    resize();ctx.clearRect(0,0,canvas.width,canvas.height);if(!skeletonOn||!results.poseLandmarks)return;
    const p=results.poseLandmarks;ctx.lineWidth=Math.max(2,canvas.width/320);ctx.strokeStyle='#20e0ff';ctx.fillStyle='#ffcf33';
    EDGES.forEach(([a,b])=>{if(!p[a]||!p[b])return;ctx.beginPath();ctx.moveTo(p[a].x*canvas.width,p[a].y*canvas.height);ctx.lineTo(p[b].x*canvas.width,p[b].y*canvas.height);ctx.stroke()});
    p.forEach((x,i)=>{if(i<11||!x||x.visibility<.35)return;ctx.beginPath();ctx.arc(x.x*canvas.width,x.y*canvas.height,Math.max(3,canvas.width/180),0,Math.PI*2);ctx.fill()});
  }
  function result(r){
    draw(r);const p=r.poseLandmarks;if(!running||!p||!p[27]||!p[28])return;
    confidence=Math.round(((p[27].visibility||0)+(p[28].visibility||0))*50);const y=(p[27].y+p[28].y)/2,now=video.currentTime;
    if(samples<20){ground=ground===null?y:Math.max(ground,y);samples++;say(`AI 分析中…已取得 ${samples} 個姿態影格`);return;}
    ground=Math.max(ground,y);
    if(tMark===null&&y<ground-.055){tMark=now;say(`偵測到起跳 T：${now.toFixed(3)} 秒`)}
    if(tMark!==null&&lMark===null&&y>ground-.025&&now-tMark>.08){lMark=now;running=false;video.pause();$('aiStop').disabled=true;updateResult();say(`完成：T ${tMark.toFixed(3)} 秒／L ${lMark.toFixed(3)} 秒／信心 ${confidence}%`)}
  }
  async function init(){
    if(pose)return pose;
    if(!window.Pose)throw new Error('AI 模型尚未載入，請確認網路連線後重新整理');
    pose=new Pose({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`});
    pose.setOptions({modelComplexity:1,smoothLandmarks:true,enableSegmentation:false,minDetectionConfidence:.5,minTrackingConfidence:.5});pose.onResults(result);return pose;
  }
  async function one(){if(!pose||video.readyState<2)return;await pose.send({image:video})}
  function updateResult(){if(tMark===null||lMark===null)return;const flight=Math.max(0,lMark-tMark),height=9.81*flight*flight/8*100;$('flight').textContent=flight.toFixed(3);$('height').textContent=height.toFixed(1);$('copy').disabled=false;$('saveTrial').disabled=false;$('summary').textContent=`AI 已標記起跳 ${tMark.toFixed(3)} 秒與落地 ${lMark.toFixed(3)} 秒；估算滯空 ${flight.toFixed(3)} 秒，跳高 ${height.toFixed(1)} 公分。`}
  function nextFrame(){if(!running)return;if(video.requestVideoFrameCallback){frameReq=video.requestVideoFrameCallback(async()=>{await one();nextFrame()})}else{timer=setTimeout(async()=>{await one();nextFrame()},80)}}
  toggle.onclick=async()=>{skeletonOn=!skeletonOn;canvas.hidden=!skeletonOn;toggle.textContent=`外骨骼：${skeletonOn?'開':'關'}`;if(skeletonOn){try{await init();await one()}catch(e){say(e.message)}}};
  analyze.onclick=async()=>{try{if(!video.src||!Number.isFinite(video.duration)){say('請先匯入可播放的影片');return}await init();running=true;tMark=null;lMark=null;ground=null;samples=0;confidence=0;stop.disabled=false;analyze.disabled=true;canvas.hidden=!skeletonOn;video.currentTime=0;await video.play();say('AI 分析中…請保持此頁開啟');nextFrame()}catch(e){running=false;stop.disabled=true;analyze.disabled=false;say(`AI 啟動失敗：${e.message}`)}};
  stop.onclick=()=>{running=false;video.pause();stop.disabled=true;analyze.disabled=false;if(frameReq&&video.cancelVideoFrameCallback)video.cancelVideoFrameCallback(frameReq);if(timer)clearTimeout(timer);say('AI 分析已停止，可手動標記或重新執行')};
  video.addEventListener('loadedmetadata',resize);video.addEventListener('resize',resize);
})();
