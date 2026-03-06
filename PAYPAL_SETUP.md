# PayPal Setup (Sandbox First)

This project now includes a payments backend at `payments-server.js`.

## What it does

- `POST /paypal/create-order`: creates a PayPal order for one paid slot.
- `POST /paypal/webhook`: verifies PayPal webhook signature and grants paid slot.
- `GET /payments/paid-slots/:userId`: debug endpoint to check paid slot grants.

Data is stored in `data/economy.sqlite` in tables:
- `paid_slots`
- `payment_events`

## 1) Fill env variables

Add to `.env`:

- `PAYMENTS_PORT=8787`
- `PAYPAL_MODE=sandbox`
- `PAYPAL_CLIENT_ID=...`
- `PAYPAL_CLIENT_SECRET=...`
- `PAYPAL_WEBHOOK_ID=...`
- `PAYPAL_CURRENCY=USD`
- `PAYPAL_SLOT_PRICE=2.99`
- `PAYPAL_SLOT_SCOPE=<your guild id>` (optional; defaults to `GUILD_ID`)

## 2) Run payments backend

```bash
npm install
npm run start:payments
```

Health check:

```bash
curl http://localhost:8787/health
```

## 3) Expose backend via HTTPS

PayPal webhooks require public HTTPS URL.

Examples:
- Cloudflare Tunnel
- ngrok
- Deploy backend to Render/Railway/Fly.io

Assume public URL is:

`https://your-domain.example`

## 4) Configure PayPal app/webhook

In PayPal Developer dashboard:

1. Create/choose sandbox app.
2. Copy `Client ID` and `Secret` into `.env`.
3. Add webhook URL:
   - `https://your-domain.example/paypal/webhook`
4. Subscribe to event:
   - `PAYMENT.CAPTURE.COMPLETED`
5. Copy webhook ID into `.env` as `PAYPAL_WEBHOOK_ID`.

## 5) Test order creation

```bash
curl -X POST http://localhost:8787/paypal/create-order \
  -H "Content-Type: application/json" \
  -d '{"discordUserId":"123456789012345678"}'
```

Response includes:
- `orderId`
- `approveUrl`

Open `approveUrl`, complete sandbox payment.

After PayPal sends webhook, check granted slots:

```bash
curl http://localhost:8787/payments/paid-slots/123456789012345678
```

## Notes

- Webhook events are idempotent via `payment_events.event_id`.
- Only `PAYMENT.CAPTURE.COMPLETED` grants slots.
- If order metadata has no `custom_id` (Discord user ID), grant is rejected.
- This backend grants to `paid_slots` only. You can later merge `paid_slots` into the bot slot limit logic.
