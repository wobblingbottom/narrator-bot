# Narrator Bot

Multi-server Discord RP bot with:
- Character ownership + profiles
- `/say` via webhooks (character persona messaging)
- User/character wallets and points
- Shop upgrades + role shop items
- Admin setup panel + logs channel
- Optional PayPal payments backend for paid slots

## Tech Stack

- Node.js (ESM)
- discord.js v14
- better-sqlite3
- express (payments service)
- sharp (profile image rendering)

## Project Structure

- `bot.js` — main Discord bot
- `payments-server.js` — PayPal payments backend
- `config/` — static configuration
- `data/` — runtime data (JSON + SQLite)
- `Dockerfile` / `docker-compose.yml` — containerized deploy

## Prerequisites

- Node.js 20+
- A Discord application + bot token

## Environment Variables

Copy `.env.example` to `.env` and fill values.

Required for bot:
- `DISCORD_TOKEN`
- `CLIENT_ID`

Optional command scope:
- `COMMAND_GUILD_ID` — set for fast dev command updates in one guild
- Leave `COMMAND_GUILD_ID` empty to register global commands for all servers

Other optional vars:
- `GUILD_ID` (legacy fallback for integrations)
- `CURRENCY_EMOJI`

Payments vars (only if using PayPal backend):
- `PAYMENTS_PORT`
- `PAYPAL_MODE`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_WEBHOOK_ID`
- `PAYPAL_CURRENCY`
- `PAYPAL_SLOT_PRICE`
- `PAYPAL_SLOT_SCOPE`

## Install

```bash
npm install
```

## Run

Start bot:

```bash
npm run start
```

Start payments backend:

```bash
npm run start:payments
```

## Docker

Build + run with compose:

```bash
docker-compose up -d --build
```

View logs:

```bash
docker logs -f discord-rp-bot
```

## Slash Command Registration Mode

On startup, commands are registered by env mode:
- If `COMMAND_GUILD_ID` is set: guild commands for that server only (fast propagation)
- If empty: global commands for all servers (slower propagation, broad availability)

## Common Commands

- `/character` (pick, list, profile, create, assign, edit, delete, etc.)
- `/say`
- `/wallet`
- `/shop`
- `/leaderboard`
- `/setup panel`
- `/admin user edit`

## Deployment Notes

- Global slash commands can take time to propagate after restart.
- Persist the `data/` directory in production.
- If deploying with Docker, ensure env vars are present in runtime environment.

## Railway (Recommended)

1. Connect this GitHub repo to a new Railway project.
2. Deploy the bot service from this repo (uses `railway.json` + `Dockerfile`).
3. Set variables in Railway:
	- Required: `DISCORD_TOKEN`, `CLIENT_ID`
	- Optional: `COMMAND_GUILD_ID`, `GUILD_ID`, `CURRENCY_EMOJI`
4. Attach a Railway Volume mounted at `/app/data` for persistent bot data.
5. Redeploy and check logs for `Logged in as ...`.

If you use PayPal, deploy `payments-server.js` as a separate Railway service with `npm run start:payments`.

### Railway Backups (Important)

- Keep your bot volume mounted at `/app/data`.
- In Railway, open **Volumes** and create regular backups/snapshots for your data volume.
- Before big changes, make a manual snapshot first.
- Optional local backup from your repo folder:

```bash
tar -czf backup-data.tar.gz data/
```

- To restore locally, replace `data/` with your backup copy, then restart the bot.

For detailed hosting docs:
- `DEPLOYMENT.md`
- `QUICKSTART.md`
- `PAYPAL_SETUP.md`

## Security

- Never commit real secrets in `.env`.
- Rotate bot/payment tokens if exposed.

## License

Private/internal project (no OSS license specified).
