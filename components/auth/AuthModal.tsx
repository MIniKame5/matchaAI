
import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Auth } from 'firebase/auth';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';
import { AuthModalMode } from '../../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  auth: Auth | undefined;
  initialMode: AuthModalMode;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, auth, initialMode }) => {
  const [mode, setMode] = useState<AuthModalMode>(initialMode);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
    }
  }, [isOpen, initialMode]);

  if (!isOpen || !auth) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 md:p-8 relative shadow-2xl animate-scale-in">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-full hover:bg-slate-100"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="flex flex-col items-center w-full">
          <h2 className="text-3xl font-bold text-[#14532d] mb-2 tracking-tight">
            {mode === 'login' ? 'まっちゃアカウント' : 'アカウント作成'}
          </h2>
          
          {mode === 'signup' && (
            <p className="text-slate-500 font-medium mb-6">@account.matcha-kame.com</p>
          )}
          
          {mode === 'login' && (
            <div className="mb-6"></div> 
          )}

          {mode === 'login' ? (
            <LoginForm 
              auth={auth} 
              onSuccess={onClose} 
              switchToSignup={() => setMode('signup')} 
            />
          ) : (
            <SignupForm 
              auth={auth} 
              onSuccess={onClose} 
              switchToLogin={() => setMode('login')} 
            />
          )}
        </div>
      </div>
    </div>
  );
};
