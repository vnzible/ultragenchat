require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// ----------------------
// Connect to MongoDB
// ----------------------
if (process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => console.log('✅ MongoDB connected'))
        .catch(err => console.error('❌ MongoDB connection error:', err));
}

// ----------------------
// Middleware
// ----------------------
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));
app.use(express.json());

// ----------------------
// Data files
// ----------------------
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function initializeDataFiles() {
    if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([]));
    if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, JSON.stringify([]));
}

// ----------------------
// JSON helpers
// ----------------------
const readJson = (file) => {
    try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
    catch { return []; }
};
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));
const readUsers = () => readJson(USERS_FILE);
const writeUsers = (users) => writeJson(USERS_FILE, users);
const readMessages = () => readJson(MESSAGES_FILE);
const writeMessages = (messages) => writeJson(MESSAGES_FILE, messages);

// ----------------------
// Online users
// ----------------------
const onlineUsers = new Map();
const findSocketByUsername = (username) => Array.from(io.sockets.sockets.values()).find(s => s.username === username);
const isUserOnline = (username) => Array.from(onlineUsers.values()).includes(username);

// ----------------------
// Socket.io handlers
// ----------------------
// Keep all your existing socket.io code here exactly as it is

// ----------------------
// Routes
// ----------------------
app.get('/', (req, res) => {
    const indexPath = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.send('<h1>Ultragen Chat server is running</h1><p>No frontend found.</p>');
    }
});

// ----------------------
// Start server
// ----------------------
initializeDataFiles();
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
