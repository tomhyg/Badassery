# GUIDE COMPLET — APIS & DÉPLOIEMENT GOOGLE CLOUD

> Inventaire de toutes les APIs/services utilisés par le projet Badassery + guide de déploiement Firebase/Google Cloud.
> Dernière mise à jour : Février 2026

---

## PARTIE A — INVENTAIRE DE TOUTES LES APIS ET SERVICES

---

### 1. Firebase Firestore (Base de données)

| Propriété | Valeur |
|-----------|--------|
| **Service** | Google Cloud Firestore (NoSQL) |
| **Projet Firebase** | `brooklynn-61dc8` |
| **URL Console** | https://console.firebase.google.com/project/brooklynn-61dc8 |
| **Auth** | Service Account JSON (Firebase Admin SDK) |
| **Fichier credentials** | `brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json` (racine du projet) |
| **SDK côté serveur** | `firebase-admin` (Node.js + Python) |
| **SDK côté client** | `firebase` (React webapp) |
| **Collections** | `podcasts`, `outreach`, `clients` |
| **Rate limit** | 10 000 writes/sec, 50 000 reads/sec |
| **Coût** | Free tier : 50K reads/20K writes par jour. Au-delà : $0.06/100K reads |

**Config Firebase (webapp)** — dans `webapp/badassery/services/firebase.ts` :
```
apiKey: "AIzaSyAtzxhchv_2pmSNLXu-IZLYIqTnWop-Q7g"
authDomain: "brooklynn-61dc8.firebaseapp.com"
projectId: "brooklynn-61dc8"
storageBucket: "brooklynn-61dc8.firebasestorage.app"
messagingSenderId: "123339333797"
appId: "1:123339333797:web:fa0659cd153d09491aad4c"
measurementId: "G-SZ7TS3VYRC"
```

**Scripts qui l'utilisent :**
- `scripts/upload_podcasts_to_firestore.js`
- `scripts/parallel_scoring_v2.js`
- `scripts/import_enriched_data.js`
- `scripts/import_outreach_to_firestore.js`
- `webapp/badassery/services/podcastService.ts`
- `firestore_read.py`, `firestore_id_names.py`

---

### 2. Google Gemini API (IA / Catégorisation)

| Propriété | Valeur |
|-----------|--------|
| **Service** | Google Generative AI (Gemini) |
| **Modèle** | `gemini-2.0-flash` (scripts) / `gemini-1.5-flash` (webapp) |
| **URL de base** | `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` |
| **Auth** | API Key (query param `?key=`) |
| **Stockage clé** | Env var `GEMINI_API_KEY` ou hardcodé dans les scripts |
| **Fichier env** | `webapp/badassery/.env.local` → `GEMINI_API_KEY=...` |
| **Rate limit** | 15 RPM (free), 1500 RPM (pay-as-you-go) |
| **Coût** | Free tier : 15 req/min. Au-delà : ~$0.075/1M tokens input |
| **Obtenir une clé** | https://makersuite.google.com/app/apikey |

**Scripts qui l'utilisent :**
- `scripts/parallel_scoring_v2.js` (catégorisation batch)
- `scripts/categorize_and_score_podcasts.js` (v1)
- `webapp/badassery/services/geminiService.ts` (webapp — matching AI)

**Config dans vite.config.ts :**
```typescript
define: {
  'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
  'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
}
```

---

### 3. Apple iTunes Lookup API

| Propriété | Valeur |
|-----------|--------|
| **Service** | Apple iTunes Search API |
| **URL** | `https://itunes.apple.com/lookup?id={IDs}&entity=podcast` |
| **Auth** | Aucune (API publique) |
| **Batch** | Jusqu'à 150-200 IDs par requête (séparés par virgule) |
| **Rate limit** | ~300 req/min (non documenté officiellement) |
| **Délai appliqué** | 0.3 sec entre chaque batch |
| **Coût** | Gratuit |

**Scripts qui l'utilisent :**
- `podcast_enricher_v2.py`
- `prepare_all_podcasts.py`

---

### 4. Apple Podcasts Web Scraping

| Propriété | Valeur |
|-----------|--------|
| **Service** | Scraping du site Apple Podcasts |
| **URL** | `https://podcasts.apple.com/us/podcast/id{ITUNES_ID}` |
| **Auth** | Aucune (User-Agent browser requis) |
| **Méthode** | HTTP GET + parsing HTML (JSON-LD, regex, meta tags) |
| **Rate limit auto** | 1-3 sec randomisé entre chaque requête |
| **Délai erreur** | 10 sec après un échec |
| **Timeout** | 30 sec par requête |
| **Coût** | Gratuit |
| **Infrastructure** | Distribué sur 20 VMs en parallèle |

**Headers utilisés :**
```
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
Accept-Language: en-US,en;q=0.5
Accept-Encoding: gzip, deflate, br
```

**Scripts qui l'utilisent :**
- `apple_scraper_vm.py` (scraper principal distribué)
- `merge_apple_results.py` (fusion des résultats)

---

### 5. PodcastIndex API

| Propriété | Valeur |
|-----------|--------|
| **Service** | PodcastIndex.org REST API |
| **URL de base** | `https://api.podcastindex.org/api/1.0` |
| **Endpoint utilisé** | `/podcasts/byfeedid?id={podcast_id}` |
| **Auth** | HMAC SHA1 (API Key + Secret + epoch timestamp) |
| **Rate limit** | 10 requêtes/seconde |
| **Coût** | Gratuit (open source) |
| **Documentation** | https://podcastindex-org.github.io/docs-api/ |

**Credentials (hardcodés dans `podcast_enricher.py`) :**
```
API_KEY: AQV74G9B3U8BHPQTABUZ
API_SECRET: Y9kYKQpcgCzyuVvhALkVS2ny5B4$qTPkkSyJYw92
```

**Méthode d'authentification :**
```python
epoch_time = int(time.time())
data_to_hash = API_KEY + API_SECRET + str(epoch_time)
sha1_hash = hashlib.sha1(data_to_hash.encode()).hexdigest()

Headers: {
  "X-Auth-Date": str(epoch_time),
  "X-Auth-Key": API_KEY,
  "Authorization": sha1_hash,
  "User-Agent": "BadasseryPR/1.0"
}
```

**Scripts qui l'utilisent :**
- `podcast_enricher.py`

---

### 6. YouTube (via yt-dlp)

| Propriété | Valeur |
|-----------|--------|
| **Service** | YouTube Data Extraction |
| **Méthode** | Librairie Python `yt-dlp` (PAS l'API officielle YouTube) |
| **Auth** | Aucune |
| **Installation** | `pip install yt-dlp` |
| **Rate limit** | Pas de limite formelle mais throttling possible par YouTube |
| **Coût** | Gratuit |

**Configuration yt-dlp :**
```python
ydl_opts = {
    'quiet': True,
    'extract_flat': True,      # Métadonnées seulement, pas de téléchargement
    'playlist_items': '1-10'   # 10 dernières vidéos
}
```

**Scripts qui l'utilisent :**
- `production_enrichment_v2.py`
- `production_enrichment_vm.py`

---

### 7. RSS Feed Parsing

| Propriété | Valeur |
|-----------|--------|
| **Service** | Parsing de flux RSS/XML |
| **Méthode** | HTTP GET + `xml.etree.ElementTree` (Python) |
| **Auth** | Aucune |
| **Parallélisme** | 50 threads simultanés |
| **Timeout** | 15 sec par flux |
| **Coût** | Gratuit |

**Namespaces XML parsés :**
```python
iTunes:       http://www.itunes.com/dtds/podcast-1.0.dtd
PodcastIndex: https://podcastindex.org/namespace/1.0
Atom:         http://www.w3.org/2005/Atom
```

**Scripts qui l'utilisent :**
- `podcast_enricher.py`, `podcast_enricher_v2.py`
- `production_enrichment_v2.py`, `production_enrichment_vm.py`

---

### 8. Website Scraping (Social Links)

| Propriété | Valeur |
|-----------|--------|
| **Service** | Scraping de sites web de podcasts |
| **Méthode** | HTTP GET + regex sur le HTML |
| **Auth** | Aucune (User-Agent browser) |
| **Timeout** | 5 sec par site |
| **Coût** | Gratuit |

**Scripts qui l'utilisent :**
- `production_enrichment_v2.py`
- `production_enrichment_vm.py`

---

### 9. Gmail / Email (via Cloud Functions)

| Propriété | Valeur |
|-----------|--------|
| **Service** | Gmail SMTP via Firebase Cloud Functions |
| **Méthode** | SMTP (port 465, SSL) via `nodemailer` |
| **Auth** | Gmail App Password |
| **Fichier credentials** | `webapp/badassery/functions/.env` |
| **From address** | Configurable (default: "Ruth Kimani <ruth@badassery.co>") |
| **Coût** | Gratuit (limite Gmail : 500 emails/jour) |

**Variables d'environnement :**
```
GMAIL_USER=neil.benhamou@gmail.com
GMAIL_PASSWORD=cxglvlcxpkzkrkvj
```

**Cloud Functions exposées :**
- `sendEmail` — Envoi d'emails (support test mode)
- `testEmailConfig` — Vérification de la config SMTP

**Scripts qui l'utilisent :**
- `webapp/badassery/functions/src/index.ts`
- `webapp/badassery/services/gmailService.ts` (côté webapp)

---

### 10. Firebase Hosting (Déploiement web)

| Propriété | Valeur |
|-----------|--------|
| **Service** | Firebase Hosting (CDN global) |
| **URL déployée** | `https://brooklynn-61dc8.web.app` |
| **Dossier servi** | `dist/` (output Vite) |
| **SPA routing** | Toutes les routes → `index.html` |
| **SSL** | Automatique (HTTPS) |
| **CDN** | Global (Google Edge Network) |
| **Coût** | Free tier : 10 GB stockage, 360 MB/jour transfert |

---

### 11. Firebase Cloud Functions (Backend)

| Propriété | Valeur |
|-----------|--------|
| **Service** | Firebase Cloud Functions (2nd gen) |
| **Runtime** | Node.js 20 |
| **Region** | us-central1 (default) |
| **Source** | `webapp/badassery/functions/src/index.ts` |
| **Compilé** | `webapp/badassery/functions/lib/index.js` |
| **Coût** | Free tier : 2M invocations/mois |

---

## TABLEAU RÉCAPITULATIF DES APIS

| # | Service | Auth | Rate limit | Coût | Fichier credentials |
|---|---------|------|-----------|------|---------------------|
| 1 | Firebase Firestore | Service Account JSON | 10K writes/sec | Free tier puis $0.06/100K reads | `brooklynn-61dc8-firebase-adminsdk-*.json` |
| 2 | Google Gemini | API Key | 15 RPM (free) | Free tier puis ~$0.075/1M tokens | `.env.local` → `GEMINI_API_KEY` |
| 3 | Apple iTunes API | Aucune | ~300 req/min | Gratuit | N/A |
| 4 | Apple Scraping | User-Agent | 1-3 sec/req | Gratuit | N/A |
| 5 | PodcastIndex API | HMAC SHA1 | 10 req/sec | Gratuit | Hardcodé dans `podcast_enricher.py` |
| 6 | YouTube (yt-dlp) | Aucune | Throttling YT | Gratuit | N/A |
| 7 | RSS Parsing | Aucune | 50 threads | Gratuit | N/A |
| 8 | Website Scraping | User-Agent | 5 sec timeout | Gratuit | N/A |
| 9 | Gmail SMTP | App Password | 500 emails/jour | Gratuit | `functions/.env` |
| 10 | Firebase Hosting | Firebase CLI login | N/A | Free tier | `firebase login` |
| 11 | Cloud Functions | Firebase CLI | 2M invocations/mois | Free tier | `firebase login` |

---

## PARTIE B — COMMENT DÉPLOYER SUR GOOGLE CLOUD

---

### Prérequis

```bash
# 1. Node.js 20+ (obligatoire pour Cloud Functions)
node -v    # doit afficher v20.x.x ou supérieur

# 2. Firebase CLI
npm install -g firebase-tools

# 3. Se connecter à Firebase
firebase login
# → Ouvre le navigateur pour l'authentification Google

# 4. Vérifier le projet
firebase projects:list
# → Doit afficher "brooklynn-61dc8"
```

---

### Déployer la Web App (Firebase Hosting)

```bash
# 1. Aller dans le dossier webapp
cd "C:\Users\benha\OneDrive\Bureau\Divers\Dossier danielle\webapp\badassery"

# 2. Installer les dépendances (si pas déjà fait)
npm install

# 3. Builder l'app (Vite → dist/)
npm run build

# 4. Déployer sur Firebase Hosting
firebase deploy --only hosting

# ✅ URL : https://brooklynn-61dc8.web.app
```

**Raccourci (build + deploy en une commande) :**
```bash
npm run deploy
# Équivalent à : npm run build && firebase deploy --only hosting
```

---

### Déployer les Cloud Functions

```bash
# 1. Aller dans le dossier functions
cd "C:\Users\benha\OneDrive\Bureau\Divers\Dossier danielle\webapp\badassery\functions"

# 2. Installer les dépendances
npm install

# 3. Compiler TypeScript → JavaScript
npm run build
# Équivalent à : tsc

# 4. Déployer les functions
firebase deploy --only functions

# ✅ Functions déployées sur us-central1
```

---

### Déployer TOUT (Web App + Functions)

```bash
cd "C:\Users\benha\OneDrive\Bureau\Divers\Dossier danielle\webapp\badassery"

# Build + deploy tout
npm run deploy:all
# Équivalent à : npm run build && firebase deploy
```

---

### Vérification post-déploiement

```bash
# 1. Vérifier que le site est en ligne
# Ouvrir : https://brooklynn-61dc8.web.app

# 2. Vérifier les functions
firebase functions:log --only sendEmail

# 3. Voir le statut du déploiement
firebase hosting:channel:list

# 4. Voir les functions déployées
firebase functions:list
```

---

### Rollback (revenir en arrière)

```bash
# Lister les versions précédentes
firebase hosting:releases:list

# Revenir à une version précédente
firebase hosting:clone brooklynn-61dc8:live brooklynn-61dc8:live --version VERSION_ID
```

---

## PARTIE C — VARIABLES D'ENVIRONNEMENT

### Fichiers de configuration

| Fichier | Contenu | Utilisé par |
|---------|---------|-------------|
| `webapp/badassery/.env.local` | `GEMINI_API_KEY=...` | Webapp (Vite) |
| `webapp/badassery/functions/.env` | `GMAIL_USER=...` et `GMAIL_PASSWORD=...` | Cloud Functions |
| `brooklynn-61dc8-firebase-adminsdk-*.json` | Service Account Firebase | Scripts Node.js et Python |
| `webapp/badassery/services/firebase.ts` | Config Firebase client (hardcodée) | Webapp React |

### Comment configurer les variables

**Pour la webapp (Gemini) :**
```bash
# Créer/modifier le fichier .env.local dans webapp/badassery/
echo GEMINI_API_KEY=VOTRE_CLE_ICI > webapp/badassery/.env.local
```

**Pour les Cloud Functions (Gmail) :**
```bash
# Créer/modifier le fichier .env dans webapp/badassery/functions/
echo GMAIL_USER=votre_email@gmail.com > webapp/badassery/functions/.env
echo GMAIL_PASSWORD=votre_app_password >> webapp/badassery/functions/.env
```

**Alternative — Firebase Secrets (recommandé pour la production) :**
```bash
firebase functions:config:set gmail.user="votre_email@gmail.com" gmail.password="votre_app_password"
```

### Comment obtenir/régénérer les credentials

| Credential | Comment l'obtenir |
|-----------|------------------|
| **Gemini API Key** | https://makersuite.google.com/app/apikey → Créer une clé |
| **Firebase Service Account** | Console Firebase → Paramètres → Comptes de service → Générer une clé |
| **Gmail App Password** | Google Account → Sécurité → Mots de passe d'applications → Générer |
| **PodcastIndex API** | https://api.podcastindex.org → S'inscrire → Obtenir Key + Secret |
| **Firebase CLI Login** | `firebase login` → Authentification navigateur |
