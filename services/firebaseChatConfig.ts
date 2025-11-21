import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";

// 会話履歴専用のFirebase設定 - 実際の値に置き換えてください
const chatFirebaseConfig = {
  apiKey: "AIzaSyBilK_qMzJGL9nPMG57LPAgTeodwXCr7Vg",
  authDomain: "matcha-ai-matcha-kame.firebaseapp.com",
  projectId: "matcha-ai-matcha-kame",
  storageBucket: "matcha-ai-matcha-kame.firebasestorage.app",
  messagingSenderId: "829636661902",
  appId: "1:829636661902:web:2dc93a91ad6a5892622fdf",
};

let chatApp: FirebaseApp | undefined;
let db: Firestore | undefined;

try {
  // 実際のキーが設定されている場合のみ初期化を試みる
  if (chatFirebaseConfig.apiKey && chatFirebaseConfig.projectId && chatFirebaseConfig.apiKey !== "YOUR_FIREBASE_CHAT_API_KEY") {
    chatApp = getApps().find(app => app.name === "chatApp") || initializeApp(chatFirebaseConfig, "chatApp");
    db = getFirestore(chatApp);
    console.log("Firebase Chat App initialized.");
  } else {
    console.warn("Firebase Chat configuration is incomplete or using placeholder values. Chat history features will be unavailable.");
  }
} catch (error) {
  console.error("Failed to initialize Firebase Chat App:", error);
  db = undefined; // エラー時にはdbを未定義にする
}

export { db };