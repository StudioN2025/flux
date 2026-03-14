// Конфигурация Firebase для проекта flux-899a2
const firebaseConfig = {
  apiKey: "AIzaSyBMHBR2bLJYCq16gK-e7QaxN0ummuN_ZIo",
  authDomain: "flux-messenger-bbf58.firebaseapp.com",
  projectId: "flux-messenger-bbf58",
  storageBucket: "flux-messenger-bbf58.firebasestorage.app",
  messagingSenderId: "143785700355",
  appId: "1:143785700355:web:47283406a08c5a09e87236"
};


// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Разрешаем использование localhost для разработки
auth.useDeviceLanguage();
