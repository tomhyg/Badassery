/**
 * Script simple pour ajouter le statut "active" à tous les clients
 *
 * INSTRUCTIONS:
 * 1. Ouvrez la console Firebase: https://console.firebase.google.com/
 * 2. Allez dans Firestore Database
 * 3. Ou bien, ouvrez votre webapp en développement (npm run dev)
 * 4. Ouvrez la console du navigateur (F12)
 * 5. Copiez-collez tout ce code et appuyez sur Entrée
 */

// Fonction pour mettre à jour tous les clients
async function updateAllClientsStatus() {
  // Cette fonction doit être exécutée depuis votre application
  // où Firebase est déjà initialisé

  const { collection, getDocs, doc, updateDoc } = await import('firebase/firestore');
  const { db } = await import('./services/firebase.js');

  console.log('🔄 Récupération de tous les clients...');

  const clientsRef = collection(db, 'Clients');
  const snapshot = await getDocs(clientsRef);

  console.log(`📊 Trouvé ${snapshot.docs.length} clients`);

  let updated = 0;
  let skipped = 0;

  for (const clientDoc of snapshot.docs) {
    const data = clientDoc.data();
    const clientId = clientDoc.id;
    const companyName = data.identity?.company || data.company_name || 'Unknown';

    // Vérifier si le client a déjà un status
    if (data.status) {
      console.log(`⏭️  ${companyName} (${clientId}) - a déjà un statut: ${data.status}`);
      skipped++;
      continue;
    }

    // Mettre à jour avec le statut "active"
    const clientRef = doc(db, 'Clients', clientId);
    await updateDoc(clientRef, {
      status: 'active',
      updatedAt: new Date().toISOString()
    });

    console.log(`✅ ${companyName} (${clientId}) - statut ajouté: active`);
    updated++;
  }

  console.log('\n📈 Résumé:');
  console.log(`   ✅ ${updated} clients mis à jour`);
  console.log(`   ⏭️  ${skipped} clients ignorés`);
  console.log(`   📊 Total: ${snapshot.docs.length} clients`);
  console.log('\n✨ Terminé! Rechargez la page pour voir les changements.');

  return { updated, skipped, total: snapshot.docs.length };
}

// Si vous voulez l'exécuter immédiatement:
console.log('🚀 Pour mettre à jour tous les clients, exécutez:');
console.log('   updateAllClientsStatus()');
console.log('\nOu exécutez automatiquement dans 3 secondes...');

setTimeout(() => {
  updateAllClientsStatus().catch(error => {
    console.error('❌ Erreur:', error);
  });
}, 3000);
