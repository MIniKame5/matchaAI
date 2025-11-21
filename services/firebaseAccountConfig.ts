import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";

// アカウント専用のFirebase設定 - 実際の値に置き換えてください
const accountFirebaseConfig = {
  apiKey: "AIzaSyBzNGiNmNhNs_EZdLTVTmJ6YZM-oUmv0eo",
  authDomain: "matcha-account-matcha-kame.firebaseapp.com",
  projectId: "matcha-account-matcha-kame",
  storageBucket: "matcha-account-matcha-kame.firebasestorage.app",
  messagingSenderId: "895445531816",
  appId: "1:895445531816:web:9e53d85e94493e4e14169d",
};

let accountApp: FirebaseApp | undefined;
let auth: Auth | undefined;

try {
  // 実際のキーが設定されている場合のみ初期化を試みる
  if (accountFirebaseConfig.apiKey && accountFirebaseConfig.projectId && accountFirebaseConfig.apiKey !== "YOUR_FIREBASE_ACCOUNT_API_KEY") {
    accountApp = getApps().find(app => app.name === "accountApp") || initializeApp(accountFirebaseConfig, "accountApp");
    auth = getAuth(accountApp);
    console.log("Firebase Account App initialized.");
  } else {
    console.warn("Firebase Account configuration is incomplete or using placeholder values. Account features will be unavailable.");
  }
} catch (error) {
  console.error("Failed to initialize Firebase Account App:", error);
  auth = undefined; // エラー時にはauthを未定義にする
}

export { auth };