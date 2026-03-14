// ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ====================
let currentUser = null;
let peerConnection = null;
let activeChat = null;
let contacts = new Map();
let messages = new Map();
let typingTimeout = null;
let unreadMessages = new Map();
let onlineStatusInterval = null;
let notificationPermission = false;

// ==================== ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ====================
function switchTab(tab) {
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    
    if (loginTab && registerTab && loginForm && registerForm) {
        if (tab === 'login') {
            loginTab.classList.add('active');
            registerTab.classList.remove('active');
            loginForm.classList.add('active');
            registerForm.classList.remove('active');
        } else {
            registerTab.classList.add('active');
            loginTab.classList.remove('active');
            registerForm.classList.add('active');
            loginForm.classList.remove('active');
        }
    }
}

// ==================== ФУНКЦИИ АВТОРИЗАЦИИ ====================

// Генерация 12-значного кода
function generateUserCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 12; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Валидация email
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Показать уведомление
function showNotification(message, type = 'info', duration = 3000) {
    // Удаляем старые уведомления
    const oldNotifications = document.querySelectorAll('.notification');
    oldNotifications.forEach(n => n.remove());
    
    // Создаем уведомление
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // Добавляем стили, если их нет
    if (!document.querySelector('#notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 20px;
                border-radius: 10px;
                color: white;
                animation: slideIn 0.3s ease;
                z-index: 10000;
                max-width: 300px;
                box-shadow: 0 5px 15px rgba(0,0,0,0.2);
                font-size: 14px;
                line-height: 1.5;
            }
            .notification.success { background: #4caf50; }
            .notification.error { background: #ff6b6b; }
            .notification.info { background: #667eea; }
            .notification.warning { background: #ffd700; color: #333; }
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    // Удаляем через указанное время
    setTimeout(() => {
        notification.remove();
    }, duration);
}

// ==================== РЕГИСТРАЦИЯ ====================
async function register() {
    console.log('Регистрация начата');
    
    const username = document.getElementById('register-username')?.value.trim();
    const email = document.getElementById('register-email')?.value.trim();
    const password = document.getElementById('register-password')?.value;
    
    console.log('Получены данные:', { username, email, password: '***' });
    
    // Валидация
    if (!username || !email || !password) {
        showNotification('Пожалуйста, заполните все поля', 'error');
        return;
    }
    
    if (username.length < 2) {
        showNotification('Имя должно быть не менее 2 символов', 'error');
        return;
    }
    
    if (!isValidEmail(email)) {
        showNotification('Введите корректный email', 'error');
        return;
    }
    
    if (password.length < 6) {
        showNotification('Пароль должен быть не менее 6 символов', 'error');
        return;
    }
    
    try {
        showNotification('Регистрация...', 'info');
        
        // Создаем пользователя в Firebase Auth
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        console.log('Пользователь создан в Auth:', userCredential.user.uid);
        
        // Генерируем уникальный код
        const userCode = generateUserCode();
        console.log('Сгенерирован код:', userCode);
        
        // Создаем профиль в Firestore
        await db.collection('users').doc(userCredential.user.uid).set({
            username: username,
            email: email,
            code: userCode,
            online: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('Профиль создан в Firestore');
        
        showNotification(`✅ Регистрация успешна!\nВаш код: ${userCode}`, 'success', 5000);
        
        // Очищаем поля
        if (document.getElementById('register-username')) document.getElementById('register-username').value = '';
        if (document.getElementById('register-email')) document.getElementById('register-email').value = '';
        if (document.getElementById('register-password')) document.getElementById('register-password').value = '';
        
        // Переключаем на вкладку входа
        switchTab('login');
        
    } catch (error) {
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
                errorMessage += 'Пароль должен быть не менее 6 символов';
                break;
            default:
                errorMessage += error.message;
        }
        
        showNotification(errorMessage, 'error');
    }
}

// ==================== ВХОД ====================
async function login() {
    console.log('Вход начат');
    
    const email = document.getElementById('login-email')?.value.trim();
    const password = document.getElementById('login-password')?.value;
    
    if (!email || !password) {
        showNotification('Введите email и пароль', 'error');
        return;
    }
    
    try {
        showNotification('Вход...', 'info');
        
        await auth.signInWithEmailAndPassword(email, password);
        
        console.log('Вход выполнен успешно');
        showNotification('✅ Вход выполнен!', 'success');
        
        // Очищаем поля
        if (document.getElementById('login-email')) document.getElementById('login-email').value = '';
        if (document.getElementById('login-password')) document.getElementById('login-password').value = '';
        
    } catch (error) {
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
            case 'auth/too-many-requests':
                errorMessage += 'Слишком много попыток. Попробуйте позже';
                break;
            default:
                errorMessage += error.message;
        }
        
        showNotification(errorMessage, 'error');
    }
}

// ==================== ВХОД ПО КОДУ ====================
async function loginWithCode() {
    console.log('Вход по коду начат');
    
    const code = document.getElementById('login-code')?.value.trim().toUpperCase();
    
    if (!code || code.length !== 12) {
        showNotification('Введите 12-значный код', 'error');
        return;
    }
    
    try {
        showNotification('🔍 Поиск пользователя...', 'info');
        
        // Ищем пользователя по коду
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('code', '==', code).get();
        
        if (snapshot.empty) {
            showNotification('❌ Пользователь с таким кодом не найден', 'error');
            return;
        }
        
        const userData = snapshot.docs[0].data();
        
        showNotification(
            `✅ Найден пользователь: ${userData.username}\n` +
            `Используйте email и пароль для входа`,
            'info', 5000
        );
        
        // Подставляем email в форму входа
        if (document.getElementById('login-email')) {
            document.getElementById('login-email').value = userData.email;
        }
        if (document.getElementById('login-password')) {
            document.getElementById('login-password').focus();
        }
        
        // Переключаем на вкладку входа
        switchTab('login');
        
    } catch (error) {
        console.error('Ошибка поиска:', error);
        showNotification('Ошибка: ' + error.message, 'error');
    }
}

// ==================== ВЫХОД ====================
async function logout() {
    try {
        if (currentUser) {
            showNotification('Выход...', 'info');
            
            // Обновляем статус на офлайн
            await db.collection('users').doc(currentUser.uid).update({
                online: false,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        await auth.signOut();
        
        // Очищаем данные
        currentUser = null;
        contacts.clear();
        messages.clear();
        activeChat = null;
        
        showNotification('👋 До свидания!', 'info');
        
    } catch (error) {
        console.error('Ошибка при выходе:', error);
        await auth.signOut();
    }
}

// ==================== ПОКАЗ/СКРЫТИЕ КОНТЕЙНЕРОВ ====================
function showChat() {
    const authContainer = document.getElementById('auth-container');
    const chatContainer = document.getElementById('chat-container');
    
    if (authContainer && chatContainer) {
        authContainer.style.display = 'none';
        chatContainer.style.display = 'flex';
        console.log('Показан чат');
    }
}

function showAuth() {
    const authContainer = document.getElementById('auth-container');
    const chatContainer = document.getElementById('chat-container');
    
    if (authContainer && chatContainer) {
        authContainer.style.display = 'flex';
        chatContainer.style.display = 'none';
        console.log('Показана авторизация');
    }
}

// ==================== МОБИЛЬНЫЕ ФУНКЦИИ ====================
function toggleMobileMenu() {
    document.querySelector('.sidebar')?.classList.toggle('active');
}

function goBack() {
    document.querySelector('.chat-area')?.classList.remove('active');
}

// ==================== ФУНКЦИИ НАСТРОЕК ПРОФИЛЯ ====================

// Показать модальное окно настроек
function showProfileSettings() {
    // Создаем затемнение
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.id = 'settings-overlay';
    
    // Получаем текущие данные пользователя
    const currentUsername = document.querySelector('.user-code')?.getAttribute('data-username') || 'Пользователь';
    
    // Создаем модальное окно
    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog settings-dialog';
    dialog.innerHTML = `
        <h3>⚙️ Настройки профиля</h3>
        <div class="settings-form">
            <div class="settings-field">
                <label>Ваше имя</label>
                <input type="text" id="settings-username" value="${escapeHtml(currentUsername)}" placeholder="Введите имя" class="settings-input">
            </div>
            <div class="settings-field">
                <label>Ваш код</label>
                <div class="settings-code-display">
                    <span id="settings-code">${document.getElementById('userCodeValue')?.textContent || ''}</span>
                    <button onclick="copySettingsCode()" class="settings-copy-btn">📋</button>
                </div>
            </div>
        </div>
        <div class="dialog-buttons">
            <button class="btn-cancel" onclick="closeSettings()">Отмена</button>
            <button class="btn-confirm" onclick="saveProfileSettings()">Сохранить</button>
        </div>
    `;
    
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    // Добавляем стили для настроек
    if (!document.querySelector('#settings-styles')) {
        const style = document.createElement('style');
        style.id = 'settings-styles';
        style.textContent = `
            .settings-dialog {
                max-width: 400px;
                width: 90%;
            }
            .settings-form {
                margin: 20px 0;
            }
            .settings-field {
                margin-bottom: 20px;
                text-align: left;
            }
            .settings-field label {
                display: block;
                margin-bottom: 8px;
                color: var(--text-dark);
                font-weight: 500;
                font-size: 14px;
            }
            .settings-input {
                width: 100%;
                padding: 12px 15px;
                border: 2px solid var(--border-color);
                border-radius: 8px;
                font-size: 14px;
                transition: all 0.3s ease;
                background: var(--bg-white);
                color: var(--text-dark);
            }
            .settings-input:focus {
                outline: none;
                border-color: var(--primary-color);
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            }
            .settings-code-display {
                display: flex;
                gap: 10px;
                align-items: center;
                background: var(--bg-light);
                padding: 10px 15px;
                border-radius: 8px;
                border: 1px solid var(--border-color);
            }
            .settings-code-display span {
                flex: 1;
                font-family: monospace;
                font-size: 18px;
                letter-spacing: 2px;
                color: var(--primary-color);
            }
            .settings-copy-btn {
                background: var(--primary-color);
                color: white;
                border: none;
                border-radius: 6px;
                padding: 8px 12px;
                cursor: pointer;
                transition: all 0.3s ease;
                font-size: 14px;
            }
            .settings-copy-btn:hover {
                background: var(--primary-dark);
                transform: translateY(-2px);
            }
            @media (prefers-color-scheme: dark) {
                .settings-code-display {
                    background: #2d2d2d;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

// Закрыть настройки
function closeSettings() {
    const overlay = document.getElementById('settings-overlay');
    if (overlay) {
        overlay.remove();
    }
}

// Сохранить настройки профиля
async function saveProfileSettings() {
    const newUsername = document.getElementById('settings-username')?.value.trim();
    
    if (!newUsername) {
        showNotification('Введите имя', 'error');
        return;
    }
    
    if (newUsername.length < 2) {
        showNotification('Имя должно быть не менее 2 символов', 'error');
        return;
    }
    
    try {
        showNotification('Сохранение...', 'info');
        
        // Обновляем в Firestore
        await db.collection('users').doc(currentUser.uid).update({
            username: newUsername
        });
        
        // Обновляем в локальных данных
        if (currentUser) {
            // Обновляем в контактах если есть
            const contact = contacts.get(currentUser.uid);
            if (contact) {
                contact.username = newUsername;
            }
        }
        
        // Обновляем отображение в шапке
        const userCodeDisplay = document.querySelector('.user-code');
        if (userCodeDisplay) {
            userCodeDisplay.setAttribute('data-username', newUsername);
            // Можно добавить отображение имени где-то еще
        }
        
        showNotification('✅ Имя успешно изменено', 'success');
        closeSettings();
        
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        showNotification('Ошибка при сохранении', 'error');
    }
}

// Копировать код в настройках
function copySettingsCode() {
    const code = document.getElementById('settings-code')?.textContent;
    if (code) {
        navigator.clipboard.writeText(code).then(() => {
            showNotification('📋 Код скопирован!', 'success');
        }).catch(() => {
            showNotification('❌ Ошибка копирования', 'error');
        });
    }
}

// ==================== ФУНКЦИИ ПОИСКА И КОНТАКТОВ ====================

// Поиск пользователя по коду
async function findUser() {
    const code = document.getElementById('searchCode')?.value.trim().toUpperCase();
    
    if (!code || code.length !== 12) {
        showNotification('Введите 12-значный код', 'error');
        return;
    }
    
    try {
        showNotification('🔍 Поиск...', 'info');
        
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('code', '==', code).get();
        
        const searchResult = document.getElementById('searchResult');
        
        if (snapshot.empty) {
            if (searchResult) {
                searchResult.innerHTML = '<div class="not-found">❌ Пользователь не найден</div>';
                searchResult.classList.add('show');
            }
            return;
        }
        
        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();
        const userId = userDoc.id;
        
        // Проверяем, не ищем ли мы сами себя
        if (userId === currentUser?.uid) {
            if (searchResult) {
                searchResult.innerHTML = '<div class="not-found">❌ Это ваш код</div>';
                searchResult.classList.add('show');
            }
            return;
        }
        
        // Проверяем, уже в контактах
        const isInContacts = contacts.has(userId);
        
        if (searchResult) {
            searchResult.innerHTML = `
                <div class="found-user">
                    <div class="found-user-info">
                        <span class="found-user-name">${escapeHtml(userData.username || 'Пользователь')}</span>
                        <span class="found-user-code">${userData.code}</span>
                        <span class="contact-status ${userData.online ? 'online' : 'offline'}"></span>
                    </div>
                    ${!isInContacts ? 
                        `<button onclick="connectToUser('${userId}', '${escapeHtml(userData.username || 'Пользователь')}', '${userData.code}')" class="connect-btn">
                            Подключиться
                        </button>` : 
                        '<span class="already-contact">✅ В контактах</span>'
 
