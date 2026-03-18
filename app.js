  // ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ====================
let currentUser = null;
let contacts = new Map();
let messages = new Map();
let activeChat = null;
let notificationPermission = false;

// ==================== ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM полностью загружен');
    
    // Принудительно показываем форму авторизации
    showAuth();
    
    // Добавляем стили для уведомлений, если их нет
    addNotificationStyles();
    
    // Добавляем стили для настроек, если их нет
    addSettingsStyles();
    
    // Добавляем обработчики для всех кнопок
    attachEventListeners();
});

// ==================== ПРИНУДИТЕЛЬНАЯ ПРИВЯЗКА ОБРАБОТЧИКОВ ====================
function attachEventListeners() {
    console.log('Привязка обработчиков событий');
    
    // Кнопки авторизации
    const loginBtn = document.querySelector('#login-form .auth-btn:not(.secondary)');
    if (loginBtn) {
        loginBtn.onclick = function(e) {
            e.preventDefault();
            login();
        };
    }
    
    const registerBtn = document.querySelector('#register-form .auth-btn');
    if (registerBtn) {
        registerBtn.onclick = function(e) {
            e.preventDefault();
            register();
        };
    }
    
    const loginWithCodeBtn = document.querySelector('#login-form .secondary');
    if (loginWithCodeBtn) {
        loginWithCodeBtn.onclick = function(e) {
            e.preventDefault();
            loginWithCode();
        };
    }
    
    // Кнопки вкладок
    const loginTab = document.getElementById('loginTab');
    if (loginTab) {
        loginTab.onclick = function() {
            switchTab('login');
        };
    }
    
    const registerTab = document.getElementById('registerTab');
    if (registerTab) {
        registerTab.onclick = function() {
            switchTab('register');
        };
    }
    
    // Кнопка выхода
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = function(e) {
            e.preventDefault();
            logout();
        };
    }
    
    // Кнопка поиска
    const searchBtn = document.querySelector('.search-btn');
    if (searchBtn) {
        searchBtn.onclick = function(e) {
            e.preventDefault();
            findUser();
        };
    }
    
    // Кнопка отправки сообщения
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.onclick = function(e) {
            e.preventDefault();
            sendMessage();
        };
    }
    
    // Кнопка копирования кода
    const userCodeDisplay = document.getElementById('userCodeDisplay');
    if (userCodeDisplay) {
        userCodeDisplay.onclick = function() {
            copyUserCode();
        };
    }
    
    // Мобильное меню
    const menuToggle = document.querySelector('.menu-toggle');
    if (menuToggle) {
        menuToggle.onclick = function() {
            toggleMobileMenu();
        };
    }
    
    // Кнопка назад
    const backBtn = document.querySelector('.back-btn');
    if (backBtn) {
        backBtn.onclick = function() {
            goBack();
        };
    }
    
    // Поле поиска - поиск по Enter
    const searchInput = document.getElementById('searchCode');
    if (searchInput) {
        searchInput.onkeypress = function(e) {
            if (e.key === 'Enter') {
                findUser();
            }
        };
    }
    
    // Поле ввода сообщения - отправка по Enter
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

// ==================== ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ====================
function switchTab(tab) {
    console.log('Переключение вкладки:', tab);
    
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
    console.log('Уведомление:', message, type);
    
    // Удаляем старые уведомления
    const oldNotifications = document.querySelectorAll('.notification');
    oldNotifications.forEach(n => n.remove());
    
    // Создаем уведомление
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
        animation: slideIn 0.3s ease;
        z-index: 10000;
        max-width: 300px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        font-size: 14px;
        line-height: 1.5;
        background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#ff6b6b' : type === 'warning' ? '#ffd700' : '#667eea'};
        ${type === 'warning' ? 'color: #333;' : ''}
    `;
    
    document.body.appendChild(notification);
    
    // Добавляем анимацию, если её нет
    if (!document.querySelector('#notification-keyframes')) {
        const style = document.createElement('style');
        style.id = 'notification-keyframes';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
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
        
        // Генерируем уникальный код
        const userCode = generateUserCode();
        
        // Создаем профиль в Firestore
        await db.collection('users').doc(userCredential.user.uid).set({
            username: username,
            email: email,
            code: userCode,
            online: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        });
        
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
        
        // Очищаем поля
        if (document.getElementById('login-email')) document.getElementById('login-email').value = '';
        if (document.getElementById('login-password')) document.getElementById('login-password').value = '';
        
        // Покажем уведомление после успешного входа
        // Сам переход произойдет в onAuthStateChanged
        
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
    console.log('Выход');
    
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
    console.log('Показываем чат');
    
    const authContainer = document.getElementById('auth-container');
    const chatContainer = document.getElementById('chat-container');
    
    if (authContainer && chatContainer) {
        authContainer.style.display = 'none';
        chatContainer.style.display = 'flex';
        
        // Перепривязываем обработчики для чата
        setTimeout(() => {
            attachChatEventListeners();
        }, 100);
    }
}

function showAuth() {
    console.log('Показываем авторизацию');
    
    const authContainer = document.getElementById('auth-container');
    const chatContainer = document.getElementById('chat-container');
    
    if (authContainer && chatContainer) {
        authContainer.style.display = 'flex';
        chatContainer.style.display = 'none';
        
        // Перепривязываем обработчики для авторизации
        setTimeout(() => {
            attachEventListeners();
        }, 100);
    }
}

// Привязка обработчиков для чата
function attachChatEventListeners() {
    console.log('Привязка обработчиков чата');
    
    // Кнопка выхода
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = function(e) {
            e.preventDefault();
            logout();
        };
    }
    
    // Кнопка поиска
    const searchBtn = document.querySelector('.search-btn');
    if (searchBtn) {
        searchBtn.onclick = function(e) {
            e.preventDefault();
            findUser();
        };
    }
    
    // Кнопка отправки сообщения
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.onclick = function(e) {
            e.preventDefault();
            sendMessage();
        };
    }
    
    // Кнопка копирования кода
    const userCodeDisplay = document.getElementById('userCodeDisplay');
    if (userCodeDisplay) {
        userCodeDisplay.onclick = function() {
            copyUserCode();
        };
    }
    
    // Мобильное меню
    const menuToggle = document.querySelector('.menu-toggle');
    if (menuToggle) {
        menuToggle.onclick = function() {
            toggleMobileMenu();
        };
    }
    
    // Кнопка назад
    const backBtn = document.querySelector('.back-btn');
    if (backBtn) {
        backBtn.onclick = function() {
            goBack();
        };
    }
    
    // Поле поиска
    const searchInput = document.getElementById('searchCode');
    if (searchInput) {
        searchInput.onkeypress = function(e) {
            if (e.key === 'Enter') {
                findUser();
            }
        };
    }
    
    // Поле ввода сообщения
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.onkeypress = function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        };
    }
    
    // Добавляем кнопку настроек
    addSettingsButton();
}

// ==================== МОБИЛЬНЫЕ ФУНКЦИИ ====================
function toggleMobileMenu() {
    console.log('Toggle mobile menu');
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.classList.toggle('active');
    }
}

function goBack() {
    console.log('Go back');
    const chatArea = document.querySelector('.chat-area');
    if (chatArea) {
        chatArea.classList.remove('active');
    }
}

// ==================== ФУНКЦИИ ПОИСКА И КОНТАКТОВ ====================

// Поиск пользователя по коду
async function findUser() {
    console.log('Поиск пользователя');
    
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
                        `<button class="connect-btn" onclick="connectToUser('${userId}', '${escapeHtml(userData.username || 'Пользователь')}', '${userData.code}')">
                            Подключиться
                        </button>` : 
                        '<span class="already-contact">✅ В контактах</span>'
                    }
                </div>
            `;
            searchResult.classList.add('show');
        }
        
    } catch (error) {
        console.error('Ошибка поиска:', error);
        showNotification('Ошибка: ' + error.message, 'error');
    }
}

// Подключение к пользователю
function connectToUser(userId, username, userCode) {
    
