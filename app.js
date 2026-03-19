// ==================== ИСПРАВЛЕННЫЕ ФУНКЦИИ ====================

// Флаг для предотвращения множественных переходов
let isTransitioning = false;

// Принудительное обновление интерфейса
function forceUIRefresh() {
    console.log('Принудительное обновление UI');
    
    const authContainer = document.getElementById('auth-container');
    const chatContainer = document.getElementById('chat-container');
    
    if (authContainer && chatContainer) {
        if (currentUser) {
            authContainer.style.setProperty('display', 'none', 'important');
            chatContainer.style.setProperty('display', 'flex', 'important');
        } else {
            authContainer.style.setProperty('display', 'flex', 'important');
            chatContainer.style.setProperty('display', 'none', 'important');
        }
    }
}

function showChat() {
    console.log('Показываем чат');
    const authContainer = document.getElementById('auth-container');
    const chatContainer = document.getElementById('chat-container');
    
    if (authContainer && chatContainer) {
        // Принудительно меняем стили
        authContainer.style.setProperty('display', 'none', 'important');
        chatContainer.style.setProperty('display', 'flex', 'important');
        
        // Дополнительная проверка
        setTimeout(() => {
            if (chatContainer.style.display !== 'flex') {
                chatContainer.style.display = 'flex';
                authContainer.style.display = 'none';
            }
        }, 100);
    }
}

function showAuth() {
    console.log('Показываем авторизацию');
    const authContainer = document.getElementById('auth-container');
    const chatContainer = document.getElementById('chat-container');
    
    if (authContainer && chatContainer) {
        // Принудительно меняем стили
        authContainer.style.setProperty('display', 'flex', 'important');
        chatContainer.style.setProperty('display', 'none', 'important');
        
        // Дополнительная проверка
        setTimeout(() => {
            if (authContainer.style.display !== 'flex') {
                authContainer.style.display = 'flex';
                chatContainer.style.display = 'none';
            }
        }, 100);
    }
}

// Исправленная регистрация
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
        
        // Принудительно обновляем UI
        setTimeout(forceUIRefresh, 500);
        
    } catch (error) {
        console.error(error);
        showNotification('Ошибка: ' + error.message, 'error');
    }
}

// Исправленный вход
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
        
        // Принудительно обновляем UI
        setTimeout(forceUIRefresh, 500);
        
    } catch (error) {
        console.error(error);
        showNotification('Ошибка: ' + error.message, 'error');
    }
}

// Исправленный слушатель авторизации
auth.onAuthStateChanged(async (user) => {
    console.log('Состояние авторизации:', user ? 'Вошёл' : 'Вышел');
    
    // Предотвращаем множественные переходы
    if (isTransitioning) return;
    isTransitioning = true;
    
    try {
        if (user) {
            currentUser = user;
            
            // Получаем данные пользователя
            const doc = await db.collection('users').doc(user.uid).get();
            
            if (doc.exists) {
                const userData = doc.data();
                const codeElement = document.getElementById('userCodeValue');
                if (codeElement) {
                    codeElement.textContent = userData.code || 'Нет кода';
                }
                
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
            
            // Показываем чат
            showChat();
            renderContacts();
            
        } else {
            currentUser = null;
            contacts.clear();
            messages.clear();
            activeChat = null;
            
            // Показываем авторизацию
            showAuth();
        }
    } catch (error) {
        console.error('Ошибка:', error);
    } finally {
        // Сбрасываем флаг через небольшую задержку
        setTimeout(() => {
            isTransitioning = false;
        }, 500);
    }
});

// Добавляем обработчик видимости страницы
document.addEventListener('visibilitychange', function() {
    if (!document.hidden && currentUser) {
        console.log('Страница снова видима, проверяем состояние');
        forceUIRefresh();
    }
});

// Добавляем проверку при загрузке
window.addEventListener('load', function() {
    setTimeout(() => {
        const authContainer = document.getElementById('auth-container');
        const chatContainer = document.getElementById('chat-container');
        
        if (authContainer && chatContainer) {
            // Если оба скрыты или в неправильном состоянии
            if (authContainer.style.display === 'none' && chatContainer.style.display === 'none') {
                console.log('Исправляем состояние при загрузке');
                if (currentUser) {
                    showChat();
                } else {
                    showAuth();
                }
            }
        }
    }, 1000);
});
