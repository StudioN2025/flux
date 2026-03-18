// ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ====================
let currentUser = null;
let contacts = new Map();
let messages = new Map();
let activeChat = null;

// ==================== ИНИЦИАЛИЗАЦИЯ ПОСЛЕ ЗАГРУЗКИ ====================
window.addEventListener('load', function() {
    console.log('Страница загружена');
    
    // Показываем форму авторизации
    showAuth();
    
    // Привязываем обработчики
    bindEvents();
});

// ==================== ПРИВЯЗКА СОБЫТИЙ ====================
function bindEvents() {
    console.log('Привязка событий');
    
    // Вкладки
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    
    if (loginTab) {
        loginTab.onclick = function() {
            console.log('Переключение на вход');
            document.getElementById('login-form').classList.add('active');
            document.getElementById('register-form').classList.remove('active');
            loginTab.classList.add('active');
            registerTab.classList.remove('active');
        };
    }
    
    if (registerTab) {
        registerTab.onclick = function() {
            console.log('Переключение на регистрацию');
            document.getElementById('register-form').classList.add('active');
            document.getElementById('login-form').classList.remove('active');
            registerTab.classList.add('active');
            loginTab.classList.remove('active');
        };
    }
    
    // Кнопка регистрации
    const registerBtn = document.getElementById('registerBtn');
    if (registerBtn) {
        registerBtn.onclick = function(e) {
            e.preventDefault();
            register();
        };
    }
    
    // Кнопка входа
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.onclick = function(e) {
            e.preventDefault();
            login();
        };
    }
    
    // Кнопка входа по коду
    const loginCodeBtn = document.getElementById('loginCodeBtn');
    if (loginCodeBtn) {
        loginCodeBtn.onclick = function(e) {
            e.preventDefault();
            loginWithCode();
        };
    }
    
    // Кнопка выхода
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = function(e) {
            e.preventDefault();
            logout();
        };
    }
    
    // Кнопка поиска
    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
        searchBtn.onclick = function(e) {
            e.preventDefault();
            findUser();
        };
    }
    
    // Кнопка отправки
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.onclick = function(e) {
            e.preventDefault();
            sendMessage();
        };
    }
    
    // Копирование кода
    const userCodeDisplay = document.getElementById('userCodeDisplay');
    if (userCodeDisplay) {
        userCodeDisplay.onclick = function() {
            copyUserCode();
        };
    }
    
    // Поиск по Enter
    const searchInput = document.getElementById('searchCode');
    if (searchInput) {
        searchInput.onkeypress = function(e) {
            if (e.key === 'Enter') {
                findUser();
            }
        };
    }
    
    // Отправка по Enter
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.onkeypress = function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        };
    }
}

// ==================== ФУНКЦИИ ОТОБРАЖЕНИЯ ====================
function showAuth() {
    console.log('Показываем авторизацию');
    document.getElementById('auth-container').style.display = 'flex';
    document.getElementById('chat-container').style.display = 'none';
}

function showChat() {
    console.log('Показываем чат');
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('chat-container').style.display = 'flex';
}

// ==================== УВЕДОМЛЕНИЯ ====================
function showNotification(message, type = 'info') {
    console.log('Уведомление:', message);
    
    // Удаляем старые
    document.querySelectorAll('.notification').forEach(n => n.remove());
    
    // Создаем новое
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 10px;
        color: white;
        z-index: 1000;
        max-width: 300px;
        background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#ff6b6b' : '#667eea'};
    `;
    
    document.body.appendChild(notification);
    
    // Удаляем через 3 секунды
    setTimeout(() => notification.remove(), 3000);
}

// ==================== ГЕНЕРАЦИЯ КОДА ====================
function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 12; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// ==================== РЕГИСТРАЦИЯ ====================
async function register() {
    console.log('Регистрация');
    
    const username = document.getElementById('register-username').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    
    if (!username || !email || !password) {
        showNotification('Заполните все поля', 'error');
        return;
    }
    
    if (password.length < 6) {
        showNotification('Пароль должен быть минимум 6 символов', 'error');
        return;
    }
    
    try {
        showNotification('Регистрация...', 'info');
        
        // Создаем пользователя
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        
        // Генерируем код
        const code = generateCode();
        
        // Создаем профиль
        await db.collection('users').doc(userCredential.user.uid).set({
            username: username,
            email: email,
            code: code,
            online: true,
            createdAt: new Date().toISOString()
        });
        
        showNotification('✅ Регистрация успешна! Ваш код: ' + code, 'success');
        
        // Очищаем поля
        document.getElementById('register-username').value = '';
        document.getElementById('register-email').value = '';
        document.getElementById('register-password').value = '';
        
        // Переключаем на вход
        document.getElementById('loginTab').click();
        
    } catch (error) {
        console.error(error);
        showNotification('Ошибка: ' + error.message, 'error');
    }
}

// ==================== ВХОД ====================
async function login() {
    console.log('Вход');
    
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!email || !password) {
        showNotification('Введите email и пароль', 'error');
        return;
    }
    
    try {
        showNotification('Вход...', 'info');
        await auth.signInWithEmailAndPassword(email, password);
        showNotification('✅ Вход выполнен!', 'success');
        
        // Очищаем поля
        document.getElementById('login-email').value = '';
        document.getElementById('login-password').value = '';
        
    } catch (error) {
        console.error(error);
        showNotification('Ошибка: ' + error.message, 'error');
    }
}

// ==================== ВХОД ПО КОДУ ====================
async function loginWithCode() {
    console.log('Вход по коду');
    
    const code = document.getElementById('login-code').value.trim().toUpperCase();
    
    if (!code || code.length !== 12) {
        showNotification('Введите 12-значный код', 'error');
        return;
    }
    
    try {
        showNotification('Поиск...', 'info');
        
        const snapshot = await db.collection('users').where('code', '==', code).get();
        
        if (snapshot.empty) {
            showNotification('Пользователь не найден', 'error');
            return;
        }
        
        const userData = snapshot.docs[0].data();
        showNotification('Найден: ' + userData.email, 'success');
        
        // Подставляем email
        document.getElementById('login-email').value = userData.email;
        document.getElementById('login-password').focus();
        
        // Переключаем на вход
        document.getElementById('loginTab').click();
        
    } catch (error) {
        console.error(error);
        showNotification('Ошибка: ' + error.message, 'error');
    }
}

// ==================== ВЫХОД ====================
async function logout() {
    console.log('Выход');
    
    try {
        if (currentUser) {
            await db.collection('users').doc(currentUser.uid).update({
                online: false,
                lastSeen: new Date().toISOString()
            });
        }
        
        await auth.signOut();
        showNotification('До свидания!', 'info');
        
    } catch (error) {
        console.error(error);
        await auth.signOut();
    }
}

// ==================== ПОИСК ПОЛЬЗОВАТЕЛЯ ====================
async function findUser() {
    console.log('Поиск');
    
    const code = document.getElementById('searchCode').value.trim().toUpperCase();
    
    if (!code || code.length !== 12) {
        showNotification('Введите 12-значный код', 'error');
        return;
    }
    
    try {
        const snapshot = await db.collection('users').where('code', '==', code).get();
        const resultDiv = document.getElementById('searchResult');
        
        if (snapshot.empty) {
            resultDiv.innerHTML = '<div style="color: #ff6b6b">❌ Пользователь не найден</div>';
            resultDiv.style.display = 'block';
            return;
        }
        
        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();
        
        if (userDoc.id === currentUser?.uid) {
            resultDiv.innerHTML = '<div style="color: #ff6b6b">❌ Это ваш код</div>';
            resultDiv.style.display = 'block';
            return;
        }
        
        resultDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: bold">${userData.username || 'Пользователь'}</div>
                    <div style="font-size: 12px; color: #666">${userData.code}</div>
                </div>
                <button onclick="addContact('${userDoc.id}', '${userData.username || 'Пользователь'}', '${userData.code}')" 
                        style="background: #4caf50; color: white; border: none; padding: 5px 15px; border-radius: 5px; cursor: pointer">
                    Добавить
                </button>
            </div>
        `;
        resultDiv.style.display = 'block';
        
    } catch (error) {
        console.error(error);
        showNotification('Ошибка поиска', 'error');
    }
}

// ==================== ДОБАВЛЕНИЕ КОНТАКТА ====================
function addContact(userId, username, code) {
    console.log('Добавление контакта:', username);
    
    if (!contacts.has(userId)) {
        contacts.set(userId, {
            id: userId,
            username: username,
            code: code,
            status: 'offline',
            unread: 0
        });
        renderContacts();
        showNotification('✅ Контакт добавлен', 'success');
    }
    
    document.getElementById('searchCode').value = '';
    document.getElementById('searchResult').style.display = 'none';
}

// ==================== ОТОБРАЖЕНИЕ КОНТАКТОВ ====================
function renderContacts() {
    const list = document.getElementById('contacts-list');
    
    if (contacts.size === 0) {
        list.innerHTML = '<div class="empty-state">Нет контактов</div>';
        return;
    }
    
    list.innerHTML = '';
    
    contacts.forEach(contact => {
        const div = document.createElement('div');
        div.className = 'contact-item';
        div.onclick = () => openChat(contact.id);
        
        div.innerHTML = `
            <span class="contact-status ${contact.status}"></span>
            <div style="flex: 1">
                <div class="contact-name">${contact.username}</div>
                <div class="contact-code">${contact.code}</div>
            </div>
            ${contact.unread > 0 ? `<span style="background: #667eea; color: white; border-radius: 50%; padding: 2px 8px; margin-left: 5px">${contact.unread}</span>` : ''}
        `;
        
        list.appendChild(div);
    });
}

// ==================== ОТКРЫТИЕ ЧАТА ====================
function openChat(userId) {
    console.log('Открытие чата:', userId);
    
    const contact = contacts.get(userId);
    if (!contact) return;
    
    activeChat = userId;
    contact.unread = 0;
    
    // Показываем область чата
    document.getElementById('chatArea').style.display = 'flex';
    
    // Обновляем заголовок
    document.getElementById('contactName').textContent = contact.username;
    document.getElementById('contactCode').textContent = contact.code;
    document.getElementById('contactStatus').className = `contact-status ${contact.status}`;
    
    // Активируем ввод
    document.getElementById('messageInput').disabled = false;
    document.getElementById('sendBtn').disabled = false;
    
    // Загружаем сообщения
    loadMessages(userId);
}

// ==================== ЗАГРУЗКА СООБЩЕНИЙ ====================
function loadMessages(userId) {
    const messagesDiv = document.getElementById('messages');
    const chatMessages = messages.get(userId) || [];
    
    if (chatMessages.length === 0) {
        messagesDiv.innerHTML = '<div class="empty-state">Нет сообщений</div>';
        return;
    }
    
    messagesDiv.innerHTML = '';
    
    chatMessages.forEach(msg => {
        const div = document.createElement('div');
        div.className = `message ${msg.from === currentUser?.uid ? 'own' : 'other'}`;
        
        const time = new Date(msg.time).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        div.innerHTML = `
            <div>${escapeHtml(msg.text)}</div>
            <div class="message-time">${time}</div>
        `;
        
        messagesDiv.appendChild(div);
    });
    
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ==================== ОТПРАВКА СООБЩЕНИЯ ====================
function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (!text || !activeChat) return;
    
    const message = {
        id: Date.now(),
        text: text,
        from: currentUser?.uid,
        to: activeChat,
        time: Date.now()
    };
    
    // Сохраняем
    if (!messages.has(activeChat)) {
        messages.set(activeChat, []);
    }
    messages.get(activeChat).push(message);
    
    // Отображаем
    loadMessages(activeChat);
    
    // Очищаем
    input.value = '';
}

// ==================== КОПИРОВАНИЕ КОДА ====================
function copyUserCode() {
    const code = document.getElementById('userCodeValue').textContent;
    if (code) {
        navigator.clipboard.writeText(code).then(() => {
            showNotification('📋 Код скопирован!', 'success');
        });
    }
}

// ==================== ЗАЩИТА ОТ XSS ====================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== СЛУШАТЕЛЬ АВТОРИЗАЦИИ ====================
auth.onAuthStateChanged(async (user) => {
    console.log('Состояние авторизации:', user ? 'Вошёл' : 'Вышел');
    
    if (user) {
        currentUser = user;
        
        // Получаем данные пользователя
        const doc = await db.collection('users').doc(user.uid).get();
        
        if (doc.exists) {
            const userData = doc.data();
            document.getElementById('userCodeValue').textContent = userData.code || 'Нет кода';
            
            // Добавляем себя в контакты
            contacts.set(user.uid, {
                id: user.uid,
                username: userData.username || 'Я',
                code: userData.code,
                status: 'online',
                unread: 0
            });
        }
        
        // Обновляем статус
        await db.collection('users').doc(user.uid).update({
            online: true,
            lastSeen: new Date().toISOString()
        });
        
        showChat();
        renderContacts();
        
    } else {
        currentUser = null;
        contacts.clear();
        messages.clear();
        activeChat = null;
        showAuth();
    }
});
