const express = require("express");
const http = require("http");
const cors = require("cors");
const { Pool, Client } = require("pg");
const { Server } = require("socket.io");
const extractTokenFromHeader = require("./lib/extractToken");

// Helper: retrieve token from body or from Authorization header
function getToken(req) {
  return req.body.token || extractTokenFromHeader(req);
}

// -------------------------
// Setup Express and HTTP
// -------------------------
const app = express();
const server = http.createServer(app);

// Allow CORS and JSON bodies
app.use(cors({ origin: "*" }));
app.use(express.json());

// -------------------------
// Setup PostgreSQL Pool
// -------------------------
console.log(process.env.DATABASE_URL);
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://neondb_owner:npg_tw0C7qaYGVpD@ep-divine-heart-a2swx5pb.eu-central-1.aws.neon.tech/neondb?sslmode=require",
});

// -------------------------
// REST API Endpoints
// -------------------------

// --- User Authentication ---

app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      "SELECT register_user($1, $2) as response",
      [username, password]
    );
    res.json(result.rows[0].response);
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query("SELECT login_user($1, $2) as response", [
      username,
      password,
    ]);
    res.json(result.rows[0].response);
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/reset-password", async (req, res) => {
  const { username, oldPassword, newPassword } = req.body;
  try {
    const result = await pool.query(
      "SELECT reset_password($1, $2, $3) as response",
      [username, oldPassword, newPassword]
    );
    res.json(result.rows[0].response);
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Session Management ---

app.get("/api/sessions", async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const result = await pool.query("SELECT get_sessions($1) as response", [
      token,
    ]);
    res.json(result.rows[0].response);
  } catch (err) {
    console.error("Get sessions error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/sessions", async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: "Missing token" });
  const { sessionName, moveDuration, playerCount } = req.body;
  try {
    const result = await pool.query(
      "SELECT create_session($1, $2, $3, $4) as response",
      [token, sessionName, moveDuration, playerCount]
    );
    const sessionResponse = result.rows[0].response;
    io.emit("sessions_changed", sessionResponse);
    res.json(sessionResponse);
  } catch (err) {
    console.error("Create session error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/api/sessions/:id", async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: "Missing token" });
  const sessionId = req.params.id;
  try {
    const result = await pool.query(
      "SELECT delete_session($1, $2) as response",
      [token, sessionId]
    );

    const sessionResponse = result.rows[0].response;
    io.emit("sessions_changed", sessionResponse);
    res.json(sessionResponse);
  } catch (err) {
    console.error("Delete session error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/sessions/:id", async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: "Missing token" });
  const sessionId = req.params.id;
  try {
    const result = await pool.query("SELECT get_session($1, $2) as response", [
      token,
      sessionId,
    ]);
    res.json(result.rows[0].response);
  } catch (err) {
    console.error("Get session error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/join-session", async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: "Missing token" });
  const { sessionId } = req.body;
  try {
    const joinRes = await pool.query(
      "SELECT join_session($1, $2) as response",
      [token, sessionId]
    );
    console.log("wtf");
    // Query updated players list
    const playersRes = await pool.query(
      "SELECT get_session_players($1, $2) as response",
      [token, sessionId]
    );
    const playersList = playersRes.rows[0].response.players || [];
    io.to(`session_${sessionId}`).emit("updatePlayers", {
      players: playersList,
    });
    const sessionResponse = joinRes.rows[0].response;
    io.emit("sessions_changed", sessionResponse);
    res.json(sessionResponse);
  } catch (err) {
    console.error("Join session error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Place a card endpoint: uses your corrected place_card_on_table function.
app.post("/api/place-card", async (req, res) => {
  const { token, sessionId, sessionCardId } = req.body;
  try {
    const result = await pool.query(
      "SELECT place_card_on_table($1, $2, $3) as response",
      [token, sessionId, sessionCardId]
    );
    res.json(result.rows[0].response);
  } catch (err) {
    console.error("Place card error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/get-player-cards", async (req, res) => {
  const { token, sessionId } = req.body;
  try {
    const result = await pool.query(
      "SELECT get_player_cards($1, $2) as response",
      [token, sessionId]
    );
    res.json(result.rows[0].response);
  } catch (err) {
    console.error("Get player cards error::", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/get-player-table-cards", async (req, res) => {
  const { token, sessionId } = req.body;
  try {
    const result = await pool.query(
      "SELECT get_player_table_cards($1, $2) as response",
      [token, sessionId]
    );
    res.json(result.rows[0].response);
  } catch (err) {
    console.error("Get player cards error::", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/get-table-cards", async (req, res) => {
  const { token, sessionId } = req.body;
  try {
    const result = await pool.query(
      "SELECT get_table_cards($1, $2) as response",
      [token, sessionId]
    );
    res.json(result.rows[0].response);
  } catch (err) {
    console.error("Get table cards error::", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
app.post("/api/is-player-belongs", async (req, res) => {
  const token = getToken(req);
  const { sessionId } = req.body;
  try {
    const result = await pool.query(
      "SELECT is_player_belongs_session($1, $2) as response",
      [token, sessionId]
    );
    res.json(result.rows[0].response);
  } catch (err) {
    console.error("Get user error::", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/leave-session", async (req, res) => {
  const token = getToken(req);
  const { sessionId } = req.body;
  try {
    const result = await pool.query(
      "SELECT leave_session($1, $2) as response",
      [token, sessionId]
    );
    // Query updated players list
    const playersRes = await pool.query(
      "SELECT get_session_players($1, $2) as response",
      [token, sessionId]
    );
    const playersList = playersRes.rows[0].response.players || [];
    io.to(`session_${sessionId}`).emit("updatePlayers", {
      players: playersList,
    });
    const sessionResponse = result.rows[0].response;
    io.emit("sessions_changed", sessionResponse);
    res.json(sessionResponse);
  } catch (err) {
    console.error("Get player cards error::", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a dedicated client for notifications.

const notificationClient = new Client({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://neondb_owner:npg_tw0C7qaYGVpD@ep-divine-heart-a2swx5pb.eu-central-1.aws.neon.tech/neondb?sslmode=require",
});

notificationClient.connect((err) => {
  if (err) {
    console.error("Notification client connection error:", err);
  } else {
    console.log("Notification client connected");
    // Listen on the "game_events" channel
    notificationClient.query("LISTEN game_events");
  }
});

notificationClient.on("notification", (msg) => {
  try {
    // Expect the payload to be a JSON string like:
    // {"session_id":46, "event":"countdown", "timeLeft":10}
    const payload = JSON.parse(msg.payload);
    console.log("Received notification:", payload);

    // Check that the payload has the needed fields.
    if (payload.session_id && payload.event) {
      const roomName = `session_${payload.session_id}`;
      // Emit the event to the room. For example, if payload.event is "countdown",
      // this will emit a "countdown" event with the payload.
      io.to(roomName).emit(payload.event, payload);
      console.log(`Emitted '${payload.event}' to room ${roomName}`);
    }
  } catch (error) {
    console.error("Error parsing notification payload:", error);
  }
});

// -------------------------
// Socket.IO Setup
// -------------------------
const io = new Server(server, { cors: { origin: "*" } });

// When a client connects via Socket.IO, require both sessionId and token for proper join.
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);
  socket.on("session_list", async (data) => {
    const roomName = `session_list`;
    socket.join(roomName);
    console.log(`Socket ${socket.id} joined room ${roomName}`);
  });
  // Client should send an object with { sessionId, token }
  socket.on("joinSessionRoom", async (data) => {
    const { sessionId, token } = data;
    const roomName = `session_${sessionId}`;
    socket.join(roomName);
    console.log(`Socket ${socket.id} joined room ${roomName}`);
    // Immediately fetch the current players list and send to this room
    try {
      const playersRes = await pool.query(
        "SELECT get_session_players($1, $2) as response",
        [token, sessionId]
      );
      const playersList = playersRes.rows[0].response.players || [];
      io.to(roomName).emit("updatePlayers", { players: playersList });
    } catch (err) {
      console.error("Error fetching players on join:", err);
    }
  });

  socket.on("leaveSession", async (data) => {
    const { sessionId, token } = data;
    try {
      const playersRes = await pool.query(
        "SELECT leave_session($1, $2) as response",
        [token, sessionId]
      );
      console.log(playersRes.rows[0].response.players || []);
    } catch (err) {
      console.error("Error fetching players on join:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

// -------------------------
// Start Server
// -------------------------
const PORT = process.env.PORT || 3001;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
