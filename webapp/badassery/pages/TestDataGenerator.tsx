/**
 * Test Data Generator Page
 *
 * Creates test outreach records for the client "hgfd" to test
 * all Kanban visual indicators and workflow transitions.
 *
 * Access at: /test-data-generator (add route to App.tsx)
 */

import React, { useState } from 'react';
import { Play, Check, AlertCircle, Loader2, Trash2 } from 'lucide-react';
import {
  createAllTestOutreach,
  CreatedOutreach,
  ensureTestClient,
  getRandomPodcasts
} from '../scripts/createTestOutreach';
import { db } from '../services/firebase';
import {
  collection,
  getDocs,
  query,
  where,
  deleteDoc,
  doc
} from 'firebase/firestore';

export const TestDataGenerator: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [results, setResults] = useState<CreatedOutreach[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const handleCreateTestData = async () => {
    setIsRunning(true);
    setError(null);
    setResults([]);
    setLogs([]);

    try {
      addLog('Starting test data creation...');

      // Override console.log temporarily to capture logs
      const originalLog = console.log;
      console.log = (...args) => {
        originalLog(...args);
        const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        addLog(message);
      };

      const created = await createAllTestOutreach();

      // Restore console.log
      console.log = originalLog;

      setResults(created);
      addLog(`Done! Created ${created.length} test outreach records.`);
    } catch (err: any) {
      console.error('Error creating test data:', err);
      setError(err.message || 'Unknown error');
      addLog(`ERROR: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleDeleteTestData = async () => {
    if (!confirm('Are you sure you want to delete ALL test outreach for client "hgfd"?')) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    setLogs([]);

    try {
      addLog('Finding test outreach records...');

      // Find client
      const clientQuery = query(
        collection(db, 'clients'),
        where('first_name', '==', 'hgfd')
      );
      const clientSnapshot = await getDocs(clientQuery);

      if (clientSnapshot.empty) {
        addLog('No client "hgfd" found.');
        setIsDeleting(false);
        return;
      }

      const clientId = clientSnapshot.docs[0].id;
      addLog(`Found client: ${clientId}`);

      // Find all outreach for this client
      const outreachQuery = query(
        collection(db, 'outreach'),
        where('client_id', '==', clientId)
      );
      const outreachSnapshot = await getDocs(outreachQuery);

      addLog(`Found ${outreachSnapshot.docs.length} outreach records to delete...`);

      // Delete each
      let deleted = 0;
      for (const docSnap of outreachSnapshot.docs) {
        await deleteDoc(doc(db, 'outreach', docSnap.id));
        deleted++;
        if (deleted % 10 === 0) {
          addLog(`Deleted ${deleted}/${outreachSnapshot.docs.length}...`);
        }
      }

      addLog(`Done! Deleted ${deleted} test outreach records.`);
      setResults([]);
    } catch (err: any) {
      console.error('Error deleting test data:', err);
      setError(err.message || 'Unknown error');
      addLog(`ERROR: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Group results by status
  const resultsByStatus: Record<string, CreatedOutreach[]> = results.reduce((acc, r) => {
    const status = r.config.status;
    if (!acc[status]) acc[status] = [];
    acc[status].push(r);
    return acc;
  }, {} as Record<string, CreatedOutreach[]>);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Test Data Generator</h1>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="text-yellow-600 mt-0.5" size={20} />
          <div>
            <h3 className="font-semibold text-yellow-800">Warning</h3>
            <p className="text-sm text-yellow-700">
              This will create ~50 test outreach records for client "hgfd".
              Use this only in development/testing environments.
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={handleCreateTestData}
          disabled={isRunning || isDeleting}
          className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isRunning ? (
            <>
              <Loader2 className="animate-spin" size={20} />
              Creating...
            </>
          ) : (
            <>
              <Play size={20} />
              Create Test Data
            </>
          )}
        </button>

        <button
          onClick={handleDeleteTestData}
          disabled={isRunning || isDeleting}
          className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isDeleting ? (
            <>
              <Loader2 className="animate-spin" size={20} />
              Deleting...
            </>
          ) : (
            <>
              <Trash2 size={20} />
              Delete Test Data
            </>
          )}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-red-600 mt-0.5" size={20} />
            <div>
              <h3 className="font-semibold text-red-800">Error</h3>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Logs */}
      {logs.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Logs</h2>
          <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm max-h-64 overflow-y-auto">
            {logs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Check className="text-green-600" size={20} />
            Created {results.length} Test Outreach
          </h2>

          <div className="space-y-6">
            {Object.entries(resultsByStatus).map(([status, items]) => (
              <div key={status}>
                <h3 className="font-medium text-gray-700 mb-2">
                  {status} ({items.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map(item => (
                    <div
                      key={item.id}
                      className="bg-white border border-gray-200 rounded-lg p-3 text-sm"
                    >
                      <div className="font-medium text-gray-900 mb-1">
                        {item.config.label}
                      </div>
                      <div className="text-gray-500 text-xs mb-2 truncate">
                        {item.podcastName}
                      </div>
                      <div className="text-xs">
                        <span className="text-gray-400">Expected: </span>
                        <span className="font-medium">{item.config.expectedBadge}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1 truncate">
                        ID: {item.id}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Test Plan */}
      <div className="mt-8 pt-8 border-t border-gray-200">
        <h2 className="text-lg font-semibold mb-4">Expected Visual Indicators</h2>

        <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-700">Status</th>
              <th className="px-4 py-2 text-left font-medium text-gray-700">Condition</th>
              <th className="px-4 py-2 text-left font-medium text-gray-700">Expected Badge</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t">
              <td className="px-4 py-2 font-mono text-xs">identified</td>
              <td className="px-4 py-2 text-gray-600">Always</td>
              <td className="px-4 py-2">🔵 To Validate</td>
            </tr>
            <tr className="border-t bg-gray-50">
              <td className="px-4 py-2 font-mono text-xs">ready_for_outreach</td>
              <td className="px-4 py-2 text-gray-600">Always</td>
              <td className="px-4 py-2">🟢 Send Pitch</td>
            </tr>
            <tr className="border-t">
              <td className="px-4 py-2 font-mono text-xs">1st_email_sent</td>
              <td className="px-4 py-2 text-gray-600">5+ days since email</td>
              <td className="px-4 py-2">🟠 Follow-up 1 (X days)</td>
            </tr>
            <tr className="border-t bg-gray-50">
              <td className="px-4 py-2 font-mono text-xs">1st_followup_sent</td>
              <td className="px-4 py-2 text-gray-600">5+ days since followup</td>
              <td className="px-4 py-2">🟠 Follow-up 2 (X days)</td>
            </tr>
            <tr className="border-t">
              <td className="px-4 py-2 font-mono text-xs">2nd_followup_sent</td>
              <td className="px-4 py-2 text-gray-600">7+ days since followup</td>
              <td className="px-4 py-2">🔴 No Response? (X days)</td>
            </tr>
            <tr className="border-t bg-gray-50">
              <td className="px-4 py-2 font-mono text-xs">screening_scheduled</td>
              <td className="px-4 py-2 text-gray-600">≤5 days until screening</td>
              <td className="px-4 py-2">🟣 Send Prep</td>
            </tr>
            <tr className="border-t">
              <td className="px-4 py-2 font-mono text-xs">recording_scheduled</td>
              <td className="px-4 py-2 text-gray-600">≤5 days until recording</td>
              <td className="px-4 py-2">🟣 Send Prep</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TestDataGenerator;
