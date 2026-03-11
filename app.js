let currentUser = null;
let messagesRef = null;
let usersRef = null;

// Проверка состояния аутентификации
auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
        showChat();
        loadMessages();
        updateUserStatus('online');
        setupUsersList();
    } else {
        showAuth();
    }
});

// Регистрация
function register() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // Создаем запись о пользователе
            db.collection('users').doc(userCredential.user.uid).set({
                email: email,
                online: true,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });
        })
        .catch((error) => {
            alert('Ошибка регистрации: ' + error.message);
        });
}

// Вход
function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    auth.signInWithEmailAndPassword(email, password)
        .catch((error) => {
            alert('Ошибка входа: ' + error.message);
        });
}

// Выход
function logout() {
    updateUserStatus('offline');
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

// Обновление статуса пользователя
function updateUserStatus(status) {
    if (currentUser) {
        db.collection('users').doc(currentUser.uid).update({
            online: status === 'online',
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
}

// Загрузка сообщений
function loadMessages() {
    messagesRef = db.collection('messages')
        .orderBy('timestamp')
        .limit(100);
    
    messagesRef.onSnapshot((snapshot) => {
        const messagesDiv = document.getElementById('messages');
        messagesDiv.innerHTML = '';
        
        snapshot.forEach((doc) => {
            const message = doc.data();
            displayMessage(message);
        });
        
        // Прокрутка вниз
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
}

// Отображение сообщения
function displayMessage(message) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    
    const isOwn = message.userId === currentUser.uid;
    messageDiv.className = `message ${isOwn ? 'own' : 'other'}`;
    
    const time = message.timestamp ? new Date(message.timestamp.toDate()).toLocaleTimeString() : 'Только что';
    
    messageDiv.innerHTML = `
        <div class="message-info">${message.userEmail}</div>
        <div>${message.text}</div>
        <div class="message-time">${time}</div>
    `;
    
    messagesDiv.appendChild(messageDiv);
}

// Отправка сообщения
function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (text && currentUser) {
        db.collection('messages').add({
            text: text,
            userId: currentUser.uid,
            userEmail: currentUser.email,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        input.value = '';
    }
}

// Отправка по Enter (но не с Shift)
document.getElementById('messageInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Настройка списка пользователей
function setupUsersList() {
    usersRef = db.collection('users').onSnapshot((snapshot) => {
        const usersList = document.getElementById('users-list');
        usersList.innerHTML = '';
        
        snapshot.forEach((doc) => {
            const user = doc.data();
            if (doc.id !== currentUser.uid) {
                const userDiv = document.createElement('div');
                userDiv.className = 'user-item';
                userDiv.innerHTML = `
                    <span class="user-status" style="background: ${user.online ? '#4caf50' : '#9e9e9e'}"></span>
                    <span>${user.email}</span>
                `;
                usersList.appendChild(userDiv);
            }
        });
    });
}

// Очистка при закрытии
window.addEventListener('beforeunload', () => {
    if (usersRef) usersRef();
    if (messagesRef) messagesRef();
    updateUserStatus('offline');
});
