import React, { useState, useEffect } from 'react';
import { Database, AlertCircle, CheckCircle2, Loader2, Bug, Brain, Key, FileText, Save, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { addStatusToAllClients } from '../services/clientService';
import { getAIConfig, saveAIConfig, resetAIConfig, AIConfig } from '../services/aiConfigService';

interface SettingsProps {
  onNavigate?: (tab: string) => void;
}

export const Settings: React.FC<SettingsProps> = ({ onNavigate }) => {
  const [updating, setUpdating] = useState(false);
  const [result, setResult] = useState<{ updated: number; skipped: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // AI Configuration
  const [aiConfig, setAiConfig] = useState<AIConfig>(getAIConfig());
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [expandedPrompts, setExpandedPrompts] = useState<{[key: string]: boolean}>({
    bioEnhancement: false,
    pitchEmail: false,
    prepEmail: false,
    followUpEmail: false
  });

  useEffect(() => {
    // Load config on mount
    setAiConfig(getAIConfig());
  }, []);

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

  const handleSaveAIConfig = () => {
    try {
      saveAIConfig(aiConfig);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      alert('Failed to save configuration. Please try again.');
    }
  };

  const handleResetAIConfig = () => {
    if (confirm('Reset all AI configuration to defaults? This cannot be undone.')) {
      resetAIConfig();
      setAiConfig(getAIConfig());
      alert('Configuration reset to defaults!');
    }
  };

  const togglePrompt = (key: string) => {
    setExpandedPrompts(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Settings</h1>

      <div className="space-y-6">
        {/* AI Configuration Section */}
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <Brain className="text-indigo-600" size={28} />
            <div>
              <h2 className="text-xl font-bold text-slate-900">AI Configuration</h2>
              <p className="text-sm text-slate-600">Configure Gemini AI settings and prompt templates</p>
            </div>
          </div>

          <div className="space-y-6">
            {/* API Key */}
            <div className="bg-white rounded-lg p-4 border border-indigo-200">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <Key size={16} />
                Gemini API Key
              </label>
              <input
                type="password"
                value={aiConfig.geminiApiKey}
                onChange={(e) => setAiConfig({ ...aiConfig, geminiApiKey: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
                placeholder="AIzaSy..."
              />
              <p className="text-xs text-slate-500 mt-1">
                Your Gemini API key from Google AI Studio
              </p>
            </div>

            {/* Model Selection */}
            <div className="bg-white rounded-lg p-4 border border-indigo-200">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <Brain size={16} />
                Gemini Model
              </label>
              <select
                value={aiConfig.geminiModel}
                onChange={(e) => setAiConfig({ ...aiConfig, geminiModel: e.target.value as any })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="gemini-2.0-flash">Gemini 2.0 Flash - Recommended (Cheap & Fast)</option>
                <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash (Experimental)</option>
                <option value="gemini-1.5-flash">Gemini 1.5 Flash - Fast & Efficient</option>
                <option value="gemini-1.5-pro">Gemini 1.5 Pro - Most Capable</option>
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Choose the AI model for generating content
              </p>
            </div>

            {/* Prompt Templates */}
            <div className="bg-white rounded-lg p-4 border border-indigo-200">
              <div className="flex items-center gap-2 mb-4">
                <FileText size={16} className="text-indigo-600" />
                <h3 className="text-sm font-semibold text-slate-700">Prompt Templates</h3>
              </div>

              <div className="space-y-3">
                {/* Bio Enhancement Prompt */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => togglePrompt('bioEnhancement')}
                    className="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-sm font-medium text-slate-900">Bio Enhancement Prompt</span>
                    {expandedPrompts.bioEnhancement ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {expandedPrompts.bioEnhancement && (
                    <div className="p-3 border-t border-slate-200 bg-slate-50">
                      <textarea
                        value={aiConfig.prompts.bioEnhancement}
                        onChange={(e) => setAiConfig({
                          ...aiConfig,
                          prompts: { ...aiConfig.prompts, bioEnhancement: e.target.value }
                        })}
                        rows={12}
                        className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-mono"
                      />
                      <p className="text-xs text-slate-500 mt-2">
                        Variables: <code className="bg-slate-200 px-1 rounded">{'{context}'}</code>, <code className="bg-slate-200 px-1 rounded">{'{bioOriginal}'}</code>
                      </p>
                    </div>
                  )}
                </div>

                {/* Pitch Email Prompt */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => togglePrompt('pitchEmail')}
                    className="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-sm font-medium text-slate-900">Pitch Email Prompt</span>
                    {expandedPrompts.pitchEmail ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {expandedPrompts.pitchEmail && (
                    <div className="p-3 border-t border-slate-200 bg-slate-50">
                      <textarea
                        value={aiConfig.prompts.pitchEmail}
                        onChange={(e) => setAiConfig({
                          ...aiConfig,
                          prompts: { ...aiConfig.prompts, pitchEmail: e.target.value }
                        })}
                        rows={10}
                        className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-mono"
                      />
                      <p className="text-xs text-slate-500 mt-2">
                        Variables: <code className="bg-slate-200 px-1 rounded">{'{podcastInfo}'}</code>, <code className="bg-slate-200 px-1 rounded">{'{clientInfo}'}</code>
                      </p>
                    </div>
                  )}
                </div>

                {/* Prep Email Prompt */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => togglePrompt('prepEmail')}
                    className="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-sm font-medium text-slate-900">Client Recording Prep Email Template</span>
                    {expandedPrompts.prepEmail ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {expandedPrompts.prepEmail && (
                    <div className="p-3 border-t border-slate-200 bg-slate-50">
                      <textarea
                        value={aiConfig.prompts.prepEmail}
                        onChange={(e) => setAiConfig({
                          ...aiConfig,
                          prompts: { ...aiConfig.prompts, prepEmail: e.target.value }
                        })}
                        rows={15}
                        className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-mono"
                      />
                      <p className="text-xs text-slate-500 mt-2">
                        Variables: <code className="bg-slate-200 px-1 rounded">{'{podcastLink}'}</code>, <code className="bg-slate-200 px-1 rounded">{'{clientPage}'}</code>, <code className="bg-slate-200 px-1 rounded">{'{recordingDateTime}'}</code>, <code className="bg-slate-200 px-1 rounded">{'{podcastDetails}'}</code>, <code className="bg-slate-200 px-1 rounded">{'{hostDetails}'}</code>
                      </p>
                    </div>
                  )}
                </div>

                {/* Follow-up Email Prompt */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => togglePrompt('followUpEmail')}
                    className="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-sm font-medium text-slate-900">Follow-up Email Template</span>
                    {expandedPrompts.followUpEmail ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {expandedPrompts.followUpEmail && (
                    <div className="p-3 border-t border-slate-200 bg-slate-50">
                      <textarea
                        value={aiConfig.prompts.followUpEmail}
                        onChange={(e) => setAiConfig({
                          ...aiConfig,
                          prompts: { ...aiConfig.prompts, followUpEmail: e.target.value }
                        })}
                        rows={8}
                        className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-mono"
                      />
                      <p className="text-xs text-slate-500 mt-2">
                        Variable: <code className="bg-slate-200 px-1 rounded">{'{originalEmail}'}</code>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Save Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={handleSaveAIConfig}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold shadow-md"
              >
                <Save size={18} />
                Save AI Configuration
              </button>
              <button
                onClick={handleResetAIConfig}
                className="flex items-center gap-2 px-6 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold"
              >
                <RotateCcw size={18} />
                Reset to Defaults
              </button>
            </div>

            {savedSuccess && (
              <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                <CheckCircle2 size={18} />
                <span className="text-sm font-medium">Configuration saved successfully!</span>
              </div>
            )}
          </div>
        </div>

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
      </div>
    </div>
  );
};
