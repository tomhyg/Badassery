/**
 * Script pour ajouter le statut "active" à tous les clients existants dans Firestore
 *
 * Exécuter avec: node --loader ts-node/esm scripts/updateClientStatus.ts
 * Ou simplement copier-coller le code dans la console Firebase
 */

import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';

async function updateAllClientStatuses() {
  try {
    console.log('🔄 Récupération de tous les clients...');

    const clientsRef = collection(db, 'Clients');
    const snapshot = await getDocs(clientsRef);

    console.log(`📊 Trouvé ${snapshot.docs.length} clients`);

    let updated = 0;
    let skipped = 0;

    for (const clientDoc of snapshot.docs) {
      const data = clientDoc.data();

      // Vérifier si le client a déjà un status
      if (data.status) {
        console.log(`⏭️  Client ${clientDoc.id} a déjà un statut: ${data.status}`);
        skipped++;
        continue;
      }

      // Mettre à jour avec le statut "active"
      const clientRef = doc(db, 'Clients', clientDoc.id);
      await updateDoc(clientRef, {
        status: 'active',
        updatedAt: new Date().toISOString()
      });

      console.log(`✅ Client ${clientDoc.id} (${data.identity?.company || 'Unknown'}) - statut ajouté: active`);
      updated++;
    }

    console.log('\n📈 Résumé:');
    console.log(`   ✅ ${updated} clients mis à jour`);
    console.log(`   ⏭️  ${skipped} clients ignorés (ont déjà un statut)`);
    console.log(`   📊 Total: ${snapshot.docs.length} clients`);

  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour:', error);
  }
}

// Exécuter le script
console.log('🚀 Démarrage de la mise à jour des statuts...\n');
updateAllClientStatuses()
  .then(() => {
    console.log('\n✨ Terminé!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Erreur fatale:', error);
    process.exit(1);
  });
