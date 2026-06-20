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
- **Règle de distribution initiale** : les 4 cartes posées sur la table au début d'une
  donne doivent respecter deux contraintes :
  1. **Pas de doublon** : deux cartes de même valeur interdites sur la table.
  2. **Pas de suite de 3+** : une suite de 3 valeurs consécutives ou plus est interdite
     (5-6 ok, mais 5-6-7 interdit). La suite suit l'ordre 1-2-3-4-5-6-7-10-11-12.
  Si la distribution génère une table invalide → **remettre les 40 cartes, mélanger et
  redistribuer** jusqu'à obtenir une table valide. S'applique uniquement aux 4 cartes
  initiales, pas aux cartes posées en cours de jeu.

## 3. Déroulement d'un tour
Le joueur **pose une carte** de sa main. Même valeur qu'une carte de la table → **capture**.

### 3.1 Capture en escalier — CONFIRMÉ
Après capture d'une valeur N, si N+1 est sur la table, on la capture aussi, puis N+2, etc.
Suite : **1-2-3-4-5-6-7-10-11-12** (le **7 → 10 est consécutif**).

### 3.2 Caída — Chaîne de caídas — CONFIRMÉ
Capturer la **dernière carte posée par l'adversaire** (même value ET même suit) déclenche
une caída. Les caídas peuvent s'enchaîner sur la même valeur :

| Niveau | Nom           | Condition                              | Points |
|--------|---------------|----------------------------------------|--------|
| 1      | **Ara Wahd**  | 1ère caída (capture la carte adverse)  | +1     |
| 2      | **Ara Khamssa** | 2ème caída : l'adversaire repose une carte de même valeur et capture la tienne | +5 |
| 3      | **Ara 7dach** | 3ème caída : tu repose une 3ème carte de même valeur et capture la sienne | +11 |

- La chaîne ne continue **que si c'est la même valeur** qui s'enchaîne.
- Maximum **3 caídas** en chaîne (il y a 4 cartes par valeur — la 4ème caída est impossible).
- Le moteur doit tracer le **niveau de caída en cours** (`caídaLevel: 0|1|2|3`) et la
  **valeur de la chaîne** (`caídaValue: Value | null`) dans `GameState`.
- À chaque coup : si la carte jouée capture `lastPlayedByOpponent` ET que la valeur est
  identique à `caídaValue` → niveau suivant et points correspondants. Sinon, reset de la
  chaîne.

### 3.3 Balayage — « Missa » — CONFIRMÉ
Capture qui vide entièrement la table → **+1 point**.
Caída + Missa peuvent se cumuler sur le même coup. *(assumé)*

## 4. Ronda et Tringa — CONFIRMÉ
- **Ronda** : 2 cartes de même valeur en main → **1 point** (base).
- **Tringa** : 3 cartes de même valeur en main → **5 points** (base).

### 4.1 Déclaration — CONFIRMÉ
- **Pas de bluff possible** : le bouton « Ronda »/« Tringa » n'apparaît à un joueur **que
  s'il détient réellement** la combinaison. Impossible de déclarer ce qu'on n'a pas.
- Déclaration **retardable** : possible tant que le joueur détient encore **toutes** les
  cartes de la combinaison en main.
- Dès qu'il **joue une carte** de la combinaison **sans l'avoir déclarée** → droit **perdu**.
- Un joueur peut **choisir de ne pas déclarer** (dissimuler), par stratégie — par ex. pour ne
  pas offrir à un adversaire au combo plus fort le bonus de conflit (voir 4.2 et 4.3).

### 4.2 Conflit de combinaisons — CONFIRMÉ
Quand les deux joueurs déclarent, la **combinaison la plus forte gagne et prend aussi le
point de l'autre** (le perdant marque 0) :
- Hiérarchie : **tringa > toute ronda** ; entre deux rondas, la **valeur de carte la plus
  haute** gagne (ronda de 10 > ronda de 1).
- Deux rondas → le gagnant marque **2 points** (1 + 1).
- Tringa contre ronda → la tringa marque **6 points** (5 + 1).

### 4.3 Contre-ronda (attraper une combinaison dissimulée) — CONFIRMÉ
Sert à **punir la dissimulation** (pas à contester un bluff, qui est impossible) :
- Un joueur qui a dissimulé une ronda/tringa devra quand même **jouer ces cartes**.
- Si l'adversaire **remarque** qu'il pose 2 (ronda) ou 3 (tringa) cartes de même valeur
  **issues de la même main**, il peut crier **« contre »** (« je t'ai attrapé »).
- Contre **correct** → le contesteur **gagne le point dissimulé** (1 pour une ronda).
- Contre **à tort** (les cartes venaient de mains différentes, pas une vraie combinaison) →
  le contesteur **perd 1 point** (le « bull »).
- Si personne ne remarque → la dissimulation réussit, aucun point, on continue.
- En pratique, **seules les rondas sont dissimulées** : une tringa gagne toujours, donc on la
  déclare systématiquement (aucun intérêt à la cacher). Le contre concerne donc les rondas.

## 5. Structure : manche / donne / partie — CONFIRMÉ

**Vocabulaire à respecter dans le code :**
- **Manche** = une distribution de 3 cartes par joueur (un mini-cycle de jeu).
- **Donne** = un cycle complet des 40 cartes : distribution initiale (3+3+4) puis manches de
  6 cartes jusqu'à épuisement. La table n'est **jamais réalimentée** en cours de donne. La
  dernière manche d'une donne s'appelle **« Mab9ach »**.
- **Partie** = la course à **41 points**, qui s'étend sur **plusieurs donnes**.

**Boucle de la partie :**
1. Jouer une donne entière (jusqu'à Mab9ach) puis appliquer le **décompte** (5.2).
2. Si un joueur atteint **≥ 41** → `GAME_OVER`.
3. Sinon → **rebattre les 40 cartes**, le **donneur alterne**, redistribuer, et rejouer une
   donne. Les **scores sont cumulés** d'une donne à l'autre.

### 5.1 Dernière manche d'une donne — « Mab9ach » — CONFIRMÉ
- La **prise de la toute dernière carte** par le **donneur** (qui joue la dernière carte) :
  - capture avec un **12 (Rey)** → **+5 points**
  - capture avec un **1 (As)** → **−5 points**
  - **aucune** prise → **−5 points**
  - capture avec **une autre valeur** → **0 point** (ni bonus ni malus)
- En Mab9ach, le **dernier à capturer** ramasse les **cartes restantes de la table** ;
  ces cartes rejoignent sa pile capturée et **comptent dans le décompte final** (section 5.2).

### 5.2 Décompte des cartes — CONFIRMÉ
- Le joueur ayant capturé **plus de 20 cartes** marque **+1 point par carte au-dessus de 20**
  (ex. 23 → +3). Ce décompte **s'ajoute** à tous les autres points (Mab9ach, ronda, etc.).

### 5.3 Score cible — CONFIRMÉ
- La **partie** se gagne au premier à **41 points**, scores cumulés sur plusieurs donnes
  (voir la boucle en section 5).

## 6. Cas limites à coder et tester
- Plusieurs cartes de même valeur sur la table → on en capture **une seule, automatiquement**
  (la couleur n'a aucun impact : ni sur le score ni sur l'escalier ; pas de choix joueur).
- Caída : c'est **la carte exacte que l'adversaire vient de jouer** qui doit être capturée.
- Escalier qui s'arrête dès qu'un maillon manque.
- Donneur qui **alterne** à chaque nouvelle donne.
- Pioche insuffisante pour une dernière manche complète.
- Cumuls de bonus (caída + missa).
- Égalité 20-20 au décompte → personne ne marque le décompte. *(assumé)*
- Dissimulation de ronda + contre (correct vs à tort selon mains identiques/différentes).

## 7. Tests prioritaires (Vitest)
1. Capture simple. 2. Escalier dont **7 → 10**. 3. Caída → +1. 4. Missa → +1.
5. Ronda (2) = 1 pt, Tringa (3) = 5 pts. 6. Déclaration retardée + perte du droit.
7. Conflit : 2 rondas → 2 pts au plus haut ; tringa vs ronda → 6 pts. 8. Contre-ronda.
9. Mab9ach : dernière prise 12 (+5), 1 (−5), aucune (−5). 10. Décompte > 20.
11. Fin de donne sans 41 → nouvelle donne, donneur alterné, **scores cumulés**.
12. Partie gagnée au premier à **41** (`GAME_OVER`).
