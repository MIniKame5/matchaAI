
import { db } from './firebaseChatConfig';
import { collection, addDoc, query, orderBy, onSnapshot, getDocs, doc, updateDoc, serverTimestamp, limit, deleteDoc } from 'firebase/firestore';
import { ChatSession, Message } from '../types';

const USERS_COLLECTION = 'users';
const CHATS_SUBCOLLECTION = 'chats';
const MESSAGES_SUBCOLLECTION = 'messages';

/**
 * Chatセッションを作成し、最初のメッセージを保存する
 * 構造: users/{userId}/chats/{chatId}
 */
export const createChatSession = async (userId: string, firstMessageText: string): Promise<ChatSession> => {
  if (!db) throw new Error("Firestore DB not initialized.");

  // ユーザーごとのサブコレクションにチャットを作成
  const userChatsRef = collection(db, USERS_COLLECTION, userId, CHATS_SUBCOLLECTION);
  
  const newChatRef = await addDoc(userChatsRef, {
    userId: userId, // 念のためドキュメント内にも保持
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
    updatedAt: Date.now(),
  };
  return newChatSession;
};

/**
 * 指定されたチャットセッションにメッセージを保存する
 * 構造: users/{userId}/chats/{chatId}/messages/{messageId}
 */
export const saveMessageToChat = async (chatSessionId: string, message: Omit<Message, 'id'>, userId: string) => {
  if (!db) throw new Error("Firestore DB not initialized.");
  if (!chatSessionId || !userId) throw new Error("Chat Session ID and User ID are required.");

  const messageData: any = {
    ...message,
    userId: userId,
  };

  if (message.image === undefined) {
    delete messageData.image;
  }

  // パス: users/{userId}/chats/{chatId}/messages
  await addDoc(collection(db, USERS_COLLECTION, userId, CHATS_SUBCOLLECTION, chatSessionId, MESSAGES_SUBCOLLECTION), messageData);
};

/**
 * 指定されたチャットセッションの最終更新日時を更新する
 */
export const updateChatSessionTimestamp = async (chatSessionId: string, userId: string) => {
  if (!db) throw new Error("Firestore DB not initialized.");
  if (!chatSessionId || !userId) throw new Error("IDs required.");

  const chatRef = doc(db, USERS_COLLECTION, userId, CHATS_SUBCOLLECTION, chatSessionId);
  await updateDoc(chatRef, {
    updatedAt: serverTimestamp(),
  });
};

/**
 * チャットセッションの情報を更新する（タイトル変更、ピン留め、グループ化など）
 */
export const updateChatSession = async (userId: string, chatSessionId: string, updates: Partial<ChatSession>) => {
  if (!db) throw new Error("Firestore DB not initialized.");
  if (!userId || !chatSessionId) throw new Error("IDs required.");
  
  const chatRef = doc(db, USERS_COLLECTION, userId, CHATS_SUBCOLLECTION, chatSessionId);
  
  const firestoreUpdates: any = {};
  if (updates.title !== undefined) firestoreUpdates.title = updates.title;
  if (updates.isPinned !== undefined) firestoreUpdates.isPinned = updates.isPinned;
  if (updates.groupName !== undefined) firestoreUpdates.groupName = updates.groupName;
  
  await updateDoc(chatRef, firestoreUpdates);
};

/**
 * チャットセッションを削除する
 */
export const deleteChatSession = async (userId: string, chatSessionId: string) => {
  if (!db) throw new Error("Firestore DB not initialized.");
  if (!userId || !chatSessionId) throw new Error("IDs required.");
  
  // パス: users/{userId}/chats/{chatId}
  await deleteDoc(doc(db, USERS_COLLECTION, userId, CHATS_SUBCOLLECTION, chatSessionId));
};

/**
 * 指定されたユーザーの全てのチャットセッションをリアルタイムで購読する
 * パス: users/{userId}/chats
 */
export const loadChatSessions = (userId: string, callback: (sessions: ChatSession[]) => void) => {
  if (!db) {
    console.warn("Firestore DB not initialized. Cannot load chat sessions.");
    callback([]);
    return () => {}; 
  }

  // ユーザー専用のコレクションをクエリするため、where句は不要になり、単純なcollection参照で済みます
  const q = query(
    collection(db, USERS_COLLECTION, userId, CHATS_SUBCOLLECTION),
    orderBy('updatedAt', 'desc'),
    limit(50)
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const sessions: ChatSession[] = snapshot.docs.map(doc => {
      const data = doc.data();
      
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
        userId: data.userId || userId,
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
 */
export const loadMessagesForChat = async (chatSessionId: string, userId: string): Promise<Message[]> => {
  if (!db) throw new Error("Firestore DB not initialized.");
  if (!chatSessionId || !userId) return [];

  const q = query(
    collection(db, USERS_COLLECTION, userId, CHATS_SUBCOLLECTION, chatSessionId, MESSAGES_SUBCOLLECTION),
    orderBy('timestamp', 'asc')
  );
  
  const querySnapshot = await getDocs(q);
  const messages: Message[] = querySnapshot.docs.map(doc => {
    const data = doc.data();
    
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

const generateChatTitle = (firstMessageText: string): string => {
  return firstMessageText.length > 30 ? firstMessageText.substring(0, 30) + '...' : firstMessageText;
};
