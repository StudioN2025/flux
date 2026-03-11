let currentUser = null;
let messagesRef = null;
let usersRef = null;

// Проверка состояния аутентификации
auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
        console.log('Пользователь вошел:', user.email);
        showChat();
        loadMessages();
        updateUserStatus('online');
        setupUsersList();
    } else {
        console.log('Пользователь вышел');
        showAuth();
    }
});

// Регистрация
function register() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    if (!email || !password) {
        alert('Пожалуйста, заполните все поля');
        return;
    }
    
    if (password.length < 6) {
        alert('Пароль должен быть не менее 6 символов');
        return;
    }
    
    auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // Создаем запись о пользователе
            return db.collection('users').doc(userCredential.user.uid).set({
                email: email,
                online: true,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        })
        .then(() => {
            console.log('Пользователь успешно зарегистрирован');
            document.getElementById('email').value = '';
            document.getElementById('password').value = '';
        })
        .catch((error) => {
            console.error('Ошибка регистрации:', error);
            let errorMessage = 'Ошибка регистрации: ';
            
            switch(error.code) {
                case 'auth/email-already-in-use':
                    errorMessage += 'Этот email уже используется';
                    break;
                case 'auth/invalid-email':
                    errorMessage += 'Неверный формат email';
                    break;
                case 'auth/weak-password':
                    errorMessage += 'Слишком простой пароль';
                    break;
                default:
                    errorMessage += error.message;
            }
            
            alert(errorMessage);
        });
}

// Вход
function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    if (!email || !password) {
        alert('Пожалуйста, заполните все поля');
        return;
    }
    
    auth.signInWithEmailAndPassword(email, password)
        .then(() => {
            console.log('Вход выполнен успешно');
            document.getElementById('email').value = '';
            document.getElementById('password').value = '';
        })
        .catch((error) => {
            console.error('Ошибка входа:', error);
            let errorMessage = 'Ошибка входа: ';
            
            switch(error.code) {
                case 'auth/user-not-found':
                    errorMessage += 'Пользователь не найден';
                    break;
                case 'auth/wrong-password':
                    errorMessage += 'Неверный пароль';
                    break;
                case 'auth/invalid-email':
                    errorMessage += 'Неверный формат email';
                    break;
                default:
                    errorMessage += error.message;
            }
            
            alert(errorMessage);
        });
}

// Выход
function logout() {
    if (currentUser) {
        updateUserStatus('offline')
            .then(() => {
                return auth.signOut();
            })
            .then(() => {
                console.log('Выход выполнен успешно');
            })
            .catch((error) => {
                console.error('Ошибка при выходе:', error);
                // Всё равно пытаемся выйти
                auth.signOut();
            });
    } else {
        auth.signOut();
    }
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
async function updateUserStatus(status) {
    if (currentUser) {
        try {
            await db.collection('users').doc(currentUser.uid).update({
                online: status === 'online',
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error('Ошибка обновления статуса:', error);
        }
    }
}

// Загрузка сообщений
function loadMessages() {
    messagesRef = db.collection('messages')
        .orderBy('timestamp', 'asc')
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
    }, (error) => {
        console.error('Ошибка загрузки сообщений:', error);
    });
}

// Отображение сообщения
function displayMessage(message) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    
    const isOwn = message.userId === currentUser?.uid;
    messageDiv.className = `message ${isOwn ? 'own' : 'other'}`;
    
    let timeString = 'Только что';
    if (message.timestamp) {
        const date = message.timestamp.toDate();
        timeString = date.toLocaleTimeString('ru-RU', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }
    
    messageDiv.innerHTML = `
        <div class="message-info">${message.userEmail || 'Неизвестный пользователь'}</div>
        <div>${escapeHtml(message.text)}</div>
        <div class="message-time">${timeString}</div>
    `;
    
    messagesDiv.appendChild(messageDiv);
}

// Защита от XSS атак
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
        })
        .then(() => {
            input.value = '';
        })
        .catch((error) => {
            console.error('Ошибка отправки сообщения:', error);
            alert('Не удалось отправить сообщение');
        });
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
    usersRef = db.collection('users')
        .orderBy('online', 'desc')
        .orderBy('email')
        .onSnapshot((snapshot) => {
            const usersList = document.getElementById('users-list');
            usersList.innerHTML = '';
            
            snapshot.forEach((doc) => {
                const user = doc.data();
                if (doc.id !== currentUser?.uid) {
                    const userDiv = document.createElement('div');
                    userDiv.className = 'user-item';
                    
                    const lastSeen = user.lastSeen ? 
                        new Date(user.lastSeen.toDate()).toLocaleTimeString() : 
                        'никогда';
                    
                    userDiv.innerHTML = `
                        <span class="user-status" style="background: ${user.online ? '#4caf50' : '#9e9e9e'}"></span>
                        <div style="flex: 1">
                            <div>${user.email}</div>
                            <div style="font-size: 10px; color: #666;">
                                ${user.online ? '🟢 Онлайн' : `🕐 Был(а): ${lastSeen}`}
                            </div>
                        </div>
                    `;
                    usersList.appendChild(userDiv);
                }
            });
            
            // Показываем текущего пользователя первым
            if (currentUser) {
                const currentUserDiv = document.createElement('div');
                currentUserDiv.className = 'user-item';
                currentUserDiv.style.background = '#e3f2fd';
                currentUserDiv.innerHTML = `
                    <span class="user-status" style="background: #4caf50"></span>
                    <div style="flex: 1">
                        <div><strong>${currentUser.email}</strong> (вы)</div>
                        <div style="font-size: 10px; color: #666;">🟢 Онлайн</div>
                    </div>
                `;
                usersList.insertBefore(currentUserDiv, usersList.firstChild);
            }
        }, (error) => {
            console.error('Ошибка загрузки пользователей:', error);
        });
}

// Очистка при закрытии
window.addEventListener('beforeunload', () => {
    if (usersRef && typeof usersRef === 'function') usersRef();
    if (messagesRef && typeof messagesRef === 'function') messagesRef();
    updateUserStatus('offline');
});

// Добавим обработку ошибок сети
window.addEventListener('online', () => {
    console.log('Соединение восстановлено');
    if (currentUser) {
        updateUserStatus('online');
    }
});

window.addEventListener('offline', () => {
    console.log('Соединение потеряно');
});
