console.log("Gra Robale: Inicjalizacja skryptu...");

window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error("Błąd w grze: ", msg, " w ", url, " linia: ", lineNo);
    return false;
};

const canvas = document.getElementById('gameCanvas');
if (!canvas) console.error("Nie znaleziono elementu gameCanvas!");
const ctx = canvas ? canvas.getContext('2d') : null;
if (!ctx) console.error("Nie udało się uzyskać kontekstu 2D canvas!");

const menuContainer = document.getElementById('menu-container');
const skinMenu = document.getElementById('skin-menu');
const rebirthMenu = document.getElementById('rebirth-menu');
const matchmakingMenu = document.getElementById('matchmaking-menu');
const difficultyMenu = document.getElementById('difficulty-menu');
const diffBtns = document.querySelectorAll('.diff-btn');
const diffBackBtn = document.getElementById('diff-back-btn');
const lobbyTimerUI = document.getElementById('lobby-timer');
const lobbyPlayersUI = document.getElementById('lobby-players');
const cancelMatchmakingBtn = document.getElementById('cancel-matchmaking-btn');
const mobileControls = document.getElementById('mobile-controls');
const joystickZone = document.getElementById('joystick-zone');
const joystickBase = document.getElementById('joystick-base');
const joystickHandle = document.getElementById('joystick-handle');
const playBtn = document.getElementById('play-btn');
const skinBtn = document.getElementById('skin-btn');
const backBtn = document.getElementById('back-btn');
const rebirthBtn = document.getElementById('rebirth-btn');
const rebirthBackBtn = document.getElementById('rebirth-back-btn');
const doRebirthBtn = document.getElementById('do-rebirth-btn');
const rebirthCountUI = document.getElementById('rebirth-count');
const eatenCountUI = document.getElementById('eaten-count-ui');
const rebirthCostUI = document.getElementById('rebirth-cost-ui');
const multiplierUI = document.getElementById('multiplier-ui');
const buySpiderBtn = document.getElementById('buy-spider-btn');
const buyAntBtn = document.getElementById('buy-ant-btn');
const buyBeeBtn = document.getElementById('buy-bee-btn');
const selectBeetleBtn = document.querySelector('.select-skin-btn[data-skin="beetle"]');

// Socket.io initialization
let socket;
try {
    socket = io();
} catch (e) {
    console.warn("Socket.io not loaded, running in offline mode");
}
let remotePlayers = {};

let gameState = 'MENU'; // MENU, SKINS, REBIRTH, LOBBY, PLAYING
let rebirths = 0;
let totalEaten = 0;
let currentSkin = 'beetle';
let ownedSkins = ['beetle'];
let kills = 0;
let difficulty = 'medium'; // easy, medium, hard

const leaderboardUI = document.getElementById('leaderboard');

// Lobby variables
let lobbyTimer = 10;
let lobbyInterval = null;
let lobbyPlayersCount = 1;
let lastTime = 0;

// Mobile controls variables
let joystickActive = false;
let joystickAngle = 0;
let joystickDist = 0;

// Player data
let player = {
    x: 500,
    y: 500,
    size: 45,
    baseSpeed: 4,
    angle: 0,
    targetAngle: 0,
    hp: 100,
    maxHp: 100,
    chargeTime: 0,
    isCharging: false,
    lastAttack: 0,
    dashTime: 0,
    dashCooldown: 0,
    lungeTime: 0,
    lastHp: 100,
    baseDamage: 25,
    poison: {
        active: false,
        damage: 2,
        duration: 3000
    }
};

// World data
const buildings = [];
const decorations = []; 
const entities = []; 
const bots = [];
const particles = [];
let screenShake = 0;
const WORLD_SIZE = 4000;

function spawnParticles(x, y, color, count = 10, speed = 5) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * speed,
            vy: (Math.random() - 0.5) * speed,
            life: 1.0,
            decay: 0.02 + Math.random() * 0.03,
            size: 2 + Math.random() * 5,
            color: color
        });
    }
}

function worldToScreen(x, y) {
    const baseZoom = 1.0;
    const zoom = Math.max(0.3, baseZoom / (1 + (player.size - 45) * 0.003));
    const camX = player.x;
    const camY = player.y;
    return {
        x: (x - camX) * zoom + canvas.width / 2,
        y: (y - camY) * zoom + canvas.height / 2
    };
}

function applyPoison(target) {
    if (target.poisonInterval) {
        clearInterval(target.poisonInterval);
    }
    
    target.poisoned = true;
    let ticks = 0;
    target.poisonInterval = setInterval(() => {
        target.hp -= player.poison.damage;
        
        // Visual for poison
        spawnParticles(target.x, target.y, '#2ecc71', 5, 2);

        ticks++;
        if (ticks >= 6 || target.hp <= 0) {
            clearInterval(target.poisonInterval);
            target.poisoned = false;
            target.poisonInterval = null;
        }
    }, 500);
}

function getDamage(p) {
    let missingHp = p.maxHp - p.hp;
    let bonus = missingHp * 0.05;
    return (p.baseDamage || 25) + bonus;
}

function beetleDashHit(enemy) {
    // Knockback in the direction of the dash
    const angle = player.angle;
    enemy.x += Math.cos(angle) * 50;
    enemy.y += Math.sin(angle) * 50;
    enemy.hp -= 20;
    
    // Add effects since we are improving the feel
    spawnParticles(enemy.x, enemy.y, 'white', 20);
    hitEffect(enemy.x, enemy.y);
    triggerShake(15);
}

function hitEffect(x, y) {
    try {
        const screenPos = worldToScreen(x, y);
        if (!screenPos || isNaN(screenPos.x) || isNaN(screenPos.y)) return;

        const effect = document.createElement("div");
        effect.className = "hit";
        effect.style.left = screenPos.x + "px";
        effect.style.top = screenPos.y + "px";
        document.body.appendChild(effect);
        setTimeout(() => {
            if (effect && effect.parentNode) effect.remove();
        }, 200);
    } catch (e) {
        console.warn("Hit effect failed:", e);
    }
}

function updateLeaderboard() {
    if (!leaderboardUI) return;
    let players = [
        { name: "Ty", kills: kills },
        ...bots.map(b => ({ name: b.name || "Bot", kills: b.kills || 0 })),
        ...Object.values(remotePlayers).map(p => ({ name: p.name || "Gracz", kills: p.kills || 0 }))
    ];
    
    players.sort((a, b) => b.kills - a.kills);
    
    leaderboardUI.innerHTML = "<b>Ranking:</b>" + players.slice(0, 5).map(p =>
        `<div>${p.name} - ${p.kills}</div>`
    ).join("");
}

// Persistence
function saveGame() {
    try {
        const gameStateData = {
            rebirths: rebirths,
            totalEaten: totalEaten,
            currentSkin: currentSkin,
            ownedSkins: ownedSkins
        };
        localStorage.setItem('robale_v2', JSON.stringify(gameStateData));
    } catch (e) {
        console.error("Nie udało się zapisać gry", e);
    }
}

function loadGame() {
    try {
        const savedData = localStorage.getItem('robale_v2');
        if (savedData) {
            const data = JSON.parse(savedData);
            rebirths = data.rebirths || 0;
            if (rebirths > 2) rebirths = 2; // Cap legacy progress
            totalEaten = data.totalEaten || 0;
            currentSkin = data.currentSkin || 'beetle';
            ownedSkins = data.ownedSkins || ['beetle'];
            updateRebirthUI();
        }
    } catch (e) {
        console.error("Nie udało się wczytać gry", e);
    }
}

function resizeCanvas() {
    if (canvas) {
        let width = window.innerWidth;
        let height = window.innerHeight;
        const ratio = 16 / 9;
        
        if (width / height > ratio) {
            width = height * ratio;
        } else {
            height = width / ratio;
        }
        
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        canvas.style.left = (window.innerWidth - width) / 2 + 'px';
        canvas.style.top = (window.innerHeight - height) / 2 + 'px';
        canvas.style.position = 'fixed';
    }
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function getRebirthCost() {
    return (rebirths + 1) * 100;
}

function getGrowthMultiplier() {
    return Math.pow(2, rebirths);
}

function getDamageMultiplier() {
    if (currentSkin === 'bee') return 3.0;
    if (currentSkin === 'ant') return 2.0;
    if (currentSkin === 'spider') return 1.5;
    return 1.0;
}

function getSpeedMultiplier() {
    if (currentSkin === 'bee') return 2.5;
    if (currentSkin === 'ant') return 1.25;
    return 1.0;
}

// Event Listeners
if (playBtn) {
    playBtn.addEventListener('click', () => {
        if (menuContainer) menuContainer.classList.add('hidden');
        if (difficultyMenu) difficultyMenu.classList.remove('hidden');
    });
}

if (diffBtns) {
    diffBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            difficulty = e.target.getAttribute('data-diff');
            if (difficultyMenu) difficultyMenu.classList.add('hidden');
            startLobby();
        });
    });
}

if (diffBackBtn) {
    diffBackBtn.addEventListener('click', () => {
        if (difficultyMenu) difficultyMenu.classList.add('hidden');
        if (menuContainer) menuContainer.classList.remove('hidden');
    });
}

function startLobby() {
    gameState = 'LOBBY';
    if (menuContainer) menuContainer.classList.add('hidden');
    if (matchmakingMenu) matchmakingMenu.classList.remove('hidden');
    lobbyTimer = 10;
    lobbyPlayersCount = 1;
    if (lobbyTimerUI) lobbyTimerUI.innerText = lobbyTimer;
    if (lobbyPlayersUI) lobbyPlayersUI.innerText = lobbyPlayersCount;

    if (typeof socket !== 'undefined' && socket && socket.emit) {
        socket.emit('joinLobby');
    } else {
        // Fallback for no socket - wait 10s as requested
        let timeLeft = 10;
        const interval = setInterval(() => {
            timeLeft--;
            if (lobbyTimerUI) lobbyTimerUI.innerText = timeLeft;
            if (timeLeft <= 0) {
                clearInterval(interval);
                startGame();
            }
        }, 1000);
    }
}

if (socket) {
    socket.on('lobbyUpdate', (data) => {
        lobbyPlayersCount = data.playersCount;
        lobbyTimer = data.timeLeft;
        if (lobbyTimerUI) lobbyTimerUI.innerText = lobbyTimer;
        if (lobbyPlayersUI) lobbyPlayersUI.innerText = lobbyPlayersCount;
    });

    socket.on('gameStart', (data) => {
        startGame();
    });

    socket.on('playerJoined', (data) => {
        remotePlayers[data.id] = data;
    });

    socket.on('playerMoved', (data) => {
        remotePlayers[data.id] = data;
    });

    socket.on('playerDisconnected', (id) => {
        delete remotePlayers[id];
    });

    socket.on('playerAttacked', (data) => {
        if (data.id === socket.id) {
            player.hp -= data.damage;
            spawnParticles(player.x, player.y, 'red', 20);
            triggerShake(20);
        }
    });
}

if (cancelMatchmakingBtn) {
    cancelMatchmakingBtn.addEventListener('click', () => {
        gameState = 'MENU';
        if (matchmakingMenu) matchmakingMenu.classList.add('hidden');
        if (menuContainer) menuContainer.classList.remove('hidden');
        if (socket && socket.emit) socket.emit('leaveLobby'); // Optional: handle on server
        location.reload(); // Simplest way to reset state
    });
}

function startGame() {
    gameState = 'PLAYING';
    matchmakingMenu.classList.add('hidden');
    canvas.classList.remove('hidden');
    mobileControls.classList.remove('hidden');
    if (leaderboardUI) leaderboardUI.classList.remove('hidden');
    player.size = 45;
    player.hp = player.maxHp;
    kills = 0;
    updateLeaderboard();
    
    if (socket) {
        socket.emit('playerInit', {
            x: player.x,
            y: player.y,
            size: player.size,
            angle: player.angle,
            hp: player.hp,
            maxHp: player.maxHp,
            skin: currentSkin,
            name: "Gracz" + Math.floor(Math.random()*100)
        });
    }

    initGame();
}

if (skinBtn) {
    skinBtn.addEventListener('click', () => {
        gameState = 'SKINS';
        if (menuContainer) menuContainer.classList.add('hidden');
        if (skinMenu) skinMenu.classList.remove('hidden');
        updateSkinUI();
    });
}

function updateSkinUI() {
    if (buySpiderBtn && ownedSkins.includes('spider')) {
        buySpiderBtn.innerText = currentSkin === 'spider' ? 'Wybrano' : 'Wybierz';
    } else if (buySpiderBtn) {
        buySpiderBtn.innerText = 'Kup (200 pkt)';
    }
    
    if (buyAntBtn && ownedSkins.includes('ant')) {
        buyAntBtn.innerText = currentSkin === 'ant' ? 'Wybrano' : 'Wybierz';
    } else if (buyAntBtn) {
        buyAntBtn.innerText = 'Kup (1000 pkt)';
    }

    if (buyBeeBtn && ownedSkins.includes('bee')) {
        buyBeeBtn.innerText = currentSkin === 'bee' ? 'Wybrano' : 'Wybierz';
    } else if (buyBeeBtn) {
        buyBeeBtn.innerText = 'Kup (1500 pkt)';
    }

    if (selectBeetleBtn) {
        selectBeetleBtn.innerText = currentSkin === 'beetle' ? 'Wybrano' : 'Wybierz';
    }
}

if (buySpiderBtn) {
    buySpiderBtn.addEventListener('click', () => {
        if (ownedSkins.includes('spider')) {
            currentSkin = 'spider';
        } else if (totalEaten >= 200) {
            totalEaten -= 200;
            ownedSkins.push('spider');
            currentSkin = 'spider';
            alert('Zakupiono skórkę Pająka!');
        } else {
            alert('Brakuje Ci punktów!');
        }
        updateSkinUI();
        saveGame();
    });
}

if (buyAntBtn) {
    buyAntBtn.addEventListener('click', () => {
        if (ownedSkins.includes('ant')) {
            currentSkin = 'ant';
        } else if (totalEaten >= 1000) {
            totalEaten -= 1000;
            ownedSkins.push('ant');
            currentSkin = 'ant';
            alert('Zakupiono skórkę Mrówki!');
        } else {
            alert('Brakuje Ci punktów!');
        }
        updateSkinUI();
        saveGame();
    });
}

if (buyBeeBtn) {
    buyBeeBtn.addEventListener('click', () => {
        if (ownedSkins.includes('bee')) {
            currentSkin = 'bee';
        } else if (totalEaten >= 1500) {
            totalEaten -= 1500;
            ownedSkins.push('bee');
            currentSkin = 'bee';
            alert('Zakupiono skórkę Pszczoły!');
        } else {
            alert('Brakuje Ci punktów!');
        }
        updateSkinUI();
        saveGame();
    });
}

if (selectBeetleBtn) {
    selectBeetleBtn.addEventListener('click', () => {
        currentSkin = 'beetle';
        updateSkinUI();
        saveGame();
    });
}

if (rebirthBtn) {
    rebirthBtn.addEventListener('click', () => {
        gameState = 'REBIRTH';
        if (menuContainer) menuContainer.classList.add('hidden');
        if (rebirthMenu) rebirthMenu.classList.remove('hidden');
        updateRebirthUI();
    });
}

function updateRebirthUI() {
    if (eatenCountUI) eatenCountUI.innerText = totalEaten;
    if (rebirthCostUI) rebirthCostUI.innerText = rebirths >= 2 ? "MAX" : getRebirthCost();
    if (multiplierUI) multiplierUI.innerText = getGrowthMultiplier();
    if (rebirthCountUI) rebirthCountUI.innerText = rebirths + "/2";
}

if (backBtn) {
    backBtn.addEventListener('click', () => {
        gameState = 'MENU';
        if (skinMenu) skinMenu.classList.add('hidden');
        if (menuContainer) menuContainer.classList.remove('hidden');
    });
}

if (rebirthBackBtn) {
    rebirthBackBtn.addEventListener('click', () => {
        gameState = 'MENU';
        if (rebirthMenu) rebirthMenu.classList.add('hidden');
        if (menuContainer) menuContainer.classList.remove('hidden');
    });
}

if (doRebirthBtn) {
    doRebirthBtn.addEventListener('click', () => {
        if (rebirths >= 2) {
            alert("Osiągnąłeś maksymalną liczbę Rebirthów (2)!");
            return;
        }
        const cost = getRebirthCost();
        if (totalEaten >= cost) {
            rebirths++;
            totalEaten -= cost;
            player.size = 45; 
            player.hp = player.maxHp;
            updateRebirthUI();
            saveGame();
            alert(`Rebirth udany! Nowy mnożnik wzrostu: x${getGrowthMultiplier()}`);
        } else {
            alert(`Potrzebujesz zjeść jeszcze ${cost - totalEaten} things!`);
        }
    });
}

function initGame() {
    if (buildings.length === 0) {
        generateCity();
        spawnEntities();
    }
    
    // Clear bots before spawning new ones
    bots.length = 0;
    
    // Spawn regular bots
    spawnBots(10);
    
    requestAnimationFrame(gameLoop);
}

function generateCity() {
    buildings.length = 0;
    const blockSize = 400;
    const padding = 150;

    for (let x = 0; x < WORLD_SIZE; x += blockSize) {
        for (let y = 0; y < WORLD_SIZE; y += blockSize) {
            if (Math.random() > 0.4 && (Math.abs(x - 500) > 300 || Math.abs(y - 500) > 300)) {
                buildings.push({
                    x: x + padding / 2,
                    y: y + padding / 2,
                    w: blockSize - padding,
                    h: blockSize - padding,
                    color: `rgb(${30 + Math.random() * 20}, ${30 + Math.random() * 20}, ${35 + Math.random() * 25})`,
                    roofStyle: Math.floor(Math.random() * 3)
                });
            }
        }
    }
}

function spawnEntities() {
    entities.length = 0;
    const types = [
        { name: 'white_ball', size: 15, color: 'white', growth: 2, value: 1, count: 120 },
        { name: 'black_ball', size: 25, color: '#111', growth: 5, value: 3, count: 60 },
        { name: 'car', size: 60, color: '#c0392b', growth: 15, value: 10, count: 40 }
    ];

    types.forEach(type => {
        for (let i = 0; i < type.count; i++) {
            spawnEntity(type);
        }
    });
}

function spawnEntity(type) {
    let x, y, collides;
    let attempts = 0;
    do {
        x = Math.random() * WORLD_SIZE;
        y = Math.random() * WORLD_SIZE;
        collides = buildings.some(b => 
            x > b.x - 20 && x < b.x + b.w + 20 && 
            y > b.y - 20 && y < b.y + b.h + 20
        );
        attempts++;
    } while (collides && attempts < 10);

    entities.push({
        x, y, 
        type: type.name, 
        size: type.size, 
        color: type.color, 
        growth: type.growth,
        value: type.value
    });
}

function spawnBots(count) {
    for (let i = 0; i < count; i++) {
        spawnBot(false);
    }
}

function spawnBot(isPlayer = false) {
    let x, y, collides;
    do {
        x = Math.random() * WORLD_SIZE;
        y = Math.random() * WORLD_SIZE;
        collides = buildings.some(b => 
            x > b.x - 50 && x < b.x + b.w + 50 && 
            y > b.y - 50 && y < b.y + b.h + 50
        );
    } while (collides);

    const skins = ['beetle', 'spider', 'ant', 'bee'];
    const names = ['Killer', 'ProGamer', 'Robal123', 'Slayer', 'Speedy', 'Shadow', 'Hunter', 'Rex', 'Max', 'Ace'];
    
    let speedMult = 1.0;
    let hpVal = 100;
    let aiSmartness = 1.0;
    let dmgMult = 1.0;

    if (difficulty === 'easy') { 
        speedMult = 0.4; 
        hpVal = 40; 
        aiSmartness = 0.3;
        dmgMult = 0.3;
    } else if (difficulty === 'hard') { 
        speedMult = 2.0; 
        hpVal = 250; 
        aiSmartness = 2.0;
        dmgMult = 2.5;
    }

    bots.push({
        x, y,
        size: 30 + (isPlayer ? Math.random() * 20 : Math.random() * 100),
        hp: hpVal,
        maxHp: hpVal,
        angle: Math.random() * Math.PI * 2,
        speed: (2 + Math.random() * 2) * speedMult,
        color: isPlayer ? '#3498db' : `hsl(${Math.random() * 360}, 50%, 40%)`,
        lastAttack: 0,
        dashCooldown: 0,
        dashTime: 0,
        skin: skins[Math.floor(Math.random() * skins.length)],
        isPlayer: isPlayer,
        name: isPlayer ? names[Math.floor(Math.random() * names.length)] + Math.floor(Math.random()*99) : null,
        kills: 0,
        aiSmartness: aiSmartness,
        dmgMult: dmgMult
    });
}

const keys = {};
window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    keys[e.code.toLowerCase()] = true; // Use code for robustness
    if (e.code === 'Space') performDash();
});
window.addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
    keys[e.code.toLowerCase()] = false;
});

window.addEventListener('mousedown', e => {
    if (gameState !== 'PLAYING') return;
    if (e.button === 0) performShiftAttack();
    if (e.button === 2) player.isCharging = true;
});

window.addEventListener('mouseup', e => {
    if (gameState !== 'PLAYING') return;
    if (e.button === 2) {
        performEnterAttack();
        player.isCharging = false;
        player.chargeTime = 0;
    }
});

window.addEventListener('contextmenu', e => {
    if (gameState === 'PLAYING') e.preventDefault();
});

// Mobile Controls Event Listeners
const mobileDashBtn = document.getElementById('mobile-dash-btn');
const mobileAttackLpmBtn = document.getElementById('mobile-attack-lpm-btn');
const mobileAttackPpmBtn = document.getElementById('mobile-attack-ppm-btn');

if (mobileDashBtn) {
    mobileDashBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        performDash();
    });
}

if (mobileAttackLpmBtn) {
    mobileAttackLpmBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        player.isCharging = true;
    });

    mobileAttackLpmBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        performEnterAttack();
        player.isCharging = false;
        player.chargeTime = 0;
    });
}

if (mobileAttackPpmBtn) {
    mobileAttackPpmBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        performShiftAttack();
    });
}

// Joystick logic
if (joystickZone) {
    joystickZone.addEventListener('touchstart', (e) => {
        joystickActive = true;
        updateJoystick(e.touches[0]);
    });
}

window.addEventListener('touchmove', (e) => {
    if (!joystickActive) return;
    updateJoystick(e.touches[0]);
}, { passive: false });

window.addEventListener('touchend', () => {
    joystickActive = false;
    joystickHandle.style.transform = 'translate(-50%, -50%)';
    joystickDist = 0;
});

function updateJoystick(touch) {
    const rect = joystickBase.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = touch.clientX - centerX;
    const dy = touch.clientY - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = rect.width / 2;
    
    joystickAngle = Math.atan2(dy, dx);
    joystickDist = Math.min(1, dist / maxDist);
    
    const moveX = Math.cos(joystickAngle) * Math.min(dist, maxDist);
    const moveY = Math.sin(joystickAngle) * Math.min(dist, maxDist);
    
    joystickHandle.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`;
}

function performDash() {
    if (player.dashCooldown > 0) return;
    player.dashTime = 20; 
    player.dashCooldown = 120; 
}

function checkCollision(nx, ny, size) {
    if (nx < 0 || nx > WORLD_SIZE || ny < 0 || ny > WORLD_SIZE) return true;
    for (const b of buildings) {
        if (nx + size/2 > b.x && nx - size/2 < b.x + b.w &&
            ny + size/2 > b.y && ny - size/2 < b.y + b.h) {
            return true;
        }
    }
    return false;
}

function performShiftAttack() {
    const now = Date.now();
    if (now - player.lastAttack < 500) return;
    player.lastAttack = now;
    player.lungeTime = 15; // Trigger lunge

    const attackRange = player.size * 2.5; 
    const skinDmg = getDamageMultiplier();
    const currentBaseDmg = getDamage(player); 
    
    bots.forEach(bot => {
        const dist = Math.sqrt((player.x - bot.x)**2 + (player.y - bot.y)**2);
        if (dist < attackRange) {
            const angleToBot = Math.atan2(bot.y - player.y, bot.x - player.x);
            let angleDiff = Math.abs(player.angle - angleToBot);
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            angleDiff = Math.abs(angleDiff);

            if (angleDiff < 1.5) { 
                const sizeRatio = player.size / bot.size;
                let damage = currentBaseDmg * skinDmg * Math.max(1.0, Math.min(2.0, sizeRatio));
                
                // One-shot protection for bots (normal attack)
                if (damage >= bot.hp && bot.hp === bot.maxHp) {
                    damage = bot.hp - 1;
                }
                
                bot.hp -= damage;
                
                if (currentSkin === 'spider') {
                    applyPoison(bot);
                }

                spawnParticles(bot.x, bot.y, bot.color || 'red', 15);
                hitEffect(bot.x, bot.y);
                triggerShake(10);
            }
        }
    });

    Object.values(remotePlayers).forEach(p => {
        const dist = Math.sqrt((player.x - p.x)**2 + (player.y - p.y)**2);
        if (dist < attackRange) {
            if (socket) socket.emit('attack', { id: p.id, damage: 25 * skinDmg, type: 'shift' });
        }
    });
}

function performEnterAttack() {
    const baseDamageVal = Math.min(150, (player.chargeTime / 3000) * 150); // Faster charge, more dmg
    const hpBonus = (player.maxHp - player.hp) * 0.1; // Increased HP bonus
    const finalBaseDmg = baseDamageVal + hpBonus;
    const attackRange = player.size * 3; // Increased range
    const skinDmg = getDamageMultiplier();
    
    bots.forEach(bot => {
        const dist = Math.sqrt((player.x - bot.x)**2 + (player.y - bot.y)**2);
        if (dist < attackRange) {
            const angleToBot = Math.atan2(bot.y - player.y, bot.x - player.x);
            let angleDiff = Math.abs(player.angle - angleToBot);
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            angleDiff = Math.abs(angleDiff);

            if (angleDiff < 1.8) { // Generous angle
                const sizeRatio = player.size / bot.size;
                const damage = finalBaseDmg * skinDmg * Math.max(1.0, Math.min(2.5, sizeRatio));
                bot.hp -= damage;
                
                if (currentSkin === 'spider') {
                    applyPoison(bot);
                }

                spawnParticles(bot.x, bot.y, 'orange', 25, 8);
                hitEffect(bot.x, bot.y);
                triggerShake(20);
            }
        }
    });

    Object.values(remotePlayers).forEach(p => {
        const dist = Math.sqrt((player.x - p.x)**2 + (player.y - p.y)**2);
        if (dist < attackRange) {
            if (socket) socket.emit('attack', { id: p.id, damage: baseDamage * skinDmg, type: 'enter' });
        }
    });
}

function updateBots() {
    for (let idx = bots.length - 1; idx >= 0; idx--) {
        const bot = bots[idx];
        if (bot.dashCooldown > 0) bot.dashCooldown--;

        // Smarter Target Selection
        let targets = [...bots.filter((_, i) => i !== idx), player];
        let closest = null;
        let minDist = Infinity;

        targets.forEach(t => {
            const d = Math.sqrt((bot.x - t.x)**2 + (bot.y - t.y)**2);
            if (d < minDist) {
                minDist = d;
                closest = t;
            }
        });

        // Flee if low HP
        const isLowHp = bot.hp < 30;
        
        if (isLowHp && closest && minDist < 300) {
            // Run away
            const fleeAngle = Math.atan2(bot.y - closest.y, bot.x - closest.x);
            bot.angle = fleeAngle;
            if (bot.dashCooldown === 0) {
                bot.dashTime = 20;
                bot.dashCooldown = 200;
            }
        } else if (minDist < 500 && closest) {
            // Chase/Attack
            const targetAngle = Math.atan2(closest.y - bot.y, closest.x - bot.x);
            let angleDiff = targetAngle - bot.angle;
            if (isNaN(angleDiff)) angleDiff = 0;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            
            // AI Smartness affects turn speed and decision making
            bot.angle += angleDiff * 0.08 * (bot.aiSmartness || 1.0);

            if (minDist > (bot.size + closest.size) * 0.6) { // Bots must be closer to hit
                let speed = bot.speed;
                if (bot.dashTime > 0) { speed *= 3; bot.dashTime--; }
                
                // Randomly "stumble" if not smart
                if ((bot.aiSmartness || 1.0) < 0.5 && Math.random() < 0.02) {
                    bot.angle += (Math.random() - 0.5) * 2;
                }

                const nx = bot.x + Math.cos(bot.angle) * speed;
                const ny = bot.y + Math.sin(bot.angle) * speed;
                if (!checkCollision(nx, bot.y, bot.size)) bot.x = nx;
                if (!checkCollision(bot.x, ny, bot.size)) bot.y = ny;
            } else {
                const now = Date.now();
                // Smart bots attack faster
                const attackDelay = 1200 / (bot.aiSmartness || 1.0);
                if (now - bot.lastAttack > attackDelay) { 
                    const sizeRatio = bot.size / closest.size;
                    const botSkinDmg = bot.skin === 'ant' ? 1.5 : (bot.skin === 'spider' ? 1.2 : 0.8); 
                    let damage = 10 * botSkinDmg * (bot.dmgMult || 1.0) * Math.max(0.5, Math.min(1.2, sizeRatio)); 
                    
                    // One-shot protection (bots attacking player or other bots)
                    if (damage >= closest.hp && closest.hp === closest.maxHp) {
                        damage = closest.hp - 1;
                    }
                    
                    closest.hp -= damage;
                    spawnParticles(closest.x, closest.y, (closest === player ? 'red' : (closest.color || 'white')), 10);
                    hitEffect(closest.x, closest.y);
                    if (closest === player) triggerShake(15);
                    bot.lastAttack = now;
                }
            }
        } else {
            // Food search...
            let closestFood = null;
            let minFoodDist = Infinity;
            entities.forEach(e => {
                const d = Math.sqrt((bot.x - e.x)**2 + (bot.y - e.y)**2);
                if (d < minFoodDist) { minFoodDist = d; closestFood = e; }
            });

            if (closestFood) {
                const targetAngle = Math.atan2(closestFood.y - bot.y, closestFood.x - bot.x);
                let angleDiff = targetAngle - bot.angle;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                bot.angle += angleDiff * 0.05;
                const nx = bot.x + Math.cos(bot.angle) * bot.speed;
                const ny = bot.y + Math.sin(bot.angle) * bot.speed;
                if (!checkCollision(nx, bot.y, bot.size)) bot.x = nx;
                if (!checkCollision(bot.x, ny, bot.size)) bot.y = ny;

                if (minFoodDist < bot.size/2 + closestFood.size/2) {
                    bot.size += closestFood.growth * 0.5;
                    entities.splice(entities.indexOf(closestFood), 1);
                    setTimeout(() => spawnEntity({
                        'white_ball': { name: 'white_ball', size: 15, color: 'white', growth: 2, value: 1 },
                        'black_ball': { name: 'black_ball', size: 25, color: '#111', growth: 5, value: 3 },
                        'car': { name: 'car', size: 60, color: '#c0392b', growth: 15, value: 10 }
                    }[closestFood.type]), 3000);
                }
            } else {
                bot.angle += (Math.random() - 0.5) * 0.1;
                const nx = bot.x + Math.cos(bot.angle) * (bot.speed * 0.5);
                const ny = bot.y + Math.sin(bot.angle) * (bot.speed * 0.5);
                if (!checkCollision(nx, bot.y, bot.size)) bot.x = nx;
                if (!checkCollision(bot.x, ny, bot.size)) bot.y = ny;
            }
        }

        if (bot.hp <= 0) {
            kills++;
            totalEaten += 50;
            bots.splice(idx, 1);
            updateLeaderboard();
            if (bots.length === 0) {
                setTimeout(() => {
                    alert("Wygrałeś! Pokonałeś wszystkie robale. Otrzymujesz 100 punktów!");
                    totalEaten += 100;
                    saveGame();
                    updateRebirthUI();
                    gameState = 'MENU';
                    canvas.classList.add('hidden');
                    mobileControls.classList.add('hidden');
                    menuContainer.classList.remove('hidden');
                }, 100);
            }
        }
    }
}

function spawnBush(x, y) {
    decorations.push({
        type: 'bush',
        x: x + (Math.random() - 0.5) * 100,
        y: y + (Math.random() - 0.5) * 100,
        size: 30
    });
}

function update(dt) {
    const dts = dt * 60; // scale factor for 60fps logic
    // Update screen shake
    if (screenShake > 0) screenShake *= Math.pow(0.9, dts);
    if (screenShake < 0.1) screenShake = 0;

    // Update particles (Limit to 500 to prevent lag)
    if (particles.length > 500) particles.splice(0, particles.length - 500);
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dts;
        p.y += p.vy * dts;
        p.life -= p.decay * dts;
        if (p.life <= 0 || isNaN(p.x) || isNaN(p.y)) {
            particles.splice(i, 1);
        }
    }

    if (player.hp < player.lastHp) {
        spawnBush(player.x, player.y);
    }
    player.lastHp = player.hp;

    if (player.hp <= 0) {
        alert("Zginąłeś! Powrót do menu głównego.");
        player.hp = player.maxHp;
        player.size = 45;
        player.x = 500;
        player.y = 500;
        gameState = 'MENU';
        canvas.classList.add('hidden');
        mobileControls.classList.add('hidden');
        menuContainer.classList.remove('hidden');
        return;
    }

    if (player.dashCooldown > 0) player.dashCooldown--;
    if (player.lungeTime > 0) player.lungeTime--;

    if (player.isCharging) {
        player.chargeTime += 16.67; // approx 60fps
    }

    // Leczenie w krzakach
    for (let i = decorations.length - 1; i >= 0; i--) {
        const d = decorations[i];
        if (d.type === 'bush') {
            const dist = Math.sqrt((player.x - d.x)**2 + (player.y - d.y)**2);
            if (dist < (player.size/2 + d.size)) {
                player.hp = Math.min(player.maxHp, player.hp + 3);
                decorations.splice(i, 1);
                break; 
            }
        }
    }

    let dx = 0;
    let dy = 0;
    
    // Keyboard input
    if (keys['w'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['arrowdown']) dy += 1;
    if (keys['a'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;

    // Joystick input override if active
    if (joystickActive && joystickDist > 0.1) {
        dx = Math.cos(joystickAngle) * joystickDist;
        dy = Math.sin(joystickAngle) * joystickDist;
    }

    if (dx !== 0 || dy !== 0 || player.dashTime > 0 || player.lungeTime > 0) {
        let speed = player.baseSpeed * (1 + rebirths * 0.1) * getSpeedMultiplier();
        
        if (player.dashTime > 0) {
            speed *= 4; 
            player.dashTime--;
            
            // Check for dash collisions with bots
            bots.forEach(bot => {
                const dist = Math.sqrt((player.x - bot.x)**2 + (player.y - bot.y)**2);
                if (dist < (player.size/2 + bot.size/2)) {
                    beetleDashHit(bot);
                    player.dashTime = 0; // Stop dashing on hit
                }
            });

            if (dx === 0 && dy === 0) {
                dx = Math.cos(player.angle);
                dy = Math.sin(player.angle);
            }
        } else if (player.lungeTime > 0) {
            speed *= 2.5; // Lunge during attack
            if (dx === 0 && dy === 0) {
                dx = Math.cos(player.angle);
                dy = Math.sin(player.angle);
            }
        } else {
            const mag = Math.sqrt(dx * dx + dy * dy);
            dx /= mag;
            dy /= mag;
            player.targetAngle = Math.atan2(dy, dx);
            let angleDiff = player.targetAngle - player.angle;
            if (isNaN(angleDiff)) angleDiff = 0;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            player.angle += angleDiff * 0.1;
        }

        const nextX = player.x + dx * speed;
        const nextY = player.y + dy * speed;

        if (player.size >= 150) {
            for (let i = buildings.length - 1; i >= 0; i--) {
                const b = buildings[i];
                if (nextX + player.size/2 > b.x && nextX - player.size/2 < b.x + b.w &&
                    nextY + player.size/2 > b.y && nextY - player.size/2 < b.y + b.h) {
                    buildings.splice(i, 1);
                    totalEaten += 50;
                    updateRebirthUI();
                    saveGame();
                }
            }
        }

        if (!checkCollision(nextX, player.y, player.size)) {
            player.x = nextX;
        } else {
            // Odbijanie od ścian/budynków
            player.x -= dx * speed * 2.0; // Stronger bounce
            if (player.hp < player.maxHp) spawnBush(player.x, player.y);
        }

        if (!checkCollision(player.x, nextY, player.size)) {
            player.y = nextY;
        } else {
            // Odbijanie od ścian/budynków
            player.y -= dy * speed * 2.0; // Stronger bounce
            if (player.hp < player.maxHp) spawnBush(player.x, player.y);
        }
        
        // Safety check for NaN positions
        if (isNaN(player.x) || isNaN(player.y)) {
            player.x = 500;
            player.y = 500;
        }
    }

    const multiplier = getGrowthMultiplier();
    for (let i = entities.length - 1; i >= 0; i--) {
        const e = entities[i];
        const dist = Math.sqrt((player.x - e.x)**2 + (player.y - e.y)**2);
        if (dist < (player.size/2 + e.size/2)) {
            if (player.size >= e.size * 0.7) {
                player.size += (e.growth * multiplier) * 0.5;
                totalEaten += e.value;
                entities.splice(i, 1);
                const typeData = {
                    'white_ball': { name: 'white_ball', size: 15, color: 'white', growth: 2, value: 1 },
                    'black_ball': { name: 'black_ball', size: 25, color: '#111', growth: 5, value: 3 },
                    'car': { name: 'car', size: 60, color: '#c0392b', growth: 15, value: 10 }
                }[e.type];
                setTimeout(() => spawnEntity(typeData), 3000);
                saveGame();
            }
        }
    }

    updateBots();

    // Emit update to server
    if (typeof socket !== 'undefined' && socket.emit) {
        socket.emit('updatePlayer', {
            x: player.x,
            y: player.y,
            size: player.size,
            angle: player.angle,
            hp: player.hp
        });
    }
}

function drawBeetle(x, y, size, angle, color, hp, maxHp) {
    ctx.save();
    ctx.translate(x, y);
    
    // HP Bar
    const barWidth = size * 1.5;
    ctx.fillStyle = 'rgba(255,0,0,0.3)';
    ctx.fillRect(-barWidth/2, -size * 0.9, barWidth, 6);
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(-barWidth/2, -size * 0.9, barWidth * (hp / maxHp), 6);
    
    ctx.rotate(angle);

    // Legs with better style
    ctx.strokeStyle = '#000';
    ctx.lineWidth = size * 0.08;
    ctx.lineCap = 'round';
    for(let i = -1; i <= 1; i++) {
        if (i === 0) continue;
        const offset = Math.sin(Date.now() * 0.01) * 0.1;
        // Left legs
        ctx.beginPath();
        ctx.moveTo(0, i * size * 0.2);
        ctx.lineTo(-size * 0.7, i * size * (0.4 + offset));
        ctx.stroke();
        // Right legs
        ctx.beginPath();
        ctx.moveTo(0, i * size * 0.2);
        ctx.lineTo(size * 0.7, i * size * (0.4 + offset));
        ctx.stroke();
    }

    // Body segments
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.5);
    grad.addColorStop(0, color);
    grad.addColorStop(1, '#000');

    // Main Shell
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.5, size * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Head
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(size * 0.3, 0, size * 0.25, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(size * 0.45, -size * 0.1, size * 0.06, 0, Math.PI * 2);
    ctx.arc(size * 0.45, size * 0.1, size * 0.06, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(size * 0.48, -size * 0.1, size * 0.03, 0, Math.PI * 2);
    ctx.arc(size * 0.48, size * 0.1, size * 0.03, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawSpider(x, y, size, angle, color, hp, maxHp) {
    ctx.save();
    ctx.translate(x, y);
    
    // HP Bar
    const barWidth = size * 1.5;
    ctx.fillStyle = 'rgba(255,0,0,0.3)';
    ctx.fillRect(-barWidth/2, -size * 0.9, barWidth, 6);
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(-barWidth/2, -size * 0.9, barWidth * (hp / maxHp), 6);

    ctx.rotate(angle);

    // Spider Legs (8)
    ctx.strokeStyle = '#111';
    ctx.lineWidth = size * 0.06;
    ctx.lineCap = 'round';
    for(let i=0; i<4; i++) {
        const sideAngle = (i-1.5) * 0.6 + Math.sin(Date.now() * 0.01 + i) * 0.1;
        // Left
        ctx.beginPath(); ctx.moveTo(0, 0); 
        ctx.quadraticCurveTo(Math.cos(Math.PI/2 + sideAngle) * size, Math.sin(Math.PI/2 + sideAngle) * size, Math.cos(Math.PI/2 + sideAngle) * size * 1.2, Math.sin(Math.PI/2 + sideAngle) * size * 1.2); 
        ctx.stroke();
        // Right
        ctx.beginPath(); ctx.moveTo(0, 0); 
        ctx.quadraticCurveTo(Math.cos(-Math.PI/2 - sideAngle) * size, Math.sin(-Math.PI/2 - sideAngle) * size, Math.cos(-Math.PI/2 - sideAngle) * size * 1.2, Math.sin(-Math.PI/2 - sideAngle) * size * 1.2); 
        ctx.stroke();
    }

    // Abdomen
    const grad = ctx.createRadialGradient(-size * 0.3, 0, 0, -size * 0.3, 0, size * 0.4);
    grad.addColorStop(0, color);
    grad.addColorStop(1, '#000');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(-size * 0.3, 0, size * 0.4, 0, Math.PI * 2); ctx.fill();

    // Cephalothorax (Head/Chest)
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(size * 0.1, 0, size * 0.25, 0, Math.PI * 2); ctx.fill();

    // Many Eyes
    ctx.fillStyle = 'red';
    for(let i=-2; i<=2; i++) {
        if(i===0) continue;
        ctx.beginPath(); ctx.arc(size * 0.25, i * size * 0.05, size * 0.04, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
}

function drawAnt(x, y, size, angle, color, hp, maxHp) {
    ctx.save();
    ctx.translate(x, y);
    
    // HP Bar
    const barWidth = size * 1.5;
    ctx.fillStyle = 'rgba(255,0,0,0.3)';
    ctx.fillRect(-barWidth/2, -size * 0.9, barWidth, 6);
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(-barWidth/2, -size * 0.9, barWidth * (hp / maxHp), 6);

    ctx.rotate(angle);

    // Ant Segments
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
    
    // Legs
    ctx.lineWidth = size * 0.05;
    for(let i=-1; i<=1; i++) {
        const legOffset = Math.sin(Date.now() * 0.01 + i) * 0.1;
        ctx.beginPath(); ctx.moveTo(0, i * size * 0.1); ctx.lineTo(-size * 0.3, i * size * (0.5 + legOffset)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * size * 0.1); ctx.lineTo(size * 0.3, i * size * (0.5 + legOffset)); ctx.stroke();
    }

    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.4);
    grad.addColorStop(0, color);
    grad.addColorStop(1, '#000');
    ctx.fillStyle = grad;

    // Abdomen (Tail)
    ctx.beginPath(); ctx.ellipse(-size * 0.4, 0, size * 0.3, size * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    // Thorax (Middle)
    ctx.beginPath(); ctx.ellipse(0, 0, size * 0.2, size * 0.15, 0, 0, Math.PI * 2); ctx.fill();
    // Head
    ctx.beginPath(); ctx.arc(size * 0.3, 0, size * 0.2, 0, Math.PI * 2); ctx.fill();

    // Antennae
    ctx.lineWidth = size * 0.03;
    ctx.beginPath(); ctx.moveTo(size * 0.4, -size * 0.05); ctx.quadraticCurveTo(size * 0.6, -size * 0.2, size * 0.7, -size * 0.1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(size * 0.4, size * 0.05); ctx.quadraticCurveTo(size * 0.6, size * 0.2, size * 0.7, size * 0.1); ctx.stroke();

    ctx.restore();
}

function drawBee(x, y, size, angle, color, hp, maxHp) {
    ctx.save();
    ctx.translate(x, y);
    
    // HP Bar
    const barWidth = size * 1.5;
    ctx.fillStyle = 'rgba(255,0,0,0.3)';
    ctx.fillRect(-barWidth/2, -size * 0.9, barWidth, 6);
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(-barWidth/2, -size * 0.9, barWidth * (hp / maxHp), 6);

    ctx.rotate(angle);

    // Bee Wings (Moving)
    ctx.fillStyle = 'rgba(200, 230, 255, 0.6)';
    const wingAngle = Math.sin(Date.now() * 0.05) * 0.4;
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.2, size * 0.4, size * 0.2, -Math.PI/4 + wingAngle, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, size * 0.2, size * 0.4, size * 0.2, Math.PI/4 - wingAngle, 0, Math.PI * 2);
    ctx.fill();

    // Body segments (Yellow/Black)
    const bodyGrad = ctx.createLinearGradient(-size * 0.5, 0, size * 0.5, 0);
    bodyGrad.addColorStop(0, '#000');
    bodyGrad.addColorStop(0.2, '#f1c40f');
    bodyGrad.addColorStop(0.4, '#000');
    bodyGrad.addColorStop(0.6, '#f1c40f');
    bodyGrad.addColorStop(0.8, '#000');
    bodyGrad.addColorStop(1, '#f1c40f');

    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.5, size * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(size * 0.3, -size * 0.15, size * 0.08, 0, Math.PI * 2);
    ctx.arc(size * 0.3, size * 0.15, size * 0.08, 0, Math.PI * 2);
    ctx.fill();

    // Stinger
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(-size * 0.5, 0);
    ctx.lineTo(-size * 0.7, 0);
    ctx.lineTo(-size * 0.5, size * 0.05);
    ctx.fill();

    ctx.restore();
}

function drawEntity(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.type === 'white_ball' || e.type === 'black_ball') {
        ctx.fillStyle = e.color;
        ctx.beginPath(); ctx.arc(0, 0, e.size/2, 0, Math.PI*2); ctx.fill();
        if (e.type === 'black_ball') {
            ctx.strokeStyle = '#333'; ctx.stroke();
        }
    } else if (e.type === 'car') {
        ctx.fillStyle = e.color;
        ctx.fillRect(-e.size/2, -e.size/4, e.size, e.size/2);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(-e.size/4, -e.size/6, e.size/2, e.size/3);
        ctx.fillStyle = 'lightblue';
        ctx.fillRect(0, -e.size/8, e.size/4, e.size/4);
    }
    ctx.restore();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const baseZoom = 1.0;
    const zoom = Math.max(0.3, baseZoom / (1 + (player.size - 45) * 0.003));
    ctx.fillStyle = '#1e1e1e'; // Brighter background
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    let camX = player.x;
    let camY = player.y;

    // Apply Screen Shake
    if (screenShake > 0) {
        camX += (Math.random() - 0.5) * screenShake;
        camY += (Math.random() - 0.5) * screenShake;
    }

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    // Draw Grid
    ctx.strokeStyle = '#333'; // Brighter grid
    ctx.lineWidth = 2;
    for(let i = 0; i <= WORLD_SIZE; i += 200) { // Denser grid
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, WORLD_SIZE); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(WORLD_SIZE, i); ctx.stroke();
    }
    
    // World Border
    ctx.strokeStyle = '#2ecc71';
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, WORLD_SIZE, WORLD_SIZE);

    // Draw Decorations (Bushes)
    decorations.forEach(d => {
        if (d.type === 'bush') {
            ctx.fillStyle = '#1b4d3e';
            ctx.beginPath(); ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#2ecc71';
            ctx.beginPath(); ctx.arc(d.x - 5, d.y - 5, d.size * 0.6, 0, Math.PI * 2); ctx.fill();
        }
    });

    entities.forEach(drawEntity);

    // Draw Particles
    particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    buildings.forEach(b => {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(b.x + 15, b.y + 15, b.w, b.h);
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 2;
        ctx.strokeRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
        if (b.roofStyle === 0) {
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(b.x + b.w/4, b.y + b.h/4, b.w/2, b.h/2);
        } else if (b.roofStyle === 1) {
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.beginPath(); ctx.arc(b.x + b.w/2, b.y + b.h/2, b.w/3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,100,0.1)';
        for(let wx = b.x + 30; wx < b.x + b.w - 30; wx += 60) {
            for(let wy = b.y + 30; wy < b.y + b.h - 30; wy += 60) {
                ctx.fillRect(wx, wy, 20, 20);
            }
        }
    });

    bots.forEach(bot => {
        if (bot.skin === 'bee') drawBee(bot.x, bot.y, bot.size, bot.angle, bot.color, bot.hp, bot.maxHp);
        else if (bot.skin === 'ant') drawAnt(bot.x, bot.y, bot.size, bot.angle, bot.color, bot.hp, bot.maxHp);
        else if (bot.skin === 'spider') drawSpider(bot.x, bot.y, bot.size, bot.angle, bot.color, bot.hp, bot.maxHp);
        else drawBeetle(bot.x, bot.y, bot.size, bot.angle, bot.color, bot.hp, bot.maxHp);
        
        if (bot.isPlayer) {
            ctx.save();
            ctx.fillStyle = 'white';
            ctx.font = `bold ${Math.max(12, bot.size * 0.4)}px Arial`;
            ctx.textAlign = 'center';
            ctx.fillText(bot.name, bot.x, bot.y - bot.size - 10);
            ctx.restore();
        }
    });

    Object.values(remotePlayers).forEach(p => {
        if (p.skin === 'bee') drawBee(p.x, p.y, p.size, p.angle, p.color || '#3498db', p.hp, p.maxHp);
        else if (p.skin === 'ant') drawAnt(p.x, p.y, p.size, p.angle, p.color || '#3498db', p.hp, p.maxHp);
        else if (p.skin === 'spider') drawSpider(p.x, p.y, p.size, p.angle, p.color || '#3498db', p.hp, p.maxHp);
        else drawBeetle(p.x, p.y, p.size, p.angle, p.color || '#3498db', p.hp, p.maxHp);

        ctx.save();
        ctx.fillStyle = 'white';
        ctx.font = `bold ${Math.max(12, p.size * 0.4)}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(p.name, p.x, p.y - p.size - 10);
        ctx.restore();
    });

    // Draw Attack Slash Effect
    if (player.lungeTime > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.size * 1.8, player.angle - 0.8, player.angle + 0.8);
        ctx.strokeStyle = `rgba(255, 50, 50, ${player.lungeTime / 15})`;
        ctx.lineWidth = 15;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
    }

    if (currentSkin === 'bee') drawBee(player.x, player.y, player.size, player.angle, '#2c3e50', player.hp, player.maxHp);
    else if (currentSkin === 'ant') drawAnt(player.x, player.y, player.size, player.angle, '#2c3e50', player.hp, player.maxHp);
    else if (currentSkin === 'spider') drawSpider(player.x, player.y, player.size, player.angle, '#2c3e50', player.hp, player.maxHp);
    else drawBeetle(player.x, player.y, player.size, player.angle, '#2c3e50', player.hp, player.maxHp);
    
    if (player.isCharging) {
        const chargePerc = Math.min(1, player.chargeTime / 5000);
        ctx.fillStyle = 'rgba(0, 255, 255, 0.2)';
        ctx.beginPath(); ctx.arc(player.x, player.y, player.size * 2, 0, Math.PI * 2 * chargePerc);
        ctx.lineWidth = 8; ctx.strokeStyle = 'cyan'; ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = 'white';
    ctx.font = 'bold 20px Arial';
    ctx.fillText(`Rozmiar: ${Math.floor(player.size)}`, 20, 30);
    ctx.fillText(`Punkty: ${totalEaten}`, 20, 60);
    ctx.fillText(`Rebirthy: ${rebirths}/2`, 20, 90);
    ctx.fillText(`Atak: LPM (szybki) | PPM (ładuj)`, 20, canvas.height - 20);
    
    if (player.dashCooldown > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(20, canvas.height - 60, 100, 10);
        ctx.fillStyle = 'cyan';
        ctx.fillRect(20, canvas.height - 60, 100 * (1 - player.dashCooldown / 120), 10);
        ctx.fillText("DASH", 130, canvas.height - 50);
    }
}

function gameLoop(timestamp) {
    if (gameState !== 'PLAYING') {
        lastTime = 0;
        return;
    }
    if (!lastTime) lastTime = timestamp;
    let dt = (timestamp - lastTime) / 1000;
    if (dt > 0.1) dt = 0.1; // Cap delta time to prevent physics glitches after freezes/alerts
    lastTime = timestamp;

    try {
        update(dt);
        draw();
    } catch (e) {
        console.error("Critical error in game loop:", e);
    }
    requestAnimationFrame(gameLoop);
}

loadGame();
updateRebirthUI();
updateSkinUI();
