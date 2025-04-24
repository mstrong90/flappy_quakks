// public/flappy_quakks/script.js

console.log('✅ script.js loaded');

// — Canvas & context
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
const PATH = 'assets/';
const SPRITES = {
  bg:    [PATH+'sprites/background-day.png', PATH+'sprites/background-night.png'],
  pipe:  [PATH+'sprites/pipe-green.png',     PATH+'sprites/pipe-red.png'],
  base:  PATH+'sprites/base.png',
  bird:  [PATH+'sprites/duck.png', PATH+'sprites/duck.png', PATH+'sprites/duck.png'],
  nums:  Array.from({length:10},(_,i)=> PATH+`sprites/${i}.png`),
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
let state      = 'WELCOME';   // WELCOME → LEADERBOARD → PLAY → GAMEOVER
let lastTime   = 0;
let spawnTimer = 0;
let score      = 0;
let pipes      = [];
let baseX      = 0;
let topList    = [];

// — Duck
const BIRD_W     = 34, BIRD_H = 24, BIRD_SCALE = 1.5;
const bird = {
  x:      WIDTH * 0.2,
  y:      (HEIGHT - BIRD_H * BIRD_SCALE) / 2,
  vy:     0,
  w:      BIRD_W * BIRD_SCALE,
  h:      BIRD_H * BIRD_SCALE,
  frame:  0,
  flapped:false
};

// — Asset containers
const IMG = { bg:[], pipe:[], bird:[], nums:[], base:null, msg:null, over:null };
const AUD = {};
let loadedImages = 0;

// count only images before init; audio loads in background
const TOTAL_IMAGES =
  SPRITES.bg.length +
  SPRITES.pipe.length +
  1 +                  // base
  SPRITES.bird.length +
  SPRITES.nums.length +
  1 +                  // message
  1;                   // gameover

// — Helpers
function randInt(min,max){ return Math.floor(min + Math.random()*(max-min+1)); }
function intersect(a,b){
  return a.x < b.x + b.w &&
         a.x + a.w > b.x &&
         a.y < b.y + b.h &&
         a.y + a.h > b.y;
}

// — Load images
SPRITES.bg.forEach((url,i)=>{
  const img = new Image(); img.src = url;
  img.onload = ()=>{ IMG.bg[i]=img; if(++loadedImages===TOTAL_IMAGES) init(); };
});
SPRITES.pipe.forEach((url,i)=>{
  const img = new Image(); img.src = url;
  img.onload = ()=>{ IMG.pipe[i]=img; if(++loadedImages===TOTAL_IMAGES) init(); };
});
{
  const img = new Image(); img.src = SPRITES.base;
  img.onload = ()=>{ IMG.base=img; if(++loadedImages===TOTAL_IMAGES) init(); };
}
SPRITES.bird.forEach((url,i)=>{
  const img = new Image(); img.src = url;
  img.onload = ()=>{ IMG.bird[i]=img; if(++loadedImages===TOTAL_IMAGES) init(); };
});
SPRITES.nums.forEach((url,i)=>{
  const img = new Image(); img.src = url;
  img.onload = ()=>{ IMG.nums[i]=img; if(++loadedImages===TOTAL_IMAGES) init(); };
});
{
  const m = new Image(), o = new Image();
  m.src = SPRITES.msg; o.src = SPRITES.over;
  m.onload = ()=>{ IMG.msg=m; if(++loadedImages===TOTAL_IMAGES) init(); };
  o.onload = ()=>{ IMG.over=o; if(++loadedImages===TOTAL_IMAGES) init(); };
}

// — Load sounds (non-blocking)
Object.entries(SOUNDS).forEach(([k,u])=>{
  const a = new Audio(u);
  a.load();
  AUD[k] = a;
});

// — Called once all images are ready
function init(){
  drawWelcome();
  lastTime = performance.now();
  setInterval(gameLoop, 1000/FPS);
}

// — Pipe spawning
function createPipe(x){
  const range = Math.floor(HEIGHT * 0.6) - PIPE_GAP;
  const gapY  = randInt(0, range) + Math.floor(HEIGHT * 0.2);
  return { x, y: gapY, scored: false };
}
function spawnInitial(){
  pipes = [];
  const pw = IMG.pipe[0].width, fx = WIDTH + pw*3;
  pipes.push(createPipe(fx), createPipe(fx + pw*3.5));
}
function spawnPipe(){
  pipes.push(createPipe(WIDTH + 10));
}

// — Buttons (fixed height + label)
const Btn = {
  start:      { x:WIDTH/2-75, y:300, w:150, h:50, label:'Start'       },
  leaderboard:{ x:WIDTH/2-75, y:370, w:150, h:50, label:'Leaderboard' }
};
function isInside(mx,my,b){
  return mx>=b.x && mx<=b.x+b.w && my>=b.y && my<=b.y+b.h;
}

// — Pointer handler for both click & touch
canvas.addEventListener('click',         handlePointer);
canvas.addEventListener('touchstart',    e=>{
  e.preventDefault(); // stop scroll
  handlePointer(e);
}, { passive:false });

function handlePointer(e){
  // compute mx,my relative to canvas
  let clientX, clientY;
  if (e && e.type === 'touchstart') {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }
  const rect = canvas.getBoundingClientRect();
  const mx = clientX - rect.left;
  const my = clientY - rect.top;

  if (state === 'WELCOME') {
    if      (isInside(mx,my,Btn.start))       startPlay();
    else if (isInside(mx,my,Btn.leaderboard)) fetchLeaderboard();
  }
  else if (state === 'PLAY') {
    bird.flapped = true;
  }
  else if (state==='LEADERBOARD' || state==='GAMEOVER') {
    state = 'WELCOME';
    drawWelcome();
  }
}

// — Draw WELCOME (base behind buttons)
function drawWelcome(){
  ctx.drawImage(IMG.bg[0],0,0);
  tileBase();

  ctx.drawImage(IMG.msg,(WIDTH-IMG.msg.width)/2,HEIGHT*0.12);

  bird.frame = (bird.frame+1)%3;
  const shim = 8*Math.sin(performance.now()/200);
  ctx.drawImage(IMG.bird[bird.frame], bird.x, bird.y+shim, bird.w, bird.h);

  // buttons on top
  [Btn.start, Btn.leaderboard].forEach(b=>{
    ctx.fillStyle='#fff'; ctx.fillRect(b.x,b.y,b.w,b.h);
    ctx.fillStyle='#000'; ctx.font='20px Arial';
    ctx.fillText(
      b.label,
      b.x + (b.w/2 - ctx.measureText(b.label).width/2),
      b.y+32
    );
  });
}

// — Fetch & draw LEADERBOARD
async function fetchLeaderboard(){
  try {
    const res = await fetch('leaderboard');
    topList = await res.json();
    state = 'LEADERBOARD';
    drawLeaderboard();
  } catch(err){
    console.error('Failed loading leaderboard', err);
  }
}
function drawLeaderboard(){
  ctx.drawImage(IMG.bg[1],0,0);
  ctx.fillStyle='rgba(0,0,0,0.7)';
  ctx.fillRect(0,0,WIDTH,HEIGHT);
  ctx.fillStyle='#fff'; ctx.font='24px Arial';
  ctx.fillText('🏆 Top 10', WIDTH/2-50,50);
  ctx.font='18px Arial';
  topList.forEach((e,i)=>{
    ctx.fillText(`${i+1}. ${e.username}: ${e.score}`, 30, 100+i*30);
  });
  ctx.fillText('Tap to go back', WIDTH/2-60, HEIGHT-40);
}

// — Start PLAY
function startPlay(){
  state     = 'PLAY';
  score     = 0;
  bird.vy   = 0;
  bird.y    = (HEIGHT-bird.h)/2;
  spawnTimer= -SPAWN_INT; // delay first pipe
  lastTime  = performance.now();
  spawnInitial();
  AUD.wing.play();
}

// — Main loop
function gameLoop(){
  if (state==='PLAY') {
    updatePlay();
    drawPlay();
  }
}

// — Update during PLAY
function updatePlay(){
  const now = performance.now(), dt=(now-lastTime)/1000;
  lastTime = now;

  spawnTimer += dt;
  if (spawnTimer >= SPAWN_INT) {
    spawnPipe();
    spawnTimer -= SPAWN_INT;
  }

  // move & cull
  const pv = PIPE_SPEED * dt;
  pipes.forEach(p=>p.x -= pv);
  pipes = pipes.filter(p=> p.x + IMG.pipe[0].width > 0);

  // duck physics
  bird.vy += GRAVITY * dt;
  if (bird.flapped) {
    bird.vy = FLAP_V;
    bird.flapped = false;
    AUD.wing.play();
  }
  bird.y += bird.vy * dt;

  // crash?
  if (bird.y<0 || bird.y+bird.h>HEIGHT*0.79) {
    return handleGameOver();
  }

  // collisions & scoring
  pipes.forEach(p=>{
    const pw=IMG.pipe[0].width, ph=IMG.pipe[0].height;
    const topR  = {x:p.x,          y:p.y-ph,    w:pw, h:ph};
    const botR  = {x:p.x,          y:p.y+PIPE_GAP,w:pw, h:ph};
    const birdR = {x:bird.x,       y:bird.y,    w:bird.w,h:bird.h};
    if (intersect(birdR, topR) || intersect(birdR, botR)) {
      return handleGameOver();
    }
    if (!p.scored && p.x+pw < bird.x) {
      p.scored=true;
      score++;
      AUD.point.play();
    }
  });
}

// — Draw during PLAY
function drawPlay(){
  ctx.drawImage(IMG.bg[1],0,0);
  pipes.forEach(p=>{
    const pw=IMG.pipe[0].width, ph=IMG.pipe[0].height;
    // top (flipped)
    ctx.save();
    ctx.translate(p.x+pw/2, p.y);
    ctx.scale(1,-1);
    ctx.drawImage(IMG.pipe[0], -pw/2, 0);
    ctx.restore();
    // bottom
    ctx.drawImage(IMG.pipe[0], p.x, p.y+PIPE_GAP);
  });
  // duck
  ctx.drawImage(IMG.bird[bird.frame], bird.x, bird.y, bird.w, bird.h);

  // score
  let totalW = 0, digits = Array.from(String(score),Number);
  digits.forEach(d=> totalW += IMG.nums[d].width );
  let x0 = (WIDTH-totalW)/2;
  digits.forEach(d=>{
    ctx.drawImage(IMG.nums[d], x0, 20);
    x0 += IMG.nums[d].width;
  });

  tileBase();
}

// — Tile the base floor
function tileBase(){
  const b  = IMG.base,
        by = HEIGHT - b.height;
  baseX = (baseX - 2) % b.width;
  for (let x = baseX-b.width; x < WIDTH; x += b.width) {
    ctx.drawImage(b, x, by);
  }
}

// — Game over: submit score + show leaderboard
async function handleGameOver(){
  if (state !== 'PLAY') return;
  state = 'GAMEOVER';
  AUD.hit.play(); AUD.die.play();

  // submit
  const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
  const username = user?.username
    ? '@'+user.username
    : `${user?.first_name||'user'}_${user?.id||0}`;

  try {
    await fetch('submit', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ username, score })
    });
  } catch(e){
    console.error('Submit failed', e);
  }

  await fetchLeaderboard();
}

// — Reset
function resetGame(){
  state='WELCOME';
  drawWelcome();
}

// — Kick things off
lastTime = performance.now();
