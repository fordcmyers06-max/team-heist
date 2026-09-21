const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { generateTaskBoard } = require("./activities");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

// ---- In-memory game state -------------------------------------------------
// games: Map<code, Game>
// Game = {
//   code, hostSocketId, timerMinutes, status: 'lobby'|'active'|'ended',
//   players: Map<socketId, { id, name, teamIndex, currentTaskId }>,
//   teams: [{ name, memberIds: [socketId], score, tasks: [Task] }],
//   endTime: number|null,
// }
const games = new Map();

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
function generateCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
  } while (games.has(code));
  return code;
}

function publicPlayers(game) {
  return Array.from(game.players.values()).map((p) => ({ id: p.id, name: p.name }));
}

function publicTeams(game) {
  return game.teams.map((team, i) => ({
    index: i,
    name: team.name,
    score: team.score,
    members: team.memberIds.map((id) => ({
      id,
      name: game.players.get(id)?.name || "(left)",
    })),
    tasks: team.tasks,
  }));
}

function broadcastLobby(code) {
  const game = games.get(code);
  if (!game) return;
  io.to(code).emit("lobby:update", {
    code,
    timerMinutes: game.timerMinutes,
    players: publicPlayers(game),
  });
}

function broadcastTeams(code) {
  const game = games.get(code);
  if (!game) return;
  io.to(code).emit("teams:update", { teams: publicTeams(game) });
}

function assignTeams(game) {
  const playerIds = shuffle(Array.from(game.players.keys()));
  const TEAM_SIZE = 5;
  const numTeams = Math.max(1, Math.ceil(playerIds.length / TEAM_SIZE));

  const teams = Array.from({ length: numTeams }, (_, i) => ({
    name: `Team ${i + 1}`,
    memberIds: [],
    score: 0,
    tasks: generateTaskBoard(12),
  }));

  // Round-robin so team sizes differ by at most 1.
  playerIds.forEach((id, i) => {
    const teamIndex = i % numTeams;
    teams[teamIndex].memberIds.push(id);
    const player = game.players.get(id);
    player.teamIndex = teamIndex;
    player.currentTaskId = null;
  });

  game.teams = teams;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function endGame(code) {
  const game = games.get(code);
  if (!game || game.status !== "active") return;
  game.status = "ended";
  io.to(code).emit("game:ended", { teams: publicTeams(game) });
  if (game.timer) clearTimeout(game.timer);
}

io.on("connection", (socket) => {
  // --- Host creates a lobby ---
  socket.on("host:createLobby", ({ timerMinutes }, cb) => {
    const minutes = Math.min(180, Math.max(1, Number(timerMinutes) || 15));
    const code = generateCode();
    const game = {
      code,
      hostSocketId: socket.id,
      timerMinutes: minutes,
      status: "lobby",
      players: new Map(),
      teams: [],
      endTime: null,
      timer: null,
    };
    games.set(code, game);
    socket.join(code);
    socket.data.role = "host";
    socket.data.code = code;
    cb && cb({ ok: true, code, timerMinutes: minutes });
  });

  // --- Player joins a lobby ---
  socket.on("player:joinLobby", ({ code, name }, cb) => {
    code = String(code || "").toUpperCase().trim();
    const game = games.get(code);
    if (!game) return cb && cb({ ok: false, error: "Lobby not found." });
    if (game.status !== "lobby") return cb && cb({ ok: false, error: "Game already started." });

    const cleanName = String(name || "").trim().slice(0, 20) || "Player";
    const taken = new Set(Array.from(game.players.values()).map((p) => p.name.toLowerCase()));
    let finalName = cleanName;
    let n = 2;
    while (taken.has(finalName.toLowerCase())) {
      finalName = `${cleanName} (${n++})`;
    }

    game.players.set(socket.id, { id: socket.id, name: finalName, teamIndex: null, currentTaskId: null });
    socket.join(code);
    socket.data.role = "player";
    socket.data.code = code;

    cb && cb({ ok: true, code, name: finalName, timerMinutes: game.timerMinutes });
    broadcastLobby(code);
  });

  // --- Host starts the game ---
  socket.on("host:startGame", (_, cb) => {
    const code = socket.data.code;
    const game = games.get(code);
    if (!game || socket.id !== game.hostSocketId) return cb && cb({ ok: false, error: "Not authorized." });
    if (game.players.size < 2) return cb && cb({ ok: false, error: "Need at least 2 players." });
    if (game.status !== "lobby") return cb && cb({ ok: false, error: "Game already started." });

    assignTeams(game);
    game.status = "active";
    game.endTime = Date.now() + game.timerMinutes * 60 * 1000;

    io.to(code).emit("game:started", {
      teams: publicTeams(game),
      endTime: game.endTime,
      yourAssignments: Array.from(game.players.values()).map((p) => ({ id: p.id, teamIndex: p.teamIndex })),
    });

    game.timer = setTimeout(() => endGame(code), game.timerMinutes * 60 * 1000);
    cb && cb({ ok: true });
  });

  // --- Player claims a task ---
  socket.on("player:claimTask", ({ taskId }, cb) => {
    const code = socket.data.code;
    const game = games.get(code);
    if (!game || game.status !== "active") return cb && cb({ ok: false, error: "Game not active." });
    const player = game.players.get(socket.id);
    if (!player) return cb && cb({ ok: false, error: "Not in this game." });
    if (player.currentTaskId) return cb && cb({ ok: false, error: "Finish your current task first." });

    const team = game.teams[player.teamIndex];
    const task = team.tasks.find((t) => t.id === taskId);
    if (!task) return cb && cb({ ok: false, error: "Task not found." });
    if (task.status !== "available") return cb && cb({ ok: false, error: "Someone already claimed that task." });

    task.status = "in-progress";
    task.claimedBy = { playerId: player.id, name: player.name };
    player.currentTaskId = task.id;

    broadcastTeams(code);
    cb && cb({ ok: true });
  });

  // --- Player completes their claimed task ---
  socket.on("player:completeTask", ({ taskId }, cb) => {
    const code = socket.data.code;
    const game = games.get(code);
    if (!game || game.status !== "active") return cb && cb({ ok: false, error: "Game not active." });
    const player = game.players.get(socket.id);
    if (!player) return cb && cb({ ok: false, error: "Not in this game." });

    const team = game.teams[player.teamIndex];
    const task = team.tasks.find((t) => t.id === taskId);
    if (!task) return cb && cb({ ok: false, error: "Task not found." });
    if (task.claimedBy?.playerId !== player.id) return cb && cb({ ok: false, error: "This isn't your task." });

    task.status = "completed";
    team.score += task.points;
    player.currentTaskId = null;

    broadcastTeams(code);
    cb && cb({ ok: true });
  });

  // --- Team chat ---
  socket.on("chat:send", ({ message }) => {
    const code = socket.data.code;
    const game = games.get(code);
    if (!game) return;
    const player = game.players.get(socket.id);
    if (!player || player.teamIndex === null) return;
    const text = String(message || "").slice(0, 300).trim();
    if (!text) return;
    const room = `${code}-team-${player.teamIndex}`;
    io.to(room).emit("chat:message", { from: player.name, text, at: Date.now() });
  });

  // Join/leave team-specific chat room when teams are assigned.
  socket.on("player:joinTeamRoom", () => {
    const code = socket.data.code;
    const game = games.get(code);
    if (!game) return;
    const player = game.players.get(socket.id);
    if (!player || player.teamIndex === null) return;
    socket.join(`${code}-team-${player.teamIndex}`);
  });

  // --- Host ends game early ---
  socket.on("host:endGame", () => {
    const code = socket.data.code;
    const game = games.get(code);
    if (!game || socket.id !== game.hostSocketId) return;
    endGame(code);
  });

  socket.on("disconnect", () => {
    const code = socket.data.code;
    const game = games.get(code);
    if (!game) return;

    if (socket.data.role === "host") {
      io.to(code).emit("lobby:closed", { reason: "Host disconnected." });
      if (game.timer) clearTimeout(game.timer);
      games.delete(code);
      return;
    }

    if (game.players.has(socket.id)) {
      const player = game.players.get(socket.id);
      game.players.delete(socket.id);
      if (player.teamIndex !== null && game.teams[player.teamIndex]) {
        game.teams[player.teamIndex].memberIds = game.teams[player.teamIndex].memberIds.filter((id) => id !== socket.id);
        // Free up any task they had claimed but not finished.
        const team = game.teams[player.teamIndex];
        team.tasks.forEach((t) => {
          if (t.claimedBy?.playerId === socket.id && t.status === "in-progress") {
            t.status = "available";
            t.claimedBy = null;
          }
        });
        broadcastTeams(code);
      }
      if (game.status === "lobby") broadcastLobby(code);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Team Heist running at http://localhost:${PORT}`));
