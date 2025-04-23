// public/flappy_quakks/script.js

console.log('✅ script.js loaded');

// — Canvas & ctx
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
const WIDTH  = canvas.width;
const HEIGHT = canvas.height;

// — Game constants
const FPS        = 30;
const GRAVITY    = 900;    // px/s²
const FLAP_V     = -200;   // px/s
const PIPE_SPEED = 200;    // px/s
const SPAWN_INT  = 1.5;    // s between pipes
const PIPE_GAP   = 200;    // px gap

// — Asset paths
const PATH = '/flappy_quakks/assets/';
const SPRITES = {
  bg:    [PATH+'sprites/background-day.png', PATH+'sprites/background-night.png'],
  pipe:  [PATH+'sprites/pipe-green.png',     PATH+'sprites/pipe-red.png'],
  base:  PATH+'sprites/base.png',
  bird:  [PATH+'sprites/duck.png',           PATH+'sprites/duck.png',           PATH+'sprites/duck.png'],
  nums:  Array.from({length:10},(_,i)=>PATH+`sprites/${i}.png`),
  msg:   PATH+'sprites/message.png',
  over:  PATH+'sprites/gameover.png'
};
const SOUNDS = {
  die:   PATH+'audio/die.ogg',
  hit:   PATH+'audio/hit.ogg',
  point: PATH+'audio/point.ogg',
  wing:  PATH+'audio/wing.ogg'
};

// — State
let state      = 'WELCOME'; // 'WELCOME' → 'LEADERBOARD' → 'PLAY' → 'GAMEOVER'
let lastTime   = 0;
let spawnTimer = 0;
let score      = 0;
let pipes      = [];
let baseX      = 0;
let topList    = [];       // fetched leaderboard

// — Bird
const BIRD_W     = 34, BIRD_H = 24, BIRD_SCALE = 1.5;
const bird = {
  x: WIDTH * 0.2,
  y: (HEIGHT - BIRD_H * BIRD_SCALE) / 2,
  vy: 0,
  w: BIRD_W * BIRD_SCALE,
  h: BIRD_H * BIRD_SCALE,
  frame: 0,
  flapped: false
};

// — Assets containers
const IMG = { bg: [], pipe: [], bird: [], nums: [], base: null, msg: null, over: null };
const AUD = {};
let loaded = 0;
const TOTAL = SPRITES.bg.length
              + SPRITES.pipe.length
              + 1              // base
              + SPRITES.bird.length
              + SPRITES.nums.length
              + 1              // message
              + 1              // gameover
              + Object.keys(SOUNDS).length;

// — Helpers
function randInt(min,max){ return Math.floor(min + Math.random()*(max-min+1)); }
function intersect(a,b){ return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y; }

// — Load images
SPRITES.bg.forEach((u,i)=>{
  const img=new Image(); img.src=u;
  img.onload=()=>{ IMG.bg[i]=img; if(++loaded===TOTAL) gameInit(); };
});
SPRITES.pipe.forEach((u,i)=>{
  const img=new Image(); img.src=u;
  img.onload=()=>{ IMG.pipe[i]=img; if(++loaded===TOTAL) gameInit(); };
});
{
  const img=new Image(); img.src=SPRITES.base;
  img.onload=()=>{ IMG.base=img; if(++loaded===TOTAL) gameInit(); };
}
SPRITES.bird.forEach((u,i)=>{
  const img=new Image(); img.src=u;
  img.onload=()=>{ IMG.bird[i]=img; if(++loaded===TOTAL) gameInit(); };
});
SPRITES.nums.forEach((u,i)=>{
  const img=new Image(); img.src=u;
  img.onload=()=>{ IMG.nums[i]=img; if(++loaded===TOTAL) gameInit(); };
});
{
  const m=new Image(); m.src=SPRITES.msg;
  m.onload=()=>{ IMG.msg=m; if(++loaded===TOTAL) gameInit(); };
  const o=new Image(); o.src=SPRITES.over;
  o.onload=()=>{ IMG.over=o; if(++loaded===TOTAL) gameInit(); };
}
// — Load sounds
Object.entries(SOUNDS).forEach(([k,u])=>{
  const a=new Audio(u);
  a.oncanplaythrough=()=>{ AUD[k]=a; if(++loaded===TOTAL) gameInit(); };
});

// — This was init(), now uniquely named
function gameInit(){
  drawWelcome();
  lastTime = performance.now();
  setInterval(gameLoop, 1000/FPS);
}

// — Pipe creation
function createPipe(x){
  const baseY = HEIGHT;
  const range = Math.floor(baseY * .6) - PIPE_GAP;
  const gapY  = randInt(0, range) + Math.floor(baseY * .2);
  return { x, y: gapY, scored: false };
}
function spawnInitial(){
  pipes = [];
  const pw = IMG.pipe[0].width, fx = WIDTH + pw*3;
  pipes.push(createPipe(fx));
  pipes.push(createPipe(fx + pw*3.5));
}
function spawnPipe(){
  pipes.push(createPipe(WIDTH + 10));
}

// — Buttons
const Btn = {
  start:      { x: WIDTH/2 - 75, y:300, w:150, h:50, label:'Start' },
  leaderboard:{ x: WIDTH/2 - 75, y:370, w:150, h:50, label:'Leaderboard' }
};
function isInside(mx,my,b){ return mx>=b.x && mx<=b.x+b.w && my>=b.y && my<=b.y+b.h; }

// — Click handling
canvas.addEventListener('click', e=>{
  const r=canvas.getBoundingClientRect();
  const mx=e.clientX-r.left, my=e.clientY-r.top;
  if(state==='WELCOME'){
    if(isInside(mx,my,Btn.start))      startPlay();
    else if(isInside(mx,my,Btn.leaderboard)) fetchLeaderboard();
  }
  else if(state==='LEADERBOARD'){
    state='WELCOME'; drawWelcome();
  }
  else if(state==='GAMEOVER'){
    state='WELCOME'; drawWelcome();
  }
});

// — Draw Welcome
function drawWelcome(){
  ctx.drawImage(IMG.bg[0],0,0);
  ctx.drawImage(IMG.msg,(WIDTH-IMG.msg.width)/2,HEIGHT*0.12);
  bird.frame=(bird.frame+1)%3;
  const shim=8*Math.sin(performance.now()/200);
  ctx.drawImage(IMG.bird[bird.frame], bird.x, bird.y+shim, bird.w, bird.h);
  [Btn.start,Btn.leaderboard].forEach(b=>{
    ctx.fillStyle='#fff'; ctx.fillRect(b.x,b.y,b.w,b.h);
    ctx.fillStyle='#000'; ctx.font='20px Arial';
    ctx.fillText(b.label, b.x+(b.w/2-ctx.measureText(b.label).width/2),b.y+32);
  });
  tileBase();
}

// — Leaderboard fetch & draw
async function fetchLeaderboard(){
  try {
    const res = await fetch('/flappy_quakks/leaderboard');
    topList = await res.json();
    state='LEADERBOARD';
    drawLeaderboard();
  } catch(e){
    console.error('Failed to load leaderboard', e);
  }
}
function drawLeaderboard(){
  ctx.drawImage(IMG.bg[1],0,0);
  ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(0,0,WIDTH,HEIGHT);
  ctx.fillStyle='#fff'; ctx.font='24px Arial';
  ctx.fillText('🏆 Top 10', WIDTH/2-50,50);
  ctx.font='18px Arial';
  topList.forEach((e,i)=>{
    ctx.fillText(`${i+1}. ${e.username}: ${e.score}`,30,100+i*30);
  });
  ctx.fillText('Tap to go back', WIDTH/2-60, HEIGHT-40);
}

// — Start PLAY
function startPlay(){
  state='PLAY';
  score=0; bird.vy=0; bird.y=(HEIGHT-bird.h)/2;
  spawnTimer=-SPAWN_INT;
  lastTime=performance.now();
  spawnInitial();
  AUD.wing.play();
}

// — Game loop
function gameLoop(){
  if(state==='PLAY'){
    updatePlay();
    drawPlay();
  }
}

// — Update PLAY
function updatePlay(){
  const now=performance.now(), dt=(now-lastTime)/1000;
  lastTime=now;
  spawnTimer+=dt;
  if(spawnTimer>=SPAWN_INT){ spawnPipe(); spawnTimer-=SPAWN_INT; }
  const pv=PIPE_SPEED*dt;
  pipes.forEach(p=>p.x-=pv);
  pipes=pipes.filter(p=>p.x+IMG.pipe[0].width>0);
  bird.vy+=GRAVITY*dt;
  if(bird.flapped){ bird.vy=FLAP_V; bird.flapped=false; AUD.wing.play(); }
  bird.y+=bird.vy*dt;
  if(bird.y<0||bird.y+bird.h>HEIGHT*0.79) return handleGameOver();
  pipes.forEach(p=>{
    const pw=IMG.pipe[0].width,ph=IMG.pipe[0].height;
    const topR={x:p.x,y:p.y-ph,w:pw,h:ph},
          botR={x:p.x,y:p.y+PIPE_GAP,w:pw,h:ph},
          bR={x:bird.x,y:bird.y,w:bird.w,h:bird.h};
    if(intersect(bR,topR)||intersect(bR,botR)) return handleGameOver();
    if(!p.scored&&p.x+pw<bird.x){ p.scored=true; score++; AUD.point.play(); }
  });
}

// — Draw PLAY
function drawPlay(){
  ctx.drawImage(IMG.bg[1],0,0);
  pipes.forEach(p=>{
    const pw=IMG.pipe[0].width,ph=IMG.pipe[0].height;
    ctx.save(); ctx.translate(p.x+pw/2,p.y); ctx.scale(1,-1);
    ctx.drawImage(IMG.pipe[0],-pw/2,0); ctx.restore();
    ctx.drawImage(IMG.pipe[0],p.x,p.y+PIPE_GAP);
  });
  ctx.drawImage(IMG.bird[bird.frame],bird.x,bird.y,bird.w,bird.h);
  // score
  let totalW=0,digits=Array.from(String(score),Number);
  digits.forEach(d=>totalW+=IMG.nums[d].width);
  let x0=(WIDTH-totalW)/2;
  digits.forEach(d=>{
    ctx.drawImage(IMG.nums[d],x0,20);
    x0+=IMG.nums[d].width;
  });
  tileBase();
}

// — Tile base
function tileBase(){
  const b=IMG.base,by=HEIGHT-b.height;
  baseX=(baseX-2)%b.width;
  for(let x=baseX-b.width;x<WIDTH;x+=b.width){
    ctx.drawImage(b,x,by);
  }
}

// — Game over
async function handleGameOver(){
  if(state!=='PLAY') return;
  state='GAMEOVER';
  AUD.hit.play(); AUD.die.play();
  const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
  const username = user?.username
    ? '@'+user.username
    : (user?.first_name||'user')+'_'+(user?.id||'0');
  try {
    await fetch('/flappy_quakks/submit',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({username,score})
    });
  } catch(_){/*ignore*/}
  await fetchLeaderboard();
}

// — Reset to welcome
function resetGame(){
  state='WELCOME';
  drawWelcome();
}

// — Kick off
lastTime = performance.now();
