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

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Data files paths
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const MESSAGES_FILE = path.join(__dirname, 'data', 'messages.json');


// Initialize data files if they don't exist
function initializeDataFiles() {
    if (!fs.existsSync(USERS_FILE)) {
        fs.writeFileSync(USERS_FILE, JSON.stringify([]));
    }
    
    if (!fs.existsSync(MESSAGES_FILE)) {
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify([]));
    }
}

// Read data from JSON files
function readUsers() {
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading users file:', error);
        return [];
    }
}

function readMessages() {
    try {
        const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading messages file:', error);
        return [];
    }
}

// Write data to JSON files
function writeUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (error) {
        console.error('Error writing users file:', error);
    }
}

function writeMessages(messages) {
    try {
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
    } catch (error) {
        console.error('Error writing messages file:', error);
    }
}

// Track online users
const onlineUsers = new Map();

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    



    
    // User registration
    socket.on('register', async (data) => {
        const { username, password } = data;
        const users = readUsers();
        
        // Check if user already exists
        if (users.find(user => user.username === username)) {
            socket.emit('register_error', 'Username already exists');
            return;
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create new user
        const newUser = {
            id: Date.now().toString(),
            username,
            password: hashedPassword,
            friends: [],
            friendRequests: []
        };
        
        users.push(newUser);
        writeUsers(users);
        
        socket.emit('register_success');
    });
    
    // User login
    socket.on('login', async (data) => {
        const { username, password } = data;
        const users = readUsers();
        
        const user = users.find(u => u.username === username);
        if (!user) {
            socket.emit('login_error', 'User not found');
            return;
        }
        
        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            socket.emit('login_error', 'Invalid password');
            return;
        }
        
        // Add user to online users
        onlineUsers.set(socket.id, username);
        socket.username = username;
        
        // Emit login success
        socket.emit('login_success', { username: user.username });
        
        // Notify friends that user is online
        user.friends.forEach(friend => {
            io.emit('user_online', username);
        });
    });
    
    // Send friend request
    socket.on('send_friend_request', (data) => {
        const { from, to } = data;
        const users = readUsers();
        
        const fromUser = users.find(u => u.username === from);
        const toUser = users.find(u => u.username === to);
        
        if (!toUser) {
            socket.emit('friend_request_result', { 
                success: false, 
                message: 'User not found' 
            });
            return;
        }
        
        if (fromUser.friends.includes(to)) {
            socket.emit('friend_request_result', { 
                success: false, 
                message: 'User is already your friend' 
            });
            return;
        }
        
        if (toUser.friendRequests.includes(from)) {
            socket.emit('friend_request_result', { 
                success: false, 
                message: 'Friend request already sent' 
            });
            return;
        }
        
        // Add friend request
        toUser.friendRequests.push(from);
        writeUsers(users);
        
        // Notify recipient if online
        const recipientSocket = findSocketByUsername(to);
        if (recipientSocket) {
            io.to(recipientSocket.id).emit('update_requests', toUser.friendRequests);
        }
        
        socket.emit('friend_request_result', { 
            success: true, 
            message: 'Friend request sent' 
        });
    });
    
    // Accept friend request
    socket.on('accept_request', (data) => {
        const { from, to } = data;
        const users = readUsers();
        
        const fromUser = users.find(u => u.username === from);
        const toUser = users.find(u => u.username === to);
        
        if (!fromUser || !toUser) return;
        
        // Remove friend request
        toUser.friendRequests = toUser.friendRequests.filter(req => req !== from);
        
        // Add to friends list
        if (!fromUser.friends.includes(to)) fromUser.friends.push(to);
        if (!toUser.friends.includes(from)) toUser.friends.push(from);
        
        writeUsers(users);
        
        // Notify both users
        socket.emit('update_friends', toUser.friends);
        
        const fromSocket = findSocketByUsername(from);
        if (fromSocket) {
            io.to(fromSocket.id).emit('update_friends', fromUser.friends);
        }
        
        // Reload requests for current user
        socket.emit('load_requests', toUser.friendRequests);
    });
    
    // Reject friend request
    socket.on('reject_request', (data) => {
        const { from, to } = data;
        const users = readUsers();
        
        const toUser = users.find(u => u.username === to);
        if (!toUser) return;
        
        // Remove friend request
        toUser.friendRequests = toUser.friendRequests.filter(req => req !== from);
        writeUsers(users);
        
        // Reload requests for current user
        socket.emit('load_requests', toUser.friendRequests);
    });
    
    // Get friends list
    socket.on('get_friends', (data) => {
        const { username } = data;
        const users = readUsers();
        
        const user = users.find(u => u.username === username);
        if (!user) return;
        
        socket.emit('load_friends', user.friends.map(friend => {
            return {
                username: friend,
                online: isUserOnline(friend)
            };
        }));
    });
    
    // Get friend requests
    socket.on('get_requests', (data) => {
        const { username } = data;
        const users = readUsers();
        
        const user = users.find(u => u.username === username);
        if (!user) return;
        
        socket.emit('load_requests', user.friendRequests.map(req => {
            return { from: req };
        }));
    });
    
    // Send message
    socket.on('send_message', (data) => {
        const { from, to, message, timestamp } = data;
        const messages = readMessages();
        
        const newMessage = {
            id: Date.now().toString(),
            from,
            to,
            message,
            timestamp,
            seen: false
        };
        
        messages.push(newMessage);
        writeMessages(messages);
        
        // Send to recipient if online
        const recipientSocket = findSocketByUsername(to);
        if (recipientSocket) {
            io.to(recipientSocket.id).emit('new_message', newMessage);
        }
        
        // Also send back to sender for UI update
        socket.emit('new_message', { ...newMessage, isSent: true });
    });
    
    // Get chat history
    socket.on('get_chat_history', (data) => {
        const { user1, user2 } = data;
        const messages = readMessages();
        
        const chatHistory = messages.filter(msg => {
            return (msg.from === user1 && msg.to === user2) || 
                   (msg.from === user2 && msg.to === user1);
        });
        
        socket.emit('chat_history', chatHistory);
    });
    
    // Message seen
    socket.on('message_seen', (data) => {
        const { messageId, from, to } = data;
        const messages = readMessages();
        
        const message = messages.find(msg => msg.id === messageId);
        if (message && message.from === to && message.to === from) {
            message.seen = true;
            writeMessages(messages);
            
            // Notify sender that message was seen
            const senderSocket = findSocketByUsername(to);
            if (senderSocket) {
                io.to(senderSocket.id).emit('message_seen', { messageId });
            }
        }
    });
    
    // Typing indicator
    socket.on('typing', (data) => {
        const { from, to } = data;
        const recipientSocket = findSocketByUsername(to);
        if (recipientSocket) {
            io.to(recipientSocket.id).emit('typing', { from });
        }
    });
    
    // Stop typing indicator
    socket.on('stop_typing', (data) => {
        const { from, to } = data;
        const recipientSocket = findSocketByUsername(to);
        if (recipientSocket) {
            io.to(recipientSocket.id).emit('stop_typing', { from });
        }
    });
    
    // Logout
    socket.on('logout', (data) => {
        const { username } = data;
        
        // Remove from online users
        onlineUsers.delete(socket.id);
        
        // Notify friends that user is offline
        const users = readUsers();
        const user = users.find(u => u.username === username);
        if (user) {
            user.friends.forEach(friend => {
                io.emit('user_offline', username);
            });
        }
    });
    
    // Disconnect
    socket.on('disconnect', () => {
        const username = onlineUsers.get(socket.id);
        if (username) {
            onlineUsers.delete(socket.id);
            
            // Notify friends that user is offline
            const users = readUsers();
            const user = users.find(u => u.username === username);
            if (user) {
                user.friends.forEach(friend => {
                    io.emit('user_offline', username);
                });
            }
        }
        
        console.log('User disconnected:', socket.id);
    });
});

// Helper function to find socket by username
function findSocketByUsername(username) {
    const sockets = Array.from(io.sockets.sockets.values());
    return sockets.find(s => s.username === username);
}

// Helper function to check if user is online
function isUserOnline(username) {
    return Array.from(onlineUsers.values()).includes(username);
}

// Route to serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize data files and start server
initializeDataFiles();
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});