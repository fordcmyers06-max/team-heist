const socket = io();

const state = {
  role: null, // 'host' | 'player'
  code: null,
  name: null,
  myId: null,
  myTeamIndex: null,
  timerMinutes: null,
  endTime: null,
};

// ---------- view switching ----------
function showView(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

document.getElementById("btn-go-host").onclick = () => showView("view-host-create");
document.getElementById("btn-go-join").onclick = () => showView("view-join");
document.querySelectorAll("[data-back]").forEach((b) => (b.onclick = () => showView("view-home")));
document.querySelectorAll("[data-home]").forEach((b) => (b.onclick = () => window.location.reload()));

// ---------- host: create lobby ----------
document.getElementById("btn-create-lobby").onclick = () => {
  const timerMinutes = document.getElementById("input-timer").value;
  socket.emit("host:createLobby", { timerMinutes }, (res) => {
    const err = document.getElementById("host-create-error");
    if (!res.ok) { err.textContent = res.error; return; }
    err.textContent = "";
    state.role = "host";
    state.code = res.code;
    state.timerMinutes = res.timerMinutes;
    enterLobby();
  });
};

// ---------- player: join lobby ----------
document.getElementById("btn-join-lobby").onclick = () => {
  const code = document.getElementById("input-code").value;
  const name = document.getElementById("input-name").value;
  socket.emit("player:joinLobby", { code, name }, (res) => {
    const err = document.getElementById("join-error");
    if (!res.ok) { err.textContent = res.error; return; }
    err.textContent = "";
    state.role = "player";
    state.code = res.code;
    state.name = res.name;
    state.timerMinutes = res.timerMinutes;
    enterLobby();
  });
};

function enterLobby() {
  document.getElementById("lobby-code").textContent = state.code;
  document.getElementById("lobby-timer").textContent = state.timerMinutes;
  document.getElementById("host-lobby-controls").style.display = state.role === "host" ? "flex" : "none";
  document.getElementById("player-lobby-note").style.display = state.role === "host" ? "none" : "block";
  document.getElementById("lobby-role-note").textContent =
    state.role === "host" ? "Share this code with your players." : `Joined as ${state.name}`;
  showView("view-lobby");
}

document.getElementById("btn-start-game").onclick = () => {
  socket.emit("host:startGame", {}, (res) => {
    if (!res.ok) document.getElementById("lobby-error").textContent = res.error;
  });
};

socket.on("lobby:update", ({ players, timerMinutes }) => {
  state.timerMinutes = timerMinutes;
  document.getElementById("lobby-count").textContent = players.length;
  const list = document.getElementById("lobby-players");
  list.innerHTML = "";
  players.forEach((p) => {
    const li = document.createElement("li");
    li.textContent = p.name;
    list.appendChild(li);
  });
});

socket.on("lobby:closed", ({ reason }) => {
  alert(reason || "Lobby closed.");
  window.location.reload();
});

// ---------- game start ----------
socket.on("game:started", ({ teams, endTime, yourAssignments }) => {
  state.endTime = endTime;
  socket.emit("player:joinTeamRoom");

  if (state.role === "host") {
    renderHostDashboard(teams);
    showView("view-host-dashboard");
    startTimerLoop("host-timer");
  } else {
    const mine = yourAssignments.find((a) => a.id === socket.id);
    state.myTeamIndex = mine ? mine.teamIndex : null;
    renderPlayerGame(teams);
    showView("view-player-game");
    startTimerLoop("player-timer");
  }
});

socket.on("teams:update", ({ teams }) => {
  if (state.role === "host") renderHostDashboard(teams);
  else renderPlayerGame(teams);
});

socket.on("game:ended", ({ teams }) => {
  stopTimerLoop();
  renderResults(teams);
  showView("view-results");
});

document.getElementById("btn-end-game").onclick = () => {
  if (confirm("End the game now for everyone?")) socket.emit("host:endGame");
};

// ---------- timer ----------
let timerInterval = null;
function startTimerLoop(elId) {
  stopTimerLoop();
  const el = document.getElementById(elId);
  const tick = () => {
    const msLeft = Math.max(0, state.endTime - Date.now());
    const totalSec = Math.floor(msLeft / 1000);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    el.textContent = `${mm}:${ss}`;
    el.classList.toggle("low", totalSec <= 30);
    if (msLeft <= 0) stopTimerLoop();
  };
  tick();
  timerInterval = setInterval(tick, 250);
}
function stopTimerLoop() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

// ---------- host dashboard rendering ----------
function renderHostDashboard(teams) {
  const grid = document.getElementById("host-teams-grid");
  grid.innerHTML = "";
  teams.forEach((team) => {
    const panel = document.createElement("div");
    panel.className = "team-panel";
    const membersStr = team.members.map((m) => m.name).join(", ");
    panel.innerHTML = `
      <h4>${team.name} <span class="score">${team.score} pts</span></h4>
      <div class="members">${membersStr || "no players"}</div>
      ${team.tasks.map(taskMiniHtml).join("")}
    `;
    grid.appendChild(panel);
  });
}

function taskMiniHtml(t) {
  const label = t.status === "completed" ? "done" : t.status === "in-progress" ? `→ ${t.claimedBy?.name || "?"}` : "open";
  return `<div class="mini-task ${t.status}"><span>${escapeHtml(t.text)} <em style="color:var(--muted)">(${label})</em></span><span class="pts">${t.points}</span></div>`;
}

// ---------- results ----------
function renderResults(teams) {
  const grid = document.getElementById("results-grid");
  const sorted = [...teams].sort((a, b) => b.score - a.score);
  grid.innerHTML = "";
  sorted.forEach((team, i) => {
    const panel = document.createElement("div");
    panel.className = "team-panel";
    panel.innerHTML = `<h4>${i === 0 ? "🏆 " : ""}${team.name} <span class="score">${team.score} pts</span></h4>
      <div class="members">${team.members.map((m) => m.name).join(", ")}</div>`;
    grid.appendChild(panel);
  });
}

// ---------- player game rendering ----------
let lastTeamsSnapshot = null;
function renderPlayerGame(teams) {
  lastTeamsSnapshot = teams;
  const myTeam = teams[state.myTeamIndex];
  if (!myTeam) return;

  document.getElementById("player-team-name").textContent = myTeam.name;
  document.getElementById("player-team-score").textContent = myTeam.score;

  const teammates = document.getElementById("player-teammates");
  teammates.innerHTML = "";
  myTeam.members.forEach((m) => {
    const li = document.createElement("li");
    li.textContent = m.id === socket.id ? `${m.name} (you)` : m.name;
    teammates.appendChild(li);
  });

  const myActiveTask = myTeam.tasks.find((t) => t.claimedBy?.playerId === socket.id && t.status === "in-progress");

  const list = document.getElementById("task-list");
  list.innerHTML = "";
  myTeam.tasks.forEach((t) => {
    const card = document.createElement("li");
    card.className = "task-card";
    const isMine = t.claimedBy?.playerId === socket.id;
    if (t.status !== "available") card.classList.add("taken");
    if (isMine) card.classList.add("mine");

    let statusTag = "";
    if (t.status === "in-progress") statusTag = isMine ? "You're doing this" : `${escapeHtml(t.claimedBy.name)} is doing this`;
    if (t.status === "completed") statusTag = "Completed";

    card.innerHTML = `
      <div class="text">${escapeHtml(t.text)}${statusTag ? `<span class="status-tag">${statusTag}</span>` : ""}</div>
      <div class="points">${t.points}</div>
    `;

    if (t.status === "available" && !myActiveTask) {
      const btn = document.createElement("button");
      btn.className = "btn small primary";
      btn.textContent = "Claim";
      btn.onclick = () => socket.emit("player:claimTask", { taskId: t.id }, (res) => {
        if (!res.ok) document.getElementById("game-error").textContent = res.error;
      });
      card.appendChild(btn);
    } else if (isMine && t.status === "in-progress") {
      const btn = document.createElement("button");
      btn.className = "btn small primary";
      btn.textContent = "Mark Complete";
      btn.onclick = () => socket.emit("player:completeTask", { taskId: t.id }, (res) => {
        if (!res.ok) document.getElementById("game-error").textContent = res.error;
      });
      card.appendChild(btn);
    }

    list.appendChild(card);
  });
}

// ---------- chat ----------
document.getElementById("btn-chat-send").onclick = sendChat;
document.getElementById("chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChat();
});
function sendChat() {
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text) return;
  socket.emit("chat:send", { message: text });
  input.value = "";
}
socket.on("chat:message", ({ from, text }) => {
  const log = document.getElementById("chat-log");
  const li = document.createElement("li");
  li.innerHTML = `<span class="from">${escapeHtml(from)}:</span>${escapeHtml(text)}`;
  log.appendChild(li);
  log.scrollTop = log.scrollHeight;
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
