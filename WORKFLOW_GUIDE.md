# 🔄 Workflow Guide - Traitement de 120K Podcasts

## 🎯 Objectif

Traiter 120,000 podcasts en **14-20 heures** avec le script parallèle.

---

## 📋 Workflow Complet

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ÉTAPE 0: VALIDATION (5-10 minutes)                            │
│  ─────────────────────────────────────────────────────────     │
│                                                                 │
│  > Double-cliquer: VALIDATE_SETUP.bat                          │
│                                                                 │
│  Vérifie:                                                       │
│    ✅ Node.js >= 14.x                                          │
│    ✅ Dependencies installées                                  │
│    ✅ Firebase connecté                                        │
│    ✅ Gemini API fonctionne                                    │
│    ✅ Podcasts disponibles                                     │
│                                                                 │
│  Si ❌ → Fixer les erreurs                                     │
│  Si ✅ → Continuer à l'Étape 1                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ÉTAPE 1: TEST (5-10 minutes)                                  │
│  ───────────────────────────────────────────────────────────   │
│                                                                 │
│  > Double-cliquer: LANCER_PARALLEL.bat                         │
│  > Choisir: Option 1 (TEST 1000 podcasts)                      │
│                                                                 │
│  OU en ligne de commande:                                       │
│  > node scripts/parallel_scoring_v2.js --limit=1000            │
│                                                                 │
│  Attendu:                                                       │
│    ⏳ Progress bar affichée                                    │
│    ✅ ~1000 podcasts traités                                   │
│    ✅ Temps: 5-10 minutes                                      │
│    ✅ Taux d'erreur < 15%                                      │
│                                                                 │
│  Vérifier dans Firestore:                                       │
│    • ai_badassery_score présent (0-100)                        │
│    • ai_global_percentile (Top X%)                             │
│    • ai_primary_category (une des 31 niches)                   │
│                                                                 │
│  Si OK → Continuer à l'Étape 2                                 │
│  Si Erreurs → Debugger (voir PARALLEL_SCORING_GUIDE.md)        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ÉTAPE 2: DRY-RUN (10-12 heures)                               │
│  ───────────────────────────────────────────────────────────   │
│                                                                 │
│  > Double-cliquer: LANCER_PARALLEL.bat                         │
│  > Choisir: Option 2 (DRY-RUN complet)                         │
│                                                                 │
│  OU en ligne de commande:                                       │
│  > node scripts/parallel_scoring_v2.js --dry-run               │
│                                                                 │
│  Objectif:                                                      │
│    • Simuler le traitement COMPLET                             │
│    • SANS écriture dans Firestore                              │
│    • Estimer le temps réel                                     │
│    • Vérifier les taux d'erreur                                │
│                                                                 │
│  Attendu:                                                       │
│    ⏳ Progress bar avec ETA                                    │
│    ✅ 100K-120K podcasts simulés                               │
│    ✅ Temps: 10-12 heures                                      │
│    💾 Checkpoints sauvegardés tous les 1000                    │
│                                                                 │
│  Avantage:                                                      │
│    • Pas de coûts Firestore ($0.22 économisés)                │
│    • Validation complète du pipeline                            │
│    • Peut être interrompu et repris                             │
│                                                                 │
│  Si OK → Continuer à l'Étape 3 (Production)                    │
│  Si Trop lent → Passer en --config=aggressive                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ÉTAPE 3A: PRODUCTION WAVE 1 (3-5 heures)                      │
│  ───────────────────────────────────────────────────────────   │
│                                                                 │
│  > Double-cliquer: LANCER_PARALLEL.bat                         │
│  > Choisir: Option 3 (WAVE 1: 0-30K)                           │
│                                                                 │
│  OU en ligne de commande:                                       │
│  > node scripts/parallel_scoring_v2.js --offset=0 --limit=30000│
│                                                                 │
│  Traitement:                                                    │
│    📊 Podcasts 1-30,000                                        │
│    💾 Écriture dans Firestore ACTIVÉE                          │
│    ⏳ Progress bar avec ETA                                    │
│    💾 Checkpoints tous les 1000                                │
│                                                                 │
│  Attendu:                                                       │
│    ✅ ~30,000 podcasts traités                                 │
│    ✅ Temps: 3-5 heures                                        │
│    ✅ Rate: 2-3 podcasts/sec                                   │
│                                                                 │
│  Après completion:                                              │
│    1. Vérifier résultats dans Firestore                        │
│    2. Check qualité des scores                                  │
│    3. Vérifier coûts ($1.20 environ)                            │
│                                                                 │
│  Si OK → Continuer à WAVE 2                                    │
│  Si Problèmes → Fixer avant de continuer                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ÉTAPE 3B: PRODUCTION WAVE 2 (3-5 heures)                      │
│  ───────────────────────────────────────────────────────────   │
│                                                                 │
│  > Double-cliquer: LANCER_PARALLEL.bat                         │
│  > Choisir: Option 4 (WAVE 2: 30K-60K)                         │
│                                                                 │
│  OU:                                                            │
│  > node scripts/parallel_scoring_v2.js --offset=30000 --limit=30000│
│                                                                 │
│  📊 Podcasts 30,001-60,000                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ÉTAPE 3C: PRODUCTION WAVE 3 (3-5 heures)                      │
│  ───────────────────────────────────────────────────────────   │
│                                                                 │
│  > Double-cliquer: LANCER_PARALLEL.bat                         │
│  > Choisir: Option 5 (WAVE 3: 60K-90K)                         │
│                                                                 │
│  OU:                                                            │
│  > node scripts/parallel_scoring_v2.js --offset=60000 --limit=30000│
│                                                                 │
│  📊 Podcasts 60,001-90,000                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ÉTAPE 3D: PRODUCTION WAVE 4 (3-5 heures)                      │
│  ───────────────────────────────────────────────────────────   │
│                                                                 │
│  > Double-cliquer: LANCER_PARALLEL.bat                         │
│  > Choisir: Option 6 (WAVE 4: 90K-120K)                        │
│                                                                 │
│  OU:                                                            │
│  > node scripts/parallel_scoring_v2.js --offset=90000 --limit=30000│
│                                                                 │
│  📊 Podcasts 90,001-120,000                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ÉTAPE 4: VÉRIFICATION FINALE (10 minutes)                     │
│  ───────────────────────────────────────────────────────────   │
│                                                                 │
│  1. Compter les podcasts complétés:                             │
│     Firestore Console → podcasts collection                     │
│     Filtre: aiCategorizationStatus == 'completed'               │
│     Attendu: ~120,000                                           │
│                                                                 │
│  2. Vérifier Top 10:                                            │
│     Filtre: ai_badassery_score >= 80                            │
│     Tri: ai_badassery_score DESC                                │
│     Attendu: Au moins quelques podcasts > 80                    │
│                                                                 │
│  3. Analyser distribution:                                      │
│     • Combien par percentile (Top 1%, Top 5%, etc.)?            │
│     • Distribution des catégories                               │
│     • Scores moyens par niche                                   │
│                                                                 │
│  4. Clear checkpoint:                                           │
│     Supprimer le fichier .checkpoint.json                       │
│                                                                 │
│  5. Vérifier coûts:                                             │
│     Google Cloud Console → Billing                              │
│     Attendu: ~$4.72                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ✅ TERMINÉ!                                                    │
│                                                                 │
│  Résultat:                                                      │
│    • 120,000 podcasts scorés et catégorisés                    │
│    • Chaque podcast a 20 champs AI                              │
│    • Temps total: 14-20 heures                                  │
│    • Coût total: ~$4.72                                         │
│                                                                 │
│  Next Steps:                                                    │
│    1. Créer des dashboards dans l'UI                            │
│    2. Filtrer pour outreach (Badassery >= 70)                   │
│    3. Analyser les leaders par niche                            │
│    4. Identifier opportunités (high engagement, medium audience) │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚨 Gestion des Interruptions

### Si le script crash pendant une wave:

```
1. NE PANIQUEZ PAS!
   Le checkpoint a sauvegardé votre progression.

2. Vérifiez le checkpoint:
   > cat .checkpoint.json

   Exemple:
   {
     "lastProcessedId": "1234567890",
     "processed": 15230,
     "timestamp": 1704123456789
   }

3. Relancez la MÊME commande:
   > node scripts/parallel_scoring_v2.js --offset=0 --limit=30000

   Le script va:
   - Détecter le checkpoint
   - Sauter les 15,230 premiers podcasts
   - Reprendre à #15,231

4. Le script reprendra automatiquement!
```

---

## ⏱️ Timeline Estimé

### Scénario Conservateur (Safe Mode - 20 parallel)

```
Jour 1 - VALIDATION & TEST (Matin):
  ├─ Validation setup:     10 min
  ├─ Test 1000 podcasts:   10 min
  ├─ Analyse résultats:    10 min
  └─ Total:                30 min

Jour 1 - DRY-RUN (Après-midi + Nuit):
  ├─ Lancement dry-run:    18:00
  ├─ Exécution:            10-12h
  └─ Fin:                  ~06:00 (Jour 2)

Jour 2 - PRODUCTION WAVES 1-2:
  ├─ Wave 1 (0-30K):       3-5h  (06:00-11:00)
  ├─ Vérification:         30 min (11:00-11:30)
  ├─ Wave 2 (30K-60K):     3-5h  (11:30-16:30)
  └─ Vérification:         30 min (16:30-17:00)

Jour 3 - PRODUCTION WAVES 3-4:
  ├─ Wave 3 (60K-90K):     3-5h  (08:00-13:00)
  ├─ Vérification:         30 min (13:00-13:30)
  ├─ Wave 4 (90K-120K):    3-5h  (13:30-18:30)
  └─ Vérification finale:  30 min (18:30-19:00)

TOTAL: 2.5-3 jours (dont ~18h de processing réel)
```

### Scénario Agressif (Aggressive Mode - 50 parallel)

```
Jour 1 - VALIDATION & TEST:
  ├─ Validation + Test:    30 min
  ├─ Dry-run (aggressive): 6-8h
  └─ Total:                6.5-8.5h

Jour 2 - PRODUCTION (4 waves):
  ├─ Wave 1:               2-3h
  ├─ Wave 2:               2-3h
  ├─ Wave 3:               2-3h
  ├─ Wave 4:               2-3h
  └─ Total:                8-12h

TOTAL: 1.5-2 jours (dont ~14h de processing réel)
```

---

## 📊 Monitoring en Temps Réel

### Pendant l'exécution:

```bash
# Terminal affiche automatiquement:
⏳ [████████████░░░░] 72% | 21600/30000 | ETA: 1h 23m | Rate: 5.3/s

# Toutes les 1000 podcasts:
✅ Checkpoint saved: 21000 podcasts processed

# Si mémoire élevée:
⚠️  High memory usage: 1623MB

# Fin de phase:
✅ Phase 1 complete: 29847/30000 successful
```

### Dans un autre terminal (optionnel):

```bash
# Surveiller le checkpoint:
watch -n 10 cat .checkpoint.json

# Surveiller les logs:
tail -f nohup.out  # Si lancé avec nohup

# Surveiller la mémoire:
watch -n 5 'ps aux | grep node'
```

---

## 💡 Tips & Tricks

### Tip 1: Lancer en arrière-plan (Linux/Mac)
```bash
nohup node scripts/parallel_scoring_v2.js --offset=0 --limit=30000 > wave1.log 2>&1 &

# Surveiller:
tail -f wave1.log
```

### Tip 2: Augmenter la mémoire si nécessaire
```bash
node --max-old-space-size=4096 scripts/parallel_scoring_v2.js --config=aggressive
```

### Tip 3: Tester différentes configs
```bash
# Commencer conservative:
node scripts/parallel_scoring_v2.js --config=conservative --limit=1000

# Si OK, passer à safe:
node scripts/parallel_scoring_v2.js --config=safe --limit=1000

# Si encore OK, passer à aggressive:
node scripts/parallel_scoring_v2.js --config=aggressive --limit=1000
```

### Tip 4: Reprendre après crash
```bash
# Le script détecte automatiquement le checkpoint
# Relancer la MÊME commande:
node scripts/parallel_scoring_v2.js --offset=0 --limit=30000

# Pour forcer un restart (sans checkpoint):
rm .checkpoint.json
node scripts/parallel_scoring_v2.js --offset=0 --limit=30000
```

---

## 📞 Support Rapide

### Problème: Script trop lent
**Solution:** Passer en mode aggressive
```bash
node scripts/parallel_scoring_v2.js --config=aggressive
```

### Problème: Trop d'erreurs consécutives
**Solution:** Attendre 2 min, relancer
```bash
# Attend que le rate limit se réinitialise
sleep 120
node scripts/parallel_scoring_v2.js --offset=0 --limit=30000
```

### Problème: Out of memory
**Solution:** Augmenter heap size
```bash
node --max-old-space-size=4096 scripts/parallel_scoring_v2.js
```

### Problème: Checkpoint bloqué
**Solution:** Supprimer et recommencer
```bash
rm .checkpoint.json
node scripts/parallel_scoring_v2.js --offset=0 --limit=30000
```

---

## ✅ Checklist Finale

Avant de commencer, assurez-vous:

- [ ] Validation setup complétée (`VALIDATE_SETUP.bat`)
- [ ] Test 1000 podcasts réussi
- [ ] Dry-run complété (optionnel mais recommandé)
- [ ] Gemini API paid tier activé (si > 15 RPM nécessaire)
- [ ] Assez de temps pour surveiller (3-5h par wave)
- [ ] Budget confirmé (~$4.72 pour 120K)

---

**Prêt? GO! 🚀**

Double-cliquez sur: `LANCER_PARALLEL.bat`

---

**Version:** 2.0
**Date:** Janvier 2025
**Auteur:** Badassery PR
