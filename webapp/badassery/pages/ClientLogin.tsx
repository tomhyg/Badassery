import React, { useState } from 'react';
import { LogIn, Loader2, AlertCircle, Mic, ArrowLeft } from 'lucide-react';
import { clientLogin, User } from '../services/userService';

interface ClientLoginProps {
  onLoginSuccess: (user: User, clientId: string) => void;
  onSwitchToAdmin?: () => void;
}

export const ClientLogin: React.FC<ClientLoginProps> = ({ onLoginSuccess, onSwitchToAdmin }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const result = await clientLogin(firstName, lastName);

      if (result.success && result.user && result.clientId) {
        onLoginSuccess(result.user, result.clientId);
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
    <div className="min-h-screen bg-gradient-to-br from-pink-900 via-rose-900 to-slate-900 flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-rose-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-1000"></div>
      </div>

      <div className="relative w-full max-w-md">
        {/* Back to Admin Link */}
        {onSwitchToAdmin && (
          <button
            onClick={onSwitchToAdmin}
            className="inline-flex items-center gap-2 text-pink-200 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft size={16} />
            <span className="text-sm">Admin Login</span>
          </button>
        )}

        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-pink-500 to-rose-600 rounded-2xl shadow-lg mb-4">
            <Mic size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Client Portal</h1>
          <p className="text-pink-200">Badassery Podcast Booking</p>
        </div>

        {/* Login Card */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 p-8">
          <h2 className="text-xl font-bold text-white mb-6 text-center">
            Welcome Back
          </h2>

          <p className="text-pink-200 text-sm text-center mb-6">
            Enter your first and last name to access your dashboard
          </p>

          {error && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center gap-3 text-red-200">
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-pink-200 mb-2">
                First Name
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Enter your first name"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-pink-200 mb-2">
                Last Name
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Enter your last name"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !firstName || !lastName}
              className="w-full py-3 bg-gradient-to-r from-pink-600 to-rose-600 text-white font-semibold rounded-lg hover:from-pink-700 hover:to-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              {isLoading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn size={20} />
                  Access My Dashboard
                </>
              )}
            </button>
          </form>

          {/* Info */}
          <div className="mt-6 pt-6 border-t border-white/10">
            <p className="text-sm text-pink-300 text-center">
              Your name must match our records exactly.
              <br />
              Contact us if you have trouble logging in.
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-pink-300 text-sm mt-6">
          Badassery &copy; 2024 - Client Portal
        </p>
      </div>
    </div>
  );
};
