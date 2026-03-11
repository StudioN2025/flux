// Конфигурация Firebase для проекта flux-899a2
const firebaseConfig = {
    apiKey: "AIzaSyCLLbeXu-wCpXtnjBh81AZtwl_Trj8B1hQ",
    authDomain: "flux-899a2.firebaseapp.com",
    projectId: "flux-899a2",
    storageBucket: "flux-899a2.firebasestorage.app",
    messagingSenderId: "312898574184",
    appId: "1:312898574184:web:94688717e6b29deaa868dd"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
