const CANVAS_SIZE = 400;
const GRID = 20;
const CELL = CANVAS_SIZE / GRID;
const LEVEL_SCORE = 50;
const LEVEL_SPEEDUP_MS = 10;
const MIN_TICK_MS = 30;
// 고해상도(레티나) 화면에서도 선명하도록 실제 픽셀 수를 늘림
const DPR = Math.max(window.devicePixelRatio || 1, 3);
const STORAGE_KEY = 'catGameBestScore';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
canvas.width = CANVAS_SIZE * DPR;
canvas.height = CANVAS_SIZE * DPR;
canvas.style.width = CANVAS_SIZE + 'px';
canvas.style.height = CANVAS_SIZE + 'px';
ctx.scale(DPR, DPR);
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const levelEl = document.getElementById('level');
const difficultyEl = document.getElementById('difficulty');
const pauseBtn = document.getElementById('pauseBtn');
const soundBtn = document.getElementById('soundBtn');
const SOUND_KEY = 'catGameSoundOn';
const finalScoreEl = document.getElementById('finalScore');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');

const DIRS = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

let snake, dir, nextDir, food, score, best, timer, level, baseMs, paused;

let audioCtx;
let soundOn = true;
try {
  soundOn = localStorage.getItem(SOUND_KEY) !== 'off';
} catch (e) {}

function renderSoundBtn() {
  soundBtn.textContent = soundOn ? '🔊 소리 켜짐' : '🔇 소리 꺼짐';
}

// 방향키 입력음: 짧은 "뿅" 소리 (외부 파일 없이 Web Audio로 생성)
function getAudio() {
  audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

// 클릭/키 입력 시점에 오디오를 미리 깨워 둠 (브라우저 자동재생 정책 대응)
function unlockAudio() {
  try {
    const ctx = getAudio();
    if (ctx.state !== 'running') ctx.resume();
  } catch (e) {}
}

// 먹이 먹는 소리: 크고 또렷한 "삑" 소리 (외부 파일 없이 Web Audio로 생성)
function playEatSound() {
  if (!soundOn) return;
  try {
    const ctx = getAudio();
    const play = () => {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(700, t);
      osc.frequency.exponentialRampToValueAtTime(1100, t + 0.12);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.6, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.16);
    };
    if (ctx.state === 'running') play();
    else ctx.resume().then(play);
  } catch (e) {
    // 오디오 사용 불가 환경에서는 무시
  }
}

function loadBest() {
  try {
    const v = parseInt(localStorage.getItem(STORAGE_KEY), 10);
    return Number.isNaN(v) ? 0 : v;
  } catch (e) {
    return 0;
  }
}

function saveBest(value) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch (e) {
    // 저장 불가 환경에서는 무시
  }
}

function updateScoreboard() {
  scoreEl.textContent = score;
  levelEl.textContent = level;
  bestEl.textContent = best;
}

function placeFood() {
  const free = [];
  for (let x = 0; x < GRID; x++) {
    for (let y = 0; y < GRID; y++) {
      if (!snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
    }
  }
  return free.length ? free[Math.floor(Math.random() * free.length)] : null;
}

function reset() {
  const mid = GRID / 2;
  snake = [
    { x: mid, y: mid },
    { x: mid - 1, y: mid },
    { x: mid - 2, y: mid },
  ];
  dir = { x: 1, y: 0 };
  nextDir = dir;
  score = 0;
  level = 1;
  paused = false;
  food = placeFood();
  updateScoreboard();
}

function tickMs() {
  return Math.max(MIN_TICK_MS, baseMs - (level - 1) * LEVEL_SPEEDUP_MS);
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(tick, tickMs());
}

function setPaused(value) {
  paused = value;
  pauseBtn.textContent = paused ? '재개' : '일시정지';
  if (paused) clearTimeout(timer);
  else schedule();
}

function start() {
  unlockAudio();
  clearTimeout(timer);
  baseMs = parseInt(difficultyEl.value, 10);
  reset();
  startScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
  difficultyEl.disabled = true;
  pauseBtn.disabled = false;
  pauseBtn.textContent = '일시정지';
  draw();
  schedule();
}

function gameOver() {
  clearTimeout(timer);
  difficultyEl.disabled = false;
  pauseBtn.disabled = true;
  pauseBtn.textContent = '일시정지';
  if (score > best) {
    best = score;
    saveBest(best);
  }
  updateScoreboard();
  finalScoreEl.textContent = score;
  gameOverScreen.classList.remove('hidden');
}

function tick() {
  dir = nextDir;
  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

  const hitWall = head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID;
  const ate = food && head.x === food.x && head.y === food.y;
  // 먹지 않으면 꼬리가 빠지므로 꼬리 칸은 충돌 대상에서 제외
  const body = ate ? snake : snake.slice(0, -1);
  const hitSelf = body.some((s) => s.x === head.x && s.y === head.y);

  if (hitWall || hitSelf) {
    gameOver();
    return;
  }

  snake.unshift(head);
  if (ate) {
    score += 10;
    playEatSound();
    if (score > best) {
      best = score;
      saveBest(best);
    }
    level = Math.floor(score / LEVEL_SCORE) + 1;
    food = placeFood();
    updateScoreboard();
  } else {
    snake.pop();
  }
  draw();
  schedule();
}

function drawGrid() {
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.strokeStyle = '#f1e4cc';
  ctx.lineWidth = 1;
  for (let i = 1; i < GRID; i++) {
    ctx.beginPath();
    ctx.moveTo(i * CELL, 0);
    ctx.lineTo(i * CELL, CANVAS_SIZE);
    ctx.moveTo(0, i * CELL);
    ctx.lineTo(CANVAS_SIZE, i * CELL);
    ctx.stroke();
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 벡터로 그려서 어떤 해상도에서도 선명한 고양이 머리 (이동 방향을 바라봄)
function drawHead(seg) {
  const cx = seg.x * CELL + CELL / 2;
  const cy = seg.y * CELL + CELL / 2;
  const angle = Math.atan2(dir.y, dir.x);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  const r = CELL / 2 - 0.5;

  // 귀 (바깥 + 안쪽 분홍)
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#d9722a';
    ctx.beginPath();
    ctx.moveTo(r * 0.15, s * r * 0.95);
    ctx.lineTo(r * 0.95, s * r * 0.85);
    ctx.lineTo(r * 0.55, s * r * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffb3c1';
    ctx.beginPath();
    ctx.moveTo(r * 0.35, s * r * 0.8);
    ctx.lineTo(r * 0.78, s * r * 0.75);
    ctx.lineTo(r * 0.55, s * r * 0.38);
    ctx.closePath();
    ctx.fill();
  }

  // 얼굴
  const g = ctx.createRadialGradient(r * 0.2, -r * 0.2, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#ffb066');
  g.addColorStop(1, '#e8833a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
  ctx.fill();

  // 이마 줄무늬
  ctx.strokeStyle = '#c4621f';
  ctx.lineWidth = 0.9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, -r * 0.2);
  ctx.lineTo(-r * 0.2, -r * 0.2);
  ctx.moveTo(-r * 0.6, 0);
  ctx.lineTo(-r * 0.25, 0);
  ctx.moveTo(-r * 0.55, r * 0.2);
  ctx.lineTo(-r * 0.2, r * 0.2);
  ctx.stroke();

  // 눈
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(r * 0.3, s * r * 0.38, r * 0.2, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.ellipse(r * 0.35, s * r * 0.38, r * 0.1, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(r * 0.38, s * r * 0.3, r * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }

  // 코와 입
  ctx.fillStyle = '#ff7a95';
  ctx.beginPath();
  ctx.arc(r * 0.68, 0, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7a3a1a';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(r * 0.68, r * 0.1);
  ctx.quadraticCurveTo(r * 0.55, r * 0.25, r * 0.45, r * 0.18);
  ctx.moveTo(r * 0.68, -r * 0.1);
  ctx.quadraticCurveTo(r * 0.55, -r * 0.25, r * 0.45, -r * 0.18);
  ctx.stroke();

  // 수염
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(r * 0.55, s * r * 0.3);
    ctx.lineTo(r * 1.05, s * r * 0.5);
    ctx.moveTo(r * 0.55, s * r * 0.38);
    ctx.lineTo(r * 1.05, s * r * 0.75);
  }
  ctx.stroke();
  ctx.restore();
}

function drawBody(seg, i) {
  const x = seg.x * CELL + 1;
  const y = seg.y * CELL + 1;
  const w = CELL - 2;
  ctx.fillStyle = i % 2 ? '#f0a066' : '#e8914f';
  roundRect(x, y, w, w, 5);
  ctx.fill();
  // 줄무늬
  ctx.strokeStyle = 'rgba(160, 80, 20, 0.35)';
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.3, y + 3);
  ctx.lineTo(x + w * 0.3, y + w - 3);
  ctx.moveTo(x + w * 0.7, y + 3);
  ctx.lineTo(x + w * 0.7, y + w - 3);
  ctx.stroke();
}

// 벡터로 그린 물고기 (이모지 대신)
function drawFish(f) {
  const cx = f.x * CELL + CELL / 2;
  const cy = f.y * CELL + CELL / 2;
  const s = CELL / 2;
  ctx.save();
  ctx.translate(cx, cy);

  // 꼬리
  ctx.fillStyle = '#2f8fd8';
  ctx.beginPath();
  ctx.moveTo(s * 0.35, 0);
  ctx.lineTo(s * 0.95, -s * 0.5);
  ctx.quadraticCurveTo(s * 0.75, 0, s * 0.95, s * 0.5);
  ctx.closePath();
  ctx.fill();

  // 지느러미
  ctx.beginPath();
  ctx.moveTo(-s * 0.1, -s * 0.35);
  ctx.lineTo(s * 0.15, -s * 0.75);
  ctx.lineTo(s * 0.35, -s * 0.3);
  ctx.closePath();
  ctx.fill();

  // 몸통
  const g = ctx.createLinearGradient(0, -s * 0.5, 0, s * 0.5);
  g.addColorStop(0, '#7fd0ff');
  g.addColorStop(1, '#2f8fd8');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(-s * 0.1, 0, s * 0.75, s * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // 비늘 무늬
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(s * 0.1, 0, s * 0.22, -Math.PI / 2, Math.PI / 2);
  ctx.moveTo(-s * 0.1 + s * 0.22, 0);
  ctx.arc(-s * 0.1, 0, s * 0.22, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();

  // 눈
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-s * 0.5, -s * 0.1, s * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(-s * 0.53, -s * 0.1, s * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function draw() {
  drawGrid();
  if (food) drawFish(food);
  for (let i = snake.length - 1; i > 0; i--) drawBody(snake[i], i);
  drawHead(snake[0]);
}

document.addEventListener('keydown', (e) => {
  if (e.key === ' ' && !pauseBtn.disabled) {
    e.preventDefault();
    setPaused(!paused);
    return;
  }
  const d = DIRS[e.key];
  if (!d) return;
  e.preventDefault();
  // 현재 진행 방향의 정반대로는 전환 불가
  if (paused) return;
  if (d.x === -dir.x && d.y === -dir.y) return;
  if (pauseBtn.disabled) return;
  nextDir = d;
});

soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  try {
    localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off');
  } catch (e) {}
  renderSoundBtn();
  unlockAudio();
  playEatSound();
  soundBtn.blur();
});
renderSoundBtn();
pauseBtn.addEventListener('click', () => {
  setPaused(!paused);
  pauseBtn.blur();
});
document.getElementById('startBtn').addEventListener('click', start);
document.getElementById('restartBtn').addEventListener('click', start);

best = loadBest();
reset();
draw();
