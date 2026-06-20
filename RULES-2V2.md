# Règles de la Ronda marocaine — Mode 2 contre 2

> Complète `RONDA-RULES.md` (le 1v1). Tout ce qui n'est pas redéfini ici reste **identique**
> au 1v1 (capture, escalier 7→10, valeurs des combos, Mab9ach, décompte, victoire à 41).
> Toutes les règles ci-dessous sont **CONFIRMÉES**.

---

## 1. Joueurs et équipes — CONFIRMÉ
- **4 joueurs**, **2 équipes de 2**.
- **Équipe A** = joueurs **0 & 2** / **Équipe B** = joueurs **1 & 3**.
- Les coéquipiers sont **alternés** (pas face à face) : 0-1-2-3 dans le sens des aiguilles.
- Mode visé : **Toi (0)** + **Ami IA (2)** contre **Adversaire IA 1 (1)** + **Adversaire IA 2 (3)**.

## 2. Ordre du tour — CONFIRMÉ
- Rotation **dans le sens des aiguilles** : 0 → 1 → 2 → 3 → 0…
- Le **donneur joue en dernier** ; le joueur suivant le donneur joue en premier.
- Le donneur **tourne entre les 4 joueurs** à chaque donne (0→1→2→3→0…).

## 3. Distribution — CONFIRMÉ
- **3 cartes** à chacun des 4 joueurs (12) + **4 cartes** sur la table.
- Pioche restante : 28 → **2 redistributions** de 3×4 (12 chacune).
- **3 manches** par donne ; la dernière = **Mab9ach**.
- Règle de table valide : pas de doublon de valeur, pas de suite de 3+ consécutives.
- Si invalide → remettre les 40 cartes, remélanger, redistribuer.

## 4. Cartes capturées — CONFIRMÉ
- Les cartes capturées vont dans une **pile commune par équipe**.
- Équipe A (joueurs 0+2) partage une pile ; Équipe B (joueurs 1+3) partage une pile.

## 5. Chaîne de caídas — CONFIRMÉ
- La chaîne **continue dans le sens du jeu**, peu importe l'équipe.
- Exemple : joueur 1 fait Ara Wahd (+1), joueur 2 pose la même valeur → Ara Khamssa (+5),
  joueur 3 pose la même valeur → Ara 7dach (+11).
- Les points vont à **l'équipe du joueur qui fait la caída**.
- Maximum 3 niveaux (4 cartes par valeur → 4ème caída impossible).

## 6. Missa — CONFIRMÉ
- Vider la table → **+1 point à l'équipe** du joueur qui vide.

## 7. Ronda et Tringa — CONFIRMÉ

### 7.1 Conflits entre équipes adverses
- La **combinaison la plus haute gagne et rafle les deux points** (comme le 1v1).
- Hiérarchie : tringa > toute ronda ; entre rondas, la valeur la plus haute gagne.

### 7.2 Combinaisons dans la même équipe
- Si les **deux coéquipiers** déclarent chacun une combinaison : **chaque joueur marque
  séparément** (pas de conflit interne).
- Exemple : coéquipier ronda de 7 (+1) + toi ronda de 3 (+1) → équipe A marque +2.

## 8. Mab9ach — CONFIRMÉ
- Bonus/malus ±5 → crédité à **l'équipe du donneur**.
- Les cartes restantes → à l'équipe du **dernier joueur ayant capturé**.

## 9. Décompte et fin de partie — CONFIRMÉ
- L'**équipe** ayant capturé **plus de 20 cartes** marque +1 pt par carte au-dessus de 20.
- **Victoire à 41 points** par équipe, scores cumulés.

## 10. Architecture technique — DÉCIDÉ
- **Moteur 2v2 séparé** dans `src/engine2v2/` — ne touche pas au moteur 1v1.
- Réutilise : `capture.ts`, `combinations.ts`, `deck.ts`, `scoring.ts`.
- Nouveaux fichiers : `types2v2.ts`, `deal2v2.ts`, `game2v2.ts`.
- `PlayerId` → `0|1|2|3`, `TeamId` → `0|1`.
- `GameState2v2` avec `teams: [TeamState, TeamState]` (pile commune par équipe).
- Tests Vitest dans `tests/engine2v2.test.ts`.

## 11. IA coéquipière
- Le bot ami (joueur 2) joue dans l'intérêt de l'équipe.
- Détails dans `AI-STRATEGY-2V2.md` après validation du moteur.

## 12. Règles finales confirmées en session

### 12.1 Chaîne de caídas — CONFIRMÉ
- La chaîne **traverse les équipes** dans le sens du jeu (0→1→2→3).
- Peu importe si le joueur suivant est ami ou adversaire — si il pose la même valeur
  que la dernière carte posée, la chaîne continue.
- Logique : le joueur 3 a intérêt à faire Ara 7dach même si ça profite à son équipe,
  car sinon l'adversaire (joueur 2) aurait gardé ses 5 points d'Ara Khamssa.

### 12.2 Résolution des combinaisons — CONFIRMÉ
- **La combinaison la plus haute parmi les 4 joueurs rafle TOUS les points** déclarés,
  y compris ceux des coéquipiers.
- Exemple : Toi (Tringa +5) + Ami (Ronda +1) + Adversaire (Ronda +1) →
  **Ton équipe gagne 7 points** (5+1+1), adversaire 0.
- La Tringa bat toujours toute Ronda. Entre Rondas, la valeur la plus haute gagne.
- Le gagnant rafle les points de TOUS les autres joueurs ayant déclaré.

### 12.3 Contre-ronda — CONFIRMÉ
- Même règle qu'en 1v1 : attraper un **adversaire** qui dissimule une ronda.
- Un joueur peut contester n'importe quel adversaire (joueur 1 ou joueur 3).
- Gains/pertes crédités à l'équipe du contesteur.
