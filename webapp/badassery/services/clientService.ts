import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase';
import { Client } from '../types';

// Re-export Client type for convenience
export type { Client } from '../types';

const CLIENTS_COLLECTION = 'clients'; // Changed to lowercase to match Firestore collection name

/**
 * Get all clients from Firestore
 */
export async function getAllClients(): Promise<Client[]> {
  try {
    const clientsRef = collection(db, CLIENTS_COLLECTION);
    const snapshot = await getDocs(clientsRef);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Client));
  } catch (error) {
    console.error('Error fetching clients:', error);
    throw error;
  }
}

/**
 * Get a single client by ID
 */
export async function getClientById(clientId: string): Promise<Client | null> {
  try {
    const clientRef = doc(db, CLIENTS_COLLECTION, clientId);
    const snapshot = await getDoc(clientRef);

    if (snapshot.exists()) {
      return {
        id: snapshot.id,
        ...snapshot.data()
      } as Client;
    }

    return null;
  } catch (error) {
    console.error('Error fetching client:', error);
    throw error;
  }
}

/**
 * Get clients by status
 */
export async function getClientsByStatus(status: string): Promise<Client[]> {
  try {
    const clientsRef = collection(db, CLIENTS_COLLECTION);
    const q = query(
      clientsRef,
      where('metadata.clientStatus', '==', status)
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Client));
  } catch (error) {
    console.error('Error fetching clients by status:', error);
    throw error;
  }
}

/**
 * Create a new client
 */
export async function createClient(clientData: Omit<Client, 'id'>): Promise<string> {
  try {
    const now = new Date().toISOString();
    const clientWithTimestamps = {
      ...clientData,
      importedAt: now,
      updatedAt: now,
      source: clientData.source || 'Manual Entry'
    };

    const clientsRef = collection(db, CLIENTS_COLLECTION);
    const docRef = await addDoc(clientsRef, clientWithTimestamps);

    return docRef.id;
  } catch (error) {
    console.error('Error creating client:', error);
    throw error;
  }
}

/**
 * Update an existing client
 */
export async function updateClient(clientId: string, updates: Partial<Client>): Promise<void> {
  try {
    const clientRef = doc(db, CLIENTS_COLLECTION, clientId);
    const updateData = {
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await updateDoc(clientRef, updateData);
  } catch (error) {
    console.error('Error updating client:', error);
    throw error;
  }
}

/**
 * Delete a client
 */
export async function deleteClient(clientId: string): Promise<void> {
  try {
    const clientRef = doc(db, CLIENTS_COLLECTION, clientId);
    await deleteDoc(clientRef);
  } catch (error) {
    console.error('Error deleting client:', error);
    throw error;
  }
}

/**
 * Search clients by company name or contact name
 */
export async function searchClients(searchTerm: string): Promise<Client[]> {
  try {
    const allClients = await getAllClients();

    const searchLower = searchTerm.toLowerCase();
    return allClients.filter(client => {
      const companyName = (client.company_name || client.identity?.company || '').toLowerCase();
      const contactName = (
        client.contact_name ||
        `${client.identity?.firstName || ''} ${client.identity?.lastName || ''}`
      ).toLowerCase();

      return companyName.includes(searchLower) || contactName.includes(searchLower);
    });
  } catch (error) {
    console.error('Error searching clients:', error);
    throw error;
  }
}

/**
 * Add "active" status to all clients that don't have one
 * Utility function for data migration
 */
export async function addStatusToAllClients(): Promise<{ updated: number; skipped: number; total: number }> {
  try {
    console.log('🔄 Fetching all clients...');
    const clientsRef = collection(db, CLIENTS_COLLECTION);
    const snapshot = await getDocs(clientsRef);

    console.log(`📊 Found ${snapshot.docs.length} clients`);

    let updated = 0;
    let skipped = 0;

    for (const clientDoc of snapshot.docs) {
      const data = clientDoc.data();
      const clientId = clientDoc.id;
      const companyName = data.identity?.company || data.company_name || 'Unknown';

      // Skip if client already has a status
      if (data.status) {
        console.log(`⏭️  ${companyName} already has status: ${data.status}`);
        skipped++;
        continue;
      }

      // Update with "active" status
      const clientRef = doc(db, CLIENTS_COLLECTION, clientId);
      await updateDoc(clientRef, {
        status: 'active',
        updatedAt: new Date().toISOString()
      });

      console.log(`✅ ${companyName} - status added: active`);
      updated++;
    }

    const result = {
      updated,
      skipped,
      total: snapshot.docs.length
    };

    console.log('\n📈 Summary:');
    console.log(`   ✅ ${updated} clients updated`);
    console.log(`   ⏭️  ${skipped} clients skipped`);
    console.log(`   📊 Total: ${result.total} clients`);

    return result;
  } catch (error) {
    console.error('Error adding status to clients:', error);
    throw error;
  }
}
