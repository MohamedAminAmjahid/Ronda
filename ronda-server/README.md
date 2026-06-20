# ronda-server

Serveur multijoueur **autoritaire** pour la Ronda marocaine.
Stack : **Colyseus 0.15** + **Node.js/TypeScript** + **SQLite** (better-sqlite3).

Le serveur est seul à faire autorité : il importe le moteur pur (`src/engine/`,
copié du client) et est le seul à appeler `applyAction`. Le client n'envoie que
des intentions (jouer une carte, déclarer, contester…).

## Développement

```bash
npm install
cp .env.example .env
npm run dev          # ts-node-dev, rechargement à chaud
```

## Production (Railway)

```bash
npm run build && npm start   # cf. Procfile
```

## Structure

```
src/
  rooms/RondaRoom.ts   Room 1v1 (Colyseus)        — étape 2
  engine/              moteur pur (copie du client, autoritaire)
  db/database.ts       init SQLite + migrations
  db/queries.ts        insert/select parties & stats
  index.ts             serveur Colyseus + routes HTTP
```

## Routes HTTP

- `GET /health` — sonde
- `GET /stats/:pseudo` — stats d'un joueur
- `GET /leaderboard` — classement
- `GET /games/recent` — dernières parties
