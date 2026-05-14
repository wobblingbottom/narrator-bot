# Narrator Bot

Multi-server Discord RP bot with:
- Character ownership + profiles
- `/say` via webhooks (character persona messaging)
- User/character wallets and points
- Character and user level-up notifications to separately configurable Discord channels
- Shop upgrades + role shop items
- Admin setup panel + logs channel
- Optional Discord subscription-based premium slots (+5 while active, slot-locked on expiry)

## Tech Stack

- Node.js (ESM)
- discord.js v14
- better-sqlite3
- sharp (profile image rendering)

## Project Structure

- `bot.js` — main Discord bot
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
- `DISCORD_PREMIUM_SLOT_SKUS` (comma-separated Discord SKU IDs for premium subscriptions)
## Install

```bash
npm install
```

## Run

Start bot:

```bash
npm run start
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
- `/premium`
- `/leaderboard`
- `/setup panel`
- `/admin user edit`

## Premium Slots

- Premium is handled through Discord monetization using SKU entitlements.
- Current model: one active premium subscription grants `+5` extra character slots.
- Premium slots are separate from bought base slots.
- If premium expires, characters are not deleted, but any characters above the active slot limit become slot-locked.
- Slot-locked characters cannot be picked or used with `/say` until the user re-subscribes or frees enough non-premium slots.

## Level-Up Logs

- Character level-ups are posted to the configured character level-up alerts channel.
- User level-ups are posted to the configured user level-up alerts channel.
- If either alerts channel is not set, that alert type falls back to the server's configured logs channel.
- Character level-up checks run when `/say` awards character points and when admins add character points with `/setup add-points`.
- User level-up checks run when normal chat, `/say`, or admins award user points.
- Configure both destinations separately through `/setup panel`.

## Deployment Notes

- Global slash commands can take time to propagate after restart.
- Persist the `data/` directory in production.
- If deploying with Docker, ensure env vars are present in runtime environment.

## Hosting

Keep the README hosting section short. It should answer "how do I run this" and point to the full guides instead of duplicating every deployment step here.

### Railway (Recommended)

1. Connect this GitHub repo to a new Railway project.
2. Deploy the bot service from this repo (uses `railway.json` + `Dockerfile`).
3. Set variables in Railway:
	- Required: `DISCORD_TOKEN`, `CLIENT_ID`
	- Optional: `COMMAND_GUILD_ID`, `GUILD_ID`, `CURRENCY_EMOJI`, `DISCORD_PREMIUM_SLOT_SKUS`
4. Attach a Railway Volume mounted at `/app/data` for persistent bot data.
5. Redeploy and check logs for `Logged in as ...`.

### Oracle Cloud

- Oracle Cloud deployment guides are kept in the repo for manual VM hosting.
- Use `QUICKSTART.md` for the short version.
- Use `DEPLOYMENT.md` for the full step-by-step setup.

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

## Policies

- `TERMS_OF_SERVICE.md`
- `PRIVACY_POLICY.md`

Before public launch, replace placeholder contact text in both files.

## Security

- Never commit real secrets in `.env`.
- Rotate bot tokens if exposed.

## License

Private/internal project (no OSS license specified).
