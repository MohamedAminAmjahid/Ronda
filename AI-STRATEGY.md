# Stratégie du bot IA — Ronda marocaine (étape 2)

> Implémente un bot **heuristique** dans `src/ai`, qui consomme le moteur pur de `src/engine`.
> Le bot expose la **même interface qu'un joueur humain** : il reçoit l'état et renvoie une
> `Action` (`PLAY_CARD` | `DECLARE` | `CONTEST`). Ainsi « vs IA » = une partie normale où un
> joueur est piloté par le bot, et tout sera réutilisable en multijoueur.

## Règle d'or : information publique uniquement
Le bot **ne doit JAMAIS lire l'information cachée** de l'adversaire (`players[opp].hand`,
`pendingCombo` non déclaré, ordre de la pioche). Créer un helper
`getObservableState(state, playerId)` qui masque ces champs, et faire travailler le bot
**uniquement** sur cette vue. Un bot qui triche n'est pas amusant.

## Fonction principale
`chooseAction(observable, playerId, difficulty, memory): Action`
Ordre de décision à chaque tour :
1. **Contre ?** Si l'adversaire vient de révéler une combinaison dissimulée (voir §3) → `CONTEST`.
2. **Déclarer ?** Si le bot détient une ronda/tringa qu'il décide d'annoncer (voir §2) → `DECLARE`.
3. **Sinon, jouer la meilleure carte** (voir §1) → `PLAY_CARD`.

---

## 1. Choix de la carte à jouer (le cœur)
Pour **chaque carte** de la main, simuler la capture avec `resolveCapture` (sans muter le
tour) et calculer un **score heuristique** ; jouer la carte au score le plus haut.

```
score(carte c, capture C) =
    + 1.0 * |C|                       // chaque carte capturée ≈ 1 pt au décompte (>20)
    + (isCaida ? 3.0 : 0)             // caída : +1 pt sûr ET prive l'adversaire
    + (isMissa ? 2.5 : 0)             // missa : +1 pt ET table vide pour l'adversaire
    + 0.3 * (nb de 11/12 capturés)    // cartes hautes : utiles et retirées à l'adversaire
    - (capture vide ? discardRisk(c) : 0)
    + endgameAdjustment(c)            // voir §4
```

**`discardRisk(c)`** (quand on pose sans capturer, on « nourrit » la table) :
- Plus élevé si la valeur de `c` a encore beaucoup d'exemplaires **non vus** (l'adversaire
  peut la capturer/caída au tour suivant).
- Plus élevé si poser `c` crée un **escalier** exploitable par l'adversaire sur la table.
- Donc : préférer défausser des valeurs **déjà très vues**, et **garder les cartes hautes**
  (surtout un 12 si le bot est donneur, voir §4).

> Capturer est presque toujours bon (les cartes comptent au décompte). Pour la v1, un bot
> « gourmand en captures » + sécurité de défausse suffit largement.

## 2. Déclaration : ronda / tringa (la partie psychologique)
- **Tringa → toujours déclarer immédiatement** (elle gagne toujours, +5, aucun risque).
- **Ronda → décision** basée sur `pHigherRonda` = probabilité estimée (depuis la mémoire,
  §5) que l'adversaire détienne une ronda **strictement plus haute** :
  - `pHigherRonda` faible (p.ex. ta ronda est haute, ou les valeurs supérieures sont déjà
    sorties) → **déclarer** (+1 quasi sûr).
  - `pHigherRonda` élevé → **dissimuler** (gamble), selon le niveau de difficulté.

> **Raisonnement clé à coder honnêtement :** dissimuler une ronda *plus basse* n'a d'intérêt
> que si l'adversaire **rate le contre**. Face à un capteur parfait, déclarer ou
> dissimuler-puis-se-faire-prendre donne le même résultat. La dissimulation sert donc surtout
> à **exploiter l'inattention d'un humain**. Le bot, lui, ne se fait jamais avoir (§3).

- **Moment** : déclarer au **début de son tour**, tant que le bot détient encore **toutes**
  les cartes de la combinaison. Ne jamais jouer une carte de la combo avant d'avoir décidé.

## 3. Contre : attraper une dissimulation (sans jamais se tromper)
- Le bot maintient `currentHandPlays[opponent]` = cartes que l'adversaire a jouées **depuis la
  dernière redistribution** (§5).
- Si l'adversaire pose une carte qui complète **2 (ronda)** cartes de **même valeur dans la
  même main**, **et** qu'il n'a **pas déclaré** cette ronda → le bot fait `CONTEST`
  (`accusedValue`), au **moment exact** de la carte révélatrice.
- **Ne jamais contester** sur des cartes venant de **mains différentes** → ce serait un contre
  à tort (−1). La mémoire ne considère que la main courante, donc le contre du bot est
  **sans risque**.

## 4. Fin de donne — Mab9ach (si le bot est donneur)
Le donneur joue la **dernière carte** de la donne. Dans la dernière main, le bot planifie :
- Viser une **dernière prise avec un 12** (+5) → garder un 12 pour la fin si possible.
- **Éviter** de finir avec un **1** comme carte de prise (−5) ou **sans capture** (−5).
- Donc dans `endgameAdjustment(c)` : bonus si jouer `c` mène à une dernière prise au 12 ;
  forte pénalité si `c` est le dernier coup et ne capture rien, ou capture avec un 1.

## 5. Mémoire / comptage de cartes (`src/ai/memory.ts`)
Mise à jour à chaque action observable :
- `seenCards` : toutes les cartes révélées (jouées, capturées, sur la table, main du bot).
- `currentHandPlays[playerId]` : cartes jouées par chacun **depuis la dernière donne**
  (réinitialisé à chaque redistribution — suivre `dealNumber` / `handNumber`).
- En déduire les **cartes inconnues** (= main adverse + pioche) pour estimer `pHigherRonda`
  et `discardRisk`.

## 6. Niveaux de difficulté
- **Facile** : capture gourmande (max cartes), déclare toujours ses rondas, ne dissimule
  jamais, contre uniquement les paires évidentes de la main courante, défausse naïve.
- **Moyen** : ajoute caída/missa, `discardRisk`, comptage de cartes pour le contre,
  politique de déclaration via `pHigherRonda`, planification Mab9ach (§4).
- **Difficile** (optionnel) : ajoute une recherche **Monte-Carlo** — échantillonner N mains
  adverses plausibles cohérentes avec `seenCards`, simuler des rollouts jusqu'à la fin de la
  donne, et choisir le coup au meilleur différentiel moyen.

---

## 7. Architecture (fichiers)
```
src/ai/
  observable.ts   # getObservableState() : masque l'info cachée de l'adversaire
  memory.ts       # comptage de cartes, frontières de donne, paires de la main courante
  evaluate.ts     # score(carte, capture) — la fonction heuristique du §1
  bot.ts          # chooseAction() : contre ? déclarer ? sinon meilleure carte
  montecarlo.ts   # (Difficile, optionnel) échantillonnage + rollouts
  index.ts
```

## 8. Tests prioritaires (Vitest)
1. Sur un état où une capture est possible, le bot choisit un coup **capturant**.
2. Le bot préfère le coup capturant **le plus de cartes** (escalier).
3. Le bot prend une **caída** quand elle est disponible.
4. Le bot prend une **missa** quand elle est disponible.
5. Le bot **déclare une tringa** systématiquement.
6. Le bot **déclare** une ronda haute ; (en Moyen) **dissimule** une ronda basse.
7. Le bot **conteste** une paire dissimulée **de la même main** (et gagne +1).
8. Le bot **ne conteste PAS** deux cartes de même valeur venant de **mains différentes**.
9. Mab9ach : en tant que donneur au dernier coup, le bot **préfère capturer avec un 12**.
10. Le bot **n'accède jamais** à `players[opp].hand` (vue observable uniquement).
11. Déterminisme : avec un RNG fixé, `chooseAction` renvoie toujours le même coup.
