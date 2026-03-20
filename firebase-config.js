// Конфигурация Firebase для проекта flux-messenger-bbf58
const firebaseConfig = {
    apiKey: "AIzaSyBMHBR2bLJYCq16gK-e7QaxN0ummuN_ZIo",
    authDomain: "flux-messenger-bbf58.firebaseapp.com",
    projectId: "flux-messenger-bbf58",
    storageBucket: "flux-messenger-bbf58.firebasestorage.app",
    messagingSenderId: "ТВОЙ_ID",
    appId: "ТВОЙ_APP_ID"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
