# Interface Expo — Ronda marocaine (étape 3)

> Construire l'UI dans `src/ui` (composants) + `src/game` (contrôleur d'état). L'UI **consomme**
> le moteur de `src/engine` et le bot de `src/ai` ; elle ne contient **aucune règle de jeu**.
> Cible : **web + iOS + Android** (Expo), en **portrait**.

## ⚠️ Copyright des cartes
**Ne pas utiliser d'images de jeux de cartes espagnols réels** (scans, packs sous licence).
Dessiner des **faces de cartes originales** (composants `View`/`react-native-svg`) : la valeur
(1–7, 10, 11, 12) + un symbole de couleur maison pour oros / copas / espadas / bastos. Les
figures (Sota 10, Caballo 11, Rey 12) sont stylisées librement, pas copiées d'un jeu existant.

---

## 1. Direction visuelle (point de départ, à raffiner)
Ancrer le jeu dans son monde : une table de café marocain, motifs **zellij** (géométrie),
laiton et thé. Éviter les trois looks « IA générique » (crème + serif + terracotta ; near-black
+ accent acide ; broadsheet).

- **Palette (5)** : `--table:#0E5C4A` (vert zellij profond), `--brass:#C9A227` (laiton/accent),
  `--clay:#B5532A` (terre, pour caída/alertes), `--bone:#F4ECD8` (face des cartes),
  `--ink:#1C2622` (texte/contours).
- **Typographie (2 rôles)** : une **display** à caractère pour le titre et les annonces
  (Ronda, Tringa, Missa, Ara Wahd, Mab9ach) ; une **sans** lisible pour scores et libellés.
  Charger via `expo-font`. Choisir des familles **non par défaut**, assumées.
- **Signature** : le **dos des cartes** et les pips de couleur portent un motif zellij discret ;
  la bannière **« Mab9ach »** de dernière donne est le moment fort (entrée animée).
- Dépenser l'audace à **un seul endroit** (la signature) ; garder le reste calme et précis.

## 2. Écrans
1. **Menu** : titre, bouton « Nouvelle partie », choix de difficulté (Facile / Moyen),
   accès aux règles. Copie en voix active, casse phrase, sans remplissage.
2. **Jeu** (cœur) : voir §3.
3. **Fin de partie** : vainqueur, scores finaux, « Rejouer ».

## 3. Écran de jeu — disposition
```
┌───────────────────────────────────────┐
│  Score  TOI 23   —   BOT 31   (→ 41)    │  scoreboard (cible 41)
│  [main adverse : dos de cartes ×N]      │  on ne voit QUE le nombre
│                                         │
│            [ cartes sur la TABLE ]      │  zone centrale
│         (bannière « Mab9ach » ici)      │
│                                         │
│  [ ta MAIN : cartes face visible ]      │  tap pour jouer
│  [Ronda] [Tringa] [Contre]  pioche: 12  │  boutons contextuels + pile
└───────────────────────────────────────┘
```
- **Boutons contextuels** (règle stricte) :
  - `Ronda` / `Tringa` n'apparaissent **que si le joueur détient réellement** la combinaison
    (`self.pendingCombo` non null) et n'a pas perdu le droit.
  - `Contre` n'apparaît **que** lorsqu'un contre est possible pour le joueur (voir §4, fenêtre).
- **Retour visuel** (libellés dans la voix du jeu, en darija) : « Ara Wahd ! » sur caída,
  « Missa ! » sur balayage, « +1 / +5 », qui a déclaré, résultat d'un contre. Toasts brefs.

## 4. Architecture état — `src/game`
- **`useRondaGame(difficulty)`** : hook qui possède le `GameState` via `useReducer(applyAction)`.
  Expose : l'état dérivé pour l'UI, et des actions `playCard(card)`, `declare(combo)`,
  `contest(value)`, `newGame()`.
- **Identité** : le joueur humain = `PlayerId` fixe (ex. 0), le bot = l'autre.
- **Vue observable + mémoire du bot** : le hook maintient l'`AiMemory` du bot et appelle
  `updateMemory` après chaque action.
- **Boucle vs IA** : quand `currentPlayer === botId` et la phase est jouable, calculer
  l'observable du bot, appeler `chooseAction`, puis dispatcher l'action après un **petit délai**
  (~500–700 ms) pour un rythme naturel. Boucler jusqu'au tour de l'humain ou `GAME_OVER`.
- **Fenêtre de contre côté humain** : exposer un flag dérivé `canContest` (vrai si, au début du
  tour de l'humain, le bot vient de révéler une paire de même valeur, même main, non déclarée).
  Réutiliser la même logique d'observation que le bot (ne pas dupliquer les règles).
- **Garde-fou** : ne jamais laisser l'UI envoyer une action hors tour (le moteur la rejette de
  toute façon depuis l'étape 2 — l'UI doit désactiver les contrôles en conséquence).

## 5. Animations (`react-native-reanimated`, progressif)
- Carte jouée qui glisse vers la table ; capture qui « aspire » les cartes vers la pile.
- Escalier : capture en chaîne légèrement séquencée (lisible, pas tape-à-l'œil).
- Bannière **Mab9ach** : entrée marquante (le moment signature).
- Respecter **reduced-motion** ; l'animation sert la lecture, jamais la décoration.

## 6. Plancher de qualité
- Responsive jusqu'au mobile (portrait), lisible sur web et téléphone.
- Focus clavier visible sur web ; contraste suffisant ; reduced-motion respecté.
- États vides/erreurs : une invitation à agir, pas une excuse (voix du jeu).

## 7. Ordre de construction (ne pas tout câbler d'un coup)
1. **Composant `Card`** (faces originales + dos zellij) et la disposition statique de l'écran
   de jeu avec un **`GameState` factice** — viser d'abord le look (§1) et la lisibilité.
2. Brancher **`useRondaGame`** : l'humain tape une carte → l'état avance (sans bot encore).
3. **Boucle vs IA** (délai + mémoire du bot).
4. UI de **déclaration** (Ronda/Tringa) et de **contre** (flag `canContest`).
5. **Animations** (§5) puis menu + écran de fin.
6. Polish : sons optionnels, reduced-motion, passes de critique visuelle.

## 8. Validation
- Jouer une partie complète humain-vs-bot sur **web et mobile** sans blocage jusqu'à un
  gagnant ≥ 41.
- Vérifier que `Ronda`/`Tringa` n'apparaissent **que** quand on détient la combo, et `Contre`
  **que** dans sa fenêtre.
- Vérifier le rendu en portrait sur un petit écran (≈360 px de large).
