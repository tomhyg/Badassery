import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2, Database, Loader2 } from 'lucide-react';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '../services/firebase';

export const FirestoreDebug: React.FC = () => {
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<any>(null);

  useEffect(() => {
    runDiagnostics();
  }, []);

  const runDiagnostics = async () => {
    setTesting(true);
    const diagnostics: any = {
      firebaseInitialized: false,
      firestoreConnected: false,
      collectionsFound: [],
      clientsCollection: {
        exists: false,
        count: 0,
        sampleData: null,
        error: null
      },
      possibleIssues: []
    };

    try {
      // Test 1: Firebase initialized
      if (db) {
        diagnostics.firebaseInitialized = true;
      } else {
        diagnostics.possibleIssues.push('Firebase DB not initialized');
      }

      // Test 2: Try to read Clients collection
      try {
        const clientsRef = collection(db, 'Clients');
        const snapshot = await getDocs(clientsRef);

        diagnostics.clientsCollection.exists = true;
        diagnostics.clientsCollection.count = snapshot.docs.length;

        if (snapshot.docs.length > 0) {
          const firstDoc = snapshot.docs[0];
          diagnostics.clientsCollection.sampleData = {
            id: firstDoc.id,
            data: firstDoc.data()
          };
        } else {
          diagnostics.possibleIssues.push('Clients collection is empty');
        }
      } catch (err: any) {
        diagnostics.clientsCollection.error = err.message;
        if (err.code === 'permission-denied') {
          diagnostics.possibleIssues.push('Permission denied - Check Firestore Security Rules');
        } else {
          diagnostics.possibleIssues.push(`Error accessing Clients: ${err.message}`);
        }
      }

      // Test 3: Try alternative collection names
      const alternativeNames = ['clients', 'CLIENTS', 'Client'];
      for (const name of alternativeNames) {
        try {
          const ref = collection(db, name);
          const snap = await getDocs(query(ref, limit(1)));
          if (snap.docs.length > 0) {
            diagnostics.collectionsFound.push({
              name,
              count: snap.docs.length,
              sample: snap.docs[0].id
            });
          }
        } catch (err) {
          // Ignore errors for alternative names
        }
      }

      diagnostics.firestoreConnected = true;

    } catch (error: any) {
      diagnostics.possibleIssues.push(`General error: ${error.message}`);
    }

    setResults(diagnostics);
    setTesting(false);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Firestore Diagnostics</h1>
        <p className="text-slate-600">Vérification de la connexion et des données Firestore</p>
      </div>

      {testing && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-indigo-600" size={32} />
        </div>
      )}

      {!testing && results && (
        <div className="space-y-4">
          {/* Firebase Initialized */}
          <div className={`border rounded-lg p-4 ${results.firebaseInitialized ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <div className="flex items-center gap-2">
              {results.firebaseInitialized ? (
                <CheckCircle2 className="text-green-600" size={20} />
              ) : (
                <AlertCircle className="text-red-600" size={20} />
              )}
              <h3 className="font-semibold text-slate-900">Firebase Initialized</h3>
            </div>
            <p className="text-sm text-slate-700 mt-1">
              {results.firebaseInitialized ? 'Firebase SDK is properly initialized' : 'Firebase SDK failed to initialize'}
            </p>
          </div>

          {/* Firestore Connected */}
          <div className={`border rounded-lg p-4 ${results.firestoreConnected ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <div className="flex items-center gap-2">
              {results.firestoreConnected ? (
                <CheckCircle2 className="text-green-600" size={20} />
              ) : (
                <AlertCircle className="text-red-600" size={20} />
              )}
              <h3 className="font-semibold text-slate-900">Firestore Connection</h3>
            </div>
            <p className="text-sm text-slate-700 mt-1">
              {results.firestoreConnected ? 'Successfully connected to Firestore' : 'Failed to connect to Firestore'}
            </p>
          </div>

          {/* Clients Collection */}
          <div className={`border rounded-lg p-4 ${results.clientsCollection.exists && results.clientsCollection.count > 0 ? 'border-green-200 bg-green-50' : results.clientsCollection.error ? 'border-red-200 bg-red-50' : 'border-yellow-200 bg-yellow-50'}`}>
            <div className="flex items-center gap-2 mb-2">
              {results.clientsCollection.exists && results.clientsCollection.count > 0 ? (
                <CheckCircle2 className="text-green-600" size={20} />
              ) : results.clientsCollection.error ? (
                <AlertCircle className="text-red-600" size={20} />
              ) : (
                <AlertCircle className="text-yellow-600" size={20} />
              )}
              <h3 className="font-semibold text-slate-900">Collection "Clients"</h3>
            </div>

            {results.clientsCollection.error ? (
              <div className="space-y-2">
                <p className="text-sm text-red-700">
                  <strong>Error:</strong> {results.clientsCollection.error}
                </p>
                {results.clientsCollection.error.includes('permission') && (
                  <div className="mt-3 p-3 bg-red-100 rounded border border-red-200">
                    <p className="text-sm font-semibold text-red-900 mb-2">🔒 Firestore Security Rules Issue</p>
                    <p className="text-xs text-red-800 mb-2">Vos règles de sécurité bloquent l'accès. Mettez à jour vos règles Firestore:</p>
                    <pre className="text-xs bg-slate-900 text-green-400 p-2 rounded overflow-x-auto">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true; // TEMPORAIRE - pour dev
    }
  }
}`}
                    </pre>
                  </div>
                )}
              </div>
            ) : results.clientsCollection.exists ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-700">
                  <strong>Count:</strong> {results.clientsCollection.count} document(s)
                </p>
                {results.clientsCollection.sampleData && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-indigo-600 font-medium">
                      Voir un exemple de document
                    </summary>
                    <pre className="mt-2 p-3 bg-slate-900 text-green-400 rounded overflow-x-auto">
                      {JSON.stringify(results.clientsCollection.sampleData, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ) : (
              <p className="text-sm text-yellow-700">Collection "Clients" existe mais est vide</p>
            )}
          </div>

          {/* Alternative Collections */}
          {results.collectionsFound.length > 0 && (
            <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Database className="text-blue-600" size={20} />
                <h3 className="font-semibold text-slate-900">Collections alternatives trouvées</h3>
              </div>
              <div className="space-y-1">
                {results.collectionsFound.map((col: any) => (
                  <p key={col.name} className="text-sm text-slate-700">
                    📁 <strong>{col.name}</strong> - {col.count} document(s)
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Possible Issues */}
          {results.possibleIssues.length > 0 && (
            <div className="border border-orange-200 bg-orange-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="text-orange-600" size={20} />
                <h3 className="font-semibold text-slate-900">Problèmes détectés</h3>
              </div>
              <ul className="space-y-1 list-disc list-inside">
                {results.possibleIssues.map((issue: string, i: number) => (
                  <li key={i} className="text-sm text-orange-800">{issue}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="border border-slate-200 bg-white rounded-lg p-4">
            <h3 className="font-semibold text-slate-900 mb-3">Actions recommandées</h3>
            <div className="space-y-2 text-sm text-slate-700">
              <p>1. <strong>Vérifiez Firebase Console:</strong></p>
              <a
                href="https://console.firebase.google.com/project/brooklynn-61dc8/firestore/databases/-default-/data"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline block ml-4"
              >
                → Ouvrir Firestore Database
              </a>

              <p className="mt-3">2. <strong>Vérifiez les règles de sécurité:</strong></p>
              <a
                href="https://console.firebase.google.com/project/brooklynn-61dc8/firestore/rules"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline block ml-4"
              >
                → Ouvrir Firestore Rules
              </a>

              <p className="mt-3">3. <strong>Confirmez le nom de la collection:</strong></p>
              <p className="ml-4">Votre collection doit s'appeler exactement <code className="bg-slate-100 px-1 rounded">"Clients"</code> (avec C majuscule)</p>
            </div>
          </div>

          <button
            onClick={runDiagnostics}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium"
          >
            Re-tester la connexion
          </button>
        </div>
      )}
    </div>
  );
};
