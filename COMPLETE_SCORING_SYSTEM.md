# Système de Scoring AI Complet - Badassery PR

## Vue d'ensemble

Le système de scoring Badassery combine **catégorisation IA**, **scoring multi-signaux**, **ranking par catégorie** et **score composite** pour identifier les meilleurs podcasts pour l'outreach.

---

## Architecture: 5 Phases

### Phase 1-2: Catégorisation Gemini + Scoring Individuel

**Gemini AI catégorise chaque podcast:**
- 1 niche parmi 31 niches Badassery
- 3-5 topics spécifiques
- Business relevance (1-10)
- Guest-friendly (true/false)
- Summary unique

**Scoring individuel calculé localement:**
- **Engagement Level (1-10)**: Combien l'audience est active
  - Apple reviews (poids 3.0)
  - YouTube engagement (poids 3.0)
  - Fraîcheur / activité (poids 2.0)
  - Présence social media (poids 1.0)

- **Audience Size**: Taille de l'audience
  - Small: < 5K subs, < 25 reviews
  - Medium: 5K-25K subs, 25-100 reviews
  - Large: 25K-100K subs, 100-500 reviews
  - Very Large: 100K+ subs, 500+ reviews

- **Content Quality (1-10)**: Qualité du contenu
  - Basé sur Apple rating (0-5 → 0-10)
  - Bonus si beaucoup de reviews (confiance élevée)

- **Monetization Potential (1-10)**: Potentiel de monétisation
  - 60% taille d'audience
  - 40% engagement

---

### Phase 3: Calcul des Percentiles par Catégorie

**Objectif**: Identifier les "Top X%" dans chaque niche.

**Méthode:**
1. Groupe les podcasts par `ai_primary_category`
2. Calcule un "Power Score" pour chaque podcast:
   ```
   Power Score = (log10(YouTube Subs) × 10) +
                 (log10(Apple Reviews) × 15) +
                 (log10(Episodes) × 5)
   ```
3. Trie par Power Score (décroissant)
4. Assigne percentile:
   - Top 1%: Le meilleur 1% de la catégorie
   - Top 5%: Le meilleur 5%
   - Top 10%: Le meilleur 10%
   - Top 25%: Le meilleur 25%
   - Top 50%: Le meilleur 50%
   - Standard: Les autres

**Exemple:**
- Catégorie: "Tech Leadership & Engineering"
- Total dans catégorie: 150 podcasts
- Podcast X: Rang #8 → **Top 5%** (8/150 = 5.3%)

**Minimum requis:** 10 podcasts dans une catégorie (sinon "Unknown")

---

### Phase 4: Badassery Score (0-100)

**Le score composite pour prioriser l'outreach.**

**Formule:**
```
Badassery Score = (Engagement/10 × 40) +
                  (Audience Size × 0.30) +
                  (Percentile × 0.30)
```

**Pondération:**
- **40% Engagement**: L'audience est-elle active?
- **30% Taille**: L'audience est-elle grande?
- **30% Percentile**: Est-ce un leader dans sa catégorie?

**Mapping Audience Size:**
- Small → 25/100
- Medium → 50/100
- Large → 75/100
- Very Large → 100/100

**Mapping Percentile:**
- Top 1% → 100/100
- Top 5% → 90/100
- Top 10% → 80/100
- Top 25% → 65/100
- Top 50% → 50/100
- Standard → 35/100

**Exemple de calcul:**
```
Podcast: "The Tech Leader Show"
- Engagement: 8.5/10 → 8.5/10 × 40 = 34
- Audience: Large → 75/100 × 30 = 22.5
- Percentile: Top 10% → 80/100 × 30 = 24

Badassery Score = 34 + 22.5 + 24 = 80.5/100
```

---

### Phase 5: Update Firestore

Tous les 16 champs AI sont écrits dans Firestore en une seule fois:

**Champs Gemini (8):**
- `ai_primary_category`
- `ai_secondary_categories`
- `ai_topics`
- `ai_target_audience`
- `ai_podcast_style`
- `ai_business_relevance`
- `ai_guest_friendly`
- `ai_summary`

**Champs Scoring (4):**
- `ai_engagement_level`
- `ai_audience_size`
- `ai_content_quality`
- `ai_monetization_potential`

**Champs Percentile (3):**
- `ai_category_percentile`
- `ai_category_rank`
- `ai_category_total`

**Champs Composite (1):**
- `ai_badassery_score`

---

## Cas d'usage

### 1. Trouver les meilleurs podcasts pour outreach

**Requête Firestore:**
```javascript
const topPodcasts = await db.collection('podcasts')
  .where('ai_badassery_score', '>=', 70)
  .where('ai_guest_friendly', '==', true)
  .where('ai_business_relevance', '>=', 7)
  .orderBy('ai_badassery_score', 'desc')
  .limit(50)
  .get();
```

**Résultat:** Top 50 podcasts avec:
- Score Badassery ≥ 70/100
- Acceptent des invités
- Pertinence business ≥ 7/10

---

### 2. Identifier les leaders d'une niche

**Requête:**
```javascript
const techLeaders = await db.collection('podcasts')
  .where('ai_primary_category', '==', 'Tech Leadership & Engineering')
  .where('ai_category_percentile', 'in', ['Top 1%', 'Top 5%', 'Top 10%'])
  .orderBy('ai_category_rank', 'asc')
  .get();
```

**Résultat:** Les Top 10% des podcasts Tech Leadership, triés par rang

---

### 3. Analyse par taille d'audience

**Requête:**
```javascript
const largeAudience = await db.collection('podcasts')
  .where('ai_audience_size', 'in', ['Large', 'Very Large'])
  .where('ai_engagement_level', '>=', 7)
  .orderBy('ai_engagement_level', 'desc')
  .get();
```

**Résultat:** Podcasts avec grande audience ET engagement élevé (audience active, pas "morte")

---

### 4. Dashboard UI - Top podcasts par catégorie

**Affichage recommandé:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 The Tech Leader Show
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Badassery Score: 80.5/100

🏆 Top 10% in Tech Leadership & Engineering
   Rank #8 out of 150 podcasts

📈 Metrics:
   • Engagement: 8.5/10
   • Audience: Large
   • Quality: 9.2/10
   • Monetization: 8.7/10

💼 Business Relevance: 9/10
✅ Guest-Friendly: Yes

📝 Topics: Leadership, AI & Technology, Business Strategy

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Performance et Limitations

### Vitesse

**Pour 100 podcasts:**
- Phase 1-2 (Gemini + Scoring): ~5-8 minutes
- Phase 3 (Percentiles): < 1 seconde
- Phase 4 (Badassery): < 1 seconde
- Phase 5 (Firestore): ~10-20 secondes

**Total: ~6-10 minutes**

### Limitations

**Percentiles:**
- Minimum 10 podcasts par catégorie requis
- Si < 10, percentile = "Unknown" et fallback sur global

**Gemini:**
- ~10% de taux d'échec (JSON invalide)
- Retry automatique (2 tentatives)

**Firestore:**
- Rate limits: 500 writes/sec (pause de 100ms entre updates)

---

## Configuration

### Modifier les seuils

Éditer `scripts/categorize_and_score_podcasts.js`:

```javascript
// Ligne ~300: Seuils audience size
const THRESHOLDS = {
  yt_subscribers: {
    very_large: 100000,  // Changer ici
    large: 25000,
    medium: 5000
  },
  // ...
};
```

### Modifier la formule Badassery

```javascript
// Ligne ~660: Pondération Badassery Score
const engagementComponent = (engagement / 10) * 40;  // 40%
const sizeComponent = (sizeMap[audienceSize] / 100) * 30;  // 30%
const percentileComponent = (percentileMap[percentileLabel] / 100) * 30;  // 30%
```

---

## Next Steps: Utilisation dans l'UI

### 1. Ajouter les champs au PodcastDocument interface

```typescript
// webapp/badassery/services/podcastService.ts

export interface PodcastDocument {
  // ... champs existants

  // AI Percentile & Ranking
  ai_category_percentile?: 'Top 1%' | 'Top 5%' | 'Top 10%' | 'Top 25%' | 'Top 50%' | 'Standard' | 'Unknown';
  ai_category_rank?: number;
  ai_category_total?: number;

  // Badassery Score
  ai_badassery_score?: number;
}
```

### 2. Créer des fonctions de filtrage avancées

```typescript
export const getTopPodcastsByCategory = async (
  category: string,
  percentiles: string[] = ['Top 1%', 'Top 5%', 'Top 10%'],
  limit: number = 50
) => {
  const snapshot = await db.collection('podcasts')
    .where('ai_primary_category', '==', category)
    .where('ai_category_percentile', 'in', percentiles)
    .orderBy('ai_category_rank', 'asc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => doc.data() as PodcastDocument);
};

export const getBestForOutreach = async (
  minBadasseryScore: number = 70,
  minBusinessRelevance: number = 7,
  guestFriendly: boolean = true
) => {
  const snapshot = await db.collection('podcasts')
    .where('ai_badassery_score', '>=', minBadasseryScore)
    .where('ai_guest_friendly', '==', guestFriendly)
    .where('ai_business_relevance', '>=', minBusinessRelevance)
    .orderBy('ai_badassery_score', 'desc')
    .limit(100)
    .get();

  return snapshot.docs.map(doc => doc.data() as PodcastDocument);
};
```

### 3. Créer une page "Top Podcasts"

**Route:** `/podcasts/top`

**Fonctionnalités:**
- Filtres par catégorie
- Filtres par percentile
- Tri par Badassery Score
- Badges visuels (Top 1%, Top 5%, etc.)
- Export CSV des résultats

---

## Conclusion

Le système complet permet de:

✅ **Catégoriser** 200K+ podcasts en 31 niches
✅ **Scorer** avec 4 métriques objectives
✅ **Ranking** Top X% par catégorie
✅ **Prioriser** avec Badassery Score (0-100)
✅ **Filtrer** pour outreach optimal

**Prochain run:** Augmenter `MAX_PODCASTS_TO_PROCESS` à 1000-10000 pour processing en batch!
