const $ = (s) => document.querySelector(s);
const form = $('#drawForm'), namesInput = $('#names'), winnerInput = $('#winnerCount');
const setup = $('#setup'), factory = $('#factory'), canvas = $('#factoryCanvas'), ctx = canvas.getContext('2d');
const DURATION = 21000;
let state = {running:false, paused:false, elapsed:0, last:0, cargo:[], winners:[], announced:new Set(), raf:0};
let duplicateConfirmedFor = '';

function parsedNames(){ return namesInput.value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean); }
function updateInput(){
  const list=parsedNames(), counts=new Map(); list.forEach(n=>counts.set(n,(counts.get(n)||0)+1));
  const dupes=[...counts].filter(([,n])=>n>1).map(([n,c])=>`${n} × ${c}`);
  $('#participantCount').textContent=list.length;
  $('#duplicateNotice').hidden=!dupes.length;
  $('#duplicateNotice').textContent=dupes.length ? `⚠ 중복 이름이 있어요: ${dupes.join(', ')} (각각 별도 참가자로 추첨됩니다)` : '';
}
namesInput.addEventListener('input',updateInput); winnerInput.addEventListener('input',()=>$('#error').textContent='');
document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{winnerInput.value=Math.max(1,(+winnerInput.value||1)+(+b.dataset.step));});

function randomInt(max){
  if(max<=0) return 0; const limit=0x100000000-(0x100000000%max), a=new Uint32Array(1); let v;
  do{crypto.getRandomValues(a);v=a[0];}while(v>=limit); return v%max;
}
function fairShuffle(items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function colorFor(i){return ['#20c7d4','#ff6b2c','#ffc928','#a78bfa','#34d399','#fb7185'][i%6];}
const lerp=(a,b,t)=>a+(b-a)*t, clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
function pointPath(points,t){const n=points.length-1, p=clamp(t)*n, i=Math.min(n-1,Math.floor(p)), f=p-i;return{x:lerp(points[i][0],points[i+1][0],f),y:lerp(points[i][1],points[i+1][1],f)};}

function buildCargo(names,count){
  const entrants=names.map((name,id)=>({name,id})); const shuffled=fairShuffle(entrants); const winners=shuffled.slice(0,count);
  const winnerOrder=fairShuffle(winners); const winRank=new Map(winnerOrder.map((p,i)=>[p.id,i]));
  state.winners=winnerOrder;
  state.cargo=entrants.map((p,i)=>{const rank=winRank.get(p.id);return{...p,color:colorFor(i),winner:rank!==undefined,rank,offset:i*120+(randomInt(50)),lane:randomInt(2),hold:randomInt(3),spin:randomInt(360)};});
}

form.addEventListener('submit',e=>{
  e.preventDefault(); const names=parsedNames(), wc=Number(winnerInput.value), err=$('#error');
  if(!names.length){err.textContent='참여자를 한 명 이상 입력해 주세요.';return;}
  if(!Number.isInteger(wc)||wc<1){err.textContent='당첨자 수를 1명 이상 입력해 주세요.';return;}
  if(wc>names.length){err.textContent=`당첨자 수는 참가자 ${names.length}명보다 많을 수 없습니다.`;return;}
  const signature=names.join('\n'), unique=new Set(names);
  if(unique.size!==names.length&&duplicateConfirmedFor!==signature){
    if(!window.confirm('중복된 이름을 각각 별도 참가자로 포함해 추첨할까요?')) return;
    duplicateConfirmedFor=signature;
  }
  err.textContent=''; buildCargo(names,wc); setup.hidden=true; factory.hidden=false; startRun();
});

function startRun(){
  state.running=true;state.paused=false;state.elapsed=0;state.last=performance.now();state.announced.clear();
  $('#liveParticipants').textContent=state.cargo.length;$('#winnerProgress').textContent=`0 / ${state.winners.length}`;
  $('#resultPanel').hidden=true;$('#restartBtn').disabled=true;$('#resetBtn').disabled=true;$('#pauseBtn').disabled=false;$('#pauseBtn').textContent='Ⅱ 일시정지';
  cancelAnimationFrame(state.raf);state.raf=requestAnimationFrame(loop);
}
$('#pauseBtn').onclick=()=>{if(!state.running)return;state.paused=!state.paused;$('#pauseBtn').textContent=state.paused?'▶ 재개':'Ⅱ 일시정지';if(!state.paused){state.last=performance.now();state.raf=requestAnimationFrame(loop);}};
$('#restartBtn').onclick=()=>{buildCargo(state.cargo.map(c=>c.name),state.winners.length);startRun();};
$('#resetBtn').onclick=()=>{factory.hidden=true;setup.hidden=false;window.scrollTo({top:0,behavior:'smooth'});};

function phase(p){if(p<.18)return['화물 투입','입구 컨베이어'];if(p<.43)return['교반 공정','회전 분배기'];if(p<.67)return['경로 재배치','로봇 푸셔 · 대기 게이트'];if(p<.84)return['최종 검사','합류 컨베이어'];return['당첨 분류','행운 게이트 작동 중'];}
function loop(now){if(!state.running||state.paused)return;state.elapsed+=Math.min(50,now-state.last);state.last=now;const p=clamp(state.elapsed/DURATION);draw(p);const ph=phase(p);$('#statusText').textContent=ph[0];$('#phaseText').textContent=ph[1];$('#progressBar').style.width=`${p*100}%`;announce(p);if(p<1)state.raf=requestAnimationFrame(loop);else finish();}

function draw(p){
  const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.fillStyle='#172130';ctx.fillRect(0,0,w,h);grid(w,h);machines(p);
  [...state.cargo].sort((a,b)=>a.id-b.id).forEach(c=>drawCargo(c,p));
}
function grid(w,h){ctx.strokeStyle='#243247';ctx.lineWidth=1;for(let x=0;x<w;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}for(let y=0;y<h;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}}
function belt(x,y,w,h,vertical=false){ctx.fillStyle='#27364b';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#536378';ctx.lineWidth=3;ctx.strokeRect(x,y,w,h);ctx.strokeStyle='#172130';ctx.lineWidth=7;const off=(state.elapsed/25)%38;for(let i=-40;i<(vertical?h:w)+40;i+=38){ctx.beginPath();if(vertical){ctx.moveTo(x,i+off);ctx.lineTo(x+w,i+off)}else{ctx.moveTo(i+off,y);ctx.lineTo(i+off,y+h)}ctx.stroke()}}
function label(text,x,y,color='#9fb0c3'){ctx.fillStyle=color;ctx.font='700 13px monospace';ctx.fillText(text,x,y)}
function machines(p){
  belt(20,322,335,92);belt(455,185,270,76);belt(455,478,270,76);belt(790,322,310,92);belt(1090,258,150,86,true);
  label('01 / INFEED',22,304);label('02 / ROTARY MIXER',400,115);label('03A / FAST LANE',470,170);label('03B / HOLD LANE',470,575);label('04 / MERGE',790,304);label('05 / LUCK GATE',1070,232,'#ffc928');
  ctx.save();ctx.translate(405,368);ctx.rotate(state.elapsed/650);ctx.fillStyle='#33465c';ctx.strokeStyle='#18c6d3';ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,82,0,Math.PI*2);ctx.fill();ctx.stroke();for(let i=0;i<6;i++){ctx.rotate(Math.PI/3);ctx.fillStyle='#18c6d3';ctx.fillRect(15,-5,52,10)}ctx.restore();
  const arm=Math.sin(state.elapsed/420)*.35;ctx.save();ctx.translate(750,365);ctx.rotate(arm);ctx.strokeStyle='#ff6b2c';ctx.lineWidth=20;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(90,0);ctx.stroke();ctx.fillStyle='#ffc928';ctx.beginPath();ctx.arc(0,0,23,0,7);ctx.fill();ctx.fillStyle='#ff6b2c';ctx.fillRect(78,-22,16,44);ctx.restore();
  const gateOpen=Math.sin(state.elapsed/550)>-.15;ctx.strokeStyle=gateOpen?'#34d399':'#fb7185';ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(1092,320);ctx.lineTo(1092,gateOpen?265:405);ctx.stroke();ctx.fillStyle=gateOpen?'#34d399':'#fb7185';ctx.beginPath();ctx.arc(1092,245,9,0,7);ctx.fill();
  ctx.fillStyle='#ffc92818';ctx.fillRect(1110,80,150,160);ctx.strokeStyle='#ffc928';ctx.lineWidth=3;ctx.strokeRect(1110,80,150,160);label('★ WINNER DOCK',1121,108,'#ffc928');
  ctx.fillStyle='#fb718514';ctx.fillRect(1110,480,150,150);ctx.strokeStyle='#fb7185';ctx.strokeRect(1110,480,150,150);label('RETURN LINE',1133,608,'#fb7185');
}
function cargoProgress(c,p){return clamp((p*DURATION-c.offset)/(DURATION-c.offset-700));}
function cargoPoint(c,p){
  let t=cargoProgress(c,p); const lane=c.lane?1:-1;
  const common=[[30,368],[210,368],[350,368],[405,368]];
  if(t<.36)return pointPath(common,t/.36);
  if(t<.47){const a=(t-.36)/.11*Math.PI*1.5+c.spin;return{x:405+Math.cos(a)*64,y:368+Math.sin(a)*64};}
  const branchY=lane>0?516:223;
  if(t<.68){let u=(t-.47)/.21;if(c.hold===1)u=clamp(u*1.45)-(u>.38&&u<.7?.18:0);return pointPath([[405,368],[490,branchY],[660,branchY],[790,368]],u);}
  if(t<.84)return pointPath([[790,368],[920,368],[1055,368]],(t-.68)/.16);
  const step=.12/Math.max(1,state.winners.length-1), finalStart=.84+(c.winner?c.rank*step:0); if(t<finalStart)return{x:1055,y:368};
  const u=clamp((t-finalStart)/(1-finalStart));
  return c.winner?pointPath([[1055,368],[1135,340],[1180,260],[1180,168]],u):pointPath([[1055,368],[1135,400],[1180,475],[1180,550]],u);
}
function rounded(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function drawCargo(c,p){const pos=cargoPoint(c,p),t=cargoProgress(c,p);ctx.save();ctx.translate(pos.x,pos.y);if(c.winner&&t>.96){ctx.shadowColor='#ffc928';ctx.shadowBlur=26}ctx.fillStyle=c.color;rounded(-42,-23,84,46,7);ctx.fill();ctx.strokeStyle=c.winner&&t>.96?'#fff3a3':'#0e1724';ctx.lineWidth=3;ctx.stroke();ctx.fillStyle='#fff';rounded(-35,-13,70,26,4);ctx.fill();ctx.fillStyle='#111827';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`700 ${c.name.length>7?10:12}px "Noto Sans KR"`;ctx.fillText(c.name.length>10?c.name.slice(0,9)+'…':c.name,0,0);ctx.fillStyle='#111827';ctx.fillRect(-25,-28,11,7);ctx.fillRect(14,-28,11,7);ctx.restore()}
function announce(p){state.winners.forEach((w,i)=>{const threshold=.90+i*(.09/Math.max(1,state.winners.length-1));if(p>=threshold&&!state.announced.has(i)){state.announced.add(i);$('#winnerProgress').textContent=`${i+1} / ${state.winners.length}`;const toast=$('#winnerToast');toast.textContent=`★ ${i+1}번째 당첨 화물 · ${w.name}`;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),Math.min(1900,9000/state.winners.length));confetti();}})}
function confetti(){for(let i=0;i<28;i++){const s=document.createElement('i');Object.assign(s.style,{position:'absolute',zIndex:9,left:`${45+Math.random()*10}%`,top:'12%',width:'6px',height:'10px',background:colorFor(i),pointerEvents:'none',transition:'transform 1.4s ease-in, opacity 1.4s'});$('.canvas-wrap').append(s);requestAnimationFrame(()=>{s.style.transform=`translate(${(Math.random()-.5)*500}px,${170+Math.random()*260}px) rotate(${Math.random()*720}deg)`;s.style.opacity='0'});setTimeout(()=>s.remove(),1500)}}
function finish(){state.running=false;$('#statusText').textContent='추첨 완료';$('#phaseText').textContent='모든 당첨 화물 배송 완료';$('#pauseBtn').disabled=true;$('#restartBtn').disabled=false;$('#resetBtn').disabled=false;$('#resultPanel').hidden=false;$('#winnerList').innerHTML=state.winners.map((w,i)=>`<span><small>${i+1}</small> ${escapeHtml(w.name)}</span>`).join('');$('#resultPanel').scrollIntoView({behavior:'smooth',block:'nearest'});}
function escapeHtml(v){const d=document.createElement('div');d.textContent=v;return d.innerHTML;}
updateInput();draw(0);
