import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { getFirestore, collection, addDoc, query, where, getDocs, updateDoc, doc, onSnapshot, orderBy, serverTimestamp, deleteDoc, setDoc } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';

// Firebase конфигурация
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Криптографические функции
class CryptoManager {
    constructor() {
        this.encoder = new TextEncoder();
        this.decoder = new TextDecoder();
    }
    
    // Генерация ключа из пароля
    async deriveKey(password, salt) {
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            this.encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        
        return await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }
    
    // Генерация случайного соли
    generateSalt() {
        return crypto.getRandomValues(new Uint8Array(16));
    }
    
    // Генерация случайного IV
    generateIV() {
        return crypto.getRandomValues(new Uint8Array(12));
    }
    
    // Шифрование текста
    async encryptText(text, key) {
        const iv = this.generateIV();
        const encodedData = this.encoder.encode(text);
        
        const encryptedData = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            encodedData
        );
        
        return {
            data: Array.from(new Uint8Array(encryptedData)),
            iv: Array.from(iv)
        };
    }
    
    // Дешифрование текста
    async decryptText(encryptedObj, key) {
        const iv = new Uint8Array(encryptedObj.iv);
        const data = new Uint8Array(encryptedObj.data);
        
        const decryptedData = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            data
        );
        
        return this.decoder.decode(decryptedData);
    }
    
    // Шифрование файла в текст (base64)
    async encryptFileToText(file, key) {
        const iv = this.generateIV();
        const fileBuffer = await file.arrayBuffer();
        
        const encryptedData = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            fileBuffer
        );
        
        // Конвертируем в base64 для передачи как текст
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(encryptedData)));
        
        return {
            data: base64Data,
            iv: Array.from(iv),
            name: file.name,
            type: file.type,
            size: file.size
        };
    }
    
    // Дешифрование файла из текста
    async decryptFileFromText(encryptedObj, key) {
        const iv = new Uint8Array(encryptedObj.iv);
        const encryptedData = Uint8Array.from(atob(encryptedObj.data), c => c.charCodeAt(0));
        
        const decryptedData = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            encryptedData
        );
        
        return {
            data: decryptedData,
            name: encryptedObj.name,
            type: encryptedObj.type,
            size: encryptedObj.size
        };
    }
    
    // Создание общего ключа для чата (на основе паролей пользователей)
    async createSharedKey(userPassword, otherUserPassword, salt) {
        const userKey = await this.deriveKey(userPassword, salt);
        const otherKey = await this.deriveKey(otherUserPassword, salt);
        
        // Комбинируем ключи для создания общего ключа
        const combinedKey = await crypto.subtle.deriveKey(
            {
                name: 'HKDF',
                hash: 'SHA-256',
                salt: salt,
                info: this.encoder.encode('flux-chat-key')
            },
            await crypto.subtle.importKey(
                'raw',
                await crypto.subtle.exportKey('raw', userKey),
                { name: 'HKDF' },
                false,
                ['deriveKey']
            ),
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
        
        return combinedKey;
    }
}

// Состояние приложения
let currentUser = null;
let currentChat = null;
let users = new Map();
let messagesListener = null;
let peerConnections = new Map();
let dataChannels = new Map();
let localStream = null;
let remoteStream = null;
let currentCall = null;
let cryptoManager = new CryptoManager();
let userKeys = new Map(); // Хранилище ключей для каждого чата

// DOM элементы
const authScreen = document.getElementById('auth-screen');
const messengerScreen = document.getElementById('messenger-screen');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const logoutBtn = document.getElementById('logout-btn');
const currentUserSpan = document.getElementById('current-user');
const usersList = document.getElementById('users-list');
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const fileBtn = document.getElementById('file-btn');
const searchUsers = document.getElementById('search-users');
const chatUsername = document.getElementById('chat-username');
const chatStatus = document.getElementById('chat-status');
const audioCallBtn = document.getElementById('audio-call-btn');
const videoCallBtn = document.getElementById('video-call-btn');
const callPanel = document.getElementById('call-panel');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const endCallBtn = document.getElementById('end-call-btn');
const muteAudioBtn = document.getElementById('mute-audio-btn');
const muteVideoBtn = document.getElementById('mute-video-btn');
const authError = document.getElementById('auth-error');

// WebRTC конфигурация
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Регистрация пользователя с сохранением пароля
registerBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    
    if (!username || !password) {
        authError.textContent = 'Заполните все поля';
        return;
    }
    
    try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('username', '==', username));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            authError.textContent = 'Пользователь уже существует';
            return;
        }
        
        // Создаем соль для пользователя
        const salt = cryptoManager.generateSalt();
        
        // Сохраняем пользователя с зашифрованным паролем
        const userRef = await addDoc(usersRef, {
            username: username,
            passwordHash: await hashPassword(password, salt),
            salt: Array.from(salt),
            status: 'online',
            createdAt: serverTimestamp()
        });
        
        authError.textContent = 'Регистрация успешна! Теперь войдите.';
        authError.style.color = '#4caf50';
        
        setTimeout(() => {
            authError.textContent = '';
            authError.style.color = '#ff4444';
        }, 3000);
        
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        authError.textContent = 'Ошибка регистрации';
    }
});

// Хеширование пароля
async function hashPassword(password, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
    );
    
    const hash = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        256
    );
    
    return Array.from(new Uint8Array(hash));
}

// Вход в систему
loginBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    
    if (!username || !password) {
        authError.textContent = 'Заполните все поля';
        return;
    }
    
    try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('username', '==', username));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            authError.textContent = 'Пользователь не найден';
            return;
        }
        
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        const salt = new Uint8Array(userData.salt);
        
        // Проверяем пароль
        const passwordHash = await hashPassword(password, salt);
        if (JSON.stringify(passwordHash) !== JSON.stringify(userData.passwordHash)) {
            authError.textContent = 'Неверный пароль';
            return;
        }
        
        currentUser = {
            id: userDoc.id,
            username: username,
            password: password // Сохраняем для генерации ключей
        };
        
        // Обновляем статус
        const userDocRef = doc(db, 'users', currentUser.id);
        await updateDoc(userDocRef, {
            status: 'online',
            lastSeen: serverTimestamp()
        });
        
        currentUserSpan.textContent = username;
        authScreen.classList.remove('active');
        messengerScreen.classList.add('active');
        
        loadUsers();
        setupRealtimeUsers();
        setupDataChannelSignaling();
        
    } catch (error) {
        console.error('Ошибка входа:', error);
        authError.textContent = 'Ошибка входа';
    }
});

// Выход из системы
logoutBtn.addEventListener('click', async () => {
    if (currentUser) {
        const userDoc = doc(db, 'users', currentUser.id);
        await updateDoc(userDoc, {
            status: 'offline',
            lastSeen: serverTimestamp()
        });
        
        for (const [userId, pc] of peerConnections) {
            pc.close();
        }
        peerConnections.clear();
        dataChannels.clear();
        userKeys.clear();
    }
    
    currentUser = null;
    currentChat = null;
    if (messagesListener) messagesListener();
    
    authScreen.classList.add('active');
    messengerScreen.classList.remove('active');
    usernameInput.value = '';
    passwordInput.value = '';
});

// Загрузка пользователей
async function loadUsers() {
    const usersRef = collection(db, 'users');
    const querySnapshot = await getDocs(usersRef);
    
    users.clear();
    for (const doc of querySnapshot.docs) {
        const user = doc.data();
        if (doc.id !== currentUser.id) {
            users.set(doc.id, {
                id: doc.id,
                username: user.username,
                status: user.status
            });
            
            // Генерируем общий ключ для чата
            await generateSharedKey(doc.id);
            await establishPeerConnection(doc.id);
        }
    }
    
    renderUsersList();
}

// Генерация общего ключа для чата
async function generateSharedKey(userId) {
    const user = users.get(userId);
    if (!user) return;
    
    // Создаем уникальную соль для чата
    const chatSalt = new TextEncoder().encode(`flux-chat-${currentUser.id}-${userId}`);
    
    // Генерируем общий ключ на основе паролей пользователей
    const sharedKey = await cryptoManager.deriveKey(
        currentUser.password + user.username,
        chatSalt
    );
    
    userKeys.set(userId, sharedKey);
}

// Установка P2P соединения
async function establishPeerConnection(userId) {
    if (peerConnections.has(userId)) return;
    
    const peerConnection = new RTCPeerConnection(configuration);
    peerConnections.set(userId, peerConnection);
    
    const dataChannel = peerConnection.createDataChannel('encrypted-chat');
    dataChannels.set(userId, dataChannel);
    
    dataChannel.onopen = () => {
        console.log(`🔐 Encrypted channel opened with ${userId}`);
    };
    
    dataChannel.onmessage = async (event) => {
        const encryptedData = JSON.parse(event.data);
        await handleEncryptedData(encryptedData, userId);
    };
    
    peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
            await addDoc(collection(db, 'signals'), {
                type: 'candidate',
                from: currentUser.id,
                to: userId,
                candidate: event.candidate,
                timestamp: serverTimestamp()
            });
        }
    };
    
    peerConnection.ondatachannel = (event) => {
        const channel = event.channel;
        dataChannels.set(userId, channel);
        
        channel.onmessage = async (event) => {
            const encryptedData = JSON.parse(event.data);
            await handleEncryptedData(encryptedData, userId);
        };
    };
    
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    await addDoc(collection(db, 'signals'), {
        type: 'offer',
        from: currentUser.id,
        to: userId,
        offer: offer,
        timestamp: serverTimestamp()
    });
}

// Обработка зашифрованных данных
async function handleEncryptedData(encryptedData, fromUserId) {
    const sharedKey = userKeys.get(fromUserId);
    if (!sharedKey) return;
    
    try {
        const decrypted = await cryptoManager.decryptText(encryptedData, sharedKey);
        const data = JSON.parse(decrypted);
        
        switch (data.type) {
            case 'text':
                await saveMessage({
                    id: Date.now(),
                    senderId: fromUserId,
                    receiverId: currentUser.id,
                    content: data.content,
                    type: 'text',
                    timestamp: new Date()
                });
                break;
                
            case 'file':
                // Сохраняем зашифрованный файл в localStorage
                const files = JSON.parse(localStorage.getItem('flux_encrypted_files') || '{}');
                files[data.fileId] = {
                    encryptedData: data.fileData,
                    name: data.fileName,
                    size: data.fileSize,
                    type: data.fileType
                };
                localStorage.setItem('flux_encrypted_files', JSON.stringify(files));
                
                await saveMessage({
                    id: Date.now(),
                    senderId: fromUserId,
                    receiverId: currentUser.id,
                    content: data.fileId,
                    type: 'file',
                    fileName: data.fileName,
                    fileSize: data.fileSize,
                    timestamp: new Date()
                });
                break;
        }
    } catch (error) {
        console.error('Ошибка дешифрования:', error);
    }
}

// Отправка зашифрованных данных
async function sendEncryptedData(userId, data) {
    const sharedKey = userKeys.get(userId);
    if (!sharedKey) return false;
    
    const dataChannel = dataChannels.get(userId);
    if (!dataChannel || dataChannel.readyState !== 'open') return false;
    
    const encrypted = await cryptoManager.encryptText(JSON.stringify(data), sharedKey);
    dataChannel.send(JSON.stringify(encrypted));
    return true;
}

// Отправка текстового сообщения
sendBtn.addEventListener('click', async () => {
    if (!messageInput.value.trim() || !currentChat) return;
    
    const content = messageInput.value.trim();
    const success = await sendEncryptedData(currentChat.id, {
        type: 'text',
        content: content
    });
    
    if (success) {
        await saveMessage({
            id: Date.now(),
            senderId: currentUser.id,
            receiverId: currentChat.id,
            content: content,
            type: 'text',
            timestamp: new Date()
        });
        messageInput.value = '';
    } else {
        alert('Пользователь не в сети');
    }
});

// Отправка файла
fileBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file && currentChat) {
            await sendEncryptedFile(file);
        }
    };
    input.click();
});

// Отправка зашифрованного файла
async function sendEncryptedFile(file) {
    const sharedKey = userKeys.get(currentChat.id);
    if (!sharedKey) {
        alert('Ключ шифрования не найден');
        return;
    }
    
    const fileId = `${Date.now()}_${file.name}`;
    
    // Шифруем файл
    const encryptedFile = await cryptoManager.encryptFileToText(file, sharedKey);
    
    const success = await sendEncryptedData(currentChat.id, {
        type: 'file',
        fileId: fileId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        fileData: encryptedFile
    });
    
    if (success) {
        // Сохраняем зашифрованный файл локально
        const files = JSON.parse(localStorage.getItem('flux_encrypted_files') || '{}');
        files[fileId] = encryptedFile;
        localStorage.setItem('flux_encrypted_files', JSON.stringify(files));
        
        await saveMessage({
            id: Date.now(),
            senderId: currentUser.id,
            receiverId: currentChat.id,
            content: fileId,
            type: 'file',
            fileName: file.name,
            fileSize: file.size,
            timestamp: new Date()
        });
    } else {
        alert('Не удалось отправить файл');
    }
}

// Сохранение сообщения
async function saveMessage(message) {
    try {
        const messagesRef = collection(db, 'messages');
        await addDoc(messagesRef, {
            ...message,
            timestamp: serverTimestamp(),
            participants: [message.senderId, message.receiverId]
        });
    } catch (error) {
        console.error('Ошибка сохранения:', error);
    }
}

// Загрузка сообщений
function loadMessages() {
    if (messagesListener) messagesListener();
    
    const messagesRef = collection(db, 'messages');
    const q = query(
        messagesRef,
        where('participants', 'array-contains', currentUser.id),
        orderBy('timestamp', 'asc')
    );
    
    messagesListener = onSnapshot(q, (snapshot) => {
        const relevantMessages = [];
        snapshot.forEach(doc => {
            const message = doc.data();
            if ((message.senderId === currentUser.id && message.receiverId === currentChat.id) ||
                (message.senderId === currentChat.id && message.receiverId === currentUser.id)) {
                relevantMessages.push({
                    id: doc.id,
                    ...message
                });
            }
        });
        
        renderMessages(relevantMessages);
    });
}

// Отображение сообщений
function renderMessages(messages) {
    messagesContainer.innerHTML = messages.map(msg => {
        const isSent = msg.senderId === currentUser.id;
        
        if (msg.type === 'text') {
            return `
                <div class="message ${isSent ? 'sent' : 'received'}">
                    <div>${escapeHtml(msg.content)}</div>
                    <div class="message-time">
                        ${formatTime(msg.timestamp)}
                        <span class="encrypted-badge">🔒</span>
                    </div>
                </div>
            `;
        } else if (msg.type === 'file') {
            return `
                <div class="message ${isSent ? 'sent' : 'received'}">
                    <div class="message-file" data-file-id="${msg.content}">
                        <span>📎</span>
                        <span>${escapeHtml(msg.fileName)}</span>
                        <span>(${formatFileSize(msg.fileSize)})</span>
                        <span class="encrypted-badge">🔒</span>
                    </div>
                    <div class="message-time">${formatTime(msg.timestamp)}</div>
                </div>
            `;
        }
        return '';
    }).join('');
    
    document.querySelectorAll('.message-file').forEach(el => {
        el.addEventListener('click', async () => {
            const fileId = el.dataset.fileId;
            await downloadAndDecryptFile(fileId);
        });
    });
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Скачивание и дешифрование файла
async function downloadAndDecryptFile(fileId) {
    const sharedKey = userKeys.get(currentChat.id);
    if (!sharedKey) {
        alert('Ключ шифрования не найден');
        return;
    }
    
    const files = JSON.parse(localStorage.getItem('flux_encrypted_files') || '{}');
    const encryptedFile = files[fileId];
    
    if (encryptedFile) {
        try {
            const decryptedFile = await cryptoManager.decryptFileFromText(encryptedFile, sharedKey);
            
            const blob = new Blob([decryptedFile.data], { type: decryptedFile.type });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = decryptedFile.name;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Ошибка дешифрования файла:', error);
            alert('Ошибка дешифрования файла');
        }
    } else {
        alert('Файл не найден');
    }
}

// Сигналинг для WebRTC
function setupDataChannelSignaling() {
    const signalsRef = collection(db, 'signals');
    const q = query(signalsRef, where('to', '==', currentUser.id));
    
    onSnapshot(q, async (snapshot) => {
        for (const doc of snapshot.docs) {
            const signal = doc.data();
            const peerConnection = peerConnections.get(signal.from);
            
            if (peerConnection) {
                if (signal.type === 'offer') {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.offer));
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    
                    await addDoc(collection(db, 'signals'), {
                        type: 'answer',
                        from: currentUser.id,
                        to: signal.from,
                        answer: answer,
                        timestamp: serverTimestamp()
                    });
                } else if (signal.type === 'answer') {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.answer));
                } else if (signal.type === 'candidate') {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
                }
            }
            
            await deleteDoc(doc.ref);
        }
    });
}

// Выбор чата
function selectChat(user) {
    currentChat = user;
    chatUsername.textContent = user.username;
    chatStatus.textContent = user.status === 'online' ? 'В сети' : 'Не в сети';
    chatStatus.className = user.status === 'online' ? 'chat-status' : 'chat-status offline';
    
    const isOnline = user.status === 'online';
    messageInput.disabled = !isOnline;
    sendBtn.disabled = !isOnline;
    audioCallBtn.disabled = !isOnline;
    videoCallBtn.disabled = !isOnline;
    
    loadMessages();
}

// Отображение списка пользователей
function renderUsersList() {
    const searchTerm = searchUsers.value.toLowerCase();
    const filteredUsers = Array.from(users.values()).filter(user => 
        user.username.toLowerCase().includes(searchTerm)
    );
    
    usersList.innerHTML = filteredUsers.map(user => `
        <div class="user-item" data-user-id="${user.id}">
            <div class="user-avatar">${user.username[0].toUpperCase()}</div>
            <div class="user-name">${escapeHtml(user.username)}</div>
            <div class="user-status ${user.status === 'online' ? '' : 'offline'}"></div>
        </div>
    `).join('');
    
    document.querySelectorAll('.user-item').forEach(item => {
        item.addEventListener('click', () => {
            const userId = item.dataset.userId;
            const user = users.get(userId);
            if (user) {
                selectChat(user);
            }
        });
    });
}

// WebRTC звонки (аудио/видео уже шифруются самим WebRTC)
audioCallBtn.addEventListener('click', () => startCall(false));
videoCallBtn.addEventListener('click', () => startCall(true));

async function startCall(isVideo) {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: isVideo,
            audio: true
        });
        
        localVideo.srcObject = localStream;
        
        const peerConnection = peerConnections.get(currentChat.id);
        if (!peerConnection) return;
        
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        peerConnection.ontrack = (event) => {
            remoteStream = event.streams[0];
            remoteVideo.srcObject = remoteStream;
        };
        
        callPanel.classList.remove('hidden');
        currentCall = { peerConnection, isVideo };
        
    } catch (error) {
        console.error('Ошибка звонка:', error);
        alert('Не удалось начать звонок');
    }
}

endCallBtn.addEventListener('click', () => {
    if (currentCall) {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        callPanel.classList.add('hidden');
        currentCall = null;
        localStream = null;
    }
});

muteAudioBtn.addEventListener('click', () => {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        muteAudioBtn.textContent = audioTrack.enabled ? '🎤' : '🔇';
    }
});

muteVideoBtn.addEventListener('click', () => {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            muteVideoBtn.textContent = videoTrack.enabled ? '📹' : '🚫';
        }
    }
});

// Реальное обновление статусов
function setupRealtimeUsers() {
    const usersRef = collection(db, 'users');
    onSnapshot(usersRef, (snapshot) => {
        snapshot.forEach(doc => {
            if (users.has(doc.id)) {
                const user = users.get(doc.id);
                user.status = doc.data().status;
                users.set(doc.id, user);
            }
        });
        
        renderUsersList();
        
        if (currentChat && users.has(currentChat.id)) {
            const updatedUser = users.get(currentChat.id);
            chatStatus.textContent = updatedUser.status === 'online' ? 'В сети' : 'Не в сети';
            chatStatus.className = updatedUser.status === 'online' ? 'chat-status' : 'chat-status offline';
            const isOnline = updatedUser.status === 'online';
            messageInput.disabled = !isOnline;
            sendBtn.disabled = !isOnline;
            audioCallBtn.disabled = !isOnline;
            videoCallBtn.disabled = !isOnline;
        }
    });
}

searchUsers.addEventListener('input', renderUsersList);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
    }
});

// Вспомогательные функции
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
