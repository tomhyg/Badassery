# Guide Complet - Parallel Scoring V2.0

## 🚀 Vue d'ensemble

Le script parallèle permet de traiter **120,000 podcasts en 10-20 heures** (vs 11 jours en mode séquentiel).

**Gain de performance : 10-26x plus rapide**

---

## 📋 Prérequis

### 1. Vérifier votre tier Gemini API

```bash
# Vérifier sur https://aistudio.google.com/app/apikey
# Free tier: 15 RPM (requests per minute) → utiliser --config=conservative
# Paid tier: 2000 RPM → utiliser --config=safe ou aggressive
```

### 2. Augmenter la mémoire Node.js (recommandé)

Éditer `LANCER_PARALLEL.bat` et remplacer:
```batch
node scripts/parallel_scoring_v2.js
```

Par:
```batch
node --max-old-space-size=2048 scripts/parallel_scoring_v2.js
```

---

## ⚙️ Configurations Disponibles

| Config | Gemini Parallel | Firestore Parallel | Usage |
|--------|-----------------|-------------------|-------|
| **conservative** | 10 | 50 | Tests initiaux, free tier |
| **safe** ⭐ | 20 | 100 | Recommandé pour débuter |
| **aggressive** | 50 | 200 | Après validation, paid tier |

---

## 🎯 Plan de Déploiement Recommandé

### Étape 1: Validation (1000 podcasts)

```bash
node scripts/parallel_scoring_v2.js --limit=1000
```

**Objectif:** Vérifier que tout fonctionne sans erreurs.

**Vérifier:**
- ✅ Aucun crash mémoire
- ✅ Taux d'erreur Gemini < 10%
- ✅ Temps de traitement acceptable
- ✅ Progress bar fonctionne

**Temps estimé:** ~5-10 minutes

---

### Étape 2: Dry-Run Complet

```bash
node scripts/parallel_scoring_v2.js --dry-run
```

**Objectif:** Simuler le traitement complet **sans écrire dans Firestore**.

**Avantages:**
- Pas de coûts Firestore
- Validation complète du pipeline
- Estimation du temps total réel

**Temps estimé:** ~10-12 heures (SANS les écritures Firestore)

---

### Étape 3: Production par Vagues (30K à la fois)

#### Wave 1: Premiers 30,000 podcasts
```bash
node scripts/parallel_scoring_v2.js --offset=0 --limit=30000
```

**Pause:** Vérifier les résultats dans Firestore

#### Wave 2: Podcasts 30,001-60,000
```bash
node scripts/parallel_scoring_v2.js --offset=30000 --limit=30000
```

#### Wave 3: Podcasts 60,001-90,000
```bash
node scripts/parallel_scoring_v2.js --offset=60000 --limit=30000
```

#### Wave 4: Podcasts 90,001-120,000
```bash
node scripts/parallel_scoring_v2.js --offset=90000 --limit=30000
```

**Temps estimé par wave:** ~3-5 heures

---

## 💡 Fonctionnalités Clés

### 1. Checkpointing Automatique

Le script sauvegarde automatiquement sa progression tous les 1000 podcasts.

**Fichier checkpoint:** `.checkpoint.json`

**En cas de crash:**
```bash
# Relancer le même command - il reprendra où il s'était arrêté
node scripts/parallel_scoring_v2.js --offset=0 --limit=30000
```

Le script détectera le checkpoint et **sautera les podcasts déjà traités**.

---

### 2. Circuit Breaker

Si **10 erreurs consécutives** se produisent, le script s'arrête automatiquement.

**Raisons possibles:**
- Rate limit Gemini atteint
- Problème réseau
- Problème Firestore

**Solution:** Attendre quelques minutes et relancer (le checkpoint reprendra où ça s'est arrêté).

---

### 3. Progress Bar avec ETA

```
⏳ [████████████████████████████░░░░░░░░░░] 72% | 21600/30000 | ETA: 1h 23m | Rate: 5.3/s
```

**Affiche:**
- Pourcentage de complétion
- Nombre traité / total
- Temps estimé restant (ETA)
- Taux de traitement (podcasts/seconde)

---

### 4. Memory Monitoring

Le script affiche un warning si la mémoire dépasse **1.5GB**.

```
⚠️  High memory usage: 1623MB
```

**Solution:** Augmenter `--max-old-space-size=4096` si nécessaire.

---

## 🐛 Troubleshooting

### Erreur: "Too many consecutive errors"

**Cause:** Rate limit Gemini atteint ou problème réseau.

**Solutions:**
1. Attendre 1-2 minutes
2. Relancer le script (reprendra au checkpoint)
3. Utiliser `--config=conservative` pour réduire le parallélisme

---

### Erreur: "JavaScript heap out of memory"

**Cause:** Pas assez de mémoire allouée à Node.js.

**Solution:**
```bash
node --max-old-space-size=4096 scripts/parallel_scoring_v2.js
```

---

### Le script est trop lent

**Causes possibles:**
1. Configuration conservative (10 parallel seulement)
2. Gemini API rate limits
3. Connexion réseau lente

**Solutions:**
1. Passer en mode `--config=safe` (20 parallel)
2. Après validation, passer en `--config=aggressive` (50 parallel)
3. Vérifier votre tier Gemini (free vs paid)

---

### Les résultats ne s'affichent pas dans Firestore

**Vérifications:**
1. Pas en mode `--dry-run`?
2. Les podcasts avaient déjà `aiCategorizationStatus = 'completed'`?
3. Erreurs dans les logs?

**Solution:** Vérifier les logs d'erreurs Firestore.

---

## 💰 Estimation des Coûts

### Gemini API (Paid Tier)

```
Modèle: gemini-2.0-flash-exp
Coût: $0.075 / 1M input tokens

120K podcasts × ~500 tokens/requête = 60M tokens
Coût total: ~$4.50
```

### Firestore Writes

```
Coût: $0.18 / 100K writes

120K podcasts = 120K writes
Coût total: ~$0.22
```

### Total Estimé

```
Gemini: $4.50
Firestore: $0.22
─────────────
TOTAL: ~$4.72 pour 120K podcasts
```

**Note:** Si free tier Gemini (15 RPM), le script prendra beaucoup plus de temps mais sera gratuit (jusqu'à la limite quotidienne).

---

## 📊 Performance Attendue

### Configuration Safe (20 parallel)

| Métrique | Valeur |
|----------|--------|
| Temps total (120K) | 14-20 heures |
| Taux de traitement | 2-3 podcasts/sec |
| Mémoire utilisée | 500-800 MB |
| Taux d'erreur | < 10% |

### Configuration Aggressive (50 parallel)

| Métrique | Valeur |
|----------|--------|
| Temps total (120K) | 10-14 heures |
| Taux de traitement | 3-4 podcasts/sec |
| Mémoire utilisée | 800-1200 MB |
| Taux d'erreur | < 15% (plus de retries) |

---

## 🔍 Monitoring Pendant l'Exécution

### Vérifier les logs en temps réel

```bash
# Le script affiche automatiquement:
⏳ Progress bar avec ETA
✅ Succès de phase
❌ Erreurs détaillées
💾 Checkpoints sauvegardés
⚠️  Warnings (mémoire, erreurs)
```

### Vérifier l'état dans Firestore

Pendant l'exécution, vérifiez quelques podcasts au hasard:

```javascript
// Dans la console Firebase
db.collection('podcasts')
  .where('aiCategorizationStatus', '==', 'completed')
  .orderBy('aiCategorizedAt', 'desc')
  .limit(10)
  .get()
```

**Champs à vérifier:**
- `ai_badassery_score` (0-100)
- `ai_global_percentile` (Top 1%, Top 5%, etc.)
- `ai_primary_category` (une des 31 niches)
- `ai_engagement_level` (1-10)

---

## 🚨 Que Faire Si Ça Crash?

### 1. Ne Paniquez Pas!

Le checkpoint a probablement sauvegardé votre progression.

### 2. Vérifiez le checkpoint

```bash
# Regarder le fichier .checkpoint.json
cat .checkpoint.json
```

Exemple:
```json
{
  "lastProcessedId": "1234567890",
  "processed": 15230,
  "timestamp": 1704123456789
}
```

**Cela signifie:** 15,230 podcasts ont été traités avant le crash.

### 3. Relancez le Même Commande

```bash
# Le script va détecter le checkpoint et reprendre
node scripts/parallel_scoring_v2.js --offset=0 --limit=30000
```

Le script va:
1. Charger le checkpoint
2. Sauter les 15,230 premiers podcasts
3. Reprendre à partir du podcast #15,231

---

## 🎯 Commandes Utiles

### Test Initial (Recommandé)
```bash
node scripts/parallel_scoring_v2.js --limit=1000
```

### Dry-Run Complet
```bash
node scripts/parallel_scoring_v2.js --dry-run
```

### Production - Wave 1
```bash
node scripts/parallel_scoring_v2.js --offset=0 --limit=30000
```

### Production - Tout d'un coup (RISQUÉ)
```bash
node scripts/parallel_scoring_v2.js --config=aggressive
```

### Avec Mémoire Augmentée
```bash
node --max-old-space-size=4096 scripts/parallel_scoring_v2.js --config=aggressive
```

---

## 📈 Étapes Après le Traitement

### 1. Vérifier le Nombre Total

```javascript
db.collection('podcasts')
  .where('aiCategorizationStatus', '==', 'completed')
  .count()
  .get()
```

**Attendu:** ~120,000 podcasts

### 2. Analyser les Top Performers

```javascript
db.collection('podcasts')
  .where('ai_badassery_score', '>=', 80)
  .orderBy('ai_badassery_score', 'desc')
  .limit(100)
  .get()
```

### 3. Distribution des Catégories

```javascript
db.collection('podcasts')
  .where('ai_primary_category', '==', 'Tech Leadership & Engineering')
  .where('ai_global_percentile', 'in', ['Top 1%', 'Top 5%'])
  .get()
```

### 4. Clear le Checkpoint

```bash
# Une fois terminé, supprimer le checkpoint
rm .checkpoint.json
```

---

## 🔄 Comparaison Séquentiel vs Parallèle

| Métrique | Séquentiel | Parallèle (Safe) | Parallèle (Aggressive) |
|----------|------------|------------------|------------------------|
| Gemini Parallel | 1 (batch 10) | 20 | 50 |
| Firestore Parallel | 1 | 100 | 200 |
| Temps (120K) | 11 jours | 14-20 heures | 10-14 heures |
| Taux traitement | 0.1/sec | 2-3/sec | 3-4/sec |
| Checkpointing | ❌ | ✅ | ✅ |
| Progress Bar | ❌ | ✅ | ✅ |
| Circuit Breaker | ❌ | ✅ | ✅ |
| Memory Monitor | ❌ | ✅ | ✅ |

---

## 📚 Fichiers Créés

1. **`scripts/parallel_scoring_v2.js`** - Script principal parallèle
2. **`LANCER_PARALLEL.bat`** - Launcher Windows avec menu interactif
3. **`PARALLEL_SCORING_GUIDE.md`** - Ce guide (documentation complète)
4. **`.checkpoint.json`** - Créé automatiquement pendant l'exécution

---

## 🎓 Conseils Pro

### 1. Commencer Conservateur

Toujours tester avec `--limit=1000` en mode `safe` avant de passer en production.

### 2. Traiter par Vagues

Pour 120K podcasts, traiter par vagues de 30K est **plus sûr** que tout d'un coup.

**Avantages:**
- Monitoring entre vagues
- Ajustement de config si nécessaire
- Moins risqué si crash

### 3. Utiliser Dry-Run

Le dry-run permet de:
- Tester le pipeline complet
- Estimer le temps réel
- Vérifier les taux d'erreur
- **Sans coûts Firestore**

### 4. Augmenter Progressivement

1. Test: `--limit=1000` en mode `safe`
2. Validation: Dry-run complet
3. Wave 1: 30K en mode `safe`
4. Si OK: Passer en mode `aggressive` pour waves 2-4

---

## 📞 Support

En cas de problème:

1. Vérifier les logs d'erreur
2. Consulter la section Troubleshooting
3. Vérifier le checkpoint (`.checkpoint.json`)
4. Relancer avec configuration plus conservative

---

**Version:** 2.0
**Date:** Janvier 2025
**Auteur:** Badassery PR

🚀 **Prêt à traiter 120K podcasts en une journée!**
