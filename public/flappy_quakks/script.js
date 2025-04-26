// public/flappy_quakks/script.js

console.log('✅ script.js loaded');

// — Canvas & context
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

// — Dynamic canvas sizing
let WIDTH, HEIGHT;
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  WIDTH = window.innerWidth;
  HEIGHT = window.innerHeight;
  canvas.width = WIDTH * dpr;
  canvas.height = HEIGHT * dpr;
  canvas.style.width = `${WIDTH}px`;
  canvas.style.height = `${HEIGHT}px`;
  ctx.scale(dpr, dpr); // Adjust for high-DPI displays
  console.log('Canvas resized:', WIDTH, HEIGHT, 'dpr:', dpr);
  
  // Update button positions and bird position for new dimensions
  Btn.start.x = WIDTH/2 - 75;
  Btn.start.y = HEIGHT * 0.6;
  Btn.leaderboard.x = WIDTH/2 - 75;
  Btn.leaderboard.y = HEIGHT * 0.7;
  bird.x = WIDTH * 0.2;
  bird.y = (HEIGHT - bird.h) / 2;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// — Telegram Web App full-screen
if (window.Telegram?.WebApp) {
  Telegram.WebApp.expand();
  Telegram.WebApp.setBackgroundColor('#000000');
  Telegram.WebApp.onEvent('viewportChanged', resizeCanvas);
  console.log('Telegram Web App expanded');
}

// — Game constants
const FPS           = 30;
const GRAVITY       = 900;    // px/s²
const FLAP_V        = -200;   // px/s
let PIPE_SPEED      = 200;    // px/s
let SPAWN_INT       = 1.5;    // seconds between pipes
let PIPE_GAP        = 180;    // px
const HITBOX_PADDING = 4;     // px inset for collision boxes

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
  wing: PATH+'audio/wing.ogg'
};

// — State
let state      = 'WELCOME';
let lastTime   = 0;
let spawnTimer = 0;
let score      = 0;
let pipes      = [];
let baseX      = 0;
let topList    = [];
let lastDifficultyScore = 0;
let difficultyCycle = 0;

// — Duck (10% bigger: 1.65 scale)
const BIRD_W     = 34, BIRD_H = 24, BIRD_SCALE = 1.65;
const bird = {
  x:      WIDTH * 0.2,
  y:      (HEIGHT - BIRD_H * BIRD_SCALE) / 2,
  vy:     0,
  w:      BIRD_W * BIRD_SCALE,
  h:      BIRD_H * BIRD_SCALE,
  frame:  0,
  flapped:false
};

// — Containers
const IMG = { bg:[], pipe:[], bird:[], nums:[], base:null, msg:null, over:null };
const AUD = {};
let loadedImages = 0;
const TOTAL_IMAGES =
  SPRITES.bg.length +
  SPRITES.pipe.length +
  1 +
  SPRITES.bird.length +
  SPRITES.nums.length +
  1 +
  1;

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
  const img=new Image(); img.src=url;
  img.onload = ()=>{ IMG.bg[i]=img; if(++loadedImages===TOTAL_IMAGES) init(); };
  img.onerror = () => console.error('Failed to load:', url);
});
SPRITES.pipe.forEach((url,i)=>{
  const img=new Image(); img.src=url;
  img.onload = ()=>{ IMG.pipe[i]=img; if(++loadedImages===TOTAL_IMAGES) init(); };
  img.onerror = () => console.error('Failed to load:', url);
});
{
  const img=new Image(); img.src=SPRITES.base;
  img.onload = ()=>{ IMG.base=img; if(++loadedImages===TOTAL_IMAGES) init(); };
  img.onerror = () => console.error('Failed to load:', SPRITES.base);
}
SPRITES.bird.forEach((url,i)=>{
  const img=new Image(); img.src=url;
  img.onload = ()=>{ IMG.bird[i]=img; if(++loadedImages===TOTAL_IMAGES) init(); };
  img.onerror = () => console.error('Failed to load:', url);
});
SPRITES.nums.forEach((url,i)=>{
  const img=new Image(); img.src=url;
  img.onload = ()=>{ IMG.nums[i]=img; if(++loadedImages===TOTAL_IMAGES) init(); };
  img.onerror = () => console.error('Failed to load:', url);
});
{
  const m=new Image(), o=new Image();
  m.src=SPRITES.msg; o.src=SPRITES.over;
  m.onload = ()=>{ IMG.msg=m; if(++loadedImages===TOTAL_IMAGES) init(); };
  o.onload = ()=>{ IMG.over=o; if(++loadedImages===TOTAL_IMAGES) init(); };
  m.onerror = () => console.error('Failed to load:', SPRITES.msg);
  o.onerror = () => console.error('Failed to load:', SPRITES.over);
}

// — Load sounds
Object.entries(SOUNDS).forEach(([k,u])=>{
  const a=new Audio(u); a.load(); AUD[k]=a;
});

// — Init
function init(){
  console.log('Assets loaded:', loadedImages, 'of', TOTAL_IMAGES);
  drawWelcome();
  lastTime = performance.now();
  setInterval(gameLoop, 1000/FPS);
}

// — Pipe creation
function createPipe(x){
  const margin = Math.floor(HEIGHT * 0.2);
  const minY   = margin;
  const maxY   = HEIGHT - PIPE_GAP - margin;
  const gapY   = randInt(minY, maxY);
  return { x, y: gapY, scored: false };
}
function spawnInitial(){
  pipes = [];
  const pw = IMG.pipe[0].width, fx = WIDTH + pw*3;
  pipes.push(createPipe(fx), createPipe(fx + pw*3.5));
}
function spawnPipe(){
  console.log('Spawning pipe, pipes.length:', pipes.length, 'SPAWN_INT:', SPAWN_INT);
  pipes.push(createPipe(WIDTH + 10));
}

// — Buttons
const Btn = {
  start:      { x: WIDTH/2-75, y:300, w:150, h:50, label:'Start'       },
  leaderboard:{ x: WIDTH/2-75, y:370, w:150, h:50, label:'Leaderboard' }
};
function isInside(mx,my,b){ 
  return mx>=b.x && mx<=b.x+b.w && my>=b.y && my<=b.y+b.h;
}

// — Input
canvas.addEventListener('pointerdown', handlePointer, { passive:false });
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
}, { passive: false });
document.addEventListener('keydown', e=>{
  if (e.code==='Space' && state==='PLAY') {
    bird.flapped = true;
    e.preventDefault();
  }
});

function handlePointer(e){
  e.preventDefault();
  let clientX, clientY;
  if (e.touches && e.touches[0]) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }
  const rect = canvas.getBoundingClientRect();
  const mx   = (clientX - rect.left) * (WIDTH / rect.width);
  const my   = (clientY - rect.top) * (HEIGHT / rect.height);

  if (state==='WELCOME'){
    if      (isInside(mx,my,Btn.start))       startPlay();
    else if (isInside(mx,my,Btn.leaderboard)) fetchLeaderboard();
  }
  else if (state==='PLAY'){
    bird.flapped = true;
  }
  else {
    state = 'WELCOME';
    drawWelcome();
  }
}

// — DRAW WELCOME
function drawWelcome(){
  ctx.drawImage(IMG.bg[0], 0, 0, WIDTH, HEIGHT);
  tileBase();
  ctx.drawImage(IMG.msg, (WIDTH-IMG.msg.width)/2, HEIGHT*0.12);
  bird.frame = (bird.frame+1)%3;
  const shim = 8 * Math.sin(performance.now()/200);
  ctx.drawImage(IMG.bird[bird.frame], bird.x, bird.y+shim, bird.w, bird.h);
  [Btn.start, Btn.leaderboard].forEach(b=>{
    ctx.fillStyle='#fff'; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle='#000'; ctx.font=`${20 * (WIDTH/288)}px Arial`;
    ctx.fillText(
      b.label,
      b.x + (b.w/2 - ctx.measureText(b.label).width/2),
      b.y + 32 * (WIDTH/288)
    );
  });
}

// — FETCH & DRAW LEADERBOARD
async function fetchLeaderboard(){
  try {
    const res = await fetch('leaderboard');
    topList = await res.json();
    state = 'LEADERBOARD';
    drawLeaderboard();
  } catch(err){
    console.error('Leaderboard load failed', err);
  }
}
function drawLeaderboard(){
  ctx.drawImage(IMG.bg[1], 0, 0, WIDTH, HEIGHT);
  ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle='#fff'; ctx.font=`${24 * (WIDTH/288)}px Arial`;
  ctx.fillText('🏆 Top 10', WIDTH/2-50, 50);
  ctx.font=`${18 * (WIDTH/288)}px Arial`;
  topList.forEach((e,i)=>{
    ctx.fillText(`${i+1}. ${e.username}: ${e.score}`, 30, 100+i*30);
  });
  ctx.fillText('Tap to go back', WIDTH/ usually-60, HEIGHT-40);
}

// — START PLAY
function startPlay(){
  state     = 'PLAY';
  score     = 0;
  bird.vy   = 0;
  bird.y    = (HEIGHT - bird.h)/2;
  bird.x    = WIDTH * 0.2;
  spawnTimer= -SPAWN_INT;
  lastTime  = performance.now();
  lastDifficultyScore = 0;
  difficultyCycle = 0;
  PIPE_GAP = 180;
  PIPE_SPEED = 200;
  SPAWN_INT = 1.5;
  spawnInitial();
  AUD.wing.play();
}

// — MAIN LOOP
function gameLoop(){
  console.log('Game loop, state:', state, 'score:', score);
  if (state==='PLAY'){
    updatePlay();
    drawPlay();
  }
}

// — UPDATE PLAY
function updatePlay(){
  const now = performance.now(), dt=(now-lastTime)/1000;
  lastTime = now;

  if (score >= 25 && score % 25 === 0 && score > lastDifficultyScore && !pipes.some(p => p.scored === false)) {
    console.log('Adjusting difficulty at score:', score, 'cycle:', difficultyCycle);
    if (difficultyCycle % 3 === 0) {
      PIPE_GAP = Math.max(100, PIPE_GAP - 10);
      console.log('Adjusted PIPE_GAP to:', PIPE_GAP);
    } else if (difficultyCycle % 3 === 1) {
      PIPE_SPEED = Math.min(400, PIPE_SPEED + 20);
      console.log('Adjusted PIPE_SPEED to:', PIPE_SPEED);
    } else {
      SPAWN_INT = Math.max(0.5, SPAWN_INT - 0.1);
      console.log('Adjusted SPAWN_INT to:', SPAWN_INT);
    }
    difficultyCycle++;
    lastDifficultyScore = score;
  }

  spawnTimer += dt;
  if (spawnTimer >= SPAWN_INT){
    spawnPipe();
    spawnTimer -= SPAWN_INT;
  }

  const pv = PIPE_SPEED * dt;
  pipes.forEach(p=>p.x -= pv);
  pipes = pipes.filter(p=> p.x + IMG.pipe[0].width > 0);

  bird.vy += GRAVITY * dt;
  if (bird.flapped){
    bird.vy = FLAP_V;
    bird.flapped = false;
    AUD.wing.play();
  }
  bird.y += bird.vy * dt;

  if (bird.y<0 || bird.y+bird.h>HEIGHT*0.79){
    return handleGameOver();
  }

  pipes.forEach(p=>{
    const pw = IMG.pipe[0].width, ph = IMG.pipe[0].height;
    const topR = {
      x: p.x,
      y: p.y - ph + HITBOX_PADDING,
      w: pw,
      h: ph - HITBOX_PADDING
    };
    const botR = {
      x: p.x,
      y: p.y + PIPE_GAP,
      w: pw,
      h: ph - HITBOX_PADDING
    };
    const birdR = {
      x: bird.x + HITBOX_PADDING,
      y: bird.y + HITBOX_PADDING,
      w: bird.w - 2*HITBOX_PADDING,
      h: bird.h - 2*HITBOX_PADDING
    };

    if (intersect(birdR, topR) || intersect(birdR, botR)){
      console.log('Collision detected at score:', score, 'PIPE_GAP:', PIPE_GAP);
      return handleGameOver();
    }
    if (!p.scored && p.x + pw < bird.x){
      p.scored = true;
      score++;
      AUD.point.play();
    }
  });
}

// — DRAW PLAY
function drawPlay(){
  ctx.drawImage(IMG.bg[1], 0, 0, WIDTH, HEIGHT);
  pipes.forEach(p=>{
    const pw=IMG.pipe[0].width, ph=IMG.pipe[0].height;
    ctx.save();
    ctx.translate(p.x + pw/2, p.y);
    ctx.scale(1, -1);
    ctx.drawImage(IMG.pipe[0], -pw/2, 0);
    ctx.restore();
    ctx.drawImage(IMG.pipe[0], p.x, p.y + PIPE_GAP);
  });

  ctx.drawImage(IMG.bird[bird.frame], bird.x, bird.y, bird.w, bird.h);

  let totalW = 0, digits = Array.from(String(score), Number);
  digits.forEach(d=> totalW += IMG.nums[d].width);
  let x0 = (WIDTH - totalW)/2;
  digits.forEach(d=>{
    ctx.drawImage(IMG.nums[d], x0, 20 * (WIDTH/288));
    x0 += IMG.nums[d].width;
  });

  tileBase();
}

// — TILE FLOOR
function tileBase(){
  const b=IMG.base, by=HEIGHT - b.height;
  baseX = (baseX - 2) % b.width;
  for(let x=baseX - b.width; x<WIDTH; x+=b.width){
    ctx.drawImage(b, x, by);
  }
}

// — GAME OVER
async function handleGameOver(){
  if (state!=='PLAY') return;
  state='GAMEOVER';
  AUD.hit.play(); AUD.die.play();

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

// — RESET
function resetGame(){
  state='WELCOME';
  drawWelcome();
}

// — Kick off
lastTime = performance.now();