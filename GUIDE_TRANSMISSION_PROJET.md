# GUIDE DE TRANSMISSION DU PROJET BADASSERY

> Ce guide explique comment transmettre le projet complet à un nouveau développeur.
> Dernière mise à jour : Février 2026

---

## A — CE QU'IL FAUT TRANSMETTRE

### Structure du projet

```
Dossier danielle/                              (~6.5 GB total)
│
├── 📋 DOCUMENTATION (à lire en premier)
│   ├── INDEX.md                               Index de toute la documentation
│   ├── REFERENCE_TOUS_LES_CHAMPS.md           Liste exhaustive des 195+ champs
│   ├── GUIDE_API_ET_DEPLOIEMENT.md            Toutes les APIs + guide déploiement
│   ├── GUIDE_TRANSMISSION_PROJET.md           Ce fichier
│   ├── PROJET_COMPLETE_SUMMARY.md             Résumé global du projet
│   ├── DEPLOYMENT.md                          Guide déploiement (dans webapp/)
│   ├── INSTALLATION.txt                       Instructions d'installation
│   └── [10+ autres guides .md]               Scoring, workflow, vérification...
│
├── 🐍 SCRIPTS PYTHON (enrichissement)
│   ├── podcast_enricher.py                    Enrichissement v1 (SQLite)
│   ├── podcast_enricher_v2.py                 Enrichissement v2 (batch optimisé)
│   ├── production_enrichment_v2.py            Enrichissement production
│   ├── production_enrichment_vm.py            Version multi-VM
│   ├── apple_scraper_vm.py                    Scraper Apple Podcasts (distribué)
│   ├── prepare_all_podcasts.py                Extraction SQLite → JSON
│   ├── merge_apple_results.py                 Fusion résultats Apple
│   ├── merge_enriched.py                      Fusion enrichissements
│   ├── firestore_read.py                      Lecture Firestore
│   └── [~15 autres scripts utilitaires]
│
├── 📂 scripts/                                Scripts Node.js opérationnels
│   ├── parallel_scoring_v2.js                 ⭐ Scoring AI parallèle (principal)
│   ├── upload_podcasts_to_firestore.js        Upload vers Firestore
│   ├── import_enriched_data.js                Import données enrichies
│   ├── import_outreach_to_firestore.js        Import outreach
│   ├── validate_setup.js                      Validation de l'installation
│   ├── test_gemini_api.js                     Test API Gemini
│   └── [~12 autres scripts]
│
├── 🔨 LAUNCHERS Windows (.bat)
│   ├── LANCER_PARALLEL.bat                    ⭐ Lanceur principal
│   ├── LANCER_AI_COMPLETE.bat                 Catégorisation AI complète
│   ├── VALIDATE_SETUP.bat                     Validation setup
│   └── CHECK_STATUS.bat                       Vérification statut
│
├── 🗄️ DONNÉES (GROS FICHIERS)
│   ├── podcastindex_feeds.db                  ⚠️ 4.6 GB — Base SQLite PodcastIndex
│   ├── podcastindex_feeds.db.tgz              1.7 GB — Version compressée
│   ├── apple_cache.json                       78 MB — Cache Apple
│   ├── enriched_vm1.json ... vm20.json        ~380 MB — Résultats enrichissement
│   └── [CSV clients, outreach, checkpoints]
│
├── 🔐 CREDENTIALS
│   ├── brooklynn-61dc8-firebase-adminsdk-*.json   Service Account Firebase
│   └── (voir section D pour la liste complète)
│
├── 📦 DÉPENDANCES (régénérables)
│   ├── package.json                           Dépendances Node.js racine
│   ├── node_modules/                          ⚠️ À EXCLURE du ZIP (régénérable)
│   └── .venv/                                 ⚠️ À EXCLURE du ZIP (régénérable)
│
└── 🌐 webapp/badassery/                       Application web React
    ├── package.json                           Dépendances webapp
    ├── vite.config.ts                         Config build Vite
    ├── firebase.json                          Config Firebase Hosting
    ├── .firebaserc                            Projet Firebase (brooklynn-61dc8)
    ├── .env.local                             ⚠️ GEMINI_API_KEY
    ├── index.html                             Point d'entrée HTML
    ├── index.tsx                              Point d'entrée React
    ├── App.tsx                                Composant principal
    ├── components/                            Composants React
    │   ├── Layout.tsx                         Layout principal + araignée Brooklyn
    │   ├── Brooklyn.tsx                       Araignée animée avec mots libanais
    │   ├── PodcastMatchCard.tsx               Carte de matching podcast
    │   └── [~10 autres composants]
    ├── pages/                                 Pages de l'app
    │   ├── AIMatching.tsx                     Matching AI client-podcast
    │   ├── ClientDetail.tsx                   Détail client
    │   └── [~6 pages]
    ├── services/                              Services backend
    │   ├── firebase.ts                        Config Firebase client
    │   ├── podcastService.ts                  CRUD podcasts Firestore
    │   ├── geminiService.ts                   Appels Gemini API
    │   └── gmailService.ts                    Envoi emails
    ├── functions/                             Cloud Functions
    │   ├── src/index.ts                       Code source TypeScript
    │   ├── lib/index.js                       ⚠️ Compilé (régénérable)
    │   ├── .env                               ⚠️ GMAIL credentials
    │   └── package.json                       Dépendances functions
    ├── dist/                                  ⚠️ Build output (régénérable)
    └── node_modules/                          ⚠️ À EXCLURE (régénérable)
```

### Tailles

| Composant | Taille | Inclure dans ZIP ? |
|-----------|--------|-------------------|
| Code source (scripts + webapp) | ~50 MB | OUI |
| Documentation (.md) | ~5 MB | OUI |
| Credentials (JSON, .env) | <1 MB | OUI (mais régénérer ensuite) |
| Base PodcastIndex (SQLite) | **4.6 GB** | NON — transférer séparément |
| Base compressée (.tgz) | 1.7 GB | Optionnel — transférer séparément |
| Données enrichies (JSON) | ~380 MB | Optionnel — régénérable |
| Apple cache | 78 MB | Optionnel — régénérable |
| node_modules + .venv | ~100 MB | NON — régénérable |
| dist/ + lib/ | ~20 MB | NON — régénérable |

---

## B — COMMENT TRANSMETTRE

### Option 1 : ZIP + Lien cloud (RECOMMANDÉ)

#### Étape 1 : Préparer le ZIP (code uniquement)

Exclure du ZIP les fichiers régénérables et les gros fichiers :
- `node_modules/` (racine + webapp + functions)
- `.venv/`
- `webapp/badassery/dist/`
- `webapp/badassery/functions/lib/`
- `__pycache__/`
- `podcastindex_feeds.db` (4.6 GB — trop gros)
- `podcastindex_feeds.db.tgz` (1.7 GB)
- `enriched_vm*.json` (optionnel — régénérable)
- `.firebase/`

**Commande PowerShell pour créer le ZIP :**
```powershell
# Depuis le dossier parent
$source = "C:\Users\benha\OneDrive\Bureau\Divers\Dossier danielle"
$dest = "C:\Users\benha\OneDrive\Bureau\Badassery_Projet.zip"

# Copier dans un dossier temp sans les exclusions
$temp = "C:\Users\benha\OneDrive\Bureau\Badassery_temp"
robocopy $source $temp /E /XD node_modules .venv dist lib __pycache__ .firebase /XF "podcastindex_feeds.db" "podcastindex_feeds.db.tgz" "enriched_vm*.json" "checkpoint_vm*.json" "apple_cache.json"

# Créer le ZIP
Compress-Archive -Path $temp -DestinationPath $dest -Force

# Nettoyer
Remove-Item -Recurse -Force $temp
```

**Taille estimée du ZIP : ~50-100 MB** (code + docs + credentials + petits data)

#### Étape 2 : Transférer la base de données séparément

La base PodcastIndex (4.6 GB) doit être envoyée via :

| Méthode | Limite | Temps estimé |
|---------|--------|-------------|
| **Google Drive** (partage lien) | 15 GB | ~30 min upload |
| **OneDrive** (partage lien) | 250 GB | ~30 min upload |
| **WeTransfer Pro** | 200 GB | ~30 min upload |
| **Clé USB / Disque dur** | Illimité | Instantané |

> La version compressée `podcastindex_feeds.db.tgz` fait 1.7 GB — plus rapide à transférer.

#### Étape 3 : Envoyer au nouveau développeur

1. Envoyer le **ZIP** par email ou lien de partage (~100 MB)
2. Envoyer le **lien Google Drive/OneDrive** pour la base SQLite
3. Envoyer ce **guide** (ou il est déjà dans le ZIP)

---

### Option 2 : Partage de dossier OneDrive/Google Drive

Si le nouveau développeur a accès à OneDrive :
1. Partager le dossier "Dossier danielle" directement via OneDrive
2. Il peut synchroniser tout le dossier sur son PC
3. Plus simple mais nécessite que tout le monde ait OneDrive

### Option 3 : Clé USB / Disque dur externe

Pour les gros volumes (>5 GB) :
1. Copier tout le dossier sur une clé USB 8 GB+
2. La base SQLite rentre sur la clé
3. Méthode la plus fiable pour les gros fichiers

---

## C — CHECKLIST D'INSTALLATION POUR LE NOUVEAU DÉVELOPPEUR

Le nouveau développeur doit suivre ces étapes dans l'ordre :

### Phase 1 : Environnement de base

```
[ ] 1. Extraire le ZIP dans un dossier local
       Ex: C:\Users\[nom]\Projets\Badassery\

[ ] 2. Installer Node.js 20+ (LTS)
       → https://nodejs.org/
       → Vérifier : node -v  (doit afficher v20.x.x ou plus)
       → Vérifier : npm -v

[ ] 3. Installer Python 3.x
       → https://www.python.org/downloads/
       → Cocher "Add Python to PATH" pendant l'installation
       → Vérifier : python --version

[ ] 4. Installer Firebase CLI globalement
       npm install -g firebase-tools
       → Vérifier : firebase --version
```

### Phase 2 : Dépendances du projet

```
[ ] 5. Installer les dépendances Node.js (racine)
       cd "chemin/vers/Dossier danielle"
       npm install

[ ] 6. Installer les dépendances webapp
       cd webapp/badassery
       npm install

[ ] 7. Installer les dépendances Cloud Functions
       cd functions
       npm install
       cd ../../..

[ ] 8. Créer l'environnement Python
       python -m venv .venv
       .venv\Scripts\activate          (Windows)
       pip install beautifulsoup4 requests firebase-admin yt-dlp
```

### Phase 3 : Base de données

```
[ ] 9.  Récupérer la base PodcastIndex
        → Télécharger depuis le lien Google Drive / OneDrive
        → Placer podcastindex_feeds.db à la racine du projet
        → OU extraire podcastindex_feeds.db.tgz

[ ] 10. Vérifier la base
        python -c "import sqlite3; db=sqlite3.connect('podcastindex_feeds.db'); print(db.execute('SELECT COUNT(*) FROM podcasts').fetchone())"
        → Doit afficher un nombre > 800000
```

### Phase 4 : Configuration Firebase & APIs

```
[ ] 11. Se connecter à Firebase
        firebase login
        → Authentification via le navigateur
        → Demander l'accès au projet "brooklynn-61dc8" si nécessaire

[ ] 12. Vérifier le projet Firebase
        firebase projects:list
        → Doit afficher "brooklynn-61dc8"

[ ] 13. Configurer la clé Gemini API
        → Aller sur https://makersuite.google.com/app/apikey
        → Créer ou récupérer une clé API
        → Créer le fichier webapp/badassery/.env.local :
          GEMINI_API_KEY=votre_cle_ici

[ ] 14. Configurer Gmail (si envoi d'emails nécessaire)
        → Créer un mot de passe d'application Gmail
        → Éditer webapp/badassery/functions/.env :
          GMAIL_USER=votre_email@gmail.com
          GMAIL_PASSWORD=votre_app_password

[ ] 15. Vérifier le service account Firebase
        → Le fichier brooklynn-61dc8-firebase-adminsdk-*.json doit être à la racine
        → Si manquant : Console Firebase → Paramètres → Comptes de service → Générer
```

### Phase 5 : Validation

```
[ ] 16. Valider le setup complet
        node scripts/validate_setup.js
        → OU lancer VALIDATE_SETUP.bat

[ ] 17. Tester la connexion Firestore
        node scripts/verify_firestore_podcasts.js

[ ] 18. Tester l'API Gemini
        node scripts/test_gemini_api.js

[ ] 19. Lancer le serveur de développement
        cd webapp/badassery
        npm run dev
        → Ouvrir http://localhost:3000

[ ] 20. Builder et vérifier la production
        npm run build
        → Le dossier dist/ doit être créé sans erreurs
```

### Phase 6 : Premier déploiement

```
[ ] 21. Déployer la webapp
        cd webapp/badassery
        npm run deploy
        → Vérifier : https://brooklynn-61dc8.web.app

[ ] 22. Déployer les Cloud Functions
        cd functions
        firebase deploy --only functions

[ ] 23. Test final
        → Naviguer sur le site
        → Vérifier que les podcasts s'affichent
        → Tester le matching AI
        → Tester l'envoi d'email (mode test)
```

---

## D — FICHIERS SENSIBLES / CREDENTIALS

### Liste des credentials dans le projet

| Credential | Fichier | Sensibilité | Action recommandée |
|-----------|---------|-------------|-------------------|
| Firebase Service Account | `brooklynn-61dc8-firebase-adminsdk-*.json` | HAUTE | Régénérer pour le nouveau dev |
| Firebase Client Config | `webapp/badassery/services/firebase.ts` | Moyenne (public) | Peut rester tel quel |
| Gemini API Key | `webapp/badassery/.env.local` | Moyenne | Créer une nouvelle clé |
| Gmail App Password | `webapp/badassery/functions/.env` | HAUTE | Régénérer obligatoirement |
| PodcastIndex API Key | Hardcodé dans `podcast_enricher.py` | Moyenne | Vérifier validité |
| PodcastIndex API Secret | Hardcodé dans `podcast_enricher.py` | HAUTE | Vérifier validité |

### Comment régénérer les credentials

**Firebase Service Account :**
1. Aller sur https://console.firebase.google.com/project/brooklynn-61dc8/settings/serviceaccounts
2. Cliquer "Générer une nouvelle clé privée"
3. Sauvegarder le JSON à la racine du projet
4. Mettre à jour le chemin dans les scripts si le nom du fichier change

**Gemini API Key :**
1. Aller sur https://makersuite.google.com/app/apikey
2. Créer une nouvelle clé
3. Mettre dans `webapp/badassery/.env.local`

**Gmail App Password :**
1. Aller sur https://myaccount.google.com/apppasswords
2. Sélectionner "Mail" et "Autre" (nommer "Badassery")
3. Copier le mot de passe de 16 caractères
4. Mettre dans `webapp/badassery/functions/.env`

**PodcastIndex API :**
1. Aller sur https://api.podcastindex.org/
2. S'inscrire / se connecter
3. Obtenir le nouveau API_KEY et API_SECRET
4. Mettre à jour dans `podcast_enricher.py`

---

## E — ARCHITECTURE RÉSUMÉE

### Pipeline de données

```
┌─────────────────┐
│  PodcastIndex    │  Base SQLite (4.6 GB, 800K+ podcasts)
│  SQLite DB       │
└────────┬────────┘
         │ Filtres SQL (langue, activité, épisodes, iTunes ID)
         ▼
┌─────────────────┐
│  ~5-10K podcasts │  Podcasts filtrés
│  (JSON files)    │
└────────┬────────┘
         │ Split en 20 fichiers pour VMs
         ▼
┌─────────────────────────────────────────────┐
│  ENRICHISSEMENT PARALLÈLE (20 VMs)          │
│                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ RSS Feed │ │ Apple    │ │ Website  │    │
│  │ Parsing  │ │ Scraping │ │ Scraping │    │
│  │ (50 thr) │ │ (HTML)   │ │ (regex)  │    │
│  └──────────┘ └──────────┘ └──────────┘    │
│                                             │
│  ┌──────────┐ ┌──────────┐                  │
│  │ YouTube  │ │ Apple    │                  │
│  │ (yt-dlp) │ │ iTunes   │                  │
│  │          │ │ API      │                  │
│  └──────────┘ └──────────┘                  │
└────────────────────┬────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│  SCORING AI (Gemini 2.0 Flash)              │
│                                             │
│  Catégorisation → 31 niches Badassery       │
│  Scoring → engagement, audience, qualité    │
│  Percentiles → par catégorie + global       │
│  Badassery Score → 0-100                    │
└────────────────────┬────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│  FIRESTORE (Cloud)                          │
│                                             │
│  Collection "podcasts" → 120K+ documents    │
│  Collection "clients"  → clients outreach   │
│  Collection "outreach" → campagnes          │
│  195+ champs par podcast                    │
└────────────────────┬────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│  WEB APP (React + Firebase Hosting)         │
│                                             │
│  Dashboard → stats globales                 │
│  Podcasts  → recherche/filtrage             │
│  Clients   → gestion clientèle             │
│  Outreach  → kanban campagnes              │
│  AI Match  → matching client ↔ podcast     │
│                                             │
│  URL : https://brooklynn-61dc8.web.app     │
└─────────────────────────────────────────────┘
```

### Stack technique

| Composant | Technologie | Version |
|-----------|------------|---------|
| Frontend | React + TypeScript | 19.2 + 5.8 |
| Build tool | Vite | 6.2 |
| Backend (DB) | Firebase Firestore | v11 |
| Backend (Functions) | Firebase Cloud Functions | Node.js 20 |
| Hosting | Firebase Hosting | CDN global |
| IA | Google Gemini | 2.0 Flash |
| Scraping Python | BeautifulSoup + requests | 4.x |
| YouTube | yt-dlp | dernière version |
| Email | Nodemailer (SMTP Gmail) | 6.9 |
| Icons | Lucide React | 0.562 |
| Charts | Recharts | 3.6 |

### Projet Firebase

| Propriété | Valeur |
|-----------|--------|
| **Project ID** | `brooklynn-61dc8` |
| **Console** | https://console.firebase.google.com/project/brooklynn-61dc8 |
| **Hosting URL** | https://brooklynn-61dc8.web.app |
| **Region Functions** | us-central1 |
| **Firestore** | Mode natif |

---

## F — QUESTIONS FRÉQUENTES

**Q : Est-ce que le nouveau dev a besoin d'un compte Google spécifique ?**
R : Non, mais il doit être ajouté comme collaborateur sur le projet Firebase. Aller dans Console Firebase → Paramètres → Utilisateurs et autorisations → Ajouter un membre.

**Q : Est-ce que la base PodcastIndex est gratuite ?**
R : Oui, PodcastIndex est open source. La base peut être retéléchargée sur https://podcastindex.org/

**Q : Les API keys sont-elles payantes ?**
R : Gemini, PodcastIndex, iTunes, et yt-dlp sont tous gratuits (avec des limites). Firebase a un free tier généreux. Gmail permet 500 emails/jour gratuitement.

**Q : Faut-il des VMs Google Cloud pour le scraping ?**
R : Non pour les petits batches. Les VMs sont utilisées pour le scraping massif (120K+ podcasts). Pour la maintenance quotidienne, un seul PC suffit.

**Q : Comment mettre à jour la base PodcastIndex ?**
R : Télécharger la dernière version depuis https://podcastindex.org/ → elle est mise à jour régulièrement. Puis relancer le pipeline d'enrichissement.
