import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { getFirestore, collection, addDoc, query, where, getDocs, updateDoc, doc, onSnapshot, orderBy, serverTimestamp, deleteDoc } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js';

// Firebase конфигурация - замените на свои данные
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Инициализация Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// Состояние приложения
let currentUser = null;
let currentChat = null;
let users = new Map();
let messagesListener = null;
let peerConnections = new Map();
let localStream = null;
let remoteStream = null;
let currentCall = null;

// WebRTC конфигурация
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

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

// Регистрация пользователя
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
        
        await addDoc(usersRef, {
            username: username,
            password: password,
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
        const q = query(usersRef, where('username', '==', username), where('password', '==', password));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            authError.textContent = 'Неверное имя пользователя или пароль';
            return;
        }
        
        currentUser = {
            id: querySnapshot.docs[0].id,
            username: username
        };
        
        // Обновляем статус пользователя
        const userDoc = doc(db, 'users', currentUser.id);
        await updateDoc(userDoc, {
            status: 'online',
            lastSeen: serverTimestamp()
        });
        
        currentUserSpan.textContent = username;
        authScreen.classList.remove('active');
        messengerScreen.classList.add('active');
        
        loadUsers();
        setupRealtimeUsers();
        
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
    querySnapshot.forEach(doc => {
        const user = doc.data();
        if (doc.id !== currentUser.id) {
            users.set(doc.id, {
                id: doc.id,
                username: user.username,
                status: user.status
            });
        }
    });
    
    renderUsersList();
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
            <div class="user-name">${user.username}</div>
            <div class="user-status ${user.status === 'online' ? '' : 'offline'}"></div>
        </div>
    `).join('');
    
    // Добавляем обработчики кликов
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

// Выбор чата
function selectChat(user) {
    currentChat = user;
    chatUsername.textContent = user.username;
    chatStatus.textContent = user.status === 'online' ? 'В сети' : 'Не в сети';
    chatStatus.className = user.status === 'online' ? 'chat-status' : 'chat-status offline';
    
    messageInput.disabled = false;
    sendBtn.disabled = false;
    audioCallBtn.disabled = user.status !== 'online';
    videoCallBtn.disabled = user.status !== 'online';
    
    loadMessages();
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
        const content = msg.type === 'text' ? 
            `<div>${escapeHtml(msg.content)}</div>` :
            `<div class="message-file" data-file-url="${msg.content}">
                <span>📎</span>
                <span>${msg.fileName || 'Файл'}</span>
                <span>(${formatFileSize(msg.fileSize || 0)})</span>
            </div>`;
        
        return `
            <div class="message ${isSent ? 'sent' : 'received'}">
                ${content}
                <div class="message-time">${formatTime(msg.timestamp)}</div>
            </div>
        `;
    }).join('');
    
    // Добавляем обработчики для файлов
    document.querySelectorAll('.message-file').forEach(el => {
        el.addEventListener('click', () => {
            const url = el.dataset.fileUrl;
            window.open(url, '_blank');
        });
    });
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Отправка сообщения
sendBtn.addEventListener('click', async () => {
    if (!messageInput.value.trim() || !currentChat) return;
    
    await sendMessage(messageInput.value.trim(), 'text');
    messageInput.value = '';
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
    }
});

// Отправка файла
fileBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file && currentChat) {
            await uploadAndSendFile(file);
        }
    };
    input.click();
});

// Загрузка и отправка файла
async function uploadAndSendFile(file) {
    const fileRef = ref(storage, `files/${Date.now()}_${file.name}`);
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);
    
    await sendMessage(url, 'file', {
        fileName: file.name,
        fileSize: file.size
    });
}

// Отправка сообщения
async function sendMessage(content, type, metadata = {}) {
    try {
        await addDoc(collection(db, 'messages'), {
            senderId: currentUser.id,
            receiverId: currentChat.id,
            content: content,
            type: type,
            timestamp: serverTimestamp(),
            participants: [currentUser.id, currentChat.id],
            ...metadata
        });
    } catch (error) {
        console.error('Ошибка отправки сообщения:', error);
    }
}

// Поиск пользователей
searchUsers.addEventListener('input', renderUsersList);

// WebRTC звонки
audioCallBtn.addEventListener('click', () => startCall(false));
videoCallBtn.addEventListener('click', () => startCall(true));

async function startCall(isVideo) {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: isVideo,
            audio: true
        });
        
        localVideo.srcObject = localStream;
        
        const peerConnection = new RTCPeerConnection(configuration);
        peerConnections.set(currentChat.id, peerConnection);
        
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        peerConnection.ontrack = (event) => {
            remoteStream = event.streams[0];
            remoteVideo.srcObject = remoteStream;
        };
        
        peerConnection.onicecandidate = async (event) => {
            if (event.candidate) {
                await addDoc(collection(db, 'calls'), {
                    type: 'candidate',
                    senderId: currentUser.id,
                    receiverId: currentChat.id,
                    candidate: event.candidate,
                    timestamp: serverTimestamp()
                });
            }
        };
        
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        await addDoc(collection(db, 'calls'), {
            type: 'offer',
            senderId: currentUser.id,
            receiverId: currentChat.id,
            offer: offer,
            timestamp: serverTimestamp()
        });
        
        callPanel.classList.remove('hidden');
        currentCall = { peerConnection, isVideo };
        
        listenForCallSignals();
        
    } catch (error) {
        console.error('Ошибка звонка:', error);
        alert('Не удалось начать звонок');
    }
}

// Прослушивание сигналов звонка
function listenForCallSignals() {
    const callsRef = collection(db, 'calls');
    const q = query(callsRef, where('receiverId', '==', currentUser.id));
    
    onSnapshot(q, async (snapshot) => {
        for (const doc of snapshot.docs) {
            const signal = doc.data();
            
            if (signal.senderId === currentChat?.id) {
                if (signal.type === 'offer') {
                    await handleOffer(signal.offer, signal.senderId);
                } else if (signal.type === 'answer') {
                    const peerConnection = peerConnections.get(signal.senderId);
                    if (peerConnection) {
                        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.answer));
                    }
                } else if (signal.type === 'candidate') {
                    const peerConnection = peerConnections.get(signal.senderId);
                    if (peerConnection) {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
                    }
                }
                
                await deleteDoc(doc.ref);
            }
        }
    });
}

async function handleOffer(offer, senderId) {
    const accept = confirm('Входящий звонок. Принять?');
    
    if (accept) {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            localVideo.srcObject = localStream;
            
            const peerConnection = new RTCPeerConnection(configuration);
            peerConnections.set(senderId, peerConnection);
            
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
            
            peerConnection.ontrack = (event) => {
                remoteStream = event.streams[0];
                remoteVideo.srcObject = remoteStream;
            };
            
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            await addDoc(collection(db, 'calls'), {
                type: 'answer',
                senderId: currentUser.id,
                receiverId: senderId,
                answer: answer,
                timestamp: serverTimestamp()
            });
            
            callPanel.classList.remove('hidden');
            currentCall = { peerConnection, isVideo: true };
            
        } catch (error) {
            console.error('Ошибка ответа на звонок:', error);
        }
    }
}

// Завершение звонка
endCallBtn.addEventListener('click', () => {
    if (currentCall) {
        currentCall.peerConnection.close();
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        peerConnections.delete(currentChat?.id);
        callPanel.classList.add('hidden');
        currentCall = null;
        localStream = null;
    }
});

// Управление аудио/видео во время звонка
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

// Реальное обновление статусов пользователей
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
            audioCallBtn.disabled = updatedUser.status !== 'online';
            videoCallBtn.disabled = updatedUser.status !== 'online';
        }
    });
}

// Вспомогательные функции
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
