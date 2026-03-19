// ==================== ПРОСТЕЙШАЯ РАБОЧАЯ ВЕРСИЯ ====================

// Глобальные переменные
let currentUser = null;
let contacts = [];
let messages = {};
let activeChat = null;

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
window.addEventListener('load', function() {
    console.log('Страница загружена');
    
    // Показываем форму авторизации
    document.getElementById('auth-container').style.display = 'flex';
    document.getElementById('chat-container').style.display = 'none';
    
    // Привязываем обработчики через onclick (самый надежный способ)
    bindButtons();
});

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
    
    // Кнопка отправки сообщения
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
function showMessage(text, type) {
    console.log(text);
    
    // Удаляем старые уведомления
    document.querySelectorAll('.notification').forEach(el => el.remove());
    
    // Создаем новое
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = text;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 10px;
        color: white;
        z-index: 9999;
        background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#ff6b6b' : '#667eea'};
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => notification.remove(), 3000);
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
    
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    
    if (!username || !email || !password) {
        showMessage('Заполните все поля', 'error');
        return;
    }
    
    try {
        showMessage('Регистрируем...', 'info');
        
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
            createdAt: new Date().toString()
        });
        
        showMessage('✅ Готово! Ваш код: ' + code, 'success');
        
        // Очищаем поля
        document.getElementById('register-username').value = '';
        document.getElementById('register-email').value = '';
        document.getElementById('register-password').value = '';
        
        // Переключаем на вход
        document.getElementById('loginTab').click();
        
    } catch (error) {
        console.error(error);
        showMessage('Ошибка: ' + error.message, 'error');
    }
}

// ==================== ВХОД ====================
async function loginUser() {
    console.log('Вход');
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    if (!email || !password) {
        showMessage('Введите email и пароль', 'error');
        return;
    }
    
    try {
        showMessage('Входим...', 'info');
        await auth.signInWithEmailAndPassword(email, password);
        showMessage('✅ Успешно!', 'success');
        
        document.getElementById('login-email').value = '';
        document.getElementById('login-password').value = '';
        
    } catch (error) {
        console.error(error);
        showMessage('Ошибка: ' + error.message, 'error');
    }
}

// ==================== ВХОД ПО КОДУ ====================
async function loginWithCode() {
    console.log('Вход по коду');
    
    const code = document.getElementById('login-code').value.toUpperCase();
    
    if (!code || code.length !== 12) {
        showMessage('Введите 12-значный код', 'error');
        return;
    }
    
    try {
        showMessage('Ищем...', 'info');
        
        const snapshot = await db.collection('users').where('code', '==', code).get();
        
        if (snapshot.empty) {
            showMessage('Пользователь не найден', 'error');
            return;
        }
        
        const userData = snapshot.docs[0].data();
        showMessage('Найден: ' + userData.email, 'success');
        
        document.getElementById('login-email').value = userData.email;
        document.getElementById('login-password').focus();
        document.getElementById('loginTab').click();
        
    } catch (error) {
        console.error(error);
        showMessage('Ошибка: ' + error.message, 'error');
    }
}

// ==================== ВЫХОД ====================
async function logoutUser() {
    console.log('Выход');
    
    try {
        if (currentUser) {
            await db.collection('users').doc(currentUser.uid).update({
                online: false,
                lastSeen: new Date().toString()
            });
        }
        
        await auth.signOut();
        showMessage('До свидания!', 'info');
        
    } catch (error) {
        console.error(error);
        await auth.signOut();
    }
}

// ==================== ПОИСК ПОЛЬЗОВАТЕЛЯ ====================
async function searchUser() {
    console.log('Поиск');
    
    const code = document.getElementById('searchCode').value.toUpperCase();
    
    if (!code || code.length !== 12) {
        showMessage('Введите 12-значный код', 'error');
        return;
    }
    
    try {
        const snapshot = await db.collection('users').where('code', '==', code).get();
        const resultDiv = document.getElementById('searchResult');
        
        if (snapshot.empty) {
            resultDiv.innerHTML = '<div style="color: red">❌ Не найден</div>';
            resultDiv.style.display = 'block';
            return;
        }
        
        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();
        
        if (userDoc.id === currentUser?.uid) {
            resultDiv.innerHTML = '<div style="color: red">❌ Это вы</div>';
            resultDiv.style.display = 'block';
            return;
        }
        
        resultDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div><b>${userData.username || 'User'}</b></div>
                    <div style="font-size: 12px">${userData.code}</div>
                </div>
                <button onclick="addContact('${userDoc.id}', '${userData.username || 'User'}', '${userData.code}')" 
                        style="background: #4caf50; color: white; border: none; padding: 5px 15px; border-radius: 5px; cursor: pointer">
                    +
                </button>
            </div>
        `;
        resultDiv.style.display = 'block';
        
    } catch (error) {
        console.error(error);
        showMessage('Ошибка поиска', 'error');
    }
}

// ==================== ДОБАВЛЕНИЕ КОНТАКТА ====================
function addContact(id, name, code) {
    console.log('Добавляем контакт:', name);
    
    // Проверяем, есть ли уже
    const exists = contacts.some(c => c.id === id);
    
    if (!exists) {
        contacts.push({
            id: id,
            name: name,
            code: code,
            status: 'offline'
        });
        
        renderContacts();
        showMessage('✅ Контакт добавлен', 'success');
    }
    
    document.getElementById('searchCode').value = '';
    document.getElementById('searchResult').style.display = 'none';
}

// ==================== ОТОБРАЖЕНИЕ КОНТАКТОВ ====================
function renderContacts() {
    const list = document.getElementById('contacts-list');
    
    if (contacts.length === 0) {
        list.innerHTML = '<div style="text-align: center; color: #999; padding: 20px">Нет контактов</div>';
        return;
    }
    
    let html = '';
    contacts.forEach(contact => {
        html += `
            <div class="contact-item" onclick="openChat('${contact.id}')">
                <span class="contact-status ${contact.status}"></span>
                <div style="flex: 1">
                    <div style="font-weight: bold">${contact.name}</div>
                    <div style="font-size: 11px; color: #666">${contact.code}</div>
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
        container.innerHTML = '<div style="text-align: center; color: #999; padding: 20px">Нет сообщений</div>';
        return;
    }
    
    let html = '';
    userMessages.forEach(msg => {
        const isOwn = msg.from === currentUser?.uid;
        html += `
            <div class="message ${isOwn ? 'own' : 'other'}">
                <div>${escapeHtml(msg.text)}</div>
                <div class="message-time">${new Date(msg.time).toLocaleTimeString()}</div>
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
    
    loadMessages(activeChat);
    input.value = '';
}

// ==================== КОПИРОВАНИЕ КОДА ====================
function copyUserCode() {
    const code = document.getElementById('userCodeValue').textContent;
    if (code) {
        navigator.clipboard.writeText(code);
        showMessage('✅ Код скопирован', 'success');
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
    console.log('Статус:', user ? 'Вошёл' : 'Вышел');
    
    if (user) {
        currentUser = user;
        
        // Получаем данные
        const doc = await db.collection('users').doc(user.uid).get();
        
        if (doc.exists) {
            const data = doc.data();
            document.getElementById('userCodeValue').textContent = data.code || '---';
            
            // Добавляем себя
            contacts = [{
                id: user.uid,
                name: data.username || 'Я',
                code: data.code,
                status: 'online'
            }];
        }
        
        // Обновляем статус
        await db.collection('users').doc(user.uid).update({
            online: true,
            lastSeen: new Date().toString()
        });
        
        // Показываем чат
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('chat-container').style.display = 'flex';
        renderContacts();
        
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
