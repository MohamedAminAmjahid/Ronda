# CLAUDE.md — Projet Ronda

## Objectif
Jeu de cartes **Ronda marocaine** jouable sur **web + iOS + Android** avec un seul code.
**Version 1 = joueur contre IA, 100 % local (aucun serveur).** Le multijoueur en ligne
viendra plus tard ; l'architecture doit le permettre sans tout réécrire.

## Stack
- **Expo + React Native + TypeScript** (cible web + mobile, code unique).
- **Vitest** pour les tests du moteur de jeu.
- Gestion d'état UI : React state (ou Zustand si besoin).
- Aucune dépendance backend en v1.

## Architecture — règle d'or : SÉPARER le moteur
Le moteur de règles ne doit JAMAIS dépendre de l'UI ni du réseau. C'est du TypeScript pur,
réutilisable côté serveur plus tard.

```
src/
  engine/      # Règles pures : types, deck, distribution, capture, escalier, scoring
  ai/          # Bot heuristique : prend un état + main, renvoie le coup à jouer
  ui/          # Écrans, composants cartes, animations (Expo / React Native)
  game/        # Orchestration : enchaîne les tours (humain et/ou IA)
tests/         # Tests Vitest du moteur
RONDA-RULES.md # Source de vérité des règles — LIRE AVANT DE CODER LE MOTEUR
```

- Le moteur expose des **fonctions pures** : `(état, action) => nouvelÉtat`.
- Le bot IA implémente la **même interface qu'un joueur humain** : il reçoit l'état visible
  et renvoie un coup. Ainsi « vs IA » = une partie où un joueur est piloté par le bot, et le
  même code servira au multijoueur.

## Règles du jeu
**Les règles exactes sont dans `RONDA-RULES.md`.** Ne pas coder le moteur sans l'avoir lu.
Les valeurs marquées **[À CONFIRMER]** doivent être validées par l'utilisateur avant
implémentation — ne pas inventer de valeurs.

## Ordre de construction (ne pas sauter d'étape)
1. **Moteur** (`src/engine`) : types, deck, distribution, logique de capture + escalier,
   caída, balayage, détection ronda/tringa, décompte final. **Écrire les tests Vitest en
   parallèle** (voir la liste dans RONDA-RULES.md). Ne pas avancer tant qu'ils ne passent pas.
2. **IA** (`src/ai`) : bot heuristique (capturer quand avantageux, viser les cartes hautes
   et celles qui comptent, protéger ses combinaisons). Jouable contre le moteur sans UI.
3. **UI** (`src/ui`) : écran de jeu, affichage des cartes, interactions tactiles.
4. **Polish** : animations, sons, écran de score, menu.

## L'IA (v1)
- **Pas de machine learning.** Heuristique à base de règles.
- Possibilité d'ajouter plus tard une recherche Monte-Carlo (simuler les distributions
  possibles des cartes cachées) pour une IA plus forte.

## Conventions
- TypeScript strict. Pas de `any` non justifié.
- Le moteur reste pur (pas d'effets de bord, pas d'aléatoire non injecté : passer le
  générateur aléatoire en paramètre pour des tests déterministes).
- Commits petits et fréquents. Tests verts avant de passer à l'étape suivante.

## Préparé pour le futur (multijoueur — NE PAS coder maintenant)
- Backend prévu : **Node.js + Colyseus** (serveur autoritaire, rooms WebSocket).
- Le moteur `src/engine` sera importé tel quel côté serveur pour valider les coups.
- Garder donc `engine` sans aucun import d'UI ou de React.
