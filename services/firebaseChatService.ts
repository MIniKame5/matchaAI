
import { db } from './firebaseChatConfig';
import { collection, addDoc, query, orderBy, onSnapshot, getDocs, doc, updateDoc, serverTimestamp, limit, deleteDoc } from 'firebase/firestore';
import { ChatSession, Message } from '../types';

const CHATS_COLLECTION = 'chats';
const MESSAGES_SUBCOLLECTION = 'messages';

/**
 * Chatセッションを作成し、最初のメッセージを保存する
 * @param userId 現在のユーザーID
 * @param firstMessageText 最初のユーザーメッセージのテキスト
 * @returns 作成されたChatSessionオブジェクト
 */
export const createChatSession = async (userId: string, firstMessageText: string): Promise<ChatSession> => {
  if (!db) throw new Error("Firestore DB not initialized.");

  const newChatRef = await addDoc(collection(db, CHATS_COLLECTION), {
    userId: userId,
    title: generateChatTitle(firstMessageText),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    isPinned: false,
    groupName: null
  });

  const newChatSession: ChatSession = {
    id: newChatRef.id,
    userId: userId,
    title: generateChatTitle(firstMessageText),
    updatedAt: Date.now(), // Client-side timestamp for immediate UI update
  };
  return newChatSession;
};

/**
 * 指定されたチャットセッションにメッセージを保存する
 * @param chatSessionId チャットセッションID
 * @param message 保存するメッセージオブジェクト
 * @param userId 現在のユーザーID
 */
export const saveMessageToChat = async (chatSessionId: string, message: Omit<Message, 'id'>, userId: string) => {
  if (!db) throw new Error("Firestore DB not initialized.");
  if (!chatSessionId) throw new Error("Chat Session ID is required to save a message.");

  const messageData: any = {
    ...message,
    userId: userId, // メッセージにもユーザーIDを紐付け
  };

  // imageがundefinedの場合は保存しない（Firestoreはundefinedを嫌うことがあるため）
  if (message.image === undefined) {
    delete messageData.image;
  }

  await addDoc(collection(db, CHATS_COLLECTION, chatSessionId, MESSAGES_SUBCOLLECTION), messageData);
};

/**
 * 指定されたチャットセッションの最終更新日時を更新する
 * @param chatSessionId チャットセッションID
 * @param userId 現在のユーザーID
 */
export const updateChatSessionTimestamp = async (chatSessionId: string, userId: string) => {
  if (!db) throw new Error("Firestore DB not initialized.");
  if (!chatSessionId) throw new Error("Chat Session ID is required to update timestamp.");

  const chatRef = doc(db, CHATS_COLLECTION, chatSessionId);
  await updateDoc(chatRef, {
    updatedAt: serverTimestamp(),
    userId: userId, // 念のため、更新時にもuserIdを明示
  });
};

/**
 * チャットセッションの情報を更新する（タイトル変更、ピン留め、グループ化など）
 */
export const updateChatSession = async (chatSessionId: string, updates: Partial<ChatSession>) => {
  if (!db) throw new Error("Firestore DB not initialized.");
  
  const chatRef = doc(db, CHATS_COLLECTION, chatSessionId);
  
  // Firestoreに保存するフィールドだけを抽出
  const firestoreUpdates: any = {};
  if (updates.title !== undefined) firestoreUpdates.title = updates.title;
  if (updates.isPinned !== undefined) firestoreUpdates.isPinned = updates.isPinned;
  if (updates.groupName !== undefined) firestoreUpdates.groupName = updates.groupName;
  
  await updateDoc(chatRef, firestoreUpdates);
};

/**
 * チャットセッションを削除する
 */
export const deleteChatSession = async (chatSessionId: string) => {
  if (!db) throw new Error("Firestore DB not initialized.");
  
  // 1. まずサブコレクションのメッセージを削除（クライアントSDKではサブコレクションの一括削除が難しいため、本来はCloud Functions推奨だが、ここでは簡易的にドキュメント削除のみ行う）
  // 注意: Firestoreの仕様上、親ドキュメントを消してもサブコレクションは残りますが、UIからは見えなくなります。
  // 完全なクリーンアップにはCloud Functionsが必要ですが、今回は親の削除のみ実装します。
  
  await deleteDoc(doc(db, CHATS_COLLECTION, chatSessionId));
};

/**
 * 指定されたユーザーの全てのチャットセッションをリアルタイムで購読する
 * @param userId ユーザーID
 * @param callback ChatSession[]を受け取るコールバック関数
 * @returns 購読解除関数
 */
export const loadChatSessions = (userId: string, callback: (sessions: ChatSession[]) => void) => {
  if (!db) {
    console.warn("Firestore DB not initialized. Cannot load chat sessions.");
    callback([]);
    return () => {}; // No-op unsubscribe
  }

  const q = query(
    collection(db, CHATS_COLLECTION),
    // where("userId", "==", userId), // uncomment if you implement user-specific filtering
    orderBy('updatedAt', 'desc'),
    limit(50) // 少し多めに取得
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const sessions: ChatSession[] = snapshot.docs.map(doc => {
      const data = doc.data();
      
      // Handle timestamp being either a Firestore Timestamp or a number
      let updatedAt: number;
      if (data.updatedAt && typeof data.updatedAt.toDate === 'function') {
        updatedAt = data.updatedAt.toDate().getTime();
      } else if (typeof data.updatedAt === 'number') {
        updatedAt = data.updatedAt;
      } else {
        updatedAt = Date.now();
      }

      return {
        id: doc.id,
        title: data.title,
        updatedAt: updatedAt,
        userId: data.userId || 'unknown',
        isPinned: data.isPinned || false,
        groupName: data.groupName || null
      };
    });
    callback(sessions);
  }, (error) => {
    console.error("Error loading chat sessions:", error);
    callback([]);
  });

  return unsubscribe;
};

/**
 * 指定されたチャットセッションのメッセージを読み込む
 * @param chatSessionId チャットセッションID
 * @param userId 現在のユーザーID
 * @returns メッセージの配列
 */
export const loadMessagesForChat = async (chatSessionId: string, userId: string): Promise<Message[]> => {
  if (!db) throw new Error("Firestore DB not initialized.");
  if (!chatSessionId) return [];

  const q = query(
    collection(db, CHATS_COLLECTION, chatSessionId, MESSAGES_SUBCOLLECTION),
    orderBy('timestamp', 'asc')
  );
  const querySnapshot = await getDocs(q);
  const messages: Message[] = querySnapshot.docs.map(doc => {
    const data = doc.data();
    
    // Handle timestamp being either a Firestore Timestamp or a number
    let timestamp: number;
    if (data.timestamp && typeof data.timestamp.toDate === 'function') {
      timestamp = data.timestamp.toDate().getTime();
    } else if (typeof data.timestamp === 'number') {
      timestamp = data.timestamp;
    } else {
      timestamp = Date.now();
    }

    return {
      role: data.role,
      text: data.text,
      timestamp: timestamp,
      image: data.image || undefined
    };
  });
  return messages;
};

/**
 * 最初のメッセージからチャットタイトルを生成するヘルパー関数
 * @param firstMessageText 最初のユーザーメッセージ
 * @returns 生成されたタイトル
 */
const generateChatTitle = (firstMessageText: string): string => {
  // 最初のメッセージの冒頭をタイトルにする
  return firstMessageText.length > 30 ? firstMessageText.substring(0, 30) + '...' : firstMessageText;
};
