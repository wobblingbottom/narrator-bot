import express from "express";
import dotenv from "dotenv";
import path from "path";
import Database from "better-sqlite3";

dotenv.config();

const app = express();

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    }
  })
);

const PORT = Number(process.env.PAYMENTS_PORT || 8787);
const PAYPAL_MODE = (process.env.PAYPAL_MODE || "sandbox").trim().toLowerCase();
const PAYPAL_CLIENT_ID = (process.env.PAYPAL_CLIENT_ID || "").trim();
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || "";
const PAYPAL_WEBHOOK_ID = (process.env.PAYPAL_WEBHOOK_ID || "").trim();
const PAYPAL_CURRENCY = (process.env.PAYPAL_CURRENCY || "USD").trim().toUpperCase();
const PAYPAL_SLOT_PRICE = (process.env.PAYPAL_SLOT_PRICE || "2.99").trim();
const PAYPAL_SLOT_SCOPE = (process.env.PAYPAL_SLOT_SCOPE || process.env.GUILD_ID || "global").trim();
const ECONOMY_DB_PATH = path.resolve("./data/economy.sqlite");

const PAYPAL_BASE_URL =
  PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
  console.warn("PayPal credentials missing. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET before creating orders.");
}

const db = new Database(ECONOMY_DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = FULL");

db.exec(`
  CREATE TABLE IF NOT EXISTS paid_slots (
    scope_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    slots INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (scope_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS payment_events (
    event_id TEXT NOT NULL PRIMARY KEY,
    order_id TEXT,
    capture_id TEXT,
    user_id TEXT,
    amount TEXT,
    currency TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

function getBasicAuthHeader() {
  const credentials = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  return `Basic ${credentials}`;
}

async function getPayPalAccessToken() {
  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: getBasicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get PayPal access token (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function paypalRequest(endpoint, options = {}) {
  const token = await getPayPalAccessToken();

  const response = await fetch(`${PAYPAL_BASE_URL}${endpoint}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`PayPal request failed (${response.status}): ${text}`);
  }

  return payload;
}

async function verifyWebhookSignature(reqBody, headers) {
  if (!PAYPAL_WEBHOOK_ID) {
    throw new Error("PAYPAL_WEBHOOK_ID is required for webhook verification.");
  }

  const verification = await paypalRequest("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: {
      transmission_id: headers["paypal-transmission-id"],
      transmission_time: headers["paypal-transmission-time"],
      cert_url: headers["paypal-cert-url"],
      auth_algo: headers["paypal-auth-algo"],
      transmission_sig: headers["paypal-transmission-sig"],
      webhook_id: PAYPAL_WEBHOOK_ID,
      webhook_event: reqBody
    }
  });

  return verification.verification_status === "SUCCESS";
}

function getPaidSlots(scopeId, userId) {
  const row = db
    .prepare("SELECT slots FROM paid_slots WHERE scope_id = ? AND user_id = ?")
    .get(scopeId, userId);
  return Number(row?.slots || 0);
}

function grantPaidSlot(scopeId, userId) {
  db.prepare(
    `INSERT INTO paid_slots (scope_id, user_id, slots)
     VALUES (?, ?, 1)
     ON CONFLICT(scope_id, user_id) DO UPDATE SET slots = slots + 1`
  ).run(scopeId, userId);
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, mode: PAYPAL_MODE, scope: PAYPAL_SLOT_SCOPE });
});

app.post("/paypal/create-order", async (req, res) => {
  try {
    const discordUserId = String(req.body?.discordUserId || "").trim();

    if (!discordUserId) {
      res.status(400).json({ error: "discordUserId is required." });
      return;
    }

    const order = await paypalRequest("/v2/checkout/orders", {
      method: "POST",
      body: {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: "slot_purchase",
            custom_id: discordUserId,
            amount: {
              currency_code: PAYPAL_CURRENCY,
              value: PAYPAL_SLOT_PRICE
            },
            description: "Discord bot premium character slot"
          }
        ],
        application_context: {
          user_action: "PAY_NOW"
        }
      }
    });

    const approveLink = order.links?.find((link) => link.rel === "approve")?.href || null;

    res.json({
      ok: true,
      orderId: order.id,
      approveUrl: approveLink
    });
  } catch (error) {
    console.error("Create order failed:", error);
    res.status(500).json({ error: "Failed to create PayPal order." });
  }
});

app.get("/payments/paid-slots/:userId", (req, res) => {
  const userId = String(req.params.userId || "").trim();
  if (!userId) {
    res.status(400).json({ error: "userId is required." });
    return;
  }

  const slots = getPaidSlots(PAYPAL_SLOT_SCOPE, userId);
  res.json({ ok: true, scope: PAYPAL_SLOT_SCOPE, userId, paidSlots: slots });
});

app.post("/paypal/webhook", async (req, res) => {
  try {
    const isValid = await verifyWebhookSignature(req.body, req.headers);

    if (!isValid) {
      res.status(400).json({ error: "Invalid webhook signature." });
      return;
    }

    const event = req.body;
    const eventId = String(event?.id || "").trim();

    if (!eventId) {
      res.status(400).json({ error: "Missing webhook event ID." });
      return;
    }

    const alreadyProcessed = db
      .prepare("SELECT event_id FROM payment_events WHERE event_id = ?")
      .get(eventId);

    if (alreadyProcessed) {
      res.json({ ok: true, duplicate: true });
      return;
    }

    const eventType = String(event?.event_type || "");

    if (eventType !== "PAYMENT.CAPTURE.COMPLETED") {
      db.prepare(
        `INSERT INTO payment_events (event_id, status, created_at)
         VALUES (?, ?, ?)`
      ).run(eventId, `IGNORED:${eventType || "UNKNOWN"}`, new Date().toISOString());

      res.json({ ok: true, ignored: eventType || "UNKNOWN" });
      return;
    }

    const capture = event.resource || {};
    const captureId = String(capture.id || "");
    const orderId = String(capture?.supplementary_data?.related_ids?.order_id || "");

    if (!orderId) {
      db.prepare(
        `INSERT INTO payment_events (event_id, capture_id, status, created_at)
         VALUES (?, ?, ?, ?)`
      ).run(eventId, captureId || null, "ERROR:NO_ORDER_ID", new Date().toISOString());

      res.status(400).json({ error: "Capture event missing order ID." });
      return;
    }

    const orderDetails = await paypalRequest(`/v2/checkout/orders/${orderId}`);
    const discordUserId = String(orderDetails?.purchase_units?.[0]?.custom_id || "").trim();

    if (!discordUserId) {
      db.prepare(
        `INSERT INTO payment_events (event_id, order_id, capture_id, status, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(eventId, orderId, captureId || null, "ERROR:NO_DISCORD_USER", new Date().toISOString());

      res.status(400).json({ error: "Order missing Discord user ID metadata." });
      return;
    }

    const amount = String(capture?.amount?.value || "");
    const currency = String(capture?.amount?.currency_code || "");

    const transaction = db.transaction(() => {
      db.prepare(
        `INSERT INTO payment_events (event_id, order_id, capture_id, user_id, amount, currency, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        eventId,
        orderId,
        captureId || null,
        discordUserId,
        amount || null,
        currency || null,
        "COMPLETED",
        new Date().toISOString()
      );

      grantPaidSlot(PAYPAL_SLOT_SCOPE, discordUserId);
    });

    transaction();

    res.json({
      ok: true,
      grantedUserId: discordUserId,
      paidSlots: getPaidSlots(PAYPAL_SLOT_SCOPE, discordUserId)
    });
  } catch (error) {
    console.error("Webhook handling failed:", error);
    res.status(500).json({ error: "Webhook processing failed." });
  }
});

app.listen(PORT, () => {
  console.log(`Payments backend listening on port ${PORT}`);
  console.log(`PayPal mode: ${PAYPAL_MODE}`);
  console.log(`Economy DB: ${ECONOMY_DB_PATH}`);
  console.log(`Paid slot scope: ${PAYPAL_SLOT_SCOPE}`);
});
