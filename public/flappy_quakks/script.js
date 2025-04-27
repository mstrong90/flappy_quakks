// public/flappy_quakks/script.js

console.log('✅ script.js loaded');

// — Canvas & context
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

// — Dynamic canvas sizing
let WIDTH, HEIGHT;
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  WIDTH  = window.innerWidth;
  HEIGHT = window.innerHeight;
  canvas.width  = WIDTH * dpr;
  canvas.height = HEIGHT * dpr;
  canvas.style.width  = `${WIDTH}px`;
  canvas.style.height = `${HEIGHT}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resizeCanvas);

// — Game constants
const FPS            = 30;
const GRAVITY        = 900;   // px/s²
const FLAP_V         = -200;  // px/s
let PIPE_SPEED       = 200;   // px/s
let SPAWN_INT        = 1.5;   // sec between pipes
let PIPE_GAP         = 180;   // px
const HITBOX_PADDING = 4;     // px

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
let state      = 'WELCOME';
let lastTime   = 0;
let spawnTimer = 0;
let score      = 0;
let pipes      = [];
let baseX      = 0;
let topList    = [];
let lastDifficultyScore = 0;
let difficultyCycle     = 0;

// — Duck (scaled)
const BIRD_W     = 34, BIRD_H = 34, BIRD_SCALE = 1.80;
const bird = {
  x:      0,
  y:      0,
  vy:     0,
  w:      BIRD_W * BIRD_SCALE,
  h:      BIRD_H * BIRD_SCALE,
  frame:  0,
  flapped:false
};

// — Buttons
const Btn = {
  start:      { x:0, y:0, w:150, h:50, label:'Start'       },
  leaderboard:{ x:0, y:0, w:150, h:50, label:'Leaderboard' }
};

// initial resize
resizeCanvas();

// — Telegram Web App full-screen
if (window.Telegram?.WebApp) {
  Telegram.WebApp.expand();
  Telegram.WebApp.setBackgroundColor('#000');
  Telegram.WebApp.onEvent('viewportChanged', resizeCanvas);
}

// — Asset containers
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
  img.onload  = ()=>{ IMG.bg[i]=img; if(++loadedImages===TOTAL_IMAGES) init(); };
  img.onerror = ()=> console.error('Failed to load:', url);
});
SPRITES.pipe.forEach((url,i)=>{
  const img=new Image(); img.src=url;
  img.onload  = ()=>{ IMG.pipe[i]=img; if(++loadedImages===TOTAL_IMAGES) init(); };
  img.onerror = ()=> console.error('Failed to load:', url);
});
{
  const img=new Image(); img.src=SPRITES.base;
  img.onload  = ()=>{ IMG.base=img; if(++loadedImages===TOTAL_IMAGES) init(); };
  img.onerror = ()=> console.error('Failed to load:', SPRITES.base);
}
SPRITES.bird.forEach((url,i)=>{
  const img=new Image(); img.src=url;
  img.onload  = ()=>{ IMG.bird[i]=img; if(++loadedImages===TOTAL_IMAGES) init(); };
  img.onerror = ()=> console.error('Failed to load:', url);
});
SPRITES.nums.forEach((url,i)=>{
  const img=new Image(); img.src=url;
  img.onload  = ()=>{ IMG.nums[i]=img; if(++loadedImages===TOTAL_IMAGES) init(); };
  img.onerror = ()=> console.error('Failed to load:', url);
});
{
  const m=new Image(), o=new Image();
  m.src=SPRITES.msg; o.src=SPRITES.over;
  m.onload  = ()=>{ IMG.msg=m; if(++loadedImages===TOTAL_IMAGES) init(); };
  o.onload  = ()=>{ IMG.over=o; if(++loadedImages===TOTAL_IMAGES) init(); };
  m.onerror = ()=> console.error('Failed to load:', SPRITES.msg);
  o.onerror = ()=> console.error('Failed to load:', SPRITES.over);
}

// — Load sounds
Object.entries(SOUNDS).forEach(([k,u])=>{
  const a=new Audio(u); a.load(); AUD[k]=a;
});

// — Init when all assets are ready
function init(){
  console.log('Assets loaded:', loadedImages, 'of', TOTAL_IMAGES);
  drawWelcome();
  lastTime = performance.now();
  setInterval(gameLoop, 1000/FPS);
}

// — Pipe helpers
function createPipe(x){
  const margin = Math.floor(HEIGHT * 0.2);
  const gapY   = randInt(margin, HEIGHT - PIPE_GAP - margin);
  return { x, y: gapY, scored:false };
}
function spawnInitial(){
  pipes = [];
  const pw = IMG.pipe[0].width;
  pipes.push(createPipe(WIDTH+pw*3), createPipe(WIDTH+pw*6));
}
function spawnPipe(){
  pipes.push(createPipe(WIDTH+10));
}

// — Input handling
canvas.addEventListener('pointerdown', handlePointer, { passive:false });
canvas.addEventListener('touchstart', e=>e.preventDefault(), { passive:false });
document.addEventListener('keydown', e=>{
  if (e.code==='Space' && state==='PLAY') bird.flapped = true;
});

function handlePointer(e){
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const cx   = e.touches ? e.touches[0].clientX : e.clientX;
  const cy   = e.touches ? e.touches[0].clientY : e.clientY;
  const mx   = (cx - rect.left) * (WIDTH/rect.width);
  const my   = (cy - rect.top)  * (HEIGHT/rect.height);

  if (state==='WELCOME') {
    if (intersect({x:mx,y:my,w:0,h:0}, Btn.start))       startPlay();
    else if (intersect({x:mx,y:my,w:0,h:0}, Btn.leaderboard))
      fetchLeaderboard();
  }
  else if (state==='PLAY') {
    bird.flapped = true;
  }
  else if (state==='GAMEOVER') {
    if (intersect({x:mx,y:my,w:0,h:0}, Btn.start))       startPlay();
    else if (intersect({x:mx,y:my,w:0,h:0}, Btn.leaderboard))
      fetchLeaderboard();
  }
  else if (state==='LEADERBOARD') {
    // tapping anywhere on leaderboard returns to welcome
    state='WELCOME';
    drawWelcome();
  }
}

// — DRAW WELCOME
function drawWelcome(){
  ctx.drawImage(IMG.bg[0],0,0,WIDTH,HEIGHT);
  tileBase();
  ctx.drawImage(IMG.msg,(WIDTH-IMG.msg.width)/2,HEIGHT*0.12);
  bird.frame = ++bird.frame % IMG.bird.length;
  ctx.drawImage(
    IMG.bird[bird.frame],
    bird.x,
    bird.y + 8*Math.sin(performance.now()/200),
    bird.w, bird.h
  );

  // position buttons centered
  Btn.start.x       = WIDTH/2 - 75;
  Btn.start.y       = HEIGHT*0.6;
  Btn.leaderboard.x = WIDTH/2 - 75;
  Btn.leaderboard.y = HEIGHT*0.7;

  [Btn.start, Btn.leaderboard].forEach(b=>{
    ctx.fillStyle='#fff'; ctx.fillRect(b.x,b.y,b.w,b.h);
    ctx.fillStyle='#000'; ctx.font=`${20*(WIDTH/288)}px Arial`;
    ctx.fillText(
      b.label,
      b.x + (b.w - ctx.measureText(b.label).width)/2,
      b.y + 32*(WIDTH/288)
    );
  });
}

// — DRAW GAME OVER (with overlay)
function drawGameOver(){
  ctx.drawImage(IMG.bg[1],0,0,WIDTH,HEIGHT);
  tileBase();

  // Game Over sprite
  ctx.drawImage(
    IMG.over,
    (WIDTH - IMG.over.width)/2,
    HEIGHT*0.2
  );

  // Final score text
  const scoreText = `Score: ${score}`;
  ctx.fillStyle = '#fff';
  ctx.font = `${24*(WIDTH/288)}px Arial`;
  const textW = ctx.measureText(scoreText).width;
  ctx.fillText(
    scoreText,
    (WIDTH - textW)/2,
    HEIGHT*0.4
  );

  // Position buttons side by side
  const btnY = HEIGHT*0.6;
  Btn.start.x       = WIDTH/2 - 160;
  Btn.start.y       = btnY;
  Btn.leaderboard.x = WIDTH/2 + 10;
  Btn.leaderboard.y = btnY;

  [Btn.start, Btn.leaderboard].forEach(b=>{
    ctx.fillStyle='#fff'; ctx.fillRect(b.x,b.y,b.w,b.h);
    ctx.fillStyle='#000'; ctx.font=`${20*(WIDTH/288)}px Arial`;
    ctx.fillText(
      b.label,
      b.x + (b.w - ctx.measureText(b.label).width)/2,
      b.y + 32*(WIDTH/288)
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
  } catch(e){
    console.error('Leaderboard load failed', e);
  }
}
function drawLeaderboard(){
  ctx.drawImage(IMG.bg[1],0,0,WIDTH,HEIGHT);
  ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(0,0,WIDTH,HEIGHT);

  ctx.fillStyle='#fff';
  ctx.font=`${24*(WIDTH/288)}px Arial`;
  ctx.fillText('🏆 Top 10', WIDTH/2 - 50, 50);

  ctx.font=`${18*(WIDTH/288)}px Arial`;
  topList.forEach((e,i)=>{
    ctx.fillText(`${i+1}. ${e.username}: ${e.score}`, 30, 100 + i*30);
  });
  ctx.fillText('Tap anywhere to restart', WIDTH/2 - 90, HEIGHT - 40);
}

// — START PLAY
function startPlay(){
  state     = 'PLAY';
  score     = 0;
  bird.vy   = 0;
  bird.x    = WIDTH*0.2;
  bird.y    = (HEIGHT - bird.h)/2;
  spawnTimer= -SPAWN_INT;
  lastTime  = performance.now();
  lastDifficultyScore = 0;
  difficultyCycle     = 0;
  PIPE_GAP    = 180;
  PIPE_SPEED  = 200;
  SPAWN_INT   = 1.5;
  spawnInitial();
  AUD.wing.play();
}

// — MAIN LOOP
function gameLoop(){
  if (state==='PLAY') {
    updatePlay();
    drawPlay();
  }
  else if (state==='GAMEOVER') {
    drawGameOver();
  }
  else if (state==='LEADERBOARD') {
    // nothing: already drawn
  }
}

// — UPDATE PLAY
function updatePlay(){
  const now = performance.now(), dt=(now-lastTime)/1000;
  lastTime = now;

  // Difficulty increase
  if (score>=25 && score%25===0 && score>lastDifficultyScore && !pipes.some(p=>!p.scored)){
    if      (difficultyCycle%3===0) SPAWN_INT  = Math.max(0.5, SPAWN_INT-0.1);
    else if (difficultyCycle%3===1) PIPE_SPEED = Math.min(400, PIPE_SPEED+20);
    else                             PIPE_GAP   = Math.max(100, PIPE_GAP-10);
    difficultyCycle++;
    lastDifficultyScore = score;
  }

  // Spawn & move pipes
  spawnTimer += dt;
  if (spawnTimer>=SPAWN_INT) { spawnPipe(); spawnTimer -= SPAWN_INT; }
  const pv = PIPE_SPEED * dt;
  pipes.forEach(p=>p.x -= pv);
  pipes = pipes.filter(p=> p.x + IMG.pipe[0].width > 0);

  // Bird physics
  bird.vy += GRAVITY*dt;
  if (bird.flapped) {
    bird.vy = FLAP_V;
    bird.flapped = false;
    AUD.wing.play();
  }
  bird.y += bird.vy*dt;

  // Collision & out-of-bounds
  if (bird.y<0 || bird.y+bird.h>HEIGHT*0.79) return handleGameOver();
  pipes.forEach(p=>{
    const pw=IMG.pipe[0].width, ph=IMG.pipe[0].height;
    const topR = { x:p.x, y:p.y-ph+HITBOX_PADDING, w:pw, h:ph-HITBOX_PADDING };
    const botR = { x:p.x, y:p.y+PIPE_GAP,         w:pw, h:ph-HITBOX_PADDING };
    const birdR= {
      x: bird.x+HITBOX_PADDING,
      y: bird.y+HITBOX_PADDING,
      w: bird.w-2*HITBOX_PADDING,
      h: bird.h-2*HITBOX_PADDING
    };
    if (intersect(birdR, topR) || intersect(birdR, botR)) {
      return handleGameOver();
    }
    if (!p.scored && p.x+pw < bird.x) {
      p.scored = true;
      score++;
      AUD.point.play();
    }
  });
}

// — DRAW PLAY
function drawPlay(){
  ctx.drawImage(IMG.bg[1],0,0,WIDTH,HEIGHT);
  pipes.forEach(p=>{
    const pw=IMG.pipe[0].width, ph=IMG.pipe[0].height;
    ctx.save();
    ctx.translate(p.x+pw/2, p.y);
    ctx.scale(1, -1);
    ctx.drawImage(IMG.pipe[0], -pw/2, 0);
    ctx.restore();
    ctx.drawImage(IMG.pipe[0], p.x, p.y+PIPE_GAP);
  });
  ctx.drawImage(IMG.bird[bird.frame], bird.x, bird.y, bird.w, bird.h);

  // Draw score
  let totalW=0, digits=Array.from(String(score),Number);
  digits.forEach(d=> totalW+=IMG.nums[d].width);
  let x0=(WIDTH-totalW)/2;
  digits.forEach(d=>{
    ctx.drawImage(IMG.nums[d], x0, 20*(WIDTH/288));
    x0+=IMG.nums[d].width;
  });
  tileBase();
}

// — TILE BASE
function tileBase(){
  const b=IMG.base, by=HEIGHT-b.height;
  baseX=(baseX-2)%b.width;
  for(let x=baseX-b.width; x<WIDTH; x+=b.width){
    ctx.drawImage(b,x,by);
  }
}

// — GAME OVER handler
function handleGameOver(){
  if (state!=='PLAY') return;
  state = 'GAMEOVER';
  AUD.hit.play();
  AUD.die.play();
  // no auto-advance—buttons shown instead
}

// — Kick off timing
lastTime = performance.now();
