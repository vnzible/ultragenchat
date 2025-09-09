// Replace your existing app.js with this file (full replacement)
document.addEventListener('DOMContentLoaded', function () {
    // ===== socket.io =====
    const socket = io();

    // ===== DOM elements =====
    const landingPage = document.getElementById('landing-page');
    const dashboardPage = document.getElementById('dashboard-page');
    const loginModal = document.getElementById('login-modal');
    const registerModal = document.getElementById('register-modal');
    const howToModal = document.getElementById('how-to-modal');
    const addFriendModal = document.getElementById('add-friend-modal');
    const friendsModal = document.getElementById('friends-modal');
    const requestsModal = document.getElementById('requests-modal');

    const loginBtn = document.getElementById('login-btn');
    const registerBtn = document.getElementById('register-btn');
    const howToBtn = document.getElementById('how-to-btn');
    const addFriendBtn = document.getElementById('add-friend-btn');
    const friendsBtn = document.getElementById('friends-btn');
    const requestsBtn = document.getElementById('requests-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const sendFriendRequestBtn = document.getElementById('send-friend-request');

    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    // Close buttons for all modals
    const closeModalButtons = document.querySelectorAll('.close-modal');

    // ===== app state =====
    let currentUser = null; // object { username: '...' } when logged in
    let activeFriend = null;

    // Typing indicator state
    const messageInput = document.getElementById('message-input');
    let typing = false;
    let typingTimeout;

    // ===== helpers =====
    function openModal(modal) {
        if (!modal) return;
        modal.style.display = 'block';
    }

    function closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
    }

    // showPage checks login state before showing dashboard
    function showPage(page) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

        // guard: don't allow dashboard if not logged in
        if (page === dashboardPage && !currentUser) {
            landingPage.classList.add('active');
            return;
        }

        page.classList.add('active');
    }

    // reset UI to the initial landing page (no modals)
    function resetAppToLanding() {
        // ensure state cleared
        currentUser = null;
        activeFriend = null;

        // clear chat UI
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) {
            chatMessages.innerHTML = `
                <div class="welcome-message">
                    <i class="fas fa-comments"></i>
                    <h3>Welcome to NeoChat</h3>
                    <p>Select a friend from your list to start chatting</p>
                </div>
            `;
        }

        // disable inputs
        const messageInputEl = document.getElementById('message-input');
        const sendBtnEl = document.getElementById('send-message-btn');
        if (messageInputEl) {
            messageInputEl.value = '';
            messageInputEl.disabled = true;
        }
        if (sendBtnEl) sendBtnEl.disabled = true;

        // reset header labels
        const curUserEl = document.getElementById('current-username');
        const activeFriendNameEl = document.getElementById('active-friend-name');
        if (curUserEl) curUserEl.textContent = 'Username';
        if (activeFriendNameEl) activeFriendNameEl.textContent = 'Select a friend to chat';

        // reset sidebars & requests
        const activeFriendsList = document.getElementById('active-friends-list');
        const friendsList = document.getElementById('friends-list');
        const requestsList = document.getElementById('requests-list');
        const requestCount = document.getElementById('request-count');

        if (activeFriendsList) activeFriendsList.innerHTML = `<p class="no-friends">No active friends</p>`;
        if (friendsList) friendsList.innerHTML = `<p class="no-data">You haven't added any friends yet</p>`;
        if (requestsList) requestsList.innerHTML = `<p class="no-data">No pending requests</p>`;
        if (requestCount) requestCount.textContent = '0';

        // ensure landing page visible and dashboard hidden
        showPage(landingPage);
        closeAllModals();
    }

    // perform login UI changes and load friends
    function setLoggedIn(user) {
        if (!user || !user.username) return;
        currentUser = user;
        const curUserEl = document.getElementById('current-username');
        if (curUserEl) curUserEl.textContent = user.username;

        // show dashboard (guard in showPage will allow because currentUser now exists)
        showPage(dashboardPage);
        closeAllModals();

        // request data for the logged-in user
        socket.emit('get_friends', { username: user.username });
        socket.emit('get_requests', { username: user.username });
    }

    // perform logout steps and reset UI (no modal shown, landing page only)
    function setLoggedOut() {
        if (currentUser && currentUser.username) {
            socket.emit('logout', { username: currentUser.username });
        }
        resetAppToLanding();
    }

    // ===== initial bindings =====
    // open modals
    if (loginBtn) loginBtn.addEventListener('click', () => openModal(loginModal));
    if (registerBtn) registerBtn.addEventListener('click', () => openModal(registerModal));
    if (howToBtn) howToBtn.addEventListener('click', () => openModal(howToModal));
    if (addFriendBtn) addFriendBtn.addEventListener('click', () => {
        if (!currentUser) { openModal(loginModal); return; }
        openModal(addFriendModal);
    });
    if (friendsBtn) friendsBtn.addEventListener('click', () => {
        if (!currentUser) { openModal(loginModal); return; }
        openModal(friendsModal);
        loadFriendsList();
    });
    if (requestsBtn) requestsBtn.addEventListener('click', () => {
        if (!currentUser) { openModal(loginModal); return; }
        openModal(requestsModal);
        loadFriendRequests();
    });

    // close modal buttons
    closeModalButtons.forEach(button => {
        button.addEventListener('click', () => closeAllModals());
    });

    // clicking outside modal closes it (keeps existing behavior)
    window.addEventListener('click', (e) => {
        if (e.target.classList && e.target.classList.contains('modal')) {
            closeAllModals();
        }
    });

    // ===== forms =====
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('login-username').value;
            const password = document.getElementById('login-password').value;
            socket.emit('login', { username, password });
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('register-username').value;
            const password = document.getElementById('register-password').value;
            socket.emit('register', { username, password });
        });
    }

    // send friend request (guarded)
    if (sendFriendRequestBtn) {
        sendFriendRequestBtn.addEventListener('click', () => {
            if (!currentUser) { openModal(loginModal); return; }
            const friendUsername = document.getElementById('friend-username').value;
            if (!friendUsername) return;
            socket.emit('send_friend_request', {
                from: currentUser.username,
                to: friendUsername
            });
        });
    }

    // logout button
    if (logoutBtn) logoutBtn.addEventListener('click', () => {
        setLoggedOut();
    });

    const backBtn = document.getElementById('back-to-dashboard');

backBtn.addEventListener('click', () => {
    activeFriend = null;
    document.getElementById('active-friend-name').textContent = "Select a friend to chat";
    document.getElementById('chat-messages').innerHTML = `
        <div class="welcome-message">
            <i class="fas fa-comments"></i>
            <h3>Welcome to NeoChat</h3>
            <p>Select a friend from your list to start chatting</p>
        </div>
    `;
    document.getElementById('message-input').disabled = true;
    document.getElementById('send-message-btn').disabled = true;
});


    // send message (guarded)
    const sendMessageBtn = document.getElementById('send-message-btn');
    if (sendMessageBtn) {
        sendMessageBtn.addEventListener('click', sendMessage);
    }
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }

    // typing indicator (guarded)
    if (messageInput) {
        messageInput.addEventListener('input', () => {
            if (!currentUser || !activeFriend) return;
            if (!typing) {
                typing = true;
                socket.emit('typing', {
                    from: currentUser.username,
                    to: activeFriend
                });
            }
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                typing = false;
                socket.emit('stop_typing', {
                    from: currentUser.username,
                    to: activeFriend
                });
            }, 1000);
        });
    }

    // ===== socket handlers =====
    socket.on('login_success', (user) => {
        // ensure user object exists
        setLoggedIn(user);
    });

    socket.on('login_error', (message) => {
        alert('Login Error: ' + message);
    });

    socket.on('register_success', () => {
        alert('Registration successful! You can now login.');
        closeAllModals();
        openModal(loginModal); // allow user to login after registering
    });

    socket.on('register_error', (message) => {
        alert('Registration Error: ' + message);
    });

    socket.on('friend_request_result', (data) => {
        const resultDiv = document.getElementById('add-friend-result');
        if (!resultDiv) return;
        if (data.success) {
            resultDiv.innerHTML = `<p style="color: var(--success)">${data.message}</p>`;
        } else {
            resultDiv.innerHTML = `<p style="color: var(--error)">${data.message}</p>`;
        }
        setTimeout(() => {
            resultDiv.innerHTML = '';
            const fInput = document.getElementById('friend-username');
            if (fInput) fInput.value = '';
        }, 3000);
    });

    socket.on('load_friends', (friends) => {
        // ignore if not logged in
        if (!currentUser) return;
        const activeFriendsList = document.getElementById('active-friends-list');
        if (!activeFriendsList) return;

        activeFriendsList.innerHTML = '';
        if (!friends || friends.length === 0) {
            activeFriendsList.innerHTML = '<p class="no-friends">No active friends</p>';
            return;
        }

        friends.forEach(friend => {
            const friendEl = document.createElement('div');
            friendEl.className = 'active-friend';
            friendEl.dataset.username = friend.username;
            friendEl.innerHTML = `
                <div class="active-friend-avatar-sm">
                    <i class="fas fa-user"></i>
                </div>
                <div class="active-friend-name">${friend.username}</div>
                <div class="active-status"></div>
            `;
            friendEl.addEventListener('click', () => {
                setActiveFriend(friend.username);
                closeAllModals();
            });
            activeFriendsList.appendChild(friendEl);
        });
    });

    socket.on('load_requests', (requests) => {
        // ignore if not logged in
        if (!currentUser) return;
        const requestsList = document.getElementById('requests-list');
        const requestCount = document.getElementById('request-count');
        if (!requestsList || !requestCount) return;

        requestCount.textContent = (requests && requests.length) ? requests.length : '0';

        if (!requests || requests.length === 0) {
            requestsList.innerHTML = '<p class="no-data">No pending requests</p>';
            return;
        }

        requestsList.innerHTML = '';
        requests.forEach(request => {
            const requestEl = document.createElement('div');
            requestEl.className = 'request-item';
            requestEl.innerHTML = `
                <div class="friend-avatar">
                    <i class="fas fa-user"></i>
                </div>
                <div class="friend-details">
                    <div class="friend-name">${request.from}</div>
                    <div class="friend-status">Wants to be your friend</div>
                </div>
                <div class="friend-actions">
                    <button class="action-btn accept-btn" data-from="${request.from}">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="action-btn reject-btn" data-from="${request.from}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
            requestsList.appendChild(requestEl);
        });

        // attach accept/reject (guard currentUser not null)
        document.querySelectorAll('.accept-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!currentUser) { openModal(loginModal); return; }
                const from = e.target.closest('.accept-btn').dataset.from;
                socket.emit('accept_request', { from, to: currentUser.username });
            });
        });
        document.querySelectorAll('.reject-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!currentUser) { openModal(loginModal); return; }
                const from = e.target.closest('.reject-btn').dataset.from;
                socket.emit('reject_request', { from, to: currentUser.username });
            });
        });
    });

    socket.on('new_message', (data) => {
        // only display messages when user is in that chat
        if (!currentUser) return;
        if (activeFriend === data.from || activeFriend === data.to) {
            addMessageToChat(data);
        }
        // play notification if tab hidden
        if (document.hidden) {
            const snd = document.getElementById('notification-sound');
            if (snd) snd.play();
            if (Notification && Notification.permission === 'granted') {
                new Notification('New message from ' + data.from, {
                    body: data.message.length > 30 ? data.message.substring(0, 30) + '...' : data.message,
                    icon: 'https://example.com/icon.png'
                });
            }
        }
    });

    socket.on('message_seen', (data) => {
        const messages = document.querySelectorAll('.message');
        messages.forEach(msg => {
            if (msg.dataset.id === data.messageId) {
                const seenEl = msg.querySelector('.message-seen');
                if (seenEl) seenEl.textContent = 'Seen';
            }
        });
    });

    socket.on('typing', (data) => {
        if (!currentUser) return;
        if (activeFriend === data.from) {
            const ti = document.getElementById('typing-indicator');
            if (ti) ti.textContent = `${data.from} is typing...`;
        }
    });

    socket.on('stop_typing', (data) => {
        if (!currentUser) return;
        if (activeFriend === data.from) {
            const ti = document.getElementById('typing-indicator');
            if (ti) ti.textContent = '';
        }
    });

    socket.on('user_online', (username) => {
        const friendElements = document.querySelectorAll('.active-friend');
        friendElements.forEach(el => {
            if (el.dataset.username === username) {
                const dot = el.querySelector('.active-status');
                if (dot) dot.style.display = 'block';
            }
        });
    });

    socket.on('user_offline', (username) => {
        const friendElements = document.querySelectorAll('.active-friend');
        friendElements.forEach(el => {
            if (el.dataset.username === username) {
                const dot = el.querySelector('.active-status');
                if (dot) dot.style.display = 'none';
            }
        });
    });

    // chat history
    socket.on('chat_history', (messages) => {
        if (!currentUser || !activeFriend) return;
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;
        chatMessages.innerHTML = '';
        if (!messages || messages.length === 0) {
            chatMessages.innerHTML = `
                <div class="welcome-message">
                    <i class="fas fa-comment"></i>
                    <h3>Start a conversation</h3>
                    <p>Send a message to ${activeFriend} to start chatting</p>
                </div>
            `;
            return;
        }
        messages.forEach(message => addMessageToChat(message));
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });

    // ===== helper UI functions used above =====
    function setActiveFriend(friendUsername) {
        if (!currentUser) { openModal(loginModal); return; }
        activeFriend = friendUsername;
        const nameEl = document.getElementById('active-friend-name');
        if (nameEl) nameEl.textContent = friendUsername;
        const messageInputEl = document.getElementById('message-input');
        const sendBtnEl = document.getElementById('send-message-btn');
        if (messageInputEl) messageInputEl.disabled = false;
        if (sendBtnEl) sendBtnEl.disabled = false;

        // clear chat and request history load
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) chatMessages.innerHTML = '';
        socket.emit('get_chat_history', {
            user1: currentUser.username,
            user2: activeFriend
        });
    }

    function loadFriendsList() {
        if (!currentUser) return;
        socket.emit('get_friends', { username: currentUser.username });
        const friendsList = document.getElementById('friends-list');
        if (friendsList) friendsList.innerHTML = '<p class="no-data">Loading...</p>';
    }

    function loadFriendRequests() {
        if (!currentUser) return;
        socket.emit('get_requests', { username: currentUser.username });
    }

    function sendMessage() {
        if (!currentUser || !activeFriend) return;
        const messageInputEl = document.getElementById('message-input');
        if (!messageInputEl) return;
        const message = messageInputEl.value.trim();
        if (!message) return;

        const messageData = {
            from: currentUser.username,
            to: activeFriend,
            message,
            timestamp: new Date().toISOString()
        };
        socket.emit('send_message', messageData);
        addMessageToChat({ ...messageData, isSent: true });
        messageInputEl.value = '';
    }

    function addMessageToChat(data) {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;

        // remove welcome message
        const welcomeMessage = chatMessages.querySelector('.welcome-message');
        if (welcomeMessage) welcomeMessage.remove();

        const msgEl = document.createElement('div');
        msgEl.className = `message ${data.from === (currentUser && currentUser.username) ? 'sent' : 'received'}`;
        msgEl.dataset.id = data.id || Date.now();

        const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        msgEl.innerHTML = `
            ${data.from !== (currentUser && currentUser.username) ? `<div class="message-sender">${data.from}</div>` : ''}
            <div class="message-text">${data.message}</div>
            <div class="message-time">${time}</div>
            ${data.from === (currentUser && currentUser.username) ? `<div class="message-seen">${data.seen ? 'Seen' : 'Sent'}</div>` : ''}
        `;

        chatMessages.appendChild(msgEl);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // if received, confirm seen
        if (data.from !== (currentUser && currentUser.username)) {
            socket.emit('message_seen', {
                messageId: msgEl.dataset.id,
                from: data.to,
                to: data.from
            });
        }
    }

    // request notification permission once
    if (Notification && Notification.permission !== 'granted') {
        Notification.requestPermission().catch(() => {});
    }

    // ===== final init: ensure we start logged out on page load =====
    resetAppToLanding();
});
