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

// ---------------------
// Initialize folders/files
// ---------------------

// Data files
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

// Public folder
const PUBLIC_DIR = path.join(__dirname, 'public');
const INDEX_FILE = path.join(PUBLIC_DIR, 'index.html');

function initializeDataFiles() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([]));
    if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, JSON.stringify([]));
}

function initializePublicFolder() {
    if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    if (!fs.existsSync(INDEX_FILE)) {
        const defaultHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ultragen Chat</title>
</head>
<body>
<h1>Welcome to Ultragen Chat!</h1>
<p>The server is running.</p>
</body>
</html>`;
        fs.writeFileSync(INDEX_FILE, defaultHtml);
        console.log('✅ Created default index.html');
    }
}

// Call initialization
initializeDataFiles();
initializePublicFolder();

// ---------------------
// MongoDB connection
// ---------------------
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// ---------------------
// Middleware
// ---------------------
app.use(express.static(PUBLIC_DIR));
app.use(express.json());

// ---------------------
// Socket.io logic
// ---------------------
const onlineUsers = new Map();

// Helper functions
function readUsers() {
    try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } 
    catch { return []; }
}
function writeUsers(users) { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }
function readMessages() {
    try { return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8')); } 
    catch { return []; }
}
function writeMessages(messages) { fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2)); }

function findSocketByUsername(username) {
    const sockets = Array.from(io.sockets.sockets.values());
    return sockets.find(s => s.username === username);
}

function isUserOnline(username) {
    return Array.from(onlineUsers.values()).includes(username);
}

// ---------------------
// Socket.io events
// ---------------------
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // User registration
    socket.on('register', async (data) => {
        const { username, password } = data;
        const users = readUsers();
        if (users.find(u => u.username === username)) {
            socket.emit('register_error', 'Username already exists');
            return;
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        users.push({ id: Date.now().toString(), username, password: hashedPassword, friends: [], friendRequests: [] });
        writeUsers(users);
        socket.emit('register_success');
    });

    // User login
    socket.on('login', async (data) => {
        const { username, password } = data;
        const users = readUsers();
        const user = users.find(u => u.username === username);
        if (!user) return socket.emit('login_error', 'User not found');
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) return socket.emit('login_error', 'Invalid password');

        onlineUsers.set(socket.id, username);
        socket.username = username;
        socket.emit('login_success', { username: user.username });
        user.friends.forEach(friend => io.emit('user_online', username));
    });

    // Friend request, accept/reject, get friends, messages, typing, logout, etc.
    // (Keep your existing code here, unchanged)
});

// ---------------------
// Routes
// ---------------------
app.get('/', (req, res) => {
    res.sendFile(INDEX_FILE);
});

// ---------------------
// Start server
// ---------------------
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
