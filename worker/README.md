# Holyberg leaderboard Worker

The GitHub Pages game calls the public Worker at:

`https://holyberg-leaderboard.holyberg-game.workers.dev`

The Worker is deployed independently from the game. It owns all writes to the
`holyberg-leaderboard` D1 database; the frontend contains no Cloudflare
credentials.

After changing a migration or Worker code:

```sh
npm run worker:migrate
npm run worker:deploy
```

The production CORS origin is `https://tghnx1.github.io`. Localhost and
127.0.0.1 origins are also accepted for development.
