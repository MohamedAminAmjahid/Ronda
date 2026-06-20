# Checklist Ronda — Corrections & Améliorations

> À traiter dans l'ordre. Cocher chaque point après validation visuelle ou test.

---

## 🔴 PRIORITÉ 1 — Bugs critiques (à corriger avant tout)

- [ ] **Caída (Ara Wahd) — bug de règle**
  La caída ne doit se déclencher QUE si l'adversaire vient de poser cette carte exacte
  au tour immédiatement précédent. Si la carte était déjà sur la table avant (début de
  manche ou tours précédents), pas de caída même si on la capture. Ajouter un test Vitest.

- [ ] **Arabe — vérification visuelle**
  Lancer le jeu, provoquer une caída ou une ronda, et confirmer que l'overlay affiche
  bien آرا واحد / رندة / مابقاش en lettres liées et dans le bon ordre (pas à l'envers).
  C'est le point le plus important jamais confirmé.

- [ ] **Partie complète — validation**
  Jouer une partie entière jusqu'à 41 points sans que le jeu plante ou se bloque.
  Vérifier que le bot répond bien à chaque tour.

---

## 🟠 PRIORITÉ 2 — Affichage des cartes

- [ ] **Recoloration — fond seulement**
  Remplacer UNIQUEMENT le fond blanc/beige (#ffffff, #f4f4f4, #f2f2f2 et variantes
  proches-blanc R>230 ET G>230 ET B>220) par l'os #F4ECD8. Ne pas toucher aux rouges,
  bleus, jaunes, verts des costumes et symboles. Les figures (Rey/Caballo/Sota) doivent
  garder leurs couleurs d'origine. Régénérer les 40 modules TS.

---

## 🟡 PRIORITÉ 3 — Animations

- [ ] **Animation de distribution — correction**
  Les cartes de la TABLE sont fixes (pas d'animation). Seules les cartes en MAIN
  (3 joueur + 3 bot) glissent à l'apparition. Retirer DealCard des cartes de la table.

- [ ] **Animation — poser une carte (priorité 2)**
  Quand le joueur ou le bot joue une carte, elle glisse depuis la main vers la table
  (~250 ms, spring léger) au lieu d'apparaître instantanément.

- [ ] **Animation — capture (priorité 3)**
  Quand des cartes sont capturées, elles s'aspirent vers la pile du joueur
  (scale → 0 + glissement, ~300 ms).

- [ ] **Animation — pulse caída (priorité 4)**
  La carte adverse posée sur la table (cible de caída) pulse légèrement
  (scale 1 → 1.05 → 1, en boucle, très subtil).

---

## 🟡 PRIORITÉ 4 — Transitions entre donnes

- [ ] **Annonce début de donne**
  Au lancement de chaque donne, overlay centré ~1,5 s affichant « Donne 1 »,
  « Donne 2 »… (Cairo, laiton). Puis le jeu démarre automatiquement.

- [ ] **Bannière Mab9ach en jeu**
  Quand isMabqach === true, afficher une bannière visible entre la main adverse et
  la table indiquant que c'est la dernière redistribution de la donne.

- [ ] **Écran résultat fin de donne**
  Quand la donne se termine (phase DEAL_END), afficher :
  - Titre مابقاش (Reem Kufi arabe + translittération Cairo)
  - Points gagnés cette donne par chaque joueur avec signe (+3, -1…)
    en vert si positif, clay si négatif
  - Score total cumulé de chaque joueur
  - Bouton « Continuer » → donne suivante (ou fin de partie si ≥ 41)

---

## 🟢 PRIORITÉ 5 — Qualité & polish

- [ ] **Taille du bundle**
  Mesurer avec `npx expo export --platform web`. Si > 8 MB à cause des SVG (37 MB de TS),
  convertir les cartes en PNG 2× (via sharp ou @resvg/resvg-js) et charger avec require().

- [ ] **Chargement des polices**
  Vérifier que Reem Kufi et Cairo se chargent bien sur mobile (iOS + Android) et pas
  seulement sur web.

- [ ] **Largeur sur web**
  Vérifier que le jeu reste centré dans ~430 px sur grand écran desktop.

- [ ] **Cartes sur 2 rangées**
  Vérifier que quand la table a 6+ cartes, elles passent bien sur 2 rangées
  sans déborder ni être coupées.

- [ ] **Surlignage dernière carte**
  La dernière carte posée sur la table a un contour laiton. Vérifier qu'il apparaît
  et disparaît correctement après une capture.

- [ ] **Bouton Ronda/Tringa**
  Vérifier que les boutons Ronda et Tringa n'apparaissent QUE quand le joueur
  détient réellement la combinaison (pendingCombo non null, droit non perdu).

- [ ] **Bouton Contre**
  Vérifier que le bouton Contre n'apparaît QUE dans la bonne fenêtre (après que
  l'adversaire a révélé une paire de même valeur dans la même main).

---

## 🔵 PRIORITÉ 6 — Futur (ne pas coder maintenant)

- [ ] **Mode 2v2** — cadrage dans RULES-2V2.md déjà commencé, règles à finaliser
- [ ] **Multijoueur en ligne** — architecture Colyseus prévue, moteur prêt
- [ ] **Sons** — sons de pose de carte, capture, annonce ronda
- [ ] **Animations avancées** — Monte-Carlo pour IA difficile
- [ ] **Écran de règles** — explication des règles accessible depuis le menu
