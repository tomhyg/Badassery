# Setup Guide - Badassery Webapp avec Firestore

## Installation

1. **Installer les dépendances**
   ```bash
   cd webapp/badassery
   npm install
   ```

2. **Démarrer l'application**
   ```bash
   npm run dev
   ```

## Fonctionnalités implémentées

### ✅ Page Clients
- Affiche tous les clients depuis Firestore
- Recherche en temps réel par nom de compagnie ou contact
- Filtrage par statut (Active, Onboarding, Paused, Churned)
- Affichage des statistiques (Matches, Outreach, Bookings)
- Navigation vers les détails du client

### ✅ Client Onboarding (Formulaire complet)
Le formulaire d'onboarding est maintenant un processus en 6 étapes qui capture toutes les informations de votre structure Firestore:

**Étape 1 - Identity:**
- Nom, prénom, email, téléphone
- Titre du poste, entreprise
- Taille de l'entreprise
- Type de représentation

**Étape 2 - Goals & Vision:**
- Objectifs professionnels
- Description du travail
- Mission de l'entreprise
- Pourquoi maintenant?
- Top 3 objectifs
- Challenges
- Définition du succès

**Étape 3 - Links & Assets:**
- LinkedIn et réseaux sociaux
- Travaux de branding passés
- Photo professionnelle
- Lien de calendrier
- Podcasts passés
- Contenu ton/voix

**Étape 4 - Brand & Content:**
- 3 adjectifs qui vous décrivent
- Comment l'audience devrait se sentir
- Phrases clés
- Sujets de passion
- Bio professionnelle
- Topics de présentation

**Étape 5 - Podcast Preferences:**
- Description de l'audience cible
- Produits/services
- Podcasts de rêve
- Questions clés
- Takeaways pour les auditeurs
- Localisation cible
- Ouvert aux enregistrements en personne

**Étape 6 - Status & Preferences:**
- Plateformes utilisées
- Évaluation de la présence en ligne
- Engagement mensuel en temps
- Intérêt pour la communauté
- Directives légales
- Notes additionnelles
- Tags

### ✅ Structure Firestore
La webapp est maintenant entièrement connectée à votre collection Firestore "Clients" avec tous les champs:

```typescript
{
  identity: { firstName, lastName, email, phone, jobTitle, company, ... },
  goals: { professionalGoals, workDescription, missionDescription, ... },
  links: { linkedinAndSocial, pastBrandingWork, headshot, ... },
  currentStatus: { pastBrandingWork, onlinePresenceRating, platformsUsed, ... },
  selfAssessment: { clarity, confidence, promotionComfort, ... },
  brandPersonality: { threeAdjectives, audienceFeeling, keyPhrases, ... },
  content: { bioOriginal, bioUpdated, speakingTopicsArray, ... },
  podcast: { audienceDescription, productsServices, dreamPodcasts, ... },
  preferences: { feedbackStyle, monthlyTimeCommitment, interestedInCommunity, ... },
  metadata: { startDateUtc, submitDateUtc, clientStatus, tags, ... }
}
```

### ✅ Services créés

**services/firebase.ts** - Configuration Firebase
**services/clientService.ts** - Opérations CRUD pour les clients:
- `getAllClients()` - Récupère tous les clients
- `getClientById(id)` - Récupère un client par ID
- `getClientsByStatus(status)` - Filtre par statut
- `createClient(data)` - Crée un nouveau client
- `updateClient(id, updates)` - Met à jour un client
- `deleteClient(id)` - Supprime un client
- `searchClients(term)` - Recherche par nom

## Structure des fichiers

```
badassery/
├── services/
│   ├── firebase.ts           # Configuration Firebase
│   ├── clientService.ts      # Service Firestore pour Clients
│   └── mockData.ts           # Données mockées (pour autres sections)
├── pages/
│   ├── Clients.tsx           # Page liste des clients (✅ Connecté à Firestore)
│   ├── ClientOnboardingNew.tsx  # Formulaire complet (✅ Sauvegarde dans Firestore)
│   ├── ClientDetail.tsx      # Détails d'un client
│   ├── Dashboard.tsx         # Dashboard
│   ├── Podcasts.tsx          # Page podcasts
│   └── Outreach.tsx          # Board de suivi outreach
├── components/
│   ├── Layout.tsx            # Layout principal
│   └── Modal.tsx             # Composant modal
├── types.ts                  # Types TypeScript (✅ Mis à jour avec structure Firestore)
└── App.tsx                   # App principale

```

## Prochaines étapes suggérées

1. **Dashboard** - Connecter aux vraies stats Firestore
2. **Client Detail** - Afficher toutes les informations du client avec la nouvelle structure
3. **Podcasts** - Créer une collection Firestore pour les podcasts
4. **Outreach** - Créer une collection Firestore pour les outreach items
5. **Authentication** - Ajouter Firebase Auth pour la sécurité
6. **Storage** - Utiliser Firebase Storage pour les photos/assets

## Notes importantes

- Assurez-vous que votre collection Firestore s'appelle exactement "Clients" (avec majuscule)
- Les credentials Firebase sont déjà configurés dans `services/firebase.ts`
- L'application utilise une fonction helper `getClientDisplayData()` pour convertir la nouvelle structure Firestore en format legacy pour l'affichage
- Les champs sont maintenus pour la compatibilité avec les anciennes pages

## Commandes utiles

```bash
# Développement
npm run dev

# Build production
npm run build

# Preview du build
npm run preview
```

## Support

Pour toute question, référez-vous à la documentation Firebase:
- [Firestore](https://firebase.google.com/docs/firestore)
- [Firebase Web](https://firebase.google.com/docs/web/setup)
