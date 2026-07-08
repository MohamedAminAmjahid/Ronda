# Règles de la Ronda marocaine — Spécification du moteur de jeu

> Source de vérité des règles. Tout est **confirmé** par le moteur (`src/engine`) et ses
> tests (`tests/engine.test.ts`) — les valeurs ci-dessous ont été revérifiées contre le code
> réel, pas seulement contre l'intention initiale.

---

## 1. Le jeu de cartes
- Jeu espagnol de **40 cartes**, sans les 8 et 9.
- Valeurs par couleur : **1, 2, 3, 4, 5, 6, 7, 10 (Sota), 11 (Caballo), 12 (Rey)**.
- 4 couleurs : oros, copas, espadas, bastos.
- Carte : `{ valeur: number, couleur: 'oros'|'copas'|'espadas'|'bastos' }`.

## 2. Mise en place (1 contre 1 : joueur vs IA)
- Mélanger les 40 cartes. Distribuer **3 cartes** à chaque joueur. Poser **4 cartes** sur la table.
- Le reste = la **pioche**.
- **Ordre de jeu — CONFIRMÉ** : le **non-donneur joue toujours en premier** (à chaque
  manche de la donne, pas seulement la première), le **donneur joue en dernier**
  (cohérent avec la règle Mab9ach). Vérifié dans `src/engine/deal.ts`
  (`startNewDeal` et `dealNextRound` fixent tous deux `currentPlayer = nonDealer`).
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
Capturer la **dernière carte posée par l'adversaire** (même valeur ET même couleur) déclenche
une caída. Les caídas peuvent s'enchaîner sur la même valeur, en alternant entre les deux
joueurs (chacun capture l'appât laissé par l'autre — voir plus bas) :

| Niveau | Nom              | Condition                                                        | Points |
|--------|------------------|-------------------------------------------------------------------|--------|
| 1      | **Ara Wahd**     | 1ère caída (capture la carte adverse)                              | +1     |
| 2      | **Ara Khamssa**  | 2ème caída de suite sur la même valeur (capture l'appât laissé)    | +5     |
| 3      | **Ara 3achra**   | 3ème caída de suite sur la même valeur (capture l'appât laissé)    | +10    |

> **Correction de règle** : le niveau 3 s'appelait auparavant « Ara 7dach » (+11). Le nom et
> la valeur ont été corrigés en **Ara 3achra (+10)** — voir le test dédié
> `regle: Ara 3achra vaut 10 points (et non 11)` dans `tests/engine.test.ts`.

- La chaîne ne continue **que si c'est la même valeur** qui s'enchaîne ; toute capture d'une
  valeur différente repart à Ara Wahd, et tout coup sans capture brise la chaîne (retour à 0).
- Maximum **3 caídas** en chaîne (il y a 4 cartes par valeur — la 4ème caída est impossible :
  une fois les 4 cartes de la valeur jouées, plus personne ne peut relancer l'appât).
- **L'appât (carte qui reste sur la table)** : la carte qui vient de capturer en caída
  **reste sur la table** au lieu de partir en pile — elle devient l'appât du tour suivant,
  capturable à son tour par l'adversaire pour enchaîner la chaîne. Elle ne reste toutefois
  que si (a) l'adversaire a encore une carte de cette valeur en main **et** (b) le joueur qui
  vient de jouer a encore une carte en main après ce coup (sinon la manche se termine et la
  carte part directement en pile, avec le reste des cartes capturées).
  Si un autre coup (non-caída sur cette valeur) est joué avant que l'appât soit repris, il
  part immédiatement dans la pile du joueur qui l'avait laissé.
- **Effacement du niveau précédent** : monter d'un niveau (Ara Wahd → Ara Khamssa → Ara
  3achra) **efface les points que l'adversaire venait de gagner au niveau précédent**
  (Ara Khamssa lui retire son Ara Wahd, soit −1 ; Ara 3achra lui retire son Ara Khamssa, soit
  −5). Le score ne descend jamais sous 0. Exemple testé (`tests/engine.test.ts`, scénario 4
  tours) : P1 fait Ara Wahd + missa (2 pts) → P0 fait Ara Khamssa + missa (6 pts) et efface
  l'Ara Wahd de P1 (P1 : 2 → 1) → P1 fait Ara 3achra + missa (11 pts, P1 total 12) et efface
  l'Ara Khamssa de P0 (P0 : 6 → 1).
- Le moteur trace la chaîne en cours dans `GameState.caidaChain: { level: 1|2|3; value:
  Value } | null`, et l'appât en attente dans `pendingCaidaCard: { card: Card; playerId } |
  null`.

### 3.3 Balayage — « Missa » — CONFIRMÉ
Capture qui vide entièrement la table → **+1 point**.
Caída + Missa se cumulent sur le même coup (le bonus caída et le +1 missa s'additionnent —
voir `src/engine/game.ts`, `scoreBonus = caidaPoints; if (isMissa) scoreBonus += 1`).

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
- **Égalité de force** (cas limite testé) : si les deux combinaisons ont exactement la même
  force (même type, même valeur — ex. les 4 cartes d'une valeur réparties en 2 rondas
  identiques), c'est le **second déclarant** (celui dont la déclaration déclenche la
  résolution du conflit) qui remporte la totalité des points.

### 4.3 Contre-ronda (attraper une combinaison dissimulée) — CONFIRMÉ
Sert à **punir la dissimulation** (pas à contester un bluff, qui est impossible) :
- Un joueur qui a dissimulé une ronda/tringa devra quand même **jouer ces cartes**.
- Si l'adversaire **remarque** qu'il pose 2 (ronda) ou 3 (tringa) cartes de même valeur
  **issues de la même main**, il peut crier **« contre »** (« je t'ai attrapé »).
- Contre **correct** → le contesteur **gagne le point dissimulé** (1 pour une ronda). Le
  dissimulateur ne perd rien de son côté (il n'avait de toute façon jamais marqué ce point
  puisqu'il ne l'avait pas déclaré).
- Contre **à tort** (les cartes venaient de mains différentes, pas une vraie combinaison) →
  le contesteur **perd 1 point** (le « bull »), **sans jamais descendre sous 0**.
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
  - capture avec un **12 (Rey)** → **+5 points** au donneur
  - capture avec un **1 (As)** → **−5 points** au donneur
  - **aucune prise** (le donneur ne capture rien sur son dernier coup) → **+5 points à
    l'adversaire** (pas de malus au donneur — correction de règle : anciennement documenté
    comme « −5 au donneur », mais le moteur crédite l'adversaire, jamais de points négatifs
    infligés au donneur dans ce cas ; voir `mabqachBonus(null) → [0, 5]` dans
    `src/engine/scoring.ts`, testé explicitement dans `tests/engine.test.ts`)
  - capture avec **une autre valeur** → **0 point** (ni bonus ni malus)
- En Mab9ach, le **dernier à capturer** ramasse les **cartes restantes de la table** ;
  ces cartes rejoignent sa pile capturée et **comptent dans le décompte final** (section 5.2).

### 5.2 Décompte des cartes — CONFIRMÉ
- Le joueur ayant capturé **plus de 20 cartes** marque **+1 point par carte au-dessus de 20**
  (ex. 23 → +3). Ce décompte **s'ajoute** à tous les autres points (Mab9ach, ronda, etc.).
- **Égalité du nombre de cartes capturées** (pas seulement 20-20 : toute égalité, y compris
  au-dessus de 20, ex. 21-21) → **personne ne marque ce bonus**, même si les deux dépassent
  20 (sinon les deux marqueraient le même delta, ce qui serait équivalent mais moins clair).
  Voir `cardCountBonus` dans `src/engine/scoring.ts`.

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
- Cumuls de bonus (caída + missa), et effacement du niveau précédent en montant la chaîne.
- Égalité du décompte (y compris au-dessus de 20) → personne ne marque le décompte.
- Dissimulation de ronda + contre (correct vs à tort selon mains identiques/différentes).

## 7. Tests prioritaires (Vitest)
1. Capture simple. 2. Escalier dont **7 → 10**. 3. Caída → +1 (Ara Wahd).
4. Chaîne de caídas : Ara Khamssa (+5, efface l'Ara Wahd adverse), Ara 3achra
   (+10, efface l'Ara Khamssa adverse). 5. Missa → +1, cumulable avec une caída.
6. Ronda (2) = 1 pt, Tringa (3) = 5 pts. 7. Déclaration retardée + perte du droit.
8. Conflit : 2 rondas → 2 pts au plus haut ; tringa vs ronda → 6 pts. 9. Contre-ronda.
10. Mab9ach : dernière prise 12 (+5 donneur), 1 (−5 donneur), aucune (+5 adversaire).
11. Décompte > 20, et égalité → personne ne marque.
12. Fin de donne sans 41 → nouvelle donne, donneur alterné, **scores cumulés**.
13. Partie gagnée au premier à **41** (`GAME_OVER`).

Voir aussi `tests/engine.test.ts`, section « Corrections de règles » : régressions dédiées
aux erreurs déjà commises une fois (Ara 3achra = 10 et non 11 ; conflit qui doit toujours
créditer le déclarant courant, pas un index fixe).

---

# Règles de Di Jouj — Spécification du moteur de jeu

> Source de vérité des règles Di Jouj, revérifiée contre le moteur réel
> (`src/engine-dijouj/`) et `tests/dijouj.test.ts`. Di Jouj est un jeu de type
> « pouilleux/Uno » joué avec le même paquet espagnol que la Ronda.

## D1. Le jeu de cartes
- Même paquet que la Ronda : **40 cartes espagnoles** (sans 8 ni 9), valeurs
  **1, 2, 3, 4, 5, 6, 7, 10 (Sota), 11 (Caballo), 12 (Rey)**, 4 couleurs (oros, copas,
  espadas, bastos).

## D2. Joueurs et mise en place
- **2 à 4 joueurs** (matchmaking rapide = 2 ; partie privée « avec un ami » = 2 ou 4, choisi
  par l'hôte via le lobby).
- Chaque joueur reçoit **7 cartes**, quel que soit le nombre de joueurs. Le reste forme la
  **pioche** ; **1 carte** est retournée pour lancer la **défausse**.
- La **1ère carte de la défausse** ne peut jamais être une carte **spéciale** (As, 2, ou 7
  d'Oros — voir D4). Si c'est le cas, elle est remise dans la pioche, qui est remélangée, et
  on en retire une nouvelle jusqu'à obtenir une carte normale.

## D3. Jouer une carte
- Le joueur dont c'est le tour doit poser une carte de **même couleur OU même valeur** que
  le sommet de la défausse.
- Si une **couleur a été imposée** par un 7 d'Oros (D4.3), **seule cette couleur** est
  jouable — **sauf un nouveau 7 d'Oros**, qui peut la changer à nouveau (la règle « même
  valeur que le sommet » ne s'applique plus tant qu'une couleur est imposée).
- Si le joueur ne peut pas (ou ne veut pas) jouer, il **pioche** (voir D5).

## D4. Cartes spéciales

### D4.1 — Le **2** : pioche + passe (empilable)
Poser un 2 force le joueur suivant à **piocher 2 cartes et passer son tour**. Si ce joueur
possède lui-même un 2, il peut le jouer à la place au lieu de piocher : l'effet **s'empile**
(+2 par 2 joué, sans limite) et se reporte au joueur suivant. La pioche ne se déclenche que
lorsqu'un joueur ne peut pas (ou ne veut pas) enchaîner — il pioche alors **le total
accumulé en une seule fois**.

### D4.2 — L'**As (1)** : passe le tour (reportable en chaîne)
Poser un As force le joueur suivant à **passer son tour, sans piocher**. S'il possède
lui-même un As, il peut le rejouer à la place : le tour « saute » ainsi de joueur en joueur
jusqu'à ce que quelqu'un n'ait pas d'As et doive simplement passer (contrairement au 2, le
skip ne s'empile pas en compteur — il se **reporte** d'un joueur à l'autre).

### D4.3 — Le **7 d'Oros** : joker de couleur
Poser le 7 d'Oros permet à celui qui le joue de **choisir la couleur imposée** pour le
prochain coup (oros / copas / espadas / bastos) — y compris en la choisissant identique à
elle-même. N'importe quel joueur peut **rejouer un 7 d'Oros plus tard pour changer à nouveau**
la couleur imposée, même si une couleur est déjà en vigueur.

### D4.4 — Carte normale
Toutes les autres cartes (3, 4, 5, 6, 10, 11, 12, et le 7 des trois autres couleurs) n'ont
**aucun effet spécial** : le tour passe simplement au joueur suivant.

## D5. Piocher
- **Résolution d'un effet en attente** : si un draw2/skip est en attente et que le joueur ne
  peut pas (ou ne veut pas) l'enchaîner, piocher **résout l'effet** — il tire le total de
  cartes accumulé (draw2) ou passe sans piocher (skip), puis le tour passe au joueur suivant.
- **Pioche hors effet en attente** : 1 carte, et **le tour passe systématiquement** au joueur
  suivant — **même si la carte piochée aurait été jouable** ; elle rejoint simplement la main
  pour un tour ultérieur (pas de « rejoue immédiatement » sur pioche).
- Si la **pioche est vide**, la défausse est remélangée (hors sa carte du dessus, qui reste en
  jeu) pour la reconstituer. Si les **deux piles sont épuisées**, le tour passe sans rien
  piocher.

## D6. Victoire
- Le **premier joueur à vider sa main** gagne immédiatement la partie.
- **Cas particulier confirmé** : si la **dernière carte** jouée est une carte spéciale (2,
  As, ou 7 d'Oros), **son effet ne s'applique jamais** — la victoire est immédiate et
  prioritaire sur l'effet (le moteur vérifie la main vide avant de traiter les cartes
  spéciales).

## D7. Cas limites à coder et tester
- Empilement de plusieurs 2 d'affilée (draw2 cumulatif) jusqu'à ce qu'un joueur pioche le
  total accumulé.
- Chaîne d'As qui fait le tour de la table sans que personne ne pioche.
- 7 d'Oros rejoué pour changer une couleur déjà imposée par un 7 d'Oros précédent.
- Victoire sur une carte spéciale (2, As, 7 d'Oros) → aucun effet appliqué, partie terminée.
- Pioche qui vide `drawPile` → remélange de `discardPile` (hors sommet) pour le reconstituer.
- Les deux piles épuisées en même temps → le tour passe sans piocher.
- Carte piochée normalement puis jouable : le tour passe quand même (pas de rejeu immédiat).
