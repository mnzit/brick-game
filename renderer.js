// Simple top-down endless car racing game
// Player controls a car that changes lanes to avoid incoming cars.

const canvas = document.getElementById('game');
if (!canvas) throw new Error("Canvas element 'game' not found.");
const ctx = canvas.getContext('2d');
let W = canvas.width;
let H = canvas.height;

// Game state
let running = false;
let score = 0;
let speed = 3; // base game speed
let highScore = 0;
let animationFrameId = null;

// Road/lane layout
const lanes = 3;
let laneWidth = W / lanes;
let roadMargin = 40;

// Responsive canvas sizing (handles DPR and window resize)
function resizeCanvas() {
    // Use most of the window but keep some margins
    const cssW = Math.max(320, Math.min(window.innerWidth * 0.95, 1600));
    const cssH = Math.max(240, Math.min(window.innerHeight * 0.9, 1100));

    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = Math.floor(cssW) + 'px';
    canvas.style.height = Math.floor(cssH) + 'px';
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    // Set logical width/height for drawing in CSS pixels
    W = cssW;
    H = cssH;

    // Reset transform so drawing uses CSS pixels; the canvas bitmap is scaled by DPR
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    roadMargin = Math.max(20, Math.round(W * 0.06));
    const innerRoadWidth = Math.max(100, W - roadMargin * 2);
    laneWidth = innerRoadWidth / lanes;

    // Recompute player/enemy sizes based on new H if images already loaded
    const targetH = Math.max(40, Math.round(H * 0.14));
    if (playerImgLoaded) {
        const aspect = playerImg.naturalWidth / playerImg.naturalHeight || 1;
        player.h = targetH;
        player.w = Math.round(targetH * aspect);
    } else {
        player.h = Math.max(40, Math.round(H * 0.12));
        player.w = Math.max(30, Math.round(player.h * 0.6));
    }

    if (trafficImgLoaded) {
        const aspect = trafficImg.naturalWidth / trafficImg.naturalHeight || 1;
        enemyDefaultH = targetH;
        enemyDefaultW = Math.round(targetH * aspect);
    } else {
        enemyDefaultH = Math.max(40, Math.round(H * 0.12));
        enemyDefaultW = Math.max(30, Math.round(enemyDefaultH * 0.6));
    }

    // Reposition player and existing enemies to new lane centers (account for roadMargin)
    player.x = roadMargin + player.lane * laneWidth + laneWidth / 2;
    player.y = H - Math.round(H * 0.18);
    for (const e of enemies) {
        e.x = roadMargin + e.lane * laneWidth + laneWidth / 2;
    }
}

// Images (use uploaded assets if available)
const playerImg = new Image();
playerImg.src = 'images/player.png';
let playerImgLoaded = false;
playerImg.addEventListener('load', () => {
    playerImgLoaded = true;
    // scale player w/h to image aspect ratio while keeping target height
    // if canvas already resized, use current H-based target, otherwise a sensible default
    const targetH = Math.max(40, Math.round((H || 480) * 0.14));
    const aspect = playerImg.naturalWidth / playerImg.naturalHeight || 1;
    player.h = targetH;
    player.w = Math.round(targetH * aspect);
});
playerImg.addEventListener('error', () => { playerImgLoaded = false; });

const trafficImg = new Image();
trafficImg.src = 'images/traffic.png';
let trafficImgLoaded = false;
let enemyDefaultW = 40;
let enemyDefaultH = 70;
trafficImg.addEventListener('load', () => {
    trafficImgLoaded = true;
    // compute default enemy size from image aspect ratio
    const targetH = Math.max(40, Math.round((H || 480) * 0.14));
    const aspect = trafficImg.naturalWidth / trafficImg.naturalHeight || 1;
    enemyDefaultH = targetH;
    enemyDefaultW = Math.round(targetH * aspect);
});
trafficImg.addEventListener('error', () => { trafficImgLoaded = false; });

// Crash audio (play on collision/end)
const crashAudio = new Audio('audio/crash.m4a');
crashAudio.preload = 'auto';
let crashAudioLoaded = false;
crashAudio.addEventListener('canplaythrough', () => { crashAudioLoaded = true; });
crashAudio.addEventListener('error', () => { crashAudioLoaded = false; });

// Background audio (looped during gameplay)
const bgAudio = new Audio('audio/backgroundaudio.mp3');
bgAudio.preload = 'auto';
bgAudio.loop = true;
bgAudio.volume = 0.5;
let bgAudioLoaded = false;
bgAudio.addEventListener('canplaythrough', () => { bgAudioLoaded = true; });
bgAudio.addEventListener('error', () => { bgAudioLoaded = false; });

// Player car
const player = {
    lane: 1, // 0..lanes-1 (start center)
    x: laneWidth * 1 + laneWidth / 2,
    y: H - 120,
    w: 40,
    h: 70,
    color: '#0cf'
};

// Enemy cars
let enemies = [];
let spawnTimer = 0;
const spawnInterval = 90; // frames

// Road stripe effect
let stripeOffset = 0;

// Input movement timing (prevents repeating moves when key is held)
let lastMoveTime = 0;
const minMoveInterval = 150; // ms between allowed lane changes

function resetGame() {
    score = 0;
    speed = 3;
    enemies = [];
    spawnTimer = 0;
    stripeOffset = 0;
    player.lane = 1;
    running = true;
    // start background audio if available (ignore play errors due to autoplay)
    try {
        if (bgAudioLoaded) {
            bgAudio.currentTime = 0;
            const p = bgAudio.play();
            if (p && p.catch) p.catch(() => {});
        }
    } catch (e) {
        // ignore
    }

    if (!animationFrameId) gameLoop();
}

function endGame() {
    running = false;
    // play crash sound if available
    try {
        if (crashAudioLoaded) {
            crashAudio.currentTime = 0;
            const p = crashAudio.play();
            if (p && p.catch) p.catch(() => {});
        }
    } catch (e) {
        // ignore playback errors
    }
    // stop/pause background audio when game ends
    try {
        if (bgAudioLoaded && !bgAudio.paused) {
            bgAudio.pause();
            bgAudio.currentTime = 0;
        }
    } catch (e) {
        // ignore
    }
    if (score > highScore) {
        highScore = score;
        if (window.electronAPI && window.electronAPI.setHighScore) {
            window.electronAPI.setHighScore(highScore);
        }
    }
}

function spawnEnemy() {
    const lane = Math.floor(Math.random() * lanes);
    const w = enemyDefaultW;
    const h = enemyDefaultH;
    const x = roadMargin + lane * laneWidth + laneWidth / 2;
    const y = -h - Math.random() * 200;
    enemies.push({ lane, x, y, w, h, color: '#c33' });
}

function update() {
    if (!running) return;

    // score increases with time and speed
    score += Math.floor(speed / 1.5);

    // gradually increase speed
    if (score % 1000 === 0) speed += 0.2;

    // update player x to lane center (lane changes handled on keydown)
    player.x = roadMargin + player.lane * laneWidth + laneWidth / 2;

    // spawn enemies periodically
    spawnTimer++;
    if (spawnTimer >= spawnInterval) {
        spawnTimer = 0;
        spawnEnemy();
    }

    // update enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
        enemies[i].y += speed + 1;
    // small lateral jitter for variety
    const laneCenter = roadMargin + enemies[i].lane * laneWidth + laneWidth / 2;
    enemies[i].x = laneCenter;
        // remove off-screen
        if (enemies[i].y > H + 100) enemies.splice(i, 1);
    }

    // collision check (rectangular approximation)
    for (const e of enemies) {
        const px = player.x - player.w / 2;
        const py = player.y - player.h / 2;
        const ex = e.x - e.w / 2;
        const ey = e.y - e.h / 2;
        if (px < ex + e.w && px + player.w > ex && py < ey + e.h && py + player.h > ey) {
            // collision
            endGame();
            break;
        }
    }

    stripeOffset += speed;
}

function drawRoad() {
    // background
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, W, H);

    // lanes
    ctx.fillStyle = '#333';
    ctx.fillRect(roadMargin, 0, W - roadMargin * 2, H);

    // lane markings
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    for (let i = 1; i < lanes; i++) {
        const x = roadMargin + i * laneWidth;
        ctx.setLineDash([20, 20]);
        ctx.lineDashOffset = -stripeOffset / 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
    }
    ctx.setLineDash([]);
}

function drawPlayer() {
    const x = player.x - player.w / 2;
    const y = player.y - player.h / 2;
    if (playerImgLoaded) {
        // draw the image centered in the player rect
        ctx.drawImage(playerImg, x, y, player.w, player.h);
    } else {
        ctx.fillStyle = player.color;
        roundRect(ctx, x, y, player.w, player.h, 6, true, false);
    }
}

function drawEnemies() {
    for (const e of enemies) {
        const x = e.x - e.w / 2;
        const y = e.y - e.h / 2;
        if (trafficImgLoaded) {
            ctx.drawImage(trafficImg, x, y, e.w, e.h);
        } else {
            ctx.fillStyle = e.color;
            roundRect(ctx, x, y, e.w, e.h, 6, true, false);
        }
    }
}

function drawHUD() {
    document.getElementById('score').innerText = score;
    document.getElementById('speed').innerText = Math.round(speed * 10) / 10;
    document.getElementById('high').innerText = highScore;
}

function draw() {
    drawRoad();
    drawEnemies();
    drawPlayer();
    drawHUD();
}

function gameLoop() {
    if (running) update();
    draw();
    animationFrameId = requestAnimationFrame(gameLoop);
}

// Helper: rounded rect
function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (typeof stroke === 'undefined') stroke = true;
    if (typeof r === 'undefined') r = 5;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
}

// Keydown handler: perform a single lane change per key press with debounce
document.addEventListener('keydown', e => {
    const now = performance.now();
    if (now - lastMoveTime < minMoveInterval) return;

    if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
        player.lane = Math.max(0, player.lane - 1);
        lastMoveTime = now;
    }
    if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
        player.lane = Math.min(lanes - 1, player.lane + 1);
        lastMoveTime = now;
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const restartButton = document.getElementById('restart');
    const toggleButton = document.getElementById('toggleFull');

    // Load high score
    if (window.electronAPI && window.electronAPI.getHighScore) {
        highScore = window.electronAPI.getHighScore();
    }

    if (restartButton) restartButton.addEventListener('click', () => resetGame());
    if (toggleButton && window.electronAPI && window.electronAPI.toggleFullscreen) {
        toggleButton.addEventListener('click', () => {
            window.electronAPI.toggleFullscreen();
        });
    }

    // make canvas responsive and start
    resizeCanvas();
    window.addEventListener('resize', () => {
        resizeCanvas();
    });

    resetGame();
});

// Expose for tests/debug
window._game = {
    resetGame,
    endGame
};
