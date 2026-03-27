import React, { useState } from 'react';
import { Database, AlertCircle, CheckCircle2, Loader2, Bug } from 'lucide-react';
import { addStatusToAllClients } from '../services/clientService';

interface SettingsProps {
  onNavigate?: (tab: string) => void;
}

export const Settings: React.FC<SettingsProps> = ({ onNavigate }) => {
  const [updating, setUpdating] = useState(false);
  const [result, setResult] = useState<{ updated: number; skipped: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAddStatus = async () => {
    if (!confirm('Voulez-vous ajouter le statut "active" à tous les clients qui n\'en ont pas?')) {
      return;
    }

    try {
      setUpdating(true);
      setError(null);
      setResult(null);

      const migrationResult = await addStatusToAllClients();
      setResult(migrationResult);
    } catch (err) {
      console.error('Error updating clients:', err);
      setError('Erreur lors de la mise à jour. Vérifiez la console.');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Settings</h1>

      <div className="space-y-6">
        {/* Firestore Diagnostics */}
        {result?.total === 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <AlertCircle className="text-orange-600" size={24} />
              <h2 className="text-lg font-bold text-slate-900">Aucun client trouvé</h2>
            </div>
            <p className="text-sm text-orange-800 mb-4">
              La migration n'a trouvé aucun client dans Firestore. Cela peut indiquer un problème de connexion ou de permissions.
            </p>
            <button
              onClick={() => onNavigate?.('debug')}
              className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
            >
              <Bug size={16} />
              Ouvrir le diagnostic Firestore
            </button>
          </div>
        )}

        {/* Database Utilities */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Database className="text-indigo-600" size={24} />
            <h2 className="text-lg font-bold text-slate-900">Database Utilities</h2>
          </div>

          <div className="space-y-4">
            <div className="border border-slate-200 rounded-lg p-4">
              <h3 className="font-semibold text-slate-900 mb-2">Add Status to Clients</h3>
              <p className="text-sm text-slate-600 mb-4">
                Ajoute automatiquement le statut "active" à tous les clients qui n'en ont pas.
                Utile après l'import initial depuis Firestore.
              </p>

              <button
                onClick={handleAddStatus}
                disabled={updating}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm disabled:cursor-not-allowed"
              >
                {updating ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    Mise à jour en cours...
                  </>
                ) : (
                  <>
                    <Database size={16} />
                    Add Status to All Clients
                  </>
                )}
              </button>

              {error && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={16} />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              {result && (
                <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="text-green-600" size={20} />
                    <h4 className="font-semibold text-green-900">Migration terminée!</h4>
                  </div>
                  <div className="text-sm text-green-800 space-y-1">
                    <p>✅ <strong>{result.updated}</strong> clients mis à jour</p>
                    <p>⏭️ <strong>{result.skipped}</strong> clients déjà à jour</p>
                    <p>📊 <strong>{result.total}</strong> clients au total</p>
                  </div>
                  <p className="text-xs text-green-700 mt-3">
                    Rechargez la page Clients pour voir les changements.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Other Settings Sections */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">SMTP Configuration</h2>
          <p className="text-slate-500 text-sm">Configuration options for email sending would go here.</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">AI Models</h2>
          <p className="text-slate-500 text-sm">Configuration for AI model selection and parameters would go here.</p>
        </div>
      </div>
    </div>
  );
};
