
import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquarePlus, 
  Settings, 
  Image as ImageIcon, 
  Send, 
  Menu, 
  X, 
  AlertTriangle,
  History,
  User as UserIcon,
  LogOut,
  MoreHorizontal,
  Pin,
  PinOff,
  Trash2,
  Edit2,
  FolderInput,
  ChevronDown,
  ChevronRight,
  Folder,
  Download,
  Maximize2
} from 'lucide-react';
import { auth } from './services/firebaseAccountConfig'; // Firebase Account Authをインポート
import { db } from './services/firebaseChatConfig'; // Firebase Chat Firestoreをインポート
import { User, onAuthStateChanged, signOut } from 'firebase/auth'; // Import User and onAuthStateChanged from firebase/auth
import { 
  createChatSession, 
  saveMessageToChat, 
  updateChatSessionTimestamp, 
  loadChatSessions, 
  loadMessagesForChat,
  updateChatSession,
  deleteChatSession
} from './services/firebaseChatService';
import { sendMessageToGemini } from './services/geminiService';
import { Message, Language, ChatSession, AuthModalMode } from './types';
import { MatchaIcon } from './components/Icons';
import { AuthModal } from './components/auth/AuthModal';

const App: React.FC = () => {
  // --- State ---
  const [language, setLanguage] = useState<Language>(Language.JA);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // For mobile
  
  const [user, setUser] = useState<User | null>(null); // Firebase User object
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [recentChats, setRecentChats] = useState<ChatSession[]>([]);

  // Chat Management State
  const [activeMenuChatId, setActiveMenuChatId] = useState<string | null>(null);
  const [editingChat, setEditingChat] = useState<ChatSession | null>(null);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupValue, setGroupValue] = useState('');

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<ChatSession | null>(null);
  
  // Group collapse state (map of groupName -> boolean)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Auth Modal State
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('login');

  // Image Lightbox State
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Firebaseの利用可能性をチェック
  const firebaseAccountAvailable = !!auth;
  const firebaseChatAvailable = !!db;
  const isFirebaseTotallyConfigured = firebaseAccountAvailable && firebaseChatAvailable;

  const activeUserId = user?.uid || (firebaseAccountAvailable ? null : 'anonUser');

  // --- Helper ---
  const cleanText = (text: string) => {
    // Remove <think> tags and their content, case insensitive (/i), global (/g)
    if (!text) return "";
    return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  };

  // --- Effects ---
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenuChatId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Effect to handle user authentication state changes
  useEffect(() => {
    if (firebaseAccountAvailable && auth) {
      const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        setUser(firebaseUser);
      });
      return () => unsubscribe();
    } else if (!firebaseAccountAvailable) {
      setUser(null);
    }
  }, [firebaseAccountAvailable]);

  // Effect to load recent chats
  useEffect(() => {
    let unsubscribeChatSessions: () => void;

    if (activeUserId && firebaseChatAvailable) {
      unsubscribeChatSessions = loadChatSessions(activeUserId, (sessions) => {
        setRecentChats(sessions);
        if (!currentChatId || !sessions.some(s => s.id === currentChatId)) {
          if (sessions.length > 0) {
            const mostRecentChat = sessions.sort((a, b) => b.updatedAt - a.updatedAt)[0];
            handleSelectChat(mostRecentChat.id);
          } else {
            setMessages([]);
            setCurrentChatId(null);
          }
        }
      });
    } else {
      setRecentChats([]);
      setMessages([]);
      setCurrentChatId(null);
    }

    return () => {
      if (unsubscribeChatSessions) {
        unsubscribeChatSessions();
      }
    };
  }, [activeUserId, firebaseChatAvailable]);


  // --- Handlers ---
  const handleSend = async () => {
    if (!input.trim() || isLoading || !firebaseChatAvailable) return;

    if (!activeUserId) {
      if (firebaseAccountAvailable) {
          openAuthModal('login');
          return;
      }
    }

    const userMsg: Message = {
      role: 'user',
      text: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      let chatSessionId = currentChatId;

      if (!chatSessionId && activeUserId) {
        const newChat = await createChatSession(activeUserId, userMsg.text);
        chatSessionId = newChat.id;
        setCurrentChatId(chatSessionId);
      }

      if (chatSessionId && activeUserId) {
        await saveMessageToChat(chatSessionId, userMsg, activeUserId);
        await updateChatSessionTimestamp(chatSessionId, activeUserId);
      }
      
      // Send to Gemini (already cleaned in service, but clean again in UI just in case)
      const response = await sendMessageToGemini(messages, userMsg.text);
      const cleanedResponseText = cleanText(response.text);
      
      const modelMsg: Message = {
        role: 'model',
        text: cleanedResponseText,
        timestamp: Date.now(),
        image: response.image // 生成された画像があれば追加
      };

      setMessages(prev => [...prev, modelMsg]);

      if (chatSessionId && activeUserId) {
        await saveMessageToChat(chatSessionId, modelMsg, activeUserId);
        await updateChatSessionTimestamp(chatSessionId, activeUserId);
      }

    } catch (error) {
      console.error("Error sending message:", error);
      const errorMsg: Message = {
        role: 'model',
        text: language === Language.JA ? "申し訳ありません。エラーが発生しました。" : "Sorry, an error occurred.",
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Shift + Enter で送信
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Enterのみの場合はデフォルトの動作（改行）
  };

  const toggleLanguage = (lang: Language) => {
    setLanguage(lang);
  };

  const handleNewChat = () => {
    setMessages([]);
    setCurrentChatId(null);
    if(window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const handleSelectChat = async (selectedChatId: string) => {
    if (!firebaseChatAvailable || !activeUserId || isLoading) return;
    if (selectedChatId === currentChatId) return;

    setIsLoading(true);
    setMessages([]);
    setCurrentChatId(selectedChatId);

    try {
      const loadedMessages = await loadMessagesForChat(selectedChatId, activeUserId);
      setMessages(loadedMessages);
    } catch (error) {
      console.error("Error loading chat messages:", error);
    } finally {
      setIsLoading(false);
      if(window.innerWidth < 768) setIsSidebarOpen(false);
    }
  };

  const openAuthModal = (mode: AuthModalMode) => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
      setMessages([]);
      setCurrentChatId(null);
      setRecentChats([]);
    }
  };

  // --- Chat Management Handlers ---
  const togglePinChat = async (chat: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMenuChatId(null);
    await updateChatSession(chat.id, { isPinned: !chat.isPinned });
  };

  const openRenameModal = (chat: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMenuChatId(null);
    setEditingChat(chat);
    setRenameValue(chat.title);
    setIsRenameModalOpen(true);
  };

  const submitRename = async () => {
    if (editingChat && renameValue.trim()) {
      await updateChatSession(editingChat.id, { title: renameValue.trim() });
      setIsRenameModalOpen(false);
      setEditingChat(null);
    }
  };

  const openGroupModal = (chat: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMenuChatId(null);
    setEditingChat(chat);
    setGroupValue(chat.groupName || '');
    setIsGroupModalOpen(true);
  };

  const submitGroup = async () => {
    if (editingChat) {
      await updateChatSession(editingChat.id, { groupName: groupValue.trim() || null });
      setIsGroupModalOpen(false);
      setEditingChat(null);
    }
  };

  const openDeleteModal = (chat: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMenuChatId(null);
    setChatToDelete(chat);
    setIsDeleteModalOpen(true);
  };

  const submitDelete = async () => {
    if (chatToDelete) {
      if (currentChatId === chatToDelete.id) {
        handleNewChat();
      }
      await deleteChatSession(chatToDelete.id);
      setIsDeleteModalOpen(false);
      setChatToDelete(null);
    }
  };

  const toggleGroupCollapse = (groupName: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };

  // --- Texts ---
  const t = {
    newChat: language === Language.JA ? "チャットを新規作成" : "New Chat",
    recentChats: language === Language.JA ? "最近のチャット" : "Recent Chats",
    welcomeTitle: language === Language.JA ? "おかえりなさい！" : "Welcome Back!",
    welcomeSubtitle: language === Language.JA 
      ? `アカウントを作成またはログインして、僕とのおしゃべりを始めよう！` 
      : `Create an account or log in to start chatting with me!`,
    placeholder: language === Language.JA 
      ? `メッセージを送信 (Shift+Enterで送信)`
      : `Send a message (Shift+Enter to send)...`,
    send: language === Language.JA ? "まっちゃAIに送信" : "Send to Matcha AI",
    firebaseWarning: language === Language.JA 
      ? "Firebase設定が不完全です。アカウント機能や会話履歴の保存は利用できません。" 
      : "Firebase configuration is incomplete. Account features and history storage are unavailable.",
    settingError: language === Language.JA ? "設定エラー" : "Config Error",
    login: language === Language.JA ? "ログイン" : "Login",
    logout: language === Language.JA ? "ログアウト" : "Logout",
    appName: language === Language.JA ? "まっちゃAI" : "Matcha AI",
    noRecentChats: language === Language.JA ? "最近のチャットはありません。" : "No recent chats.",
    pinned: language === Language.JA ? "ピン留め" : "Pinned",
    ungrouped: language === Language.JA ? "未分類" : "Ungrouped",
    rename: language === Language.JA ? "名前を変更" : "Rename",
    group: language === Language.JA ? "グループ分け" : "Add to Group",
    delete: language === Language.JA ? "削除" : "Delete",
    cancel: language === Language.JA ? "キャンセル" : "Cancel",
    save: language === Language.JA ? "保存" : "Save",
    deleteConfirm: language === Language.JA ? "本当に削除しますか？" : "Are you sure?",
  };

  const inputDisabled = !activeUserId && firebaseAccountAvailable;

  // --- Sorting and Grouping Logic ---
  const pinnedChats = recentChats.filter(c => c.isPinned);
  const unpinnedChats = recentChats.filter(c => !c.isPinned);
  
  // Group unpinned chats by groupName
  const chatsByGroup: Record<string, ChatSession[]> = {};
  const noGroupChats: ChatSession[] = [];

  unpinnedChats.forEach(chat => {
    if (chat.groupName) {
      if (!chatsByGroup[chat.groupName]) {
        chatsByGroup[chat.groupName] = [];
      }
      chatsByGroup[chat.groupName].push(chat);
    } else {
      noGroupChats.push(chat);
    }
  });

  const groupNames = Object.keys(chatsByGroup).sort();

  const renderChatItem = (chat: ChatSession) => (
    <div 
      key={chat.id}
      className={`
        group relative w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors
        ${chat.id === currentChatId 
          ? 'bg-green-100/70 text-green-800 font-medium' 
          : 'text-slate-600 hover:bg-green-100/50'}
      `}
    >
      <button 
        onClick={() => handleSelectChat(chat.id)}
        className="flex-1 flex items-center gap-2 truncate text-left"
      >
        {chat.isPinned ? (
          <Pin className="w-3 h-3 text-green-600 flex-shrink-0" />
        ) : (
          <History className="w-3 h-3 text-green-400 flex-shrink-0" />
        )}
        <span className="truncate">{chat.title}</span>
      </button>

      {/* Menu Trigger */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setActiveMenuChatId(activeMenuChatId === chat.id ? null : chat.id);
        }}
        className={`
          p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-white transition-opacity
          ${activeMenuChatId === chat.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
        `}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {/* Context Menu */}
      {activeMenuChatId === chat.id && (
        <div 
          ref={menuRef}
          className="absolute right-2 top-8 z-50 w-48 bg-white rounded-lg shadow-xl border border-slate-100 py-1 animate-scale-in origin-top-right"
        >
          <button onClick={(e) => togglePinChat(chat, e)} className="w-full px-4 py-2 text-left text-xs hover:bg-slate-50 flex items-center gap-2">
            {chat.isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
            {chat.isPinned ? 'ピン留めを外す' : t.pinned}
          </button>
          <button onClick={(e) => openRenameModal(chat, e)} className="w-full px-4 py-2 text-left text-xs hover:bg-slate-50 flex items-center gap-2">
            <Edit2 className="w-3 h-3" /> {t.rename}
          </button>
          <button onClick={(e) => openGroupModal(chat, e)} className="w-full px-4 py-2 text-left text-xs hover:bg-slate-50 flex items-center gap-2">
            <FolderInput className="w-3 h-3" /> {t.group}
          </button>
          <div className="border-t border-slate-100 my-1"></div>
          <button onClick={(e) => openDeleteModal(chat, e)} className="w-full px-4 py-2 text-left text-xs hover:bg-red-50 text-red-600 flex items-center gap-2">
            <Trash2 className="w-3 h-3" /> {t.delete}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen w-full bg-white overflow-hidden font-sans text-slate-800">
      
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
        auth={auth} 
        initialMode={authModalMode} 
      />

      {/* --- Lightbox Modal for Images --- */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-full max-h-full" onClick={e => e.stopPropagation()}>
            <img 
              src={selectedImage} 
              alt="Generated Content" 
              className="max-w-full max-h-[90vh] rounded-lg shadow-2xl object-contain"
            />
            <button 
              onClick={() => setSelectedImage(null)}
              className="absolute -top-12 right-0 p-2 text-white hover:bg-white/20 rounded-full"
            >
              <X className="w-8 h-8" />
            </button>
            <a 
              href={selectedImage} 
              download="matcha-ai-image.jpg"
              className="absolute -top-12 right-12 p-2 text-white hover:bg-white/20 rounded-full"
              onClick={(e) => e.stopPropagation()}
            >
              <Download className="w-8 h-8" />
            </a>
          </div>
        </div>
      )}

      {/* --- Modals for Chat Management --- */}
      
      {/* Rename Modal */}
      {isRenameModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-bold text-lg mb-4">{t.rename}</h3>
            <input 
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full border rounded-lg p-2 mb-4 focus:ring-2 focus:ring-green-500 outline-none"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsRenameModalOpen(false)} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">{t.cancel}</button>
              <button onClick={submitRename} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">{t.save}</button>
            </div>
          </div>
        </div>
      )}

      {/* Group Modal */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-bold text-lg mb-2">{t.group}</h3>
            <p className="text-xs text-slate-500 mb-4">グループ名を入力してください（空欄でグループ解除）</p>
            <input 
              value={groupValue}
              onChange={(e) => setGroupValue(e.target.value)}
              placeholder="例: 仕事, 趣味"
              className="w-full border rounded-lg p-2 mb-4 focus:ring-2 focus:ring-green-500 outline-none"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsGroupModalOpen(false)} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">{t.cancel}</button>
              <button onClick={submitGroup} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">{t.save}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-bold text-lg text-red-600 mb-2">{t.delete}</h3>
            <p className="text-sm text-slate-600 mb-6">{t.deleteConfirm}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">{t.cancel}</button>
              <button onClick={submitDelete} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">{t.delete}</button>
            </div>
          </div>
        </div>
      )}


      {/* Sidebar - Desktop & Mobile Drawer */}
      <aside 
        className={`
          fixed inset-y-0 left-0 z-30 w-64 bg-[#F0FDF4] border-r border-green-100 transform transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:relative md:translate-x-0
          flex flex-col
        `}
      >
        <div className="p-4">
          <button 
            onClick={handleNewChat}
            className="w-full flex items-center justify-between px-4 py-3 bg-white border border-green-200 rounded-lg text-slate-600 hover:bg-green-50 hover:border-green-300 transition-all shadow-sm group"
          >
            <span className="text-sm font-medium">{t.newChat}</span>
            <MessageSquarePlus className="w-4 h-4 text-green-500 group-hover:scale-110 transition-transform" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 scrollbar-hide pb-4">
          
          {recentChats.length === 0 ? (
             <p className="text-xs text-slate-400 px-4 text-center mt-4">{t.noRecentChats}</p>
          ) : (
            <>
              {/* Pinned Chats */}
              {pinnedChats.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-semibold text-slate-400 mb-2 px-2 uppercase tracking-wider flex items-center gap-1">
                    <Pin className="w-3 h-3" /> {t.pinned}
                  </div>
                  <div className="space-y-1">
                    {pinnedChats.map(renderChatItem)}
                  </div>
                </div>
              )}

              {/* Grouped Chats */}
              {groupNames.map(name => (
                <div key={name} className="mb-2">
                   <button 
                    onClick={() => toggleGroupCollapse(name)}
                    className="w-full flex items-center gap-1 text-xs font-semibold text-slate-500 mb-1 px-2 hover:text-slate-700"
                   >
                     {collapsedGroups[name] ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                     <Folder className="w-3 h-3 mr-1" />
                     {name}
                   </button>
                   {!collapsedGroups[name] && (
                     <div className="space-y-1 pl-2 border-l-2 border-green-100 ml-2">
                       {chatsByGroup[name].map(renderChatItem)}
                     </div>
                   )}
                </div>
              ))}

              {/* Ungrouped/Recent Chats */}
              {noGroupChats.length > 0 && (
                <div className="mt-4">
                  <div className="text-xs font-semibold text-slate-400 mb-2 px-2 uppercase tracking-wider">
                    {t.recentChats}
                  </div>
                  <div className="space-y-1">
                    {noGroupChats.map(renderChatItem)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        
        {/* Mobile Close Button */}
        <button 
          className="md:hidden absolute top-4 right-4 p-2 text-slate-400"
          onClick={() => setIsSidebarOpen(false)}
        >
          <X className="w-6 h-6" />
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative h-full">
        
        {/* Warning Bar (Mocking the screenshot) */}
        {!isFirebaseTotallyConfigured && (
          <div className="bg-[#FEF9C3] text-[#854D0E] px-4 py-2 text-xs md:text-sm font-medium text-center flex items-center justify-center gap-2 border-b border-yellow-200">
            <AlertTriangle className="w-4 h-4" />
            {t.firebaseWarning}
          </div>
        )}

        {/* Header */}
        <header className="h-16 border-b border-slate-100 flex items-center justify-between px-4 md:px-6 bg-white/80 backdrop-blur-sm z-20">
          <div className="flex items-center gap-3">
            <button 
              className="md:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-full"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#88aa80] flex items-center justify-center text-black">
                    <MatchaIcon className="w-5 h-5" />
                </div>
                <h1 className="font-bold text-lg text-green-900 tracking-tight">{t.appName}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-slate-100 rounded-lg p-1">
              <button 
                onClick={() => toggleLanguage(Language.JA)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${language === Language.JA ? 'bg-green-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                日本語
              </button>
              <button 
                onClick={() => toggleLanguage(Language.EN)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${language === Language.EN ? 'bg-green-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                English
              </button>
            </div>

            {/* Auth Button Area in Header */}
            {firebaseAccountAvailable ? (
              user ? (
                 <div className="hidden md:flex items-center gap-2">
                    <span className="text-xs text-slate-500 mr-1">{user.email}</span>
                    <button 
                      onClick={handleLogout}
                      className="flex items-center gap-1 px-3 py-1.5 bg-slate-200 text-slate-700 text-xs font-medium rounded hover:bg-slate-300 transition-colors"
                    >
                       <LogOut className="w-3 h-3" />
                       {t.logout}
                    </button>
                 </div>
              ) : (
                <button 
                  onClick={() => openAuthModal('login')}
                  className="hidden md:flex items-center gap-1 px-3 py-1.5 bg-[#1da356] text-white text-xs font-medium rounded hover:bg-[#158042] transition-colors shadow-sm"
                >
                   {t.login}
                </button>
              )
            ) : (
              <button className="hidden md:flex items-center gap-1 px-3 py-1.5 bg-slate-400 text-white text-xs font-medium rounded hover:bg-slate-500 transition-colors">
                 {t.settingError}
              </button>
            )}
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-white scrollbar-hide flex flex-col items-center">
          
          {messages.length === 0 && !isLoading ? ( // Only show welcome if no messages AND not loading
            <div className="flex flex-col items-center justify-center h-full max-w-md text-center animate-fade-in">
               <div className="w-12 h-12 bg-[#88aa80] rounded-full flex items-center justify-center mb-6 shadow-xl shadow-green-100 ring-8 ring-green-50">
                  <MatchaIcon className="w-8 h-8 text-black" />
               </div>
               <h2 className="text-2xl font-bold text-slate-800 mb-3">{t.welcomeTitle}</h2>
               <p className="text-slate-500 leading-relaxed">
                 {t.welcomeSubtitle}
               </p>
               {firebaseAccountAvailable && !user && (
                 <button 
                   onClick={() => openAuthModal('login')}
                   className="mt-6 px-6 py-3 bg-[#1da356] text-white rounded-lg shadow-lg hover:bg-[#158042] transition-all text-sm font-bold flex items-center gap-2"
                 >
                   <UserIcon className="w-4 h-4" />
                   {language === Language.JA ? "アカウント作成またはログイン" : "Login / Sign Up"}
                 </button>
               )}
            </div>
          ) : (
            <div className="w-full max-w-3xl space-y-6 pb-4">
              {messages.map((msg, index) => (
                <div 
                  key={index} 
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div 
                    className={`
                      max-w-[85%] md:max-w-[75%] px-5 py-3.5 rounded-2xl text-sm leading-relaxed shadow-sm flex flex-col gap-2
                      ${msg.role === 'user' 
                        ? 'bg-green-100 text-green-900 rounded-br-none' 
                        : 'bg-white border border-slate-100 text-slate-700 rounded-bl-none'}
                    `}
                  >
                    {/* Image Display */}
                    {msg.image && (
                      <div className="relative group cursor-pointer" onClick={() => setSelectedImage(msg.image!)}>
                        <img 
                          src={msg.image} 
                          alt="Generated content" 
                          className="rounded-lg max-w-full h-auto border border-slate-200 shadow-sm transition-transform hover:scale-[1.02]"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <Maximize2 className="w-6 h-6 text-white drop-shadow-md" />
                        </div>
                      </div>
                    )}

                    {/* Text Display */}
                    {msg.text && (
                      <div className="whitespace-pre-wrap">{cleanText(msg.text)}</div>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                 <div className="flex justify-start w-full">
                   <div className="bg-white border border-slate-100 px-4 py-3 rounded-2xl rounded-bl-none shadow-sm flex items-center gap-2">
                     <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                     <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                     <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                   </div>
                 </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-slate-50 w-full flex justify-center">
          <div className="w-full max-w-4xl relative">
            <div className="bg-[#E8ECEF] rounded-xl p-2 flex flex-col gap-2 focus-within:ring-2 focus-within:ring-green-200 transition-all">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t.placeholder}
                rows={1}
                className="w-full bg-transparent border-none focus:ring-0 resize-none p-3 text-slate-700 placeholder:text-slate-400 text-sm min-h-[60px]"
                style={{ minHeight: '60px' }}
                disabled={inputDisabled || !firebaseChatAvailable} // Disable if login required or chat Firebase not available
              />
              
              <div className="flex items-center justify-between px-2 pb-1">
                <button 
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg transition-colors"
                  title="Upload Image (Demo)"
                  disabled={inputDisabled || !firebaseChatAvailable}
                >
                  <ImageIcon className="w-5 h-5" />
                </button>

                <button 
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading || inputDisabled || !firebaseChatAvailable}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200
                    ${(!input.trim() || isLoading || inputDisabled || !firebaseChatAvailable)
                      ? 'bg-slate-300 text-slate-100 cursor-not-allowed' 
                      : 'bg-[#6ee7b7] hover:bg-[#34d399] text-white shadow-md shadow-green-100 active:scale-95'}
                  `}
                >
                  <span>{t.send}</span>
                  {/* Use Send Icon if text is short, or just text if button is wide */}
                </button>
              </div>
            </div>
            <div className="text-center mt-2 text-[10px] text-slate-300 select-none">
               Matcha AI can make mistakes. Please verify important information.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
