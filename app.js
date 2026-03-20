// ==================== ПРОСТАЯ РАБОЧАЯ ВЕРСИЯ ====================

// Глобальные переменные
let currentUser = null;
let contacts = [];
let messages = {};
let activeChat = null;

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
window.addEventListener('load', function() {
    console.log('Страница загружена');
    
    // Проверяем подключение к Firestore
    checkFirestoreConnection();
    
    // Показываем форму авторизации
    document.getElementById('auth-container').style.display = 'flex';
    document.getElementById('chat-container').style.display = 'none';
    
    // Привязываем обработчики
    bindButtons();
});

// ==================== ПРОВЕРКА FIRESTORE ====================
async function checkFirestoreConnection() {
    try {
        console.log('Проверка Firestore...');
        const testDoc = await db.collection('test').doc('test').get();
        console.log('✅ Firestore подключена!');
    } catch (error) {
        console.error('❌ Firestore НЕ подключена:', error);
        console.log('⚠️ Нужно создать базу данных по ссылке:');
        console.log('https://console.cloud.google.com/datastore/setup?project=flux-messenger-bbf58');
        
        // Показываем сообщение пользователю
        setTimeout(() => {
            showMessage('⚠️ Нужно создать базу данных Firestore в консоли Firebase', 'warning', 8000);
        }, 1000);
    }
}

// ==================== ПРИВЯЗКА КНОПОК ====================
function bindButtons() {
    console.log('Привязка кнопок');
    
    // Вкладки
    document.getElementById('loginTab').onclick = function() {
        document.getElementById('login-form').classList.add('active');
        document.getElementById('register-form').classList.remove('active');
        this.classList.add('active');
        document.getElementById('registerTab').classList.remove('active');
    };
    
    document.getElementById('registerTab').onclick = function() {
        document.getElementById('register-form').classList.add('active');
        document.getElementById('login-form').classList.remove('active');
        this.classList.add('active');
        document.getElementById('loginTab').classList.remove('active');
    };
    
    // Кнопки авторизации
    document.getElementById('registerBtn').onclick = function(e) {
        e.preventDefault();
        registerUser();
    };
    
    document.getElementById('loginBtn').onclick = function(e) {
        e.preventDefault();
        loginUser();
    };
    
    document.getElementById('loginCodeBtn').onclick = function(e) {
        e.preventDefault();
        loginWithCode();
    };
    
    // Кнопка выхода
    document.getElementById('logoutBtn').onclick = function(e) {
        e.preventDefault();
        logoutUser();
    };
    
    // Кнопка поиска
    document.getElementById('searchBtn').onclick = function(e) {
        e.preventDefault();
        searchUser();
    };
    
    // Кнопка отправки
    document.getElementById('sendBtn').onclick = function(e) {
        e.preventDefault();
        sendMessage();
    };
    
    // Копирование кода
    document.getElementById('userCodeDisplay').onclick = function() {
        copyUserCode();
    };
    
    // Поиск по Enter
    document.getElementById('searchCode').onkeypress = function(e) {
        if (e.key === 'Enter') {
            searchUser();
        }
    };
    
    // Отправка по Enter
    document.getElementById('messageInput').onkeypress = function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };
}

// ==================== УВЕДОМЛЕНИЯ ====================
function showMessage(text, type, duration = 4000) {
    console.log('[Уведомление]', text);
    
    // Удаляем старые
    document.querySelectorAll('.notification').forEach(el => el.remove());
    
    // Создаем новое
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = text;
    
    let bgColor = '#667eea';
    if (type === 'success') bgColor = '#4caf50';
    if (type === 'error') bgColor = '#ff6b6b';
    if (type === 'warning') bgColor = '#ffd700';
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 10px;
        color: ${type === 'warning' ? '#333' : 'white'};
        z-index: 9999;
        background: ${bgColor};
        max-width: 300px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
    `;
    
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), duration);
}

// ==================== ГЕНЕРАЦИЯ КОДА ====================
function generateCode() {
    let code = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let i = 0; i < 12; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// ==================== РЕГИСТРАЦИЯ ====================
async function registerUser() {
    console.log('Регистрация');
    
    const username = document.getElementById('register-username').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    
    if (!username || !email || !password) {
        showMessage('❌ Заполните все поля', 'error');
        return;
    }
    
    if (password.length < 6) {
        showMessage('❌ Пароль должен быть минимум 6 символов', 'error');
        return;
    }
    
    try {
        showMessage('📝 Регистрация...', 'info');
        
        // Создаем пользователя
        const result = await auth.createUserWithEmailAndPassword(email, password);
        
        // Генерируем код
        const code = generateCode();
        
        // Сохраняем в Firestore
        await db.collection('users').doc(result.user.uid).set({
            username: username,
            email: email,
            code: code,
            online: true,
            createdAt: new Date().toISOString()
        });
        
        showMessage(`✅ Регистрация успешна!\nВаш код: ${code}`, 'success');
        
        // Очищаем поля
        document.getElementById('register-username').value = '';
        document.getElementById('register-email').value = '';
        document.getElementById('register-password').value = '';
        
        // Переключаем на вход
        document.getElementById('loginTab').click();
        
    } catch (error) {
        console.error(error);
        
        let msg = 'Ошибка: ';
        if (error.code === 'auth/email-already-in-use') {
            msg += 'Этот email уже зарегистрирован';
        } else if (error.code === 'auth/invalid-email') {
            msg += 'Неверный email';
        } else if (error.code === 'auth/weak-password') {
            msg += 'Слишком простой пароль';
        } else {
            msg += error.message;
        }
        
        showMessage(msg, 'error');
    }
}

// ==================== ВХОД ====================
async function loginUser() {
    console.log('Вход');
    
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!email || !password) {
        showMessage('❌ Введите email и пароль', 'error');
        return;
    }
    
    try {
        showMessage('🔐 Вход...', 'info');
        await auth.signInWithEmailAndPassword(email, password);
        showMessage('✅ Вход выполнен!', 'success');
        
        document.getElementById('login-email').value = '';
        document.getElementById('login-password').value = '';
        
    } catch (error) {
        console.error(error);
        
        let msg = 'Ошибка: ';
        if (error.code === 'auth/invalid-login-credentials') {
            msg += 'Неверный email или пароль';
        } else if (error.code === 'auth/user-not-found') {
            msg += 'Пользователь не найден';
        } else {
            msg += error.message;
        }
        
        showMessage(msg, 'error');
    }
}

// ==================== ВХОД ПО КОДУ ====================
async function loginWithCode() {
    console.log('Вход по коду');
    
    const code = document.getElementById('login-code').value.trim().toUpperCase();
    
    if (!code || code.length !== 12) {
        showMessage('❌ Введите 12-значный код', 'error');
        return;
    }
    
    try {
        showMessage('🔍 Поиск...', 'info');
        
        const snapshot = await db.collection('users').where('code', '==', code).get();
        
        if (snapshot.empty) {
            showMessage('❌ Пользователь не найден', 'error');
            return;
        }
        
        const userData = snapshot.docs[0].data();
        showMessage(`✅ Найден: ${userData.email}\nВведите пароль`, 'success');
        
        document.getElementById('login-email').value = userData.email;
        document.getElementById('login-password').focus();
        document.getElementById('loginTab').click();
        
    } catch (error) {
        console.error(error);
        showMessage('❌ Ошибка поиска: ' + error.message, 'error');
    }
}

// ==================== ВЫХОД ====================
async function logoutUser() {
    console.log('Выход');
    
    try {
        if (currentUser) {
            await db.collection('users').doc(currentUser.uid).update({
                online: false,
                lastSeen: new Date().toISOString()
            });
        }
        await auth.signOut();
        showMessage('👋 До свидания!', 'info');
    } catch (error) {
        console.error(error);
        await auth.signOut();
    }
}

// ==================== ПОИСК ПОЛЬЗОВАТЕЛЯ ====================
async function searchUser() {
    console.log('Поиск');
    
    const code = document.getElementById('searchCode').value.trim().toUpperCase();
    
    if (!code || code.length !== 12) {
        showMessage('❌ Введите 12-значный код', 'error');
        return;
    }
    
    try {
        const snapshot = await db.collection('users').where('code', '==', code).get();
        const resultDiv = document.getElementById('searchResult');
        
        if (snapshot.empty) {
            resultDiv.innerHTML = '<div style="color: #ff6b6b; padding: 10px;">❌ Пользователь не найден</div>';
            resultDiv.style.display = 'block';
            setTimeout(() => resultDiv.style.display = 'none', 3000);
            return;
        }
        
        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();
        
        if (userDoc.id === currentUser?.uid) {
            resultDiv.innerHTML = '<div style="color: #ff6b6b; padding: 10px;">❌ Это ваш код</div>';
            resultDiv.style.display = 'block';
            setTimeout(() => resultDiv.style.display = 'none', 3000);
            return;
        }
        
        resultDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px;">
                <div>
                    <div style="font-weight: bold;">${escapeHtml(userData.username || 'Пользователь')}</div>
                    <div style="font-size: 12px; color: #666;">${userData.code}</div>
                    <div style="font-size: 11px; color: ${userData.online ? '#4caf50' : '#999'}">
                        ${userData.online ? '🟢 Онлайн' : '⚫ Офлайн'}
                    </div>
                </div>
                <button onclick="addContact('${userDoc.id}', '${escapeHtml(userData.username || 'Пользователь')}', '${userData.code}')" 
                        style="background: #4caf50; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer;">
                    ➕ Добавить
                </button>
            </div>
        `;
        resultDiv.style.display = 'block';
        
    } catch (error) {
        console.error(error);
        showMessage('❌ Ошибка поиска: ' + error.message, 'error');
    }
}

// ==================== ДОБАВЛЕНИЕ КОНТАКТА ====================
function addContact(id, name, code) {
    console.log('Добавляем контакт:', name);
    
    const exists = contacts.some(c => c.id === id);
    
    if (!exists) {
        contacts.push({
            id: id,
            name: name,
            code: code,
            status: 'offline'
        });
        
        renderContacts();
        showMessage(`✅ ${name} добавлен в контакты`, 'success');
        
        // Сохраняем в localStorage
        localStorage.setItem('flux_contacts', JSON.stringify(contacts));
    } else {
        showMessage('⚠️ Контакт уже есть', 'info');
    }
    
    document.getElementById('searchCode').value = '';
    document.getElementById('searchResult').style.display = 'none';
}

// ==================== ОТОБРАЖЕНИЕ КОНТАКТОВ ====================
function renderContacts() {
    const list = document.getElementById('contacts-list');
    
    if (contacts.length === 0) {
        list.innerHTML = '<div style="text-align: center; color: #999; padding: 40px;">💬 Нет контактов<br><small>Найдите собеседника по коду</small></div>';
        return;
    }
    
    let html = '';
    contacts.forEach(contact => {
        html += `
            <div class="contact-item" onclick="openChat('${contact.id}')">
                <span class="contact-status ${contact.status}"></span>
                <div style="flex: 1">
                    <div class="contact-name">${escapeHtml(contact.name)}</div>
                    <div class="contact-code">${contact.code}</div>
                </div>
            </div>
        `;
    });
    
    list.innerHTML = html;
}

// ==================== ОТКРЫТИЕ ЧАТА ====================
function openChat(userId) {
    console.log('Открываем чат:', userId);
    
    const contact = contacts.find(c => c.id === userId);
    if (!contact) return;
    
    activeChat = userId;
    
    document.getElementById('chatArea').style.display = 'flex';
    document.getElementById('contactName').textContent = contact.name;
    document.getElementById('contactCode').textContent = contact.code;
    document.getElementById('contactStatus').className = 'contact-status ' + contact.status;
    document.getElementById('messageInput').disabled = false;
    document.getElementById('sendBtn').disabled = false;
    
    loadMessages(userId);
}

// ==================== ЗАГРУЗКА СООБЩЕНИЙ ====================
function loadMessages(userId) {
    const container = document.getElementById('messages');
    const userMessages = messages[userId] || [];
    
    if (userMessages.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #999; padding: 40px;">💬 Нет сообщений<br><small>Напишите первое сообщение</small></div>';
        return;
    }
    
    let html = '';
    userMessages.forEach(msg => {
        const isOwn = msg.from === currentUser?.uid;
        const time = new Date(msg.time).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        html += `
            <div class="message ${isOwn ? 'own' : 'other'}">
                <div>${escapeHtml(msg.text)}</div>
                <div class="message-time">${time}</div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

// ==================== ОТПРАВКА СООБЩЕНИЯ ====================
function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (!text || !activeChat) return;
    
    const msg = {
        id: Date.now(),
        text: text,
        from: currentUser?.uid,
        to: activeChat,
        time: Date.now()
    };
    
    if (!messages[activeChat]) {
        messages[activeChat] = [];
    }
    messages[activeChat].push(msg);
    
    // Сохраняем в localStorage
    localStorage.setItem('flux_messages', JSON.stringify(messages));
    
    loadMessages(activeChat);
    input.value = '';
}

// ==================== КОПИРОВАНИЕ КОДА ====================
function copyUserCode() {
    const code = document.getElementById('userCodeValue').textContent;
    if (code && code !== '---') {
        navigator.clipboard.writeText(code);
        showMessage('✅ Код скопирован!', 'success');
    }
}

// ==================== ЗАЩИТА ОТ XSS ====================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== ЗАГРУЗКА СОХРАНЕННЫХ ДАННЫХ ====================
function loadSavedData() {
    try {
        const savedContacts = localStorage.getItem('flux_contacts');
        if (savedContacts) {
            contacts = JSON.parse(savedContacts);
            renderContacts();
        }
        
        const savedMessages = localStorage.getItem('flux_messages');
        if (savedMessages) {
            messages = JSON.parse(savedMessages);
        }
    } catch (e) {
        console.error('Ошибка загрузки:', e);
    }
}

// ==================== СЛУШАТЕЛЬ АВТОРИЗАЦИИ ====================
auth.onAuthStateChanged(async (user) => {
    console.log('Статус:', user ? '✅ ВОШЁЛ' : '❌ ВЫШЕЛ');
    
    if (user) {
        currentUser = user;
        
        try {
            // Получаем данные пользователя
            const doc = await db.collection('users').doc(user.uid).get();
            
            if (doc.exists) {
                const data = doc.data();
                document.getElementById('userCodeValue').textContent = data.code || '---';
                console.log('✅ Код пользователя:', data.code);
            } else {
                // Если нет профиля, создаем
                const code = generateCode();
                await db.collection('users').doc(user.uid).set({
                    username: user.email.split('@')[0],
                    email: user.email,
                    code: code,
                    online: true,
                    createdAt: new Date().toISOString()
                });
                document.getElementById('userCodeValue').textContent = code;
                console.log('✅ Создан новый профиль, код:', code);
            }
            
            // Обновляем статус
            await db.collection('users').doc(user.uid).update({
                online: true,
                lastSeen: new Date().toISOString()
            });
            
            // Загружаем сохраненные контакты
            loadSavedData();
            
            // Показываем чат
            document.getElementById('auth-container').style.display = 'none';
            document.getElementById('chat-container').style.display = 'flex';
            
            console.log('✅ Чат открыт');
            
        } catch (error) {
            console.error('Ошибка:', error);
            showMessage('⚠️ Ошибка загрузки профиля: ' + error.message, 'error');
        }
        
    } else {
        currentUser = null;
        contacts = [];
        messages = {};
        activeChat = null;
        
        // Показываем авторизацию
        document.getElementById('auth-container').style.display = 'flex';
        document.getElementById('chat-container').style.display = 'none';
    }
});

// ==================== ДЕЛАЕМ ФУНКЦИИ ГЛОБАЛЬНЫМИ ====================
window.registerUser = registerUser;
window.loginUser = loginUser;
window.loginWithCode = loginWithCode;
window.logoutUser = logoutUser;
window.searchUser = searchUser;
window.addContact = addContact;
window.openChat = openChat;
window.sendMessage = sendMessage;
window.copyUserCode = copyUserCode;
