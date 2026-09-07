# Holyberg leaderboard Worker

The game calls the public Worker at:

`https://holyberg-leaderboard.holyberg-game.workers.dev`

The Worker is deployed independently from the game. It owns all writes to the
`holyberg-leaderboard` D1 database; the frontend contains no Cloudflare
credentials.

After changing a migration or Worker code:

```sh
npm run worker:migrate
npm run worker:deploy
```

Production CORS accepts `https://game.holyberg.net` and the legacy
`https://tghnx1.github.io` origin during the domain transition. Localhost and
127.0.0.1 origins are also accepted for development.
