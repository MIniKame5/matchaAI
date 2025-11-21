
export interface Message {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  image?: string; // Base64 string for image content
}

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  userId: string; // Add userId to associate chat sessions with users
  groupName?: string; // グループ分け用
  isPinned?: boolean; // ピン留め用
}

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export enum Language {
  JA = 'ja',
  EN = 'en'
}

export interface AppState {
  language: Language;
  isSidebarOpen: boolean;
  isLoading: boolean;
  input: string;
}

export type AuthModalMode = 'login' | 'signup';
