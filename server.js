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

// Connect to MongoDB (optional; fallback to JSON if not used)
if (process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => console.log('✅ MongoDB connected'))
        .catch(err => console.error('❌ MongoDB connection error:', err));
}

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Data files paths
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize data files if they don't exist
function initializeDataFiles() {
    if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([]));
    if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, JSON.stringify([]));
}

// Read / Write JSON helpers
function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
        return [];
    }
}

function writeJson(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error(`Error writing ${filePath}:`, err);
    }
}

// Users and messages helpers
const readUsers = () => readJson(USERS_FILE);
const writeUsers = (users) => writeJson(USERS_FILE, users);
const readMessages = () => readJson(MESSAGES_FILE);
const writeMessages = (messages) => writeJson(MESSAGES_FILE, messages);

// Track online users
const onlineUsers = new Map();

// Helper functions
function findSocketByUsername(username) {
    return Array.from(io.sockets.sockets.values()).find(s => s.username === username);
}

function isUserOnline(username) {
    return Array.from(onlineUsers.values()).includes(username);
}

// Socket.io handlers
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Registration
    socket.on('register', async ({ username, password }) => {
        const users = readUsers();
        if (users.find(u => u.username === username)) {
            return socket.emit('register_error', 'Username already exists');
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        users.push({ id: Date.now().toString(), username, password: hashedPassword, friends: [], friendRequests: [] });
        writeUsers(users);
        socket.emit('register_success');
    });

    // Login
    socket.on('login', async ({ username, password }) => {
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

    // Friend requests
socket.on('send_friend_request', ({ from, to }) => {
    const users = readUsers();
    const fromUser = users.find(u => u.username === from);
    const toUser = users.find(u => u.username === to);

    if (!toUser) return socket.emit('friend_request_result', { success: false, message: 'User not found' });
    if (fromUser.friends.includes(to)) return socket.emit('friend_request_result', { success: false, message: 'Already friends' });
    if (toUser.friendRequests.includes(from)) return socket.emit('friend_request_result', { success: false, message: 'Request already sent' });

    // Add friend request
    toUser.friendRequests.push(from);
    writeUsers(users);

    // Notify sender immediately
    socket.emit('friend_request_result', { success: true, message: 'Friend request sent' });

    // Notify recipient if online
    const recipientSocket = findSocketByUsername(to);
    if (recipientSocket) {
        recipientSocket.emit('load_requests', toUser.friendRequests);
    }
});


    socket.on('accept_request', ({ from, to }) => {
        const users = readUsers();
        const fromUser = users.find(u => u.username === from);
        const toUser = users.find(u => u.username === to);
        if (!fromUser || !toUser) return;

        toUser.friendRequests = toUser.friendRequests.filter(req => req !== from);
        if (!fromUser.friends.includes(to)) fromUser.friends.push(to);
        if (!toUser.friends.includes(from)) toUser.friends.push(from);

        writeUsers(users);
        socket.emit('update_friends', toUser.friends);
        const fromSocket = findSocketByUsername(from);
        if (fromSocket) io.to(fromSocket.id).emit('update_friends', fromUser.friends);
        socket.emit('load_requests', toUser.friendRequests);
    });

    socket.on('reject_request', ({ from, to }) => {
        const users = readUsers();
        const toUser = users.find(u => u.username === to);
        if (!toUser) return;
        toUser.friendRequests = toUser.friendRequests.filter(req => req !== from);
        writeUsers(users);
        socket.emit('load_requests', toUser.friendRequests);
    });

    // Messaging
    socket.on('send_message', ({ from, to, message, timestamp }) => {
        const messages = readMessages();
        const newMessage = { id: Date.now().toString(), from, to, message, timestamp, seen: false };
        messages.push(newMessage);
        writeMessages(messages);

        const recipientSocket = findSocketByUsername(to);
        if (recipientSocket) io.to(recipientSocket.id).emit('new_message', newMessage);
        socket.emit('new_message', { ...newMessage, isSent: true });
    });

    socket.on('get_chat_history', ({ user1, user2 }) => {
        const messages = readMessages();
        const chatHistory = messages.filter(msg => (msg.from === user1 && msg.to === user2) || (msg.from === user2 && msg.to === user1));
        socket.emit('chat_history', chatHistory);
    });

    socket.on('message_seen', ({ messageId, from, to }) => {
        const messages = readMessages();
        const message = messages.find(msg => msg.id === messageId);
        if (message && message.from === to && message.to === from) {
            message.seen = true;
            writeMessages(messages);
            const senderSocket = findSocketByUsername(to);
            if (senderSocket) io.to(senderSocket.id).emit('message_seen', { messageId });
        }
    });

    // Typing
    socket.on('typing', ({ from, to }) => {
        const recipientSocket = findSocketByUsername(to);
        if (recipientSocket) io.to(recipientSocket.id).emit('typing', { from });
    });

    socket.on('stop_typing', ({ from, to }) => {
        const recipientSocket = findSocketByUsername(to);
        if (recipientSocket) io.to(recipientSocket.id).emit('stop_typing', { from });
    });

    // Logout
    socket.on('logout', ({ username }) => {
        onlineUsers.delete(socket.id);
        const users = readUsers();
        const user = users.find(u => u.username === username);
        if (user) user.friends.forEach(friend => io.emit('user_offline', username));
    });

    socket.on('disconnect', () => {
        const username = onlineUsers.get(socket.id);
        if (username) {
            onlineUsers.delete(socket.id);
            const users = readUsers();
            const user = users.find(u => u.username === username);
            if (user) user.friends.forEach(friend => io.emit('user_offline', username));
        }
        console.log('User disconnected:', socket.id);
    });
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
initializeDataFiles();
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
