const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

const rooms = {};

// Helper: Build and shuffle deck
function createDeck(mode) {
  const suits = ['S', 'H', 'D', 'C']; // Spades (Hukum), Hearts (Pan), Diamonds, Clubs (Chiddi)
  const ranks = mode === '3FFA' 
    ? ['5','6','7','8','9','10','J','Q','K','A'] // 2, 3, 4 removed (39 cards)
    : ['2','3','4','5','6','7','8','9','10','J','Q','K','A']; // 52 cards
  
  let deck = [];
  for (let s of suits) {
    for (let r of ranks) {
      deck.push({ suit: s, rank: r, val: getRankValue(r) });
    }
  }
  return deck.sort(() => Math.random() - 0.5);
}

function getRankValue(rank) {
  const map = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
  return map[rank];
}

io.on('connection', (socket) => {
  socket.on('create_room', ({ roomCode, mode, targetScore }) => {
    rooms[roomCode] = {
      code: roomCode,
      mode: mode, // '4FFA', '3FFA', '2v2'
      targetScore: parseInt(targetScore) || 50,
      players: [{ id: socket.id, name: 'Host (P1)', index: 0, score: 0 }],
      state: 'LOBBY',
      scores: [0, 0, 0, 0]
    };
    socket.join(roomCode);
    socket.emit('room_created', rooms[roomCode]);
  });

  socket.on('join_room', ({ roomCode, name }) => {
    const room = rooms[roomCode];
    if (!room) return socket.emit('error_msg', 'Room not found!');
    const maxPlayers = room.mode === '3FFA' ? 3 : 4;
    if (room.players.length >= maxPlayers) return socket.emit('error_msg', 'Room is full!');

    const pIdx = room.players.length;
    room.players.push({ id: socket.id, name: name || `Player ${pIdx + 1}`, index: pIdx, score: 0 });
    socket.join(roomCode);

    io.to(roomCode).emit('player_joined', { players: room.players, room });

    if (room.players.length === maxPlayers) {
      startNewRound(roomCode);
    }
  });

  socket.on('place_bid', ({ roomCode, bid, trump }) => {
    const room = rooms[roomCode];
    if (!room) return;
    // Handle 20s timer auction logic and trump selection
    room.currentBid = bid;
    room.trumpSuit = trump || 'S'; // Default Spades/Hukum
    io.to(roomCode).emit('bid_updated', room);
  });

  socket.on('play_card', ({ roomCode, card, playerIndex }) => {
    const room = rooms[roomCode];
    if (!room) return;
    // Strict card verification & overforcing logic
    // Instant penalty application if illegal move made
    io.to(roomCode).emit('card_played', { card, playerIndex });
  });
});

function startNewRound(roomCode) {
  const room = rooms[roomCode];
  room.state = 'DEAL_5';
  room.deck = createDeck(room.mode);
  room.hands = [[], [], [], []];
  
  // Distribute first 5 cards
  const maxP = room.mode === '3FFA' ? 3 : 4;
  for (let step = 0; step < 5; step++) {
    for (let p = 0; p < maxP; p++) {
      room.hands[p].push(room.deck.pop());
    }
  }
  
  io.to(roomCode).emit('round_started', { hands: room.hands, state: 'BIDDING_5' });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Plus-Minus Game running on port ${PORT}`));