
import React, { useState } from 'react';
import { createUserWithEmailAndPassword, Auth } from 'firebase/auth';

interface SignupFormProps {
  auth: Auth;
  onSuccess: () => void;
  switchToLogin: () => void;
}

export const SignupForm: React.FC<SignupFormProps> = ({ auth, onSuccess, switchToLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      onSuccess();
    } catch (err: any) {
      console.error("Signup error:", err);
      if (err.code === 'auth/email-already-in-use') {
        setError('このメールアドレスは既に使用されています。');
      } else if (err.code === 'auth/weak-password') {
        setError('パスワードは6文字以上で設定してください。');
      } else if (err.code === 'auth/invalid-email') {
        setError('メールアドレスの形式が正しくありません。');
      } else {
        setError('アカウント作成に失敗しました。もう一度お試しください。');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full">
      <div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="希望のID (メールアドレス)"
          className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-slate-700 placeholder-slate-400 transition-all"
          required
        />
      </div>
      <div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="パスワード (6文字以上)"
          className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-slate-700 placeholder-slate-400 transition-all"
          required
          minLength={6}
        />
      </div>

      {error && (
        <div className="text-red-500 text-sm text-center font-medium">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className={`
          w-full py-3 rounded-lg bg-[#1da356] text-white font-bold text-lg shadow-md hover:bg-[#158042] transition-all
          ${loading ? 'opacity-70 cursor-not-allowed' : ''}
        `}
      >
        {loading ? '作成中...' : 'アカウント作成'}
      </button>

      <div className="text-center mt-4">
        <p className="text-slate-500 text-sm">
          既にアカウントをお持ちの場合はこちら{' '}
          <button
            type="button"
            onClick={switchToLogin}
            className="text-[#1da356] font-bold hover:underline focus:outline-none"
          >
            ログイン
          </button>
        </p>
      </div>
    </form>
  );
};
