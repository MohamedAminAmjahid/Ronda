# Règles de la Ronda marocaine — Spécification du moteur de jeu

> Source de vérité des règles. Presque tout est **confirmé**. Les rares **[À CONFIRMER]**
> restants sont des cas limites mineurs ; des valeurs par défaut raisonnables sont proposées.

---

## 1. Le jeu de cartes
- Jeu espagnol de **40 cartes**, sans les 8 et 9.
- Valeurs par couleur : **1, 2, 3, 4, 5, 6, 7, 10 (Sota), 11 (Caballo), 12 (Rey)**.
- 4 couleurs : oros, copas, espadas, bastos.
- Carte : `{ valeur: number, couleur: 'oros'|'copas'|'espadas'|'bastos' }`.

## 2. Mise en place (1 contre 1 : joueur vs IA)
- Mélanger les 40 cartes. Distribuer **3 cartes** à chaque joueur. Poser **4 cartes** sur la table.
- Le reste = la **pioche**.
- **Ordre de jeu** : l'**adversaire (non-donneur) joue en premier**, le **donneur joue en
  dernier** (cohérent avec la règle Mab9ach). *(dérivé — corriger si faux)*
- Pas de règle spéciale pour les 4 cartes initiales de la table. *(assumé)*

## 3. Déroulement d'un tour
Le joueur **pose une carte** de sa main. Même valeur qu'une carte de la table → **capture**.

### 3.1 Capture en escalier — CONFIRMÉ
Après capture d'une valeur N, si N+1 est sur la table, on la capture aussi, puis N+2, etc.
Suite : **1-2-3-4-5-6-7-10-11-12** (le **7 → 10 est consécutif**).

### 3.2 Caída — « Ara Wahd » — CONFIRMÉ
Capturer directement la dernière carte posée par l'adversaire → **+1 point**.
L'escalier s'applique aussi après une caída. *(assumé)*

### 3.3 Balayage — « Missa » — CONFIRMÉ
Capture qui vide entièrement la table → **+1 point**.
Caída + Missa peuvent se cumuler sur le même coup. *(assumé)*

## 4. Ronda et Tringa — CONFIRMÉ
- **Ronda** : 2 cartes de même valeur en main → **1 point** (base).
- **Tringa** : 3 cartes de même valeur en main → **5 points** (base).

### 4.1 Moment de la déclaration — CONFIRMÉ
- Déclaration **retardable** : possible tant que le joueur détient encore **toutes** les
  cartes de la combinaison en main.
- Dès qu'il **joue une carte** de la combinaison **sans l'avoir déclarée** → droit **perdu**.

### 4.2 Conflit de combinaisons — CONFIRMÉ
Quand les deux joueurs déclarent, la **combinaison la plus forte gagne et prend aussi le
point de l'autre** (le perdant marque 0) :
- Hiérarchie : **tringa > toute ronda** ; entre deux rondas, la **valeur de carte la plus
  haute** gagne (ronda de 10 > ronda de 1).
- Deux rondas → le gagnant marque **2 points** (1 + 1).
- Tringa contre ronda → la tringa marque **6 points** (5 + 1).

### 4.3 Contre-ronda (contestation) — PROPOSITION
On peut **contester** une déclaration adverse avant qu'il ne joue :
- S'il bluffait → il marque 0 et le contesteur **gagne** les points contestés.
- S'il l'avait vraiment → le contesteur **perd 1 point** (risque du contre).
- S'applique aussi à la tringa (contre-tringa), même mécanique. *(assumé)*

## 5. Fin de manche, distributions, fin de partie
- Mains de 3 cartes jouées → **redistribuer 3 cartes** à chacun (table **jamais
  réalimentée**) tant que la pioche le permet.
- 40 cartes : donne initiale (3+3+4) puis distributions de 6 ; la dernière manche
  s'appelle **« Mab9ach »** (titre affiché au centre).

### 5.1 Dernière manche — « Mab9ach » — CONFIRMÉ
- La **prise de la toute dernière carte** par le **donneur** (qui joue la dernière carte) :
  - avec un **12 (Rey)** → **+5 points**
  - avec un **1 (As)** → **−5 points**
  - **aucune** prise → **−5 points**
- En dernière manche, le **dernier à capturer** ramasse les cartes restantes de la table.

### 5.2 Décompte des cartes — CONFIRMÉ
- Le joueur ayant capturé **plus de 20 cartes** marque **+1 point par carte au-dessus de 20**
  (ex. 23 → +3). Ce décompte **s'ajoute** à tous les autres points (Mab9ach, ronda, etc.).

### 5.3 Score cible — CONFIRMÉ
- La partie se gagne à **41 points**.

## 6. Cas limites à coder et tester
- Plusieurs cartes de même valeur sur la table → on en capture **une seule**. *(assumé)*
- Escalier qui s'arrête dès qu'un maillon manque.
- Pioche insuffisante pour une dernière donne complète.
- Cumuls de bonus (caída + missa).
- Égalité 20-20 au décompte → personne ne marque le décompte. *(assumé)*
- Bluff de déclaration + contre-ronda.

## 7. Tests prioritaires (Vitest)
1. Capture simple. 2. Escalier dont **7 → 10**. 3. Caída → +1. 4. Missa → +1.
5. Ronda (2) = 1 pt, Tringa (3) = 5 pts. 6. Déclaration retardée + perte du droit.
7. Conflit : 2 rondas → 2 pts au plus haut ; tringa vs ronda → 6 pts. 8. Contre-ronda.
9. Mab9ach : dernière prise 12 (+5), 1 (−5), aucune (−5). 10. Décompte > 20.
11. Partie gagnée à 41.
