import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { getFirestore, collection, addDoc, query, where, getDocs, updateDoc, doc, onSnapshot, serverTimestamp, deleteDoc } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';

// Firebase конфигурация - ЗАМЕНИТЕ НА ВАШУ!
const firebaseConfig = {
  apiKey: "AIzaSyD1govXD95pUFr5JfPClaciG76L4o3sUjw",
  authDomain: "flux-a1396.firebaseapp.com",
  databaseURL: "https://flux-a1396-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "flux-a1396",
  storageBucket: "flux-a1396.firebasestorage.app",
  messagingSenderId: "670873031130",
  appId: "1:670873031130:web:87f8dfcafbe68c38a470e3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ============= ГЕНЕРАЦИЯ КОДА =============
function generateUserCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 12; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
        if (i === 3 || i === 7) code += '-';
    }
    return code;
}

function formatUserCode(code) {
    if (!code) return '';
    const clean = code.replace(/-/g, '');
    return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}`;
}

function normalizeCode(code) {
    return code.toUpperCase().replace(/-/g, '');
}

// ============= КРИПТОГРАФИЯ =============
class CryptoManager {
    constructor() {
        this.encoder = new TextEncoder();
        this.decoder = new TextDecoder();
    }
    
    async deriveKey(password, salt) {
        const keyMaterial = await crypto.subtle.importKey('raw', this.encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
        return await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    }
    
    generateSalt() { return crypto.getRandomValues(new Uint8Array(16)); }
    generateIV() { return crypto.getRandomValues(new Uint8Array(12)); }
    
    async encryptText(text, key) {
        const iv = this.generateIV();
        const encryptedData = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, this.encoder.encode(text));
        return { data: Array.from(new Uint8Array(encryptedData)), iv: Array.from(iv) };
    }
    
    async decryptText(encryptedObj, key) {
        const decryptedData = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(encryptedObj.iv) }, key, new Uint8Array(encryptedObj.data));
        return this.decoder.decode(decryptedData);
    }
    
    async encryptFileToText(file, key) {
        const iv = this.generateIV();
        const encryptedData = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, await file.arrayBuffer());
        return { data: btoa(String.fromCharCode(...new Uint8Array(encryptedData))), iv: Array.from(iv), name: file.name, type: file.type, size: file.size };
    }
    
    async decryptFileFromText(encryptedObj, key) {
        const decryptedData = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(encryptedObj.iv) }, key, Uint8Array.from(atob(encryptedObj.data), c => c.charCodeAt(0)));
        return { data: decryptedData, name: encryptedObj.name, type: encryptedObj.type, size: encryptedObj.size };
    }
}

// ============= СЕРИАЛИЗАЦИЯ WEBRTC =============
function serializeCandidate(candidate) {
    if (!candidate) return null;
    return { candidate: candidate.candidate, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex, usernameFragment: candidate.usernameFragment };
}

function deserializeCandidate(candidateObj) {
    if (!candidateObj) return null;
    return new RTCIceCandidate(candidateObj);
}

function serializeSessionDescription(description) {
    if (!description) return null;
    return { type: description.type, sdp: description.sdp };
}

function deserializeSessionDescription(descriptionObj) {
    if (!descriptionObj) return null;
    return new RTCSessionDescription(descriptionObj);
}

// ============= УПРАВЛЕНИЕ КОНТАКТАМИ (LOCALSTORAGE) =============
const STORAGE_KEYS = {
    CONTACTS: 'flux_contacts',
    MESSAGES: 'flux_messages'
};

function saveContacts(contacts) {
    localStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
}

function loadContacts() {
    const contacts = localStorage.getItem(STORAGE_KEYS.CONTACTS);
    return contacts ? JSON.parse(contacts) : [];
}

function saveMessages(chatId, messages) {
    const allMessages = JSON.parse(localStorage.getItem(STORAGE_KEYS.MESSAGES) || '{}');
    allMessages[chatId] = messages;
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(allMessages));
}

function loadMessagesForChat(chatId) {
    const allMessages = JSON.parse(localStorage.getItem(STORAGE_KEYS.MESSAGES) || '{}');
    return allMessages[chatId] || [];
}

function addMessageToChat(chatId, message) {
    const messages = loadMessagesForChat(chatId);
    messages.push(message);
    saveMessages(chatId, messages);
    return messages;
}

// ============= СОСТОЯНИЕ =============
let currentUser = null;
let currentChat = null;
let contacts = [];
let peerConnections = new Map();
let dataChannels = new Map();
let localStream = null;
let remoteStream = null;
let currentCall = null;
let cryptoManager = new CryptoManager();
let userKeys = new Map();
let isCodeVisible = false;
let statusUnsubscribe = null;

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ============= DOM ЭЛЕМЕНТЫ =============
const authScreen = document.getElementById('auth-screen');
const messengerScreen = document.getElementById('messenger-screen');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const logoutBtn = document.getElementById('logout-btn');
const currentUserSpan = document.getElementById('current-user');
const userCodeSpan = document.getElementById('user-code');
const toggleCodeBtn = document.getElementById('toggle-code-btn');
const copyCodeBtn = document.getElementById('copy-code-btn');
const contactsList = document.getElementById('contacts-list');
const contactsCount = document.getElementById('contacts-count');
const addContactBtn = document.getElementById('add-contact-btn');
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const fileBtn = document.getElementById('file-btn');
const chatUsername = document.getElementById('chat-username');
const chatCodeSpan = document.getElementById('chat-code');
const copyChatCodeBtn = document.getElementById('copy-chat-code-btn');
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
const addContactModal = document.getElementById('add-contact-modal');
const contactCodeInput = document.getElementById('contact-code-input');
const modalAddBtn = document.getElementById('modal-add-btn');
const modalAddCloseBtn = document.getElementById('modal-add-close-btn');
const modalAddError = document.getElementById('modal-add-error');
const toast = document.getElementById('copy-toast');

// ============= ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =============
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function hashPassword(password, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
    return Array.from(new Uint8Array(hash));
}

async function generateUniqueCode() {
    let attempts = 0;
    let code;
    let exists = true;
    while (exists && attempts < 10) {
        code = generateUserCode();
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('userCode', '==', normalizeCode(code)));
        const querySnapshot = await getDocs(q);
        exists = !querySnapshot.empty;
        attempts++;
    }
    return code;
}

async function copyToClipboard(text) {
    if (!text) return;
    try {
        await navigator.clipboard.writeText(text);
        showToast('✅ Код скопирован!');
    } catch (err) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('✅ Код скопирован!');
    }
}

function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2000);
}

function toggleCodeVisibility() {
    if (!currentUser) return;
    isCodeVisible = !isCodeVisible;
    if (isCodeVisible) {
        userCodeSpan.textContent = currentUser.userCode || '••••-••••-••••';
        userCodeSpan.classList.remove('hidden-code');
        userCodeSpan.classList.add('visible-code');
        if (toggleCodeBtn) toggleCodeBtn.textContent = '🙈';
        if (toggleCodeBtn) toggleCodeBtn.title = 'Скрыть код';
    } else {
        userCodeSpan.textContent = '••••-••••-••••';
        userCodeSpan.classList.add('hidden-code');
        userCodeSpan.classList.remove('visible-code');
        if (toggleCodeBtn) toggleCodeBtn.textContent = '👁️';
        if (toggleCodeBtn) toggleCodeBtn.title = 'Показать код';
    }
}

// ============= УПРАВЛЕНИЕ КОНТАКТАМИ =============
function renderContacts() {
    if (!contactsList) return;
    
    if (!contacts || contacts.length === 0) {
        contactsList.innerHTML = `
            <div class="empty-contacts">
                <div>📭</div>
                <div>Нет контактов</div>
                <div class="empty-hint">Нажмите "Добавить контакт" чтобы начать общение</div>
            </div>
        `;
        if (contactsCount) contactsCount.textContent = '0';
        return;
    }
    
    contactsList.innerHTML = contacts.map(contact => `
        <div class="contact-item" data-contact-id="${contact.id}">
            <div class="contact-avatar">${contact.username ? contact.username[0].toUpperCase() : '?'}</div>
            <div class="contact-info">
                <div class="contact-name">${escapeHtml(contact.username || 'Unknown')}</div>
                <div class="contact-code-small">🔑 ${contact.userCode || '---'}</div>
            </div>
            <div class="contact-status ${contact.status === 'online' ? 'online' : 'offline'}"></div>
        </div>
    `).join('');
    
    if (contactsCount) contactsCount.textContent = contacts.length;
    
    document.querySelectorAll('.contact-item').forEach(item => {
        item.addEventListener('click', () => {
            const contactId = item.dataset.contactId;
            const contact = contacts.find(c => c.id === contactId);
            if (contact) selectChat(contact);
        });
    });
}

async function addContactByCode(code) {
    if (!code) {
        if (modalAddError) modalAddError.textContent = 'Введите код';
        return false;
    }
    
    const normalizedCode = normalizeCode(code);
    
    try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('userCode', '==', normalizedCode));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            if (modalAddError) modalAddError.textContent = '❌ Пользователь с таким кодом не найден';
            return false;
        }
        
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        
        if (userDoc.id === currentUser.id) {
            if (modalAddError) modalAddError.textContent = '❌ Нельзя добавить самого себя';
            return false;
        }
        
        if (contacts.some(c => c.id === userDoc.id)) {
            if (modalAddError) modalAddError.textContent = '❌ Этот контакт уже есть в списке';
            return false;
        }
        
        const newContact = {
            id: userDoc.id,
            username: userData.username || 'Unknown',
            userCode: userData.formattedCode || formatUserCode(userData.userCode),
            status: userData.status || 'offline',
            addedAt: Date.now()
        };
        
        contacts.push(newContact);
        saveContacts(contacts);
        renderContacts();
        
        await generateSharedKey(userDoc.id);
        await establishPeerConnection(userDoc.id);
        
        showToast(`✅ ${newContact.username} добавлен в контакты!`);
        return true;
        
    } catch (error) {
        console.error('Ошибка добавления контакта:', error);
        if (modalAddError) modalAddError.textContent = '❌ Ошибка при добавлении контакта';
        return false;
    }
}

// ============= АУТЕНТИФИКАЦИЯ =============
registerBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    
    if (!username || !password) {
        authError.textContent = 'Заполните все поля';
        return;
    }
    
    if (username.length < 3) {
        authError.textContent = 'Имя должно содержать минимум 3 символа';
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
        
        const salt = cryptoManager.generateSalt();
        const passwordHash = await hashPassword(password, salt);
        const userCode = await generateUniqueCode();
        
        await addDoc(usersRef, {
            username: username,
            passwordHash: passwordHash,
            salt: Array.from(salt),
            userCode: normalizeCode(userCode),
            formattedCode: userCode,
            status: 'online',
            createdAt: serverTimestamp()
        });
        
        authError.textContent = `✅ Регистрация успешна! Ваш код: ${userCode}`;
        authError.style.color = '#4caf50';
        setTimeout(() => {
            authError.textContent = '';
            authError.style.color = '#ff4444';
        }, 5000);
        
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        authError.textContent = '❌ Ошибка регистрации: ' + error.message;
    }
});

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
        
        const passwordHash = await hashPassword(password, salt);
        if (JSON.stringify(passwordHash) !== JSON.stringify(userData.passwordHash)) {
            authError.textContent = 'Неверный пароль';
            return;
        }
        
        currentUser = {
            id: userDoc.id,
            username: username,
            password: password,
            userCode: userData.formattedCode || formatUserCode(userData.userCode)
        };
        
        const userDocRef = doc(db, 'users', currentUser.id);
        await updateDoc(userDocRef, { status: 'online', lastSeen: serverTimestamp() });
        
        // Загружаем контакты
        contacts = loadContacts();
        renderContacts();
        
        currentUserSpan.textContent = username;
        isCodeVisible = false;
        userCodeSpan.textContent = '••••-••••-••••';
        userCodeSpan.classList.add('hidden-code');
        if (toggleCodeBtn) toggleCodeBtn.textContent = '👁️';
        if (toggleCodeBtn) toggleCodeBtn.onclick = toggleCodeVisibility;
        if (copyCodeBtn) copyCodeBtn.onclick = () => copyToClipboard(currentUser.userCode);
        if (userCodeSpan) userCodeSpan.onclick = () => {
            if (isCodeVisible) copyToClipboard(currentUser.userCode);
            else toggleCodeVisibility();
        };
        
        authScreen.classList.remove('active');
        messengerScreen.classList.add('active');
        
        // Устанавливаем соединения с контактами
        for (const contact of contacts) {
            await generateSharedKey(contact.id);
            await establishPeerConnection(contact.id);
        }
        
        setupRealtimeUsers();
        setupDataChannelSignaling();
        
    } catch (error) {
        console.error('Ошибка входа:', error);
        authError.textContent = '❌ Ошибка входа: ' + error.message;
    }
});

logoutBtn.addEventListener('click', async () => {
    if (currentUser) {
        try {
            const userDoc = doc(db, 'users', currentUser.id);
            await updateDoc(userDoc, { status: 'offline', lastSeen: serverTimestamp() });
        } catch (error) { console.error('Ошибка обновления статуса:', error); }
        
        for (const [userId, pc] of peerConnections) {
            if (pc) pc.close();
        }
        peerConnections.clear();
        dataChannels.clear();
        userKeys.clear();
        if (localStream) localStream.getTracks().forEach(track => track.stop());
        
        if (statusUnsubscribe) statusUnsubscribe();
    }
    
    currentUser = null;
    currentChat = null;
    contacts = [];
    authScreen.classList.add('active');
    messengerScreen.classList.remove('active');
    usernameInput.value = '';
    passwordInput.value = '';
});

// ============= ДОБАВЛЕНИЕ КОНТАКТА =============
if (addContactBtn) {
    addContactBtn.addEventListener('click', () => {
        if (addContactModal) addContactModal.classList.remove('hidden');
        if (contactCodeInput) contactCodeInput.value = '';
        if (modalAddError) modalAddError.textContent = '';
        if (contactCodeInput) contactCodeInput.focus();
    });
}

if (modalAddCloseBtn) {
    modalAddCloseBtn.addEventListener('click', () => {
        if (addContactModal) addContactModal.classList.add('hidden');
    });
}

if (modalAddBtn) {
    modalAddBtn.addEventListener('click', async () => {
        const code = contactCodeInput ? contactCodeInput.value.trim() : '';
        await addContactByCode(code);
        if (addContactModal) addContactModal.classList.add('hidden');
    });
}

if (contactCodeInput) {
    contactCodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && modalAddBtn) modalAddBtn.click();
    });
}

// ============= P2P СОЕДИНЕНИЕ =============
async function generateSharedKey(userId) {
    const contact = contacts.find(c => c.id === userId);
    if (!contact || !currentUser) return;
    const chatSalt = new TextEncoder().encode(`flux-chat-${currentUser.id}-${userId}`);
    const sharedKey = await cryptoManager.deriveKey(currentUser.password + contact.username, chatSalt);
    userKeys.set(userId, sharedKey);
}

async function establishPeerConnection(userId) {
    if (peerConnections.has(userId)) return;
    
    const peerConnection = new RTCPeerConnection(configuration);
    peerConnections.set(userId, peerConnection);
    
    const dataChannel = peerConnection.createDataChannel('encrypted-chat');
    dataChannels.set(userId, dataChannel);
    
    dataChannel.onopen = () => console.log(`🔐 Channel opened with ${userId}`);
    dataChannel.onmessage = async (event) => {
        try {
            const encryptedData = JSON.parse(event.data);
            await handleEncryptedData(encryptedData, userId);
        } catch (error) {
            console.error('Ошибка обработки сообщения:', error);
        }
    };
    
    peerConnection.onicecandidate = async (event) => {
        if (event.candidate && currentUser) {
            try {
                await addDoc(collection(db, 'signals'), {
                    type: 'candidate', from: currentUser.id, to: userId,
                    candidate: serializeCandidate(event.candidate), timestamp: serverTimestamp()
                });
            } catch (error) { console.error('Ошибка сохранения кандидата:', error); }
        }
    };
    
    peerConnection.ondatachannel = (event) => {
        const channel = event.channel;
        dataChannels.set(userId, channel);
        channel.onmessage = async (event) => {
            try {
                const encryptedData = JSON.parse(event.data);
                await handleEncryptedData(encryptedData, userId);
            } catch (error) {
                console.error('Ошибка обработки сообщения:', error);
            }
        };
    };
    
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        if (currentUser) {
            await addDoc(collection(db, 'signals'), {
                type: 'offer', from: currentUser.id, to: userId,
                offer: serializeSessionDescription(offer), timestamp: serverTimestamp()
            });
        }
    } catch (error) { console.error('Ошибка создания offer:', error); }
}

function setupDataChannelSignaling() {
    if (!currentUser) return;
    
    const signalsRef = collection(db, 'signals');
    const q = query(signalsRef, where('to', '==', currentUser.id));
    
    onSnapshot(q, async (snapshot) => {
        for (const doc of snapshot.docs) {
            const signal = doc.data();
            const peerConnection = peerConnections.get(signal.from);
            
            if (peerConnection) {
                try {
                    if (signal.type === 'offer') {
                        await peerConnection.setRemoteDescription(deserializeSessionDescription(signal.offer));
                        const answer = await peerConnection.createAnswer();
                        await peerConnection.setLocalDescription(answer);
                        if (currentUser) {
                            await addDoc(collection(db, 'signals'), {
                                type: 'answer', from: currentUser.id, to: signal.from,
                                answer: serializeSessionDescription(answer), timestamp: serverTimestamp()
                            });
                        }
                    } else if (signal.type === 'answer') {
                        await peerConnection.setRemoteDescription(deserializeSessionDescription(signal.answer));
                    } else if (signal.type === 'candidate') {
                        const candidate = deserializeCandidate(signal.candidate);
                        if (candidate) await peerConnection.addIceCandidate(candidate);
                    }
                } catch (error) { console.error('Ошибка обработки сигнала:', error); }
            }
            try { await deleteDoc(doc.ref); } catch (error) { console.error('Ошибка удаления сигнала:', error); }
        }
    });
}

// ============= ОБРАБОТКА СООБЩЕНИЙ =============
async function handleEncryptedData(encryptedData, fromUserId) {
    const sharedKey = userKeys.get(fromUserId);
    if (!sharedKey || !currentUser) return;
    
    try {
        const decrypted = await cryptoManager.decryptText(encryptedData, sharedKey);
        const data = JSON.parse(decrypted);
        const contact = contacts.find(c => c.id === fromUserId);
        
        if (contact) {
            const chatId = getChatId(currentUser.id, fromUserId);
            
            if (data.type === 'text') {
                const message = {
                    id: Date.now(),
                    senderId: fromUserId,
                    receiverId: currentUser.id,
                    content: data.content,
                    type: 'text',
                    timestamp: Date.now(),
                    isRead: false
                };
                addMessageToChat(chatId, message);
                if (currentChat && currentChat.id === fromUserId) renderMessagesForChat(chatId);
            } else if (data.type === 'file') {
                const files = JSON.parse(localStorage.getItem('flux_encrypted_files') || '{}');
                files[data.fileId] = { encryptedData: data.fileData, name: data.fileName, size: data.fileSize, type: data.fileType };
                localStorage.setItem('flux_encrypted_files', JSON.stringify(files));
                
                const message = {
                    id: Date.now(),
                    senderId: fromUserId,
                    receiverId: currentUser.id,
                    content: data.fileId,
                    type: 'file',
                    fileName: data.fileName,
                    fileSize: data.fileSize,
                    timestamp: Date.now(),
                    isRead: false
                };
                addMessageToChat(chatId, message);
                if (currentChat && currentChat.id === fromUserId) renderMessagesForChat(chatId);
            }
        }
    } catch (error) { console.error('Ошибка дешифрования:', error); }
}

async function sendEncryptedData(userId, data) {
    const sharedKey = userKeys.get(userId);
    if (!sharedKey) return false;
    
    const dataChannel = dataChannels.get(userId);
    if (!dataChannel || dataChannel.readyState !== 'open') return false;
    
    try {
        const encrypted = await cryptoManager.encryptText(JSON.stringify(data), sharedKey);
        dataChannel.send(JSON.stringify(encrypted));
        return true;
    } catch (error) { return false; }
}

function getChatId(userId1, userId2) {
    return [userId1, userId2].sort().join('_');
}

// ============= ОТПРАВКА СООБЩЕНИЙ =============
if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
        if (!messageInput.value.trim() || !currentChat) return;
        
        const content = messageInput.value.trim();
        const success = await sendEncryptedData(currentChat.id, { type: 'text', content: content });
        
        if (success) {
            const chatId = getChatId(currentUser.id, currentChat.id);
            const message = {
                id: Date.now(),
                senderId: currentUser.id,
                receiverId: currentChat.id,
                content: content,
                type: 'text',
                timestamp: Date.now(),
                isRead: true
            };
            addMessageToChat(chatId, message);
            renderMessagesForChat(chatId);
            messageInput.value = '';
        } else {
            showToast('❌ Пользователь не в сети');
        }
    });
}

if (messageInput) {
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && sendBtn) {
            e.preventDefault();
            sendBtn.click();
        }
    });
}

if (fileBtn) {
    fileBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file && currentChat) {
                if (file.size > 10 * 1024 * 1024) { showToast('❌ Файл слишком большой! Максимум 10MB'); return; }
                await sendEncryptedFile(file);
            }
        };
        input.click();
    });
}

async function sendEncryptedFile(file) {
    const sharedKey = userKeys.get(currentChat.id);
    if (!sharedKey) { showToast('❌ Ключ шифрования не найден'); return; }
    
    showToast('📤 Отправка файла...');
    const fileId = `${Date.now()}_${file.name}`;
    const encryptedFile = await cryptoManager.encryptFileToText(file, sharedKey);
    
    const success = await sendEncryptedData(currentChat.id, {
        type: 'file', fileId: fileId, fileName: file.name, fileSize: file.size, fileType: file.type, fileData: encryptedFile
    });
    
    if (success) {
        const files = JSON.parse(localStorage.getItem('flux_encrypted_files') || '{}');
        files[fileId] = encryptedFile;
        localStorage.setItem('flux_encrypted_files', JSON.stringify(files));
        
        const chatId = getChatId(currentUser.id, currentChat.id);
        const message = {
            id: Date.now(),
            senderId: currentUser.id,
            receiverId: currentChat.id,
            content: fileId,
            type: 'file',
            fileName: file.name,
            fileSize: file.size,
            timestamp: Date.now(),
            isRead: true
        };
        addMessageToChat(chatId, message);
        renderMessagesForChat(chatId);
        showToast('✅ Файл отправлен!');
    } else {
        showToast('❌ Не удалось отправить файл');
    }
}

// ============= ОТОБРАЖЕНИЕ СООБЩЕНИЙ =============
function renderMessagesForChat(chatId) {
    const messages = loadMessagesForChat(chatId);
    if (!messagesContainer) return;
    
    if (!messages || messages.length === 0) {
        messagesContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">💬 Нет сообщений. Начните диалог!</div>';
        return;
    }
    
    messagesContainer.innerHTML = messages.map(msg => {
        const isSent = msg.senderId === currentUser.id;
        if (msg.type === 'text') {
            return `<div class="message ${isSent ? 'sent' : 'received'}">
                        <div>${escapeHtml(msg.content)}</div>
                        <div class="message-time">${formatTime(msg.timestamp)}<span class="encrypted-badge">🔒</span></div>
                    </div>`;
        } else if (msg.type === 'file') {
            return `<div class="message ${isSent ? 'sent' : 'received'}">
                        <div class="message-file" data-file-id="${msg.content}" data-file-name="${msg.fileName}" data-file-size="${msg.fileSize}">
                            <span>📎</span>
                            <span>${escapeHtml(msg.fileName)}</span>
                            <span>(${formatFileSize(msg.fileSize)})</span>
                            <span class="encrypted-badge">🔒</span>
                        </div>
                        <div class="message-time">${formatTime(msg.timestamp)}</div>
                    </div>`;
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

async function downloadAndDecryptFile(fileId) {
    const sharedKey = userKeys.get(currentChat.id);
    if (!sharedKey) { showToast('❌ Ключ шифрования не найден'); return; }
    
    const files = JSON.parse(localStorage.getItem('flux_encrypted_files') || '{}');
    const encryptedFile = files[fileId];
    
    if (encryptedFile) {
        try {
            showToast('📥 Расшифровка файла...');
            const decryptedFile = await cryptoManager.decryptFileFromText(encryptedFile, sharedKey);
            const blob = new Blob([decryptedFile.data], { type: decryptedFile.type });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = decryptedFile.name;
            a.click();
            URL.revokeObjectURL(url);
            showToast('✅ Файл загружен!');
        } catch (error) {
            showToast('❌ Ошибка дешифрования файла');
        }
    } else {
        showToast('❌ Файл не найден');
    }
}

// ============= ВЫБОР ЧАТА =============
function selectChat(contact) {
    if (!contact) return;
    currentChat = contact;
    
    if (chatUsername) chatUsername.textContent = contact.username;
    if (chatCodeSpan) {
        chatCodeSpan.textContent = contact.userCode || '---';
        chatCodeSpan.onclick = () => copyToClipboard(contact.userCode);
    }
    if (copyChatCodeBtn) copyChatCodeBtn.onclick = () => copyToClipboard(contact.userCode);
    
    const isOnline = contact.status === 'online';
    if (chatStatus) {
        chatStatus.textContent = isOnline ? '🟢 В сети' : '⚫ Не в сети';
        chatStatus.className = isOnline ? 'chat-status online' : 'chat-status';
    }
    
    if (messageInput) messageInput.disabled = !isOnline;
    if (sendBtn) sendBtn.disabled = !isOnline;
    if (audioCallBtn) audioCallBtn.disabled = !isOnline;
    if (videoCallBtn) videoCallBtn.disabled = !isOnline;
    
    const chatId = getChatId(currentUser.id, contact.id);
    renderMessagesForChat(chatId);
    
    // Подсветка активного контакта
    document.querySelectorAll('.contact-item').forEach(item => {
        if (item.dataset.contactId === contact.id) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

// ============= ОБНОВЛЕНИЕ СТАТУСОВ =============
function setupRealtimeUsers() {
    if (statusUnsubscribe) statusUnsubscribe();
    
    const usersRef = collection(db, 'users');
    statusUnsubscribe = onSnapshot(usersRef, (snapshot) => {
        snapshot.forEach(doc => {
            const userData = doc.data();
            const contact = contacts.find(c => c.id === doc.id);
            if (contact) {
                contact.status = userData.status || 'offline';
                if (currentChat && currentChat.id === doc.id) {
                    const isOnline = contact.status === 'online';
                    if (chatStatus) {
                        chatStatus.textContent = isOnline ? '🟢 В сети' : '⚫ Не в сети';
                        chatStatus.className = isOnline ? 'chat-status online' : 'chat-status';
                    }
                    if (messageInput) messageInput.disabled = !isOnline;
                    if (sendBtn) sendBtn.disabled = !isOnline;
                    if (audioCallBtn) audioCallBtn.disabled = !isOnline;
                    if (videoCallBtn) videoCallBtn.disabled = !isOnline;
                }
            }
        });
        renderContacts();
    }, (error) => {
        console.error('Ошибка обновления статусов:', error);
    });
}

// ============= ЗВОНКИ =============
if (audioCallBtn) audioCallBtn.addEventListener('click', () => startCall(false));
if (videoCallBtn) videoCallBtn.addEventListener('click', () => startCall(true));

async function startCall(isVideo) {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
        if (localVideo) localVideo.srcObject = localStream;
        
        const peerConnection = peerConnections.get(currentChat.id);
        if (!peerConnection) { showToast('❌ Нет P2P соединения'); return; }
        
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        peerConnection.ontrack = (event) => {
            remoteStream = event.streams[0];
            if (remoteVideo) remoteVideo.srcObject = remoteStream;
        };
        
        if (callPanel) callPanel.classList.remove('hidden');
        currentCall = { peerConnection, isVideo };
    } catch (error) {
        showToast('❌ Не удалось начать звонок. Проверьте разрешения для камеры и микрофона.');
    }
}

if (endCallBtn) {
    endCallBtn.addEventListener('click', () => {
        if (currentCall) {
            if (localStream) localStream.getTracks().forEach(track => track.stop());
            if (callPanel) callPanel.classList.add('hidden');
            currentCall = null;
            localStream = null;
        }
    });
}

if (muteAudioBtn) {
    muteAudioBtn.addEventListener('click', () => {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            audioTrack.enabled = !audioTrack.enabled;
            muteAudioBtn.textContent = audioTrack.enabled ? '🎤' : '🔇';
        }
    });
}

if (muteVideoBtn) {
    muteVideoBtn.addEventListener('click', () => {
        if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                muteVideoBtn.textContent = videoTrack.enabled ? '📹' : '🚫';
            }
        }
    });
}

window.copyToClipboard = copyToClipboard;
console.log('✅ Flux Messenger загружен! Контакты сохраняются локально.');
