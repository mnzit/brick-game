// Simple top-down endless car racing game
// Player controls a car that changes lanes to avoid incoming cars.

const canvas = document.getElementById('game');
if (!canvas) throw new Error("Canvas element 'game' not found.");
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

// Game state
let running = false;
let score = 0;
let speed = 3; // base game speed
let highScore = 0;
let animationFrameId = null;

// Road/lane layout
const lanes = 3;
const laneWidth = W / lanes;

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
    if (!animationFrameId) gameLoop();
}

function endGame() {
    running = false;
    if (score > highScore) {
        highScore = score;
        if (window.electronAPI && window.electronAPI.setHighScore) {
            window.electronAPI.setHighScore(highScore);
        }
    }
}

function spawnEnemy() {
    const lane = Math.floor(Math.random() * lanes);
    const w = 40;
    const h = 70;
    const x = lane * laneWidth + laneWidth / 2;
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
    player.x = player.lane * laneWidth + laneWidth / 2;

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
        const laneCenter = enemies[i].lane * laneWidth + laneWidth / 2;
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
    const roadMargin = 40;
    ctx.fillRect(roadMargin, 0, W - roadMargin * 2, H);

    // lane markings
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    for (let i = 1; i < lanes; i++) {
        const x = i * laneWidth;
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
    ctx.fillStyle = player.color;
    const x = player.x - player.w / 2;
    const y = player.y - player.h / 2;
    roundRect(ctx, x, y, player.w, player.h, 6, true, false);
}

function drawEnemies() {
    for (const e of enemies) {
        ctx.fillStyle = e.color;
        const x = e.x - e.w / 2;
        const y = e.y - e.h / 2;
        roundRect(ctx, x, y, e.w, e.h, 6, true, false);
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

    // Start
    resetGame();
});

// Expose for tests/debug
window._game = {
    resetGame,
    endGame
};
