const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" }
});
const path = require('path');

app.use(express.static(__dirname));

let players = {};
let lobbyPlayers = [];
let lobbyStartTime = null;
const LOBBY_DURATION = 10000;

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('joinLobby', () => {
        if (!lobbyPlayers.includes(socket.id)) {
            lobbyPlayers.push(socket.id);
            if (lobbyPlayers.length === 1) {
                lobbyStartTime = Date.now();
            }
        }
        
        const timeLeft = Math.max(0, (lobbyStartTime + LOBBY_DURATION) - Date.now());
        io.emit('lobbyUpdate', {
            playersCount: lobbyPlayers.length,
            timeLeft: Math.ceil(timeLeft / 1000)
        });

        if (timeLeft <= 0) {
            startGame();
        }
    });

    socket.on('playerInit', (data) => {
        players[socket.id] = {
            id: socket.id,
            x: data.x,
            y: data.y,
            size: data.size,
            angle: data.angle,
            hp: data.hp,
            maxHp: data.maxHp,
            skin: data.skin,
            name: data.name
        };
        socket.broadcast.emit('playerJoined', players[socket.id]);
    });

    socket.on('updatePlayer', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].size = data.size;
            players[socket.id].angle = data.angle;
            players[socket.id].hp = data.hp;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    socket.on('attack', (data) => {
        socket.broadcast.emit('playerAttacked', {
            id: socket.id,
            type: data.type,
            damage: data.damage
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete players[socket.id];
        lobbyPlayers = lobbyPlayers.filter(id => id !== socket.id);
        io.emit('playerDisconnected', socket.id);
        io.emit('lobbyUpdate', {
            playersCount: lobbyPlayers.length,
            timeLeft: lobbyStartTime ? Math.ceil(Math.max(0, (lobbyStartTime + LOBBY_DURATION) - Date.now()) / 1000) : 10
        });
    });
});

function startGame() {
    io.emit('gameStart', {
        lobbyPlayers: lobbyPlayers
    });
    lobbyPlayers = [];
    lobbyStartTime = null;
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
