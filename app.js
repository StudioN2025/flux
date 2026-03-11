// Глобальные переменные
let currentUser = null;
let peerConnection = null;
let activeChat = null;
let contacts = new Map();
let messages = new Map();
let typingTimeout = null;

// Сигнальный сервер Firebase
const signalServer = {
    // Ожидание подключений
    listenForOffers: async () => {
        db.collection('signaling').where('targetUserId', '==', currentUser.uid)
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach(async (change) => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        
                        if (data.type === 'offer') {
                            await handleIncomingOffer(data);
                        } else if (data.type === 'answer') {
                            await peerConnection.handleAnswer(data);
                        } else if (data.type === 'candidate') {
                            await peerConnection.handleIceCandidate(data);
                        }
                        
                        // Удаляем обработанное сообщение
                        change.doc.ref.delete();
                    }
                });
            });
    },
    
    // Отправить предложение
    sendOffer: async (targetUserId, offerData) => {
        await db.collection('signaling').add({
            ...offerData,
            type: 'offer',
            targetUserId,
            fromUserId: currentUser.uid,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    },
    
    // Отправить ответ
    sendAnswer: async (targetUserId, answerData) => {
        await db.collection('signaling').add({
            ...answerData,
            type: 'answer',
            targetUserId,
            fromUserId: currentUser.uid,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    },
    
    // Отправить ICE кандидат
    sendIceCandidate: async (targetUserId, candidate) => {
        await db.collection('signaling').add({
            type: 'candidate',
            candidate,
            targetUserId,
            fromUserId: currentUser.uid,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
};

// Генерируем 12-значный код
function generateUserCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 12; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Регистрация
async function register() {
    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    if (!username || !email || !password) {
        alert('Пожалуйста, заполните все поля');
        return;
    }
    
    if (password.length < 6) {
        alert('Пароль должен быть не менее 6 символов');
        return;
    }
    
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const userCode = generateUserCode();
        
        // Создаем профиль пользователя
        await db.collection('users').doc(userCredential.user.uid).set({
            username: username,
            email: email,
            code: userCode,
            online: true,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        alert(`Ваш уникальный код: ${userCode}\nСохраните его!`);
        
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        alert('Ошибка регистрации: ' + error.message);
    }
}

// Вход по коду
async function loginWithCode() {
    const code = document.getElementById('loginCode').value.trim().toUpperCase();
    
    if (!code || code.length !== 12) {
        alert('Введите 12-значный код');
        return;
    }
    
    try {
        // Ищем пользователя по коду
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('code', '==', code).get();
        
        if (snapshot.empty) {
            alert('Пользователь с таким кодом не найден');
            return;
        }
        
        const userData = snapshot.docs[0].data();
        
        // Для простоты используем email для входа
        // В реальном проекте нужно добавить возможность входа по коду
        alert(`Найден пользователь: ${userData.username}\nДля входа используйте email и пароль`);
        
    } catch (error) {
        console.error('Ошибка поиска:', error);
        alert('Ошибка: ' + error.message);
    }
}

// Поиск пользователя по коду
async function findUser() {
    const code = document.getElementById('searchCode').value.trim().toUpperCase();
    
    if (!code || code.length !== 12) {
        alert('Введите 12-значный код');
        return;
    }
    
    try {
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('code', '==', code).get();
        
        const searchResult = document.getElementById('searchResult');
        
        if (snapshot.empty) {
            searchResult.innerHTML = '<div class="not-found">❌ Пользователь не найден</div>';
            searchResult.classList.add('show');
            return;
        }
        
        const userData = snapshot.docs[0].data();
        const userId = snapshot.docs[0].id;
        
        searchResult.innerHTML = `
            <div class="found-user">
                <div class="found-user-info">
                    <span class="found-user-name">${userData.username}</span>
                    <span class="found-user-code">${userData.code}</span>
                </div>
                <button onclick="connectToUser('${userId}', '${userData.username}', '${userData.code}')" class="connect-btn">
                    Подключиться
                </button>
            </div>
        `;
        searchResult.classList.add('show');
        
    } catch (error) {
        console.error('Ошибка поиска:', error);
        alert('Ошибка: ' + error.message);
    }
}

// Подключение к пользователю
async function connectToUser(userId, username, userCode) {
    if (!peerConnection) {
        alert('Сначала войдите в систему');
        return;
    }
    
    try {
        // Создаем предложение
        const offerData = await peerConnection.createOffer(userId, userCode, username);
        
        // Отправляем через сигнальный сервер
        await signalServer.sendOffer(userId, offerData);
        
        // Добавляем в контакты
        addToContacts(userId, username, userCode, 'connecting');
        
        // Показываем индикатор подключения
        showNotification(`Подключаемся к ${username}...`);
        
    } catch (error) {
        console.error('Ошибка подключения:', error);
        alert('Не удалось подключиться: ' + error.message);
    }
}

// Обработка входящего предложения
async function handleIncomingOffer(data) {
    const { fromUserId, fromUserCode, fromUserName, offer } = data;
    
    // Создаем ответ
    const answerData = await peerConnection.handleOffer(data);
    
    // Отправляем ответ
    await signalServer.sendAnswer(fromUserId, answerData);
    
    // Добавляем в контакты
    addToContacts(fromUserId, fromUserName, fromUserCode, 'connecting');
    
    // Показываем уведомление
    if (confirm(`${fromUserName} хочет подключиться к вам. Принять?`)) {
        showNotification(`Подключение к ${fromUserName}...`);
    } else {
        // Отклоняем соединение
        peerConnection.closeConnection(fromUserId);
        removeFromContacts(fromUserId);
    }
}

// Добавление в контакты
function addToContacts(userId, username, userCode, status) {
    if (!contacts.has(userId)) {
        contacts.set(userId, {
            id: userId,
            username,
            userCode,
            status,
            unread: 0
        });
        
        renderContacts();
    }
}

// Удаление из контактов
function removeFromContacts(userId) {
    contacts.delete(userId);
    renderContacts();
}

// Отображение контактов
function renderContacts() {
    const contactsList = document.getElementById('contacts-list');
    contactsList.innerHTML = '';
    
    const sortedContacts = Array.from(contacts.values())
        .sort((a, b) => (a.status === 'connected' ? -1 : 1));
    
    sortedContacts.forEach(contact => {
        const contactDiv = document.createElement('div');
        contactDiv.className = `contact-item ${activeChat === contact.id ? 'active' : ''}`;
        contactDiv.onclick = () => openChat(contact.id);
        
        contactDiv.innerHTML = `
            <span class="contact-status ${contact.status === 'connected' ? 'online' : 'offline'}"></span>
            <div class="contact-details">
                <div class="contact-name">
                    ${contact.username}
                    ${contact.status === 'connected' ? '<span class="connection-status connected">✓</span>' : ''}
                </div>
                <div class="contact-code-small">${contact.userCode}</div>
            </div>
            ${contact.unread > 0 ? `<span class="unread-badge">${contact.unread}</span>` : ''}
        `;
        
        contactsList.appendChild(contactDiv);
    });
}

// Открыть чат
function openChat(userId) {
    activeChat = userId;
    const contact = contacts.get(userId);
    
    if (!contact) return;
    
    // Обнуляем непрочитанные
    contact.unread = 0;
    renderContacts();
    
    // Показываем область чата
    document.getElementById('chatArea').style.display = 'flex';
    
    // Обновляем заголовок
    document.getElementById('contactName').textContent = contact.username;
    document.getElementById('contactCode').textContent = contact.userCode;
    
    const statusDot = document.getElementById('contactStatus');
    statusDot.className = `contact-status ${contact.status === 'connected' ? 'online' : 'offline'}`;
    
    // Загружаем сообщения
    loadMessagesForChat(userId);
    
    // Активируем ввод
    document.getElementById('messageInput').disabled = contact.status !== 'connected';
    document.getElementById('sendBtn').disabled = contact.status !== 'connected';
}

// Загрузка сообщений для чата
function loadMessagesForChat(userId) {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.innerHTML = '';
    
    const chatMessages = messages.get(userId) || [];
    
    chatMessages.forEach(msg => {
        displayMessage(msg, userId);
    });
    
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Отображение сообщения
function displayMessage(message, chatUserId) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    
    const isOwn = message.fromUserId === currentUser.uid;
    messageDiv.className = `message ${isOwn ? 'own' : 'other'}`;
    
    const time = new Date(message.timestamp).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    let statusHtml = '';
    if (isOwn && message.status) {
        statusHtml = `<div class="message-status ${message.status}"></div>`;
    }
    
    messageDiv.innerHTML = `
        <div>${escapeHtml(message.text)}</div>
        <div class="message-time">${time}${statusHtml}</div>
    `;
    
    messagesDiv.appendChild(messageDiv);
}

// Отправка сообщения
function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (!text || !activeChat || !peerConnection) return;
    
    const message = {
        text,
        fromUserId: currentUser.uid,
        toUserId: activeChat,
        timestamp: Date.now(),
        type: 'text'
    };
    
    // Отправляем P2P
    const sent = peerConnection.sendMessage(activeChat, message);
    
    if (sent) {
        // Сохраняем в локальной истории
        if (!messages.has(activeChat)) {
            messages.set(activeChat, []);
        }
        messages.get(activeChat).push({
            ...message,
            status: 'sent'
        });
        
        displayMessage({
            ...message,
            status: 'sent'
        }, activeChat);
        
        input.value = '';
        
        // Прокрутка вниз
        document.getElementById('messages').scrollTop = 
            document.getElementById('messages').scrollHeight;
    } else {
        alert('Соединение не установлено');
    }
}

// Обработка входящего сообщения
function handleIncomingMessage(fromUserId, message) {
    // Сохраняем в истории
    if (!messages.has(fromUserId)) {
        messages.set(fromUserId, []);
    }
    messages.get(fromUserId).push(message);
    
    // Если чат открыт, показываем сообщение
    if (activeChat === fromUserId) {
        displayMessage(message, fromUserId);
        document.getElementById('messages').scrollTop = 
            document.getElementById('messages').scrollHeight;
        
        // Отправляем подтверждение прочтения
        peerConnection.sendReadReceipt(fromUserId, [message.messageId]);
    } else {
        // Увеличиваем счетчик непрочитанных
        const contact = contacts.get(fromUserId);
        if (contact) {
            contact.unread = (contact.unread || 0) + 1;
            renderContacts();
        }
    }
    
    // Показываем уведомление
    const contact = contacts.get(fromUserId);
    if (contact && activeChat !== fromUserId) {
        showNotification(`💬 ${contact.username}: ${message.text}`);
    }
}

// Показ уведомления
function showNotification(text) {
    // Можно реализовать красивое уведомление
    console.log('🔔', text);
}

// Индикатор печатания
document.getElementById('messageInput').addEventListener('input', () => {
    if (activeChat && peerConnection) {
        peerConnection.sendTyping(activeChat, true);
        
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            peerConnection.sendTyping(activeChat, false);
        }, 1000);
    }
});

// Копирование кода
function copyUserCode() {
    const code = document.getElementById('userCodeValue').textContent;
    navigator.clipboard.writeText(code).then(() => {
        alert('Код скопирован!');
    });
}

// Инициализация после входа
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        
        // Получаем данные пользователя
        const userDoc = await db.collection('users').doc(user.uid).get();
        const userData = userDoc.data();
        
        if (userData) {
            // Создаем P2P соединение
            peerConnection = new PeerConnection(user.uid, userData.code, userData.username);
            
            // Добавляем обработчики
            peerConnection.onMessage(handleIncomingMessage);
            peerConnection.onStatusChange((userId, status) => {
                const contact = contacts.get(userId);
                if (contact) {
                    contact.status = status;
                    renderContacts();
                    
                    if (activeChat === userId) {
                        document.getElementById('messageInput').disabled = status !== 'connected';
                        document.getElementById('sendBtn').disabled = status !== 'connected';
                        
                        const statusDot = document.getElementById('contactStatus');
                        statusDot.className = `contact-status ${status === 'connected' ? 'online' : 'offline'}`;
                    }
                }
            });
            
            // Сохраняем ссылку на сигнальный сервер
            window.firebaseSignal = signalServer;
            
            // Начинаем слушать предложения
            await signalServer.listenForOffers();
            
            // Показываем код пользователя
            document.getElementById('userCodeValue').textContent = userData.code;
            
            showChat();
        }
    } else {
        showAuth();
    }
});

// Выход
function logout() {
    if (peerConnection) {
        peerConnection.closeAllConnections();
    }
    auth.signOut();
}

// Показать окно чата
function showChat() {
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('chat-container').style.display = 'flex';
}

// Показать окно авторизации
function showAuth() {
    document.getElementById('auth-container').style.display = 'block';
    document.getElementById('chat-container').style.display = 'none';
}

// Защита от XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
            }
