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

// ==================== СИГНАЛЬНЫЙ СЕРВЕР FIREBASE ====================
const signalServer = {
    // Слушаем входящие сигналы
    listenForSignals: async () => {
        if (!currentUser) return;
        
        db.collection('signals')
            .where('targetUserId', '==', currentUser.uid)
            .onSnapshot(async (snapshot) => {
                snapshot.docChanges().forEach(async (change) => {
                    if (change.type === 'added') {
                        const signal = change.doc.data();
                        
                        try {
                            switch (signal.type) {
                                case 'offer':
                                    await handleIncomingOffer(signal);
                                    break;
                                case 'answer':
                                    await peerConnection?.handleAnswer(signal);
                                    break;
                                case 'candidate':
                                    await peerConnection?.handleIceCandidate(signal);
                                    break;
                                case 'call':
                                    await handleIncomingCall(signal);
                                    break;
                            }
                        } catch (error) {
                            console.error('Error processing signal:', error);
                        }
                        
                        // Удаляем обработанный сигнал
                        await change.doc.ref.delete();
                    }
                });
            }, (error) => {
                console.error('Error listening to signals:', error);
            });
    },
    
    // Отправить сигнал
    sendSignal: async (targetUserId, signalData) => {
        if (!currentUser) return false;
        
        try {
            await db.collection('signals').add({
                ...signalData,
                targetUserId,
                fromUserId: currentUser.uid,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            return true;
        } catch (error) {
            console.error('Error sending signal:', error);
            return false;
        }
    },
    
    // Отправить предложение
    sendOffer: async (targetUserId, offerData) => {
        return signalServer.sendSignal(targetUserId, {
            ...offerData,
            type: 'offer'
        });
    },
    
    // Отправить ответ
    sendAnswer: async (targetUserId, answerData) => {
        return signalServer.sendSignal(targetUserId, {
            ...answerData,
            type: 'answer'
        });
    },
    
    // Отправить ICE кандидат
    sendIceCandidate: async (targetUserId, candidate) => {
        return signalServer.sendSignal(targetUserId, {
            type: 'candidate',
            candidate,
            fromUserId: currentUser.uid
        });
    }
};

// ==================== P2P СОЕДИНЕНИЕ ====================
class PeerConnection {
    constructor(userId, userCode, userName) {
        this.userId = userId;
        this.userCode = userCode;
        this.userName = userName;
        this.connections = new Map(); // userId -> {peer, channel, status, userCode, userName}
        this.pendingCandidates = new Map();
        this.messageHandlers = [];
        this.statusHandlers = [];
        this.typingHandlers = [];
        this.readReceiptHandlers = [];
        
        // Конфигурация STUN серверов
        this.config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' },
                { urls: 'stun:stun.services.mozilla.com' }
            ],
            iceCandidatePoolSize: 10
        };
    }
    
    // Создать предложение для подключения
    async createOffer(targetUserId, targetUserCode, targetUserName) {
        try {
            const peer = new RTCPeerConnection(this.config);
            const channel = peer.createDataChannel('chat', {
                ordered: true,
                maxRetransmits: 3
            });
            
            this.setupDataChannel(channel, targetUserId);
            this.setupPeerConnection(peer, targetUserId);
            
            const offer = await peer.createOffer({
                offerToReceiveAudio: false,
                offerToReceiveVideo: false
            });
            
            await peer.setLocalDescription(offer);
            
            // Сохраняем соединение
            this.connections.set(targetUserId, {
                peer,
                channel,
                status: 'connecting',
                userCode: targetUserCode,
                userName: targetUserName
            });
            
            return {
                offer: peer.localDescription,
                fromUserId: this.userId,
                fromUserCode: this.userCode,
                fromUserName: this.userName,
                targetUserId
            };
        } catch (error) {
            console.error('Error creating offer:', error);
            throw error;
        }
    }
    
    // Обработать входящее предложение
    async handleOffer(offerData) {
        const { offer, fromUserId, fromUserCode, fromUserName } = offerData;
        
        try {
            const peer = new RTCPeerConnection(this.config);
            
            peer.ondatachannel = (event) => {
                const channel = event.channel;
                this.setupDataChannel(channel, fromUserId);
                
                const conn = this.connections.get(fromUserId);
                if (conn) {
                    conn.channel = channel;
                }
            };
            
            this.setupPeerConnection(peer, fromUserId);
            
            await peer.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            
            // Сохраняем соединение
            this.connections.set(fromUserId, {
                peer,
                status: 'connecting',
                userCode: fromUserCode,
                userName: fromUserName
            });
            
            return {
                answer: peer.localDescription,
                fromUserId: this.userId,
                fromUserCode: this.userCode,
                targetUserId: fromUserId
            };
        } catch (error) {
            console.error('Error handling offer:', error);
            throw error;
        }
    }
    
    // Обработать ответ
    async handleAnswer(answerData) {
        const { answer, fromUserId } = answerData;
        const conn = this.connections.get(fromUserId);
        
        if (conn && conn.peer) {
            try {
                await conn.peer.setRemoteDescription(new RTCSessionDescription(answer));
                
                // Добавляем ожидающие ICE кандидаты
                const candidates = this.pendingCandidates.get(fromUserId) || [];
                for (const candidate of candidates) {
                    await conn.peer.addIceCandidate(new RTCIceCandidate(candidate));
                }
                this.pendingCandidates.delete(fromUserId);
            } catch (error) {
                console.error('Error handling answer:', error);
            }
        }
    }
    
    // Обработать ICE кандидат
    async handleIceCandidate(candidateData) {
        const { candidate, fromUserId } = candidateData;
        const conn = this.connections.get(fromUserId);
        
        if (conn && conn.peer && conn.peer.remoteDescription) {
            try {
                await conn.peer.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
                console.error('Error adding ICE candidate:', error);
            }
        } else {
            // Сохраняем кандидата для будущего использования
            if (!this.pendingCandidates.has(fromUserId)) {
                this.pendingCandidates.set(fromUserId, []);
            }
            this.pendingCandidates.get(fromUserId).push(candidate);
        }
    }
    
    // Настройка PeerConnection
    setupPeerConnection(peer, targetUserId) {
        peer.onicecandidate = (event) => {
            if (event.candidate) {
                signalServer.sendIceCandidate(targetUserId, event.candidate);
            }
        };
        
        peer.oniceconnectionstatechange = () => {
            console.log(`ICE connection state with ${targetUserId}:`, peer.iceConnectionState);
            
            if (peer.iceConnectionState === 'connected' || 
                peer.iceConnectionState === 'completed') {
                this.updateConnectionStatus(targetUserId, 'connected');
            } else if (peer.iceConnectionState === 'disconnected' ||
                       peer.iceConnectionState === 'failed') {
                this.updateConnectionStatus(targetUserId, 'disconnected');
            }
        };
        
        peer.onconnectionstatechange = () => {
            console.log(`Connection state with ${targetUserId}:`, peer.connectionState);
            
            if (peer.connectionState === 'connected') {
                this.updateConnectionStatus(targetUserId, 'connected');
            } else if (peer.connectionState === 'disconnected' ||
                       peer.connectionState === 'failed') {
                this.updateConnectionStatus(targetUserId, 'disconnected');
            }
        };
        
        peer.onicecandidateerror = (error) => {
            console.error('ICE candidate error:', error);
        };
    }
    
    // Настройка DataChannel
    setupDataChannel(channel, targetUserId) {
        channel.onopen = () => {
            console.log('Data channel opened with', targetUserId);
            this.updateConnectionStatus(targetUserId, 'connected');
            
            // Отправляем приветственное сообщение
            this.sendSystemMessage(targetUserId, 'connected');
        };
        
        channel.onclose = () => {
            console.log('Data channel closed with', targetUserId);
            this.updateConnectionStatus(targetUserId, 'disconnected');
        };
        
        channel.onerror = (error) => {
            console.error('Data channel error:', error);
            this.updateConnectionStatus(targetUserId, 'error');
        };
        
        channel.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                switch (data.type) {
                    case 'message':
                        this.handleIncomingMessage(targetUserId, data);
                        break;
                    case 'typing':
                        this.handleTypingIndicator(targetUserId, data);
                        break;
                    case 'read':
                        this.handleReadReceipt(targetUserId, data);
                        break;
                    case 'system':
                        this.handleSystemMessage(targetUserId, data);
                        break;
                }
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        };
    }
    
    // Обновить статус соединения
    updateConnectionStatus(userId, status) {
        const conn = this.connections.get(userId);
        if (conn) {
            conn.status = status;
            this.statusHandlers.forEach(handler => handler(userId, status));
        }
    }
    
    // Отправить сообщение
    sendMessage(targetUserId, message) {
        const conn = this.connections.get(targetUserId);
        
        if (conn && conn.channel && conn.channel.readyState === 'open') {
            const messageData = {
                type: 'message',
                id: this.generateMessageId(),
                text: message.text,
                fromUserId: this.userId,
                toUserId: targetUserId,
                timestamp: Date.now(),
                status: 'sent'
            };
            
            try {
                conn.channel.send(JSON.stringify(messageData));
                
                // Имитируем доставку
                setTimeout(() => {
                    this.simulateDelivery(targetUserId, messageData.id);
                }, 1000);
                
                return messageData;
            } catch (error) {
                console.error('Error sending message:', error);
                return null;
            }
        }
        
        return null;
    }
    
    // Симулировать доставку
    simulateDelivery(userId, messageId) {
        const conn = this.connections.get(userId);
        if (conn && conn.channel && conn.channel.readyState === 'open') {
            conn.channel.send(JSON.stringify({
                type: 'delivered',
                messageId,
                fromUserId: userId
            }));
        }
    }
    
    // Отправить системное сообщение
    sendSystemMessage(targetUserId, type) {
        const conn = this.connections.get(targetUserId);
        if (conn && conn.channel && conn.channel.readyState === 'open') {
            conn.channel.send(JSON.stringify({
                type: 'system',
                systemType: type,
                fromUserId: this.userId,
                timestamp: Date.now()
            }));
        }
    }
    
    // Отправить индикатор печатания
    sendTyping(targetUserId, isTyping) {
        const conn = this.connections.get(targetUserId);
        if (conn && conn.channel && conn.channel.readyState === 'open') {
            conn.channel.send(JSON.stringify({
                type: 'typing',
                isTyping,
                fromUserId: this.userId,
                timestamp: Date.now()
            }));
        }
    }
    
    // Отправить подтверждение прочтения
    sendReadReceipt(targetUserId, messageIds) {
        const conn = this.connections.get(targetUserId);
        if (conn && conn.channel && conn.channel.readyState === 'open') {
            conn.channel.send(JSON.stringify({
                type: 'read',
                messageIds,
                fromUserId: this.userId,
                timestamp: Date.now()
            }));
        }
    }
    
    // Обработать входящее сообщение
    handleIncomingMessage(fromUserId, data) {
        // Сохраняем сообщение
        if (!messages.has(fromUserId)) {
            messages.set(fromUserId, []);
        }
        messages.get(fromUserId).push(data);
        
        // Уведомляем обработчики
        this.messageHandlers.forEach(handler => handler(fromUserId, data));
        
        // Автоматически отправляем подтверждение прочтения, если чат открыт
        if (activeChat === fromUserId) {
            this.sendReadReceipt(fromUserId, [data.id]);
        }
    }
    
    // Обработать индикатор печатания
    handleTypingIndicator(fromUserId, data) {
        this.typingHandlers.forEach(handler => handler(fromUserId, data.isTyping));
    }
    
    // Обработать подтверждение прочтения
    handleReadReceipt(fromUserId, data) {
        this.readReceiptHandlers.forEach(handler => handler(fromUserId, data.messageIds));
    }
    
    // Обработать системное сообщение
    handleSystemMessage(fromUserId, data) {
        console.log('System message:', data);
    }
    
    // Генерация ID сообщения
    generateMessageId() {
        return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }
    
    // Добавить обработчик сообщений
    onMessage(handler) {
        this.messageHandlers.push(handler);
    }
    
    // Добавить обработчик статуса
    onStatusChange(handler) {
        this.statusHandlers.push(handler);
    }
    
    // Добавить обработчик печатания
    onTyping(handler) {
        this.typingHandlers.push(handler);
    }
    
    // Добавить обработчик прочтения
    onReadReceipt(handler) {
        this.readReceiptHandlers.push(handler);
    }
    
    // Получить статус соединения
    getConnectionStatus(userId) {
        const conn = this.connections.get(userId);
        return conn ? conn.status : 'disconnected';
    }
    
    // Получить информацию о пользователе
    getUserInfo(userId) {
        const conn = this.connections.get(userId);
        return conn ? {
            userCode: conn.userCode,
            userName: conn.userName,
            status: conn.status
        } : null;
    }
    
    // Закрыть соединение
    closeConnection(userId) {
        const conn = this.connections.get(userId);
        if (conn) {
            if (conn.channel) conn.channel.close();
            if (conn.peer) conn.peer.close();
            this.connections.delete(userId);
        }
    }
    
    // Закрыть все соединения
    closeAllConnections() {
        for (const [userId, conn] of this.connections) {
            if (conn.channel) conn.channel.close();
            if (conn.peer) conn.peer.close();
        }
        this.connections.clear();
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

// Регистрация
async function register() {
    const username = document.getElementById('username')?.value.trim();
    const email = document.getElementById('email')?.value;
    const password = document.getElementById('password')?.value;
    
    if (!username || !email || !password) {
        showNotification('Пожалуйста, заполните все поля', 'error');
        return;
    }
    
    if (password.length < 6) {
        showNotification('Пароль должен быть не менее 6 символов', 'error');
        return;
    }
    
    if (!isValidEmail(email)) {
        showNotification('Введите корректный email', 'error');
        return;
    }
    
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const userCode = generateUserCode();
        
        // Создаем профиль пользователя
        await db.collection('users').doc(userCredential.user.uid).set({
            username: username,
            email: email,
            code: userCode,
            online: true,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showNotification(`✅ Регистрация успешна!\nВаш уникальный код: ${userCode}`, 'success', 10000);
        
        // Очищаем поля
        document.getElementById('username').value = '';
        document.getElementById('email').value = '';
        document.getElementById('password').value = '';
        
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
          
