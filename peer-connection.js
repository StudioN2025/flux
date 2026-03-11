// Класс для управления P2P соединениями
class PeerConnection {
    constructor(userId, userCode, userName) {
        this.userId = userId;
        this.userCode = userCode;
        this.userName = userName;
        this.connections = new Map(); // userId -> {peer, channel, status}
        this.pendingCandidates = new Map();
        this.messageHandlers = [];
        this.statusHandlers = [];
        
        // Конфигурация STUN серверов
        this.config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };
    }
    
    // Создать предложение для подключения к пользователю
    async createOffer(targetUserId, targetUserCode) {
        const peer = new RTCPeerConnection(this.config);
        const channel = peer.createDataChannel('chat', {
            ordered: true,
            maxRetransmits: 3
        });
        
        this.setupDataChannel(channel, targetUserId);
        this.setupPeerConnection(peer, targetUserId);
        
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        
        // Сохраняем peer
        this.connections.set(targetUserId, {
            peer,
            channel,
            status: 'connecting',
            userCode: targetUserCode
        });
        
        return {
            offer: peer.localDescription,
            fromUserId: this.userId,
            fromUserCode: this.userCode,
            fromUserName: this.userName,
            targetUserId
        };
    }
    
    // Обработать входящее предложение
    async handleOffer(offerData) {
        const { offer, fromUserId, fromUserCode, fromUserName } = offerData;
        
        const peer = new RTCPeerConnection(this.config);
        
        peer.ondatachannel = (event) => {
            const channel = event.channel;
            this.setupDataChannel(channel, fromUserId);
            
            // Сохраняем канал
            const conn = this.connections.get(fromUserId);
            if (conn) {
                conn.channel = channel;
            }
        };
        
        this.setupPeerConnection(peer, fromUserId);
        
        await peer.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        
        // Сохраняем peer
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
    }
    
    // Обработать ответ
    async handleAnswer(answerData) {
        const { answer, fromUserId } = answerData;
        const conn = this.connections.get(fromUserId);
        
        if (conn && conn.peer) {
            await conn.peer.setRemoteDescription(new RTCSessionDescription(answer));
            
            // Добавляем ожидающие ICE кандидаты
            const candidates = this.pendingCandidates.get(fromUserId) || [];
            for (const candidate of candidates) {
                await conn.peer.addIceCandidate(new RTCIceCandidate(candidate));
            }
            this.pendingCandidates.delete(fromUserId);
        }
    }
    
    // Обработать ICE кандидат
    async handleIceCandidate(candidateData) {
        const { candidate, fromUserId } = candidateData;
        const conn = this.connections.get(fromUserId);
        
        if (conn && conn.peer && conn.peer.remoteDescription) {
            await conn.peer.addIceCandidate(new RTCIceCandidate(candidate));
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
                // Отправляем кандидата через сигнальный сервер
                this.sendIceCandidate(targetUserId, event.candidate);
            }
        };
        
        peer.onconnectionstatechange = () => {
            console.log('Connection state:', peer.connectionState);
            
            if (peer.connectionState === 'connected') {
                const conn = this.connections.get(targetUserId);
                if (conn) {
                    conn.status = 'connected';
                    this.notifyStatusChange(targetUserId, 'connected');
                }
            } else if (peer.connectionState === 'disconnected' || 
                       peer.connectionState === 'failed') {
                const conn = this.connections.get(targetUserId);
                if (conn) {
                    conn.status = 'disconnected';
                    this.notifyStatusChange(targetUserId, 'disconnected');
                }
            }
        };
        
        peer.oniceconnectionstatechange = () => {
            console.log('ICE state:', peer.iceConnectionState);
        };
    }
    
    // Настройка DataChannel
    setupDataChannel(channel, targetUserId) {
        channel.onopen = () => {
            console.log('Channel opened with', targetUserId);
            const conn = this.connections.get(targetUserId);
            if (conn) {
                conn.status = 'connected';
                this.notifyStatusChange(targetUserId, 'connected');
            }
        };
        
        channel.onclose = () => {
            console.log('Channel closed with', targetUserId);
            const conn = this.connections.get(targetUserId);
            if (conn) {
                conn.status = 'disconnected';
                this.notifyStatusChange(targetUserId, 'disconnected');
            }
        };
        
        channel.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.notifyMessageReceived(targetUserId, message);
            } catch (e) {
                console.error('Error parsing message:', e);
            }
        };
        
        channel.onerror = (error) => {
            console.error('Channel error:', error);
        };
    }
    
    // Отправить сообщение
    sendMessage(targetUserId, message) {
        const conn = this.connections.get(targetUserId);
        
        if (conn && conn.channel && conn.channel.readyState === 'open') {
            message.timestamp = Date.now();
            message.messageId = this.generateMessageId();
            
            conn.channel.send(JSON.stringify(message));
            
            // Имитируем доставку и прочтение
            setTimeout(() => {
                this.notifyMessageStatus(targetUserId, message.messageId, 'delivered');
            }, 500);
            
            return true;
        }
        
        return false;
    }
    
    // Отправить уведомление о печатании
    sendTyping(targetUserId, isTyping) {
        const conn = this.connections.get(targetUserId);
        
        if (conn && conn.channel && conn.channel.readyState === 'open') {
            conn.channel.send(JSON.stringify({
                type: 'typing',
                isTyping,
                fromUserId: this.userId
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
                fromUserId: this.userId
            }));
        }
    }
    
    // Отправить ICE кандидат через сигнальный сервер
    async sendIceCandidate(targetUserId, candidate) {
        // Будет реализовано через Firebase
        if (window.firebaseSignal) {
            await window.firebaseSignal.sendIceCandidate(targetUserId, candidate);
        }
    }
    
    // Добавить обработчик сообщений
    onMessage(handler) {
        this.messageHandlers.push(handler);
    }
    
    // Добавить обработчик статуса
    onStatusChange(handler) {
        this.statusHandlers.push(handler);
    }
    
    // Уведомить о получении сообщения
    notifyMessageReceived(fromUserId, message) {
        this.messageHandlers.forEach(handler => handler(fromUserId, message));
    }
    
    // Уведомить об изменении статуса
    notifyStatusChange(userId, status) {
        this.statusHandlers.forEach(handler => handler(userId, status));
    }
    
    // Уведомить о статусе сообщения
    notifyMessageStatus(userId, messageId, status) {
        // Можно реализовать через события
    }
    
    // Генерация ID сообщения
    generateMessageId() {
        return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
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
          }
