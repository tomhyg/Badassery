# Guide: Script AI Unifié - Catégorisation + Scoring

## Vue d'ensemble

Le script **categorize_and_score_podcasts.js** combine:

1. ✅ **Catégorisation Gemini** avec vos 31 niches Badassery exactes
2. ✅ **Calcul de scoring** avec votre algorithme exact (Python porté en JavaScript)
3. ✅ **Update automatique** vers Firestore

---

## Champs Ajoutés par le Script

### Catégorisation AI (Gemini)

| Champ | Type | Source | Description |
|-------|------|--------|-------------|
| `ai_primary_category` | string | Gemini | 1 niche parmi les 31 Badassery |
| `ai_secondary_categories` | string[] | Gemini | 1-2 catégories secondaires |
| `ai_topics` | string[] | Gemini | 3-5 topics spécifiques |
| `ai_target_audience` | string | Gemini | Description de l'audience |
| `ai_podcast_style` | string | Gemini | Interview, Solo, Panel, etc. |
| `ai_business_relevance` | number (1-10) | Gemini | Pertinence B2B |
| `ai_guest_friendly` | boolean | Gemini | Accepte des invités |
| `ai_summary` | string | Gemini | Résumé unique 2-3 phrases |

### Scoring Calculé (Algorithme)

| Champ | Type | Source | Description |
|-------|------|--------|-------------|
| `ai_engagement_level` | number (1-10) | Calculé | Apple reviews + YouTube + fraîcheur + social |
| `ai_audience_size` | string | Calculé | Small, Medium, Large, Very Large |
| `ai_content_quality` | number (1-10) | Calculé | Basé sur Apple rating + review count |
| `ai_monetization_potential` | number (1-10) | Calculé | Audience size (60%) + engagement (40%) |

### Métadonnées

| Champ | Type | Description |
|-------|------|-------------|
| `aiCategorizationStatus` | string | completed, failed, pending |
| `aiCategorizedAt` | Timestamp | Date de traitement |
| `aiCategorizationError` | string | Message d'erreur si échec |

---

## Les 31 Niches Badassery

Le script utilise **EXACTEMENT** vos niches:

1. Female Founders & Women in Business
2. Tech Leadership & Engineering
3. Startup Founders & Entrepreneurs
4. Executive Coaches & Leadership Consultants
5. Wellness Coaches & Health Experts
6. Expat Life & International Living
7. Community Builders & Event Organizers
8. SaaS & Product Leaders
9. AI & Machine Learning Experts
10. Marketing & Brand Strategists
11. Venture Capital & Investors
12. Social Impact & Non-Profit Leaders
13. Sales & Revenue Strategists
14. Organizational Change Consultants
15. Personal Development Coaches
16. Spiritual Intelligence & Mindfulness
17. Career Transition Coaches
18. Content Creators & Storytellers
19. Pricing & Monetization Experts
20. Data & Analytics Leaders
21. HR & People Operations
22. Finance & Investing Experts
23. Parenting & Family
24. Health & Fitness Professionals
25. Mental Health & Therapy
26. Creative & Design Leaders
27. Education & Learning
28. Sustainability & ESG
29. Food & Nutrition
30. Travel & Lifestyle
31. General Business & Lifestyle

---

## Algorithme de Scoring

### 1. Engagement Level (1-10)

**Formule**: Moyenne pondérée de 4 signaux

#### Signal 1: Apple Reviews (Poids 3.0)
- Base: `log10(review_count) * 2.5`
- Bonus si rating ≥ 4.5 et count ≥ 20: `× 1.2`
- Bonus si rating ≥ 4.0 et count ≥ 50: `× 1.1`

#### Signal 2: YouTube Engagement (Poids 3.0)
- Ratio subs/épisode: `log10(subs/episodes) * 2.5`
- Bonus si ratio vues/subs > 10%: `× 1.3`
- Bonus si ratio 5-10%: `× 1.1`
- Pénalité si ratio < 1%: `× 0.8` (audience fantôme)

#### Signal 3: Fraîcheur (Poids 2.0)
- ≤ 7 jours: 10.0 (très actif)
- ≤ 14 jours: 9.0
- ≤ 30 jours: 7.5
- ≤ 60 jours: 5.0
- ≤ 90 jours: 3.0
- ≤ 180 jours: 2.0
- > 180 jours: 1.0 (abandonné)

#### Signal 4: Social Media (Poids 1.0)
- Score: `2.0 + nombre_plateformes * 1.6`
- Plateformes: Facebook, Instagram, Twitter, LinkedIn, TikTok, Spotify

**Pénalité**: Si moins de 2 signaux: `× 0.85`

---

### 2. Audience Size

**Formule**: Score pondéré multi-signaux

#### Seuils:

| Signal | Very Large | Large | Medium | Small |
|--------|-----------|-------|--------|-------|
| YouTube Subs | 100K+ | 25K+ | 5K+ | < 5K |
| Apple Reviews | 500+ | 100+ | 25+ | < 25 |
| Episodes | 500+ | 200+ | 50+ | < 50 |
| Avg YouTube Views | 50K+ | 10K+ | 2K+ | < 2K |

#### Poids:
- YouTube subs: 1.5
- Apple reviews: 1.0
- Episodes: 0.5
- YouTube views: 1.0

**Classification**:
- Score ≥ 3.5 → Very Large
- Score ≥ 2.5 → Large
- Score ≥ 1.5 → Medium
- Score < 1.5 → Small

---

### 3. Content Quality (1-10)

**Formule**:
```javascript
base = apple_rating * 2  // Scale 0-5 to 0-10

if (review_count >= 100) base *= 1.1      // Très confiant
else if (review_count >= 50) base *= 1.05  // Confiant
else if (review_count < 10) base *= 0.9    // Peu confiant
```

**Default**: 5.0 si pas de données

---

### 4. Monetization Potential (1-10)

**Formule**:
```javascript
size_score_map = {
  'Very Large': 10,
  'Large': 8,
  'Medium': 5,
  'Small': 3,
  'Unknown': 4
}

score = (size_score * 0.6) + (engagement_level * 0.4)
```

60% basé sur taille, 40% sur engagement

---

## Comment Lancer

### Prérequis

1. **Installer dépendances**:
```bash
cd "C:\Users\admin\OneDrive\Bureau\Dossier danielle"
npm install
```

2. **Obtenir clé Gemini API**:
- Aller sur https://makersuite.google.com/app/apikey
- Créer une clé API
- Copier la clé (commence par "AIza...")

### Option A: Via Variable d'Environnement

```bash
set GEMINI_API_KEY=AIza...votre_cle_ici
```

Puis double-cliquer sur: **LANCER_AI_COMPLETE.bat**

### Option B: Éditer le Script

Ouvrir `scripts/categorize_and_score_podcasts.js` ligne 14:
```javascript
const genAI = new GoogleGenerativeAI('AIza...votre_cle_ici');
```

Puis lancer:
```bash
node scripts/categorize_and_score_podcasts.js
```

---

## Configuration

### Variables Modifiables

Dans `categorize_and_score_podcasts.js`:

```javascript
const BATCH_SIZE = 10;  // Podcasts par batch Gemini
const PAUSE_BETWEEN_BATCHES = 2000;  // Pause entre batches (ms)
const MAX_PODCASTS_TO_PROCESS = 100;  // Limite (pour test)
```

### Pour Traiter TOUS les Podcasts

Modifier `MAX_PODCASTS_TO_PROCESS` à une grande valeur:
```javascript
const MAX_PODCASTS_TO_PROCESS = 200000;
```

Ou commenter la limite dans la query Firestore (ligne ~580).

---

## Output Example

```
================================================================================
   🤖 PODCAST CATEGORIZATION & SCORING (UNIFIED)
================================================================================
📊 Batch size: 10
⏱️  Pause between batches: 2000ms
🎯 Max podcasts: 100
🏷️  Niches: 31
📝 Topics: 56
================================================================================

[14:30:15] 📂 Fetching podcasts from Firestore...
[14:30:16] ✅ Found 87 podcasts to process

================================================================================
📦 Batch 1/9 (10 podcasts)
================================================================================
[14:30:17] 🤖 Categorizing with Gemini...
[14:30:19] 📊 Calculating scores and updating Firestore...

   Processing: Tech Leaders Podcast
   → Niche: Tech Leadership & Engineering
   → Topics: Leadership, AI & Technology, Business Strategy
   → Business: 9/10
   → Guest-Friendly: Yes
   ✅ Success - Engagement: 8.2/10, Audience: Large

   Processing: Wellness Journey
   → Niche: Wellness Coaches & Health Experts
   → Topics: Health & Wellness, Mindfulness, Personal Growth
   → Business: 6/10
   → Guest-Friendly: No
   ✅ Success - Engagement: 7.1/10, Audience: Medium

[...]

📊 Batch 1 complete:
   ✅ Processed: 10
   ❌ Failed: 0

⏸️  Pausing 2000ms...

[...]

================================================================================
   ✅ PROCESSING COMPLETE
================================================================================

📊 Final Results:
   ✅ Processed: 87
   ❌ Failed: 0
================================================================================
```

---

## Différences avec Version Python

### ✅ Identique:
- Algorithme de scoring exact
- Formules mathématiques
- Seuils et poids
- Logique de décision

### 📝 Adaptations JavaScript:
- `Math.log10()` au lieu de `math.log10()`
- `Array.filter()` au lieu de list comprehension
- Dates avec `new Date()` au lieu de `datetime`
- Firestore au lieu de Airtable/CSV

---

## Troubleshooting

### Erreur: "GEMINI_API_KEY not defined"

**Solution**: Définir la variable ou éditer le script

### Erreur: "Rate limit exceeded"

**Solution**:
- Augmenter `PAUSE_BETWEEN_BATCHES` à 3000-5000ms
- Réduire `BATCH_SIZE` à 5

### Erreur: "Invalid JSON from Gemini"

**Solution**: Gemini a renvoyé du texte invalide
- Le script gère déjà les markdown code blocks
- Si persiste, vérifier le prompt (ligne ~200)

### Certains podcasts échouent

**Normal**: Podcasts sans données (title + description vides)
- Marqués comme 'failed' dans Firestore
- Peuvent être réessayés en relançant le script

---

## Performance

### Gemini Categorization
- **Vitesse**: ~2-3 secondes par batch de 10
- **Coût**: Très faible (Gemini 2.0 Flash)

### Scoring Calculation
- **Vitesse**: Instantané (calculs locaux)
- **Coût**: Gratuit

### Firestore Updates
- **Vitesse**: ~200ms par podcast
- **Coût**: 1 write par podcast

### Total Estimé
- **100 podcasts**: ~5-8 minutes
- **1,000 podcasts**: ~50-80 minutes
- **200,000 podcasts**: ~7-10 jours en continu

**Recommandation**: Traiter par batches de 1,000-10,000

---

## Next Steps

Après le traitement:

1. **Vérifier les résultats** dans Firestore:
   ```javascript
   const podcasts = await getPodcastsByCategory('Tech Leadership & Engineering');
   console.log(podcasts);
   ```

2. **Utiliser les filtres** dans votre UI:
   ```javascript
   const guestFriendly = await getGuestFriendlyPodcasts(7, 50);
   const bestForOutreach = await getBestPodcastsForOutreach(100);
   ```

3. **Créer des dashboards** avec les scores:
   - Distribution par niche
   - Top podcasts par business relevance
   - Guest-friendly vs non guest-friendly

---

## Résumé

**Script Unifié** = Gemini (catégorisation) + Algorithme (scoring) + Firestore (auto-update)

**Total**: 12 champs AI ajoutés par podcast

**Niches**: 31 niches Badassery exactes

**Topics**: 56 topics autorisés

**Algorithme**: Votre algorithme Python porté en JavaScript (100% identique)

**C'est prêt à lancer!** 🚀
