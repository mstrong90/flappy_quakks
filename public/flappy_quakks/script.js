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
  canvas.width  = WIDTH  * dpr;
  canvas.height = HEIGHT * dpr;
  canvas.style.width  = `${WIDTH}px`;
  canvas.style.height = `${HEIGHT}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// — Telegram Web App fullscreen
if (window.Telegram?.WebApp) {
  Telegram.WebApp.expand();
  Telegram.WebApp.setBackgroundColor('#000');
  Telegram.WebApp.onEvent('viewportChanged', resizeCanvas);
}

// — Game constants
const FPS            = 30;
const GRAVITY        = 950;   // px/s²
const FLAP_V         = -250;  // px/s
let PIPE_SPEED       = 200;   // px/s
let SPAWN_INT        = 1.5;   // sec between pipes
let PIPE_GAP         = 180;   // px
const HITBOX_PADDING = 1;     // px inset for collision

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

// — Asset containers & loading
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

function loadImage(src, store, key){
  const img = new Image();
  img.src = src;
  img.onload  = () => { store[key] = img; if (++loadedImages === TOTAL_IMAGES) init(); };
  img.onerror = () => console.error('Failed to load:', src);
}

// load images
SPRITES.bg.forEach((u,i)=> loadImage(u, IMG, `bg${i}`));
SPRITES.pipe.forEach((u,i)=> loadImage(u, IMG, `pipe${i}`));
loadImage(SPRITES.base, IMG, 'base');
SPRITES.bird.forEach((u,i)=> loadImage(u, IMG, `bird${i}`));
SPRITES.nums.forEach((u,i)=> loadImage(u, IMG, `num${i}`));
loadImage(SPRITES.msg, IMG, 'msg');
loadImage(SPRITES.over, IMG, 'over');

// load sounds
Object.entries(SOUNDS).forEach(([k,url])=>{
  const a = new Audio(url);
  a.load();
  AUD[k] = a;
});

// — Init when assets ready
function init(){
  console.log('Assets loaded:', loadedImages, 'of', TOTAL_IMAGES);
  drawWelcome();
  lastTime = performance.now();
  setInterval(gameLoop, 1000/FPS);
}

// — Helpers
function randInt(min,max){ return Math.floor(min + Math.random()*(max-min+1)); }
function intersect(a,b){
  return a.x < b.x + b.w &&
         a.x + a.w > b.x &&
         a.y < b.y + b.h &&
         a.y + a.h > b.y;
}

// — Pipe creation
function createPipe(x){
  const margin = Math.floor(HEIGHT * 0.2);
  const gapY   = randInt(margin, HEIGHT - PIPE_GAP - margin);
  return { x, y: gapY, scored:false };
}
function spawnInitial(){
  pipes = [];
  const pw = IMG.pipe0.width;
  pipes.push(createPipe(WIDTH + pw*3), createPipe(WIDTH + pw*6));
}
function spawnPipe(){
  pipes.push(createPipe(WIDTH + 10));
}

// — Input handling
canvas.addEventListener('pointerdown', handlePointer, { passive:false });
canvas.addEventListener('touchstart', e=>e.preventDefault(), { passive:false });
document.addEventListener('keydown', e=>{
  if (e.code==='Space' && state==='PLAY'){
    bird.flapped = true;
    e.preventDefault();
  }
});

function handlePointer(e){
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const cx   = e.touches ? e.touches[0].clientX : e.clientX;
  const cy   = e.touches ? e.touches[0].clientY : e.clientY;
  const mx   = (cx - rect.left) * (WIDTH/rect.width);
  const my   = (cy - rect.top ) * (HEIGHT/rect.height);

  if (state==='WELCOME'){
    if      (intersect({x:mx,y:my,w:0,h:0}, Btn.start))       startPlay();
    else if (intersect({x:mx,y:my,w:0,h:0}, Btn.leaderboard)) fetchLeaderboard();
  }
  else if (state==='PLAY'){
    bird.flapped = true;
  }
  else if (state==='GAMEOVER'){
    if      (intersect({x:mx,y:my,w:0,h:0}, Btn.start))       startPlay();
    else if (intersect({x:mx,y:my,w:0,h:0}, Btn.leaderboard)) fetchLeaderboard();
  }
  else if (state==='LEADERBOARD'){
    state='WELCOME';
    drawWelcome();
  }
}

// — DRAW WELCOME
function drawWelcome(){
  ctx.drawImage(IMG.bg0,0,0,WIDTH,HEIGHT);
  tileBase();
  ctx.drawImage(IMG.msg,(WIDTH-IMG.msg.width)/2,HEIGHT*0.12);
  bird.frame = ++bird.frame % SPRITES.bird.length;
  ctx.drawImage(
    IMG[`bird${bird.frame}`],
    bird.x, bird.y + 8*Math.sin(performance.now()/200),
    bird.w, bird.h
  );

  Btn.start.x       = WIDTH/2 - 75;
  Btn.start.y       = HEIGHT * 0.6;
  Btn.leaderboard.x = WIDTH/2 - 75;
  Btn.leaderboard.y = HEIGHT * 0.7;

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

// — DRAW GAME OVER
function drawGameOver(){
  ctx.drawImage(IMG.bg1,0,0,WIDTH,HEIGHT);
  tileBase();

  ctx.drawImage(IMG.over,(WIDTH-IMG.over.width)/2,HEIGHT*0.2);

  const scoreText = `Score: ${score}`;
  ctx.fillStyle = '#fff';
  ctx.font = `${24*(WIDTH/288)}px Arial`;
  const textW = ctx.measureText(scoreText).width;
  ctx.fillText(scoreText,(WIDTH-textW)/2,HEIGHT*0.4);

  const btnY = HEIGHT*0.6;
  Btn.start.x       = WIDTH/2 - 160; Btn.start.y       = btnY;
  Btn.leaderboard.x = WIDTH/2 + 10;  Btn.leaderboard.y = btnY;

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
    const origin = window.location.origin;
    const res = await fetch(`${origin}/flappy_quakks/leaderboard`);
    topList = await res.json();
    state = 'LEADERBOARD';
    drawLeaderboard();
  } catch(e){
    console.error('Leaderboard load failed', e);
  }
}
function drawLeaderboard(){
  ctx.drawImage(IMG.bg1,0,0,WIDTH,HEIGHT);
  ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(0,0,WIDTH,HEIGHT);

  ctx.fillStyle='#fff'; ctx.font=`${24*(WIDTH/288)}px Arial`;
  ctx.fillText('🏆 Top 10', WIDTH/2 - 50, 50);

  ctx.font=`${18*(WIDTH/288)}px Arial`;
  topList.forEach((e,i)=>{
    ctx.fillText(`${i+1}. ${e.username}: ${e.score}`, 30, 100 + i*30);
  });
  ctx.fillText('Tap anywhere to restart', WIDTH/2 - 90, HEIGHT - 40);
}

// — START PLAY
function startPlay(){
  state      = 'PLAY';
  score      = 0;
  bird.vy    = 0;
  bird.x     = WIDTH * 0.2;
  bird.y     = (HEIGHT - bird.h)/2;
  spawnTimer = -SPAWN_INT;
  lastTime   = performance.now();
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
  if (state==='PLAY'){
    updatePlay();
    drawPlay();
  } else if (state==='GAMEOVER'){
    drawGameOver();
  }
}

// — UPDATE PLAY
function updatePlay(){
  const now = performance.now(), dt = (now - lastTime)/1000;
  lastTime = now;

  // difficulty bumps
  if (score>=25 && score%25===0 && score>lastDifficultyScore && !pipes.some(p=>!p.scored)){
    if      (difficultyCycle%3===0) PIPE_GAP   = Math.max(100, PIPE_GAP-10);
    else if (difficultyCycle%3===1) PIPE_SPEED = Math.min(400, PIPE_SPEED+20);
    else                             SPAWN_INT  = Math.max(0.5, SPAWN_INT-0.1);
    difficultyCycle++;
    lastDifficultyScore = score;
  }

  // spawn & move
  spawnTimer += dt;
  if (spawnTimer >= SPAWN_INT){ spawnPipe(); spawnTimer -= SPAWN_INT; }
  const pv = PIPE_SPEED * dt;
  pipes.forEach(p=>p.x -= pv);
  pipes = pipes.filter(p => p.x + IMG.pipe0.width > 0);

  // bird physics
  bird.vy += GRAVITY * dt;
  if (bird.flapped){
    bird.vy = FLAP_V;
    bird.flapped = false;
    AUD.wing.play();
  }
  bird.y += bird.vy * dt;

  // collisions & scoring
  if (bird.y < 0 || bird.y + bird.h > HEIGHT*0.79){
    return handleGameOver();
  }
  pipes.forEach(p=>{
    const pw = IMG.pipe0.width, ph = IMG.pipe0.height;
    const topR = { x:p.x, y:p.y-ph+HITBOX_PADDING, w:pw, h:ph-HITBOX_PADDING };
    const botR = { x:p.x, y:p.y+PIPE_GAP, w:pw, h:ph-HITBOX_PADDING };
    const birdR= {
      x: bird.x + HITBOX_PADDING,
      y: bird.y + HITBOX_PADDING,
      w: bird.w - 2*HITBOX_PADDING,
      h: bird.h - 2*HITBOX_PADDING
    };
    if (intersect(birdR, topR) || intersect(birdR, botR)){
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
  ctx.drawImage(IMG.bg1,0,0,WIDTH,HEIGHT);
  pipes.forEach(p=>{
    const pw=IMG.pipe0.width, ph=IMG.pipe0.height;
    ctx.save();
    ctx.translate(p.x+pw/2, p.y);
    ctx.scale(1, -1);
    ctx.drawImage(IMG.pipe0, -pw/2, 0);
    ctx.restore();
    ctx.drawImage(IMG.pipe0, p.x, p.y+PIPE_GAP);
  });
  ctx.drawImage(IMG[`bird${bird.frame}`], bird.x, bird.y, bird.w, bird.h);

  // draw score
  let totalW = 0, digits = Array.from(String(score), Number);
  digits.forEach(d => totalW += IMG[`num${d}`].width);
  let x0 = (WIDTH - totalW)/2;
  digits.forEach(d=>{
    ctx.drawImage(IMG[`num${d}`], x0, 20*(WIDTH/288));
    x0 += IMG[`num${d}`].width;
  });
  tileBase();
}

// — TILE BASE
function tileBase(){
  const b = IMG.base, by = HEIGHT - b.height;
  baseX = (baseX - 2) % b.width;
  for(let x = baseX - b.width; x < WIDTH; x += b.width){
    ctx.drawImage(b, x, by);
  }
}

// — GAME OVER handler
async function handleGameOver(){
  if (state !== 'PLAY') return;
  state = 'GAMEOVER';
  AUD.hit.play();
  AUD.die.play();

  // submit score, but do not auto-load leaderboard
  const origin = window.location.origin;
  const submitUrl = `${origin}/flappy_quakks/submit`;
  const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
  const username = user?.username
    ? '@'+user.username
    : `${user?.first_name||'user'}_${user?.id||0}`;

  try {
    await fetch(submitUrl, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ username, score })
    });
  } catch (e) {
    console.error('Submit error:', e);
  }
}

// — Kick off timing
lastTime = performance.now();
