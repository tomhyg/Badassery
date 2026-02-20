import React, { useState } from 'react';
import { LogIn, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { simpleLogin } from '../services/userService';
import { User } from '../services/userService';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
  onSwitchToClient?: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess, onSwitchToClient }) => {
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
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-slate-900 flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-1000"></div>
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl shadow-lg mb-4">
            <Sparkles size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Badassery</h1>
          <p className="text-purple-200">Podcast Booking Platform</p>
        </div>

        {/* Login Card */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 p-8">
          <h2 className="text-xl font-bold text-white mb-6 text-center">
            Welcome Back
          </h2>

          {error && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center gap-3 text-red-200">
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-purple-200 mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                required
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
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !username || !password}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              {isLoading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn size={20} />
                  Sign In
                </>
              )}
            </button>
          </form>

          {/* Hint for demo */}
          <div className="mt-6 pt-6 border-t border-white/10">
            <p className="text-sm text-purple-300 text-center">
              Demo credentials:
            </p>
            <div className="mt-2 p-3 bg-purple-500/20 rounded-lg text-center">
              <code className="text-purple-200 text-sm">
                Username: <span className="text-white font-bold">Brooklynn</span>
                <br />
                Password: <span className="text-white font-bold">Brooklynn</span>
              </code>
            </div>
          </div>

          {/* Client Portal Link */}
          {onSwitchToClient && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <button
                onClick={onSwitchToClient}
                className="w-full py-2 text-sm text-purple-200 hover:text-white transition-colors flex items-center justify-center gap-2"
              >
                Are you a client? Access your portal
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-purple-300 text-sm mt-6">
          Badassery &copy; 2024
        </p>
      </div>
    </div>
  );
};
