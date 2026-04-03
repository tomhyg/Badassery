import React, { useState } from 'react';
import { Loader2, Lock, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '../services/firebase';
import { updateClient } from '../services/clientService';

interface Props {
  clientId: string;
  currentEmail: string;
  onComplete: () => void;
}

export const ForcePasswordChange: React.FC<Props> = ({ clientId, currentEmail, onComplete }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent]         = useState(false);
  const [showNew, setShowNew]                 = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from your temporary password.');
      return;
    }

    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not authenticated');

      // Re-authenticate with the temporary password first
      const credential = EmailAuthProvider.credential(currentEmail, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Update password in Firebase Auth
      await updatePassword(user, newPassword);

      // Clear the flag in Firestore
      await updateClient(clientId, { forcePasswordChange: false });

      onComplete();
    } catch (err: any) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Incorrect temporary password. Check your welcome email.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password is too weak — choose something stronger.');
      } else {
        setError(err.message || 'Failed to update password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-900 via-rose-900 to-slate-900 flex items-center justify-center p-4">
      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-rose-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-1000" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Icon + heading */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-pink-500 to-rose-600 rounded-2xl shadow-lg mb-4">
            <Lock size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Set your password</h1>
          <p className="text-pink-200 text-sm">
            Before you get started, please replace your temporary password with one you'll remember.
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 p-8">
          {error && (
            <div className="mb-5 p-3 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-200 text-sm">
              <AlertCircle size={16} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Current (temporary) password */}
            <div>
              <label className="block text-sm font-medium text-pink-200 mb-2">
                Temporary password <span className="text-pink-400">(from your welcome email)</span>
              </label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-3 pr-10 bg-white/10 border border-white/20 rounded-lg text-white placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-pink-300 hover:text-white"
                >
                  {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* New password */}
            <div>
              <label className="block text-sm font-medium text-pink-200 mb-2">New password</label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                  className="w-full px-4 py-3 pr-10 bg-white/10 border border-white/20 rounded-lg text-white placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-pink-300 hover:text-white"
                >
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {newPassword.length > 0 && newPassword.length < 8 && (
                <p className="text-xs text-red-300 mt-1">At least 8 characters required</p>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-sm font-medium text-pink-200 mb-2">Confirm new password</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-3 pr-10 bg-white/10 border border-white/20 rounded-lg text-white placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-pink-300 hover:text-white"
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                <p className="text-xs text-red-300 mt-1">Passwords do not match</p>
              )}
              {confirmPassword.length >= 8 && confirmPassword === newPassword && (
                <p className="text-xs text-green-300 mt-1 flex items-center gap-1">
                  <CheckCircle size={12} /> Passwords match
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !currentPassword || !newPassword || !confirmPassword}
              className="w-full py-3 bg-gradient-to-r from-pink-600 to-rose-600 text-white font-semibold rounded-lg hover:from-pink-700 hover:to-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              {loading
                ? <><Loader2 size={20} className="animate-spin" /> Updating…</>
                : <><Lock size={20} /> Set my password</>}
            </button>
          </form>
        </div>

        <p className="text-center text-pink-300 text-sm mt-6">
          Badassery © 2024 · Client Portal
        </p>
      </div>
    </div>
  );
};
