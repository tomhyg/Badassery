import React, { useState } from 'react';
import { KeyRound, Loader2, AlertCircle, CheckCircle, Sparkles } from 'lucide-react';
import { changeViewerPassword } from '../services/userService';

interface ChangePasswordProps {
  userId: string;
  displayName: string;
  onComplete: () => void;
}

export const ChangePassword: React.FC<ChangePasswordProps> = ({ userId, displayName, onComplete }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    const result = await changeViewerPassword(userId, newPassword);
    setIsLoading(false);

    if (result.success) {
      setSuccess(true);
      setTimeout(() => onComplete(), 1500);
    } else {
      setError(result.error || 'Failed to update password.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-1000"></div>
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl shadow-lg mb-4">
            <Sparkles size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Badassery</h1>
          <p className="text-purple-200">Podcast Booking Platform</p>
        </div>

        <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 p-8">
          <div className="flex items-center gap-3 mb-2">
            <KeyRound size={22} className="text-purple-300" />
            <h2 className="text-xl font-bold text-white">Set Your Password</h2>
          </div>
          <p className="text-purple-200 text-sm mb-6">
            Welcome, <span className="text-white font-semibold">{displayName}</span>! Please choose a password to continue.
          </p>

          {error && (
            <div className="mb-5 p-4 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center gap-3 text-red-200">
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-5 p-4 bg-green-500/20 border border-green-500/30 rounded-lg flex items-center gap-3 text-green-200">
              <CheckCircle size={20} />
              <span>Password updated! Redirecting...</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-purple-200 mb-2">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                required
                minLength={8}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-purple-200 mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat your password"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !newPassword || !confirmPassword || success}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              {isLoading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <KeyRound size={20} />
                  Set Password & Continue
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
