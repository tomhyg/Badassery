import React, { useState } from 'react';
import { LogIn, Loader2, AlertCircle } from 'lucide-react';
import { simpleLogin } from '../services/userService';
import { User } from '../services/userService';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
  onSwitchToClient?: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const result = await simpleLogin(username, password);
      if (result.success && result.user) {
        onLoginSuccess(result.user);
      } else {
        setError(result.error || 'Login failed');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 flex">

      {/* Left side — Branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600 rounded-full filter blur-3xl opacity-20"></div>
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-indigo-500 rounded-full filter blur-3xl opacity-15"></div>
        </div>

        <div className="relative z-10">
          <img src="/logo.webp" alt="Badassery" className="h-12 w-auto" />
        </div>

        <div className="relative z-10 space-y-10">
          <div>
            <h1 className="text-4xl font-bold text-white leading-tight mb-4">
              The smartest way to<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-400">
                book podcast guests.
              </span>
            </h1>
            <p className="text-purple-200 text-lg leading-relaxed">
              Discover, score, and pitch podcasts — powered by AI. From outreach to booking, all in one place.
            </p>
          </div>
        </div>

        <p className="relative z-10 text-purple-500 text-sm">© 2026 Badassery. All rights reserved.</p>
      </div>

      {/* Right side — Login form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-10">
            <img src="/logo.webp" alt="Badassery" className="h-10 w-auto" />
          </div>

          <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-8 shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-1">Welcome back</h2>
            <p className="text-purple-300 text-sm mb-8">Sign in to your workspace</p>

            {error && (
              <div className="mb-6 p-4 bg-red-500/15 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-300">
                <AlertCircle size={18} />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-purple-200 mb-2">
                  Email or Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your email or username"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-purple-200 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || !username || !password}
                className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg mt-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <LogIn size={18} />
                    Sign In
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
