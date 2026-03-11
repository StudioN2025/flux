// ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ====================
let currentUser = null;

// ==================== ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ====================
function switchTab(tab) {
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    
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
function showNotification(message, type = 'info') {
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
            }
            .notification.success { background: #4caf50; }
            .notification.error { background: #ff6b6b; }
            .notification.info { background: #667eea; }
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    // Удаляем через 3 секунды
    setTimeout(() => {
        notification.remove();
    }, 3000);
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
        
        showNotification(`✅ Регистрация успешна!\nВаш код: ${userCode}`, 'success');
        
        // Очищаем поля
        document.getElementById('register-username').value = '';
        document.getElementById('register-email').value = '';
        document.getElementById('register-password').value = '';
        
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
        document.getElementById('login-email').value = '';
        document.getElementById('login-password').value = '';
        
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
            'info'
        );
        
        // Подставляем email в форму входа
        document.getElementById('login-email').value = userData.email;
        document.getElementById('login-password').focus();
        
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
            // Обновляем статус на офлайн
            await db.collection('users').doc(currentUser.uid).update({
                online: false,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        await auth.signOut();
        showNotification('👋 До свидания!', 'info');
        
    } catch (error) {
        console.error('Ошибка при выходе:', error);
        await auth.signOut();
    }
}

// ==================== ПОКАЗ/СКРЫТИЕ КОНТЕЙНЕРОВ ====================
function showChat() {
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('chat-container').style.display = 'flex';
}

function showAuth() {
    document.getElementById('auth-container').style.display = 'flex';
    document.getElementById('chat-container').style.display = 'none';
}

// ==================== МОБИЛЬНЫЕ ФУНКЦИИ ====================
function toggleMobileMenu() {
    document.querySelector('.sidebar')?.classList.toggle('active');
}

function goBack() {
    document.querySelector('.chat-area')?.classList.remove('active');
}

// ==================== СЛУШАТЕЛЬ СОСТОЯНИЯ АУТЕНТИФИКАЦИИ ====================
auth.onAuthStateChanged(async (user) => {
    console.log('Auth state changed:', user ? 'User logged in' : 'User logged out');
    
    if (user) {
        currentUser = user;
        
        try {
            // Проверяем, есть ли профиль пользователя
            const userDoc = await db.collection('users').doc(user.uid).get();
            
            if (!userDoc.exists) {
                // Создаем профиль, если его нет
                const userCode = generateUserCode();
                await db.collection('users').doc(user.uid).set({
                    username: user.email.split('@')[0],
                    email: user.email,
                    code: userCode,
                    online: true,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastSeen: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                showNotification(`Ваш код: ${userCode}`, 'info');
            } else {
                // Обновляем статус онлайн
                await db.collection('users').doc(user.uid).update({
                    online: true,
                    lastSeen: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Показываем код пользователя
                const userData = userDoc.data();
                document.getElementById('userCodeValue').textContent = userData.code;
            }
            
            showChat();
            showNotification('Добро пожаловать!', 'success');
            
        } catch (error) {
            console.error('Error in auth state change:', error);
            showNotification('Ошибка загрузки профиля', 'error');
        }
        
    } else {
        currentUser = null;
        showAuth();
    }
});

// ==================== ОБРАБОТКА ЗАКРЫТИЯ СТРАНИЦЫ ====================
window.addEventListener('beforeunload', async () => {
    if (currentUser) {
        try {
            await db.collection('users').doc(currentUser.uid).update({
                online: false,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error('Error updating status:', error);
        }
    }
});

// ==================== ЭКСПОРТ ФУНКЦИЙ ====================
window.switchTab = switchTab;
window.register = register;
window.login = login;
window.loginWithCode = loginWithCode;
window.logout = logout;
window.toggleMobileMenu = toggleMobileMenu;
window.goBack = goBack;
