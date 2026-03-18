  // ==================== ПРОСТЕЙШАЯ ВЕРСИЯ ====================

// Глобальные переменные
let currentUser = null;

// Ждем полной загрузки страницы
window.onload = function() {
    console.log('Страница полностью загружена');
    
    // Показываем форму авторизации
    showAuth();
    
    // Добавляем обработчики через 1 секунду
    setTimeout(attachAllHandlers, 1000);
};

// Функция для прикрепления обработчиков ко всем кнопкам
function attachAllHandlers() {
    console.log('Прикрепляем обработчики');
    
    // Вкладки
    const loginTab = document.getElementById('loginTab');
    if (loginTab) {
        loginTab.onclick = function() {
            console.log('Клик по вкладке Вход');
            document.getElementById('login-form').classList.add('active');
            document.getElementById('register-form').classList.remove('active');
            loginTab.classList.add('active');
            document.getElementById('registerTab').classList.remove('active');
        };
    }
    
    const registerTab = document.getElementById('registerTab');
    if (registerTab) {
        registerTab.onclick = function() {
            console.log('Клик по вкладке Регистрация');
            document.getElementById('register-form').classList.add('active');
            document.getElementById('login-form').classList.remove('active');
            registerTab.classList.add('active');
            document.getElementById('loginTab').classList.remove('active');
        };
    }
    
    // Кнопка регистрации
    const registerBtn = document.querySelector('#register-form .auth-btn');
    if (registerBtn) {
        registerBtn.onclick = function(e) {
            e.preventDefault();
            console.log('Клик по кнопке регистрации');
            registerUser();
        };
    }
    
    // Кнопка входа
    const loginBtn = document.querySelector('#login-form .auth-btn:not(.secondary)');
    if (loginBtn) {
        loginBtn.onclick = function(e) {
            e.preventDefault();
            console.log('Клик по кнопке входа');
            loginUser();
        };
    }
    
    // Кнопка входа по коду
    const loginCodeBtn = document.querySelector('#login-form .secondary');
    if (loginCodeBtn) {
        loginCodeBtn.onclick = function(e) {
            e.preventDefault();
            console.log('Клик по кнопке входа по коду');
            loginWithCode();
        };
    }
    
    // Кнопка выхода
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = function(e) {
            e.preventDefault();
            console.log('Клик по кнопке выхода');
            logout();
        };
    }
    
    // Кнопка поиска
    const searchBtn = document.querySelector('.search-btn');
    if (searchBtn) {
        searchBtn.onclick = function(e) {
            e.preventDefault();
            console.log('Клик по кнопке поиска');
            findUser();
        };
    }
    
    // Кнопка отправки сообщения
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.onclick = function(e) {
            e.preventDefault();
            console.log('Клик по кнопке отправки');
            sendMessage();
        };
    }
    
    // Кнопка копирования кода
    const userCodeDisplay = document.getElementById('userCodeDisplay');
    if (userCodeDisplay) {
        userCodeDisplay.onclick = function() {
            console.log('Клик по коду пользователя');
            copyUserCode();
        };
    }
}

// Показать окно авторизации
function showAuth() {
    console.log('Показываем авторизацию');
    const authContainer = document.getElementById('auth-container');
    const chatContainer = document.getElementById('chat-container');
    
    if (authContainer && chatContainer) {
        authContainer.style.display = 'flex';
        chatContainer.style.display = 'none';
    }
}

// Показать окно чата
function showChat() {
    console.log('Показываем чат');
    const authContainer = document.getElementById('auth-container');
    const chatContainer = document.getElementById('chat-container');
    
    if (authContainer && chatContainer) {
        authContainer.style.display = 'none';
        chatContainer.style.display = 'flex';
    }
}

// Регистрация
async function registerUser() {
    console.log('Функция регистрации');
    
    const username = document.getElementById('register-username')?.value;
    const email = document.getElementById('register-email')?.value;
    const password = document.getElementById('register-password')?.value;
    
    alert(`Попытка регистрации:\nИмя: ${username}\nEmail: ${email}`);
    
    if (!username || !email || !password) {
        alert('Заполните все поля');
        return;
    }
    
    try {
        // Создаем пользователя
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        
        // Генерируем код
        const userCode = generateCode();
        
        // Создаем профиль
        await db.collection('users').doc(userCredential.user.uid).set({
            username: username,
            email: email,
            code: userCode,
            online: true,
            createdAt: new Date()
        });
        
        alert('Регистрация успешна! Ваш код: ' + userCode);
        
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
}

// Вход
async function loginUser() {
    console.log('Функция входа');
    
    const email = document.getElementById('login-email')?.value;
    const password = document.getElementById('login-password')?.value;
    
    alert(`Попытка входа: ${email}`);
    
    if (!email || !password) {
        alert('Введите email и пароль');
        return;
    }
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
        alert('Вход выполнен успешно!');
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
}

// Вход по коду
async function loginWithCode() {
    console.log('Функция входа по коду');
    
    const code = document.getElementById('login-code')?.value;
    
    alert('Поиск по коду: ' + code);
    
    if (!code || code.length !== 12) {
        alert('Введите 12-значный код');
        return;
    }
    
    try {
        const snapshot = await db.collection('users').where('code', '==', code).get();
        
        if (snapshot.empty) {
            alert('Пользователь не найден');
            return;
        }
        
        const userData = snapshot.docs[0].data();
        alert('Найден пользователь: ' + userData.email);
        
        // Подставляем email
        document.getElementById('login-email').value = userData.email;
        
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
}

// Выход
async function logout() {
    console.log('Функция выхода');
    
    try {
        await auth.signOut();
        alert('Выход выполнен');
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
}

// Поиск пользователя
async function findUser() {
    console.log('Функция поиска');
    
    const code = document.getElementById('searchCode')?.value;
    alert('Поиск пользователя с кодом: ' + code);
}

// Отправка сообщения
function sendMessage() {
    console.log('Функция отправки сообщения');
    
    const message = document.getElementById('messageInput')?.value;
    alert('Отправка сообщения: ' + message);
    
    // Очищаем поле
    document.getElementById('messageInput').value = '';
}

// Копирование кода
function copyUserCode() {
    console.log('Функция копирования');
    
    const code = document.getElementById('userCodeValue')?.textContent;
    alert('Код скопирован: ' + code);
}

// Генерация кода
function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 12; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Слушаем изменения авторизации
auth.onAuthStateChanged((user) => {
    console.log('Состояние авторизации изменилось:', user ? 'Вошёл' : 'Вышел');
    
    if (user) {
        currentUser = user;
        
        // Получаем данные пользователя
        db.collection('users').doc(user.uid).get().then((doc) => {
            if (doc.exists) {
                const userData = doc.data();
                document.getElementById('userCodeValue').textContent = userData.code || 'Нет кода';
            }
        });
        
        showChat();
        
        // Переприкрепляем обработчики для чата
        setTimeout(attachAllHandlers, 500);
    } else {
        currentUser = null;
        showAuth();
        
        // Переприкрепляем обработчики для авторизации
        setTimeout(attachAllHandlers, 500);
    }
});
