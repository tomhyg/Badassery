# Guide: AI Podcast Categorization

## Vue d'ensemble

Le système de catégorisation AI utilise Gemini 1.5 Flash pour analyser chaque podcast et générer des métadonnées enrichies pour faciliter le filtrage et la recherche.

---

## Champs AI Ajoutés (14 nouveaux champs)

### Catégorisation de base

| Champ | Type | Description | Exemple |
|-------|------|-------------|---------|
| `ai_primary_category` | string | Catégorie principale | "Business", "Technology", "Health & Fitness" |
| `ai_secondary_categories` | string[] | 1-3 catégories secondaires | ["Education", "Entrepreneurship"] |
| `ai_topics` | string[] | 3-5 sujets spécifiques | ["AI", "startups", "venture capital"] |
| `ai_target_audience` | string | Description de l'audience cible | "Tech entrepreneurs and startup founders" |
| `ai_podcast_style` | string | Style de contenu | "Interview", "Solo Commentary", "Panel Discussion" |

### Scores et métriques (1-10)

| Champ | Type | Description | Usage |
|-------|------|-------------|-------|
| `ai_business_relevance` | number (1-10) | Pertinence pour B2B marketing | **Filtrer podcasts pertinents pour vos clients** |
| `ai_monetization_potential` | number (1-10) | Potentiel de sponsoring | Identifier podcasts premium |
| `ai_content_quality` | number (1-10) | Qualité de production | Filtrer podcasts professionnels |
| `ai_engagement_level` | number (1-10) | Niveau d'engagement audience | Identifier podcasts actifs |

### Indicateurs binaires

| Champ | Type | Description | Usage |
|-------|------|-------------|-------|
| `ai_guest_friendly` | boolean | Accepte des invités régulièrement | **CRITIQUE: Filtrer podcasts pour outreach** |
| `ai_audience_size` | string | Taille d'audience | "Small", "Medium", "Large", "Very Large" |

### Résumé AI

| Champ | Type | Description |
|-------|------|-------------|
| `ai_summary` | string | Résumé unique du podcast (2-3 phrases) |

### Métadonnées

| Champ | Type | Description |
|-------|------|-------------|
| `aiCategorizationStatus` | string | 'completed', 'failed', 'pending' |
| `aiCategorizedAt` | Timestamp | Date de catégorisation |
| `aiCategorizationError` | string | Message d'erreur si échec |

---

## Comment Lancer la Catégorisation

### Option 1: Via Batch File (Recommandé)

1. **Définir la clé API Gemini**:
   ```bash
   set GEMINI_API_KEY=votre_cle_api_ici
   ```

2. **Double-cliquer sur**: `LANCER_AI_CATEGORIZATION.bat`

### Option 2: Via Node.js

```bash
cd "C:\Users\admin\OneDrive\Bureau\Dossier danielle"
set GEMINI_API_KEY=votre_cle_api_ici
node scripts/categorize_podcasts_with_ai.js
```

### Option 3: Modifier la clé dans le script

Ouvrir `scripts/categorize_podcasts_with_ai.js` et remplacer:
```javascript
const genAI = new GoogleGenerativeAI('YOUR_API_KEY_HERE');
```

---

## Configuration du Script

### Variables importantes

```javascript
const BATCH_SIZE = 10;              // Podcasts par batch
const PAUSE_BETWEEN_BATCHES = 2000; // 2 secondes entre batches
const MAX_PODCASTS_TO_PROCESS = 100; // Limite (pour test)
```

### Pour traiter TOUS les podcasts

Modifier `MAX_PODCASTS_TO_PROCESS` ou enlever la limite dans `main()`:

```javascript
// Avant (limite à 100):
.limit(MAX_PODCASTS_TO_PROCESS);

// Après (tous les podcasts):
// Enlever .limit() ou mettre une grande valeur
.limit(200000);
```

---

## Priorisation

Le script priorise automatiquement:
1. Podcasts non encore catégorisés
2. Podcasts avec plus de reviews (populaires en premier)

Pour re-catégoriser des podcasts déjà traités, commenter cette ligne:
```javascript
// if (podcast.aiCategorizationStatus === 'completed') {
//   results.skipped++;
//   continue;
// }
```

---

## Utilisation dans le Code

### 1. Filtrer les podcasts "guest-friendly"

```typescript
import { getGuestFriendlyPodcasts } from './services/podcastService';

// Podcasts qui acceptent des invités avec business relevance ≥ 7
const podcasts = await getGuestFriendlyPodcasts(7, 50);

console.log(podcasts.map(p => ({
  title: p.title,
  businessRelevance: p.ai_business_relevance,
  guestFriendly: p.ai_guest_friendly,
  quality: p.ai_content_quality
})));
```

### 2. Rechercher par catégorie

```typescript
import { getPodcastsByCategory } from './services/podcastService';

// Tous les podcasts Business
const businessPodcasts = await getPodcastsByCategory('Business', 100);
```

### 3. Rechercher par topic

```typescript
import { getPodcastsByTopic } from './services/podcastService';

// Podcasts qui parlent d'IA
const aiPodcasts = await getPodcastsByTopic('AI', 50);
```

### 4. Meilleurs podcasts pour outreach

```typescript
import { getBestPodcastsForOutreach } from './services/podcastService';

// Top 50 podcasts pour faire de l'outreach
// Critères: guest-friendly + email disponible + qualité ≥ 5 + business relevance ≥ 5
const bestPodcasts = await getBestPodcastsForOutreach(50);

bestPodcasts.forEach(p => {
  console.log(`${p.title} - Business: ${p.ai_business_relevance}/10, Quality: ${p.ai_content_quality}/10`);
});
```

### 5. Stats avec catégorisation

```typescript
import { getPodcastStats } from './services/podcastService';

const stats = await getPodcastStats();

console.log(`
Total podcasts: ${stats.total}
Avec email: ${stats.withEmail}
Avec YouTube: ${stats.withYouTube}
Note ≥ 4.0: ${stats.highRated}
Catégorisés AI: ${stats.categorized}
Guest-friendly: ${stats.guestFriendly}
Business relevance ≥ 7: ${stats.highBusinessRelevance}
`);
```

---

## Exemple: Page de Filtrage Avancé

```typescript
import { useState } from 'react';
import {
  getPodcastsByCategory,
  getGuestFriendlyPodcasts,
  getPodcastsByTopic,
  getBestPodcastsForOutreach
} from './services/podcastService';

function AdvancedPodcastSearch() {
  const [podcasts, setPodcasts] = useState([]);

  const searchByCategory = async (category: string) => {
    const results = await getPodcastsByCategory(category);
    setPodcasts(results);
  };

  const searchGuestFriendly = async () => {
    const results = await getGuestFriendlyPodcasts(7, 100);
    setPodcasts(results);
  };

  const searchBestForOutreach = async () => {
    const results = await getBestPodcastsForOutreach(50);
    setPodcasts(results);
  };

  return (
    <div>
      <h2>Advanced Podcast Search</h2>

      <div>
        <button onClick={() => searchByCategory('Business')}>Business</button>
        <button onClick={() => searchByCategory('Technology')}>Tech</button>
        <button onClick={searchGuestFriendly}>Guest-Friendly (B2B)</button>
        <button onClick={searchBestForOutreach}>Best for Outreach</button>
      </div>

      <div>
        {podcasts.map(p => (
          <div key={p.itunesId}>
            <h3>{p.title}</h3>
            <div>Category: {p.ai_primary_category}</div>
            <div>Topics: {p.ai_topics?.join(', ')}</div>
            <div>Business Relevance: {p.ai_business_relevance}/10</div>
            <div>Quality: {p.ai_content_quality}/10</div>
            <div>Guest-Friendly: {p.ai_guest_friendly ? 'Yes' : 'No'}</div>
            <div>Summary: {p.ai_summary}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Catégories Disponibles

Le système utilise ces catégories principales:

1. **Business** - Entrepreneuriat, management, leadership
2. **Technology** - Tech, software, innovation
3. **Health & Fitness** - Santé, bien-être, fitness
4. **Education** - Apprentissage, développement personnel
5. **Society & Culture** - Social, culture, société
6. **Comedy** - Humour, divertissement
7. **News & Politics** - Actualités, politique
8. **Arts** - Art, design, créativité
9. **Science** - Sciences, recherche
10. **Sports** - Sport, athlétisme
11. **True Crime** - Crimes, enquêtes
12. **Lifestyle** - Style de vie
13. **Entertainment** - Divertissement général
14. **Other** - Autres catégories

---

## Styles de Podcast Détectés

- **Interview** - Conversations avec invités
- **Solo Commentary** - Monologues, opinions
- **Panel Discussion** - Discussions à plusieurs
- **Storytelling** - Narration, histoires
- **Educational** - Cours, tutoriels
- **News & Analysis** - Actualités et analyses
- **Comedy** - Humour
- **Documentary** - Documentaires
- **Conversational** - Discussions casual
- **Other** - Autres styles

---

## Performance et Coûts

### Gemini 1.5 Flash

- **Vitesse**: ~2-3 secondes par podcast
- **Coût**: Très faible (Flash est optimisé pour coût/performance)
- **Qualité**: Excellente pour catégorisation

### Estimation

Pour 200,000 podcasts:
- **Durée**: ~5-6 jours en continu (avec pauses API)
- **Recommandation**: Traiter par batches de 1,000-10,000

### Optimisation

Pour accélérer:
1. Augmenter `BATCH_SIZE` (mais attention rate limits)
2. Réduire `PAUSE_BETWEEN_BATCHES` (si pas de rate limit errors)
3. Utiliser plusieurs clés API en parallèle (scripts multiples)

---

## Cas d'Usage Principaux

### 1. Matching Client-Podcast Intelligent

```typescript
// Trouver les meilleurs podcasts pour un client tech B2B
const podcasts = await getGuestFriendlyPodcasts(8, 100);
const filtered = podcasts.filter(p =>
  p.ai_topics?.some(topic =>
    ['AI', 'SaaS', 'B2B', 'enterprise'].includes(topic)
  )
);
```

### 2. Dashboard Analytics

```typescript
const stats = await getPodcastStats();

// Afficher:
// - % de podcasts catégorisés
// - Top catégories
// - Distribution business relevance
// - Podcasts guest-friendly disponibles
```

### 3. Filtrage Avancé UI

Permettre aux users de filtrer par:
- Catégorie primaire
- Topics multiples
- Business relevance min/max
- Guest-friendly only
- Taille d'audience
- Qualité minimale

---

## Troubleshooting

### Erreur: "GEMINI_API_KEY not defined"

**Solution**: Définir la variable d'environnement ou éditer le script

### Erreur: "Rate limit exceeded"

**Solution**: Augmenter `PAUSE_BETWEEN_BATCHES` à 3000-5000ms

### Erreur: "Invalid JSON response"

**Solution**: Le modèle a retourné du texte non-JSON. Le script gère déjà les markdown code blocks, mais si ça persiste, vérifier la réponse.

### Certains podcasts sautés

**Normal**: Les podcasts sans description/titre sont automatiquement sautés (pas assez de données)

---

## Next Steps

Une fois la catégorisation lancée:

1. **Surveiller le progress** - Voir combien de podcasts sont catégorisés
2. **Tester les filtres** - Essayer les nouvelles fonctions de recherche
3. **Intégrer dans l'UI** - Ajouter filtres avancés dans la page Podcasts
4. **Créer des vues personnalisées**:
   - "Best for SaaS Outreach"
   - "High-Quality Business Podcasts"
   - "Tech Podcasts with 100K+ audience"

---

## Résumé Complet

**Total de champs par podcast**: **137 enriched + 14 AI = 151 champs**

Vous avez maintenant:
- ✅ 200K podcasts avec données complètes (YouTube, emails, ratings, épisodes, social)
- ✅ Catégorisation AI intelligente
- ✅ Filtrage avancé par business relevance
- ✅ Détection automatique guest-friendly
- ✅ Scoring qualité/engagement
- ✅ Services TypeScript prêts à l'emploi

**C'est LA TOTALE + AI!** 🚀🤖
