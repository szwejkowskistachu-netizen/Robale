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

// Lobby variables
let lobbyTimer = 10;
let lobbyInterval = null;
let lobbyPlayersCount = 1;

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
    dashCooldown: 0
};

// World data
const buildings = [];
const entities = []; 
const bots = [];
const WORLD_SIZE = 4000;

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
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
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
    if (currentSkin === 'ant') return 2.0;
    if (currentSkin === 'spider') return 1.5;
    return 1.0;
}

function getSpeedMultiplier() {
    if (currentSkin === 'ant') return 1.25;
    return 1.0;
}

// Event Listeners
if (playBtn) {
    playBtn.addEventListener('click', () => {
        startLobby();
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
        // Fallback for no socket
        setTimeout(() => startGame(), 1000);
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
    player.size = 45;
    player.hp = player.maxHp;
    
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

    const skins = ['beetle', 'spider', 'ant'];
    const names = ['Killer', 'ProGamer', 'Robal123', 'Slayer', 'Speedy', 'Shadow', 'Hunter', 'Rex', 'Max', 'Ace'];
    bots.push({
        x, y,
        size: 30 + (isPlayer ? Math.random() * 20 : Math.random() * 100),
        hp: 100,
        maxHp: 100,
        angle: Math.random() * Math.PI * 2,
        speed: 2 + Math.random() * 2,
        color: isPlayer ? '#3498db' : `hsl(${Math.random() * 360}, 50%, 40%)`,
        lastAttack: 0,
        dashCooldown: 0,
        dashTime: 0,
        skin: skins[Math.floor(Math.random() * skins.length)],
        isPlayer: isPlayer,
        name: isPlayer ? names[Math.floor(Math.random() * names.length)] + Math.floor(Math.random()*99) : null
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

    const attackRange = player.size * 1.5;
    const skinDmg = getDamageMultiplier();
    
    bots.forEach(bot => {
        const dist = Math.sqrt((player.x - bot.x)**2 + (player.y - bot.y)**2);
        if (dist < attackRange) {
            const angleToBot = Math.atan2(bot.y - player.y, bot.x - player.x);
            const angleDiff = Math.abs(player.angle - angleToBot);
            if (angleDiff < 1 || angleDiff > Math.PI * 2 - 1) {
                const sizeRatio = player.size / bot.size;
                const damage = 25 * skinDmg * Math.max(0.7, Math.min(1.5, sizeRatio));
                bot.hp -= damage;
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
    const baseDamage = Math.min(100, (player.chargeTime / 5000) * 100);
    const attackRange = player.size * 2;
    const skinDmg = getDamageMultiplier();
    
    bots.forEach(bot => {
        const dist = Math.sqrt((player.x - bot.x)**2 + (player.y - bot.y)**2);
        if (dist < attackRange) {
            const angleToBot = Math.atan2(bot.y - player.y, bot.x - player.x);
            const angleDiff = Math.abs(player.angle - angleToBot);
            if (angleDiff < 1.5 || angleDiff > Math.PI * 2 - 1.5) {
                const sizeRatio = player.size / bot.size;
                const damage = baseDamage * skinDmg * Math.max(0.7, Math.min(1.5, sizeRatio));
                bot.hp -= damage;
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
    bots.forEach((bot, idx) => {
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
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            bot.angle += angleDiff * 0.08;

            if (minDist > bot.size + closest.size) {
                let speed = bot.speed;
                if (bot.dashTime > 0) { speed *= 3; bot.dashTime--; }
                const nx = bot.x + Math.cos(bot.angle) * speed;
                const ny = bot.y + Math.sin(bot.angle) * speed;
                if (!checkCollision(nx, bot.y, bot.size)) bot.x = nx;
                if (!checkCollision(bot.x, ny, bot.size)) bot.y = ny;
            } else {
                const now = Date.now();
                if (now - bot.lastAttack > 800) {
                    const sizeRatio = bot.size / closest.size;
                    const botSkinDmg = bot.skin === 'ant' ? 2.0 : (bot.skin === 'spider' ? 1.5 : 1.0);
                    closest.hp -= 15 * botSkinDmg * Math.max(0.7, Math.min(1.5, sizeRatio));
                    bot.lastAttack = now;
                }
            }
        } else {
            // Look for food if no one nearby
            let closestFood = null;
            let minFoodDist = Infinity;
            entities.forEach(e => {
                const d = Math.sqrt((bot.x - e.x)**2 + (bot.y - e.y)**2);
                if (d < minFoodDist) {
                    minFoodDist = d;
                    closestFood = e;
                }
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

                // Eat food
                if (minFoodDist < bot.size/2 + closestFood.size/2) {
                    bot.size += closestFood.growth * 0.5;
                    entities.splice(entities.indexOf(closestFood), 1);
                    setTimeout(() => {
                        const typeData = {
                            'white_ball': { name: 'white_ball', size: 15, color: 'white', growth: 2, value: 1 },
                            'black_ball': { name: 'black_ball', size: 25, color: '#111', growth: 5, value: 3 },
                            'car': { name: 'car', size: 60, color: '#c0392b', growth: 15, value: 10 }
                        }[closestFood.type];
                        spawnEntity(typeData);
                    }, 3000);
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
            bots.splice(idx, 1);
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
    });
}

function update() {
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

    if (player.isCharging) {
        player.chargeTime += 16.67; // approx 60fps
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

    if (dx !== 0 || dy !== 0 || player.dashTime > 0) {
        let speed = player.baseSpeed * (1 + rebirths * 0.1) * getSpeedMultiplier();
        
        if (player.dashTime > 0) {
            speed *= 4; 
            player.dashTime--;
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
            player.x -= dx * speed * 0.4;
        }

        if (!checkCollision(player.x, nextY, player.size)) {
            player.y = nextY;
        } else {
            // Odbijanie od ścian/budynków
            player.y -= dy * speed * 0.4;
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
    const barWidth = size * 1.5;
    ctx.fillStyle = 'red';
    ctx.fillRect(-barWidth/2, -size * 0.8, barWidth, 5);
    ctx.fillStyle = '#0f0';
    ctx.fillRect(-barWidth/2, -size * 0.8, barWidth * (hp / maxHp), 5);
    ctx.rotate(angle);

    ctx.strokeStyle = '#111';
    ctx.lineWidth = size * 0.1;
    for(let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * size * 0.3);
        ctx.lineTo(-size * 0.6, i * size * 0.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * size * 0.3);
        ctx.lineTo(size * 0.6, i * size * 0.5);
        ctx.stroke();
    }
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.ellipse(0, 0, size * 0.5, size * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(0, 0, size * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-size * 0.4, 0); ctx.lineTo(size * 0.4, 0); ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(size * 0.35, 0, size * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'red';
    ctx.beginPath(); ctx.arc(size * 0.45, -size * 0.1, size * 0.05, 0, Math.PI * 2);
    ctx.arc(size * 0.45, size * 0.1, size * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

function drawSpider(x, y, size, angle, color, hp, maxHp) {
    ctx.save();
    ctx.translate(x, y);
    const barWidth = size * 1.5;
    ctx.fillStyle = 'red';
    ctx.fillRect(-barWidth/2, -size * 0.8, barWidth, 5);
    ctx.fillStyle = '#0f0';
    ctx.fillRect(-barWidth/2, -size * 0.8, barWidth * (hp / maxHp), 5);
    ctx.rotate(angle);

    ctx.strokeStyle = '#000';
    ctx.lineWidth = size * 0.05;
    for(let i=0; i<4; i++) {
        const sideAngle = (i-1.5) * 0.5;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(Math.PI/2 + sideAngle) * size * 0.8, Math.sin(Math.PI/2 + sideAngle) * size * 0.8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(-Math.PI/2 - sideAngle) * size * 0.8, Math.sin(-Math.PI/2 - sideAngle) * size * 0.8); ctx.stroke();
    }
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(-size * 0.2, 0, size * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(size * 0.1, 0, size * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'white';
    for(let i=-1; i<=1; i+=2) {
        ctx.beginPath(); ctx.arc(size * 0.2, i * size * 0.05, size * 0.03, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
}

function drawAnt(x, y, size, angle, color, hp, maxHp) {
    ctx.save();
    ctx.translate(x, y);
    const barWidth = size * 1.5;
    ctx.fillStyle = 'red';
    ctx.fillRect(-barWidth/2, -size * 0.8, barWidth, 5);
    ctx.fillStyle = '#0f0';
    ctx.fillRect(-barWidth/2, -size * 0.8, barWidth * (hp / maxHp), 5);
    ctx.rotate(angle);

    // Ant Segments (3 parts)
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(-size * 0.4, 0, size * 0.25, 0, Math.PI * 2); ctx.fill(); // Abdomen
    ctx.beginPath(); ctx.arc(-size * 0.05, 0, size * 0.15, 0, Math.PI * 2); ctx.fill(); // Thorax
    ctx.beginPath(); ctx.arc(size * 0.2, 0, size * 0.18, 0, Math.PI * 2); ctx.fill(); // Head

    // 6 Legs
    ctx.strokeStyle = '#000';
    ctx.lineWidth = size * 0.04;
    for(let i=-1; i<=1; i++) {
        const lx = -size * 0.05;
        const ly = i * size * 0.15;
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx - size * 0.2, ly + i * size * 0.4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + size * 0.2, ly + i * size * 0.4); ctx.stroke();
    }

    // Antennae
    ctx.beginPath(); ctx.moveTo(size * 0.25, -size * 0.05); ctx.lineTo(size * 0.45, -size * 0.15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(size * 0.25, size * 0.05); ctx.lineTo(size * 0.45, size * 0.15); ctx.stroke();

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
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const camX = player.x;
    const camY = player.y;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    ctx.strokeStyle = '#222';
    ctx.lineWidth = 10;
    for(let i = 0; i <= WORLD_SIZE; i += 400) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, WORLD_SIZE); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(WORLD_SIZE, i); ctx.stroke();
    }
    
    buildings.forEach(b => {
        ctx.fillStyle = '#333';
        ctx.fillRect(b.x - 20, b.y - 20, b.w + 40, b.h + 40);
    });

    entities.forEach(drawEntity);

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
        if (bot.skin === 'ant') drawAnt(bot.x, bot.y, bot.size, bot.angle, bot.color, bot.hp, bot.maxHp);
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
        if (p.skin === 'ant') drawAnt(p.x, p.y, p.size, p.angle, p.color || '#3498db', p.hp, p.maxHp);
        else if (p.skin === 'spider') drawSpider(p.x, p.y, p.size, p.angle, p.color || '#3498db', p.hp, p.maxHp);
        else drawBeetle(p.x, p.y, p.size, p.angle, p.color || '#3498db', p.hp, p.maxHp);

        ctx.save();
        ctx.fillStyle = 'white';
        ctx.font = `bold ${Math.max(12, p.size * 0.4)}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(p.name, p.x, p.y - p.size - 10);
        ctx.restore();
    });

    if (currentSkin === 'ant') drawAnt(player.x, player.y, player.size, player.angle, '#2c3e50', player.hp, player.maxHp);
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

function gameLoop() {
    if (gameState !== 'PLAYING') return;
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

loadGame();
updateRebirthUI();
updateSkinUI();
