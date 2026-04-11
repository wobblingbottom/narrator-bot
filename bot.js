import fs from "fs";
import http from "http";
import path from "path";
import dotenv from "dotenv";
import sharp from "sharp";
import Database from "better-sqlite3";
import { Agent, setGlobalDispatcher } from "undici";
import {
  ActivityType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  GatewayIntentBits,
  ModalBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  WebhookClient
} from "discord.js";

dotenv.config();

setGlobalDispatcher(
  new Agent({
    connect: {
      timeout: 30000
    },
    headersTimeout: 30000,
    bodyTimeout: 30000
  })
);

const DATA_DIR = path.resolve("./data");
const CONFIG_DIR = path.resolve("./config");
const DEFAULT_CHARACTERS_PATH = path.join(CONFIG_DIR, "characters.json");
const DEFAULT_ASSIGNMENTS_PATH = path.join(CONFIG_DIR, "assignments.json");
const DEFAULT_POINTS_PATH = path.join(CONFIG_DIR, "points.json");
const DEFAULT_CHARACTER_POINTS_PATH = path.join(CONFIG_DIR, "characterPoints.json");
const DEFAULT_USER_SLOTS_PATH = path.join(CONFIG_DIR, "userSlots.json");
const CHARACTERS_PATH = path.join(DATA_DIR, "characters.json");
const ASSIGNMENTS_PATH = path.join(DATA_DIR, "assignments.json");
const SELECTIONS_PATH = path.join(DATA_DIR, "selections.json");
const WEBHOOKS_PATH = path.join(DATA_DIR, "webhooks.json");
const LOGS_CHANNEL_PATH = path.join(DATA_DIR, "logsChannel.json");
const ADMIN_ROLES_PATH = path.join(DATA_DIR, "adminRoles.json");
const DUNGEON_MASTER_ROLES_PATH = path.join(DATA_DIR, "dungeonMasterRoles.json");
const SAY_CHANNELS_PATH = path.join(DATA_DIR, "sayChannels.json");
const ROLEPLAY_ENABLED_PATH = path.join(DATA_DIR, "roleplayEnabled.json");
const MESSAGE_LOGS_PATH = path.join(DATA_DIR, "messageLogs.json");
const USERS_PROFILES_PATH = path.join(DATA_DIR, "userProfiles.json");
const POINTS_PATH = path.join(DATA_DIR, "points.json");
const CHARACTER_POINTS_PATH = path.join(DATA_DIR, "characterPoints.json");
const USER_SLOTS_PATH = path.join(DATA_DIR, "userSlots.json");
const CHARACTER_UPGRADES_PATH = path.join(DATA_DIR, "characterUpgrades.json");
const SHOP_ROLE_ITEMS_PATH = path.join(DATA_DIR, "shopRoleItems.json");
const INVENTORY_ITEMS_PATH = path.join(DATA_DIR, "inventoryItems.json");
const USER_INVENTORY_PATH = path.join(DATA_DIR, "userInventory.json");
const ITEM_RECIPES_PATH = path.join(DATA_DIR, "itemRecipes.json");
const TRADE_PROPOSALS_PATH = path.join(DATA_DIR, "tradeProposals.json");
const TITLES_PATH = path.join(DATA_DIR, "titles.json");
const USER_TITLES_PATH = path.join(DATA_DIR, "userTitles.json");
const ECONOMY_DB_PATH = path.join(DATA_DIR, "economy.sqlite");

const MESSAGE_POINTS_MIN = 0.25;
const MESSAGE_POINTS_MAX = 1;
const POINTS_PER_CHARACTER_MESSAGE = 2;
const MESSAGE_POINTS_COOLDOWN_MS = 30000;
const CHARACTER_POINTS_COOLDOWN_MS = 10000;
const DEFAULT_CHARACTER_SLOTS = 1;
const MAX_CHARACTER_SLOTS = 6;
const DISCORD_PREMIUM_SUBSCRIPTION_SLOTS = 5;
const SLOT_BASE_COST = 90;
const SLOT_COST_STEP = 60;
const SHOP_PAGE_SIZE = 4;
const WEBHOOK_AUTO_DELETE_MS = 60000;
const CHANNEL_WEBHOOK_LIMIT = 15;
const WEBHOOK_NAME_PREFIX = "Crazyland";
const WEBHOOK_SLOT_CYCLE_SIZE = 1;
const WEBHOOK_RECOVERY_MAX_ATTEMPTS = Math.max(5, WEBHOOK_SLOT_CYCLE_SIZE * 4);
const DISCORD_PREMIUM_SLOT_SKU_IDS = new Set(
  String(process.env.DISCORD_PREMIUM_SLOT_SKUS || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
);
const DISCORD_PREMIUM_PURCHASE_URL = String(process.env.DISCORD_PREMIUM_PURCHASE_URL || "").trim();
const CURRENCY_EMOJI_RAW = (process.env.CURRENCY_EMOJI || "<:sundrop:1479231387864399963>").trim();
const SHOP_ITEM_EMOJI_RAW = "<:pointer:1478835623853949109>";
const POINTS_EMOJI_RAW = "<:sundrop:1479231387864399963>";
const UNSUCCESSFUL_EMOJI_RAW = "<:unsuccess:1479238199774806149>";
const SUCCESSFUL_EMOJI_RAW = "<:success:1479234774861221898>";
const BULLET_EMOJI_RAW = "<:bullet:1479240196191944938>";

const CHARACTER_UPGRADE_DEFINITIONS = {
  character_wallet_boost: {
    id: "character_wallet_boost",
    name: "Character Wallet Boost",
    cost: 75,
    description: "+1 extra character point whenever /say awards points"
  },
  cooldown_boost: {
    id: "cooldown_boost",
    name: "Cooldown Boost",
    cost: 113,
    description: "Reduces this character's /say point cooldown by 50%"
  }
};

// Item rarity tiers with color codes
const ITEM_RARITY_TIERS = {
  common: { name: "Common", color: "#95A5A6", order: 1 },
  uncommon: { name: "Uncommon", color: "#27AE60", order: 2 },
  rare: { name: "Rare", color: "#3498DB", order: 3 },
  epic: { name: "Epic", color: "#8E44AD", order: 4 },
  legendary: { name: "Legendary", color: "#F39C12", order: 5 }
};

// Item categories for shop organization
const ITEM_CATEGORIES = {
  consumable: { name: "Consumable", emoji: "🧪" },
  equipment: { name: "Equipment", emoji: "⚔️" },
  quest: { name: "Quest Item", emoji: "📜" },
  special: { name: "Special", emoji: "✨" },
  other: { name: "Other", emoji: "📦" }
};

// Max inventory weight (for inventory capacity limits)
const MAX_INVENTORY_WEIGHT = 100;
const INVENTORY_WEIGHT_PER_SLOT = 10;

// Item cooldown tracking (user + itemId = key for last use time)
const itemCooldowns = new Map();

const messagePointsCooldowns = new Map();
const characterPointsCooldowns = new Map();
const reportCooldowns = new Map();
const webhookAutoDeleteTimers = new Map();
const webhookSlotCursorByChannel = new Map();
const entitlementSlotBonusByScopeUser = new Map();

function getEntitlementEntries(entitlements) {
  if (!entitlements) {
    return [];
  }

  if (Array.isArray(entitlements)) {
    return entitlements;
  }

  if (typeof entitlements.values === "function") {
    return Array.from(entitlements.values());
  }

  if (typeof entitlements[Symbol.iterator] === "function") {
    return Array.from(entitlements);
  }

  return [];
}

function getEntitlementSkuId(entitlement) {
  return String(entitlement?.skuId || entitlement?.sku_id || "").trim();
}

function getEntitlementUserId(entitlement) {
  return String(entitlement?.userId || entitlement?.user_id || "").trim();
}

function getEntitlementGuildId(entitlement) {
  return String(entitlement?.guildId || entitlement?.guild_id || "").trim();
}

function isEntitlementActive(entitlement) {
  if (!entitlement || entitlement.deleted) {
    return false;
  }

  const endsAt = entitlement.endsAt || entitlement.ends_at;
  if (!endsAt) {
    return true;
  }

  const expiresAt = new Date(endsAt).getTime();
  if (!Number.isFinite(expiresAt)) {
    return true;
  }

  return expiresAt > Date.now();
}

function syncPremiumSlotsFromInteraction(interaction) {
  try {
    if (!interaction?.inGuild?.() || !interaction.guildId || !interaction.user?.id) {
      return;
    }

    const scopeKey = getUserSlotsKey(interaction.guildId, interaction.user.id);

    if (DISCORD_PREMIUM_SLOT_SKU_IDS.size === 0) {
      entitlementSlotBonusByScopeUser.delete(scopeKey);
      return;
    }

    const entries = getEntitlementEntries(interaction.entitlements);

    let hasActivePremium = false;
    for (const entitlement of entries) {
      if (!isEntitlementActive(entitlement)) {
        continue;
      }

      const skuId = getEntitlementSkuId(entitlement);
      if (!DISCORD_PREMIUM_SLOT_SKU_IDS.has(skuId)) {
        continue;
      }

      const entitlementUserId = getEntitlementUserId(entitlement);
      if (entitlementUserId && entitlementUserId !== interaction.user.id) {
        continue;
      }

      const entitlementGuildId = getEntitlementGuildId(entitlement);
      if (entitlementGuildId && entitlementGuildId !== interaction.guildId) {
        continue;
      }

      hasActivePremium = true;
      break;
    }

    if (hasActivePremium) {
      entitlementSlotBonusByScopeUser.set(scopeKey, DISCORD_PREMIUM_SUBSCRIPTION_SLOTS);
    } else {
      entitlementSlotBonusByScopeUser.delete(scopeKey);
    }
  } catch (error) {
    console.error("Failed to sync premium slot entitlements:", error);
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJson(filePath, fallback) {
  const backupPath = `${filePath}.bak`;

  const parseFile = (targetPath) => {
    const raw = fs.readFileSync(targetPath, "utf8");
    return JSON.parse(raw);
  };

  try {
    if (!fs.existsSync(filePath)) {
      if (fs.existsSync(backupPath)) {
        return parseFile(backupPath);
      }
      return fallback;
    }
    return parseFile(filePath);
  } catch (error) {
    console.error(`Failed to read ${filePath}:`, error);

    try {
      if (fs.existsSync(backupPath)) {
        console.warn(`Attempting backup recovery from ${backupPath}`);
        return parseFile(backupPath);
      }
    } catch (backupError) {
      console.error(`Failed to read backup ${backupPath}:`, backupError);
    }

    return fallback;
  }
}

function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  const backupPath = `${filePath}.bak`;
  const tempPath = path.join(
    dir,
    `.${path.basename(filePath)}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
  );

  ensureDir(dir);
  const serialized = JSON.stringify(data, null, 2);

  try {
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, backupPath);
    }

    fs.writeFileSync(tempPath, serialized, "utf8");
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // ignore cleanup errors
    }
    console.error(`Failed atomic write for ${filePath}:`, error);
    throw error;
  }
}

ensureDir(DATA_DIR);
ensureDir(CONFIG_DIR);

if (!fs.existsSync(CHARACTERS_PATH)) {
  const seedCharacters = readJson(DEFAULT_CHARACTERS_PATH, []);
  writeJson(CHARACTERS_PATH, Array.isArray(seedCharacters) ? seedCharacters : []);
}

const characters = readJson(CHARACTERS_PATH, []);
if (!Array.isArray(characters)) {
  throw new Error("data/characters.json must be an array.");
}

if (characters.length === 0) {
  const fallbackCharacters = readJson(DEFAULT_CHARACTERS_PATH, []);
  if (Array.isArray(fallbackCharacters) && fallbackCharacters.length > 0) {
    characters.push(...fallbackCharacters);
    writeJson(CHARACTERS_PATH, characters);
    console.log(`Seeded ${fallbackCharacters.length} character(s) from config defaults.`);
  }
}

let assignments = readJson(ASSIGNMENTS_PATH, {});
if (!assignments || typeof assignments !== "object" || Array.isArray(assignments)) {
  assignments = {};
}

if (Object.keys(assignments).length === 0) {
  const fallbackAssignments = readJson(DEFAULT_ASSIGNMENTS_PATH, {});
  if (fallbackAssignments && typeof fallbackAssignments === "object" && !Array.isArray(fallbackAssignments)) {
    assignments = { ...fallbackAssignments };
    writeJson(ASSIGNMENTS_PATH, assignments);
    console.log(`Seeded ${Object.keys(assignments).length} character assignment(s) from config defaults.`);
  }
}

let selections = readJson(SELECTIONS_PATH, {});
let webhooks = readJson(WEBHOOKS_PATH, {});
let logsChannelId = readJson(LOGS_CHANNEL_PATH, null);
let adminRoles = readJson(ADMIN_ROLES_PATH, {});
let dungeonMasterRoles = readJson(DUNGEON_MASTER_ROLES_PATH, {});
let sayChannels = readJson(SAY_CHANNELS_PATH, {});
let roleplayEnabledByGuild = readJson(ROLEPLAY_ENABLED_PATH, {});
let messageLogs = readJson(MESSAGE_LOGS_PATH, []);
let userProfiles = readJson(USERS_PROFILES_PATH, {});
let points = readJson(POINTS_PATH, {});
let characterPoints = readJson(CHARACTER_POINTS_PATH, {});
let userSlots = readJson(USER_SLOTS_PATH, {});
let characterUpgrades = readJson(CHARACTER_UPGRADES_PATH, {});
let shopRoleItems = readJson(SHOP_ROLE_ITEMS_PATH, []);
let inventoryItems = readJson(INVENTORY_ITEMS_PATH, []);
let userInventory = readJson(USER_INVENTORY_PATH, {});
let itemRecipes = readJson(ITEM_RECIPES_PATH, []);
let tradeProposals = readJson(TRADE_PROPOSALS_PATH, []);
let titles = readJson(TITLES_PATH, []);
let userTitles = readJson(USER_TITLES_PATH, {});
let economyDb = null;

if (!Array.isArray(shopRoleItems)) {
  shopRoleItems = [];
}

if (!Array.isArray(inventoryItems)) {
  inventoryItems = [];
}

if (!Array.isArray(itemRecipes)) {
  itemRecipes = [];
}

if (!Array.isArray(tradeProposals)) {
  tradeProposals = [];
}

if (!Array.isArray(titles)) {
  titles = [];
}

if (!userTitles || typeof userTitles !== "object" || Array.isArray(userTitles)) {
  userTitles = {};
}

if (!userInventory || typeof userInventory !== "object" || Array.isArray(userInventory)) {
  userInventory = {};
}

if (!adminRoles || typeof adminRoles !== "object" || Array.isArray(adminRoles)) {
  adminRoles = {};
}

if (!dungeonMasterRoles || typeof dungeonMasterRoles !== "object" || Array.isArray(dungeonMasterRoles)) {
  dungeonMasterRoles = {};
}

if (!sayChannels || typeof sayChannels !== "object" || Array.isArray(sayChannels)) {
  sayChannels = {};
}

if (!roleplayEnabledByGuild || typeof roleplayEnabledByGuild !== "object" || Array.isArray(roleplayEnabledByGuild)) {
  roleplayEnabledByGuild = {};
}

if (!points || typeof points !== "object" || Array.isArray(points)) {
  points = {};
}

if (!characterPoints || typeof characterPoints !== "object" || Array.isArray(characterPoints)) {
  characterPoints = {};
}

if (!userSlots || typeof userSlots !== "object" || Array.isArray(userSlots)) {
  userSlots = {};
}

if (countPositiveNumericValues(points) === 0) {
  const fallbackPoints = readJson(DEFAULT_POINTS_PATH, {});
  if (fallbackPoints && typeof fallbackPoints === "object" && !Array.isArray(fallbackPoints) && countPositiveNumericValues(fallbackPoints) > 0) {
    points = { ...fallbackPoints };
    writeJson(POINTS_PATH, points);
    console.log(`Seeded ${Object.keys(points).length} user point balance(s) from config defaults.`);
  }
}

if (countPositiveNumericValues(characterPoints) === 0) {
  const fallbackCharacterPoints = readJson(DEFAULT_CHARACTER_POINTS_PATH, {});
  if (fallbackCharacterPoints && typeof fallbackCharacterPoints === "object" && !Array.isArray(fallbackCharacterPoints) && countPositiveNumericValues(fallbackCharacterPoints) > 0) {
    characterPoints = { ...fallbackCharacterPoints };
    writeJson(CHARACTER_POINTS_PATH, characterPoints);
    console.log(`Seeded ${Object.keys(characterPoints).length} character point balance(s) from config defaults.`);
  }
}

if (countPositiveNumericValues(userSlots) === 0) {
  const fallbackUserSlots = readJson(DEFAULT_USER_SLOTS_PATH, {});
  if (fallbackUserSlots && typeof fallbackUserSlots === "object" && !Array.isArray(fallbackUserSlots) && countPositiveNumericValues(fallbackUserSlots) > 0) {
    userSlots = { ...fallbackUserSlots };
    writeJson(USER_SLOTS_PATH, userSlots);
    console.log(`Seeded ${Object.keys(userSlots).length} user slot record(s) from config defaults.`);
  }
}

function parseScopedStorageKey(key) {
  if (typeof key !== "string") {
    return null;
  }

  const separatorIndex = key.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= key.length - 1) {
    const trimmed = key.trim();
    if (!trimmed) {
      return null;
    }

    return {
      scopeId: "global",
      entityId: trimmed
    };
  }

  return {
    scopeId: key.slice(0, separatorIndex),
    entityId: key.slice(separatorIndex + 1)
  };
}

function countPositiveNumericValues(mapLike) {
  if (!mapLike || typeof mapLike !== "object") {
    return 0;
  }

  let count = 0;
  for (const value of Object.values(mapLike)) {
    if (Number.isFinite(value) && value > 0) {
      count += 1;
    }
  }
  return count;
}

function mergeNumericFallbackMap(targetMap, fallbackMap, floorValue = 0) {
  if (!targetMap || typeof targetMap !== "object" || Array.isArray(targetMap)) {
    return 0;
  }

  if (!fallbackMap || typeof fallbackMap !== "object" || Array.isArray(fallbackMap)) {
    return 0;
  }

  let merged = 0;
  for (const [key, rawValue] of Object.entries(fallbackMap)) {
    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue) || numericValue <= floorValue) {
      continue;
    }

    const currentValue = Number(targetMap[key] || 0);
    if (!Number.isFinite(currentValue) || currentValue < numericValue) {
      targetMap[key] = numericValue;
      merged += 1;
    }
  }

  return merged;
}

function importEconomyJsonIntoSqliteIfEmpty() {
  if (!economyDb) {
    return;
  }

  if (Object.keys(points).length > 0) {
    const insertUserPoints = economyDb.prepare(`
      INSERT INTO user_points (scope_id, user_id, points)
      VALUES (?, ?, ?)
      ON CONFLICT(scope_id, user_id) DO UPDATE SET points = excluded.points
    `);
    const transaction = economyDb.transaction((entries) => {
      for (const [key, value] of entries) {
        const parsed = parseScopedStorageKey(key);
        if (!parsed || !Number.isFinite(value) || value <= 0) {
          continue;
        }
        insertUserPoints.run(parsed.scopeId, parsed.entityId, value);
      }
    });
    transaction(Object.entries(points));
  }

  if (Object.keys(characterPoints).length > 0) {
    const insertCharacterPoints = economyDb.prepare(`
      INSERT INTO character_points (scope_id, character_id, points)
      VALUES (?, ?, ?)
      ON CONFLICT(scope_id, character_id) DO UPDATE SET points = excluded.points
    `);
    const transaction = economyDb.transaction((entries) => {
      for (const [key, value] of entries) {
        const parsed = parseScopedStorageKey(key);
        if (!parsed || !Number.isFinite(value) || value <= 0) {
          continue;
        }
        insertCharacterPoints.run(parsed.scopeId, parsed.entityId, value);
      }
    });
    transaction(Object.entries(characterPoints));
  }

  if (Object.keys(userSlots).length > 0) {
    const insertUserSlots = economyDb.prepare(`
      INSERT INTO user_slots (scope_id, user_id, slots)
      VALUES (?, ?, ?)
      ON CONFLICT(scope_id, user_id) DO UPDATE SET slots = excluded.slots
    `);
    const transaction = economyDb.transaction((entries) => {
      for (const [key, value] of entries) {
        const parsed = parseScopedStorageKey(key);
        if (!parsed || !Number.isFinite(value) || value < DEFAULT_CHARACTER_SLOTS) {
          continue;
        }
        insertUserSlots.run(parsed.scopeId, parsed.entityId, Math.floor(value));
      }
    });
    transaction(Object.entries(userSlots));
  }

  if (Object.keys(characterUpgrades).length > 0) {
    const insertUpgrade = economyDb.prepare(`
      INSERT OR IGNORE INTO character_upgrades (scope_id, character_id, upgrade_id)
      VALUES (?, ?, ?)
    `);
    const transaction = economyDb.transaction((entries) => {
      for (const [key, value] of entries) {
        const parsed = parseScopedStorageKey(key);
        if (!parsed || !Array.isArray(value)) {
          continue;
        }
        for (const upgradeId of value) {
          if (typeof upgradeId === "string" && upgradeId.length > 0) {
            insertUpgrade.run(parsed.scopeId, parsed.entityId, upgradeId);
          }
        }
      }
    });
    transaction(Object.entries(characterUpgrades));
  }
}

const fallbackPointsForMerge = readJson(DEFAULT_POINTS_PATH, {});
const mergedUserPoints = mergeNumericFallbackMap(points, fallbackPointsForMerge, 0);
if (mergedUserPoints > 0) {
  writeJson(POINTS_PATH, points);
  console.log(`Merged ${mergedUserPoints} user point balance(s) from config defaults.`);
}

function loadEconomyCachesFromSqlite() {
  if (!economyDb) {
    return;
  }

  points = {};
  characterPoints = {};
  userSlots = {};
  characterUpgrades = {};

  const userPointRows = economyDb.prepare("SELECT scope_id, user_id, points FROM user_points WHERE points > 0").all();
  for (const row of userPointRows) {
    points[`${row.scope_id}:${row.user_id}`] = row.points;
  }

  const characterPointRows = economyDb.prepare("SELECT scope_id, character_id, points FROM character_points WHERE points > 0").all();
  for (const row of characterPointRows) {
    characterPoints[`${row.scope_id}:${row.character_id}`] = row.points;
  }

  const userSlotRows = economyDb.prepare("SELECT scope_id, user_id, slots FROM user_slots WHERE slots >= ?").all(DEFAULT_CHARACTER_SLOTS);
  for (const row of userSlotRows) {
    userSlots[`${row.scope_id}:${row.user_id}`] = row.slots;
  }

  const upgradeRows = economyDb.prepare("SELECT scope_id, character_id, upgrade_id FROM character_upgrades").all();
  for (const row of upgradeRows) {
    const key = `${row.scope_id}:${row.character_id}`;
    if (!characterUpgrades[key]) {
      characterUpgrades[key] = [];
    }
    characterUpgrades[key].push(row.upgrade_id);
  }
}

const fallbackCharacterPointsForMerge = readJson(DEFAULT_CHARACTER_POINTS_PATH, {});
const mergedCharacterPoints = mergeNumericFallbackMap(characterPoints, fallbackCharacterPointsForMerge, 0);
if (mergedCharacterPoints > 0) {
  writeJson(CHARACTER_POINTS_PATH, characterPoints);
  console.log(`Merged ${mergedCharacterPoints} character point balance(s) from config defaults.`);
}

async function initEconomyDatabase() {
  ensureDir(DATA_DIR);

  economyDb = new Database(ECONOMY_DB_PATH);
  economyDb.pragma("journal_mode = WAL");
  economyDb.pragma("synchronous = FULL");

  economyDb.exec(`
    CREATE TABLE IF NOT EXISTS user_points (
      scope_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      points REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (scope_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS character_points (
      scope_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      points REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (scope_id, character_id)
    );

    CREATE TABLE IF NOT EXISTS user_slots (
      scope_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      slots INTEGER NOT NULL,
      PRIMARY KEY (scope_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS character_upgrades (
      scope_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      upgrade_id TEXT NOT NULL,
      PRIMARY KEY (scope_id, character_id, upgrade_id)
    );
  `);

  importEconomyJsonIntoSqliteIfEmpty();

  loadEconomyCachesFromSqlite();

  console.log("Economy DB backend: SQLite");
}

const fallbackUserSlotsForMerge = readJson(DEFAULT_USER_SLOTS_PATH, {});
const mergedUserSlots = mergeNumericFallbackMap(userSlots, fallbackUserSlotsForMerge, DEFAULT_CHARACTER_SLOTS - 1);
if (mergedUserSlots > 0) {
  writeJson(USER_SLOTS_PATH, userSlots);
  console.log(`Merged ${mergedUserSlots} user slot record(s) from config defaults.`);
}

function upsertUserPointsInDb(guildId, userId, value) {
  if (!guildId || !userId) {
    return;
  }

  if (!economyDb) {
    return;
  }

  const scopeId = getScopeId(guildId);

  if (!Number.isFinite(value) || value <= 0) {
    economyDb.prepare("DELETE FROM user_points WHERE scope_id = ? AND user_id = ?").run(scopeId, userId);
    return;
  }

  economyDb.prepare(`
    INSERT INTO user_points (scope_id, user_id, points)
    VALUES (?, ?, ?)
    ON CONFLICT(scope_id, user_id) DO UPDATE SET points = excluded.points
  `).run(scopeId, userId, value);
}

function upsertCharacterPointsInDb(guildId, characterId, value) {
  if (!guildId || !characterId) {
    return;
  }

  if (!economyDb) {
    return;
  }

  const scopeId = getScopeId(guildId);

  if (!Number.isFinite(value) || value <= 0) {
    economyDb.prepare("DELETE FROM character_points WHERE scope_id = ? AND character_id = ?").run(scopeId, characterId);
    return;
  }

  economyDb.prepare(`
    INSERT INTO character_points (scope_id, character_id, points)
    VALUES (?, ?, ?)
    ON CONFLICT(scope_id, character_id) DO UPDATE SET points = excluded.points
  `).run(scopeId, characterId, value);
}

function upsertUserSlotsInDb(guildId, userId, slots) {
  if (!guildId || !userId) {
    return;
  }

  if (!economyDb) {
    return;
  }

  const scopeId = getScopeId(guildId);
  const safeSlots = Number.isFinite(slots) ? Math.floor(slots) : DEFAULT_CHARACTER_SLOTS;

  if (safeSlots <= DEFAULT_CHARACTER_SLOTS) {
    economyDb.prepare("DELETE FROM user_slots WHERE scope_id = ? AND user_id = ?").run(scopeId, userId);
    return;
  }

  economyDb.prepare(`
    INSERT INTO user_slots (scope_id, user_id, slots)
    VALUES (?, ?, ?)
    ON CONFLICT(scope_id, user_id) DO UPDATE SET slots = excluded.slots
  `).run(scopeId, userId, safeSlots);
}

function addCharacterUpgradeInDb(guildId, characterId, upgradeId) {
  if (!guildId || !characterId || !upgradeId) {
    return;
  }

  if (!economyDb) {
    return;
  }

  const scopeId = getScopeId(guildId);

  economyDb.prepare(`
    INSERT OR IGNORE INTO character_upgrades (scope_id, character_id, upgrade_id)
    VALUES (?, ?, ?)
  `).run(scopeId, characterId, upgradeId);
}

function clearCharacterPointsInDb(guildId, characterId) {
  if (!guildId || !characterId) {
    return;
  }

  if (!economyDb) {
    return;
  }

  const scopeId = getScopeId(guildId);
  economyDb.prepare("DELETE FROM character_points WHERE scope_id = ? AND character_id = ?").run(scopeId, characterId);
}

function clearCharacterUpgradesInDb(guildId, characterId) {
  if (!guildId || !characterId) {
    return;
  }

  if (!economyDb) {
    return;
  }

  const scopeId = getScopeId(guildId);
  economyDb.prepare("DELETE FROM character_upgrades WHERE scope_id = ? AND character_id = ?").run(scopeId, characterId);
}

const legacyCharacterIds = characters
  .filter((character) => !character.guildId)
  .map((character) => character.id);

if (legacyCharacterIds.length > 0) {
  for (let index = characters.length - 1; index >= 0; index -= 1) {
    if (!characters[index].guildId) {
      characters.splice(index, 1);
    }
  }

  for (const key of Object.keys(assignments)) {
    const characterId = key.includes(":") ? key.split(":").pop() : key;
    if (legacyCharacterIds.includes(characterId)) {
      delete assignments[key];
    }
  }

  for (const key of Object.keys(selections)) {
    if (legacyCharacterIds.includes(selections[key])) {
      delete selections[key];
    }
  }

  for (const key of Object.keys(characterPoints)) {
    const characterId = key.includes(":") ? key.split(":").pop() : key;
    if (legacyCharacterIds.includes(characterId)) {
      delete characterPoints[key];
    }
  }

  for (const key of Object.keys(characterUpgrades)) {
    const characterId = key.includes(":") ? key.split(":").pop() : key;
    if (legacyCharacterIds.includes(characterId)) {
      delete characterUpgrades[key];
    }
  }

  writeJson(CHARACTERS_PATH, characters);
  writeJson(ASSIGNMENTS_PATH, assignments);
  writeJson(SELECTIONS_PATH, selections);
  writeJson(CHARACTER_POINTS_PATH, characterPoints);
  writeJson(CHARACTER_UPGRADES_PATH, characterUpgrades);
  console.log(`Removed ${legacyCharacterIds.length} legacy global character(s) without guildId.`);
}


function saveAssignments() {
  writeJson(ASSIGNMENTS_PATH, assignments);
}

function saveSelections() {
  writeJson(SELECTIONS_PATH, selections);
}

function saveWebhooks() {
  writeJson(WEBHOOKS_PATH, webhooks);
}

async function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timeoutHandle;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(timeoutMessage || "Operation timed out."));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function loadImageBufferFromUrl(url, timeoutMs = 12000) {
  const rawUrl = String(url || "").trim();
  if (!rawUrl) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (error) {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  try {
    const response = await withTimeout(
      fetch(parsed.toString(), {
        method: "GET",
        headers: {
          "User-Agent": "NarratorBot/1.0"
        }
      }),
      timeoutMs,
      "Timed out while loading avatar image."
    );

    if (!response?.ok) {
      return null;
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType && !contentType.startsWith("image/")) {
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length > 0 ? buffer : null;
  } catch (error) {
    return null;
  }
}

function clearWebhookAutoDeleteTimer(webhookId) {
  if (!webhookId) {
    return;
  }

  const entry = webhookAutoDeleteTimers.get(webhookId);
  if (!entry) {
    return;
  }

  clearTimeout(entry.timer);
  webhookAutoDeleteTimers.delete(webhookId);
}

function clearAllWebhookAutoDeleteTimers() {
  for (const { timer } of webhookAutoDeleteTimers.values()) {
    clearTimeout(timer);
  }
  webhookAutoDeleteTimers.clear();
}

function removeWebhookFromChannelCache(channelId, webhookId) {
  const channelEntries = webhooks[channelId];
  if (!channelEntries || typeof channelEntries !== "object") {
    return;
  }

  let changed = false;
  for (const [characterId, cachedEntry] of Object.entries(channelEntries)) {
    if (cachedEntry?.id === webhookId) {
      delete channelEntries[characterId];
      changed = true;
    }
  }

  if (Object.keys(channelEntries).length === 0) {
    delete webhooks[channelId];
    changed = true;
  }

  if (changed) {
    saveWebhooks();
  }
}

function scheduleWebhookAutoDelete(channelId, webhookInfo) {
  if (!channelId || !webhookInfo?.id || !webhookInfo?.token) {
    return;
  }

  clearWebhookAutoDeleteTimer(webhookInfo.id);

  const timer = setTimeout(async () => {
    try {
      const webhookClient = new WebhookClient({
        id: webhookInfo.id,
        token: webhookInfo.token
      });
      await webhookClient.delete("Auto-delete after 1 minute.");
    } catch (error) {
      // ignore if already deleted or invalid
    } finally {
      removeWebhookFromChannelCache(channelId, webhookInfo.id);
      webhookAutoDeleteTimers.delete(webhookInfo.id);
    }
  }, WEBHOOK_AUTO_DELETE_MS);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  webhookAutoDeleteTimers.set(webhookInfo.id, { timer, channelId });
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeSvgText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clampText(value, maxLength) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (raw.length <= maxLength) {
    return raw;
  }
  return `${raw.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function normalizeHexColor(value, fallback) {
  const raw = String(value || "").trim();
  if (!raw) {
    return fallback;
  }
  const normalized = raw.startsWith("#") ? raw : `#${raw}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return fallback;
  }
  return normalized.toUpperCase();
}

function getCachedWebhookEntryById(channelId, webhookId) {
  const channelEntries = webhooks[channelId];
  if (!channelEntries || typeof channelEntries !== "object") {
    return null;
  }

  for (const cachedEntry of Object.values(channelEntries)) {
    if (cachedEntry?.id === webhookId && cachedEntry?.token) {
      return {
        id: cachedEntry.id,
        token: cachedEntry.token
      };
    }
  }

  return null;
}

async function getManagedSlotWebhooks(targetChannel, botMember, channelId) {
  const slotNameRegex = new RegExp(`^${escapeRegex(WEBHOOK_NAME_PREFIX)}\\s+(\\d+)$`, "i");
  const fetchedWebhooks = await targetChannel.fetchWebhooks();
  const groupedBySlot = new Map();

  for (const webhook of fetchedWebhooks.values()) {
    if (botMember?.id && webhook.owner?.id && webhook.owner.id !== botMember.id) {
      continue;
    }

    const slotMatch = webhook.name?.match(slotNameRegex);
    if (!slotMatch) {
      continue;
    }

    const slotNumber = Number(slotMatch[1]);
    if (!Number.isInteger(slotNumber) || slotNumber <= 0) {
      continue;
    }

    if (slotNumber > WEBHOOK_SLOT_CYCLE_SIZE) {
      try {
        await webhook.delete("Removing extra slot webhook.");
      } catch (error) {
        // ignore cleanup failures
      }
      clearWebhookAutoDeleteTimer(webhook.id);
      removeWebhookFromChannelCache(channelId, webhook.id);
      continue;
    }

    const token = webhook.token || getCachedWebhookEntryById(channelId, webhook.id)?.token || null;
    const existing = groupedBySlot.get(slotNumber) || [];
    existing.push({
      slot: slotNumber,
      id: webhook.id,
      token,
      webhook,
      createdTimestamp: webhook.createdTimestamp || 0
    });
    groupedBySlot.set(slotNumber, existing);
  }

  const reusableBySlot = new Map();

  for (const [slotNumber, entries] of groupedBySlot.entries()) {
    entries.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const keepEntry = entries.find((entry) => Boolean(entry.token)) || entries[0];

    if (keepEntry?.token) {
      reusableBySlot.set(slotNumber, {
        id: keepEntry.id,
        token: keepEntry.token
      });
      for (const duplicateEntry of entries) {
        if (duplicateEntry.id === keepEntry.id) {
          continue;
        }

        try {
          await duplicateEntry.webhook.delete("Removing duplicate slot webhook.");
        } catch (error) {
          // ignore cleanup failures
        }
        clearWebhookAutoDeleteTimer(duplicateEntry.id);
        removeWebhookFromChannelCache(channelId, duplicateEntry.id);
      }
    } else {
      for (const staleEntry of entries) {
        try {
          await staleEntry.webhook.delete("Removing unusable slot webhook.");
        } catch (error) {
          // ignore cleanup failures
        }
        clearWebhookAutoDeleteTimer(staleEntry.id);
        removeWebhookFromChannelCache(channelId, staleEntry.id);
      }
    }
  }

  return {
    reusableBySlot
  };
}

function saveLogsChannel() {
  writeJson(LOGS_CHANNEL_PATH, logsChannelId);
}

function saveAdminRoles() {
  writeJson(ADMIN_ROLES_PATH, adminRoles);
}

function saveDungeonMasterRoles() {
  writeJson(DUNGEON_MASTER_ROLES_PATH, dungeonMasterRoles);
}

function saveSayChannels() {
  writeJson(SAY_CHANNELS_PATH, sayChannels);
}

function saveRoleplayEnabledByGuild() {
  writeJson(ROLEPLAY_ENABLED_PATH, roleplayEnabledByGuild);
}

function saveMessageLogs() {
  writeJson(MESSAGE_LOGS_PATH, messageLogs);
}

function saveUserProfiles() {
  writeJson(USERS_PROFILES_PATH, userProfiles);
}

function savePoints() {
  writeJson(POINTS_PATH, points);
}

function saveCharacterPoints() {
  writeJson(CHARACTER_POINTS_PATH, characterPoints);
}

function saveUserSlots() {
  writeJson(USER_SLOTS_PATH, userSlots);
}

function saveCharacterUpgrades() {
  writeJson(CHARACTER_UPGRADES_PATH, characterUpgrades);
}

function saveShopRoleItems() {
  writeJson(SHOP_ROLE_ITEMS_PATH, shopRoleItems);
}

function saveTitles() {
  writeJson(TITLES_PATH, titles);
}

function saveUserTitles() {
  writeJson(USER_TITLES_PATH, userTitles);
}

function saveInventoryItems() {
  writeJson(INVENTORY_ITEMS_PATH, inventoryItems);
}

function saveUserInventory() {
  writeJson(USER_INVENTORY_PATH, userInventory);
}

function saveItemRecipes() {
  writeJson(ITEM_RECIPES_PATH, itemRecipes);
}

function saveTradeProposals() {
  writeJson(TRADE_PROPOSALS_PATH, tradeProposals);
}

function parseChannelIdInput(rawValue) {
  if (typeof rawValue !== "string") {
    return null;
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  const mentionMatch = trimmed.match(/^<#(\d+)>$/);
  if (mentionMatch) {
    return mentionMatch[1];
  }

  const idMatch = trimmed.match(/^(\d{17,22})$/);
  if (idMatch) {
    return idMatch[1];
  }

  return null;
}

function getLogsChannelIdForGuild(guildId) {
  if (!logsChannelId) {
    return null;
  }

  if (typeof logsChannelId === "string") {
    return logsChannelId;
  }

  if (typeof logsChannelId === "object" && !Array.isArray(logsChannelId)) {
    return logsChannelId[getScopeId(guildId)] || null;
  }

  return null;
}

function setLogsChannelIdForGuild(guildId, channelId) {
  if (!guildId) {
    return;
  }

  if (!logsChannelId || typeof logsChannelId !== "object" || Array.isArray(logsChannelId)) {
    logsChannelId = {};
  }

  const key = getScopeId(guildId);
  if (channelId) {
    logsChannelId[key] = channelId;
  } else {
    delete logsChannelId[key];
  }

  saveLogsChannel();
}

function getAdminRoleIds(guildId) {
  if (!guildId) {
    return [];
  }

  const key = getScopeId(guildId);
  const value = adminRoles[key];
  return Array.isArray(value) ? value : [];
}

function addAdminRoleId(guildId, roleId) {
  if (!guildId || !roleId) {
    return;
  }

  const key = getScopeId(guildId);
  const existing = new Set(getAdminRoleIds(guildId));
  existing.add(roleId);
  adminRoles[key] = Array.from(existing);
  saveAdminRoles();
}

function removeAdminRoleId(guildId, roleId) {
  if (!guildId || !roleId) {
    return;
  }

  const key = getScopeId(guildId);
  const updated = getAdminRoleIds(guildId).filter((id) => id !== roleId);
  if (updated.length > 0) {
    adminRoles[key] = updated;
  } else {
    delete adminRoles[key];
  }
  saveAdminRoles();
}

function getDungeonMasterRoleIds(guildId) {
  if (!guildId) {
    return [];
  }

  const key = getScopeId(guildId);
  const value = dungeonMasterRoles[key];
  return Array.isArray(value) ? value : [];
}

function addDungeonMasterRoleId(guildId, roleId) {
  if (!guildId || !roleId) {
    return;
  }

  const key = getScopeId(guildId);
  const existing = new Set(getDungeonMasterRoleIds(guildId));
  existing.add(roleId);
  dungeonMasterRoles[key] = Array.from(existing);
  saveDungeonMasterRoles();
}

function removeDungeonMasterRoleId(guildId, roleId) {
  if (!guildId || !roleId) {
    return;
  }

  const key = getScopeId(guildId);
  const updated = getDungeonMasterRoleIds(guildId).filter((id) => id !== roleId);
  if (updated.length > 0) {
    dungeonMasterRoles[key] = updated;
  } else {
    delete dungeonMasterRoles[key];
  }
  saveDungeonMasterRoles();
}

function getSayAllowedChannelIds(guildId) {
  if (!guildId) {
    return [];
  }

  const key = getScopeId(guildId);
  const value = sayChannels[key];
  return Array.isArray(value)
    ? value.filter((channelId) => typeof channelId === "string" && /^\d{17,22}$/.test(channelId))
    : [];
}

function setSayAllowedChannelIds(guildId, channelIds) {
  if (!guildId) {
    return;
  }

  const key = getScopeId(guildId);
  const normalizedIds = Array.from(new Set(
    (Array.isArray(channelIds) ? channelIds : [])
      .map((channelId) => String(channelId || "").trim())
      .filter((channelId) => /^\d{17,22}$/.test(channelId))
  ));

  if (normalizedIds.length > 0) {
    sayChannels[key] = normalizedIds;
  } else {
    delete sayChannels[key];
  }

  saveSayChannels();
}

function isRoleplayEnabledForGuild(guildId) {
  if (!guildId) {
    return true;
  }

  const key = getScopeId(guildId);
  return roleplayEnabledByGuild[key] !== false;
}

function setRoleplayEnabledForGuild(guildId, enabled) {
  if (!guildId) {
    return;
  }

  const key = getScopeId(guildId);
  if (enabled === false) {
    roleplayEnabledByGuild[key] = false;
  } else {
    delete roleplayEnabledByGuild[key];
  }

  saveRoleplayEnabledByGuild();
}

function isSayAllowedInChannel(guildId, channel) {
  if (!guildId || !channel) {
    return false;
  }

  const allowedChannelIds = getSayAllowedChannelIds(guildId);
  if (allowedChannelIds.length === 0) {
    return true;
  }

  const allowedSet = new Set(allowedChannelIds);
  if (allowedSet.has(channel.id)) {
    return true;
  }

  if (channel.isThread?.() && channel.parentId && allowedSet.has(channel.parentId)) {
    return true;
  }

  return false;
}

function hasAdminAccess(interaction) {
  if (!interaction?.inGuild?.() || !interaction.guildId) {
    return false;
  }

  if (interaction.guild?.ownerId && interaction.guild.ownerId === interaction.user?.id) {
    return true;
  }

  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return true;
  }

  const configuredRoleIds = new Set(getAdminRoleIds(interaction.guildId));
  if (configuredRoleIds.size === 0) {
    return false;
  }

  const memberRoleCache = interaction.member?.roles?.cache;
  if (!memberRoleCache) {
    return false;
  }

  for (const roleId of configuredRoleIds) {
    if (memberRoleCache.has(roleId)) {
      return true;
    }
  }

  return false;
}

function hasDungeonMasterAccess(interaction) {
  if (!interaction?.inGuild?.() || !interaction.guildId) {
    return false;
  }

  if (hasAdminAccess(interaction)) {
    return true;
  }

  const memberRoleCache = interaction.member?.roles?.cache;
  if (!memberRoleCache) {
    return false;
  }

  const configuredRoleIds = new Set(getDungeonMasterRoleIds(interaction.guildId));
  for (const roleId of configuredRoleIds) {
    if (memberRoleCache.has(roleId)) {
      return true;
    }
  }

  for (const role of memberRoleCache.values()) {
    const roleName = String(role?.name || "").toLowerCase().trim();
    if (roleName.includes("dungeon master")) {
      return true;
    }
  }

  return false;
}

function canUseRoleplayCommands(interaction) {
  if (!interaction?.inGuild?.() || !interaction.guildId) {
    return false;
  }

  if (isRoleplayEnabledForGuild(interaction.guildId)) {
    return true;
  }

  return hasAdminAccess(interaction);
}

function generateShopRoleItemId() {
  return `roleitem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateTitleId() {
  return `title_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getTitlesForGuild(guildId) {
  if (!guildId) return [];
  return titles.filter((t) => t && t.guildId === guildId);
}

function getTitleById(guildId, titleId) {
  return titles.find((t) => t && t.guildId === guildId && t.id === titleId) || null;
}

function getUserTitleKey(guildId, userId) {
  return `${getScopeId(guildId)}:${userId}`;
}

function getOwnedTitleIds(guildId, userId) {
  return userTitles[getUserTitleKey(guildId, userId)] || [];
}

function hasTitle(guildId, userId, titleId) {
  return getOwnedTitleIds(guildId, userId).includes(titleId);
}

function addTitleToUser(guildId, userId, titleId) {
  if (!guildId || !userId || !titleId) return;
  const key = getUserTitleKey(guildId, userId);
  const existing = new Set(userTitles[key] || []);
  existing.add(titleId);
  userTitles[key] = Array.from(existing);
  saveUserTitles();
}

function getSelectedTitle(guildId, characterId) {
  const character = getCharacterById(characterId, guildId);
  if (!character || !character.selectedTitle) return null;
  return getTitleById(guildId, character.selectedTitle);
}

function getShopRoleItemsForGuild(guildId) {
  if (!guildId) {
    return [];
  }

  return shopRoleItems.filter((item) => item && item.guildId === guildId);
}

function parseRoleIdInput(rawValue) {
  if (typeof rawValue !== "string") {
    return null;
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  const mentionMatch = trimmed.match(/^<@&(\d+)>$/);
  if (mentionMatch) {
    return mentionMatch[1];
  }

  const idMatch = trimmed.match(/^(\d{17,22})$/);
  if (idMatch) {
    return idMatch[1];
  }

  return null;
}

function normalizeRoleItemWallet(rawWallet) {
  const value = String(rawWallet || "").trim().toLowerCase();
  return value === "character" ? "character" : "user";
}

function getRoleItemWalletLabel(rawWallet) {
  return normalizeRoleItemWallet(rawWallet) === "character" ? "Character Wallet" : "User Wallet";
}

function buildRoleShopAddModal(walletType = "user") {
  const normalizedWallet = normalizeRoleItemWallet(walletType);
  const walletLabel = getRoleItemWalletLabel(normalizedWallet);

  return {
    title: `Add Role Shop Item (${walletLabel})`,
    custom_id: `shoprole:add:modal:${normalizedWallet}`,
    components: [
      {
        type: 1,
        components: [
          {
            type: 4,
            custom_id: "name",
            style: 1,
            label: "Item Name",
            placeholder: "Example: VIP Access",
            required: true,
            max_length: 80
          }
        ]
      },
      {
        type: 1,
        components: [
          {
            type: 4,
            custom_id: "description",
            style: 2,
            label: "Description",
            placeholder: "What this item gives",
            required: true,
            max_length: 200
          }
        ]
      },
      {
        type: 1,
        components: [
          {
            type: 4,
            custom_id: "price",
            style: 1,
            label: `Price (${normalizedWallet} points)`,
            placeholder: "Example: 250",
            required: true,
            max_length: 10
          }
        ]
      },
      {
        type: 1,
        components: [
          {
            type: 4,
            custom_id: "role",
            style: 1,
            label: "Role (mention or ID)",
            placeholder: "Example: <@&123456789012345678>",
            required: true,
            max_length: 32
          }
        ]
      }
    ]
  };
}

function buildRoleShopAdminPanel(guildId, statusLine = null) {
  const roleItems = getShopRoleItemsForGuild(guildId);
  const components = [
    { type: 10, content: "## Role Shop Manager" },
    { type: 10, content: "Manage role items shown in `/shop` (User Wallet or Character Wallet)." },
    { type: 14, divider: true, spacing: 1 }
  ];

  if (statusLine) {
    components.push({ type: 10, content: statusLine });
    components.push({ type: 14, divider: true, spacing: 1 });
  }

  components.push({
    type: 1,
    components: [
      {
        type: 2,
        style: 1,
        label: "Add (User Wallet)",
        custom_id: "shoprole:add:user"
      },
      {
        type: 2,
        style: 1,
        label: "Add (Character Wallet)",
        custom_id: "shoprole:add:character"
      },
      {
        type: 2,
        style: 2,
        label: "Refresh",
        custom_id: "shoprole:refresh"
      }
    ]
  });

  components.push({ type: 14, divider: true, spacing: 1 });

  if (roleItems.length === 0) {
    components.push({ type: 10, content: "No role shop items yet." });
  } else {
    for (let index = 0; index < roleItems.length; index += 1) {
      const item = roleItems[index];
      const walletLabel = getRoleItemWalletLabel(item.wallet);
      components.push({
        type: 10,
        content: `**${item.name}**\n${item.description}\nRole: <@&${item.roleId}> • Wallet: ${walletLabel} • Price: **${item.price} ${POINTS_EMOJI_RAW}**`
      });
      components.push({
        type: 1,
        components: [
          {
            type: 2,
            style: 4,
            label: "Delete",
            custom_id: `shoprole:delete:${item.id}`
          }
        ]
      });

      if (index < roleItems.length - 1) {
        components.push({ type: 14, divider: true, spacing: 1 });
      }
    }
  }

  return [{ type: 17, components }];
}

function buildTitleAddModal() {
  return {
    title: "Add Title to Shop",
    custom_id: "titles:add:modal",
    components: [
      {
        type: 1,
        components: [
          {
            type: 4,
            custom_id: "name",
            style: 1,
            label: "Title Name",
            placeholder: "Example: The Mighty",
            required: true,
            max_length: 60
          }
        ]
      },
      {
        type: 1,
        components: [
          {
            type: 4,
            custom_id: "description",
            style: 2,
            label: "Description",
            placeholder: "Shown in the shop",
            required: true,
            max_length: 200
          }
        ]
      },
      {
        type: 1,
        components: [
          {
            type: 4,
            custom_id: "price",
            style: 1,
            label: "Price (user points)",
            placeholder: "Example: 50",
            required: true,
            max_length: 10
          }
        ]
      }
    ]
  };
}

function buildTitleAdminPanel(guildId, statusLine = null) {
  const guildTitles = getTitlesForGuild(guildId);
  const components = [
    { type: 10, content: "## Title Shop Manager" },
    { type: 10, content: "Manage titles shown in `/shop`. Players buy titles with user points and can use them on any of their characters via `/character edit`." },
    { type: 14, divider: true, spacing: 1 }
  ];

  if (statusLine) {
    components.push({ type: 10, content: statusLine });
    components.push({ type: 14, divider: true, spacing: 1 });
  }

  components.push({
    type: 1,
    components: [
      {
        type: 2,
        style: 1,
        label: "Add Title",
        custom_id: "titles:add"
      },
      {
        type: 2,
        style: 2,
        label: "Refresh",
        custom_id: "titles:refresh"
      }
    ]
  });

  components.push({ type: 14, divider: true, spacing: 1 });

  if (guildTitles.length === 0) {
    components.push({ type: 10, content: "No titles created yet." });
  } else {
    for (let index = 0; index < guildTitles.length; index += 1) {
      const item = guildTitles[index];
      components.push({
        type: 10,
        content: `**${item.name}**\n${item.description}\nPrice: **${item.price} ${POINTS_EMOJI_RAW}** (User Wallet)`
      });
      components.push({
        type: 1,
        components: [
          {
            type: 2,
            style: 4,
            label: "Delete",
            custom_id: `titles:delete:${item.id}`
          }
        ]
      });

      if (index < guildTitles.length - 1) {
        components.push({ type: 14, divider: true, spacing: 1 });
      }
    }
  }

  return [{ type: 17, components }];
}

function buildSetupAdminPanel(guildId, statusLine = null) {
  const roleIds = getAdminRoleIds(guildId);
  const dungeonMasterRoleIds = getDungeonMasterRoleIds(guildId);
  const logsChannel = getLogsChannelIdForGuild(guildId);
  const allowedSayChannels = getSayAllowedChannelIds(guildId);
  const roleplayEnabled = isRoleplayEnabledForGuild(guildId);
  const maxAdminRolePreview = 3;
  const maxSayChannelPreview = 3;

  const components = [
    { type: 10, content: "## Setup Manager" },
    { type: 14, divider: true, spacing: 1 }
  ];

  if (statusLine) {
    components.push({ type: 10, content: statusLine });
    components.push({ type: 14, divider: true, spacing: 1 });
  }

  components.push({
    type: 1,
    components: [
      {
        type: 2,
        style: 2,
        label: "Refresh Panel",
        custom_id: "setup:panel:refresh"
      }
    ]
  });
  components.push({ type: 14, divider: true, spacing: 1 });

  components.push({ type: 10, content: "### Admin Roles" });
  if (roleIds.length === 0) {
    components.push({ type: 10, content: `${BULLET_EMOJI_RAW} No admin roles configured.` });
  } else {
    components.push({ type: 10, content: `${BULLET_EMOJI_RAW} Configured: ${roleIds.length} role(s).` });
    const rolePreview = roleIds.slice(0, maxAdminRolePreview).map((roleId) => `<@&${roleId}>`).join(", ");
    components.push({
      type: 10,
      content: `${BULLET_EMOJI_RAW} Preview: ${rolePreview}${roleIds.length > maxAdminRolePreview ? `, and ${roleIds.length - maxAdminRolePreview} more` : ""}`
    });
  }

  components.push({
    type: 1,
    components: [
      {
        type: 2,
        style: 2,
        label: "Add Admin Role",
        custom_id: "setup:panel:add-admin-role"
      },
      {
        type: 2,
        style: 2,
        label: "Remove Admin Role",
        custom_id: "setup:panel:remove-admin-role"
      }
    ]
  });

  components.push({ type: 14, divider: true, spacing: 1 });
  components.push({ type: 10, content: "### Dungeon Master Roles" });
  if (dungeonMasterRoleIds.length === 0) {
    components.push({ type: 10, content: `${BULLET_EMOJI_RAW} No dungeon master roles configured.` });
  } else {
    components.push({ type: 10, content: `${BULLET_EMOJI_RAW} Configured: ${dungeonMasterRoleIds.length} role(s).` });
    const rolePreview = dungeonMasterRoleIds.slice(0, maxAdminRolePreview).map((roleId) => `<@&${roleId}>`).join(", ");
    components.push({
      type: 10,
      content: `${BULLET_EMOJI_RAW} Preview: ${rolePreview}${dungeonMasterRoleIds.length > maxAdminRolePreview ? `, and ${dungeonMasterRoleIds.length - maxAdminRolePreview} more` : ""}`
    });
  }

  components.push({
    type: 1,
    components: [
      {
        type: 2,
        style: 2,
        label: "Add DM Role",
        custom_id: "setup:panel:add-dm-role"
      },
      {
        type: 2,
        style: 2,
        label: "Remove DM Role",
        custom_id: "setup:panel:remove-dm-role"
      }
    ]
  });

  components.push({ type: 14, divider: true, spacing: 1 });
  components.push({ type: 10, content: "### Logs Channel" });
  components.push({
    type: 10,
    content: logsChannel
      ? `${BULLET_EMOJI_RAW} Current: <#${logsChannel}>`
      : `${BULLET_EMOJI_RAW} Current: Not set`
  });
  components.push({
    type: 1,
    components: [
      {
        type: 2,
        style: 2,
        label: "Set Logs Channel",
        custom_id: "setup:panel:set-logs"
      },
      {
        type: 2,
        style: 2,
        label: "Clear Logs Channel",
        custom_id: "setup:panel:clear-logs"
      }
    ]
  });

  components.push({ type: 14, divider: true, spacing: 1 });
  components.push({ type: 10, content: "### /say Allowed Channels" });
  if (allowedSayChannels.length === 0) {
    components.push({ type: 10, content: `${BULLET_EMOJI_RAW} Current: All channels allowed` });
  } else {
    components.push({ type: 10, content: `${BULLET_EMOJI_RAW} Restricted to ${allowedSayChannels.length} channel(s).` });
    const channelPreview = allowedSayChannels.slice(0, maxSayChannelPreview).map((channelId) => `<#${channelId}>`).join(", ");
    components.push({
      type: 10,
      content: `${BULLET_EMOJI_RAW} Preview: ${channelPreview}${allowedSayChannels.length > maxSayChannelPreview ? `, and ${allowedSayChannels.length - maxSayChannelPreview} more` : ""}`
    });
  }
  components.push({
    type: 1,
    components: [
      {
        type: 2,
        style: 2,
        label: "Set /say Channels",
        custom_id: "setup:panel:set-say-channels"
      },
      {
        type: 2,
        style: 2,
        label: "Clear /say Channels",
        custom_id: "setup:panel:clear-say-channels"
      }
    ]
  });

  components.push({ type: 14, divider: true, spacing: 1 });
  components.push({ type: 10, content: "### Roleplay" });
  components.push({
    type: 10,
    content: roleplayEnabled
      ? `${BULLET_EMOJI_RAW} Status: Enabled for everyone`
      : `${BULLET_EMOJI_RAW} Status: Disabled for normal users (admins and bot managers can still use /say commands)`
  });
  components.push({
    type: 1,
    components: [
      {
        type: 2,
        style: 3,
        label: "Enable Roleplay",
        custom_id: "setup:panel:enable-roleplay",
        disabled: roleplayEnabled
      },
      {
        type: 2,
        style: 4,
        label: "Disable Roleplay",
        custom_id: "setup:panel:disable-roleplay",
        disabled: !roleplayEnabled
      }
    ]
  });

  return [{ type: 17, components }];
}

function buildComponentsBox(title, lines = [], extraComponents = []) {
  const components = [];
  const safeLines = (lines || []).filter((line) => typeof line === "string" && line.trim().length > 0);
  if (title) {
    components.push({ type: 10, content: `## ${title}` });
  }
  if (safeLines.length > 0) {
    if (title) {
      components.push({ type: 14, divider: true, spacing: 1 });
    }
    for (const line of safeLines) {
      components.push({ type: 10, content: line });
    }
  }
  if (extraComponents.length > 0) {
    components.push({ type: 14, divider: true, spacing: 1 });
    components.push(...extraComponents);
  }
  return [{ type: 17, components }];
}

function formatRoleplayMessage(content) {
  if (!content || typeof content !== "string") {
    return content;
  }

  if (!content.includes('"')) {
    return content;
  }

  const narrationToItalic = (segment) => {
    return segment
      .split("\n")
      .map((line) => {
        if (line.trim().length === 0) {
          return line;
        }

        return line.replace(/^(\s*)(.*?)(\s*)$/, "$1*$2*$3");
      })
      .join("\n");
  };

  const parts = content.split(/("[^"\n]+")/g);
  if (parts.length <= 1) {
    return content;
  }

  return parts
    .map((part) => {
      if (part.startsWith('"') && part.endsWith('"')) {
        return part;
      }
      return narrationToItalic(part);
    })
    .join("");
}

async function replyComponentsV2(interaction, title, lines, extraComponents, options = {}) {
  const replyOptions = {
    flags: 32768,
    components: buildComponentsBox(title, lines, extraComponents),
    ...options
  };
  delete replyOptions.accentColor;
  const fallbackText = [title, ...(Array.isArray(lines) ? lines : [])]
    .filter((line) => typeof line === "string" && line.trim().length > 0)
    .join("\n");

  const sendFallback = async () => {
    const fallbackPayload = {
      content: fallbackText || "Done.",
      ephemeral: true
    };

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(fallbackPayload);
      return;
    }

    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply({ content: fallbackPayload.content, components: [] });
      return;
    }

    await interaction.followUp(fallbackPayload);
  };

  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(replyOptions);
      return;
    }

    if (interaction.deferred && !interaction.replied) {
      const editPayload = { ...replyOptions };
      delete editPayload.flags;
      delete editPayload.ephemeral;
      await interaction.editReply(editPayload);
      return;
    }

    const followUpPayload = { ...replyOptions };
    if (followUpPayload.flags === 32768 && followUpPayload.ephemeral === undefined) {
      followUpPayload.ephemeral = true;
    }
    delete followUpPayload.flags;
    await interaction.followUp(followUpPayload);
  } catch (error) {
    console.error("replyComponentsV2 failed, using text fallback:", error);
    await sendFallback();
  }
}

async function editComponentsV2(interaction, title, lines, extraComponents, options = {}) {
  const replyOptions = {
    flags: 32768,
    components: buildComponentsBox(title, lines, extraComponents),
    ...options
  };
  delete replyOptions.accentColor;

  try {
    await interaction.editReply(replyOptions);
  } catch (error) {
    console.error("editComponentsV2 failed, using text fallback:", error);
    const fallbackText = [title, ...(Array.isArray(lines) ? lines : [])]
      .filter((line) => typeof line === "string" && line.trim().length > 0)
      .join("\n");

    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply({ content: fallbackText || "Done.", components: [] });
      return;
    }

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: fallbackText || "Done.", ephemeral: true });
      return;
    }

    await interaction.followUp({ content: fallbackText || "Done.", ephemeral: true });
  }
}


async function acknowledgeInteractionSilently(interaction) {
  try {
    if (interaction.replied || interaction.deferred) {
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    await interaction.deleteReply();
  } catch (error) {
    console.error("Silent ack failed:", error);
  }
}

function normalizeReplyPayload(options) {
  if (typeof options === "string") {
    return { content: options };
  }
  if (!options || typeof options !== "object") {
    return {};
  }
  return { ...options };
}

function toEditReplyPayload(options) {
  const payload = normalizeReplyPayload(options);
  delete payload.ephemeral;
  delete payload.flags;
  return payload;
}

function toFollowUpPayload(options) {
  const payload = normalizeReplyPayload(options);
  if (payload.flags === 32768 && payload.ephemeral === undefined) {
    payload.ephemeral = true;
  }
  delete payload.flags;
  return payload;
}

function getFallbackInteractionText(options) {
  const payload = normalizeReplyPayload(options);
  if (typeof payload.content === "string" && payload.content.trim().length > 0) {
    return payload.content;
  }
  return "Done.";
}

function installInteractionAckGuard(interaction, timeoutMs = 2000) {
  if (!interaction?.isChatInputCommand?.()) {
    return () => {};
  }

  const originalReply = interaction.reply.bind(interaction);
  const originalEditReply = interaction.editReply.bind(interaction);
  const originalFollowUp = interaction.followUp.bind(interaction);

  const sendFallbackText = async (options, sourceError) => {
    const fallbackText = getFallbackInteractionText(options);
    console.error("Interaction response failed, falling back to plain text:", sourceError);

    if (interaction.deferred && !interaction.replied) {
      return originalEditReply({ content: fallbackText, components: [] });
    }

    if (interaction.replied) {
      return originalFollowUp({ content: fallbackText, ephemeral: true });
    }

    return originalReply({ content: fallbackText, ephemeral: true });
  };

  interaction.reply = async (options) => {
    try {
      if (interaction.deferred && !interaction.replied) {
        return originalEditReply(toEditReplyPayload(options));
      }

      if (interaction.replied) {
        return originalFollowUp(toFollowUpPayload(options));
      }

      return originalReply(options);
    } catch (error) {
      return sendFallbackText(options, error);
    }
  };

  interaction.editReply = async (options) => {
    try {
      return originalEditReply(options);
    } catch (error) {
      return sendFallbackText(options, error);
    }
  };

  interaction.followUp = async (options) => {
    try {
      return originalFollowUp(options);
    } catch (error) {
      return sendFallbackText(options, error);
    }
  };

  const timer = setTimeout(async () => {
    if (interaction.replied || interaction.deferred) {
      return;
    }

    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (error) {
      console.error("Interaction auto-defer failed:", error);
    }
  }, timeoutMs);

  return () => clearTimeout(timer);
}

function logMessage(userId, characterName, message, channelId, guildId, metadata = null) {
  const safeMetadata = metadata && typeof metadata === "object" ? metadata : {};
  const logEntry = {
    timestamp: new Date().toISOString(),
    userId: userId,
    characterName: characterName,
    message: message,
    channelId: channelId,
    guildId: guildId,
    ...safeMetadata
  };
  messageLogs.push(logEntry);
  // Keep last 1000 messages
  if (messageLogs.length > 1000) {
    messageLogs = messageLogs.slice(-1000);
  }
  saveMessageLogs();
  return logEntry;
}

function isCharacterVisibleInGuild(character, guildId) {
  if (!guildId) {
    return false;
  }
  return character.guildId === guildId;
}

function getCharactersForGuild(guildId) {
  return characters.filter((character) => isCharacterVisibleInGuild(character, guildId));
}

function getCharacterById(characterId, guildId) {
  return getCharactersForGuild(guildId).find((character) => character.id === characterId);
}

function getCharacterDisplayLabel(character) {
  const id = String(character?.id || "").trim();
  const name = String(character?.name || "").trim();

  if (!id) {
    return name || "Unknown character";
  }

  const baseLabel = `${name || id} (${id})`;
  if (baseLabel.length <= 100) {
    return baseLabel;
  }

  return `${baseLabel.slice(0, 97)}...`;
}

function getCharacterAutocompleteChoices(guildId, focusedText = "", characterFilter = null) {
  const normalizedFocused = String(focusedText || "").toLowerCase().trim();

  return getCharactersForGuild(guildId)
    .filter((character) => (typeof characterFilter === "function" ? characterFilter(character) : true))
    .filter((character) => {
      if (!normalizedFocused) {
        return true;
      }

      const characterId = String(character.id || "").toLowerCase();
      const characterName = String(character.name || "").toLowerCase();
      return characterId.includes(normalizedFocused) || characterName.includes(normalizedFocused);
    })
    .slice(0, 25)
    .map((character) => ({
      name: getCharacterDisplayLabel(character),
      value: character.id
    }));
}

function getScopeId(guildId) {
  return guildId || "global";
}

function getAssignmentKey(guildId, characterId) {
  return `${getScopeId(guildId)}:${characterId}`;
}

function getSelectionKey(guildId, userId) {
  return `${getScopeId(guildId)}:${userId}`;
}

function getPointsKey(guildId, userId) {
  return `${getScopeId(guildId)}:${userId}`;
}

function getCharacterPointsKey(guildId, characterId) {
  return `${getScopeId(guildId)}:${characterId}`;
}

function getUserSlotsKey(guildId, userId) {
  return `${getScopeId(guildId)}:${userId}`;
}

function getUserInventoryKey(guildId, userId) {
  return `${getScopeId(guildId)}:${userId}`;
}

function generateInventoryItemId(name) {
  const baseSlug = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `item-${baseSlug || "unnamed"}-${suffix}`;
}

function getInventoryItemsForGuild(guildId) {
  if (!guildId) {
    return [];
  }

  return inventoryItems.filter((item) => item && item.guildId === guildId);
}

function getInventoryItemById(guildId, itemId) {
  if (!guildId || !itemId) {
    return null;
  }

  return getInventoryItemsForGuild(guildId).find((item) => item.id === itemId) || null;
}

function getInventoryItemAutocompleteChoices(guildId, focusedText = "") {
  const normalizedFocused = String(focusedText || "").toLowerCase().trim();

  return getInventoryItemsForGuild(guildId)
    .filter((item) => {
      if (!normalizedFocused) {
        return true;
      }

      const itemId = String(item.id || "").toLowerCase();
      const itemName = String(item.name || "").toLowerCase();
      return itemId.includes(normalizedFocused) || itemName.includes(normalizedFocused);
    })
    .slice(0, 25)
    .map((item) => ({
      name: `${item.name} (${item.id})`.slice(0, 100),
      value: item.id
    }));
}

function getUserInventoryRecord(guildId, userId, createIfMissing = false) {
  const key = getUserInventoryKey(guildId, userId);
  const existing = userInventory[key];

  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing;
  }

  if (!createIfMissing) {
    return {};
  }

  userInventory[key] = {};
  return userInventory[key];
}

function getUserInventoryItemState(guildId, userId, itemId, createIfMissing = false) {
  const record = getUserInventoryRecord(guildId, userId, createIfMissing);
  const existing = record[itemId];

  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    if (!existing.holders || typeof existing.holders !== "object" || Array.isArray(existing.holders)) {
      existing.holders = {};
    }
    const numericQuantity = Number(existing.quantity);
    existing.quantity = Number.isFinite(numericQuantity) && numericQuantity > 0 ? Math.floor(numericQuantity) : 0;
    return existing;
  }

  if (!createIfMissing) {
    return null;
  }

  record[itemId] = {
    quantity: 0,
    holders: {}
  };

  return record[itemId];
}

function getHeldInventoryQuantity(itemState) {
  if (!itemState?.holders || typeof itemState.holders !== "object") {
    return 0;
  }

  let heldTotal = 0;
  for (const value of Object.values(itemState.holders)) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      heldTotal += Math.floor(numericValue);
    }
  }

  return heldTotal;
}

function addInventoryItemToUser(guildId, userId, itemId, quantity = 1, holderCharacterId = null) {
  if (!guildId || !userId || !itemId) {
    return false;
  }

  const safeQuantity = Number.isFinite(quantity) ? Math.floor(quantity) : 0;
  if (safeQuantity <= 0) {
    return false;
  }

  const itemState = getUserInventoryItemState(guildId, userId, itemId, true);
  itemState.quantity += safeQuantity;

  if (holderCharacterId) {
    const currentHeld = Number(itemState.holders[holderCharacterId] || 0);
    itemState.holders[holderCharacterId] = Math.max(0, currentHeld) + safeQuantity;
  }

  saveUserInventory();
  return true;
}

function removeInventoryHoldersForCharacter(guildId, characterId, replacementCharacterId = null) {
  if (!guildId || !characterId) {
    return;
  }

  const scopePrefix = `${getScopeId(guildId)}:`;
  for (const [key, record] of Object.entries(userInventory)) {
    if (!key.startsWith(scopePrefix) || !record || typeof record !== "object" || Array.isArray(record)) {
      continue;
    }

    for (const itemState of Object.values(record)) {
      if (!itemState || typeof itemState !== "object" || !itemState.holders || typeof itemState.holders !== "object") {
        continue;
      }

      const heldQuantity = Number(itemState.holders[characterId] || 0);
      if (!Number.isFinite(heldQuantity) || heldQuantity <= 0) {
        continue;
      }

      if (replacementCharacterId) {
        const existingReplacement = Number(itemState.holders[replacementCharacterId] || 0);
        itemState.holders[replacementCharacterId] = Math.max(0, existingReplacement) + Math.floor(heldQuantity);
      }

      delete itemState.holders[characterId];
    }
  }

  saveUserInventory();
}

function getLegacyEntityKeys(guildId, entityId) {
  const keys = [];
  const scopedKey = `${getScopeId(guildId)}:${entityId}`;
  keys.push(scopedKey);

  if (entityId) {
    keys.push(`global:${entityId}`);
    keys.push(String(entityId));
  }

  return Array.from(new Set(keys));
}

function getNumericValueWithLegacyFallback(store, guildId, entityId, defaultValue = 0) {
  const keys = getLegacyEntityKeys(guildId, entityId);
  for (const key of keys) {
    const value = store[key];
    if (Number.isFinite(value)) {
      return { value, key, keys };
    }
  }

  return { value: defaultValue, key: keys[0], keys };
}

function promoteLegacyNumericValue(store, guildId, entityId, defaultValue = 0) {
  const result = getNumericValueWithLegacyFallback(store, guildId, entityId, defaultValue);
  const primaryKey = result.keys[0];
  if (result.key !== primaryKey) {
    store[primaryKey] = result.value;
    for (const key of result.keys.slice(1)) {
      if (key !== primaryKey) {
        delete store[key];
      }
    }
  }
  return result.value;
}

function getCharacterUpgradeKey(guildId, characterId) {
  return `${getScopeId(guildId)}:${characterId}`;
}

function getAssignedUserId(guildId, characterId) {
  return assignments[getAssignmentKey(guildId, characterId)];
}

function setAssignedUserId(guildId, characterId, userId) {
  assignments[getAssignmentKey(guildId, characterId)] = userId;
}

function clearAssignedUserId(guildId, characterId) {
  delete assignments[getAssignmentKey(guildId, characterId)];
}

function getSelectedCharacterId(guildId, userId) {
  return selections[getSelectionKey(guildId, userId)];
}

function setSelectedCharacterId(guildId, userId, characterId) {
  selections[getSelectionKey(guildId, userId)] = characterId;
}

function clearSelectedCharacterId(guildId, userId) {
  delete selections[getSelectionKey(guildId, userId)];
}

function clearCharacterSelectionsInGuild(guildId, characterId) {
  const scopeId = `${getScopeId(guildId)}:`;
  for (const key of Object.keys(selections)) {
    if (key.startsWith(scopeId) && selections[key] === characterId) {
      delete selections[key];
    }
  }
}

function getOwnedCharacters(userId, guildId) {
  return getCharactersForGuild(guildId).filter((character) => getAssignedUserId(guildId, character.id) === userId);
}

function getOwnedCharacterCount(guildId, userId) {
  return getOwnedCharacters(userId, guildId).length;
}

function getStoredUserCharacterSlotLimit(guildId, userId) {
  const rawSlots = promoteLegacyNumericValue(userSlots, guildId, userId, DEFAULT_CHARACTER_SLOTS);
  return Math.min(MAX_CHARACTER_SLOTS, rawSlots);
}

function getPremiumSlotBonus(guildId, userId) {
  if (!guildId || !userId) {
    return 0;
  }

  return entitlementSlotBonusByScopeUser.get(getUserSlotsKey(guildId, userId)) || 0;
}

function getUserCharacterSlotLimit(guildId, userId) {
  const storedSlots = getStoredUserCharacterSlotLimit(guildId, userId);
  const premiumSlots = getPremiumSlotBonus(guildId, userId);
  return storedSlots + premiumSlots;
}

function getNextSlotCost(currentSlots) {
  const safeSlots = Number.isFinite(currentSlots) && currentSlots > 0 ? currentSlots : DEFAULT_CHARACTER_SLOTS;
  return SLOT_BASE_COST + ((safeSlots - DEFAULT_CHARACTER_SLOTS) * SLOT_COST_STEP);
}

function increaseUserCharacterSlots(guildId, userId, amount = 1) {
  if (!guildId || !userId || !Number.isFinite(amount) || amount <= 0) {
    return;
  }
  const key = getUserSlotsKey(guildId, userId);
  const currentSlots = getStoredUserCharacterSlotLimit(guildId, userId);
  userSlots[key] = Math.min(MAX_CHARACTER_SLOTS, currentSlots + amount);
  upsertUserSlotsInDb(guildId, userId, userSlots[key]);
  saveUserSlots();
}

function isCharacterSlotLocked(guildId, userId, characterId) {
  const slotLimit = getUserCharacterSlotLimit(guildId, userId);
  const ownedChars = getOwnedCharacters(userId, guildId);
  if (ownedChars.length <= slotLimit) {
    return false;
  }
  // Characters beyond the slot limit (sorted by stable array insertion order) are locked.
  const index = ownedChars.findIndex((c) => c.id === characterId);
  return index >= slotLimit;
}

function canAssignCharacterToUser(guildId, userId, characterId) {
  const currentOwnerId = getAssignedUserId(guildId, characterId);
  if (currentOwnerId === userId) {
    return true;
  }

  const usedSlots = getOwnedCharacterCount(guildId, userId);
  const slotLimit = getUserCharacterSlotLimit(guildId, userId);
  return usedSlots < slotLimit;
}

function addPoints(guildId, userId, amount) {
  if (!guildId || !userId || !Number.isFinite(amount) || amount <= 0) {
    return;
  }

  const currentPoints = promoteLegacyNumericValue(points, guildId, userId, 0);
  const key = getPointsKey(guildId, userId);
  points[key] = normalizePoints(currentPoints + amount);
  upsertUserPointsInDb(guildId, userId, points[key]);
  savePoints();
}

function spendPoints(guildId, userId, amount) {
  if (!guildId || !userId || !Number.isFinite(amount) || amount <= 0) {
    return false;
  }

  const currentPoints = normalizePoints(promoteLegacyNumericValue(points, guildId, userId, 0));
  if (currentPoints < amount) {
    return false;
  }

  const key = getPointsKey(guildId, userId);
  points[key] = normalizePoints(currentPoints - amount);
  upsertUserPointsInDb(guildId, userId, points[key]);
  savePoints();
  return true;
}

function shouldAwardPoints(cooldownMap, guildId, userId, cooldownMs) {
  if (!guildId || !userId || !Number.isFinite(cooldownMs) || cooldownMs <= 0) {
    return false;
  }

  const key = getPointsKey(guildId, userId);
  const now = Date.now();
  const lastAwardedAt = cooldownMap.get(key) || 0;

  if (now - lastAwardedAt < cooldownMs) {
    return false;
  }

  cooldownMap.set(key, now);
  return true;
}

function normalizePoints(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }
  return Math.round(numericValue * 100) / 100;
}

function formatPoints(value) {
  const normalized = normalizePoints(value);
  if (Number.isInteger(normalized)) {
    return `${normalized}`;
  }
  return normalized.toFixed(2).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

function formatPointsWithEmoji(value) {
  return `${formatPoints(value)} ${POINTS_EMOJI_RAW}`;
}

function getRandomMessagePointsReward() {
  const raw = MESSAGE_POINTS_MIN + Math.random() * (MESSAGE_POINTS_MAX - MESSAGE_POINTS_MIN);
  return normalizePoints(raw);
}

function getUserPoints(guildId, userId) {
  return normalizePoints(promoteLegacyNumericValue(points, guildId, userId, 0));
}

function addCharacterPoints(guildId, characterId, amount) {
  if (!guildId || !characterId || !Number.isFinite(amount) || amount <= 0) {
    return;
  }

  const currentPoints = promoteLegacyNumericValue(characterPoints, guildId, characterId, 0);
  const key = getCharacterPointsKey(guildId, characterId);
  characterPoints[key] = normalizePoints(currentPoints + amount);
  upsertCharacterPointsInDb(guildId, characterId, characterPoints[key]);
  saveCharacterPoints();
}

function getCharacterPoints(guildId, characterId) {
  return normalizePoints(promoteLegacyNumericValue(characterPoints, guildId, characterId, 0));
}

function spendCharacterPoints(guildId, characterId, amount) {
  if (!guildId || !characterId || !Number.isFinite(amount) || amount <= 0) {
    return false;
  }

  const currentPoints = normalizePoints(promoteLegacyNumericValue(characterPoints, guildId, characterId, 0));
  if (currentPoints < amount) {
    return false;
  }

  const key = getCharacterPointsKey(guildId, characterId);
  characterPoints[key] = normalizePoints(currentPoints - amount);
  upsertCharacterPointsInDb(guildId, characterId, characterPoints[key]);
  saveCharacterPoints();
  return true;
}

function getCharacterUpgradeIds(guildId, characterId) {
  return characterUpgrades[getCharacterUpgradeKey(guildId, characterId)] || [];
}

function hasCharacterUpgrade(guildId, characterId, upgradeId) {
  return getCharacterUpgradeIds(guildId, characterId).includes(upgradeId);
}

function addCharacterUpgrade(guildId, characterId, upgradeId) {
  if (!guildId || !characterId || !upgradeId) {
    return;
  }

  const key = getCharacterUpgradeKey(guildId, characterId);
  const existing = new Set(characterUpgrades[key] || []);
  existing.add(upgradeId);
  characterUpgrades[key] = Array.from(existing);
  addCharacterUpgradeInDb(guildId, characterId, upgradeId);
  saveCharacterUpgrades();
}

function getCharacterPointsCooldownMs(guildId, characterId) {
  if (hasCharacterUpgrade(guildId, characterId, "cooldown_boost")) {
    return Math.max(1000, Math.floor(CHARACTER_POINTS_COOLDOWN_MS / 2));
  }
  return CHARACTER_POINTS_COOLDOWN_MS;
}

function getCharacterPointsReward(guildId, characterId) {
  if (hasCharacterUpgrade(guildId, characterId, "character_wallet_boost")) {
    return POINTS_PER_CHARACTER_MESSAGE + 1;
  }
  return POINTS_PER_CHARACTER_MESSAGE;
}

function shouldAwardCharacterPoints(guildId, userId, characterId, cooldownMs) {
  if (!guildId || !userId || !characterId || !Number.isFinite(cooldownMs) || cooldownMs <= 0) {
    return false;
  }

  const key = `${getPointsKey(guildId, userId)}:${characterId}`;
  const now = Date.now();
  const lastAwardedAt = characterPointsCooldowns.get(key) || 0;

  if (now - lastAwardedAt < cooldownMs) {
    return false;
  }

  characterPointsCooldowns.set(key, now);
  return true;
}

function clearCharacterPoints(guildId, characterId) {
  const key = getCharacterPointsKey(guildId, characterId);
  delete characterPoints[key];
  clearCharacterPointsInDb(guildId, characterId);
}

function clearCharacterUpgrades(guildId, characterId) {
  const key = getCharacterUpgradeKey(guildId, characterId);
  delete characterUpgrades[key];
  clearCharacterUpgradesInDb(guildId, characterId);
}

function renameCharacterIdInGuild(guildId, oldCharacterId, newCharacterId) {
  if (!guildId || !oldCharacterId || !newCharacterId || oldCharacterId === newCharacterId) {
    return false;
  }

  const character = getCharacterById(oldCharacterId, guildId);
  if (!character) {
    return false;
  }

  const oldAssignmentKey = getAssignmentKey(guildId, oldCharacterId);
  const newAssignmentKey = getAssignmentKey(guildId, newCharacterId);
  if (Object.prototype.hasOwnProperty.call(assignments, oldAssignmentKey)) {
    assignments[newAssignmentKey] = assignments[oldAssignmentKey];
    delete assignments[oldAssignmentKey];
  }

  const scopePrefix = `${getScopeId(guildId)}:`;
  for (const key of Object.keys(selections)) {
    if (key.startsWith(scopePrefix) && selections[key] === oldCharacterId) {
      selections[key] = newCharacterId;
    }
  }

  const oldPointsKey = getCharacterPointsKey(guildId, oldCharacterId);
  const newPointsKey = getCharacterPointsKey(guildId, newCharacterId);
  const mergedCharacterPoints = normalizePoints((characterPoints[newPointsKey] || 0) + (characterPoints[oldPointsKey] || 0));

  if (mergedCharacterPoints > 0) {
    characterPoints[newPointsKey] = mergedCharacterPoints;
    upsertCharacterPointsInDb(guildId, newCharacterId, mergedCharacterPoints);
  } else {
    delete characterPoints[newPointsKey];
    clearCharacterPointsInDb(guildId, newCharacterId);
  }

  delete characterPoints[oldPointsKey];
  clearCharacterPointsInDb(guildId, oldCharacterId);

  const oldUpgradesKey = getCharacterUpgradeKey(guildId, oldCharacterId);
  const newUpgradesKey = getCharacterUpgradeKey(guildId, newCharacterId);
  const mergedUpgrades = Array.from(new Set([
    ...(characterUpgrades[newUpgradesKey] || []),
    ...(characterUpgrades[oldUpgradesKey] || [])
  ]));

  if (mergedUpgrades.length > 0) {
    characterUpgrades[newUpgradesKey] = mergedUpgrades;
  } else {
    delete characterUpgrades[newUpgradesKey];
  }

  delete characterUpgrades[oldUpgradesKey];
  clearCharacterUpgradesInDb(guildId, oldCharacterId);
  clearCharacterUpgradesInDb(guildId, newCharacterId);
  for (const upgradeId of mergedUpgrades) {
    addCharacterUpgradeInDb(guildId, newCharacterId, upgradeId);
  }

  for (const channelId of Object.keys(webhooks)) {
    if (!webhooks[channelId] || typeof webhooks[channelId] !== "object") {
      continue;
    }

    if (webhooks[channelId][oldCharacterId]) {
      if (!webhooks[channelId][newCharacterId]) {
        webhooks[channelId][newCharacterId] = webhooks[channelId][oldCharacterId];
      }
      delete webhooks[channelId][oldCharacterId];
    }
  }

  for (const [cooldownKey, value] of characterPointsCooldowns.entries()) {
    if (cooldownKey.startsWith(scopePrefix) && cooldownKey.endsWith(`:${oldCharacterId}`)) {
      const newCooldownKey = `${cooldownKey.slice(0, -oldCharacterId.length)}${newCharacterId}`;
      characterPointsCooldowns.set(newCooldownKey, value);
      characterPointsCooldowns.delete(cooldownKey);
    }
  }

  removeInventoryHoldersForCharacter(guildId, oldCharacterId, newCharacterId);

  character.id = newCharacterId;

  writeJson(CHARACTERS_PATH, characters);
  saveAssignments();
  saveSelections();
  saveCharacterPoints();
  saveCharacterUpgrades();
  saveWebhooks();
  return true;
}

function getTopUserPoints(guildId, limit = 10) {
  const scopePrefix = `${getScopeId(guildId)}:`;
  return Object.entries(points)
    .filter(([key, value]) => key.startsWith(scopePrefix) && Number.isFinite(value) && value > 0)
    .map(([key, value]) => ({
      userId: key.slice(scopePrefix.length),
      points: value
    }))
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
}

function getTopCharacterPoints(guildId, limit = 10) {
  const scopePrefix = `${getScopeId(guildId)}:`;
  return Object.entries(characterPoints)
    .filter(([key, value]) => key.startsWith(scopePrefix) && Number.isFinite(value) && value > 0)
    .map(([key, value]) => ({
      characterId: key.slice(scopePrefix.length),
      points: value
    }))
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
}

function getShopItems(guildId, userId) {
  const baseSlotLimit = getStoredUserCharacterSlotLimit(guildId, userId);
  const nextSlotCost = getNextSlotCost(baseSlotLimit);
  const canBuySlot = baseSlotLimit < MAX_CHARACTER_SLOTS;

  const items = [
    {
      id: "slot",
      name: "Character Slot +1",
      description: canBuySlot
        ? "Unlock one additional character slot for this server."
        : `Maximum base slots reached (${MAX_CHARACTER_SLOTS}/${MAX_CHARACTER_SLOTS}).`,
      wallet: "User Wallet",
      cost: canBuySlot ? nextSlotCost : "MAX",
      available: canBuySlot,
      emoji: SHOP_ITEM_EMOJI_RAW
    }
  ];

  for (const upgrade of Object.values(CHARACTER_UPGRADE_DEFINITIONS)) {
    items.push({
      id: `upgrade:${upgrade.id}`,
      name: upgrade.name,
      description: upgrade.description,
      wallet: "Character Wallet",
      cost: upgrade.cost,
      emoji: SHOP_ITEM_EMOJI_RAW
    });
  }

  const guildTitles = getTitlesForGuild(guildId);
  for (const titleItem of guildTitles) {
    items.push({
      id: `title:${titleItem.id}`,
      name: `Title: ${titleItem.name}`,
      description: titleItem.description,
      wallet: "User Wallet",
      cost: titleItem.price,
      emoji: SHOP_ITEM_EMOJI_RAW
    });
  }

  const roleItems = getShopRoleItemsForGuild(guildId);
  for (const roleItem of roleItems) {
    const walletType = normalizeRoleItemWallet(roleItem.wallet);
    items.push({
      id: `role:${roleItem.id}`,
      name: roleItem.name,
      description: roleItem.description,
      wallet: getRoleItemWalletLabel(walletType),
      cost: roleItem.price,
      emoji: SHOP_ITEM_EMOJI_RAW
    });
  }

  const guildInventoryItems = getInventoryItemsForGuild(guildId)
    .filter((item) => item.inShop === true)
    .sort((first, second) => {
      // Sort by category, then by rarity, then by name
      const categoryA = first.category || "other";
      const categoryB = second.category || "other";
      const rarityOrderA = ITEM_RARITY_TIERS[first.rarity || "common"]?.order || 0;
      const rarityOrderB = ITEM_RARITY_TIERS[second.rarity || "common"]?.order || 0;
      
      if (categoryA !== categoryB) {
        return categoryA.localeCompare(categoryB);
      }
      if (rarityOrderA !== rarityOrderB) {
        return rarityOrderB - rarityOrderA; // Higher rarity first
      }
      return String(first.name || "").localeCompare(String(second.name || ""));
    });

  for (const inventoryItem of guildInventoryItems) {
    const walletType = normalizeRoleItemWallet(inventoryItem.wallet);
    const temporarySuffix = inventoryItem.isTemporary ? " (Temporary)" : "";
    const rarity = getItemRarityDisplay(inventoryItem);
    const category = getItemCategoryName(inventoryItem);
    const weight = getItemWeight(inventoryItem);
    
    let description = `**${category}** • ${rarity}`;
    if (weight > 0) {
      description += ` • ⚖️ ${weight}`;
    }
    description += `\n${inventoryItem.description}`;
    
    items.push({
      id: `inv:${inventoryItem.id}`,
      name: `${inventoryItem.name}${temporarySuffix}`,
      description: description,
      wallet: getRoleItemWalletLabel(walletType),
      cost: inventoryItem.price,
      emoji: SHOP_ITEM_EMOJI_RAW
    });
  }

  return items;
}

function getInventorySummaryLines(guildId, userId) {
  const record = getUserInventoryRecord(guildId, userId, false);
  const entries = [];

  for (const [itemId, state] of Object.entries(record)) {
    if (!state || typeof state !== "object") {
      continue;
    }

    const totalQuantity = Number(state.quantity || 0);
    if (!Number.isFinite(totalQuantity) || totalQuantity <= 0) {
      continue;
    }

    const item = getInventoryItemById(guildId, itemId);
    const itemName = item?.name || `Unknown Item (${itemId})`;
    const heldParts = [];

    for (const [characterId, rawQty] of Object.entries(state.holders || {})) {
      const heldQty = Number(rawQty);
      if (!Number.isFinite(heldQty) || heldQty <= 0) {
        continue;
      }

      const character = getCharacterById(characterId, guildId);
      const characterName = character?.name || characterId;
      heldParts.push(`${characterName} x${Math.floor(heldQty)}`);
    }

    const heldTotal = getHeldInventoryQuantity(state);
    const safeTotal = Math.floor(totalQuantity);
    const unheld = Math.max(0, safeTotal - heldTotal);
    const holderSummary = heldParts.length > 0
      ? heldParts.join(", ")
      : "none";

    entries.push({
      itemName,
      line: `${BULLET_EMOJI_RAW} **${itemName}** x${safeTotal}\nHeld by: ${holderSummary}${unheld > 0 ? ` | Unheld: ${unheld}` : ""}`
    });
  }

  return entries
    .sort((first, second) => first.itemName.localeCompare(second.itemName))
    .map((entry) => entry.line);
}

// ===== Advanced Inventory Features =====

function getItemRarityDisplay(item) {
  if (!item) return "Unknown";
  const rarity = item.rarity || "common";
  return ITEM_RARITY_TIERS[rarity]?.name || "Common";
}

function getItemCategoryName(item) {
  if (!item) return "Other";
  const category = item.category || "other";
  return ITEM_CATEGORIES[category]?.name || "Other";
}

function getItemCategoryEmoji(item) {
  if (!item) return ITEM_CATEGORIES.other.emoji;
  const category = item.category || "other";
  return ITEM_CATEGORIES[category]?.emoji || "📦";
}

function getItemWeight(item) {
  if (!item) return 0;
  const weight = Number(item.weight || 0);
  return Number.isFinite(weight) && weight > 0 ? weight : 0;
}

function getTotalInventoryWeight(guildId, userId) {
  const record = getUserInventoryRecord(guildId, userId, false);
  let totalWeight = 0;

  for (const [itemId, state] of Object.entries(record)) {
    if (!state || typeof state !== "object") continue;
    
    const quantity = Number(state.quantity || 0);
    if (quantity <= 0) continue;
    
    const item = getInventoryItemById(guildId, itemId);
    const itemWeight = getItemWeight(item);
    totalWeight += itemWeight * quantity;
  }

  return Math.floor(totalWeight);
}

function canAddToInventoryByWeight(guildId, userId, quantity, item) {
  const currentWeight = getTotalInventoryWeight(guildId, userId);
  const itemWeight = getItemWeight(item);
  const addedWeight = itemWeight * (quantity || 1);
  
  return (currentWeight + addedWeight) <= MAX_INVENTORY_WEIGHT;
}

function getInventoryWeightPercentage(guildId, userId) {
  const current = getTotalInventoryWeight(guildId, userId);
  return Math.round((current / MAX_INVENTORY_WEIGHT) * 100);
}

function isItemOnCooldown(userId, itemId) {
  const key = `${userId}:${itemId}`;
  const lastUse = itemCooldowns.get(key);
  if (!lastUse) return false;
  
  const now = Date.now();
  return (now - lastUse) < 60000; // 1 minute cooldown by default
}

function getItemCooldownRemaining(userId, itemId) {
  const key = `${userId}:${itemId}`;
  const lastUse = itemCooldowns.get(key);
  if (!lastUse) return 0;
  
  const remaining = 60000 - (Date.now() - lastUse);
  return Math.max(0, remaining);
}

function setItemCooldown(userId, itemId) {
  const key = `${userId}:${itemId}`;
  itemCooldowns.set(key, Date.now());
  
  // Auto-cleanup after cooldown expires
  setTimeout(() => {
    itemCooldowns.delete(key);
  }, 60000);
}

function useInventoryItem(guildId, userId, itemId, quantity = 1) {
  const item = getInventoryItemById(guildId, itemId);
  if (!item) return { success: false, reason: "Item not found" };

  const itemState = getUserInventoryItemState(guildId, userId, itemId, false);
  if (!itemState || itemState.quantity < quantity) {
    return { success: false, reason: "Insufficient quantity" };
  }

  // Deduct from inventory
  itemState.quantity -= quantity;
  if (itemState.quantity <= 0) {
    const record = getUserInventoryRecord(guildId, userId, false);
    delete record[itemId];
  }

  saveUserInventory();
  setItemCooldown(userId, itemId);
  
  return { success: true, item };
}

function giftInventoryItem(guildId, fromUserId, toUserId, itemId, quantity = 1) {
  if (fromUserId === toUserId) {
    return { success: false, reason: "Cannot gift to yourself" };
  }

  // Remove from sender
  const fromState = getUserInventoryItemState(guildId, fromUserId, itemId, false);
  if (!fromState || fromState.quantity < quantity) {
    return { success: false, reason: "Insufficient quantity" };
  }

  fromState.quantity -= quantity;
  if (fromState.quantity <= 0) {
    const fromRecord = getUserInventoryRecord(guildId, fromUserId, false);
    delete fromRecord[itemId];
  }

  // Add to recipient
  addInventoryItemToUser(guildId, toUserId, itemId, quantity);
  
  return { success: true };
}

function createTradeProposal(guildId, initiatorId, targetId, offeredItemIds, requestedItemIds) {
  const proposal = {
    id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    guildId,
    initiatorId,
    targetId,
    offeredItems: offeredItemIds,
    requestedItems: requestedItemIds,
    status: "pending", // pending, accepted, rejected, completed
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString() // 1 hour expiry
  };

  tradeProposals.push(proposal);
  saveTradeProposals();
  
  return proposal;
}

function getTradeProposal(proposalId) {
  return tradeProposals.find(p => p.id === proposalId);
}

function getPendingTradesForUser(guildId, userId) {
  return tradeProposals.filter(p => 
    p.guildId === guildId && 
    p.status === "pending" && 
    p.targetId === userId
  );
}

function acceptTradeProposal(proposalId) {
  const proposal = getTradeProposal(proposalId);
  if (!proposal || proposal.status !== "pending") {
    return { success: false, reason: "Invalid or expired proposal" };
  }

  const { guildId, initiatorId, targetId, offeredItems, requestedItems } = proposal;

  // Validate items still available
  for (const itemId of offeredItems) {
    const state = getUserInventoryItemState(guildId, initiatorId, itemId, false);
    if (!state || state.quantity < 1) {
      return { success: false, reason: "Initiator no longer has offered items" };
    }
  }

  for (const itemId of requestedItems) {
    const state = getUserInventoryItemState(guildId, targetId, itemId, false);
    if (!state || state.quantity < 1) {
      return { success: false, reason: "You no longer have requested items" };
    }
  }

  // Execute trade
  for (const itemId of offeredItems) {
    const fromState = getUserInventoryItemState(guildId, initiatorId, itemId, false);
    if (fromState) {
      fromState.quantity--;
      if (fromState.quantity <= 0) {
        const record = getUserInventoryRecord(guildId, initiatorId, false);
        delete record[itemId];
      }
      addInventoryItemToUser(guildId, targetId, itemId, 1);
    }
  }

  for (const itemId of requestedItems) {
    const fromState = getUserInventoryItemState(guildId, targetId, itemId, false);
    if (fromState) {
      fromState.quantity--;
      if (fromState.quantity <= 0) {
        const record = getUserInventoryRecord(guildId, targetId, false);
        delete record[itemId];
      }
      addInventoryItemToUser(guildId, initiatorId, itemId, 1);
    }
  }

  proposal.status = "completed";
  saveTradeProposals();
  saveUserInventory();
  
  return { success: true };
}

function getCurrencyEmojiForButton() {
  const shopButtonEmojiRaw = POINTS_EMOJI_RAW;
  const customEmojiMatch = shopButtonEmojiRaw.match(/^<(a?):([a-zA-Z0-9_]+):(\d+)>$/);
  if (customEmojiMatch) {
    return {
      id: customEmojiMatch[3],
      name: customEmojiMatch[2],
      animated: customEmojiMatch[1] === "a"
    };
  }

  return { name: shopButtonEmojiRaw || CURRENCY_EMOJI_RAW || "🍬" };
}

function buildDiscordPremiumButtonRow(skuId) {
  const normalizedSkuId = String(skuId || "").trim();
  if (!normalizedSkuId) {
    return [];
  }

  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 6,
          sku_id: normalizedSkuId
        }
      ]
    }
  ];
}

function buildShopView(guildId, userId, page = 0, statusLine = null) {
  const items = getShopItems(guildId, userId);
  const totalPages = Math.max(1, Math.ceil(items.length / SHOP_PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const startIndex = safePage * SHOP_PAGE_SIZE;
  const pageItems = items.slice(startIndex, startIndex + SHOP_PAGE_SIZE);

  const selectedCharacterId = getSelectedCharacterId(guildId, userId);
  const selectedCharacter = selectedCharacterId
    ? getCharacterById(selectedCharacterId, guildId)
    : null;
  const hasValidPickedCharacter = Boolean(
    selectedCharacter && getAssignedUserId(guildId, selectedCharacterId) === userId
  );

  const selectedCharacterLine = hasValidPickedCharacter
    ? `**Picked Character:** ${selectedCharacter.name} (\`${selectedCharacterId}\`)`
    : "**Picked Character:** None (use `/character pick`)";

  const userWalletPoints = getUserPoints(guildId, userId);
  const pickedCharacterPoints = hasValidPickedCharacter
    ? getCharacterPoints(guildId, selectedCharacterId)
    : null;

  const components = [
    { type: 10, content: "## Store" },
    { type: 10, content: selectedCharacterLine },
    {
      type: 10,
      content: "Click a price button to buy instantly. Slot purchases use your user wallet. **Upgrade purchases apply to the picked character shown above.**"
    },
    { type: 14, divider: true, spacing: 1 }
  ];

  if (statusLine) {
    components.push({ type: 10, content: statusLine });
    components.push({ type: 14, divider: true, spacing: 1 });
  }

  pageItems.forEach((item, index) => {
    components.push({
      type: 9,
      components: [
        {
          type: 10,
          content: `${item.emoji} **${item.name}**\n${item.description.split('\n').map(line => `-# ${line}`).join('\n')}`
        }
      ],
      accessory: {
        type: 2,
        style: 3,
        custom_id: `shop:buy:${item.id}:${safePage}`,
        label: `${item.cost}`,
        emoji: typeof item.cost === "number" ? getCurrencyEmojiForButton() : undefined,
        disabled: item.available === false
      }
    });

    if (index < pageItems.length - 1) {
      components.push({ type: 14, divider: true, spacing: 1 });
    }
  });

  components.push({ type: 14, divider: true, spacing: 1 });
  components.push({
    type: 10,
    content: hasValidPickedCharacter
      ? `**Wallets:** User ${Math.round(userWalletPoints)} ${POINTS_EMOJI_RAW} • Character ${Math.round(pickedCharacterPoints)} ${POINTS_EMOJI_RAW}`
      : `**Wallets:** User ${Math.round(userWalletPoints)} ${POINTS_EMOJI_RAW} • Character N/A`
  });
  components.push({ type: 14, divider: true, spacing: 1 });
  components.push({ type: 10, content: `Page ${safePage + 1}/${totalPages}` });

  if (totalPages > 1) {
    components.push({
      type: 1,
      components: [
        {
          type: 2,
          style: 2,
          custom_id: `shop:page:${safePage - 1}`,
          label: "◀ Prev",
          disabled: safePage <= 0
        },
        {
          type: 2,
          style: 2,
          custom_id: `shop:page:${safePage + 1}`,
          label: "Next ▶",
          disabled: safePage >= totalPages - 1
        }
      ]
    });
  }

  return {
    components: [{ type: 17, components }],
    page: safePage,
    totalPages
  };
}

function buildHelpView(guildId, userId, isAdmin, page = 0) {
  const shopItems = guildId && userId
    ? getShopItems(guildId, userId)
    : [
        {
          name: "Character Slot +1",
          wallet: "User Wallet",
          cost: SLOT_BASE_COST,
          emoji: SHOP_ITEM_EMOJI_RAW
        },
        ...Object.values(CHARACTER_UPGRADE_DEFINITIONS).map((upgrade) => ({
          name: upgrade.name,
          wallet: "Character Wallet",
          cost: upgrade.cost,
          emoji: SHOP_ITEM_EMOJI_RAW
        }))
      ];

  const pages = [
    {
      title: "Help",
      sections: [
        {
          heading: "Characters",
          lines: [
            `${BULLET_EMOJI_RAW} \`/character pick\` — Select your active character`,
            `${BULLET_EMOJI_RAW} \`/character list\` — List your assigned characters`,
            `${BULLET_EMOJI_RAW} \`/character profile\` — View character details`,
            `${BULLET_EMOJI_RAW} \`/lookup\` — Find who currently owns a character`,
            `${BULLET_EMOJI_RAW} \`/character edit\` — Edit your character info`,
            `${BULLET_EMOJI_RAW} \`/character create-and-assign\` — Create and auto-assign a character`
          ]
        },
        {
          heading: "Roleplay",
          lines: [
            `${BULLET_EMOJI_RAW} \`/say\` — Speak as your selected character (supports image + reply)`,
            `${BULLET_EMOJI_RAW} \`/say-edit\` — Edit a sent /say message by message ID`,
            `${BULLET_EMOJI_RAW} \`/say-delete\` — Delete a sent /say message (within 15 minutes)`
          ]
        },
        {
          heading: "Profile",
          lines: [
            `${BULLET_EMOJI_RAW} \`/user profile\` — View a user profile`,
            `${BULLET_EMOJI_RAW} \`/user edit\` — Edit your own profile`
          ]
        },
        {
          heading: "Economy",
          lines: [
            `${BULLET_EMOJI_RAW} \`/wallet\` — View your wallets`,
            `${BULLET_EMOJI_RAW} \`/inventory\` — View your inventory with weight`,
            `${BULLET_EMOJI_RAW} \`/use-item\` — Use/consume an item from your inventory`,
            `${BULLET_EMOJI_RAW} \`/gift-item\` — Gift items to other users`,
            `${BULLET_EMOJI_RAW} \`/trade propose\` — Propose a trade to another user`,
            `${BULLET_EMOJI_RAW} \`/trade list\` — View pending trade proposals`,
            `${BULLET_EMOJI_RAW} \`/trade accept\` — Accept a trade proposal`,
            `${BULLET_EMOJI_RAW} \`/points\` — View your points`,
            `${BULLET_EMOJI_RAW} \`/leaderboard\` — View rankings`,
            `${BULLET_EMOJI_RAW} \`/shop\` — Buy slots, upgrades, and items`
          ]
        },
        {
          heading: "Info",
          lines: [
            `${BULLET_EMOJI_RAW} \`/tutorial\` — Step-by-step getting started guide`,
            `${BULLET_EMOJI_RAW} \`/premium\` — Premium purchase instructions`
          ]
        }
      ]
    },
    {
      title: "Help • Shop",
      lines: [
        "Use `/shop` to buy items directly with buttons.",
        "Slot purchases use your **User Wallet**.",
        "Upgrade purchases use your **selected character wallet**.",
        "",
        "**Current Shop Items**",
        ...shopItems.map(
          (item) => `${BULLET_EMOJI_RAW} ${item.emoji} **${item.name}** — ${item.cost} ${POINTS_EMOJI_RAW} (${item.wallet})`
        )
      ]
    }
  ];

  if (isAdmin) {
    pages.push({
      title: "Help • Admin",
      sections: [
        {
          heading: "Characters",
          lines: [
            `${BULLET_EMOJI_RAW} \`/character assign\` — Assign character ownership`,
            `${BULLET_EMOJI_RAW} \`/character create\` / \`/character delete\` — Manage characters`,
            `${BULLET_EMOJI_RAW} \`/character change-id\` — Change character IDs`,
            `${BULLET_EMOJI_RAW} \`/character clear-webhooks\` — Reset webhook cache`
          ]
        },
        {
          heading: "Users & Setup",
          lines: [
            `${BULLET_EMOJI_RAW} \`/admin user edit\` — Manage user profile + characters`,
            `${BULLET_EMOJI_RAW} \`/setup panel\` — Manage admin roles, logs channel, and /say channels`,
            `${BULLET_EMOJI_RAW} \`/setup add-points\` — Add user/character wallet points`,
            `${BULLET_EMOJI_RAW} \`/setup create-item\` — Create inventory items`,
            `${BULLET_EMOJI_RAW} \`/setup give-item\` — Give inventory items to users`,
            `${BULLET_EMOJI_RAW} \`/setup set-item-shop\` — Add/remove inventory items from /shop`,
            `${BULLET_EMOJI_RAW} \`/setup add-role-shop-item\` — Add role item to shop`,
            `${BULLET_EMOJI_RAW} \`/setup manage-titles\` — Manage purchasable titles`,
            `${BULLET_EMOJI_RAW} \`/bot-say\` — Send a message as the bot`
          ]
        }
      ]
    });
  }

  const totalPages = pages.length;
  const safePage = Number.isFinite(page) ? Math.min(Math.max(page, 0), totalPages - 1) : 0;
  const currentPage = pages[safePage];

  const components = [{ type: 10, content: `## ${currentPage.title}` }];

  if (currentPage.sections) {
    for (const section of currentPage.sections) {
      components.push({ type: 14, divider: true, spacing: 1 });
      components.push({ type: 10, content: `**${section.heading}**` });
      for (const line of section.lines) {
        components.push({ type: 10, content: line });
      }
    }
  } else {
    const contentLines = currentPage.lines.filter((line) => typeof line === "string" && line.trim().length > 0);
    if (contentLines.length > 0) {
      components.push({ type: 14, divider: true, spacing: 1 });
      for (const line of contentLines) {
        components.push({ type: 10, content: line });
      }
    }
  }

  components.push({ type: 14, divider: true, spacing: 1 });
  components.push({ type: 10, content: `Page ${safePage + 1}/${totalPages}` });
  components.push({
    type: 1,
    components: [
      {
        type: 2,
        style: 2,
        custom_id: `help:page:${safePage - 1}`,
        label: "◀ Prev",
        disabled: safePage <= 0
      },
      {
        type: 2,
        style: 2,
        custom_id: `help:page:${safePage + 1}`,
        label: "Next ▶",
        disabled: safePage >= totalPages - 1
      }
    ]
  });

  return {
    components: [{ type: 17, components }],
    page: safePage,
    totalPages
  };
}

function buildTutorialView(guildId, userId, page = 0) {
  const selectedCharacterId = guildId && userId ? getSelectedCharacterId(guildId, userId) : null;
  const selectedCharacter = selectedCharacterId && guildId
    ? getCharacterById(selectedCharacterId, guildId)
    : null;

  const selectedCharacterLine = selectedCharacter
    ? `Current picked character: **${selectedCharacter.name}** (\`${selectedCharacterId}\`)`
    : "Current picked character: **None** (use `/character pick`)";

  const pages = [
    {
      title: "Tutorial • Step 1",
      lines: [
        "**Create your first character**",
        `${BULLET_EMOJI_RAW} Run \`/character create-and-assign\` and fill at least **id** + **name**.`,
        `${BULLET_EMOJI_RAW} This creates the character and assigns it to you immediately.`,
        `${BULLET_EMOJI_RAW} Use \`/character list\` to confirm it exists and is assigned.`,
        `${BULLET_EMOJI_RAW} Use \`/lookup character:<id>\` anytime to see who owns a character.`
      ]
    },
    {
      title: "Tutorial • Step 2",
      lines: [
        "**Pick the character you want to speak as**",
        `${BULLET_EMOJI_RAW} Run \`/character pick character:<id>\`.`,
        `${BULLET_EMOJI_RAW} ${selectedCharacterLine}`,
        `${BULLET_EMOJI_RAW} You can switch anytime by running \`/character pick\` again.`,
        `${BULLET_EMOJI_RAW} If you are not sure who owns a character, run \`/lookup\`.`
      ]
    },
    {
      title: "Tutorial • Step 3",
      lines: [
        "**Start roleplaying with /say**",
        `${BULLET_EMOJI_RAW} Run \`/say message:<text>\` to send as your picked character.`,
        `${BULLET_EMOJI_RAW} Optional: add \`image\` and \`reply_to\` message ID.`,
        `${BULLET_EMOJI_RAW} Need to fix a typo? Use \`/say-edit message_id:<id> message:<text>\`.`,
        `${BULLET_EMOJI_RAW} You earn points from normal chat and from \`/say\`.`
      ]
    },
    {
      title: "Tutorial • Step 4",
      lines: [
        "**Use wallets and upgrades**",
        `${BULLET_EMOJI_RAW} Run \`/wallet\` to check user + character balances.`,
        `${BULLET_EMOJI_RAW} Run \`/shop\` to buy slot upgrades and character upgrades.`,
        `${BULLET_EMOJI_RAW} Run \`/points\` and \`/leaderboard\` to track progress.`
      ]
    }
  ];

  const totalPages = pages.length;
  const safePage = Number.isFinite(page) ? Math.min(Math.max(page, 0), totalPages - 1) : 0;
  const currentPage = pages[safePage];

  const components = [{ type: 10, content: `## ${currentPage.title}` }];
  const contentLines = currentPage.lines.filter((line) => typeof line === "string" && line.trim().length > 0);

  if (contentLines.length > 0) {
    components.push({ type: 14, divider: true, spacing: 1 });
    for (const line of contentLines) {
      components.push({ type: 10, content: line });
    }
  }

  components.push({ type: 14, divider: true, spacing: 1 });
  components.push({ type: 10, content: `Page ${safePage + 1}/${totalPages}` });
  components.push({
    type: 1,
    components: [
      {
        type: 2,
        style: 2,
        custom_id: `tutorial:page:${safePage - 1}`,
        label: "◀ Prev",
        disabled: safePage <= 0
      },
      {
        type: 2,
        style: 2,
        custom_id: `tutorial:page:${safePage + 1}`,
        label: "Next ▶",
        disabled: safePage >= totalPages - 1
      }
    ]
  });

  return {
    components: [{ type: 17, components }],
    page: safePage,
    totalPages
  };
}

function deleteCharacterFromGuild(guildId, characterId) {
  const character = getCharacterById(characterId, guildId);
  if (!character) {
    return null;
  }

  const index = characters.indexOf(character);
  if (index > -1) {
    characters.splice(index, 1);
    writeJson(CHARACTERS_PATH, characters);
  }

  if (getAssignedUserId(guildId, characterId)) {
    clearAssignedUserId(guildId, characterId);
    saveAssignments();
  }

  clearCharacterPoints(guildId, characterId);
  saveCharacterPoints();
  clearCharacterUpgrades(guildId, characterId);
  saveCharacterUpgrades();
  clearCharacterSelectionsInGuild(guildId, characterId);
  saveSelections();
  removeInventoryHoldersForCharacter(guildId, characterId);

  for (const channelId of Object.keys(webhooks)) {
    if (webhooks[channelId]?.[characterId]) {
      delete webhooks[channelId][characterId];
    }
  }
  saveWebhooks();

  return character;
}

function buildAdminUserEditPanel(guildId, targetUserId, statusLine = null) {
  const targetDisplay = `<@${targetUserId}>`;
  const userProfile = userProfiles[targetUserId] || {};
  const ownedCharacters = getCharactersForGuild(guildId)
    .filter((character) => getAssignedUserId(guildId, character.id) === targetUserId)
    .sort((first, second) => first.name.localeCompare(second.name));

  const components = [
    { type: 10, content: "## Admin • User Edit" },
    { type: 10, content: `**Target User:** ${targetDisplay}` },
    { type: 14, divider: true, spacing: 1 }
  ];

  if (statusLine) {
    components.push({ type: 10, content: statusLine });
    components.push({ type: 14, divider: true, spacing: 1 });
  }

  components.push({ type: 10, content: "### User Profile" });
  components.push({ type: 10, content: userProfile.nickname ? `${BULLET_EMOJI_RAW} **Nickname:** ${userProfile.nickname}` : `${BULLET_EMOJI_RAW} **Nickname:** _(not set)_` });
  components.push({ type: 10, content: userProfile.about ? `${BULLET_EMOJI_RAW} **About:** ${userProfile.about}` : `${BULLET_EMOJI_RAW} **About:** _(not set)_` });
  components.push({ type: 10, content: userProfile.interests ? `${BULLET_EMOJI_RAW} **Interests:** ${userProfile.interests}` : `${BULLET_EMOJI_RAW} **Interests:** _(not set)_` });
  components.push({
    type: 1,
    components: [
      {
        type: 2,
        style: 2,
        label: "Edit Profile",
        custom_id: `adm:u:pe:${targetUserId}`
      },
      {
        type: 2,
        style: 4,
        label: "Delete Profile",
        custom_id: `adm:u:pd:${targetUserId}`
      }
    ]
  });

  components.push({ type: 14, divider: true, spacing: 1 });
  components.push({ type: 10, content: `### Characters (${ownedCharacters.length})` });

  if (ownedCharacters.length === 0) {
    components.push({ type: 10, content: "No characters assigned to this user." });
  } else {
    ownedCharacters.forEach((character, index) => {
      components.push({ type: 10, content: `**${character.name}** (\`${character.id}\`)` });
      components.push({
        type: 1,
        components: [
          {
            type: 2,
            style: 2,
            label: "Edit",
            custom_id: `adm:u:ce:${targetUserId}:${character.id}`
          },
          {
            type: 2,
            style: 4,
            label: "Delete",
            custom_id: `adm:u:cd:${targetUserId}:${character.id}`
          }
        ]
      });

      if (index < ownedCharacters.length - 1) {
        components.push({ type: 14, divider: true, spacing: 1 });
      }
    });
  }

  return [{ type: 17, components }];
}

async function registerCommands() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const commandGuildId = (process.env.COMMAND_GUILD_ID || "").trim();

  if (!token || !clientId) {
    throw new Error("DISCORD_TOKEN and CLIENT_ID must be set in the environment.");
  }

  const characterChoices = characters.slice(0, 25).map((character) => ({
    name: character.name,
    value: character.id
  }));

  const characterCommand = new SlashCommandBuilder()
    .setName("character")
    .setDescription("Pick a character or assign one to a user")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("pick")
        .setDescription("Pick your character")
        .addStringOption((option) =>
          option
            .setName("character")
            .setDescription("Character to pick")
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("assign")
        .setDescription("Assign a character to a user (admin only)")
        .addStringOption((option) =>
          option
            .setName("character")
            .setDescription("Character to assign")
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User who will own the character")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("clear-webhooks")
        .setDescription("Clear cached webhooks (admin only)")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a new character (admin only)")
        .addStringOption((option) =>
          option
            .setName("id")
            .setDescription("Character ID (lowercase, no spaces)")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Character display name")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("avatar")
            .setDescription("Avatar URL (optional)")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("bio")
            .setDescription("Character biography (optional)")
            .setRequired(false)
            .setMaxLength(500)
        )
        .addStringOption((option) =>
          option
            .setName("personality")
            .setDescription("Character personality traits (optional)")
            .setRequired(false)
            .setMaxLength(500)
        )
        .addStringOption((option) =>
          option
            .setName("backstory")
            .setDescription("Character backstory (optional)")
            .setRequired(false)
            .setMaxLength(1000)
        )
        .addStringOption((option) =>
          option
            .setName("age")
            .setDescription("Character age (optional, number/Unknown/use '-' to remove)")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("race")
            .setDescription("Character race/species (optional)")
            .setRequired(false)
            .setMaxLength(100)
        )
        .addStringOption((option) =>
          option
            .setName("class")
            .setDescription("Character class/role (optional)")
            .setRequired(false)
            .setMaxLength(100)
        )
        .addStringOption((option) =>
          option
            .setName("relationship")
            .setDescription("Character relationship status (optional)")
            .setRequired(false)
            .addChoices(
              { name: "Ally", value: "ally" },
              { name: "Foe", value: "foe" },
              { name: "Neutral", value: "neutral" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create-and-assign")
        .setDescription("Create a new character and assign it to yourself")
        .addStringOption((option) =>
          option
            .setName("id")
            .setDescription("Character ID (lowercase, no spaces)")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Character display name")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("avatar")
            .setDescription("Avatar URL (optional)")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("bio")
            .setDescription("Character biography (optional)")
            .setRequired(false)
            .setMaxLength(500)
        )
        .addStringOption((option) =>
          option
            .setName("personality")
            .setDescription("Character personality traits (optional)")
            .setRequired(false)
            .setMaxLength(500)
        )
        .addStringOption((option) =>
          option
            .setName("backstory")
            .setDescription("Character backstory (optional)")
            .setRequired(false)
            .setMaxLength(1000)
        )
        .addStringOption((option) =>
          option
            .setName("age")
            .setDescription("Character age (optional, number/Unknown/use '-' to remove)")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("race")
            .setDescription("Character race/species (optional)")
            .setRequired(false)
            .setMaxLength(100)
        )
        .addStringOption((option) =>
          option
            .setName("class")
            .setDescription("Character class/role (optional)")
            .setRequired(false)
            .setMaxLength(100)
        )
        .addStringOption((option) =>
          option
            .setName("relationship")
            .setDescription("Character relationship status (optional)")
            .setRequired(false)
            .addChoices(
              { name: "Ally", value: "ally" },
              { name: "Foe", value: "foe" },
              { name: "Neutral", value: "neutral" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a character assignment")
        .addStringOption((option) =>
          option
            .setName("character")
            .setDescription("Character to remove")
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to remove from (leaves empty for yourself)")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List assigned characters")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to check (leaves empty for yourself, admin only for others)")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("edit")
        .setDescription("Edit character info")
        .addStringOption((option) =>
          option
            .setName("character")
            .setDescription("Character to edit")
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("change-id")
        .setDescription("Change a character ID (admin only)")
        .addStringOption((option) =>
          option
            .setName("character")
            .setDescription("Current character")
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption((option) =>
          option
            .setName("new-id")
            .setDescription("New character ID (lowercase, no spaces)")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("profile")
        .setDescription("View character profile and dynamic visual card")
        .addStringOption((option) =>
          option
            .setName("character")
            .setDescription("Character to view")
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Delete a character (admin only)")
        .addStringOption((option) =>
          option
            .setName("character")
            .setDescription("Character to delete")
            .setRequired(true)
            .setAutocomplete(true)
        )
    );

  const userCommand = new SlashCommandBuilder()
    .setName("user")
    .setDescription("Manage your Discord user profile")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("profile")
        .setDescription("View your user profile")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to view profile of")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("edit")
        .setDescription("Edit your user profile")
    );

  const adminCommand = new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Admin control commands")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommandGroup((group) =>
      group
        .setName("user")
        .setDescription("Manage user profiles and characters")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("edit")
            .setDescription("Open admin user edit panel")
            .addUserOption((option) =>
              option
                .setName("user")
                .setDescription("User to manage")
                .setRequired(true)
            )
        )
    );

  const sayCommand = new SlashCommandBuilder()
    .setName("say")
    .setDescription("Send a message as your selected character")
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Message content")
        .setRequired(true)
        .setMaxLength(2000)
    )
    .addAttachmentOption((option) =>
      option
        .setName("image")
        .setDescription("Optional image to include")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("reply_to")
        .setDescription("Optional message ID to reply to")
        .setRequired(false)
    );

  const sayEditCommand = new SlashCommandBuilder()
    .setName("say-edit")
    .setDescription("Edit one of your previously sent /say messages")
    .addStringOption((option) =>
      option
        .setName("message_id")
        .setDescription("Message ID to edit")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Updated message content")
        .setRequired(true)
        .setMaxLength(2000)
    );

  const sayDeleteCommand = new SlashCommandBuilder()
    .setName("say-delete")
    .setDescription("Delete one of your recently sent /say messages (within 15 minutes)")
    .addStringOption((option) =>
      option
        .setName("message_id")
        .setDescription("Message ID to delete")
        .setRequired(true)
    );

  const setupCommand = new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configure bot settings (admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("panel")
        .setDescription("Open setup manager panel")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add-points")
        .setDescription("Add points to a user or character wallet")
        .addStringOption((option) =>
          option
            .setName("wallet")
            .setDescription("Wallet type")
            .setRequired(true)
            .addChoices(
              { name: "User Wallet", value: "user" },
              { name: "Character Wallet", value: "character" }
            )
        )
        .addIntegerOption((option) =>
          option
            .setName("amount")
            .setDescription("Points to add")
            .setRequired(true)
            .setMinValue(1)
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Target user (for user wallet)")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("character")
            .setDescription("Target character (for character wallet)")
            .setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add-role-shop-item")
        .setDescription("Open role shop item manager")
        .addStringOption((option) =>
          option
            .setName("wallet")
            .setDescription("Wallet charged when this role item is purchased")
            .setRequired(false)
            .addChoices(
              { name: "User Wallet", value: "user" },
              { name: "Character Wallet", value: "character" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("manage-titles")
        .setDescription("Open title shop manager (create/delete purchasable titles)")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create-item")
        .setDescription("Create an inventory item")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Item name")
            .setRequired(true)
            .setMaxLength(80)
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Item description")
            .setRequired(true)
            .setMaxLength(300)
        )
        .addStringOption((option) =>
          option
            .setName("wallet")
            .setDescription("Wallet charged when bought from shop")
            .setRequired(true)
            .addChoices(
              { name: "User Wallet", value: "user" },
              { name: "Character Wallet", value: "character" }
            )
        )
        .addIntegerOption((option) =>
          option
            .setName("price")
            .setDescription("Shop price")
            .setRequired(true)
            .setMinValue(0)
        )
        .addStringOption((option) =>
          option
            .setName("rarity")
            .setDescription("Item rarity tier")
            .setRequired(false)
            .addChoices(
              { name: "Common", value: "common" },
              { name: "Uncommon", value: "uncommon" },
              { name: "Rare", value: "rare" },
              { name: "Epic", value: "epic" },
              { name: "Legendary", value: "legendary" }
            )
        )
        .addStringOption((option) =>
          option
            .setName("category")
            .setDescription("Item category")
            .setRequired(false)
            .addChoices(
              { name: "Consumable", value: "consumable" },
              { name: "Equipment", value: "equipment" },
              { name: "Quest Item", value: "quest" },
              { name: "Special", value: "special" },
              { name: "Other", value: "other" }
            )
        )
        .addIntegerOption((option) =>
          option
            .setName("weight")
            .setDescription("Item weight (units, 0-20)")
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(20)
        )
        .addBooleanOption((option) =>
          option
            .setName("temporary")
            .setDescription("Create as a temporary item (for dungeon masters)")
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName("add_to_shop")
            .setDescription("Immediately make this item buyable in /shop")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("give-item")
        .setDescription("Give an inventory item to a user")
        .addStringOption((option) =>
          option
            .setName("item")
            .setDescription("Item to give")
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Target user")
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("quantity")
            .setDescription("How many to give")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(999)
        )
        .addStringOption((option) =>
          option
            .setName("character")
            .setDescription("Optional character holding the item")
            .setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set-item-shop")
        .setDescription("Add or remove an inventory item from /shop")
        .addStringOption((option) =>
          option
            .setName("item")
            .setDescription("Item to update")
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addBooleanOption((option) =>
          option
            .setName("in_shop")
            .setDescription("Whether this item should be purchasable")
            .setRequired(true)
        )
    );

  const inventoryCommand = new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("View inventory items and holders")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to view inventory for (admin only for others)")
        .setRequired(false)
    );

  const useItemCommand = new SlashCommandBuilder()
    .setName("use-item")
    .setDescription("Use/consume an item from your inventory")
    .addStringOption((option) =>
      option
        .setName("item")
        .setDescription("Item to use")
        .setRequired(true)
        .setAutocomplete(true)
    );

  const giftItemCommand = new SlashCommandBuilder()
    .setName("gift-item")
    .setDescription("Gift an item to another user")
    .addStringOption((option) =>
      option
        .setName("item")
        .setDescription("Item to gift")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addUserOption((option) =>
      option
        .setName("recipient")
        .setDescription("User to gift to")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("quantity")
        .setDescription("How many to gift (default: 1)")
        .setRequired(false)
        .setMinValue(1)
    );

  const tradeCommand = new SlashCommandBuilder()
    .setName("trade")
    .setDescription("Manage item trades with other users")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("propose")
        .setDescription("Propose a trade to another user")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to trade with")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("offer")
            .setDescription("Item IDs to offer (comma-separated)")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("request")
            .setDescription("Item IDs to request (comma-separated)")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List pending trade proposals for you")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("accept")
        .setDescription("Accept a trade proposal")
        .addStringOption((option) =>
          option
            .setName("trade_id")
            .setDescription("Trade proposal ID")
            .setRequired(true)
        )
    );

  const botSayCommand = new SlashCommandBuilder()
    .setName("bot-say")
    .setDescription("Send a message as the bot (admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Message content")
        .setRequired(true)
        .setMaxLength(2000)
    )
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to send to (optional, uses current if not specified)")
        .setRequired(false)
        .addChannelTypes(0, 5) // Text and News channels only
    );

  const helpCommand = new SlashCommandBuilder()
    .setName("help")
    .setDescription("View available commands");

  const tutorialCommand = new SlashCommandBuilder()
    .setName("tutorial")
    .setDescription("Step-by-step guide for using the bot");

  const premiumCommand = new SlashCommandBuilder()
    .setName("premium")
    .setDescription(`Subscribe to unlock premium features including extra character slots`);

  const shopCommand = new SlashCommandBuilder()
    .setName("shop")
    .setDescription("View slot and upgrade shop prices");

  const walletCommand = new SlashCommandBuilder()
    .setName("wallet")
    .setDescription("View user and character wallet details")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to view wallet for (admin only for others)")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("character")
        .setDescription("Character (defaults to selected character)")
        .setRequired(false)
        .setAutocomplete(true)
    );

  const lookupCommand = new SlashCommandBuilder()
    .setName("lookup")
    .setDescription("Find who owns a character")
    .addStringOption((option) =>
      option
        .setName("character")
        .setDescription("Character to look up")
        .setRequired(true)
        .setAutocomplete(true)
    );

  const leaderboardCommand = new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View points leaderboard")
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Leaderboard type")
        .setRequired(false)
        .addChoices(
          { name: "Users", value: "users" },
          { name: "Characters", value: "characters" }
        )
    )
    .addIntegerOption((option) =>
      option
        .setName("limit")
        .setDescription("How many entries to show (1-25)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(25)
    );

  const pointsCommand = new SlashCommandBuilder()
    .setName("points")
    .setDescription("View points")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to view points for")
        .setRequired(false)
    );

  const commands = [
    characterCommand.toJSON(),
    userCommand.toJSON(),
    adminCommand.toJSON(),
    sayCommand.toJSON(),
    sayEditCommand.toJSON(),
    sayDeleteCommand.toJSON(),
    setupCommand.toJSON(),
    botSayCommand.toJSON(),
    helpCommand.toJSON(),
    tutorialCommand.toJSON(),
    premiumCommand.toJSON(),
    shopCommand.toJSON(),
    walletCommand.toJSON(),
    inventoryCommand.toJSON(),
    useItemCommand.toJSON(),
    giftItemCommand.toJSON(),
    tradeCommand.toJSON(),
    lookupCommand.toJSON(),
    leaderboardCommand.toJSON(),
    pointsCommand.toJSON()
  ];
  const rest = new REST({ version: "10" }).setToken(token);

  try {
    if (commandGuildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, commandGuildId), {
        body: commands
      });
      console.log(`Registered guild commands for ${commandGuildId}.`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log("Registered global commands for all servers.");
    }
  } catch (error) {
    console.error("Failed to register commands:", error);
    throw error;
  }
}

async function ensureWebhook(channel, character, botMember, retryDepth = 0) {
  if (retryDepth >= WEBHOOK_RECOVERY_MAX_ATTEMPTS) {
    throw new Error("Maximum webhooks reached in this channel and no reusable cached webhook is available. Clear old webhooks or run /character clear-webhooks.");
  }

  // For threads, we need to use the parent channel for webhooks
  const isThread = channel.isThread();
  const targetChannel = isThread ? channel.parent : channel;
  const channelId = targetChannel.id;
  const sharedKey = "__shared";
  const entry = webhooks[channelId]?.[sharedKey];

  if (entry?.id && entry?.token) {
    try {
      const webhookClient = new WebhookClient({
        id: entry.id,
        token: entry.token
      });
      await webhookClient.fetch();
      clearWebhookAutoDeleteTimer(entry.id);
      return entry;
    } catch (error) {
      clearWebhookAutoDeleteTimer(entry.id);
      removeWebhookFromChannelCache(channelId, entry.id);
    }
  }

  if (!botMember) {
    throw new Error("Bot member not available for permission check.");
  }

  const permissions = targetChannel.permissionsFor(botMember);
  if (!permissions) {
    throw new Error("Unable to read channel permissions for the bot.");
  }

  const missing = [];
  if (!permissions.has(PermissionFlagsBits.ViewChannel)) {
    missing.push("ViewChannel");
  }
  if (!permissions.has(PermissionFlagsBits.SendMessages)) {
    missing.push("SendMessages");
  }
  if (!permissions.has(PermissionFlagsBits.ManageWebhooks)) {
    missing.push("ManageWebhooks");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing permissions: ${missing.join(", ")} (channelId: ${targetChannel.id}).`
    );
  }

  if (!webhooks[channelId]) {
    webhooks[channelId] = {};
  }

  let createdWebhook = null;
  try {
    createdWebhook = await targetChannel.createWebhook({
      name: WEBHOOK_NAME_PREFIX,
      avatar: undefined
    });
  } catch (error) {
    if (error.code !== 30007) {
      throw error;
    }
  }

  if (createdWebhook?.id && createdWebhook?.token) {
    clearWebhookAutoDeleteTimer(createdWebhook.id);
    webhooks[channelId][sharedKey] = {
      id: createdWebhook.id,
      token: createdWebhook.token
    };
    saveWebhooks();
    return webhooks[channelId][sharedKey];
  }

  const channelEntries = webhooks[channelId] || {};
  for (const cachedEntry of Object.values(channelEntries)) {
    if (!cachedEntry?.id || !cachedEntry?.token) {
      continue;
    }

    try {
      const fallbackWebhookClient = new WebhookClient({
        id: cachedEntry.id,
        token: cachedEntry.token
      });
      await fallbackWebhookClient.fetch();
      clearWebhookAutoDeleteTimer(cachedEntry.id);
      webhooks[channelId][sharedKey] = {
        id: cachedEntry.id,
        token: cachedEntry.token
      };
      saveWebhooks();
      return {
        ...webhooks[channelId][sharedKey],
        fallbackReuse: true
      };
    } catch (error) {
      clearWebhookAutoDeleteTimer(cachedEntry.id);
      removeWebhookFromChannelCache(channelId, cachedEntry.id);
    }
  }

  try {
    const fetchedWebhooks = await targetChannel.fetchWebhooks();
    for (const webhook of fetchedWebhooks.values()) {
      if (webhook.owner?.id !== botMember.id || !webhook.token) {
        continue;
      }

      webhooks[channelId][sharedKey] = {
        id: webhook.id,
        token: webhook.token
      };
      saveWebhooks();
      return {
        ...webhooks[channelId][sharedKey],
        fallbackReuse: true
      };
    }
  } catch (error) {
    // ignore fetch failure and retry cleanup path below
  }

  try {
    const fetchedWebhooks = await targetChannel.fetchWebhooks();
    let deletedBotWebhooks = 0;
    for (const webhook of fetchedWebhooks.values()) {
      if (webhook.owner?.id !== botMember.id) {
        continue;
      }

      try {
        await webhook.delete("Clearing stale bot-owned webhook to free slot.");
        deletedBotWebhooks += 1;
      } catch (deleteError) {
        // ignore per-webhook delete failures
      }

      clearWebhookAutoDeleteTimer(webhook.id);
      removeWebhookFromChannelCache(channelId, webhook.id);
    }

    if (deletedBotWebhooks > 0) {
      return ensureWebhook(channel, character, botMember, retryDepth + 1);
    }
  } catch (cleanupError) {
    // ignore cleanup failure
  }

  const usage = await getWebhookUsageForChannel(channel, botMember).catch(() => ({ total: 0, botOwned: 0 }));
  const fullError = new Error("Channel webhook slots are full.");
  fullError.code = "WEBHOOK_SLOTS_FULL";
  fullError.webhookUsage = usage;
  throw fullError;
}

async function getWebhookUsageForChannel(channel, botMember) {
  const targetChannel = channel?.isThread?.() ? channel.parent : channel;
  if (!targetChannel || typeof targetChannel.fetchWebhooks !== "function") {
    return { total: 0, botOwned: 0 };
  }

  const fetchedWebhooks = await targetChannel.fetchWebhooks();
  let botOwned = 0;
  for (const webhook of fetchedWebhooks.values()) {
    if (botMember?.id && webhook.owner?.id === botMember.id) {
      botOwned += 1;
    }
  }

  return {
    total: fetchedWebhooks.size,
    botOwned
  };
}

// Generate Discord-style profile image
async function generateProfileImage(character) {
  try {
    if (!character.avatarUrl) {
      console.log("No avatar provided, skipping image generation");
      return null;
    }

    const imageSize = 512;
    const avatarSize = 320;
    const borderSize = avatarSize + 12;
    const borderOffset = Math.floor((imageSize - borderSize) / 2);
    const avatarOffset = borderOffset + 6;

    const image = sharp({
      create: {
        width: imageSize,
        height: imageSize,
        channels: 3,
        background: { r: 244, g: 95, b: 119 }
      }
    });

    try {
      console.log(`Loading avatar from: ${character.avatarUrl.substring(0, 100)}...`);
      const avatarInput = await loadImageBufferFromUrl(character.avatarUrl);
      if (!avatarInput) {
        return null;
      }

      const avatarResized = await sharp(avatarInput)
        .resize(avatarSize, avatarSize, { fit: "cover" })
        .toBuffer();

      const maskSVG = Buffer.from(
        `<svg width="${avatarSize}" height="${avatarSize}">
          <circle cx="${avatarSize / 2}" cy="${avatarSize / 2}" r="${avatarSize / 2}" fill="white"/>
        </svg>`
      );

      const maskedAvatar = await sharp(avatarResized)
        .composite([
          {
            input: maskSVG,
            blend: "dest-in"
          }
        ])
        .toBuffer();

      const borderSVG = Buffer.from(
        `<svg width="${borderSize}" height="${borderSize}">
          <circle cx="${borderSize / 2}" cy="${borderSize / 2}" r="${borderSize / 2}" fill="white"/>
        </svg>`
      );

      const avatarWithBorder = await sharp({
        create: {
          width: borderSize,
          height: borderSize,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      })
        .composite([
          { input: borderSVG, blend: "over" },
          { input: maskedAvatar, left: 6, top: 6, blend: "over" }
        ])
        .toBuffer();

      return await image
        .composite([
          {
            input: avatarWithBorder,
            left: borderOffset,
            top: borderOffset,
            blend: "over"
          }
        ])
        .png()
        .toBuffer();
    } catch (err) {
      console.log("Failed to process avatar:", err.message);
      return null;
    }
  } catch (error) {
    console.error("Error generating profile image:", error.message);
    return null;
  }
}

async function generateCharacterCardImage(character, options = {}) {
  const themePresets = {
    arcane:  { bgA: "#0D0A1A", bgB: "#1A1030", bgC: "#2D1B4E", panel: "#0E0A1ACC", border: "#3D2A6E", textPrimary: "#E8D5FF", textMuted: "#9B7FC7", accent: "#B76EFF", sectionBg: "#170F28" },
    ember:   { bgA: "#1A0A08", bgB: "#2E1410", bgC: "#4A1A10", panel: "#1C0C08CC", border: "#6E2A1A", textPrimary: "#FFE0CC", textMuted: "#C48A6E", accent: "#FF6B2E", sectionBg: "#221210" },
    verdant: { bgA: "#0A1A10", bgB: "#102E1A", bgC: "#1A4A2A", panel: "#0C1C0ECC", border: "#2A6E3A", textPrimary: "#D5FFE0", textMuted: "#7FC78A", accent: "#4EBB6E", sectionBg: "#0F2214" },
    frost:   { bgA: "#080E1A", bgB: "#10203A", bgC: "#1A3652", panel: "#0A1420CC", border: "#2A4A6E", textPrimary: "#D5EEFF", textMuted: "#7FAEC7", accent: "#4EA8D7", sectionBg: "#0F1A28" }
  };

  const width = 1200;
  const height = 675;
  const avatarSize = 180;
  const themeKey = String(options.theme || "arcane").toLowerCase();
  const palette = themePresets[themeKey] || themePresets.arcane;
  const accent = normalizeHexColor(options.accentColor, palette.accent);

  const pickedByDisplay = clampText(options.pickedByDisplay || options.ownerDisplay || "???", 30);
  const isPicked = Boolean(options.isPicked);
  const points = Number(options.points) || 0;
  const upgradeIds = Array.isArray(options.upgradeIds) ? options.upgradeIds : [];
  const titleName = options.titleName ? clampText(String(options.titleName), 40) : "";
  const safeTitleName = escapeSvgText(titleName);
  const hasWalletBoost = upgradeIds.includes("character_wallet_boost");
  const hasCooldownBoost = upgradeIds.includes("cooldown_boost");

  // Level calculation: each level requires progressively more points
  const calcLevel = (pts) => {
    let lvl = 1;
    let threshold = 10;
    let remaining = pts;
    while (remaining >= threshold) {
      remaining -= threshold;
      lvl++;
      threshold = Math.floor(threshold * 1.4);
    }
    return { level: lvl, currentXp: remaining, nextXp: threshold };
  };
  const levelInfo = calcLevel(points);

  const name = clampText(character.name || character.id, 36) || "Unknown Character";
  const bio = clampText(character.bio, 210) || "No bio set yet.";
  const personality = clampText(character.personality, 210) || "Unknown";
  const race = clampText(character.race, 30) || "Unknown";
  const className = clampText(character.class, 30) || "Unknown";
  const relationshipRaw = clampText(character.relationship, 24);
  const relationship = relationshipRaw ? `${relationshipRaw.charAt(0).toUpperCase()}${relationshipRaw.slice(1).toLowerCase()}` : "Neutral";
  const age = character.age ? clampText(String(character.age), 16) : "Unknown";
  const backstory = clampText(character.backstory, 350) || "No backstory yet.";

  const safeName = escapeSvgText(name);
  const safeBio = escapeSvgText(bio);
  const safePersonality = escapeSvgText(personality);
  const safeRace = escapeSvgText(race);
  const safeClass = escapeSvgText(className);
  const safeRelationship = escapeSvgText(relationship);
  const safeAge = escapeSvgText(age);
  const safeBackstory = escapeSvgText(backstory);
  const safePickedBy = escapeSvgText(pickedByDisplay);
  const ownerName = clampText(options.ownerDisplay || "Unassigned", 20);
  const safeOwner = escapeSvgText(ownerName);

  // Decorative corner ornaments
  const cornerOrnament = (cx, cy, rot) => `
    <g transform="translate(${cx},${cy}) rotate(${rot})">
      <path d="M0,0 Q12,-18 30,-22 Q18,-8 22,0 Z" fill="${accent}" fill-opacity="0.35"/>
      <path d="M0,0 Q-4,-14 6,-28 Q10,-12 14,-4 Z" fill="${accent}" fill-opacity="0.2"/>
      <circle cx="8" cy="-8" r="2.5" fill="${accent}" fill-opacity="0.5"/>
    </g>`;

  // Section label with medieval bracket style
  const sectionLabel = (x, y, label) => `
    <line x1="${x}" y1="${y}" x2="${x + 14}" y2="${y}" stroke="${accent}" stroke-opacity="0.5" stroke-width="1.5"/>
    <text x="${x + 18}" y="${y + 4}" fill="${palette.textMuted}" font-family="Georgia, 'Times New Roman', serif" font-size="12" letter-spacing="2.5" font-style="italic">${label}</text>
    <line x1="${x + 18 + label.length * 8.5}" y1="${y}" x2="${x + 18 + label.length * 8.5 + 14}" y2="${y}" stroke="${accent}" stroke-opacity="0.5" stroke-width="1.5"/>`;

  const divider = (x, y, w) => `
    <line x1="${x}" y1="${y}" x2="${x + w}" y2="${y}" stroke="${accent}" stroke-opacity="0.18" stroke-width="1"/>
    <circle cx="${x + w / 2}" cy="${y}" r="2.5" fill="${accent}" fill-opacity="0.3"/>`;

  // Right-side content x start (after avatar column)
  const cx = 280;
  const cw = 870;

  // Helper to wrap long text into multiple tspan lines
  const wrapText = (text, maxCharsPerLine) => {
    const words = text.split(" ");
    const lines = [];
    let current = "";
    for (const w of words) {
      if ((current + " " + w).trim().length > maxCharsPerLine && current.length > 0) {
        lines.push(current.trim());
        current = w;
      } else {
        current = current ? current + " " + w : w;
      }
    }
    if (current.trim()) lines.push(current.trim());
    return lines;
  };

  const bioLines = wrapText(bio, 70);
  const personalityLines = wrapText(personality, 70);
  const backstoryLines = wrapText(backstory, 70);

  const safeBioLines = bioLines.map(l => escapeSvgText(l));
  const safePersonalityLines = personalityLines.map(l => escapeSvgText(l));
  const safeBackstoryLines = backstoryLines.map(l => escapeSvgText(l));

  // When a background image is set, make everything more transparent so the image shows through
  const hasBg = Boolean(options.backgroundUrl);
  const panelFill = hasBg ? `${palette.bgA}88` : palette.panel;        // main panel: more transparent
  const sectionFillOpacity = hasBg ? "0.25" : "0.6";                   // tale box
  const sectionFillOpacity2 = hasBg ? "0.2" : "0.5";                   // temperament box
  const sectionFillOpacity3 = hasBg ? "0.15" : "0.4";                  // origins box
  const vitalsPanelOpacity = hasBg ? "0.2" : "0.4";                    // left vitals
  const avatarFrameFill = hasBg ? `${palette.sectionBg}66` : palette.sectionBg; // avatar box

  const svg = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.bgA}"/>
      <stop offset="40%" stop-color="${palette.bgB}"/>
      <stop offset="100%" stop-color="${palette.bgC}"/>
    </linearGradient>
    <linearGradient id="accentGlow" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.7"/>
      <stop offset="50%" stop-color="${accent}" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="mist1" cx="0.2" cy="0.8" r="0.6">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="mist2" cx="0.85" cy="0.15" r="0.5">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Background -->
  ${hasBg ? `<rect x="0" y="0" width="${width}" height="${height}" fill="${palette.bgA}" fill-opacity="0"/>` : `<rect x="0" y="0" width="${width}" height="${height}" fill="url(#bg)"/>`}
  ${hasBg ? "" : `<rect x="0" y="0" width="${width}" height="${height}" fill="url(#mist1)"/>`}
  ${hasBg ? "" : `<rect x="0" y="0" width="${width}" height="${height}" fill="url(#mist2)"/>`}

  <!-- Mystical orbs -->
  ${hasBg ? "" : `<circle cx="100" cy="580" r="120" fill="${accent}" opacity="0.06"/>`}
  ${hasBg ? "" : `<circle cx="1050" cy="90" r="100" fill="${accent}" opacity="0.05"/>`}

  <!-- Main panel -->
  <rect x="24" y="24" width="1152" height="627" rx="12" fill="${panelFill}" stroke="${palette.border}" stroke-opacity="0.4" stroke-width="2"/>
  <rect x="24" y="24" width="1152" height="4" rx="2" fill="url(#accentGlow)"/>

  <!-- Corner ornaments -->
  ${cornerOrnament(40, 40, 0)}
  ${cornerOrnament(1160, 40, 90)}
  ${cornerOrnament(1160, 636, 180)}
  ${cornerOrnament(40, 636, 270)}

  <!-- Inner border -->
  <rect x="40" y="40" width="1120" height="595" rx="6" fill="none" stroke="${palette.border}" stroke-opacity="0.12" stroke-width="1" stroke-dasharray="4,8"/>

  ${isPicked
    ? `<g filter="url(#glow)">
    <rect x="940" y="46" width="200" height="36" rx="6" fill="${accent}" fill-opacity="0.9"/>
    <text x="1040" y="71" text-anchor="middle" fill="${palette.bgA}" font-family="Georgia, 'Times New Roman', serif" font-size="16" font-weight="700" letter-spacing="3">CHOSEN</text>
  </g>
  <text x="1040" y="96" text-anchor="middle" fill="${palette.textMuted}" font-family="Georgia, 'Times New Roman', serif" font-size="12" font-style="italic">by ${safePickedBy}</text>`
    : ""}

  <!-- ===== LEFT COLUMN ===== -->

  <!-- Avatar frame -->
  <rect x="54" y="56" width="200" height="200" rx="10" fill="${avatarFrameFill}" stroke="${palette.border}" stroke-opacity="0.4" stroke-width="2"/>
  <rect x="58" y="60" width="192" height="192" rx="8" fill="none" stroke="${accent}" stroke-opacity="0.15" stroke-width="1" stroke-dasharray="3,6"/>
  <text x="154" y="158" text-anchor="middle" fill="${palette.textMuted}" font-family="Georgia, 'Times New Roman', serif" font-size="13" font-style="italic" fill-opacity="0.4">No Portrait</text>

  <!-- Ornate diamond separator -->
  <line x1="70" y1="278" x2="130" y2="278" stroke="${accent}" stroke-opacity="0.2" stroke-width="1"/>
  <polygon points="154,270 162,280 154,290 146,280" fill="none" stroke="${accent}" stroke-opacity="0.35" stroke-width="1.5"/>
  <circle cx="154" cy="280" r="2" fill="${accent}" fill-opacity="0.4"/>
  <line x1="178" y1="278" x2="238" y2="278" stroke="${accent}" stroke-opacity="0.2" stroke-width="1"/>

  <!-- Left vitals panel -->
  <rect x="54" y="300" width="200" height="275" rx="8" fill="${palette.sectionBg}" fill-opacity="${vitalsPanelOpacity}" stroke="${palette.border}" stroke-opacity="0.15" stroke-width="1"/>

  <!-- Class -->
  <text x="154" y="330" text-anchor="middle" fill="${palette.textMuted}" font-family="Georgia, 'Times New Roman', serif" font-size="11" letter-spacing="2" text-transform="uppercase">CLASS</text>
  <text x="154" y="352" text-anchor="middle" fill="${accent}" font-family="Georgia, 'Times New Roman', serif" font-size="17" font-weight="600">${safeClass}</text>

  <!-- Race -->
  <line x1="80" y1="370" x2="228" y2="370" stroke="${palette.border}" stroke-opacity="0.2" stroke-width="1"/>
  <text x="154" y="392" text-anchor="middle" fill="${palette.textMuted}" font-family="Georgia, 'Times New Roman', serif" font-size="11" letter-spacing="2" text-transform="uppercase">RACE</text>
  <text x="154" y="414" text-anchor="middle" fill="${palette.textPrimary}" font-family="Georgia, 'Times New Roman', serif" font-size="17">${safeRace}</text>

  <!-- Age -->
  <line x1="80" y1="432" x2="228" y2="432" stroke="${palette.border}" stroke-opacity="0.2" stroke-width="1"/>
  <text x="154" y="454" text-anchor="middle" fill="${palette.textMuted}" font-family="Georgia, 'Times New Roman', serif" font-size="11" letter-spacing="2" text-transform="uppercase">AGE</text>
  <text x="154" y="476" text-anchor="middle" fill="${palette.textPrimary}" font-family="Georgia, 'Times New Roman', serif" font-size="17">${safeAge}</text>

  <!-- Bond -->
  <line x1="80" y1="494" x2="228" y2="494" stroke="${palette.border}" stroke-opacity="0.2" stroke-width="1"/>
  <text x="154" y="516" text-anchor="middle" fill="${palette.textMuted}" font-family="Georgia, 'Times New Roman', serif" font-size="11" letter-spacing="2" text-transform="uppercase">BOND</text>
  <text x="154" y="538" text-anchor="middle" fill="${palette.textPrimary}" font-family="Georgia, 'Times New Roman', serif" font-size="17">${safeRelationship}</text>

  <!-- ===== RIGHT COLUMN ===== -->

  <!-- CHARACTER NAME -->
  <text x="${cx}" y="82" fill="${palette.textPrimary}" font-family="Georgia, 'Times New Roman', serif" font-size="44" font-weight="700" letter-spacing="1">${safeName}</text>
  ${safeTitleName ? `<text x="${cx}" y="104" fill="${accent}" font-family="Georgia, 'Times New Roman', serif" font-size="15" font-style="italic" letter-spacing="1.5" fill-opacity="0.85">~ ${safeTitleName} ~</text>` : ""}
  ${divider(cx, safeTitleName ? 114 : 98, cw)}

  <!-- BIO (TALE) -->
  ${sectionLabel(cx, safeTitleName ? 138 : 124, "TALE")}
  <rect x="${cx}" y="${safeTitleName ? 152 : 138}" width="${cw}" height="${Math.max(56, bioLines.length * 24 + 24)}" rx="8" fill="${palette.sectionBg}" fill-opacity="${sectionFillOpacity}" stroke="${palette.border}" stroke-opacity="0.18" stroke-width="1"/>
  <text x="${cx + 16}" y="${safeTitleName ? 176 : 162}" fill="${palette.textPrimary}" font-family="Georgia, 'Times New Roman', serif" font-size="17">
    ${safeBioLines.map((line, i) => `<tspan x="${cx + 16}" dy="${i === 0 ? 0 : 22}">${line}</tspan>`).join("")}
  </text>

  <!-- PERSONALITY (TEMPERAMENT) -->
  ${sectionLabel(cx, (safeTitleName ? 152 : 138) + Math.max(56, bioLines.length * 24 + 24) + 22, "TEMPERAMENT")}
  <rect x="${cx}" y="${(safeTitleName ? 152 : 138) + Math.max(56, bioLines.length * 24 + 24) + 36}" width="${cw}" height="${Math.max(56, personalityLines.length * 24 + 24)}" rx="8" fill="${palette.sectionBg}" fill-opacity="${sectionFillOpacity2}" stroke="${palette.border}" stroke-opacity="0.14" stroke-width="1"/>
  <text x="${cx + 16}" y="${(safeTitleName ? 152 : 138) + Math.max(56, bioLines.length * 24 + 24) + 60}" fill="${palette.textPrimary}" font-family="Georgia, 'Times New Roman', serif" font-size="17">
    ${safePersonalityLines.map((line, i) => `<tspan x="${cx + 16}" dy="${i === 0 ? 0 : 22}">${line}</tspan>`).join("")}
  </text>

  <!-- BACKSTORY (ORIGINS) -->
  ${(() => {
    const baseY = safeTitleName ? 152 : 138;
    const originsLabelY = baseY + Math.max(56, bioLines.length * 24 + 24) + 36 + Math.max(56, personalityLines.length * 24 + 24) + 22;
    const originsBoxY = originsLabelY + 14;
    const originsHeight = Math.max(70, Math.min(560 - originsBoxY, backstoryLines.length * 22 + 28));
    const statsY = originsBoxY + originsHeight + 14;
    const xpBarWidth = 200;
    const xpFillWidth = Math.min(xpBarWidth, Math.floor((levelInfo.currentXp / Math.max(1, levelInfo.nextXp)) * xpBarWidth));
    return `
  ${sectionLabel(cx, originsLabelY, "ORIGINS")}
  <rect x="${cx}" y="${originsBoxY}" width="${cw}" height="${originsHeight}" rx="8" fill="${palette.sectionBg}" fill-opacity="${sectionFillOpacity3}" stroke="${palette.border}" stroke-opacity="0.12" stroke-width="1"/>
  <text x="${cx + 16}" y="${originsBoxY + 24}" fill="${palette.textPrimary}" font-family="Georgia, 'Times New Roman', serif" font-size="17">
    ${safeBackstoryLines.map((line, i) => `<tspan x="${cx + 16}" dy="${i === 0 ? 0 : 22}">${line}</tspan>`).join("")}
  </text>

  <!-- Stats row -->
  <text x="${cx}" y="${statsY + 14}" fill="${palette.textMuted}" font-family="Georgia, 'Times New Roman', serif" font-size="12" letter-spacing="2">LEVEL</text>
  <text x="${cx + 52}" y="${statsY + 14}" fill="${accent}" font-family="Georgia, 'Times New Roman', serif" font-size="18" font-weight="700">${levelInfo.level}</text>

  <!-- XP bar -->
  <rect x="${cx + 90}" y="${statsY + 2}" width="${xpBarWidth}" height="14" rx="7" fill="${palette.sectionBg}" stroke="${palette.border}" stroke-opacity="0.25" stroke-width="1"/>
  <rect x="${cx + 91}" y="${statsY + 3}" width="${Math.max(0, xpFillWidth - 2)}" height="12" rx="6" fill="${accent}" fill-opacity="0.6"/>
  <text x="${cx + 90 + xpBarWidth / 2}" y="${statsY + 13}" text-anchor="middle" fill="${palette.textPrimary}" font-family="Georgia, 'Times New Roman', serif" font-size="9" font-weight="600">${levelInfo.currentXp} / ${levelInfo.nextXp} XP</text>

  <text x="${cx + 310}" y="${statsY + 14}" fill="${palette.textMuted}" font-family="Georgia, 'Times New Roman', serif" font-size="12" letter-spacing="2">MESSAGES</text>
  <text x="${cx + 400}" y="${statsY + 14}" fill="${palette.textPrimary}" font-family="Georgia, 'Times New Roman', serif" font-size="18" font-weight="600">${points}</text>

  <text x="${cx + 480}" y="${statsY + 14}" fill="${palette.textMuted}" font-family="Georgia, 'Times New Roman', serif" font-size="12" letter-spacing="2">OWNER</text>
  <text x="${cx + 540}" y="${statsY + 14}" fill="${palette.textPrimary}" font-family="Georgia, 'Times New Roman', serif" font-size="16" font-weight="600">${safeOwner}</text>

  ${hasWalletBoost || hasCooldownBoost ? `<!-- Boost badges -->` : ""}
  ${hasWalletBoost ? `
  <g transform="translate(${cx + 720}, ${statsY - 2})">
    <rect x="0" y="0" width="80" height="20" rx="4" fill="${accent}" fill-opacity="0.2" stroke="${accent}" stroke-opacity="0.4" stroke-width="1"/>
    <text x="10" y="14" fill="${accent}" font-family="Georgia, 'Times New Roman', serif" font-size="10" font-weight="600" letter-spacing="0.5">💰 WALLET+</text>
  </g>` : ""}
  ${hasCooldownBoost ? `
  <g transform="translate(${cx + (hasWalletBoost ? 810 : 720)}, ${statsY - 2})">
    <rect x="0" y="0" width="80" height="20" rx="4" fill="${accent}" fill-opacity="0.2" stroke="${accent}" stroke-opacity="0.4" stroke-width="1"/>
    <text x="10" y="14" fill="${accent}" font-family="Georgia, 'Times New Roman', serif" font-size="10" font-weight="600" letter-spacing="0.5">⚡ SPEED+</text>
  </g>` : ""}`;
  })()}

  <!-- Bottom flourish -->
  <line x1="400" y1="630" x2="560" y2="630" stroke="${accent}" stroke-opacity="0.15" stroke-width="1"/>
  <text x="600" y="635" text-anchor="middle" fill="${palette.textMuted}" font-family="Georgia, 'Times New Roman', serif" font-size="12" font-style="italic" fill-opacity="0.45">~ written in the annals of Crazyland ~</text>
  <line x1="640" y1="630" x2="800" y2="630" stroke="${accent}" stroke-opacity="0.15" stroke-width="1"/>
</svg>`;

  // Load avatar from character URL only
  let avatarInput = null;
  if (character.avatarUrl) {
    avatarInput = await loadImageBufferFromUrl(character.avatarUrl).catch((err) => {
      console.log("Avatar load failed:", err.message);
      return null;
    });
  }

  // Load background image (premium feature)
  let bgInput = null;
  if (options.backgroundUrl) {
    bgInput = await loadImageBufferFromUrl(options.backgroundUrl).catch((err) => {
      console.log("Card background load failed:", err.message);
      return null;
    });
  }

  const composites = [];

  // If we have a custom background, composite it under the SVG overlay
  if (bgInput) {
    try {
      const bgResized = await sharp(bgInput)
        .resize(width, height, { fit: "cover" })
        .png()
        .toBuffer();
      composites.push({ input: bgResized, left: 0, top: 0, blend: "over" });
    } catch (err) {
      console.log("Card background processing failed:", err.message);
    }
  }

  // The SVG overlay goes on top of the background
  const svgBuffer = Buffer.from(svg);
  if (bgInput && composites.length > 0) {
    // Start with the background, then overlay the SVG (which has semi-transparent panel)
    composites.push({ input: svgBuffer, left: 0, top: 0, blend: "over" });
  }

  // Add avatar overlay
  if (avatarInput) {
    try {
      const avatarResized = await sharp(avatarInput)
        .resize(avatarSize, avatarSize, { fit: "cover" })
        .png()
        .toBuffer();

      const avatarMask = Buffer.from(
        `<svg width="${avatarSize}" height="${avatarSize}" xmlns="http://www.w3.org/2000/svg"><rect width="${avatarSize}" height="${avatarSize}" rx="8" ry="8" fill="white"/></svg>`
      );

      const roundedAvatar = await sharp(avatarResized)
        .composite([{ input: avatarMask, blend: "dest-in" }])
        .png()
        .toBuffer();

      composites.push({ input: roundedAvatar, left: 64, top: 66, blend: "over" });
    } catch (error) {
      console.log("Character card avatar processing failed:", error.message);
    }
  }

  // Build final image
  if (composites.length === 0) {
    return sharp(svgBuffer).png().toBuffer();
  }

  if (bgInput && composites.length > 0) {
    // Background-based: start with a blank canvas, composite everything
    const canvas = sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png();
    return canvas.composite(composites).toBuffer();
  }

  // No background: SVG is the base, just overlay avatar
  return sharp(svgBuffer).png().composite(composites).toBuffer();
}


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  rest: {
    timeout: 30000
  }
});

function updateServerCountPresence() {
  if (!client.user) {
    return;
  }

  const guildCount = client.guilds.cache.size;
  const suffix = guildCount === 1 ? "" : "s";

  try {
    client.user.setPresence({
      activities: [
        {
          name: `${guildCount} server${suffix}`,
          type: ActivityType.Watching
        }
      ],
      status: "online"
    });
  } catch (error) {
    console.error("Failed to update server count presence:", error);
  }
}

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
  updateServerCountPresence();

  (async () => {
    try {
      await registerCommands();
      console.log("Slash commands registered successfully.");
    } catch (error) {
      console.error("Slash command registration failed after login; bot will remain online:", error);
    }
  })();

  const commandGuildId = (process.env.COMMAND_GUILD_ID || "").trim();
  const commandMode = commandGuildId ? `guild (${commandGuildId})` : "global";
  console.log(
    `[Startup] Mode=${commandMode} | Characters=${characters.length} | Assignments=${Object.keys(assignments).length} | Profiles=${Object.keys(userProfiles).length} | PremiumSKUs=${DISCORD_PREMIUM_SLOT_SKU_IDS.size}`
  );

  if (!commandGuildId) {
    (async () => {
      try {
        const guilds = await client.guilds.fetch();
        for (const [, guildRef] of guilds) {
          try {
            const guild = await guildRef.fetch();
            await guild.commands.set([]);
          } catch (error) {
            console.error(`Failed to clear guild commands for ${guildRef.id}:`, error);
          }
        }
        console.log("Cleared guild-specific commands (global mode).");
      } catch (error) {
        console.error("Failed to clear guild-specific commands:", error);
      }
    })();
  }
});

client.on("guildCreate", () => {
  updateServerCountPresence();
});

client.on("guildDelete", () => {
  updateServerCountPresence();
});

client.on("interactionCreate", async (interaction) => {
  const interactionLabel = interaction.isChatInputCommand?.()
    ? `/${interaction.commandName}`
    : interaction.customId || interaction.type;
  console.log(`Interaction received: ${interactionLabel} from ${interaction.user?.id || "unknown-user"}`);

  const clearAckGuard = installInteractionAckGuard(interaction);
  try {
    syncPremiumSlotsFromInteraction(interaction);

    const buildLeaderboardView = async (guild, type, limit, offset) => {
      const safeLimit = Math.max(1, Math.min(25, Number(limit) || 10));
      const safeOffset = Math.max(0, Number(offset) || 0);

      if (type === "characters") {
        const entries = getTopCharacterPoints(guild.id, 1000);
        if (entries.length === 0) {
          return {
            title: "Character Leaderboard",
            lines: ["No character points yet."],
            extraComponents: []
          };
        }

        const pageCount = Math.max(1, Math.ceil(entries.length / safeLimit));
        const clampedOffset = Math.min(safeOffset, (pageCount - 1) * safeLimit);
        const pageEntries = entries.slice(clampedOffset, clampedOffset + safeLimit);
        const currentPage = Math.floor(clampedOffset / safeLimit) + 1;

        const lines = pageEntries.map((entry, index) => {
          const character = getCharacterById(entry.characterId, guild.id);
          const characterName = character?.name || entry.characterId;
          return `**${clampedOffset + index + 1}.** ${characterName} (\`${entry.characterId}\`) — **${formatPointsWithEmoji(entry.points)}**`;
        });
        lines.push(`Page **${currentPage}/${pageCount}**`);

        const prevOffset = Math.max(0, clampedOffset - safeLimit);
        const nextOffset = clampedOffset + safeLimit;
        const extraComponents = [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 2,
                custom_id: `leaderboard:characters:${prevOffset}:${safeLimit}`,
                label: "◀ Prev",
                disabled: clampedOffset === 0
              },
              {
                type: 2,
                style: 2,
                custom_id: `leaderboard:characters:${nextOffset}:${safeLimit}`,
                label: "Next ▶",
                disabled: nextOffset >= entries.length
              }
            ]
          }
        ];

        return {
          title: "Character Leaderboard",
          lines,
          extraComponents
        };
      }

      const entries = getTopUserPoints(guild.id, 1000);
      if (entries.length === 0) {
        return {
          title: "User Leaderboard",
          lines: ["No user points yet."],
          extraComponents: []
        };
      }

      const pageCount = Math.max(1, Math.ceil(entries.length / safeLimit));
      const clampedOffset = Math.min(safeOffset, (pageCount - 1) * safeLimit);
      const pageEntries = entries.slice(clampedOffset, clampedOffset + safeLimit);
      const currentPage = Math.floor(clampedOffset / safeLimit) + 1;

      const lines = [];
      for (let index = 0; index < pageEntries.length; index += 1) {
        const entry = pageEntries[index];
        let userLabel = `<@${entry.userId}>`;
        try {
          const member = await guild.members.fetch(entry.userId);
          userLabel = member.displayName;
        } catch (error) {
          // Keep mention fallback when member can't be fetched
        }
        lines.push(`**${clampedOffset + index + 1}.** ${userLabel} — **${formatPointsWithEmoji(entry.points)}**`);
      }
      lines.push(`Page **${currentPage}/${pageCount}**`);

      const prevOffset = Math.max(0, clampedOffset - safeLimit);
      const nextOffset = clampedOffset + safeLimit;
      const extraComponents = [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 2,
              custom_id: `leaderboard:users:${prevOffset}:${safeLimit}`,
              label: "◀ Prev",
              disabled: clampedOffset === 0
            },
            {
              type: 2,
              style: 2,
              custom_id: `leaderboard:users:${nextOffset}:${safeLimit}`,
              label: "Next ▶",
              disabled: nextOffset >= entries.length
            }
          ]
        }
      ];

      return {
        title: "User Leaderboard",
        lines,
        extraComponents
      };
    };

    if (interaction.isAutocomplete()) {
      const subcommand = interaction.options.getSubcommand(false);
      if (interaction.commandName === "character" && (subcommand === "pick" || subcommand === "assign" || subcommand === "remove" || subcommand === "edit" || subcommand === "change-id" || subcommand === "delete" || subcommand === "profile")) {
        const focusedValue = interaction.options.getFocused(true);
        if (focusedValue.name === "character") {
          let choices;
          
          // For edit command, only show user's own characters (unless admin)
          if (subcommand === "pick") {
            choices = getCharacterAutocompleteChoices(
              interaction.guildId,
              focusedValue.value,
              (character) => getAssignedUserId(interaction.guildId, character.id) === interaction.user.id
            );
          } else if (subcommand === "edit") {
            const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
            if (isAdmin) {
              // Admins see all characters
              choices = getCharacterAutocompleteChoices(interaction.guildId, focusedValue.value);
            } else {
              // Regular users see only their assigned characters
              choices = getCharacterAutocompleteChoices(
                interaction.guildId,
                focusedValue.value,
                (character) => getAssignedUserId(interaction.guildId, character.id) === interaction.user.id
              );
            }
          } else {
            // For other commands, show all characters
            choices = getCharacterAutocompleteChoices(interaction.guildId, focusedValue.value);
          }
          
          await interaction.respond(choices);
        }
      }

      if (interaction.commandName === "setup" && subcommand === "add-points") {
        const focusedValue = interaction.options.getFocused(true);
        if (focusedValue.name === "character") {
          const choices = getCharacterAutocompleteChoices(interaction.guildId, focusedValue.value);
          await interaction.respond(choices);
        }
      }

      if (interaction.commandName === "setup" && (subcommand === "give-item" || subcommand === "set-item-shop")) {
        const focusedValue = interaction.options.getFocused(true);
        if (focusedValue.name === "item") {
          const choices = getInventoryItemAutocompleteChoices(interaction.guildId, focusedValue.value);
          await interaction.respond(choices);
          return;
        }

        if (subcommand === "give-item" && focusedValue.name === "character") {
          const choices = getCharacterAutocompleteChoices(interaction.guildId, focusedValue.value);
          await interaction.respond(choices);
          return;
        }
      }

      if (interaction.commandName === "wallet") {
        const focusedValue = interaction.options.getFocused(true);
        if (focusedValue.name === "character") {
          const choices = getCharacterAutocompleteChoices(interaction.guildId, focusedValue.value);
          await interaction.respond(choices);
        }
      }

      if (interaction.commandName === "lookup") {
        const focusedValue = interaction.options.getFocused(true);
        if (focusedValue.name === "character") {
          const choices = getCharacterAutocompleteChoices(interaction.guildId, focusedValue.value);
          await interaction.respond(choices);
        }
      }

      if (interaction.commandName === "use-item" || interaction.commandName === "gift-item") {
        const focusedValue = interaction.options.getFocused(true);
        if (focusedValue.name === "item") {
          const choices = getInventoryItemAutocompleteChoices(interaction.guildId, focusedValue.value);
          await interaction.respond(choices);
          return;
        }
      }

      if (interaction.commandName === "trade") {
        const subcommand = interaction.options.getSubcommand(false);
        const focusedValue = interaction.options.getFocused(true);
        if (subcommand === "propose" && (focusedValue.name === "offer" || focusedValue.name === "request")) {
          const choices = getInventoryItemAutocompleteChoices(interaction.guildId, focusedValue.value);
          await interaction.respond(choices);
          return;
        }
      }
      return;
    }

    if (interaction.isChatInputCommand()) {

      if (interaction.commandName === "admin") {
        if (!interaction.inGuild()) {
          await replyComponentsV2(
            interaction,
            "Admin",
            ["This command can only be used in a server."],
            [],
            { ephemeral: true }
          );
          return;
        }

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          await replyComponentsV2(
            interaction,
            "Admin",
            ["You do not have permission to use this command."],
            [],
            { ephemeral: true }
          );
          return;
        }

        const group = interaction.options.getSubcommandGroup(false);
        const subcommand = interaction.options.getSubcommand();

        if (group === "user" && subcommand === "edit") {
          const targetUser = interaction.options.getUser("user", true);
          await interaction.reply({
            flags: 32768,
            components: buildAdminUserEditPanel(interaction.guildId, targetUser.id),
            ephemeral: true
          });
          return;
        }

        await replyComponentsV2(
          interaction,
          "Admin",
          ["That admin subcommand is unavailable right now. Try `/help` and use the listed admin commands."],
          [],
          { ephemeral: true }
        );
        return;
      }

      if (interaction.commandName === "character") {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "assign") {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await replyComponentsV2(
              interaction,
              "Assign Character",
              ["You do not have permission to assign characters."],
              [],
              { ephemeral: true }
            );
            return;
          }

          const characterId = interaction.options.getString("character", true);
          const user = interaction.options.getUser("user", true);
          const character = getCharacterById(characterId, interaction.guildId);

          if (user.bot) {
            await replyComponentsV2(
              interaction,
              "Assign Character",
              ["You cannot assign characters to bot accounts."],
              [],
              { ephemeral: true }
            );
            return;
          }

          if (!character) {
            await replyComponentsV2(
              interaction,
              "Assign Character",
              ["That character does not exist."],
              [],
              { ephemeral: true }
            );
            return;
          }

          if (!canAssignCharacterToUser(interaction.guildId, user.id, characterId)) {
            const usedSlots = getOwnedCharacterCount(interaction.guildId, user.id);
            const slotLimit = getUserCharacterSlotLimit(interaction.guildId, user.id);
            await replyComponentsV2(
              interaction,
              "Assign Character",
              [
                `**${user.tag}** has no free character slots.`,
                `Used slots: **${usedSlots}/${slotLimit}**`,
                "They can buy more from `/shop`."
              ],
              [],
              { ephemeral: true }
            );
            return;
          }

          setAssignedUserId(interaction.guildId, characterId, user.id);
          saveAssignments();

          await replyComponentsV2(
            interaction,
            "Character Assigned",
            [`Assigned **${character.name}** to **${user.tag}**.`],
            [],
            { ephemeral: true }
          );
          return;
        }

        if (subcommand === "pick") {
          const characterId = interaction.options.getString("character", true);
          const character = getCharacterById(characterId, interaction.guildId);

          if (!character) {
            await replyComponentsV2(
              interaction,
              "Character Pick",
              [`Character with ID \`${characterId}\` does not exist.`],
              [],
              { ephemeral: true }
            );
            return;
          }

          if (getAssignedUserId(interaction.guildId, characterId) !== interaction.user.id) {
            await replyComponentsV2(
              interaction,
              "Character Pick",
              ["You can only pick characters assigned to you."],
              [],
              { ephemeral: true }
            );
            return;
          }

          if (isCharacterSlotLocked(interaction.guildId, interaction.user.id, characterId)) {
            const slotLimit = getUserCharacterSlotLimit(interaction.guildId, interaction.user.id);
            const ownedCount = getOwnedCharacterCount(interaction.guildId, interaction.user.id);
            await replyComponentsV2(
              interaction,
              "Character Pick",
              [
                `${UNSUCCESSFUL_EMOJI_RAW} **${character.name}** is in a locked subscription slot.`,
                `You have **${ownedCount}** characters but only **${slotLimit}** active slot(s).`,
                "Re-subscribe to unlock all slots, or unassign characters until you're within your base limit."
              ],
              [],
              { ephemeral: true }
            );
            return;
          }

          setSelectedCharacterId(interaction.guildId, interaction.user.id, characterId);
          saveSelections();

          await replyComponentsV2(
            interaction,
            "Character Selected",
            [
              `Now using **${character.name}** (\`${character.id}\`).`,
              "Use `/say` to roleplay as this character."
            ],
            [],
            { ephemeral: true }
          );
          return;
        }

        if (subcommand === "clear-webhooks") {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await replyComponentsV2(
              interaction,
              "Clear Webhooks",
              ["You do not have permission to clear webhooks."],
              [],
              { ephemeral: true }
            );
            return;
          }

          // Reload characters from disk
          const updatedCharacters = readJson(CHARACTERS_PATH, []);
          if (updatedCharacters.length > 0) {
            characters.length = 0;
            characters.push(...updatedCharacters);
          }

          // Delete actual Discord webhooks
          let deletedCount = 0;
          try {
            for (const channelId in webhooks) {
              const channel = await interaction.guild.channels.fetch(channelId);
              if (channel && channel.isTextBased()) {
                for (const characterId in webhooks[channelId]) {
                  const webhookInfo = webhooks[channelId][characterId];
                  try {
                    const webhookClient = new WebhookClient({
                      id: webhookInfo.id,
                      token: webhookInfo.token
                    });
                    await webhookClient.delete();
                    deletedCount++;
                  } catch (error) {
                    // Webhook already deleted or invalid
                  }
                }
              }
            }
          } catch (error) {
            console.log("Error deleting webhooks:", error);
          }

          webhooks = {};
          saveWebhooks();
          clearAllWebhookAutoDeleteTimers();
          webhookSlotCursorByChannel.clear();

          await replyComponentsV2(
            interaction,
            "Webhooks Cleared",
            [`Deleted **${deletedCount}** webhooks and reloaded character data. New webhooks will be created on next \`/say\`.`],
            [],
            { ephemeral: true }
          );
        }

        if (subcommand === "create") {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await replyComponentsV2(
              interaction,
              "Create Character",
              ["You do not have permission to create characters."],
              [],
              { ephemeral: true }
            );
            return;
          }

          const characterId = interaction.options.getString("id", true).toLowerCase().trim();
          const characterName = interaction.options.getString("name", true);
          const avatarUrl = interaction.options.getString("avatar", false) || undefined;
          const bio = interaction.options.getString("bio", false) || undefined;
          const personality = interaction.options.getString("personality", false) || undefined;
          const backstory = interaction.options.getString("backstory", false) || undefined;
          
          // Parse age: convert to number if valid, allow "Unknown", or use "-" to remove
          const ageInput = interaction.options.getString("age", false);
          let age = undefined;
          if (ageInput) {
            const ageNum = parseInt(ageInput, 10);
            if (!isNaN(ageNum) && ageNum > 0 && ageNum <= 1000) {
              age = ageNum;
            } else if (ageInput.toLowerCase() === "unknown") {
              age = "Unknown";
            } else if (ageInput !== "-") {
              await replyComponentsV2(
                interaction,
                "❗ Invalid Age",
                ["Age must be a number between 1 and 1000, 'Unknown', or '-' to remove."],
                [],
                { ephemeral: true }
              );
              return;
            }
          }
          
          const race = interaction.options.getString("race", false) || undefined;
          const characterClass = interaction.options.getString("class", false) || undefined;
          const relationship = interaction.options.getString("relationship", false) || undefined;

          // Validate ID format
          if (!/^[a-z0-9_-]+$/.test(characterId)) {
            await replyComponentsV2(
              interaction,
              "❗ Invalid Character ID",
              ["Character ID must be lowercase letters, numbers, hyphens, or underscores only."],
              [],
              { ephemeral: true }
            );
            return;
          }

          // Check if character already exists
          if (getCharacterById(characterId, interaction.guildId)) {
            await replyComponentsV2(
              interaction,
              "❗ Character Exists",
              [`Character with ID \`${characterId}\` already exists.`],
              [],
              { ephemeral: true }
            );
            return;
          }

          // Create new character
          const newCharacter = {
            id: characterId,
            guildId: interaction.guildId || undefined,
            name: characterName,
            avatarUrl: avatarUrl,
            bio: bio,
            personality: personality,
            backstory: backstory,
            age: age,
            race: race,
            class: characterClass,
            relationship: relationship
          };

          characters.push(newCharacter);
          
          // Save to file
          writeJson(CHARACTERS_PATH, characters);

          await replyComponentsV2(
            interaction,
            "Character Created",
            [`Created character **${characterName}** with ID \`${characterId}\`.`],
            [],
            { ephemeral: true }
          );
        }

        if (subcommand === "create-and-assign") {
          const characterId = interaction.options.getString("id", true).toLowerCase().trim();
          const characterName = interaction.options.getString("name", true);
          const avatarUrl = interaction.options.getString("avatar", false) || undefined;
          const bio = interaction.options.getString("bio", false) || undefined;
          const personality = interaction.options.getString("personality", false) || undefined;
          const backstory = interaction.options.getString("backstory", false) || undefined;
          
          // Parse age: convert to number if valid, allow "Unknown", or use "-" to remove
          const ageInput = interaction.options.getString("age", false);
          let age = undefined;
          if (ageInput) {
            const ageNum = parseInt(ageInput, 10);
            if (!isNaN(ageNum) && ageNum > 0 && ageNum <= 1000) {
              age = ageNum;
            } else if (ageInput.toLowerCase() === "unknown") {
              age = "Unknown";
            } else if (ageInput !== "-") {
              await replyComponentsV2(
                interaction,
                "❗ Invalid Age",
                ["Age must be a number between 1 and 1000, 'Unknown', or '-' to remove."],
                [],
                { ephemeral: true }
              );
              return;
            }
          }
          
          const race = interaction.options.getString("race", false) || undefined;
          const characterClass = interaction.options.getString("class", false) || undefined;
          const relationship = interaction.options.getString("relationship", false) || undefined;

          // Validate ID format
          if (!/^[a-z0-9_-]+$/.test(characterId)) {
            await replyComponentsV2(
              interaction,
              "❗ Invalid Character ID",
              ["Character ID must be lowercase letters, numbers, hyphens, or underscores only."],
              [],
              { ephemeral: true }
            );
            return;
          }

          // Check if character already exists
          if (getCharacterById(characterId, interaction.guildId)) {
            await replyComponentsV2(
              interaction,
              "❗ Character Exists",
              [`Character with ID \`${characterId}\` already exists.`],
              [],
              { ephemeral: true }
            );
            return;
          }

          if (!canAssignCharacterToUser(interaction.guildId, interaction.user.id, characterId)) {
            const usedSlots = getOwnedCharacterCount(interaction.guildId, interaction.user.id);
            const slotLimit = getUserCharacterSlotLimit(interaction.guildId, interaction.user.id);
            await replyComponentsV2(
              interaction,
              "No Free Character Slots",
              [
                `You are using **${usedSlots}/${slotLimit}** slots.`,
                "Buy another slot from `/shop` before creating and assigning a new character."
              ],
              [],
              { ephemeral: true }
            );
            return;
          }

          // Create new character
          const newCharacter = {
            id: characterId,
            guildId: interaction.guildId || undefined,
            name: characterName,
            avatarUrl: avatarUrl,
            bio: bio,
            personality: personality,
            backstory: backstory,
            age: age,
            race: race,
            class: characterClass,
            relationship: relationship
          };

          characters.push(newCharacter);
          
          // Auto-assign to the user who created it
          setAssignedUserId(interaction.guildId, characterId, interaction.user.id);
          
          // Save to file
          writeJson(CHARACTERS_PATH, characters);
          saveAssignments();

          await replyComponentsV2(
            interaction,
            "Character Created",
            [`Created character **${characterName}** with ID \`${characterId}\` and assigned it to you.`],
            [],
            { ephemeral: true }
          );
        }

        if (subcommand === "remove") {
          const characterId = interaction.options.getString("character", true);
          const targetUser = interaction.options.getUser("user", false);

          // If removing from another user, requires admin
          if (targetUser && targetUser.id !== interaction.user.id) {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
              await replyComponentsV2(
                interaction,
                "Remove Character",
                ["You do not have permission to remove character assignments from other users."],
                [],
                { ephemeral: true }
              );
              return;
            }
          }

          // Check if character exists
          const character = getCharacterById(characterId, interaction.guildId);
          if (!character) {
            await replyComponentsV2(
              interaction,
              "Edit Character",
              [`Character with ID "${characterId}" does not exist.`],
              [],
              { ephemeral: true }
            );
            return;
          }

          const targetUserId = targetUser?.id || interaction.user.id;

          // Check if character is assigned to target user
          if (getAssignedUserId(interaction.guildId, characterId) !== targetUserId) {
            await replyComponentsV2(
              interaction,
              "Remove Character",
              [`Character **${character.name}** is not assigned to that user.`],
              [],
              { ephemeral: true }
            );
            return;
          }

          clearAssignedUserId(interaction.guildId, characterId);
          saveAssignments();

          // Also remove from selections if the target user had it selected
          if (getSelectedCharacterId(interaction.guildId, targetUserId) === characterId) {
            clearSelectedCharacterId(interaction.guildId, targetUserId);
            saveSelections();
          }

          const targetName = targetUser ? `<@${targetUserId}>` : "yourself";
          await replyComponentsV2(
            interaction,
            "Assignment Removed",
            [`Removed assignment for **${character.name}** from ${targetName}.`],
            [],
            { ephemeral: true }
          );
        }

        if (subcommand === "list") {
          const targetUser = interaction.options.getUser("user", false);
          const targetUserId = targetUser?.id || interaction.user.id;

          // If checking another user, requires admin
          if (targetUser && targetUser.id !== interaction.user.id) {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
              await replyComponentsV2(
                interaction,
                "Character List",
                ["You do not have permission to view other users' character assignments."],
                [],
                { ephemeral: true }
              );
              return;
            }
          }

          const ownedCharacters = getCharactersForGuild(interaction.guildId).filter((c) => getAssignedUserId(interaction.guildId, c.id) === targetUserId);

          if (ownedCharacters.length === 0) {
            const userDesc = targetUser ? `<@${targetUserId}>` : "you";
            await replyComponentsV2(
              interaction,
              "Character List",
              [`${userDesc} don't have any assigned characters.`],
              [],
              { ephemeral: true }
            );
            return;
          }

          const components = [
            {
              type: 10, // Text Display
              content: `## ${targetUser ? `${targetUser.username}'s Characters` : "Your Characters"}`
            },
            {
              type: 14, // Separator
              divider: true,
              spacing: 1
            }
          ];

          const slotLimit = getUserCharacterSlotLimit(interaction.guildId, targetUserId);
          const ownedCount = ownedCharacters.length;
          const isOverSlotted = ownedCount > slotLimit;

          ownedCharacters.forEach((c, index) => {
            const locked = isOverSlotted && index >= slotLimit;
            const bioSnippet = c.bio ? c.bio.substring(0, 100) + (c.bio.length > 100 ? "..." : "") : "_(No bio)_";
            const lockLabel = locked ? " 🔒 **[Slot Locked — subscription ended]**" : "";
            components.push({
              type: 10,
              content: `**${c.name}** (\`${c.id}\`)${lockLabel}\n${bioSnippet}`
            });
          });

          if (isOverSlotted) {
            components.push({ type: 14, divider: true, spacing: 1 });
            components.push({
              type: 10,
              content: `${UNSUCCESSFUL_EMOJI_RAW} **${ownedCount - slotLimit}** character(s) are locked. Re-subscribe or unassign characters to free slots.`
            });
          }

          await interaction.reply({
            flags: 32768, // IS_COMPONENTS_V2
            components: [
              {
                type: 17, // Container
                components: components
              }
            ]
          });
        }

        if (subcommand === "edit") {
          const characterId = interaction.options.getString("character", true);

          // Check if character exists
          const character = getCharacterById(characterId, interaction.guildId);
          if (!character) {
            await replyComponentsV2(
              interaction,
              "Edit Character",
              [`Character with ID "${characterId}" does not exist.`],
              [],
              { ephemeral: true }
            );
            return;
          }

          // Check permissions: admin OR character owner
          const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
          const isOwner = getAssignedUserId(interaction.guildId, characterId) === interaction.user.id;

          if (!isAdmin && !isOwner) {
            await replyComponentsV2(
              interaction,
              "Edit Character",
              ["You do not have permission to edit this character."],
              [],
              { ephemeral: true }
            );
            return;
          }

          const editBoxComponents = [
            { type: 10, content: `## Edit ${character.name}` },
            { type: 14, divider: true, spacing: 1 },
            { type: 10, content: "Choose which section you want to edit." },
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 2,
                  label: "Edit Basic Info",
                  custom_id: `edit_basic_${characterId}`
                },
                {
                  type: 2,
                  style: 2,
                  label: "Edit More Fields",
                  custom_id: `edit_more_${characterId}`
                },
                {
                  type: 2,
                  style: 2,
                  label: "Edit Media",
                  custom_id: `edit_media_${characterId}`
                },
                {
                  type: 2,
                  style: 2,
                  label: "Edit Card Style",
                  custom_id: `edit_card_style_${characterId}`
                },
                {
                  type: 2,
                  style: 2,
                  label: "Select Title",
                  custom_id: `edit_title_${characterId}`
                }
              ]
            }
          ];

          await interaction.reply({
            flags: 32768,
            components: [{ type: 17, components: editBoxComponents }],
            ephemeral: true
          });
        }

        if (subcommand === "change-id") {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await replyComponentsV2(
              interaction,
              "Change Character ID",
              ["You do not have permission to change character IDs."],
              [],
              { ephemeral: true }
            );
            return;
          }

          const characterId = interaction.options.getString("character", true).trim();
          const newCharacterId = interaction.options.getString("new-id", true).toLowerCase().trim();
          const character = getCharacterById(characterId, interaction.guildId);

          if (!character) {
            await replyComponentsV2(
              interaction,
              "Change Character ID",
              [`Character with ID \`${characterId}\` does not exist.`],
              [],
              { ephemeral: true }
            );
            return;
          }

          if (!/^[a-z0-9_-]+$/.test(newCharacterId)) {
            await replyComponentsV2(
              interaction,
              "❗ Invalid Character ID",
              ["Character ID must be lowercase letters, numbers, hyphens, or underscores only."],
              [],
              { ephemeral: true }
            );
            return;
          }

          if (newCharacterId === characterId) {
            await replyComponentsV2(
              interaction,
              "Change Character ID",
              ["Old and new character IDs are the same."],
              [],
              { ephemeral: true }
            );
            return;
          }

          if (getCharacterById(newCharacterId, interaction.guildId)) {
            await replyComponentsV2(
              interaction,
              "❗ Character Exists",
              [`Character with ID \`${newCharacterId}\` already exists.`],
              [],
              { ephemeral: true }
            );
            return;
          }

          const renamed = renameCharacterIdInGuild(interaction.guildId, characterId, newCharacterId);
          if (!renamed) {
            await replyComponentsV2(
              interaction,
              "Change Character ID",
              ["Failed to change character ID. Try again."],
              [],
              { ephemeral: true }
            );
            return;
          }

          await replyComponentsV2(
            interaction,
            "Character ID Updated",
            [
              `${BULLET_EMOJI_RAW} Character: **${character.name}**`,
              `${BULLET_EMOJI_RAW} Old ID: \`${characterId}\``,
              `${BULLET_EMOJI_RAW} New ID: \`${newCharacterId}\``
            ],
            [],
            { ephemeral: true }
          );
          return;
        }

        if (subcommand === "profile") {
          // Defer IMMEDIATELY to avoid Discord's 3-second interaction timeout.
          if (!interaction.deferred && !interaction.replied) {
            try {
              await interaction.deferReply();
            } catch (deferError) {
              // 40060 = already acknowledged (auto-ack guard race), 10062 = interaction expired
              if (deferError?.code !== 40060 && deferError?.code !== 10062) {
                throw deferError;
              }
              if (deferError?.code === 10062) {
                console.error("Profile: interaction expired before deferReply, cannot respond.");
                return;
              }
            }
          }

          const characterId = interaction.options.getString("character", true);

          const character = getCharacterById(characterId, interaction.guildId);

          if (!character) {
            await interaction.editReply({
              content: `Character with ID "${characterId}" does not exist.`
            });
            return;
          }

          const ownerId = getAssignedUserId(interaction.guildId, character.id);
          let ownerDisplay = "Unassigned";
          if (ownerId) {
            try {
              const ownerMember = await interaction.guild.members.fetch(ownerId);
              ownerDisplay = ownerMember?.displayName || ownerMember?.user?.username || ownerId;
            } catch (error) {
              ownerDisplay = ownerId;
            }
          }

          const isPicked = ownerId
            ? getSelectedCharacterId(interaction.guildId, ownerId) === character.id
            : false;

          const characterPointsValue = getCharacterPoints(interaction.guildId, character.id);
          // Read saved card style from character data (set via /character edit)
          const theme = character.cardTheme || "arcane";
          const accentColor = character.cardAccent || "";
          const cardBackground = character.cardBackground || "";

          // Check if user has premium for background image
          const hasPremium = getPremiumSlotBonus(interaction.guildId, interaction.user.id) > 0;

          let cardBuffer = null;
          try {
            const upgradeIds = getCharacterUpgradeIds(interaction.guildId, character.id);
            const selectedTitleObj = getSelectedTitle(interaction.guildId, character.id);
            cardBuffer = await generateCharacterCardImage(character, {
              theme,
              accentColor,
              ownerDisplay,
              pickedByDisplay: ownerDisplay,
              isPicked,
              points: characterPointsValue,
              backgroundUrl: hasPremium ? cardBackground : "",
              upgradeIds,
              titleName: selectedTitleObj ? selectedTitleObj.name : ""
            });
          } catch (cardError) {
            console.error("Profile card generation failed:", cardError);
          }

          if (cardBuffer) {
            await interaction.editReply({
              content: `**${character.name}** • Character Profile`,
              files: [{ attachment: cardBuffer, name: `character-profile-${character.id}.png` }],
              components: [{
                type: 1,
                components: [{
                  type: 2,
                  style: 2,
                  label: "Report",
                  custom_id: `report_character_${character.id}`
                }]
              }]
            });
            return;
          }

          await interaction.editReply({
            content: [
              `**${character.name}**`,
              "Could not generate profile card image right now. Showing text details instead.",
              character.bio ? `${BULLET_EMOJI_RAW} **Bio:** ${character.bio}` : "",
              character.personality ? `${BULLET_EMOJI_RAW} **Personality:** ${character.personality}` : "",
              character.backstory ? `${BULLET_EMOJI_RAW} **Backstory:** ${character.backstory}` : "",
              character.age ? `${BULLET_EMOJI_RAW} **Age:** ${character.age}` : "",
              character.race ? `${BULLET_EMOJI_RAW} **Race/Species:** ${character.race}` : "",
              character.class ? `${BULLET_EMOJI_RAW} **Class:** ${character.class}` : "",
              character.relationship ? `${BULLET_EMOJI_RAW} **Status:** ${character.relationship}` : ""
            ].filter((line) => line).join("\n")
          });
          return;
        }

        if (subcommand === "delete") {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await replyComponentsV2(
              interaction,
              "Delete Character",
              ["You do not have permission to delete characters."],
              [],
              { ephemeral: true }
            );
            return;
          }

          const characterId = interaction.options.getString("character", true);

          // Check if character exists
          const character = getCharacterById(characterId, interaction.guildId);
          if (!character) {
            await replyComponentsV2(
              interaction,
              "Delete Character",
              [`Character with ID \`${characterId}\` does not exist.`],
              [],
              { ephemeral: true }
            );
            return;
          }

          // Create confirmation buttons using Components V2
          const deleteComponents = [
            { type: 10, content: `## Delete ${character.name}` },
            { type: 14, divider: true, spacing: 1 },
            { type: 10, content: `Are you sure you want to delete **${character.name}** (\`${characterId}\`)? This action cannot be undone.` },
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 4,
                  label: "Confirm Delete",
                  custom_id: "confirm_delete"
                },
                {
                  type: 2,
                  style: 2,
                  label: "Cancel",
                  custom_id: "cancel_delete"
                }
              ]
            }
          ];

          await interaction.reply({
            flags: 32768,
            components: [{ type: 17, components: deleteComponents }],
            ephemeral: true
          });

          // Store character ID for button handler
          const filter = (i) => i.user.id === interaction.user.id;
          const collector = interaction.channel.createMessageComponentCollector({
            filter,
            time: 30000
          });

          collector.on("collect", async (i) => {
            if (i.customId === "confirm_delete") {
              // Remove character
              const index = characters.indexOf(character);
              if (index > -1) {
                characters.splice(index, 1);
                writeJson(CHARACTERS_PATH, characters);
              }

              // Remove assignments
              if (getAssignedUserId(interaction.guildId, characterId)) {
                clearAssignedUserId(interaction.guildId, characterId);
                saveAssignments();
              }

              clearCharacterPoints(interaction.guildId, characterId);
              saveCharacterPoints();
              clearCharacterUpgrades(interaction.guildId, characterId);
              saveCharacterUpgrades();

              // Remove from selections
              clearCharacterSelectionsInGuild(interaction.guildId, characterId);
              saveSelections();

              // Log the deletion
              const deleteLog = `Deleted character \`${characterId}\` (${character.name})`;
              logMessage(interaction.user.id, `[ADMIN] Character Delete`, deleteLog, interaction.channelId, interaction.guildId);

              // Send log to logs channel if configured
              const logsChannelId = getLogsChannelIdForGuild(interaction.guildId);
              if (logsChannelId) {
                try {
                  const logsChannel = await interaction.client.channels.fetch(logsChannelId);
                  if (logsChannel?.isTextBased()) {
                    const actorName = interaction.user.username;
                    const deleteLogComponents = [
                      { type: 10, content: `## <:success:1479234774861221898> Character Deleted` },
                      { type: 14, divider: true, spacing: 1 },
                      { type: 10, content: `${BULLET_EMOJI_RAW} **Admin:** ${actorName}` },
                      { type: 10, content: `${BULLET_EMOJI_RAW} **Character:** ${character.name} (\`${characterId}\`)` },
                      { type: 14, divider: true, spacing: 1 },
                      { type: 10, content: `${BULLET_EMOJI_RAW} _${interaction.user.username}_ • ${new Date().toISOString()}` }
                    ];
                    await logsChannel.send({
                      flags: 32768,
                      components: [{ type: 17, components: deleteLogComponents }],
                      allowedMentions: { parse: [] }
                    });
                  }
                } catch (logError) {
                  console.error("Failed to send log to logs channel:", logError);
                }
              }

              const successComponents = [
                { type: 10, content: "## Character Deleted <:success:1479234774861221898>" },
                { type: 14, divider: true, spacing: 1 },
                { type: 10, content: `Successfully deleted **${character.name}** (\`${characterId}\`).` }
              ];
              await i.update({
                flags: 32768,
                components: [{ type: 17, components: successComponents }],
                ephemeral: true
              });
            } else if (i.customId === "cancel_delete") {
              const cancelComponents = [
                { type: 10, content: "## Delete Cancelled" },
                { type: 14, divider: true, spacing: 1 },
                { type: 10, content: "The character deletion was cancelled." }
              ];
              await i.update({
                flags: 32768,
                components: [{ type: 17, components: cancelComponents }],
                ephemeral: true
              });
            }
          });

          collector.on("end", async (collected) => {
            if (collected.size === 0) {
              const timeoutComponents = [
                { type: 10, content: "## Delete Confirmation Timed Out" },
                { type: 14, divider: true, spacing: 1 },
                { type: 10, content: "The delete confirmation timed out. Please try again." }
              ];
              await interaction.editReply({
                flags: 32768,
                components: [{ type: 17, components: timeoutComponents }],
                ephemeral: true
              });
            }
          });
        }
        return;
      }

      if (interaction.commandName === "lookup") {
        if (!interaction.inGuild()) {
          await replyComponentsV2(
            interaction,
            "Lookup",
            ["This command can only be used in a server."],
            [],
            { ephemeral: true }
          );
          return;
        }

        const characterId = interaction.options.getString("character", true);
        const character = getCharacterById(characterId, interaction.guildId);

        if (!character) {
          await replyComponentsV2(
            interaction,
            "Lookup",
            ["That character does not exist in this server."],
            [],
            { ephemeral: true }
          );
          return;
        }

        const assignedUserId = getAssignedUserId(interaction.guildId, character.id);
        const ownerLine = assignedUserId
          ? `Owner: <@${assignedUserId}>`
          : "Owner: Unassigned";

        await replyComponentsV2(
          interaction,
          "Character Lookup",
          [
            `Character: **${character.name}** (\`${character.id}\`)`,
            ownerLine
          ],
          [],
          { ephemeral: true }
        );
        return;
      }

      if (interaction.commandName === "user") {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "profile") {
          const targetUser = interaction.options.getUser("user") || interaction.user;
          const userId = targetUser.id;
          const userProfile = userProfiles[userId];

          const profileLines = userProfile ? [
            userProfile.nickname ? `${BULLET_EMOJI_RAW} **Nickname:** ${userProfile.nickname}` : "",
            userProfile.about ? `${BULLET_EMOJI_RAW} **About:** ${userProfile.about}` : "",
            userProfile.interests ? `${BULLET_EMOJI_RAW} **Interests:** ${userProfile.interests}` : ""
          ].filter(line => line) : [];

          await replyComponentsV2(
            interaction,
            `${targetUser.username}`,
            profileLines.length > 0 ? profileLines : ["No profile information set."],
            []
          );
          return;
        }

        if (subcommand === "edit") {
          const userId = interaction.user.id;
          const userProfile = userProfiles[userId];

          const profileLines = userProfile ? [
            userProfile.nickname ? `${BULLET_EMOJI_RAW} **Nickname:** ${userProfile.nickname}` : "",
            userProfile.about ? `${BULLET_EMOJI_RAW} **About:** ${userProfile.about}` : "",
            userProfile.interests ? `${BULLET_EMOJI_RAW} **Interests:** ${userProfile.interests}` : ""
          ].filter(line => line) : [];

          const editButton = {
            type: 1,
            components: [
              {
                type: 2,
                style: 2,
                label: "Edit Profile",
                custom_id: "edit_user_profile"
              }
            ]
          };

          await replyComponentsV2(
            interaction,
            `${interaction.user.username}`,
            profileLines.length > 0 ? profileLines : ["No profile information set."],
            [editButton],
            { ephemeral: true }
          );
          return;
        }
      }

      if (interaction.commandName === "wallet") {
        if (!interaction.inGuild()) {
          await replyComponentsV2(
            interaction,
            "Wallet",
            ["This command can only be used in a server."],
            [],
            { ephemeral: true }
          );
          return;
        }

        const targetUser = interaction.options.getUser("user", false) || interaction.user;
        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
        if (targetUser.id !== interaction.user.id && !isAdmin) {
          await replyComponentsV2(
            interaction,
            "Wallet",
            ["You do not have permission to view another user's wallet."],
            [],
            { ephemeral: true }
          );
          return;
        }

        const userId = targetUser.id;
        const userPoints = getUserPoints(interaction.guildId, userId);
        const slotLimit = getUserCharacterSlotLimit(interaction.guildId, userId);
        const premiumSlots = getPremiumSlotBonus(interaction.guildId, userId);
        const baseSlotLimit = getStoredUserCharacterSlotLimit(interaction.guildId, userId);
        const usedSlots = getOwnedCharacterCount(interaction.guildId, userId);

        let characterId = interaction.options.getString("character", false)
          || getSelectedCharacterId(interaction.guildId, userId);

        const lines = [
          `**User:** ${targetUser.tag}`,
          `**User Points:** ${formatPointsWithEmoji(userPoints)}`,
          `**Character Slots:** ${usedSlots}/${slotLimit}`,
          `**Slot Sources:** Base ${baseSlotLimit} + Subscription ${premiumSlots}`
        ];

        const characterSectionLines = [];

        if (!characterId) {
          characterSectionLines.push("**Character Wallet:** None selected");
          characterSectionLines.push("Use `/character pick` or pass `character` in `/wallet`.");
        } else {
          const character = getCharacterById(characterId, interaction.guildId);
          if (!character) {
            characterSectionLines.push("**Character Wallet:** Character not found");
          } else {
            const assignedUserId = getAssignedUserId(interaction.guildId, characterId);
            if (!isAdmin && assignedUserId !== interaction.user.id) {
              await replyComponentsV2(
                interaction,
                "Wallet",
                ["You can only view character wallets for characters assigned to you."],
                [],
                { ephemeral: true }
              );
              return;
            }

            const walletPoints = getCharacterPoints(interaction.guildId, characterId);

            characterSectionLines.push(`**Character:** ${character.name} (\`${characterId}\`)`);
            characterSectionLines.push(`**Character Points:** ${formatPointsWithEmoji(walletPoints)}`);
          }
        }

        const characterSectionComponents = characterSectionLines.map((line) => ({
          type: 10,
          content: line
        }));

        await replyComponentsV2(
          interaction,
          "Wallet",
          lines,
          characterSectionComponents,
          { ephemeral: true }
        );
        return;
      }

      if (interaction.commandName === "inventory") {
        if (!interaction.inGuild()) {
          await replyComponentsV2(
            interaction,
            "Inventory",
            ["This command can only be used in a server."],
            [],
            { ephemeral: true }
          );
          return;
        }

        const targetUser = interaction.options.getUser("user", false) || interaction.user;
        if (targetUser.id !== interaction.user.id && !hasAdminAccess(interaction)) {
          await replyComponentsV2(
            interaction,
            "Inventory",
            ["You do not have permission to view another user's inventory."],
            [],
            { ephemeral: true }
          );
          return;
        }

        const lines = getInventorySummaryLines(interaction.guildId, targetUser.id);
        const weight = getTotalInventoryWeight(interaction.guildId, targetUser.id);
        const weightPercent = getInventoryWeightPercentage(interaction.guildId, targetUser.id);
        
        const inventoryLines = [
          ...lines,
          "",
          `📦 **Inventory Weight:** ${weight}/${MAX_INVENTORY_WEIGHT} (${weightPercent}%)`
        ];

        await replyComponentsV2(
          interaction,
          `${targetUser.username}'s Inventory`,
          inventoryLines.length > 1 ? inventoryLines : ["No inventory items yet."],
          [],
          { ephemeral: true }
        );
        return;
      }

      if (interaction.commandName === "use-item") {
        if (!interaction.inGuild()) {
          await replyComponentsV2(
            interaction,
            "Use Item",
            ["This command can only be used in a server."],
            [],
            { ephemeral: true }
          );
          return;
        }

        const itemId = interaction.options.getString("item", true);
        const item = getInventoryItemById(interaction.guildId, itemId);

        if (!item) {
          await replyComponentsV2(
            interaction,
            "Use Item",
            ["That item does not exist."],
            [],
            { ephemeral: true }
          );
          return;
        }

        const itemState = getUserInventoryItemState(interaction.guildId, interaction.user.id, itemId, false);
        if (!itemState || itemState.quantity < 1) {
          await replyComponentsV2(
            interaction,
            "Use Item",
            ["You don't have that item in your inventory."],
            [],
            { ephemeral: true }
          );
          return;
        }

        if (isItemOnCooldown(interaction.user.id, itemId)) {
          const remaining = Math.ceil(getItemCooldownRemaining(interaction.user.id, itemId) / 1000);
          await replyComponentsV2(
            interaction,
            "Use Item",
            [`You must wait ${remaining} more seconds before using this item again.`],
            [],
            { ephemeral: true }
          );
          return;
        }

        const result = useInventoryItem(interaction.guildId, interaction.user.id, itemId, 1);
        if (!result.success) {
          await replyComponentsV2(
            interaction,
            "Use Item",
            [result.reason || "Could not use item."],
            [],
            { ephemeral: true }
          );
          return;
        }

        await replyComponentsV2(
          interaction,
          "Item Used",
          [
            `${SUCCESSFUL_EMOJI_RAW} Used **${item.name}**`,
            `Remaining: **${itemState.quantity - 1}**`
          ],
          [],
          { ephemeral: true }
        );
        return;
      }

      if (interaction.commandName === "gift-item") {
        if (!interaction.inGuild()) {
          await replyComponentsV2(
            interaction,
            "Gift Item",
            ["This command can only be used in a server."],
            [],
            { ephemeral: true }
          );
          return;
        }

        const itemId = interaction.options.getString("item", true);
        const recipient = interaction.options.getUser("recipient", true);
        const quantity = Math.max(1, interaction.options.getInteger("quantity", false) || 1);

        if (recipient.bot) {
          await replyComponentsV2(
            interaction,
            "Gift Item",
            ["You cannot gift items to bots."],
            [],
            { ephemeral: true }
          );
          return;
        }

        const item = getInventoryItemById(interaction.guildId, itemId);
        if (!item) {
          await replyComponentsV2(
            interaction,
            "Gift Item",
            ["That item does not exist."],
            [],
            { ephemeral: true }
          );
          return;
        }

        const haveState = getUserInventoryItemState(interaction.guildId, interaction.user.id, itemId, false);
        if (!haveState || haveState.quantity < quantity) {
          await replyComponentsV2(
            interaction,
            "Gift Item",
            [
              `You don't have enough of that item.`,
              `Need: **${quantity}** | Have: **${haveState?.quantity || 0}**`
            ],
            [],
            { ephemeral: true }
          );
          return;
        }

        const result = giftInventoryItem(interaction.guildId, interaction.user.id, recipient.id, itemId, quantity);
        if (!result.success) {
          await replyComponentsV2(
            interaction,
            "Gift Item",
            [result.reason || "Could not gift item."],
            [],
            { ephemeral: true }
          );
          return;
        }

        await replyComponentsV2(
          interaction,
          "Item Gifted",
          [
            `${SUCCESSFUL_EMOJI_RAW} Gifted **${quantity}x ${item.name}** to **${recipient.username}**`
          ],
          [],
          { ephemeral: true }
        );
        return;
      }

      if (interaction.commandName === "trade") {
        if (!interaction.inGuild()) {
          await replyComponentsV2(
            interaction,
            "Trade",
            ["This command can only be used in a server."],
            [],
            { ephemeral: true }
          );
          return;
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "propose") {
          const targetUser = interaction.options.getUser("user", true);
          if (targetUser.bot) {
            await replyComponentsV2(
              interaction,
              "Trade",
              ["You cannot trade with bots."],
              [],
              { ephemeral: true }
            );
            return;
          }

          if (targetUser.id === interaction.user.id) {
            await replyComponentsV2(
              interaction,
              "Trade",
              ["You cannot trade with yourself."],
              [],
              { ephemeral: true }
            );
            return;
          }

          const offeredStr = interaction.options.getString("offer", true);
          const requestedStr = interaction.options.getString("request", true);
          const offeredIds = offeredStr.split(",").map(s => s.trim()).filter(s => s.length > 0);
          const requestedIds = requestedStr.split(",").map(s => s.trim()).filter(s => s.length > 0);

          if (offeredIds.length === 0 || requestedIds.length === 0) {
            await replyComponentsV2(
              interaction,
              "Trade",
              ["Both offer and request lists must have at least one item."],
              [],
              { ephemeral: true }
            );
            return;
          }

          // Validate offered items exist
          for (const itemId of offeredIds) {
            const item = getInventoryItemById(interaction.guildId, itemId);
            if (!item) {
              await replyComponentsV2(
                interaction,
                "Trade",
                [`You don't have item \`${itemId}\`.`],
                [],
                { ephemeral: true }
              );
              return;
            }

            const state = getUserInventoryItemState(interaction.guildId, interaction.user.id, itemId, false);
            if (!state || state.quantity < 1) {
              await replyComponentsV2(
                interaction,
                "Trade",
                [`You don't have **${item.name}** in your inventory`],
                [],
                { ephemeral: true }
              );
              return;
            }
          }

          const proposal = createTradeProposal(
            interaction.guildId,
            interaction.user.id,
            targetUser.id,
            offeredIds,
            requestedIds
          );

          await replyComponentsV2(
            interaction,
            "Trade Proposed",
            [
              `${SUCCESSFUL_EMOJI_RAW} Trade proposal created: \`${proposal.id}\``,
              `Offered: **${offeredIds.length}** item(s)`,
              `Requested: **${requestedIds.length}** item(s)`,
              `Target: **${targetUser.username}**`,
              `Expires in 1 hour`
            ],
            [],
            { ephemeral: true }
          );
          return;
        }

        if (subcommand === "list") {
          const pending = getPendingTradesForUser(interaction.guildId, interaction.user.id);
          if (pending.length === 0) {
            await replyComponentsV2(
              interaction,
              "Trade Proposals",
              ["No pending trade proposals for you."],
              [],
              { ephemeral: true }
            );
            return;
          }

          const lines = pending.map(p => {
            const initiator = `<@${p.initiatorId}>`;
            return `**${p.id}** from ${initiator}: Offering **${p.offeredItems.length}** item(s) for **${p.requestedItems.length}** item(s)`;
          });

          await replyComponentsV2(
            interaction,
            "Your Trade Proposals",
            lines,
            [],
            { ephemeral: true }
          );
          return;
        }

        if (subcommand === "accept") {
          const tradeId = interaction.options.getString("trade_id", true);
          const proposal = getTradeProposal(tradeId);

          if (!proposal) {
            await replyComponentsV2(
              interaction,
              "Trade",
              ["That trade proposal does not exist or has expired."],
              [],
              { ephemeral: true }
            );
            return;
          }

          if (proposal.targetId !== interaction.user.id) {
            await replyComponentsV2(
              interaction,
              "Trade",
              ["You are not the target of this trade proposal."],
              [],
              { ephemeral: true }
            );
            return;
          }

          const result = acceptTradeProposal(tradeId);
          if (!result.success) {
            await replyComponentsV2(
              interaction,
              "Trade",
              [result.reason || "Could not accept trade."],
              [],
              { ephemeral: true }
            );
            return;
          }

          await replyComponentsV2(
            interaction,
            "Trade Accepted",
            [
              `${SUCCESSFUL_EMOJI_RAW} Trade completed!`,
              `You traded **${proposal.requestedItems.length}** item(s) for **${proposal.offeredItems.length}** item(s)`
            ],
            [],
            { ephemeral: true }
          );
          return;
        }
      }

      if (interaction.commandName === "say") {
        // Defer reply immediately since webhook operations can take time
        await interaction.deferReply({ ephemeral: true, flags: 32768 });

        if (!interaction.inGuild()) {
          await editComponentsV2(
            interaction,
            null,
            ["This command can only be used in a server."],
            []
          );
          return;
        }

        if (!canUseRoleplayCommands(interaction)) {
          await editComponentsV2(
            interaction,
            null,
            ["Characters can't send messages because server admins have disabled it."],
            []
          );
          return;
        }

        const channel = interaction.channel;
        if (
          !channel ||
          !channel.isTextBased() ||
          (channel.type !== ChannelType.GuildText && 
           channel.type !== ChannelType.GuildAnnouncement &&
           channel.type !== ChannelType.PublicThread &&
           channel.type !== ChannelType.PrivateThread &&
           channel.type !== ChannelType.AnnouncementThread &&
           channel.type !== ChannelType.GuildForum)
        ) {
          await editComponentsV2(
            interaction,
            null,
            [`This command can only be used in a text channel or thread. Channel type: ${channel?.type ?? "unknown"}.`],
            []
          );
          return;
        }

        if (!isSayAllowedInChannel(interaction.guildId, channel)) {
          const allowedChannelIds = getSayAllowedChannelIds(interaction.guildId);
          const allowedSummary = allowedChannelIds.slice(0, 8).map((channelId) => `<#${channelId}>`).join(", ");

          await editComponentsV2(
            interaction,
            null,
            [
              `${UNSUCCESSFUL_EMOJI_RAW} /say is not allowed in this channel.`,
              allowedChannelIds.length > 0
                ? `Allowed channels: ${allowedSummary}${allowedChannelIds.length > 8 ? ", ..." : ""}`
                : "No /say channels are configured for this server."
            ],
            []
          );
          return;
        }

        const selectedCharacterId = getSelectedCharacterId(interaction.guildId, interaction.user.id);
        if (!selectedCharacterId) {
          await editComponentsV2(
            interaction,
            null,
            ["Select a character first with /character pick."],
            []
          );
          return;
        }

        if (getAssignedUserId(interaction.guildId, selectedCharacterId) !== interaction.user.id) {
          await editComponentsV2(
            interaction,
            null,
            ["You are not assigned to that character."],
            []
          );
          return;
        }

        if (isCharacterSlotLocked(interaction.guildId, interaction.user.id, selectedCharacterId)) {
          const slotLimit = getUserCharacterSlotLimit(interaction.guildId, interaction.user.id);
          const ownedCount = getOwnedCharacterCount(interaction.guildId, interaction.user.id);
          await editComponentsV2(
            interaction,
            null,
            [
              `${UNSUCCESSFUL_EMOJI_RAW} This character is in a locked subscription slot.`,
              `You have **${ownedCount}** characters but only **${slotLimit}** active slot(s).`,
              "Re-subscribe to unlock all slots, or unassign characters until you're within your base limit."
            ],
            []
          );
          return;
        }

        const character = getCharacterById(selectedCharacterId, interaction.guildId);
        if (!character) {
          await editComponentsV2(
            interaction,
            null,
            ["Selected character no longer exists."],
            []
          );
          return;
        }

        const rawMessage = interaction.options.getString("message", true);
        const message = formatRoleplayMessage(rawMessage);
        const imageAttachment = interaction.options.getAttachment("image", false);
        const replyToMessageIdRaw = interaction.options.getString("reply_to", false);
        const replyToMessageId = typeof replyToMessageIdRaw === "string" ? replyToMessageIdRaw.trim() : "";
        let referencedMessage = null;

        if (replyToMessageId && !/^\d{17,20}$/.test(replyToMessageId)) {
          await editComponentsV2(
            interaction,
            null,
            [`${UNSUCCESSFUL_EMOJI_RAW} Reply message ID must be a valid Discord message ID.`],
            []
          );
          return;
        }

        if (imageAttachment) {
          const isImageContentType = typeof imageAttachment.contentType === "string"
            && imageAttachment.contentType.toLowerCase().startsWith("image/");
          const isImageByName = typeof imageAttachment.name === "string"
            && /\.(png|jpe?g|gif|webp|bmp|tiff?|avif)$/i.test(imageAttachment.name);

          if (!isImageContentType && !isImageByName) {
            await editComponentsV2(
              interaction,
              null,
              [`${UNSUCCESSFUL_EMOJI_RAW} The attachment must be an image file.`],
              []
            );
            return;
          }
        }

        if (replyToMessageId) {
          referencedMessage = await withTimeout(
            channel.messages.fetch(replyToMessageId),
            10000,
            "Reply target lookup timed out."
          ).catch(() => null);
          if (!referencedMessage) {
            await editComponentsV2(
              interaction,
              null,
              [`${UNSUCCESSFUL_EMOJI_RAW} Could not find that message in this channel/thread.`],
              []
            );
            return;
          }
        }

        let webhookInfo;
        try {
          const botMember = await withTimeout(
            interaction.guild.members.fetchMe(),
            10000,
            "Bot member lookup timed out."
          );
          webhookInfo = await withTimeout(
            ensureWebhook(channel, character, botMember),
            12000,
            "Webhook setup timed out."
          );
        } catch (error) {
          console.error("Webhook setup failed:", error);

          if (error?.code === "WEBHOOK_SLOTS_FULL") {
            const usage = error?.webhookUsage || { total: 0, botOwned: 0 };
            const safeTotal = Number.isFinite(usage.total) ? usage.total : 0;
            const safeBotOwned = Number.isFinite(usage.botOwned) ? usage.botOwned : 0;

            await editComponentsV2(
              interaction,
              null,
              [
                `${UNSUCCESSFUL_EMOJI_RAW} This channel's webhook slots are currently full.`,
                "Please wait for slots to free up and try `/say` again.",
                `Webhooks in use right now: **${safeTotal}/${CHANNEL_WEBHOOK_LIMIT}** (Bot-owned: **${safeBotOwned}**)`
              ],
              []
            );
            return;
          }

          await editComponentsV2(
            interaction,
            null,
            [`Failed to create or access the webhook. ${error?.message || "Check Manage Webhooks permission."}`],
            []
          );
          return;
        }

        try {
          const webhookClient = new WebhookClient({
            id: webhookInfo.id,
            token: webhookInfo.token
          });

          let outboundContent = message;
          if (referencedMessage) {
            const escapeLinkText = (text) => String(text || "").replace(/[\\\[\]\(\)]/g, "\\$&");
            const stripSubtextPrefix = (text) => String(text || "")
              .split("\n")
              .map((line) => line.replace(/^\s*-#\s?/, ""))
              .join("\n")
              .trim();
            let previewSourceMessage = referencedMessage;
            let sourceText = stripSubtextPrefix(previewSourceMessage.content || previewSourceMessage.cleanContent || "");

            if (/^↪\s/.test(sourceText)) {
              const embeddedLinkMatch = sourceText.match(/https?:\/\/discord\.com\/channels\/(\d{17,20})\/(\d{17,20})\/(\d{17,20})/i);
              if (embeddedLinkMatch) {
                const linkedChannelId = embeddedLinkMatch[2];
                const linkedMessageId = embeddedLinkMatch[3];
                const linkedChannel =
                  interaction.guild.channels.cache.get(linkedChannelId)
                  || await withTimeout(
                    interaction.guild.channels.fetch(linkedChannelId),
                    8000,
                    "Linked channel lookup timed out."
                  ).catch(() => null);

                if (linkedChannel?.isTextBased()) {
                  const linkedMessage = await withTimeout(
                    linkedChannel.messages.fetch(linkedMessageId),
                    8000,
                    "Linked message lookup timed out."
                  ).catch(() => null);
                  if (linkedMessage) {
                    previewSourceMessage = linkedMessage;
                    sourceText = stripSubtextPrefix(linkedMessage.content || linkedMessage.cleanContent || "");
                  }
                }
              }
            }

            const replyAuthor = previewSourceMessage.author?.username || "unknown";

            if (/^↪\s/.test(sourceText)) {
              const originalHeaderText = sourceText;
              const lines = sourceText.split("\n");
              lines.shift();
              while (lines[0] && /^https?:\/\/discord\.com\/channels\//i.test(lines[0].trim())) {
                lines.shift();
              }
              const strippedBody = lines.join("\n").trim();

              if (strippedBody) {
                sourceText = strippedBody;
              } else {
                const markdownHeaderMatch = originalHeaderText.match(
                  /^↪\s*\[Replying to [^:]+:\s*([^\]]*)\]\(https?:\/\/discord\.com\/channels\/[^)]+\)/i
                );
                const plainHeaderMatch = originalHeaderText.match(/^↪\s*Replying to [^:]+:\s*(.+)$/i);
                sourceText = (markdownHeaderMatch?.[1] || plainHeaderMatch?.[1] || "").trim();
              }
            }

            let fallbackText = "[no text]";
            if (previewSourceMessage.attachments?.size) {
              const firstAttachment = previewSourceMessage.attachments.first();
              fallbackText = firstAttachment?.name
                ? `[attachment: ${firstAttachment.name}]`
                : "[attachment]";
            } else if (previewSourceMessage.embeds?.length) {
              fallbackText = "[embed]";
            } else if (previewSourceMessage.stickers?.size) {
              fallbackText = "[sticker]";
            }

            const normalizedPreviewSource = (sourceText || fallbackText).replace(/\s+/g, " ").trim();
            const preview = normalizedPreviewSource.length > 50
              ? `${normalizedPreviewSource.slice(0, 50).trimEnd()}...`
              : normalizedPreviewSource;
            const replyJumpUrl = `https://discord.com/channels/${interaction.guildId}/${referencedMessage.channelId}/${referencedMessage.id}`;
            const safeAuthor = escapeLinkText(replyAuthor).slice(0, 40) || "unknown";
            const safePreview = escapeLinkText(preview);
            const replyHeader = `-# ↪ [Replying to ${safeAuthor}: ${safePreview}](${replyJumpUrl})\n`;

            const formattedBody = outboundContent;

            const allowedBodyLength = Math.max(0, 2000 - replyHeader.length);
            const trimmedBody = formattedBody.length > allowedBodyLength
              ? `${formattedBody.slice(0, Math.max(0, allowedBodyLength - 3)).trimEnd()}...`
              : formattedBody;

            outboundContent = `${replyHeader}${trimmedBody}`;
          }

          const webhookOptions = {
            content: outboundContent,
            username: character.name,
            avatarURL: character.avatarUrl || undefined,
            allowedMentions: { parse: [] }
          };

          if (imageAttachment?.url) {
            webhookOptions.files = [imageAttachment.url];
          }

          // If we're in a thread, specify the thread ID
          if (channel.isThread()) {
            webhookOptions.threadId = channel.id;
          }

          const sentMessage = await withTimeout(
            webhookClient.send(webhookOptions),
            12000,
            "Webhook send timed out."
          );

          const autoDeleteChannelId = channel.isThread() ? channel.parentId : channel.id;
          if (autoDeleteChannelId && webhookInfo?.id && webhookInfo?.token) {
            scheduleWebhookAutoDelete(autoDeleteChannelId, webhookInfo);
          }

          addPoints(interaction.guildId, interaction.user.id, POINTS_PER_CHARACTER_MESSAGE);

          const characterPointsCooldownMs = getCharacterPointsCooldownMs(interaction.guildId, selectedCharacterId);
          if (shouldAwardCharacterPoints(interaction.guildId, interaction.user.id, selectedCharacterId, characterPointsCooldownMs)) {
            const characterReward = getCharacterPointsReward(interaction.guildId, selectedCharacterId);
            addCharacterPoints(interaction.guildId, selectedCharacterId, characterReward);
          }

          // Log the message and webhook context so /say-edit can target it later.
          logMessage(interaction.user.id, character.name, message, interaction.channelId, interaction.guildId, {
            messageId: sentMessage?.id || null,
            webhookId: webhookInfo?.id || null,
            webhookToken: webhookInfo?.token || null,
            characterId: selectedCharacterId,
            threadId: channel.isThread() ? channel.id : null,
            source: "say"
          });

          const sentMessageIdSuffix = sentMessage?.id ? ` Message ID: \`${sentMessage.id}\`.` : "";

          await editComponentsV2(
            interaction,
            null,
            [
              `Sent as **${character.name}**.` +
                (webhookInfo.fallbackReuse
                  ? " Reused an existing webhook in this channel because the webhook limit is full."
                  : "") +
                sentMessageIdSuffix
            ],
            []
          );
        } catch (error) {
          console.error("Webhook send error:", error);
          try {
            await editComponentsV2(
              interaction,
              null,
              [`Failed to send the message using the webhook. ${error?.message || ""}`.trim()],
              []
            );
          } catch (replyError) {
            console.error("Failed to send error reply:", replyError);
          }
        }

        return;
      }

      if (interaction.commandName === "say-edit") {
        await interaction.deferReply({ ephemeral: true, flags: 32768 });

        if (!interaction.inGuild()) {
          await editComponentsV2(
            interaction,
            null,
            ["This command can only be used in a server."],
            []
          );
          return;
        }

        if (!canUseRoleplayCommands(interaction)) {
          await editComponentsV2(
            interaction,
            null,
            ["Characters can't send messages because server admins have disabled it."],
            []
          );
          return;
        }

        const messageIdRaw = interaction.options.getString("message_id", true);
        const messageId = String(messageIdRaw || "").trim();

        if (!/^\d{17,20}$/.test(messageId)) {
          await editComponentsV2(
            interaction,
            null,
            [`${UNSUCCESSFUL_EMOJI_RAW} Message ID must be a valid Discord message ID.`],
            []
          );
          return;
        }

        const rawMessage = interaction.options.getString("message", true);
        const updatedMessage = formatRoleplayMessage(rawMessage);
        const targetLogEntry = [...messageLogs]
          .reverse()
          .find((entry) => entry?.guildId === interaction.guildId && entry?.messageId === messageId);

        if (!targetLogEntry) {
          await editComponentsV2(
            interaction,
            null,
            [
              `${UNSUCCESSFUL_EMOJI_RAW} I couldn't find that message in tracked /say logs.`,
              "Only /say messages sent after this update can be edited."
            ],
            []
          );
          return;
        }

        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
        if (!isAdmin && targetLogEntry.userId !== interaction.user.id) {
          await editComponentsV2(
            interaction,
            null,
            ["You can only edit messages sent from your own account."],
            []
          );
          return;
        }

        const webhookId = String(targetLogEntry.webhookId || "").trim();
        const webhookToken = String(targetLogEntry.webhookToken || "").trim();

        if (!webhookId || !webhookToken) {
          await editComponentsV2(
            interaction,
            null,
            [
              `${UNSUCCESSFUL_EMOJI_RAW} This message does not have editable webhook data in logs.`,
              "Try sending a new /say message and editing that one."
            ],
            []
          );
          return;
        }

        try {
          const webhookClient = new WebhookClient({
            id: webhookId,
            token: webhookToken
          });

          const webhookEditOptions = {
            content: updatedMessage,
            allowedMentions: { parse: [] }
          };

          if (/^\d{17,20}$/.test(String(targetLogEntry.threadId || ""))) {
            webhookEditOptions.threadId = targetLogEntry.threadId;
          }

          await withTimeout(
            webhookClient.editMessage(messageId, webhookEditOptions),
            10000,
            "Webhook edit timed out."
          );

          logMessage(
            interaction.user.id,
            "Message Edit",
            `Edited /say message ${messageId}`,
            interaction.channelId,
            interaction.guildId,
            { source: "say-edit", targetMessageId: messageId }
          );

          await editComponentsV2(
            interaction,
            null,
            [`Updated message \`${messageId}\` successfully.`],
            []
          );
        } catch (error) {
          console.error("Webhook edit error:", error);
          const apiErrorCode = error?.rawError?.code;

          if (apiErrorCode === 10008) {
            await editComponentsV2(
              interaction,
              null,
              [`${UNSUCCESSFUL_EMOJI_RAW} Message not found. It may have been deleted.`],
              []
            );
            return;
          }

          if (apiErrorCode === 10015) {
            await editComponentsV2(
              interaction,
              null,
              [
                `${UNSUCCESSFUL_EMOJI_RAW} Webhook no longer exists, so that message can't be edited.`,
                "You only have 60 seconds to edit your message for corrections after sending it.",
                "Send a new /say message first if you need to post a correction."
              ],
              []
            );
            return;
          }

          await editComponentsV2(
            interaction,
            null,
            [`Failed to edit message. ${error?.message || ""}`.trim()],
            []
          );
        }

        return;
      }

      if (interaction.commandName === "say-delete") {
        await interaction.deferReply({ ephemeral: true, flags: 32768 });

        if (!interaction.inGuild()) {
          await editComponentsV2(
            interaction,
            null,
            ["This command can only be used in a server."],
            []
          );
          return;
        }

        if (!canUseRoleplayCommands(interaction)) {
          await editComponentsV2(
            interaction,
            null,
            ["Characters can't send messages because server admins have disabled it."],
            []
          );
          return;
        }

        const messageIdRaw = interaction.options.getString("message_id", true);
        const messageId = String(messageIdRaw || "").trim();

        if (!/^\d{17,20}$/.test(messageId)) {
          await editComponentsV2(
            interaction,
            null,
            [`${UNSUCCESSFUL_EMOJI_RAW} Message ID must be a valid Discord message ID.`],
            []
          );
          return;
        }

        const targetLogEntry = [...messageLogs]
          .reverse()
          .find(
            (entry) =>
              entry?.guildId === interaction.guildId &&
              entry?.messageId === messageId &&
              entry?.source === "say"
          );

        if (!targetLogEntry) {
          await editComponentsV2(
            interaction,
            null,
            [
              `${UNSUCCESSFUL_EMOJI_RAW} I couldn't find that message in tracked /say logs.`,
              "Only /say messages sent after this update can be deleted."
            ],
            []
          );
          return;
        }

        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
        const targetCharacterId = String(targetLogEntry.characterId || "").trim();
        const currentCharacterOwnerId = targetCharacterId
          ? getAssignedUserId(interaction.guildId, targetCharacterId)
          : null;
        if (!isAdmin) {
          if (!targetCharacterId || !currentCharacterOwnerId) {
            await editComponentsV2(
              interaction,
              null,
              [
                `${UNSUCCESSFUL_EMOJI_RAW} I couldn't verify the current owner of that character.`,
                "Only character owners can delete /say messages."
              ],
              []
            );
            return;
          }

          if (currentCharacterOwnerId !== interaction.user.id) {
            await editComponentsV2(
              interaction,
              null,
              [`${UNSUCCESSFUL_EMOJI_RAW} You can only delete /say messages for characters you currently own.`],
              []
            );
            return;
          }
        }

        const ageMs = Date.now() - new Date(targetLogEntry.timestamp).getTime();
        if (!isAdmin && ageMs > 15 * 60 * 1000) {
          await editComponentsV2(
            interaction,
            null,
            [
              `${UNSUCCESSFUL_EMOJI_RAW} This message is older than 15 minutes and can no longer be deleted.`,
              "Contact a server admin if you need it removed."
            ],
            []
          );
          return;
        }

        const targetChannelId = /^\d{17,20}$/.test(String(targetLogEntry.threadId || ""))
          ? targetLogEntry.threadId
          : targetLogEntry.channelId;

        try {
          const targetChannel = await client.channels.fetch(targetChannelId).catch(() => null);
          if (!targetChannel) {
            await editComponentsV2(
              interaction,
              null,
              [`${UNSUCCESSFUL_EMOJI_RAW} Could not find the channel this message was sent in.`],
              []
            );
            return;
          }

          const targetMessage = await targetChannel.messages.fetch(messageId).catch(() => null);
          if (!targetMessage) {
            await editComponentsV2(
              interaction,
              null,
              [`${UNSUCCESSFUL_EMOJI_RAW} Message not found. It may have already been deleted.`],
              []
            );
            return;
          }

          await withTimeout(
            targetMessage.delete(),
            10000,
            "Message delete timed out."
          );

          logMessage(
            interaction.user.id,
            "Message Delete",
            `Deleted /say message ${messageId}`,
            interaction.channelId,
            interaction.guildId,
            { source: "say-delete", targetMessageId: messageId }
          );

          await editComponentsV2(
            interaction,
            null,
            [`${SUCCESSFUL_EMOJI_RAW} Message \`${messageId}\` deleted successfully.`],
            []
          );
        } catch (error) {
          console.error("Message delete error:", error);
          const apiErrorCode = error?.rawError?.code;

          if (apiErrorCode === 10008) {
            await editComponentsV2(
              interaction,
              null,
              [`${UNSUCCESSFUL_EMOJI_RAW} Message not found. It may have already been deleted.`],
              []
            );
            return;
          }

          if (apiErrorCode === 50013) {
            await editComponentsV2(
              interaction,
              null,
              [`${UNSUCCESSFUL_EMOJI_RAW} The bot is missing permission to delete messages in that channel.`],
              []
            );
            return;
          }

          await editComponentsV2(
            interaction,
            null,
            [`${UNSUCCESSFUL_EMOJI_RAW} Failed to delete message. ${error?.message || ""}`.trim()],
            []
          );
        }

        return;
      }

      if (interaction.commandName === "leaderboard") {
        if (!interaction.inGuild()) {
          await replyComponentsV2(
            interaction,
            "Leaderboard",
            ["This command can only be used in a server."],
            [],
            { ephemeral: true }
          );
          return;
        }

        const type = interaction.options.getString("type", false) || "users";
        const limit = interaction.options.getInteger("limit", false) || 10;
        const view = await buildLeaderboardView(interaction.guild, type, limit, 0);

        await replyComponentsV2(
          interaction,
          view.title,
          view.lines,
          view.extraComponents
        );
        return;
      }

      if (interaction.commandName === "points") {
        if (!interaction.inGuild()) {
          await replyComponentsV2(
            interaction,
            "Points",
            ["This command can only be used in a server."],
            [],
            { ephemeral: true }
          );
          return;
        }

        const targetUser = interaction.options.getUser("user", false) || interaction.user;
        const userId = targetUser.id;
        const userPoints = getUserPoints(interaction.guildId, userId);
        const selectedCharacterId = getSelectedCharacterId(interaction.guildId, userId);

        const lines = [
          `**User Points:** ${formatPointsWithEmoji(userPoints)}`
        ];

        if (selectedCharacterId) {
          const selectedCharacter = getCharacterById(selectedCharacterId, interaction.guildId);
          const selectedCharacterPoints = getCharacterPoints(interaction.guildId, selectedCharacterId);
          const selectedCharacterName = selectedCharacter?.name || selectedCharacterId;
          lines.push(`**Selected Character:** ${selectedCharacterName}`);
          lines.push(`**Character Points:** ${formatPointsWithEmoji(selectedCharacterPoints)}`);
        } else {
          lines.push("**Selected Character:** None");
          lines.push("Use `/character pick` to track character points on `/say`.");
        }

        lines.push("");
        lines.push(`Earn **${MESSAGE_POINTS_MIN}-${MESSAGE_POINTS_MAX} ${POINTS_EMOJI_RAW}** per normal message and **${POINTS_PER_CHARACTER_MESSAGE} ${POINTS_EMOJI_RAW}** per \`/say\`.`);

        await replyComponentsV2(
          interaction,
          `${targetUser.username}'s Points`,
          lines,
          [],
          { ephemeral: true }
        );
        return;
      }

      if (interaction.commandName === "setup") {
        const subcommand = interaction.options.getSubcommand();
        const wantsTemporaryItem = subcommand === "create-item"
          && interaction.options.getBoolean("temporary", false) === true;

        if (!hasAdminAccess(interaction) && !(wantsTemporaryItem && hasDungeonMasterAccess(interaction))) {
          await replyComponentsV2(
            interaction,
            "Setup",
            ["You do not have permission to configure the bot."],
            [],
            { ephemeral: true }
          );
          return;
        }

        if (subcommand === "panel") {
          try {
            const panelComponents = buildSetupAdminPanel(interaction.guildId);
            await interaction.reply({
              flags: 32768,
              components: panelComponents,
              ephemeral: true
            });
          } catch (error) {
            console.error("[SETUP PANEL ERROR]", error);
            await interaction.reply({
              content: `Error building setup panel: ${error.message || String(error)}`,
              ephemeral: true
            }).catch(e => console.error("[ERROR REPLY FAILED]", e));
          }
          return;
        }

        if (subcommand === "add-points") {
          const walletType = interaction.options.getString("wallet", true);
          const amount = interaction.options.getInteger("amount", true);

          if (walletType === "user") {
            const targetUser = interaction.options.getUser("user", false) || interaction.user;

            if (targetUser.bot) {
              await replyComponentsV2(
                interaction,
                "Add Points",
                ["You cannot add points to bot accounts."],
                [],
                { ephemeral: true }
              );
              return;
            }

            addPoints(interaction.guildId, targetUser.id, amount);
            const newTotal = getUserPoints(interaction.guildId, targetUser.id);

            await replyComponentsV2(
              interaction,
              "User Wallet Updated",
              [
                `Added **${amount}** points to **${targetUser.tag}**.`,
                `New user wallet total: **${formatPointsWithEmoji(newTotal)}**`
              ],
              [],
              { ephemeral: true }
            );
            return;
          }

          if (walletType === "character") {
            const characterId = interaction.options.getString("character", false);
            if (!characterId) {
              await replyComponentsV2(
                interaction,
                "Add Points",
                ["For character wallet updates, provide the `character` option."],
                [],
                { ephemeral: true }
              );
              return;
            }

            const character = getCharacterById(characterId, interaction.guildId);
            if (!character) {
              await replyComponentsV2(
                interaction,
                "Add Points",
                ["That character does not exist."],
                [],
                { ephemeral: true }
              );
              return;
            }

            addCharacterPoints(interaction.guildId, characterId, amount);
            const newTotal = getCharacterPoints(interaction.guildId, characterId);

            await replyComponentsV2(
              interaction,
              "Character Wallet Updated",
              [
                `Added **${amount}** points to **${character.name}** (\`${characterId}\`).`,
                `New character wallet total: **${formatPointsWithEmoji(newTotal)}**`
              ],
              [],
              { ephemeral: true }
            );
            return;
          }

          await replyComponentsV2(
            interaction,
            "Add Points",
            ["Invalid wallet type."],
            [],
            { ephemeral: true }
          );
          return;
        }

        if (subcommand === "add-role-shop-item") {
          if (!interaction.inGuild()) {
            await replyComponentsV2(
              interaction,
              "Setup",
              ["This command can only be used in a server."],
              [],
              { ephemeral: true }
            );
            return;
          }

          const preferredWallet = normalizeRoleItemWallet(interaction.options.getString("wallet", false));
          if (interaction.options.getString("wallet", false)) {
            await interaction.showModal(buildRoleShopAddModal(preferredWallet));
            return;
          }

          await interaction.reply({
            flags: 32768,
            components: buildRoleShopAdminPanel(interaction.guildId),
            ephemeral: true
          });
          return;
        }

        if (subcommand === "manage-titles") {
          if (!interaction.inGuild()) {
            await replyComponentsV2(
              interaction,
              "Setup",
              ["This command can only be used in a server."],
              [],
              { ephemeral: true }
            );
            return;
          }

          await interaction.reply({
            flags: 32768,
            components: buildTitleAdminPanel(interaction.guildId),
            ephemeral: true
          });
          return;
        }

        if (subcommand === "create-item") {
          const isTemporary = interaction.options.getBoolean("temporary", false) === true;
          if (!hasAdminAccess(interaction) && !isTemporary) {
            await replyComponentsV2(
              interaction,
              "Create Item",
              ["Only server owners and bot managers can create permanent items."],
              [],
              { ephemeral: true }
            );
            return;
          }

          if (isTemporary && !hasDungeonMasterAccess(interaction)) {
            await replyComponentsV2(
              interaction,
              "Create Item",
              ["Only dungeon masters, bot managers, or the server owner can create temporary items."],
              [],
              { ephemeral: true }
            );
            return;
          }

          const name = interaction.options.getString("name", true).trim();
          const wallet = normalizeRoleItemWallet(interaction.options.getString("wallet", true));
          const price = interaction.options.getInteger("price", true);
          const addToShop = interaction.options.getBoolean("add_to_shop", false) === true;
          const rarity = interaction.options.getString("rarity", false) || "common";
          const category = interaction.options.getString("category", false) || "other";
          const weight = Math.max(0, interaction.options.getInteger("weight", false) || 0);
          let description = interaction.options.getString("description", true).trim();

          if (isTemporary && !description.toLowerCase().includes("(temporary item)")) {
            description = `${description} (temporary item)`;
          }

          const item = {
            id: generateInventoryItemId(name),
            guildId: interaction.guildId,
            name,
            description,
            wallet,
            price,
            rarity,
            category,
            weight,
            isTemporary,
            inShop: addToShop,
            createdByUserId: interaction.user.id,
            createdAt: new Date().toISOString()
          };

          inventoryItems.push(item);
          saveInventoryItems();

          await replyComponentsV2(
            interaction,
            "Inventory Item Created",
            [
              `${SUCCESSFUL_EMOJI_RAW} Created **${item.name}** (\`${item.id}\`).`,
              `Rarity: **${getItemRarityDisplay(item)}** | Category: **${getItemCategoryName(item)}**`,
              `Weight: **${weight}** | Wallet: **${getRoleItemWalletLabel(item.wallet)}**`,
              `Price: **${formatPointsWithEmoji(item.price)}**`,
              `Shop: **${item.inShop ? "Listed" : "Not listed"}**`,
              `Type: **${item.isTemporary ? "Temporary" : "Permanent"}**`
            ],
            [],
            { ephemeral: true }
          );
          return;
        }

        if (subcommand === "give-item") {
          if (!hasAdminAccess(interaction)) {
            await replyComponentsV2(
              interaction,
              "Give Item",
              ["Only server owners and bot managers can give inventory items."],
              [],
              { ephemeral: true }
            );
            return;
          }

          const itemId = interaction.options.getString("item", true);
          const targetUser = interaction.options.getUser("user", true);
          const quantity = interaction.options.getInteger("quantity", false) || 1;
          const holderCharacterId = interaction.options.getString("character", false);
          const item = getInventoryItemById(interaction.guildId, itemId);

          if (!item) {
            await replyComponentsV2(
              interaction,
              "Give Item",
              ["That inventory item does not exist in this server."],
              [],
              { ephemeral: true }
            );
            return;
          }

          if (targetUser.bot) {
            await replyComponentsV2(
              interaction,
              "Give Item",
              ["You cannot give inventory items to bot accounts."],
              [],
              { ephemeral: true }
            );
            return;
          }

          if (holderCharacterId) {
            const holderCharacter = getCharacterById(holderCharacterId, interaction.guildId);
            if (!holderCharacter) {
              await replyComponentsV2(
                interaction,
                "Give Item",
                ["The specified holder character does not exist."],
                [],
                { ephemeral: true }
              );
              return;
            }

            if (getAssignedUserId(interaction.guildId, holderCharacterId) !== targetUser.id) {
              await replyComponentsV2(
                interaction,
                "Give Item",
                ["The specified character is not assigned to that user."],
                [],
                { ephemeral: true }
              );
              return;
            }
          }

          addInventoryItemToUser(interaction.guildId, targetUser.id, item.id, quantity, holderCharacterId || null);

          const holderLine = holderCharacterId
            ? `Assigned holder: **${getCharacterById(holderCharacterId, interaction.guildId)?.name || holderCharacterId}**`
            : "Assigned holder: **none**";

          await replyComponentsV2(
            interaction,
            "Item Granted",
            [
              `${SUCCESSFUL_EMOJI_RAW} Gave **${item.name}** x${quantity} to **${targetUser.tag}**.`,
              holderLine
            ],
            [],
            { ephemeral: true }
          );
          return;
        }

        if (subcommand === "set-item-shop") {
          if (!hasAdminAccess(interaction)) {
            await replyComponentsV2(
              interaction,
              "Set Item Shop",
              ["Only server owners and bot managers can update shop listings."],
              [],
              { ephemeral: true }
            );
            return;
          }

          const itemId = interaction.options.getString("item", true);
          const inShop = interaction.options.getBoolean("in_shop", true);
          const item = getInventoryItemById(interaction.guildId, itemId);

          if (!item) {
            await replyComponentsV2(
              interaction,
              "Set Item Shop",
              ["That inventory item does not exist in this server."],
              [],
              { ephemeral: true }
            );
            return;
          }

          item.inShop = inShop;
          saveInventoryItems();

          await replyComponentsV2(
            interaction,
            "Shop Listing Updated",
            [
              `${SUCCESSFUL_EMOJI_RAW} **${item.name}** is now ${inShop ? "listed in" : "removed from"} /shop.`
            ],
            [],
            { ephemeral: true }
          );
          return;
        }
      }

      if (interaction.commandName === "bot-say") {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          await replyComponentsV2(
            interaction,
            "Bot Say",
            ["You do not have permission to use this command."],
            [],
            { ephemeral: true }
          );
          return;
        }

        if (!interaction.inGuild()) {
          await replyComponentsV2(
            interaction,
            "Bot Say",
            ["This command can only be used in a server."],
            [],
            { ephemeral: true }
          );
          return;
        }

        const message = interaction.options.getString("message", true);
        const targetChannel = interaction.options.getChannel("channel", false) || interaction.channel;

        if (!targetChannel || !targetChannel.isTextBased()) {
          await replyComponentsV2(
            interaction,
            "Bot Say",
            ["Target channel must be text-based."],
            [],
            { ephemeral: true }
          );
          return;
        }

        await targetChannel.send({
          content: message,
          allowedMentions: { parse: [] }
        });

        await replyComponentsV2(
          interaction,
          "Bot Say",
          ["Message sent."],
          [],
          { ephemeral: true }
        );
        return;
      }

      if (interaction.commandName === "shop") {
        if (!interaction.inGuild()) {
          await replyComponentsV2(
            interaction,
            "Shop",
            ["This command can only be used in a server."],
            [],
            { ephemeral: true }
          );
          return;
        }

        const shopView = buildShopView(interaction.guildId, interaction.user.id, 0);
        await interaction.reply({
          flags: 32768,
          components: shopView.components,
          ephemeral: true
        });
        return;
      }

      if (interaction.commandName === "premium") {
        const firstSkuId = DISCORD_PREMIUM_SLOT_SKU_IDS.size > 0
          ? Array.from(DISCORD_PREMIUM_SLOT_SKU_IDS)[0]
          : null;

        const messageContent = [
          `**Premium Features Subscription**`,
          ``,
          `• Subscribe to unlock **+${DISCORD_PREMIUM_SUBSCRIPTION_SLOTS} extra character slots**, custom card backgrounds, and more.`,
          `• Slots are active for as long as your subscription is running.`,
          `• If you cancel, the subscription slots disappear but your characters are never deleted.`,
          `• After subscribing, run \`/wallet\` to confirm your slots are active.`
        ].join("\n");

        if (firstSkuId) {
          try {
            const premiumRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setStyle(ButtonStyle.Premium)
                .setSkuId(firstSkuId)
            );
            await interaction.reply({
              content: messageContent,
              components: [premiumRow],
              ephemeral: true
            });
            return;
          } catch (premiumButtonError) {
            console.error("Premium button reply failed, falling back to text:", premiumButtonError);
          }
        }

        // Fallback: plain text only (no buttons)
        const appId = client.application?.id || process.env.CLIENT_ID || "";
        const purchaseUrl = DISCORD_PREMIUM_PURCHASE_URL || (appId ? `https://discord.com/application-directory/${appId}` : "");
        const fallbackLines = messageContent + (purchaseUrl ? `\n\nPurchase link: ${purchaseUrl}` : "");
        await interaction.reply({ content: fallbackLines, ephemeral: true });
        return;
      }

      if (interaction.commandName === "help") {
        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
        const helpView = buildHelpView(interaction.guildId, interaction.user.id, isAdmin, 0);
        await interaction.reply({
          flags: 32768,
          components: helpView.components,
          ephemeral: true
        });
        return;
      }

      if (interaction.commandName === "tutorial") {
        const tutorialView = buildTutorialView(interaction.guildId, interaction.user.id, 0);
        await interaction.reply({
          flags: 32768,
          components: tutorialView.components,
          ephemeral: true
        });
        return;
      }

      await replyComponentsV2(
        interaction,
        "Unknown Command",
        ["This command is not available right now. Please run /help and try again."],
        [],
        { ephemeral: true }
      );
      return;

    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith("adm:u:")) {
        if (!interaction.inGuild()) {
          await interaction.reply({
            content: "This button only works in a server.",
            flags: 32768,
            ephemeral: true
          });
          return;
        }

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          await interaction.reply({
            content: "You do not have permission to use this panel.",
            flags: 32768,
            ephemeral: true
          });
          return;
        }

        const parts = interaction.customId.split(":");
        const action = parts[2];
        const targetUserId = parts[3];
        const characterId = parts[4];

        if (action === "pe") {
          const userProfile = userProfiles[targetUserId] || {};
          const modal = {
            title: "Admin Edit User Profile",
            custom_id: `adm:u:pm:${targetUserId}`,
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 4,
                    custom_id: "nickname",
                    style: 1,
                    label: "Nickname",
                    placeholder: "Leave empty to keep current value",
                    value: userProfile.nickname || "",
                    required: false,
                    max_length: 100
                  }
                ]
              },
              {
                type: 1,
                components: [
                  {
                    type: 4,
                    custom_id: "about",
                    style: 2,
                    label: "About",
                    placeholder: "Leave empty to keep current value",
                    value: userProfile.about || "",
                    required: false,
                    max_length: 300
                  }
                ]
              },
              {
                type: 1,
                components: [
                  {
                    type: 4,
                    custom_id: "interests",
                    style: 2,
                    label: "Interests",
                    placeholder: "Leave empty to keep current value",
                    value: userProfile.interests || "",
                    required: false,
                    max_length: 200
                  }
                ]
              }
            ]
          };

          await interaction.showModal(modal);
          return;
        }

        if (action === "pd") {
          await interaction.update({
            flags: 32768,
            components: buildComponentsBox(
              "Delete User Profile",
              [
                `Are you sure you want to delete <@${targetUserId}>'s profile?`,
                "This action cannot be undone."
              ],
              [
                {
                  type: 1,
                  components: [
                    {
                      type: 2,
                      style: 4,
                      label: "Confirm Delete",
                      custom_id: `adm:u:pdc:${targetUserId}`
                    },
                    {
                      type: 2,
                      style: 2,
                      label: "Cancel",
                      custom_id: `adm:u:pdx:${targetUserId}`
                    }
                  ]
                }
              ]
            )
          });
          return;
        }

        if (action === "pdc") {
          delete userProfiles[targetUserId];
          saveUserProfiles();

          await interaction.update({
            flags: 32768,
            components: buildAdminUserEditPanel(
              interaction.guildId,
              targetUserId,
              `<:success:1479234774861221898> Deleted profile for <@${targetUserId}>.`
            )
          });
          return;
        }

        if (action === "pdx") {
          await interaction.update({
            flags: 32768,
            components: buildAdminUserEditPanel(
              interaction.guildId,
              targetUserId,
              `${UNSUCCESSFUL_EMOJI_RAW} Profile deletion cancelled.`
            )
          });
          return;
        }

        if (action === "ce") {
          const character = getCharacterById(characterId, interaction.guildId);
          if (!character) {
            await interaction.update({
              flags: 32768,
              components: buildAdminUserEditPanel(
                interaction.guildId,
                targetUserId,
                `${UNSUCCESSFUL_EMOJI_RAW} Character \`${characterId}\` no longer exists.`
              )
            });
            return;
          }

          const editBoxComponents = [
            { type: 10, content: `## Edit ${character.name}` },
            { type: 14, divider: true, spacing: 1 },
            { type: 10, content: "Choose which section you want to edit." },
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 2,
                  label: "Edit Basic Info",
                  custom_id: `edit_basic_${characterId}`
                },
                {
                  type: 2,
                  style: 2,
                  label: "Edit More Fields",
                  custom_id: `edit_more_${characterId}`
                },
                {
                  type: 2,
                  style: 2,
                  label: "Edit Media",
                  custom_id: `edit_media_${characterId}`
                },
                {
                  type: 2,
                  style: 2,
                  label: "Edit Card Style",
                  custom_id: `edit_card_style_${characterId}`
                },
                {
                  type: 2,
                  style: 2,
                  label: "Select Title",
                  custom_id: `edit_title_${characterId}`
                }
              ]
            }
          ];

          await interaction.update({
            flags: 32768,
            components: [{ type: 17, components: editBoxComponents }]
          });
          return;
        }

        if (action === "cd") {
          await interaction.update({
            flags: 32768,
            components: buildComponentsBox(
              "Delete Character",
              [
                `Are you sure you want to delete character \`${characterId}\`?`,
                "This action cannot be undone."
              ],
              [
                {
                  type: 1,
                  components: [
                    {
                      type: 2,
                      style: 4,
                      label: "Confirm Delete",
                      custom_id: `adm:u:cdc:${targetUserId}:${characterId}`
                    },
                    {
                      type: 2,
                      style: 2,
                      label: "Cancel",
                      custom_id: `adm:u:cdx:${targetUserId}:${characterId}`
                    }
                  ]
                }
              ]
            )
          });
          return;
        }

        if (action === "cdc") {
          const deletedCharacter = deleteCharacterFromGuild(interaction.guildId, characterId);
          const statusLine = deletedCharacter
            ? `<:success:1479234774861221898> Deleted character **${deletedCharacter.name}** (\`${characterId}\`).`
            : `${UNSUCCESSFUL_EMOJI_RAW} Character \`${characterId}\` no longer exists.`;

          await interaction.update({
            flags: 32768,
            components: buildAdminUserEditPanel(interaction.guildId, targetUserId, statusLine)
          });
          return;
        }

        if (action === "cdx") {
          await interaction.update({
            flags: 32768,
            components: buildAdminUserEditPanel(
              interaction.guildId,
              targetUserId,
              `${UNSUCCESSFUL_EMOJI_RAW} Character deletion cancelled.`
            )
          });
          return;
        }
      }

      if (interaction.customId.startsWith("shoprole:")) {
        if (!interaction.inGuild()) {
          await interaction.reply({
            content: "This button only works in a server.",
            flags: 32768,
            ephemeral: true
          });
          return;
        }

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          await interaction.reply({
            content: "You do not have permission to manage shop items.",
            flags: 32768,
            ephemeral: true
          });
          return;
        }

        const parts = interaction.customId.split(":");
        const action = parts[1];
        const itemId = parts[2];

        if (action === "add") {
          const walletType = normalizeRoleItemWallet(parts[2]);
          const modal = buildRoleShopAddModal(walletType);

          await interaction.showModal(modal);
          return;
        }

        if (action === "refresh") {
          await interaction.update({
            flags: 32768,
            components: buildRoleShopAdminPanel(interaction.guildId)
          });
          return;
        }

        if (action === "delete") {
          const roleItem = getShopRoleItemsForGuild(interaction.guildId).find((item) => item.id === itemId);
          if (!roleItem) {
            await interaction.update({
              flags: 32768,
              components: buildRoleShopAdminPanel(
                interaction.guildId,
                `${UNSUCCESSFUL_EMOJI_RAW} Item no longer exists.`
              )
            });
            return;
          }

          await interaction.update({
            flags: 32768,
            components: buildComponentsBox(
              "Delete Shop Item",
              [
                `Delete **${roleItem.name}** for <@&${roleItem.roleId}>?`,
                "This action cannot be undone."
              ],
              [
                {
                  type: 1,
                  components: [
                    {
                      type: 2,
                      style: 4,
                      label: "Confirm Delete",
                      custom_id: `shoprole:delete-confirm:${itemId}`
                    },
                    {
                      type: 2,
                      style: 2,
                      label: "Cancel",
                      custom_id: "shoprole:delete-cancel"
                    }
                  ]
                }
              ]
            )
          });
          return;
        }

        if (action === "delete-confirm") {
          const targetIndex = shopRoleItems.findIndex(
            (item) => item.guildId === interaction.guildId && item.id === itemId
          );

          if (targetIndex >= 0) {
            const [removedItem] = shopRoleItems.splice(targetIndex, 1);
            saveShopRoleItems();
            await interaction.update({
              flags: 32768,
              components: buildRoleShopAdminPanel(
                interaction.guildId,
                `<:success:1479234774861221898> Deleted shop item **${removedItem.name}**.`
              )
            });
          } else {
            await interaction.update({
              flags: 32768,
              components: buildRoleShopAdminPanel(
                interaction.guildId,
                `${UNSUCCESSFUL_EMOJI_RAW} Item no longer exists.`
              )
            });
          }
          return;
        }

        if (action === "delete-cancel") {
          await interaction.update({
            flags: 32768,
            components: buildRoleShopAdminPanel(
              interaction.guildId,
              `${UNSUCCESSFUL_EMOJI_RAW} Deletion cancelled.`
            )
          });
          return;
        }
      }

      if (interaction.customId.startsWith("titles:")) {
        if (!interaction.inGuild()) {
          await interaction.reply({
            content: "This button only works in a server.",
            flags: 32768,
            ephemeral: true
          });
          return;
        }

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          await interaction.reply({
            content: "You do not have permission to manage titles.",
            flags: 32768,
            ephemeral: true
          });
          return;
        }

        const titleParts = interaction.customId.split(":");
        const titleAction = titleParts[1];
        const titleItemId = titleParts[2];

        if (titleAction === "add") {
          await interaction.showModal(buildTitleAddModal());
          return;
        }

        if (titleAction === "refresh") {
          await interaction.update({
            flags: 32768,
            components: buildTitleAdminPanel(interaction.guildId)
          });
          return;
        }

        if (titleAction === "delete") {
          const titleItem = getTitleById(interaction.guildId, titleItemId);
          if (!titleItem) {
            await interaction.update({
              flags: 32768,
              components: buildTitleAdminPanel(
                interaction.guildId,
                `${UNSUCCESSFUL_EMOJI_RAW} Title no longer exists.`
              )
            });
            return;
          }

          await interaction.update({
            flags: 32768,
            components: buildComponentsBox(
              "Delete Title",
              [
                `Delete title **${titleItem.name}**?`,
                "Characters who own this title will keep it, but it will no longer appear in the shop."
              ],
              [
                {
                  type: 1,
                  components: [
                    {
                      type: 2,
                      style: 4,
                      label: "Confirm Delete",
                      custom_id: `titles:delete-confirm:${titleItemId}`
                    },
                    {
                      type: 2,
                      style: 2,
                      label: "Cancel",
                      custom_id: "titles:delete-cancel"
                    }
                  ]
                }
              ]
            )
          });
          return;
        }

        if (titleAction === "delete-confirm") {
          const targetIndex = titles.findIndex(
            (t) => t.guildId === interaction.guildId && t.id === titleItemId
          );

          if (targetIndex >= 0) {
            const [removedTitle] = titles.splice(targetIndex, 1);
            saveTitles();
            await interaction.update({
              flags: 32768,
              components: buildTitleAdminPanel(
                interaction.guildId,
                `<:success:1479234774861221898> Deleted title **${removedTitle.name}**.`
              )
            });
          } else {
            await interaction.update({
              flags: 32768,
              components: buildTitleAdminPanel(
                interaction.guildId,
                `${UNSUCCESSFUL_EMOJI_RAW} Title no longer exists.`
              )
            });
          }
          return;
        }

        if (titleAction === "delete-cancel") {
          await interaction.update({
            flags: 32768,
            components: buildTitleAdminPanel(
              interaction.guildId,
              `${UNSUCCESSFUL_EMOJI_RAW} Deletion cancelled.`
            )
          });
          return;
        }
      }

      if (interaction.customId.startsWith("setup:panel:")) {
        if (!interaction.inGuild()) {
          await interaction.reply({
            content: "This button only works in a server.",
            flags: 32768,
            ephemeral: true
          });
          return;
        }

        if (!hasAdminAccess(interaction)) {
          await interaction.reply({
            content: "You do not have permission to manage setup.",
            flags: 32768,
            ephemeral: true
          });
          return;
        }

        const action = interaction.customId.slice("setup:panel:".length);

        if (action === "refresh") {
          await interaction.update({
            flags: 32768,
            components: buildSetupAdminPanel(interaction.guildId)
          });
          return;
        }

        if (action.startsWith("remove-admin-role-confirm:")) {
          const roleId = action.slice("remove-admin-role-confirm:".length);
          const role = roleId ? interaction.guild.roles.cache.get(roleId) : null;

          if (!roleId || !getAdminRoleIds(interaction.guildId).includes(roleId)) {
            await interaction.update({
              flags: 32768,
              components: buildSetupAdminPanel(
                interaction.guildId,
                `${UNSUCCESSFUL_EMOJI_RAW} That role is not currently configured.`
              )
            });
            return;
          }

          removeAdminRoleId(interaction.guildId, roleId);
          await interaction.update({
            flags: 32768,
            components: buildSetupAdminPanel(
              interaction.guildId,
              `<:success:1479234774861221898> Removed ${role ? `<@&${role.id}>` : `role \`${roleId}\``} from admin roles.`
            )
          });
          return;
        }

        if (action === "remove-admin-role-cancel") {
          await interaction.update({
            flags: 32768,
            components: buildSetupAdminPanel(
              interaction.guildId,
              `${UNSUCCESSFUL_EMOJI_RAW} Admin role removal cancelled.`
            )
          });
          return;
        }

        if (action.startsWith("remove-dm-role-confirm:")) {
          const roleId = action.slice("remove-dm-role-confirm:".length);
          const role = roleId ? interaction.guild.roles.cache.get(roleId) : null;

          if (!roleId || !getDungeonMasterRoleIds(interaction.guildId).includes(roleId)) {
            await interaction.update({
              flags: 32768,
              components: buildSetupAdminPanel(
                interaction.guildId,
                `${UNSUCCESSFUL_EMOJI_RAW} That role is not currently configured as a dungeon master role.`
              )
            });
            return;
          }

          removeDungeonMasterRoleId(interaction.guildId, roleId);
          await interaction.update({
            flags: 32768,
            components: buildSetupAdminPanel(
              interaction.guildId,
              `<:success:1479234774861221898> Removed ${role ? `<@&${role.id}>` : `role \`${roleId}\``} from dungeon master roles.`
            )
          });
          return;
        }

        if (action === "remove-dm-role-cancel") {
          await interaction.update({
            flags: 32768,
            components: buildSetupAdminPanel(
              interaction.guildId,
              `${UNSUCCESSFUL_EMOJI_RAW} Dungeon master role removal cancelled.`
            )
          });
          return;
        }

        if (action === "clear-logs-confirm") {
          setLogsChannelIdForGuild(interaction.guildId, null);
          await interaction.update({
            flags: 32768,
            components: buildSetupAdminPanel(
              interaction.guildId,
              `<:success:1479234774861221898> Logs channel cleared.`
            )
          });
          return;
        }

        if (action === "clear-logs-cancel") {
          await interaction.update({
            flags: 32768,
            components: buildSetupAdminPanel(
              interaction.guildId,
              `${UNSUCCESSFUL_EMOJI_RAW} Logs channel clear cancelled.`
            )
          });
          return;
        }

        if (action === "clear-say-channels-confirm") {
          setSayAllowedChannelIds(interaction.guildId, []);
          await interaction.update({
            flags: 32768,
            components: buildSetupAdminPanel(
              interaction.guildId,
              `<:success:1479234774861221898> Cleared /say channel restrictions. /say is now allowed in all channels.`
            )
          });
          return;
        }

        if (action === "clear-say-channels-cancel") {
          await interaction.update({
            flags: 32768,
            components: buildSetupAdminPanel(
              interaction.guildId,
              `${UNSUCCESSFUL_EMOJI_RAW} /say channel clear cancelled.`
            )
          });
          return;
        }

        if (action === "enable-roleplay") {
          setRoleplayEnabledForGuild(interaction.guildId, true);
          await interaction.update({
            flags: 32768,
            components: buildSetupAdminPanel(
              interaction.guildId,
              `${SUCCESSFUL_EMOJI_RAW} Roleplay enabled. Everyone can use /say commands.`
            )
          });
          return;
        }

        if (action === "disable-roleplay") {
          setRoleplayEnabledForGuild(interaction.guildId, false);
          await interaction.update({
            flags: 32768,
            components: buildSetupAdminPanel(
              interaction.guildId,
              `${SUCCESSFUL_EMOJI_RAW} Roleplay disabled for normal users. Only admins and bot managers can use /say commands.`
            )
          });
          return;
        }

        if (action === "add-admin-role") {
          await interaction.reply({
            content: "Choose a role from the dropdown.",
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 6,
                    custom_id: "setup:panel:add-admin-role:select",
                    placeholder: "Select a role to add as admin",
                    min_values: 1,
                    max_values: 1
                  }
                ]
              }
            ],
            ephemeral: true
          });
          return;
        }

        if (action === "add-dm-role") {
          await interaction.reply({
            content: "Choose a role from the dropdown.",
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 6,
                    custom_id: "setup:panel:add-dm-role:select",
                    placeholder: "Select a role to add as dungeon master",
                    min_values: 1,
                    max_values: 1
                  }
                ]
              }
            ],
            ephemeral: true
          });
          return;
        }

        if (action === "remove-admin-role") {
          const adminRoleIds = getAdminRoleIds(interaction.guildId);
          if (adminRoleIds.length === 0) {
            await interaction.reply({
              ephemeral: true,
              components: buildSetupAdminPanel(
                interaction.guildId,
                `${UNSUCCESSFUL_EMOJI_RAW} No admin roles configured.`
              )
            });
            return;
          }

          const options = adminRoleIds
            .map((roleId) => interaction.guild.roles.cache.get(roleId))
            .filter(Boolean)
            .slice(0, 25)
            .map((role) => ({
              label: role.name.slice(0, 100),
              value: role.id,
              description: `ID: ${role.id}`.slice(0, 100)
            }));

          if (options.length === 0) {
            await interaction.reply({
              ephemeral: true,
              components: buildSetupAdminPanel(
                interaction.guildId,
                `${UNSUCCESSFUL_EMOJI_RAW} Configured admin roles were not found in this server.`
              )
            });
            return;
          }

          await interaction.reply({
            content: "Choose an admin role to remove.",
            ephemeral: true,
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 3,
                    custom_id: "setup:panel:remove-admin-role:select",
                    placeholder: "Select an admin role to remove",
                    min_values: 1,
                    max_values: 1,
                    options
                  }
                ]
              }
            ]
          });
          return;
        }

        if (action === "remove-dm-role") {
          const dungeonRoleIds = getDungeonMasterRoleIds(interaction.guildId);
          if (dungeonRoleIds.length === 0) {
            await interaction.reply({
              ephemeral: true,
              components: buildSetupAdminPanel(
                interaction.guildId,
                `${UNSUCCESSFUL_EMOJI_RAW} No dungeon master roles configured.`
              )
            });
            return;
          }

          const options = dungeonRoleIds
            .map((roleId) => interaction.guild.roles.cache.get(roleId))
            .filter(Boolean)
            .slice(0, 25)
            .map((role) => ({
              label: role.name.slice(0, 100),
              value: role.id,
              description: `ID: ${role.id}`.slice(0, 100)
            }));

          if (options.length === 0) {
            await interaction.reply({
              ephemeral: true,
              components: buildSetupAdminPanel(
                interaction.guildId,
                `${UNSUCCESSFUL_EMOJI_RAW} Configured dungeon master roles were not found in this server.`
              )
            });
            return;
          }

          await interaction.reply({
            content: "Choose a dungeon master role to remove.",
            ephemeral: true,
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 3,
                    custom_id: "setup:panel:remove-dm-role:select",
                    placeholder: "Select a dungeon master role to remove",
                    min_values: 1,
                    max_values: 1,
                    options
                  }
                ]
              }
            ]
          });
          return;
        }

        if (action === "set-logs") {
          await interaction.reply({
            content: "Choose the logs channel.",
            ephemeral: true,
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 8,
                    custom_id: "setup:panel:set-logs:select",
                    placeholder: "Select a logs channel",
                    min_values: 1,
                    max_values: 1,
                    channel_types: [0, 5, 11, 12, 15]
                  }
                ]
              }
            ]
          });
          return;
        }

        if (action === "set-say-channels") {
          await interaction.reply({
            content: "Choose the channels where /say is allowed. If no channels are configured, /say is allowed everywhere.",
            ephemeral: true,
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 8,
                    custom_id: "setup:panel:set-say-channels:select",
                    placeholder: "Select channels where /say is allowed",
                    min_values: 1,
                    max_values: 25,
                    channel_types: [0, 5, 15]
                  }
                ]
              }
            ]
          });
          return;
        }

        if (action === "clear-logs") {
          await interaction.update({
            flags: 32768,
            components: buildComponentsBox(
              "Clear Logs Channel",
              [
                "Are you sure you want to clear the configured logs channel?",
                "This will remove the current logs channel setting for this server."
              ],
              [
                {
                  type: 1,
                  components: [
                    {
                      type: 2,
                      style: 4,
                      label: "Confirm Clear",
                      custom_id: "setup:panel:clear-logs-confirm"
                    },
                    {
                      type: 2,
                      style: 2,
                      label: "Cancel",
                      custom_id: "setup:panel:clear-logs-cancel"
                    }
                  ]
                }
              ]
            )
          });
          return;
        }

        if (action === "clear-say-channels") {
          await interaction.update({
            flags: 32768,
            components: buildComponentsBox(
              "Clear /say Channels",
              [
                "Are you sure you want to clear all /say channel restrictions?",
                "After this, /say will be allowed in all channels for this server."
              ],
              [
                {
                  type: 1,
                  components: [
                    {
                      type: 2,
                      style: 4,
                      label: "Confirm Clear",
                      custom_id: "setup:panel:clear-say-channels-confirm"
                    },
                    {
                      type: 2,
                      style: 2,
                      label: "Cancel",
                      custom_id: "setup:panel:clear-say-channels-cancel"
                    }
                  ]
                }
              ]
            )
          });
          return;
        }
      }

      if (interaction.customId.startsWith("help:page:")) {
        const requestedPage = Number(interaction.customId.split(":")[2] || 0);
        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
        const helpView = buildHelpView(interaction.guildId, interaction.user.id, isAdmin, requestedPage);
        await interaction.update({
          flags: 32768,
          components: helpView.components
        });
        return;
      }

      if (interaction.customId.startsWith("tutorial:page:")) {
        const requestedPage = Number(interaction.customId.split(":")[2] || 0);
        const tutorialView = buildTutorialView(interaction.guildId, interaction.user.id, requestedPage);
        await interaction.update({
          flags: 32768,
          components: tutorialView.components
        });
        return;
      }

      if (interaction.customId.startsWith("shop:page:")) {
        if (!interaction.inGuild()) {
          await interaction.reply({
            content: "This button only works in a server.",
            flags: 32768,
            ephemeral: true
          });
          return;
        }

        const requestedPage = Number(interaction.customId.split(":")[2] || 0);
        const shopView = buildShopView(interaction.guildId, interaction.user.id, requestedPage);
        await interaction.update({
          flags: 32768,
          components: shopView.components
        });
        return;
      }

      if (interaction.customId.startsWith("shop:buy:")) {
        if (!interaction.inGuild()) {
          await interaction.reply({
            content: "This button only works in a server.",
            flags: 32768,
            ephemeral: true
          });
          return;
        }

        const buyPayload = interaction.customId.slice("shop:buy:".length);
        const lastSeparatorIndex = buyPayload.lastIndexOf(":");
        const itemId = lastSeparatorIndex >= 0
          ? buyPayload.slice(0, lastSeparatorIndex)
          : buyPayload;
        const parsedPage = lastSeparatorIndex >= 0
          ? Number(buyPayload.slice(lastSeparatorIndex + 1))
          : 0;
        const page = Number.isFinite(parsedPage) ? parsedPage : 0;
        let statusLine = `${UNSUCCESSFUL_EMOJI_RAW} Purchase failed. Try again.`;

        if (itemId === "slot") {
          const userId = interaction.user.id;
          const currentBaseSlots = getStoredUserCharacterSlotLimit(interaction.guildId, userId);
          const slotCost = getNextSlotCost(currentBaseSlots);
          const currentPoints = getUserPoints(interaction.guildId, userId);

          if (currentBaseSlots >= MAX_CHARACTER_SLOTS) {
            statusLine = `${UNSUCCESSFUL_EMOJI_RAW} You already have the maximum base slots (${MAX_CHARACTER_SLOTS}).`;
          } else 
          if (currentPoints < slotCost) {
            statusLine = `${UNSUCCESSFUL_EMOJI_RAW} Not enough user points: ${formatPointsWithEmoji(currentPoints)}/${formatPointsWithEmoji(slotCost)}`;
          } else if (spendPoints(interaction.guildId, userId, slotCost)) {
            increaseUserCharacterSlots(interaction.guildId, userId, 1);
            const newBaseSlots = getStoredUserCharacterSlotLimit(interaction.guildId, userId);
            const newTotalSlots = getUserCharacterSlotLimit(interaction.guildId, userId);
            statusLine = `<:success:1479234774861221898> Bought +1 base slot. You now have ${newTotalSlots} total slots (Base ${newBaseSlots} + Premium ${getPremiumSlotBonus(interaction.guildId, userId)}).`;
          }
        } else if (itemId.startsWith("role:")) {
          const shopRoleItemId = itemId.slice("role:".length);
          const roleItem = getShopRoleItemsForGuild(interaction.guildId)
            .find((item) => item.id === shopRoleItemId);

          if (!roleItem) {
            statusLine = `${UNSUCCESSFUL_EMOJI_RAW} This shop item no longer exists.`;
          } else {
            const guild = interaction.guild;
            const member = guild ? await guild.members.fetch(interaction.user.id).catch(() => null) : null;
            const role = guild?.roles?.cache?.get(roleItem.roleId) || null;

            if (!member) {
              statusLine = `${UNSUCCESSFUL_EMOJI_RAW} Could not resolve your guild member data.`;
            } else if (!role) {
              statusLine = `${UNSUCCESSFUL_EMOJI_RAW} The configured role no longer exists.`;
            } else if (member.roles.cache.has(role.id)) {
              statusLine = `${UNSUCCESSFUL_EMOJI_RAW} You already own this role.`;
            } else if (!role.editable || role.managed) {
              statusLine = `${UNSUCCESSFUL_EMOJI_RAW} Bot cannot grant this role.`;
            } else {
              const walletType = normalizeRoleItemWallet(roleItem.wallet);

              if (walletType === "character") {
                const selectedCharacterId = getSelectedCharacterId(interaction.guildId, interaction.user.id);
                if (!selectedCharacterId) {
                  statusLine = `${UNSUCCESSFUL_EMOJI_RAW} Select a character first with /character pick.`;
                } else if (getAssignedUserId(interaction.guildId, selectedCharacterId) !== interaction.user.id) {
                  statusLine = `${UNSUCCESSFUL_EMOJI_RAW} Your selected character is not assigned to you.`;
                } else {
                  const charPoints = getCharacterPoints(interaction.guildId, selectedCharacterId);
                  if (charPoints < roleItem.price) {
                    statusLine = `${UNSUCCESSFUL_EMOJI_RAW} Not enough character points: ${formatPointsWithEmoji(charPoints)}/${formatPointsWithEmoji(roleItem.price)}`;
                  } else if (spendCharacterPoints(interaction.guildId, selectedCharacterId, roleItem.price)) {
                    try {
                      await member.roles.add(role);
                      statusLine = `<:success:1479234774861221898> Bought **${roleItem.name}** and received <@&${role.id}>.`;
                    } catch (error) {
                      addCharacterPoints(interaction.guildId, selectedCharacterId, roleItem.price);
                      statusLine = `${UNSUCCESSFUL_EMOJI_RAW} Purchase failed because role assignment was blocked.`;
                    }
                  }
                }
              } else {
                const currentPoints = getUserPoints(interaction.guildId, interaction.user.id);
                if (currentPoints < roleItem.price) {
                  statusLine = `${UNSUCCESSFUL_EMOJI_RAW} Not enough user points: ${formatPointsWithEmoji(currentPoints)}/${formatPointsWithEmoji(roleItem.price)}`;
                } else if (spendPoints(interaction.guildId, interaction.user.id, roleItem.price)) {
                  try {
                    await member.roles.add(role);
                    statusLine = `<:success:1479234774861221898> Bought **${roleItem.name}** and received <@&${role.id}>.`;
                  } catch (error) {
                    addPoints(interaction.guildId, interaction.user.id, roleItem.price);
                    statusLine = `${UNSUCCESSFUL_EMOJI_RAW} Purchase failed because role assignment was blocked.`;
                  }
                }
              }
            }
          }
        } else if (itemId.startsWith("inv:")) {
          const inventoryItemId = itemId.slice("inv:".length);
          const inventoryItem = getInventoryItemById(interaction.guildId, inventoryItemId);

          if (!inventoryItem || inventoryItem.inShop !== true) {
            statusLine = `${UNSUCCESSFUL_EMOJI_RAW} This inventory item is not currently listed in /shop.`;
          } else {
            const walletType = normalizeRoleItemWallet(inventoryItem.wallet);

            if (walletType === "character") {
              const selectedCharacterId = getSelectedCharacterId(interaction.guildId, interaction.user.id);
              if (!selectedCharacterId) {
                statusLine = `${UNSUCCESSFUL_EMOJI_RAW} Select a character first with /character pick.`;
              } else if (getAssignedUserId(interaction.guildId, selectedCharacterId) !== interaction.user.id) {
                statusLine = `${UNSUCCESSFUL_EMOJI_RAW} Your selected character is not assigned to you.`;
              } else {
                const charPoints = getCharacterPoints(interaction.guildId, selectedCharacterId);
                if (charPoints < inventoryItem.price) {
                  statusLine = `${UNSUCCESSFUL_EMOJI_RAW} Not enough character points: ${formatPointsWithEmoji(charPoints)}/${formatPointsWithEmoji(inventoryItem.price)}`;
                } else if (spendCharacterPoints(interaction.guildId, selectedCharacterId, inventoryItem.price)) {
                  addInventoryItemToUser(interaction.guildId, interaction.user.id, inventoryItem.id, 1, selectedCharacterId);
                  const holderCharacter = getCharacterById(selectedCharacterId, interaction.guildId);
                  statusLine = `${SUCCESSFUL_EMOJI_RAW} Bought **${inventoryItem.name}**. Holder: **${holderCharacter?.name || selectedCharacterId}**.`;
                }
              }
            } else {
              const currentPoints = getUserPoints(interaction.guildId, interaction.user.id);
              if (currentPoints < inventoryItem.price) {
                statusLine = `${UNSUCCESSFUL_EMOJI_RAW} Not enough user points: ${formatPointsWithEmoji(currentPoints)}/${formatPointsWithEmoji(inventoryItem.price)}`;
              } else if (spendPoints(interaction.guildId, interaction.user.id, inventoryItem.price)) {
                addInventoryItemToUser(interaction.guildId, interaction.user.id, inventoryItem.id, 1, null);
                statusLine = `${SUCCESSFUL_EMOJI_RAW} Bought **${inventoryItem.name}** and added it to your inventory.`;
              }
            }
          }
        } else if (itemId.startsWith("upgrade:")) {
          const upgradeId = itemId.slice("upgrade:".length);
          const upgrade = CHARACTER_UPGRADE_DEFINITIONS[upgradeId];
          const selectedCharacterId = getSelectedCharacterId(interaction.guildId, interaction.user.id);

          if (!upgrade) {
            statusLine = `${UNSUCCESSFUL_EMOJI_RAW} Unknown upgrade.`;
          } else if (!selectedCharacterId) {
            statusLine = `${UNSUCCESSFUL_EMOJI_RAW} Select a character first with /character pick.`;
          } else if (getAssignedUserId(interaction.guildId, selectedCharacterId) !== interaction.user.id) {
            statusLine = `${UNSUCCESSFUL_EMOJI_RAW} Your selected character is not assigned to you.`;
          } else if (hasCharacterUpgrade(interaction.guildId, selectedCharacterId, upgradeId)) {
            statusLine = `${UNSUCCESSFUL_EMOJI_RAW} Selected character already owns this upgrade.`;
          } else {
            const charPoints = getCharacterPoints(interaction.guildId, selectedCharacterId);
            if (charPoints < upgrade.cost) {
              statusLine = `${UNSUCCESSFUL_EMOJI_RAW} Not enough character points: ${formatPointsWithEmoji(charPoints)}/${formatPointsWithEmoji(upgrade.cost)}`;
            } else if (spendCharacterPoints(interaction.guildId, selectedCharacterId, upgrade.cost)) {
              addCharacterUpgrade(interaction.guildId, selectedCharacterId, upgradeId);
              const character = getCharacterById(selectedCharacterId, interaction.guildId);
              statusLine = `<:success:1479234774861221898> Bought ${upgrade.name} for ${character?.name || selectedCharacterId}.`;
            }
          }
        } else if (itemId.startsWith("title:")) {
          const titleId = itemId.slice("title:".length);
          const titleItem = getTitleById(interaction.guildId, titleId);

          if (!titleItem) {
            statusLine = `${UNSUCCESSFUL_EMOJI_RAW} This title no longer exists.`;
          } else if (hasTitle(interaction.guildId, interaction.user.id, titleId)) {
            statusLine = `${UNSUCCESSFUL_EMOJI_RAW} You already own this title.`;
          } else {
            const currentPoints = getUserPoints(interaction.guildId, interaction.user.id);
            if (currentPoints < titleItem.price) {
              statusLine = `${UNSUCCESSFUL_EMOJI_RAW} Not enough user points: ${formatPointsWithEmoji(currentPoints)}/${formatPointsWithEmoji(titleItem.price)}`;
            } else if (spendPoints(interaction.guildId, interaction.user.id, titleItem.price)) {
              addTitleToUser(interaction.guildId, interaction.user.id, titleId);
              statusLine = `<:success:1479234774861221898> Bought title **${titleItem.name}**. Select it on any character via \`/character edit\`.`;
            }
          }
        }

        const shopView = buildShopView(interaction.guildId, interaction.user.id, page, statusLine);
        await interaction.update({
          flags: 32768,
          components: shopView.components
        });
        return;
      }

      if (interaction.customId === "confirm_delete" || interaction.customId === "cancel_delete") {
        // Button handler is already in the delete command above
        // This is just for safety
        return;
      }

      if (interaction.customId === "edit_user_profile") {
        const userId = interaction.user.id;

        const userProfile = userProfiles[userId] || {};

        // Show modal with current values pre-filled
        const modal = {
          title: "Edit User Profile",
          custom_id: "edit_user_profile_modal",
          components: [
            {
              type: 1,
              components: [
                {
                  type: 4,
                  custom_id: "nickname",
                  style: 1,
                  label: "Nickname",
                  placeholder: "Leave empty to keep current value",
                  value: userProfile.nickname || "",
                  required: false,
                  max_length: 100
                }
              ]
            },
            {
              type: 1,
              components: [
                {
                  type: 4,
                  custom_id: "about",
                  style: 2,
                  label: "About",
                  placeholder: "Leave empty to keep current value",
                  value: userProfile.about || "",
                  required: false,
                  max_length: 300
                }
              ]
            },
            {
              type: 1,
              components: [
                {
                  type: 4,
                  custom_id: "interests",
                  style: 2,
                  label: "Interests",
                  placeholder: "Leave empty to keep current value",
                  value: userProfile.interests || "",
                  required: false,
                  max_length: 200
                }
              ]
            }
          ]
        };

        await interaction.showModal(modal);
      }

      if (interaction.customId === "help_public" || interaction.customId === "help_admin") {
        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
        const showAdmin = interaction.customId === "help_admin";

        if (showAdmin && !isAdmin) {
          await interaction.reply({
            content: "You do not have permission to view admin commands.",
            flags: 32768,
            ephemeral: true
          });
          return;
        }

        const publicCommands = [
          { name: "/character pick", desc: "Select your active character" },
          { name: "/character profile [character]", desc: "View character details" },
          { name: "/character remove [character]", desc: "Remove character assignment" },
          { name: "/character list", desc: "List your assigned characters" },
          { name: "/character edit [character]", desc: "Edit your character info" },
          { name: "/character create-and-assign", desc: "Create and auto-assign a character" },
          { name: "/user profile [user]", desc: "View user profile" },
          { name: "/user edit", desc: "Edit your profile" },
          { name: "/wallet", desc: "View combined user + character wallet" },
          { name: "/inventory", desc: "View your inventory items and holders" },
          { name: "/shop", desc: "Buy upgrades and other shop items" },
          { name: "/premium", desc: "Get premium purchase link + steps" },
          { name: "/tutorial", desc: "Step-by-step guide for using the bot" },
          { name: "/say [message] [image] [reply_to]", desc: "Send message as your character with optional image/reply" },
          { name: "/say-edit [message_id] [message]", desc: "Edit your tracked /say message by message ID" },
          { name: "/points", desc: "View your user/character points" },
          { name: "/leaderboard [type] [limit]", desc: "View user or character rankings" }
        ];

        const adminCommands = [
          { name: "/character assign [character] [user]", desc: "Assign character to user" },
          { name: "/character create [options]", desc: "Create character (admin only)" },
          { name: "/character delete [character]", desc: "Delete character" },
          { name: "/character change-id [character] [new-id]", desc: "Change character ID" },
          { name: "/admin user edit [user]", desc: "Manage user profile + character actions" },
          { name: "/setup panel", desc: "Manage admin roles, logs channel, and /say channels" },
          { name: "/setup add-points ...", desc: "Add user/character wallet points" },
          { name: "/setup create-item ...", desc: "Create permanent or temporary inventory items" },
          { name: "/setup give-item ...", desc: "Give inventory items to a user" },
          { name: "/setup set-item-shop ...", desc: "Add/remove inventory items from /shop" },
          { name: "/setup add-role-shop-item", desc: "Open role shop item manager" },
          { name: "/setup manage-titles", desc: "Open title shop manager" },
          { name: "/character clear-webhooks", desc: "Clear webhook cache" },
          { name: "/bot-say [message] [channel]", desc: "Send message as bot" }
        ];

        const buildHelpComponents = (type) => {
          const commands = type === "public" ? publicCommands : adminCommands;
          const title = type === "public" ? "Public Commands" : "Admin Commands";
          
          const components = [
            { type: 10, content: `## ${title}` },
            { type: 14 } // Divider
          ];

          commands.forEach((cmd, index) => {
            components.push({ type: 10, content: `**${cmd.name}**\n${cmd.desc}` });
            if (index < commands.length - 1) {
              components.push({ type: 14 }); // Divider between commands
            }
          });

          // Add navigation buttons
          if (type === "public" && isAdmin) {
            components.push({ type: 14 }); // Divider
            components.push({
              type: 1,
              components: [
                {
                  type: 2,
                  style: 1,
                  custom_id: "help_admin",
                  label: "▶ Admin Commands"
                }
              ]
            });
          } else if (type === "admin") {
            components.push({ type: 14 }); // Divider
            components.push({
              type: 1,
              components: [
                {
                  type: 2,
                  style: 1,
                  custom_id: "help_public",
                  label: "◀ Public Commands"
                }
              ]
            });
          }

          return components;
        };

        const targetType = showAdmin ? "admin" : "public";
        const newComponents = buildHelpComponents(targetType);
        
        await interaction.update({
          components: [{ type: 17, components: newComponents }],
          flags: 32768
        });
      }

      if (interaction.customId.startsWith("leaderboard:")) {
        if (!interaction.inGuild()) {
          await interaction.reply({
            content: "This button only works in a server.",
            flags: 32768,
            ephemeral: true
          });
          return;
        }

        const parts = interaction.customId.split(":");
        const type = parts[1] === "characters" ? "characters" : "users";
        const offset = Number(parts[2] || 0);
        const limit = Number(parts[3] || 10);

        const view = await buildLeaderboardView(interaction.guild, type, limit, offset);
        await interaction.update({
          components: buildComponentsBox(view.title, view.lines, view.extraComponents),
          flags: 32768
        });
      }
    }

    if (
      interaction.customId.startsWith("select_title_") &&
      Array.isArray(interaction.values)
    ) {
      const characterId = interaction.customId.replace("select_title_", "");
      const character = getCharacterById(characterId, interaction.guildId);

      if (!character) {
        await interaction.reply({
          content: "Character no longer exists.",
          flags: 32768,
          ephemeral: true
        });
        return;
      }

      const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
      const isOwner = getAssignedUserId(interaction.guildId, characterId) === interaction.user.id;

      if (!isAdmin && !isOwner) {
        await interaction.reply({
          content: "You do not have permission to edit this character.",
          flags: 32768,
          ephemeral: true
        });
        return;
      }

      const selectedValue = interaction.values[0];
      if (selectedValue === "none") {
        character.selectedTitle = "";
      } else {
        const ownedIds = getOwnedTitleIds(interaction.guildId, interaction.user.id);
        if (!ownedIds.includes(selectedValue)) {
          await interaction.reply({
            content: "You don't own that title.",
            flags: 32768,
            ephemeral: true
          });
          return;
        }
        character.selectedTitle = selectedValue;
      }

      writeJson(CHARACTERS_PATH, characters);

      const titleDisplay = character.selectedTitle
        ? (getTitleById(interaction.guildId, character.selectedTitle)?.name || "Unknown")
        : "None";

      await interaction.reply({
        flags: 32768,
        components: buildComponentsBox(
          "Title Updated",
          [`${SUCCESSFUL_EMOJI_RAW} **${character.name}**'s title set to: **${titleDisplay}**`],
          []
        ),
        ephemeral: true
      });
      return;
    }

    if (
      interaction.customId === "setup:panel:add-admin-role:select" &&
      Array.isArray(interaction.values)
    ) {
        if (!interaction.inGuild() || !hasAdminAccess(interaction)) {
          await acknowledgeInteractionSilently(interaction);
          return;
        }

        const roleId = interaction.values?.[0];
        const role = roleId ? interaction.guild.roles.cache.get(roleId) : null;

        if (!role || role.id === interaction.guildId) {
          await interaction.reply({
            flags: 32768,
            components: buildSetupAdminPanel(
              interaction.guildId,
              `${UNSUCCESSFUL_EMOJI_RAW} Invalid role selection.`
            ),
            ephemeral: true
          });
          return;
        }

        if (getAdminRoleIds(interaction.guildId).includes(role.id)) {
          await interaction.reply({
            flags: 32768,
            components: buildSetupAdminPanel(
              interaction.guildId,
              `${UNSUCCESSFUL_EMOJI_RAW} <@&${role.id}> is already an admin role.`
            ),
            ephemeral: true
          });
          return;
        }

        addAdminRoleId(interaction.guildId, role.id);
        await interaction.reply({
          flags: 32768,
          components: buildSetupAdminPanel(
            interaction.guildId,
            `<:success:1479234774861221898> Added <@&${role.id}> as an admin role.`
          ),
          ephemeral: true
        });
        return;
    }

    if (
      interaction.customId === "setup:panel:remove-admin-role:select" &&
      Array.isArray(interaction.values)
    ) {
      if (!interaction.inGuild() || !hasAdminAccess(interaction)) {
        await acknowledgeInteractionSilently(interaction);
        return;
      }

      const roleId = interaction.values?.[0];
      const role = roleId ? interaction.guild.roles.cache.get(roleId) : null;

      if (!roleId) {
        await interaction.reply({
          flags: 32768,
          components: buildSetupAdminPanel(
            interaction.guildId,
            `${UNSUCCESSFUL_EMOJI_RAW} Invalid role selection.`
          ),
          ephemeral: true
        });
        return;
      }

      if (!getAdminRoleIds(interaction.guildId).includes(roleId)) {
        await interaction.reply({
          flags: 32768,
          components: buildSetupAdminPanel(
            interaction.guildId,
            `${UNSUCCESSFUL_EMOJI_RAW} That role is not currently configured.`
          ),
          ephemeral: true
        });
        return;
      }

      await interaction.reply({
        flags: 32768,
        components: buildComponentsBox(
          "Remove Admin Role",
          [
            `Are you sure you want to remove ${role ? `<@&${role.id}>` : `role \`${roleId}\``} from admin roles?`,
            "This will remove its setup-panel admin access immediately."
          ],
          [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 4,
                  label: "Confirm Remove",
                  custom_id: `setup:panel:remove-admin-role-confirm:${roleId}`
                },
                {
                  type: 2,
                  style: 2,
                  label: "Cancel",
                  custom_id: "setup:panel:remove-admin-role-cancel"
                }
              ]
            }
          ]
        ),
        ephemeral: true
      });
      return;
    }

    if (
      interaction.customId === "setup:panel:add-dm-role:select" &&
      Array.isArray(interaction.values)
    ) {
      if (!interaction.inGuild() || !hasAdminAccess(interaction)) {
        await acknowledgeInteractionSilently(interaction);
        return;
      }

      const roleId = interaction.values?.[0];
      const role = roleId ? interaction.guild.roles.cache.get(roleId) : null;

      if (!role || role.id === interaction.guildId) {
        await interaction.reply({
          flags: 32768,
          components: buildSetupAdminPanel(
            interaction.guildId,
            `${UNSUCCESSFUL_EMOJI_RAW} Invalid role selection.`
          ),
          ephemeral: true
        });
        return;
      }

      if (getDungeonMasterRoleIds(interaction.guildId).includes(role.id)) {
        await interaction.reply({
          flags: 32768,
          components: buildSetupAdminPanel(
            interaction.guildId,
            `${UNSUCCESSFUL_EMOJI_RAW} <@&${role.id}> is already a dungeon master role.`
          ),
          ephemeral: true
        });
        return;
      }

      addDungeonMasterRoleId(interaction.guildId, role.id);
      await interaction.reply({
        flags: 32768,
        components: buildSetupAdminPanel(
          interaction.guildId,
          `<:success:1479234774861221898> Added <@&${role.id}> as a dungeon master role.`
        ),
        ephemeral: true
      });
      return;
    }

    if (
      interaction.customId === "setup:panel:remove-dm-role:select" &&
      Array.isArray(interaction.values)
    ) {
      if (!interaction.inGuild() || !hasAdminAccess(interaction)) {
        await acknowledgeInteractionSilently(interaction);
        return;
      }

      const roleId = interaction.values?.[0];
      const role = roleId ? interaction.guild.roles.cache.get(roleId) : null;

      if (!roleId) {
        await interaction.reply({
          flags: 32768,
          components: buildSetupAdminPanel(
            interaction.guildId,
            `${UNSUCCESSFUL_EMOJI_RAW} Invalid role selection.`
          ),
          ephemeral: true
        });
        return;
      }

      if (!getDungeonMasterRoleIds(interaction.guildId).includes(roleId)) {
        await interaction.reply({
          flags: 32768,
          components: buildSetupAdminPanel(
            interaction.guildId,
            `${UNSUCCESSFUL_EMOJI_RAW} That role is not currently configured as a dungeon master role.`
          ),
          ephemeral: true
        });
        return;
      }

      await interaction.reply({
        flags: 32768,
        components: buildComponentsBox(
          "Remove Dungeon Master Role",
          [
            `Are you sure you want to remove ${role ? `<@&${role.id}>` : `role \`${roleId}\``} from dungeon master roles?`,
            "This role will lose temporary item creation access."
          ],
          [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 4,
                  label: "Confirm Remove",
                  custom_id: `setup:panel:remove-dm-role-confirm:${roleId}`
                },
                {
                  type: 2,
                  style: 2,
                  label: "Cancel",
                  custom_id: "setup:panel:remove-dm-role-cancel"
                }
              ]
            }
          ]
        ),
        ephemeral: true
      });
      return;
    }

    if (
      interaction.customId === "setup:panel:set-logs:select" &&
      Array.isArray(interaction.values)
    ) {
      if (!interaction.inGuild() || !hasAdminAccess(interaction)) {
        await acknowledgeInteractionSilently(interaction);
        return;
      }

      const channelId = interaction.values?.[0];
      const channel = channelId ? interaction.guild.channels.cache.get(channelId) : null;

      if (!channel || !channel.isTextBased()) {
        await interaction.reply({
          flags: 32768,
          components: buildSetupAdminPanel(
            interaction.guildId,
            `${UNSUCCESSFUL_EMOJI_RAW} Invalid channel selection.`
          ),
          ephemeral: true
        });
        return;
      }

      setLogsChannelIdForGuild(interaction.guildId, channel.id);
      await interaction.reply({
        flags: 32768,
        components: buildSetupAdminPanel(
          interaction.guildId,
          `<:success:1479234774861221898> Logs channel set to <#${channel.id}>.`
        ),
        ephemeral: true
      });
      return;
    }

    if (
      interaction.customId === "setup:panel:set-say-channels:select" &&
      Array.isArray(interaction.values)
    ) {
      if (!interaction.inGuild() || !hasAdminAccess(interaction)) {
        await acknowledgeInteractionSilently(interaction);
        return;
      }

      const selectedChannelIds = interaction.values
        .map((channelId) => String(channelId || "").trim())
        .filter((channelId) => /^\d{17,22}$/.test(channelId));

      const validChannelIds = selectedChannelIds.filter((channelId) => {
        const channel = interaction.guild.channels.cache.get(channelId);
        return Boolean(
          channel
          && (channel.type === ChannelType.GuildText
            || channel.type === ChannelType.GuildAnnouncement
            || channel.type === ChannelType.GuildForum)
        );
      });

      if (validChannelIds.length === 0) {
        await interaction.reply({
          flags: 32768,
          components: buildSetupAdminPanel(
            interaction.guildId,
            `${UNSUCCESSFUL_EMOJI_RAW} Invalid channel selection.`
          ),
          ephemeral: true
        });
        return;
      }

      setSayAllowedChannelIds(interaction.guildId, validChannelIds);
      const summary = validChannelIds.slice(0, 4).map((channelId) => `<#${channelId}>`).join(", ");
      const suffix = validChannelIds.length > 4 ? ` and ${validChannelIds.length - 4} more` : "";

      await interaction.reply({
        flags: 32768,
        components: buildSetupAdminPanel(
          interaction.guildId,
          `<:success:1479234774861221898> /say is now allowed in ${summary}${suffix}.`
        ),
        ephemeral: true
      });
      return;
    }

    if (interaction.isModalSubmit()) {
      console.log("=== MODAL SUBMIT ===");
      console.log("Modal customId:", interaction.customId);
      console.log("Checking edit_user_profile_modal...");

      if (interaction.customId.startsWith("adm:u:pm:")) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          await acknowledgeInteractionSilently(interaction);
          return;
        }

        const targetUserId = interaction.customId.split(":")[3];
        if (!targetUserId) {
          await acknowledgeInteractionSilently(interaction);
          return;
        }

        const getFieldValue = (customId) => {
          if (interaction.fields?.getTextInputValue) {
            try {
              return interaction.fields.getTextInputValue(customId);
            } catch (error) {
              return null;
            }
          }
          return null;
        };

        const nickname = getFieldValue("nickname");
        const about = getFieldValue("about");
        const interests = getFieldValue("interests");

        if (!userProfiles[targetUserId]) {
          userProfiles[targetUserId] = {};
        }

        const updates = [];

        if (nickname && nickname.trim()) {
          if (userProfiles[targetUserId].nickname !== nickname.trim()) {
            userProfiles[targetUserId].nickname = nickname.trim();
            updates.push(`Nickname: **${nickname.trim()}**`);
          }
        } else if (nickname === "") {
          if (userProfiles[targetUserId].nickname) {
            delete userProfiles[targetUserId].nickname;
            updates.push("Nickname: **removed**");
          }
        }

        if (about && about.trim()) {
          if (userProfiles[targetUserId].about !== about.trim()) {
            userProfiles[targetUserId].about = about.trim();
            updates.push(`About: **${about.trim().substring(0, 50)}${about.trim().length > 50 ? "..." : ""}**`);
          }
        } else if (about === "") {
          if (userProfiles[targetUserId].about) {
            delete userProfiles[targetUserId].about;
            updates.push("About: **removed**");
          }
        }

        if (interests && interests.trim()) {
          if (userProfiles[targetUserId].interests !== interests.trim()) {
            userProfiles[targetUserId].interests = interests.trim();
            updates.push(`Interests: **${interests.trim().substring(0, 50)}${interests.trim().length > 50 ? "..." : ""}**`);
          }
        } else if (interests === "") {
          if (userProfiles[targetUserId].interests) {
            delete userProfiles[targetUserId].interests;
            updates.push("Interests: **removed**");
          }
        }

        if (updates.length === 0) {
          await acknowledgeInteractionSilently(interaction);
          return;
        }

        saveUserProfiles();
        await acknowledgeInteractionSilently(interaction);
        return;
      }

      if (interaction.customId.startsWith("shoprole:add:modal")) {
        if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          await acknowledgeInteractionSilently(interaction);
          return;
        }

        const modalParts = interaction.customId.split(":");
        const walletType = normalizeRoleItemWallet(modalParts[3]);

        const getFieldValue = (customId) => {
          if (interaction.fields?.getTextInputValue) {
            try {
              return interaction.fields.getTextInputValue(customId);
            } catch (error) {
              return "";
            }
          }
          return "";
        };

        const name = getFieldValue("name").trim();
        const description = getFieldValue("description").trim();
        const rawPrice = getFieldValue("price").trim();
        const rawRole = getFieldValue("role").trim();

        const price = Number.parseInt(rawPrice, 10);
        if (!name || !description || !Number.isFinite(price) || price <= 0) {
          await interaction.reply({
            flags: 32768,
            components: buildRoleShopAdminPanel(
              interaction.guildId,
              `${UNSUCCESSFUL_EMOJI_RAW} Invalid form values. Check name, description, and numeric price.`
            ),
            ephemeral: true
          });
          return;
        }

        const roleId = parseRoleIdInput(rawRole);
        const role = roleId ? interaction.guild.roles.cache.get(roleId) : null;
        if (!role) {
          await interaction.reply({
            flags: 32768,
            components: buildRoleShopAdminPanel(
              interaction.guildId,
              `${UNSUCCESSFUL_EMOJI_RAW} Could not resolve that role. Use role mention or ID.`
            ),
            ephemeral: true
          });
          return;
        }

        if (role.id === interaction.guildId || role.managed) {
          await interaction.reply({
            flags: 32768,
            components: buildRoleShopAdminPanel(
              interaction.guildId,
              `${UNSUCCESSFUL_EMOJI_RAW} That role cannot be used as a purchasable item.`
            ),
            ephemeral: true
          });
          return;
        }

        const duplicate = getShopRoleItemsForGuild(interaction.guildId).find(
          (item) => item.roleId === role.id
            && normalizeRoleItemWallet(item.wallet) === walletType
            && item.name.toLowerCase() === name.toLowerCase()
        );
        if (duplicate) {
          await interaction.reply({
            flags: 32768,
            components: buildRoleShopAdminPanel(
              interaction.guildId,
              `${UNSUCCESSFUL_EMOJI_RAW} An item with the same role, wallet, and name already exists.`
            ),
            ephemeral: true
          });
          return;
        }

        shopRoleItems.push({
          id: generateShopRoleItemId(),
          guildId: interaction.guildId,
          roleId: role.id,
          price,
          wallet: walletType,
          name,
          description,
          createdBy: interaction.user.id,
          createdAt: new Date().toISOString()
        });
        saveShopRoleItems();

        await interaction.reply({
          flags: 32768,
          components: buildRoleShopAdminPanel(
            interaction.guildId,
            `<:success:1479234774861221898> Added **${name}** for <@&${role.id}> at **${price} ${POINTS_EMOJI_RAW}** using ${getRoleItemWalletLabel(walletType)}.`
          ),
          ephemeral: true
        });
        return;
      }

      if (interaction.customId === "titles:add:modal") {
        if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          await acknowledgeInteractionSilently(interaction);
          return;
        }

        const getFieldValue = (customId) => {
          if (interaction.fields?.getTextInputValue) {
            try {
              return interaction.fields.getTextInputValue(customId);
            } catch (error) {
              return "";
            }
          }
          return "";
        };

        const titleName = getFieldValue("name").trim();
        const titleDescription = getFieldValue("description").trim();
        const rawPrice = getFieldValue("price").trim();
        const titlePrice = Number.parseInt(rawPrice, 10);

        if (!titleName || !titleDescription || !Number.isFinite(titlePrice) || titlePrice <= 0) {
          await interaction.reply({
            flags: 32768,
            components: buildTitleAdminPanel(
              interaction.guildId,
              `${UNSUCCESSFUL_EMOJI_RAW} Invalid form values. Check name, description, and numeric price.`
            ),
            ephemeral: true
          });
          return;
        }

        const duplicate = getTitlesForGuild(interaction.guildId).find(
          (t) => t.name.toLowerCase() === titleName.toLowerCase()
        );
        if (duplicate) {
          await interaction.reply({
            flags: 32768,
            components: buildTitleAdminPanel(
              interaction.guildId,
              `${UNSUCCESSFUL_EMOJI_RAW} A title with that name already exists.`
            ),
            ephemeral: true
          });
          return;
        }

        titles.push({
          id: generateTitleId(),
          guildId: interaction.guildId,
          name: titleName,
          description: titleDescription,
          price: titlePrice,
          createdBy: interaction.user.id,
          createdAt: new Date().toISOString()
        });
        saveTitles();

        await interaction.reply({
          flags: 32768,
          components: buildTitleAdminPanel(
            interaction.guildId,
            `<:success:1479234774861221898> Added title **${titleName}** for **${titlePrice} ${POINTS_EMOJI_RAW}**.`
          ),
          ephemeral: true
        });
        return;
      }

      if (interaction.customId === "setup:panel:add-admin-role:modal") {
        if (!interaction.inGuild() || !hasAdminAccess(interaction)) {
          await acknowledgeInteractionSilently(interaction);
          return;
        }

        const rawRole = interaction.fields.getTextInputValue("role") || "";
        const roleId = parseRoleIdInput(rawRole);
        const role = roleId ? interaction.guild.roles.cache.get(roleId) : null;

        if (!role || role.id === interaction.guildId) {
          await interaction.reply({
            flags: 32768,
            components: buildSetupAdminPanel(
              interaction.guildId,
              `${UNSUCCESSFUL_EMOJI_RAW} Invalid role. Use a role mention or ID.`
            ),
            ephemeral: true
          });
          return;
        }

        if (getAdminRoleIds(interaction.guildId).includes(role.id)) {
          await interaction.reply({
            flags: 32768,
            components: buildSetupAdminPanel(
              interaction.guildId,
              `${UNSUCCESSFUL_EMOJI_RAW} <@&${role.id}> is already an admin role.`
            ),
            ephemeral: true
          });
          return;
        }

        addAdminRoleId(interaction.guildId, role.id);
        await interaction.reply({
          flags: 32768,
          components: buildSetupAdminPanel(
            interaction.guildId,
            `<:success:1479234774861221898> Added <@&${role.id}> as an admin role.`
          ),
          ephemeral: true
        });
        return;
      }

      if (interaction.customId === "setup:panel:remove-admin-role:modal") {
        if (!interaction.inGuild() || !hasAdminAccess(interaction)) {
          await acknowledgeInteractionSilently(interaction);
          return;
        }

        const rawRole = interaction.fields.getTextInputValue("role") || "";
        const roleId = parseRoleIdInput(rawRole);
        const role = roleId ? interaction.guild.roles.cache.get(roleId) : null;

        if (!roleId) {
          await interaction.reply({
            flags: 32768,
            components: buildSetupAdminPanel(
              interaction.guildId,
              `${UNSUCCESSFUL_EMOJI_RAW} Invalid role. Use a role mention or ID.`
            ),
            ephemeral: true
          });
          return;
        }

        if (!getAdminRoleIds(interaction.guildId).includes(roleId)) {
          await interaction.reply({
            flags: 32768,
            components: buildSetupAdminPanel(
              interaction.guildId,
              `${UNSUCCESSFUL_EMOJI_RAW} That role is not currently configured.`
            ),
            ephemeral: true
          });
          return;
        }

        removeAdminRoleId(interaction.guildId, roleId);
        await interaction.reply({
          flags: 32768,
          components: buildSetupAdminPanel(
            interaction.guildId,
            `<:success:1479234774861221898> Removed ${role ? `<@&${role.id}>` : `role \`${roleId}\``} from admin roles.`
          ),
          ephemeral: true
        });
        return;
      }

      if (interaction.customId === "setup:panel:set-logs:modal") {
        if (!interaction.inGuild() || !hasAdminAccess(interaction)) {
          await acknowledgeInteractionSilently(interaction);
          return;
        }

        const rawChannel = interaction.fields.getTextInputValue("channel") || "";
        const channelId = parseChannelIdInput(rawChannel);
        const channel = channelId ? interaction.guild.channels.cache.get(channelId) : null;

        if (!channel || !channel.isTextBased()) {
          await interaction.reply({
            flags: 32768,
            components: buildSetupAdminPanel(
              interaction.guildId,
              `${UNSUCCESSFUL_EMOJI_RAW} Invalid channel. Use a text channel mention or ID.`
            ),
            ephemeral: true
          });
          return;
        }

        setLogsChannelIdForGuild(interaction.guildId, channel.id);
        await interaction.reply({
          flags: 32768,
          components: buildSetupAdminPanel(
            interaction.guildId,
            `<:success:1479234774861221898> Logs channel set to <#${channel.id}>.`
          ),
          ephemeral: true
        });
        return;
      }

      
      if (interaction.customId === "edit_user_profile_modal") {
        const userId = interaction.user.id;

        const getFieldValue = (customId) => {
          if (interaction.fields?.getTextInputValue) {
            try {
              return interaction.fields.getTextInputValue(customId);
            } catch (error) {
              return null;
            }
          }
          return null;
        };

        const nickname = getFieldValue("nickname");
        const about = getFieldValue("about");
        const interests = getFieldValue("interests");

        // Create or get user profile
        if (!userProfiles[userId]) {
          userProfiles[userId] = {};
        }

        const updates = [];

        if (nickname && nickname.trim()) {
          if (userProfiles[userId].nickname !== nickname.trim()) {
            userProfiles[userId].nickname = nickname.trim();
            updates.push(`Nickname: **${nickname.trim()}**`);
          }
        } else if (nickname === "") {
          if (userProfiles[userId].nickname) {
            delete userProfiles[userId].nickname;
            updates.push("Nickname: **removed**");
          }
        }

        if (about && about.trim()) {
          if (userProfiles[userId].about !== about.trim()) {
            userProfiles[userId].about = about.trim();
            updates.push(`About: **${about.trim().substring(0, 50)}${about.trim().length > 50 ? '...' : ''}**`);
          }
        } else if (about === "") {
          if (userProfiles[userId].about) {
            delete userProfiles[userId].about;
            updates.push("About: **removed**");
          }
        }

        if (interests && interests.trim()) {
          if (userProfiles[userId].interests !== interests.trim()) {
            userProfiles[userId].interests = interests.trim();
            updates.push(`Interests: **${interests.trim().substring(0, 50)}${interests.trim().length > 50 ? '...' : ''}**`);
          }
        } else if (interests === "") {
          if (userProfiles[userId].interests) {
            delete userProfiles[userId].interests;
            updates.push("Interests: **removed**");
          }
        }

        if (updates.length === 0) {
          await acknowledgeInteractionSilently(interaction);
          return;
        }

        saveUserProfiles();

        await acknowledgeInteractionSilently(interaction);

        // Log profile edit if logs channel is configured
        const logsChannelId = getLogsChannelIdForGuild(interaction.guildId);
        if (logsChannelId) {
          try {
            const logsChannel = await interaction.client.channels.fetch(logsChannelId);
            if (logsChannel?.isTextBased()) {
              const emojiUpdates = updates.map((change) => `${BULLET_EMOJI_RAW} ${change}`);
              const logComponents = [
                { type: 10, content: "## <:success:1479234774861221898> User Profile Updated" },
                { type: 14, divider: true, spacing: 1 },
                { type: 10, content: `${BULLET_EMOJI_RAW} **User:** ${interaction.user.username}` },
                { type: 10, content: `${BULLET_EMOJI_RAW} **Changes:**\n${emojiUpdates.join("\n")}` },
                { type: 14, divider: true, spacing: 1 },
                { type: 10, content: `${BULLET_EMOJI_RAW} _${interaction.user.username}_ • ${new Date().toISOString()}` }
              ];
              await logsChannel.send({
                flags: 32768,
                components: [{ type: 17, components: logComponents }],
                allowedMentions: { parse: [] }
              });
            }
          } catch (logError) {
            console.error("Failed to send log to logs channel:", logError);
          }
        }
        return;
      }

      console.log("Checking edit_character_basic_...");
      if (interaction.customId.startsWith("edit_character_basic_")) {
        const characterId = interaction.customId.replace("edit_character_basic_", "");
        
        // Check if character exists
        const character = getCharacterById(characterId, interaction.guildId);
        if (!character) {
          await replyComponentsV2(
            interaction,
            "Edit Character",
            [`Character with ID "${characterId}" does not exist.`],
            [],
            { ephemeral: true }
          );
          return;
        }

        // Check permissions: admin OR character owner
        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
        const isOwner = getAssignedUserId(interaction.guildId, characterId) === interaction.user.id;

        if (!isAdmin && !isOwner) {
            await replyComponentsV2(
              interaction,
              "Edit Character",
              ["You do not have permission to edit this character."],
              [],
              { ephemeral: true }
            );
          return;
        }

        // Get values from modal (use interaction.fields when available)
        const getFieldValue = (customId) => {
          if (interaction.fields?.fields?.get) {
            const field = interaction.fields.fields.get(customId);
            if (field) {
              if (Array.isArray(field.values) && field.values.length > 0) {
                return field.values[0];
              }
              if (typeof field.value === "string") {
                return field.value;
              }
            }
          }
          if (interaction.fields?.getTextInputValue) {
            try {
              return interaction.fields.getTextInputValue(customId);
            } catch (error) {
              // Ignore and fall through for non-text inputs
            }
          }
          if (interaction.fields?.getSelectMenuValues) {
            try {
              const values = interaction.fields.getSelectMenuValues(customId);
              if (values && values.length > 0) {
                return values[0];
              }
            } catch (error) {
              // Ignore and fall through to component scan
            }
          }
          for (const labelComponent of interaction.components || []) {
            if (labelComponent.components && labelComponent.components.length > 0) {
              const field = labelComponent.components[0];
              if (field.customId === customId) {
                if (field.values && field.values.length > 0) {
                  return field.values[0];
                }
                return field.value || "";
              }
            }
          }
          return "";
        };

        const newName = getFieldValue("name");
        const newBio = getFieldValue("bio");
        const newPersonality = getFieldValue("personality");
        const newBackstory = getFieldValue("backstory");

        // Track updates
        const updates = [];

        // Helper function to update field only if changed
        const updateField = (fieldName, newValue, fieldKey) => {
          if (newValue && newValue.trim()) {
            const trimmedValue = newValue.trim();
            if (character[fieldKey] !== trimmedValue) {
              character[fieldKey] = trimmedValue;
              updates.push(`${fieldName}: **${trimmedValue.substring(0, 50)}${trimmedValue.length > 50 ? '...' : ''}**`);
            }
          }
        };

        if (newName && newName.trim()) updateField("Name", newName, "name");
        if (newBio && newBio.trim()) updateField("Bio", newBio, "bio");
        if (newPersonality && newPersonality.trim()) updateField("Personality", newPersonality, "personality");
        if (newBackstory && newBackstory.trim()) updateField("Backstory", newBackstory, "backstory");

        // Save changes even if no updates (user may want to continue to page 2)
        writeJson(CHARACTERS_PATH, characters);

        // Log the edit
        const editLog = `Edited character \`${characterId}\`: ${updates.join(", ")}`;
        logMessage(interaction.user.id, "Character Edit", editLog, interaction.channelId, interaction.guildId);

        // Send log to logs channel if configured
        const logsChannelId = getLogsChannelIdForGuild(interaction.guildId);
        if (logsChannelId) {
          try {
            const logsChannel = await interaction.client.channels.fetch(logsChannelId);
            if (logsChannel?.isTextBased()) {
              const actorName = interaction.user.username;
              const emojiUpdates = updates.map((change) => `${BULLET_EMOJI_RAW} ${change}`);
              const logComponents = [
                { type: 10, content: "## <:success:1479234774861221898> Character Edited" },
                { type: 14, divider: true, spacing: 1 },
                { type: 10, content: `${BULLET_EMOJI_RAW} **${isAdmin ? "Admin" : "User"}:** ${actorName}` },
                { type: 10, content: `${BULLET_EMOJI_RAW} **Character ID:** \`${characterId}\`` },
                { type: 10, content: `${BULLET_EMOJI_RAW} **Changes:**\n${emojiUpdates.join("\n")}` },
                { type: 14, divider: true, spacing: 1 },
                { type: 10, content: `${BULLET_EMOJI_RAW} _${interaction.user.username}_ • ${new Date().toISOString()}` }
              ];
              await logsChannel.send({
                flags: 32768,
                components: [{ type: 17, components: logComponents }],
                allowedMentions: { parse: [] }
              });
            }
          } catch (logError) {
            console.error("Failed to send log to logs channel:", logError);
          }
        }

        const buttons = [
          {
            type: 1, // Action Row
            components: [
              {
                type: 2, // Button
                style: 1, // Primary
                label: "Edit More Fields",
                custom_id: `edit_more_${characterId}`
              },
              {
                type: 2, // Button
                style: 2, // Secondary
                label: "Edit Media",
                custom_id: `edit_media_${characterId}`
              }
            ]
          }
        ];

        if (updates.length === 0) {
          await acknowledgeInteractionSilently(interaction);
          return;
        }

        await acknowledgeInteractionSilently(interaction);
      }

      console.log("Checking edit_character_extended_...");
      if (interaction.customId.startsWith("edit_character_extended_")) {
        const characterId = interaction.customId.replace("edit_character_extended_", "");
        
        // Check if character exists
        const character = getCharacterById(characterId, interaction.guildId);
        if (!character) {
          await replyComponentsV2(
            interaction,
            "Edit More Fields",
            [`Character with ID "${characterId}" does not exist.`],
            [],
            { ephemeral: true }
          );
          return;
        }

        // Check permissions: admin OR character owner
        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
        const isOwner = getAssignedUserId(interaction.guildId, characterId) === interaction.user.id;

        if (!isAdmin && !isOwner) {
          await replyComponentsV2(
            interaction,
            "Edit More Fields",
            ["You do not have permission to edit this character."],
            [],
            { ephemeral: true }
          );
          return;
        }

        // Get values from modal (page 2: extended fields)
        const getFieldValue = (customId) => {
          if (interaction.fields?.fields?.get) {
            const field = interaction.fields.fields.get(customId);
            if (field) {
              if (Array.isArray(field.values) && field.values.length > 0) {
                return field.values[0];
              }
              if (typeof field.value === "string") {
                return field.value;
              }
            }
          }
          if (interaction.fields?.getTextInputValue) {
            try {
              return interaction.fields.getTextInputValue(customId);
            } catch (error) {
              // Ignore and fall through for non-text inputs
            }
          }
          if (interaction.fields?.getSelectMenuValues) {
            try {
              const values = interaction.fields.getSelectMenuValues(customId);
              if (values && values.length > 0) {
                return values[0];
              }
            } catch (error) {
              // Ignore and fall through to component scan
            }
          }
          for (const labelComponent of interaction.components || []) {
            if (labelComponent.components && labelComponent.components.length > 0) {
              const field = labelComponent.components[0];
              if (field.customId === customId) {
                if (field.values && field.values.length > 0) {
                  return field.values[0];
                }
                return field.value || "";
              }
            }
          }
          return "";
        };

        const ageInput = getFieldValue("age");
        const newRace = getFieldValue("race");
        const newClass = getFieldValue("class");
        const newRelationship = getFieldValue("relationship");

        // Parse age: convert to number if valid, allow "Unknown"
        let newAge = null;
        if (ageInput && ageInput.trim()) {
          const ageNum = parseInt(ageInput, 10);
          if (!isNaN(ageNum) && ageNum > 0 && ageNum <= 1000) {
            newAge = ageNum;
          } else if (ageInput.toLowerCase() === "unknown") {
            newAge = "Unknown";
          } else {
            await replyComponentsV2(
              interaction,
              "❗ Invalid Age",
              ["Age must be a number between 1 and 1000 or 'Unknown'."],
              [],
              { ephemeral: true }
            );
            return;
          }
        }

        // Track updates
        const updates = [];

        // Helper function to update field only if changed
        const updateField = (fieldName, newValue, fieldKey) => {
          if (newValue && newValue.trim()) {
            const trimmedValue = newValue.trim();
            if (character[fieldKey] !== trimmedValue) {
              character[fieldKey] = trimmedValue;
              updates.push(`${fieldName}: **${trimmedValue}**`);
            }
          }
        };

        if (newAge !== null && character.age !== newAge) {
          character.age = newAge;
          updates.push(`Age: **${newAge}**`);
        }
        if (newRace && newRace.trim()) updateField("Race", newRace, "race");
        if (newClass && newClass.trim()) updateField("Class", newClass, "class");
        if (newRelationship) {
          // Value comes directly from select, already validated by Discord
          if (character.relationship !== newRelationship) {
            character.relationship = newRelationship;
            updates.push(`Relationship: **${newRelationship.charAt(0).toUpperCase() + newRelationship.slice(1)}**`);
          }
        }

        if (updates.length === 0) {
          await acknowledgeInteractionSilently(interaction);
          return;
        }

        writeJson(CHARACTERS_PATH, characters);

        // Log the edit
        const editLog = `Edited character \`${characterId}\`: ${updates.join(", ")}`;
        logMessage(interaction.user.id, "Character Edit", editLog, interaction.channelId, interaction.guildId);

        // Send log to logs channel if configured
        const logsChannelId = getLogsChannelIdForGuild(interaction.guildId);
        if (logsChannelId) {
          try {
            const logsChannel = await interaction.client.channels.fetch(logsChannelId);
            if (logsChannel?.isTextBased()) {
              const actorName = interaction.user.username;
              const emojiUpdates = updates.map((change) => `${BULLET_EMOJI_RAW} ${change}`);
              const logComponents = [
                { type: 10, content: "## <:success:1479234774861221898> Character Edited" },
                { type: 14, divider: true, spacing: 1 },
                { type: 10, content: `${BULLET_EMOJI_RAW} **${isAdmin ? "Admin" : "User"}:** ${actorName}` },
                { type: 10, content: `${BULLET_EMOJI_RAW} **Character ID:** \`${characterId}\`` },
                { type: 10, content: `${BULLET_EMOJI_RAW} **Changes:**\n${emojiUpdates.join("\n")}` },
                { type: 14, divider: true, spacing: 1 },
                { type: 10, content: `${BULLET_EMOJI_RAW} _${interaction.user.username}_ • ${new Date().toISOString()}` }
              ];
              await logsChannel.send({  
                flags: 32768,
                components: [{ type: 17, components: logComponents }],
                allowedMentions: { parse: [] }
              });
            }
          } catch (logError) {
            console.error("Failed to send log to logs channel:", logError);
          }
        }

        await acknowledgeInteractionSilently(interaction);
      }

      // ── Card Style modal submit handler ──
      if (interaction.customId.startsWith("edit_character_card_style_")) {
        const characterId = interaction.customId.replace("edit_character_card_style_", "");
        const character = getCharacterById(characterId, interaction.guildId);

        if (!character) {
          await replyComponentsV2(interaction, "Edit Card Style", [`Character with ID "${characterId}" does not exist.`], [], { ephemeral: true });
          return;
        }

        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
        const isOwner = getAssignedUserId(interaction.guildId, characterId) === interaction.user.id;

        if (!isAdmin && !isOwner) {
          await replyComponentsV2(interaction, "Edit Card Style", ["You do not have permission to edit this character."], [], { ephemeral: true });
          return;
        }

        try {
          const getFieldValue = (customId) => {
            if (interaction.fields?.fields?.get) {
              const field = interaction.fields.fields.get(customId);
              if (field) {
                if (Array.isArray(field.values) && field.values.length > 0) return field.values[0];
                if (typeof field.value === "string") return field.value;
              }
            }
            if (interaction.fields?.getTextInputValue) {
              try { return interaction.fields.getTextInputValue(customId); } catch (e) {}
            }
            for (const row of interaction.components || []) {
              if (row.components && row.components.length > 0) {
                const field = row.components[0];
                if (field.customId === customId) return field.value || "";
              }
            }
            return "";
          };

          const newTheme = getFieldValue("card_theme");
          const newAccent = getFieldValue("card_accent");
          const newBackground = getFieldValue("card_background");

          const validThemes = ["arcane", "ember", "verdant", "frost"];
          const updates = [];

          // Theme
          if (newTheme && newTheme.trim()) {
            const themeVal = newTheme.trim().toLowerCase();
            if (validThemes.includes(themeVal) && character.cardTheme !== themeVal) {
              character.cardTheme = themeVal;
              updates.push(`Theme: **${themeVal}**`);
            } else if (!validThemes.includes(themeVal)) {
              await replyComponentsV2(interaction, "Edit Card Style", [`Invalid theme "${themeVal}". Choose from: arcane, ember, verdant, frost.`], [], { ephemeral: true });
              return;
            }
          }

          // Accent color
          if (newAccent && newAccent.trim()) {
            const accentVal = newAccent.trim();
            if (!/^#?[0-9a-fA-F]{6}$/.test(accentVal)) {
              await replyComponentsV2(interaction, "Edit Card Style", ["Accent must be a 6-digit HEX color like `#54C0FF` or `54C0FF`."], [], { ephemeral: true });
              return;
            }
            if (character.cardAccent !== accentVal) {
              character.cardAccent = accentVal;
              updates.push(`Accent: **${accentVal}**`);
            }
          } else if (character.cardAccent) {
            // Cleared
            character.cardAccent = "";
            updates.push("Accent: **reset to default**");
          }

          // Background image (premium only)
          const hasPremium = getPremiumSlotBonus(interaction.guildId, interaction.user.id) > 0;
          if (newBackground && newBackground.trim()) {
            if (!hasPremium) {
              await replyComponentsV2(interaction, "Edit Card Style", ["Custom background images require the **Premium Features Subscription**."], [], { ephemeral: true });
              return;
            }
            const bgVal = newBackground.trim();
            if (character.cardBackground !== bgVal) {
              character.cardBackground = bgVal;
              updates.push(`Background: **set**`);
            }
          } else if (character.cardBackground) {
            character.cardBackground = "";
            updates.push("Background: **removed**");
          }

          if (updates.length === 0) {
            await acknowledgeInteractionSilently(interaction);
            return;
          }

          writeJson(CHARACTERS_PATH, characters);

          // Log changes
          const logsChannelId = getLogsChannelIdForGuild(interaction.guildId);
          if (logsChannelId) {
            try {
              const logsChannel = await interaction.client.channels.fetch(logsChannelId);
              if (logsChannel?.isTextBased()) {
                const actorName = interaction.user.username;
                const emojiUpdates = updates.map((change) => `${BULLET_EMOJI_RAW} ${change}`);
                await logsChannel.send({
                  content: `**${actorName}** edited card style for **${character.name}** (\`${characterId}\`):\n${emojiUpdates.join("\n")}`,
                  allowedMentions: { parse: [] }
                });
              }
            } catch (logError) {
              console.error("Failed to send log to logs channel:", logError);
            }
          }

          await acknowledgeInteractionSilently(interaction);
        } catch (error) {
          console.error("Error processing card style modal:", error);
          await replyComponentsV2(interaction, "Error", ["Failed to save card style. Please try again."], [], { ephemeral: true });
        }
        return;
      }

      console.log("Checking edit_character_media_...");
      if (interaction.customId.startsWith("edit_character_media_")) {
        console.log("=== MEDIA EDIT HANDLER ===");
        const characterId = interaction.customId.replace("edit_character_media_", "");

        // Check if character exists
        const character = getCharacterById(characterId, interaction.guildId);
        if (!character) {
          await replyComponentsV2(
            interaction,
            "Edit Media",
            [`Character with ID "${characterId}" does not exist.`],
            [],
            { ephemeral: true }
          );
          return;
        }

        // Check permissions: admin OR character owner
        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
        const isOwner = getAssignedUserId(interaction.guildId, characterId) === interaction.user.id;

        if (!isAdmin && !isOwner) {
          await replyComponentsV2(
            interaction,
            "Edit Media",
            ["You do not have permission to edit this character."],
            [],
            { ephemeral: true }
          );
          return;
        }

        try {
          // Get values from modal
          const getFieldValue = (customId) => {
            if (interaction.fields?.fields?.get) {
              const field = interaction.fields.fields.get(customId);
              if (field) {
                if (Array.isArray(field.values) && field.values.length > 0) {
                  return field.values[0];
                }
                if (typeof field.value === "string") {
                  return field.value;
                }
              }
            }
            if (interaction.fields?.getTextInputValue) {
              try {
                return interaction.fields.getTextInputValue(customId);
              } catch (error) {
                // Ignore and fall through for non-text inputs
              }
            }
            for (const labelComponent of interaction.components || []) {
              if (labelComponent.components && labelComponent.components.length > 0) {
                const field = labelComponent.components[0];
                if (field.customId === customId) {
                  if (field.values && field.values.length > 0) {
                    return field.values[0];
                  }
                  return field.value || "";
                }
              }
            }
            return "";
          };

          const newAvatar = getFieldValue("avatar");

          // Track updates
          const updates = [];

          const updateField = (fieldName, newValue, fieldKey) => {
            if (newValue && newValue.trim()) {
              const trimmedValue = newValue.trim();
              if (character[fieldKey] !== trimmedValue) {
                character[fieldKey] = trimmedValue;
                updates.push(`${fieldName}: **${trimmedValue.substring(0, 50)}${trimmedValue.length > 50 ? '...' : ''}**`);
              }
            }
          };

          if (newAvatar && newAvatar.trim()) updateField("Avatar", newAvatar, "avatarUrl");

          if (updates.length === 0) {
            await acknowledgeInteractionSilently(interaction);
            return;
          }

          writeJson(CHARACTERS_PATH, characters);

          // Send log to logs channel if configured
          const logsChannelId = getLogsChannelIdForGuild(interaction.guildId);
          if (logsChannelId) {
            try {
              const logsChannel = await interaction.client.channels.fetch(logsChannelId);
              if (logsChannel?.isTextBased()) {
                const actorName = interaction.user.username;
                const emojiUpdates = updates.map((change) => `${BULLET_EMOJI_RAW} ${change}`);
                const logComponents = [
                  { type: 10, content: "## <:success:1479234774861221898> Character Edited" },
                  { type: 14, divider: true, spacing: 1 },
                  { type: 10, content: `${BULLET_EMOJI_RAW} **${isAdmin ? "Admin" : "User"}:** ${actorName}` },
                  { type: 10, content: `${BULLET_EMOJI_RAW} **Character ID:** \`${characterId}\`` },
                  { type: 10, content: `${BULLET_EMOJI_RAW} **Changes:**\n${emojiUpdates.join("\n")}` },
                  { type: 14, divider: true, spacing: 1 },
                  { type: 10, content: `${BULLET_EMOJI_RAW} _${interaction.user.username}_ • ${new Date().toISOString()}` }
                ];
                await logsChannel.send({
                  flags: 32768,
                  components: [{ type: 17, components: logComponents }],
                  allowedMentions: { parse: [] }
                });
              }
            } catch (logError) {
              console.error("Failed to send log to logs channel:", logError);
            }
          }

          await acknowledgeInteractionSilently(interaction);
        } catch (innerError) {
          console.error("Error in edit_character_media handler:", innerError);
          throw innerError;
        }
      }

    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith("report_character_")) {
        const characterId = interaction.customId.replace("report_character_", "");
        const character = getCharacterById(characterId, interaction.guildId);

        if (!character || !interaction.inGuild()) {
          await interaction.reply({ content: "Character not found.", flags: 64 });
          return;
        }

        await interaction.reply({
          content: `Are you sure you want to report **${character.name}**? This will notify the server's bot managers.`,
          components: [{
            type: 1,
            components: [
              { type: 2, style: 4, label: "Confirm Report", custom_id: `report_confirm_${characterId}` },
              { type: 2, style: 2, label: "Cancel", custom_id: "report_cancel" }
            ]
          }],
          flags: 64
        });
        return;
      }

      if (interaction.customId === "report_cancel") {
        await interaction.update({ content: "Report cancelled.", components: [] });
        return;
      }

      if (interaction.customId.startsWith("report_confirm_")) {
        const characterId = interaction.customId.replace("report_confirm_", "");
        const character = getCharacterById(characterId, interaction.guildId);

        await interaction.update({ content: "Report sent.", components: [] });

        if (!character || !interaction.inGuild()) return;

        // 1-hour cooldown per user per guild
        const cooldownKey = `${interaction.guildId}:${interaction.user.id}`;
        const now = Date.now();
        const lastReport = reportCooldowns.get(cooldownKey) || 0;
        if (now - lastReport < 3600000) return;
        reportCooldowns.set(cooldownKey, now);

        const logsChannelId = getLogsChannelIdForGuild(interaction.guildId);
        if (!logsChannelId) return;

        try {
          const logsChannel = await interaction.client.channels.fetch(logsChannelId);
          if (!logsChannel?.isTextBased()) return;

          const adminRoleIds = getAdminRoleIds(interaction.guildId);
          const rolePings = adminRoleIds.map((id) => `<@&${id}>`).join(" ") || "No bot manager roles configured";
          const ownerId = getAssignedUserId(interaction.guildId, characterId);

          const reportComponents = [
            { type: 10, content: "## \u26a0\ufe0f Character Report" },
            { type: 14, divider: true, spacing: 1 },
            { type: 10, content: `${BULLET_EMOJI_RAW} **Character:** ${character.name} (\`${characterId}\`)` },
            { type: 10, content: `${BULLET_EMOJI_RAW} **Owner:** ${ownerId ? `<@${ownerId}>` : "Unassigned"}` },
            { type: 10, content: `${BULLET_EMOJI_RAW} **Reported by:** <@${interaction.user.id}>` },
            { type: 14, divider: true, spacing: 1 },
            { type: 10, content: rolePings },
            { type: 14, divider: true, spacing: 1 },
            {
              type: 1,
              components: [
                { type: 2, style: 1, label: "View Profile", custom_id: `rpt_view_${characterId}` },
                { type: 2, style: 4, label: "Delete Character", custom_id: `rpt_del_${characterId}` }
              ]
            }
          ];

          await logsChannel.send({
            flags: 32768,
            components: [{ type: 17, components: reportComponents }],
            allowedMentions: { roles: adminRoleIds }
          });
        } catch (logError) {
          console.error("Failed to send report to logs channel:", logError);
        }
        return;
      }

      if (interaction.customId.startsWith("rpt_view_")) {
        const characterId = interaction.customId.replace("rpt_view_", "");
        const character = getCharacterById(characterId, interaction.guildId);

        if (!character) {
          await interaction.reply({ content: `Character \`${characterId}\` no longer exists.`, flags: 64 });
          return;
        }

        try {
          const ownerId = getAssignedUserId(interaction.guildId, character.id);
          let ownerDisplay = "Unassigned";
          if (ownerId) {
            try {
              const ownerMember = await interaction.guild.members.fetch(ownerId);
              ownerDisplay = ownerMember?.displayName || ownerMember?.user?.username || ownerId;
            } catch (e) { ownerDisplay = ownerId; }
          }
          const isPicked = ownerId ? getSelectedCharacterId(interaction.guildId, ownerId) === character.id : false;
          const characterPointsValue = getCharacterPoints(interaction.guildId, character.id);
          const theme = character.cardTheme || "arcane";
          const accentColor = character.cardAccent || "";
          const cardBackground = character.cardBackground || "";
          const hasPremium = ownerId ? getPremiumSlotBonus(interaction.guildId, ownerId) > 0 : false;
          const upgradeIds = getCharacterUpgradeIds(interaction.guildId, character.id);
          const selectedTitleObj = getSelectedTitle(interaction.guildId, character.id);

          const cardBuffer = await generateCharacterCardImage(character, {
            theme, accentColor, ownerDisplay, pickedByDisplay: ownerDisplay, isPicked,
            points: characterPointsValue,
            backgroundUrl: hasPremium ? cardBackground : "",
            upgradeIds,
            titleName: selectedTitleObj ? selectedTitleObj.name : ""
          });

          if (cardBuffer) {
            await interaction.reply({
              content: `**${character.name}** • Profile (from report)`,
              files: [{ attachment: cardBuffer, name: `character-profile-${character.id}.png` }],
              flags: 64
            });
            return;
          }
        } catch (err) {
          console.error("Report view profile failed:", err);
        }

        await interaction.reply({ content: `Could not generate profile for \`${characterId}\`.`, flags: 64 });
        return;
      }

      if (interaction.customId.startsWith("rpt_del_")) {
        const characterId = interaction.customId.replace("rpt_del_", "");
        const character = getCharacterById(characterId, interaction.guildId);

        if (!character) {
          await interaction.reply({ content: `Character \`${characterId}\` no longer exists.`, flags: 64 });
          return;
        }

        await interaction.reply({
          content: `Are you sure you want to delete **${character.name}** (\`${characterId}\`)? This cannot be undone.`,
          components: [{
            type: 1,
            components: [
              { type: 2, style: 4, label: "Confirm Delete", custom_id: `rpt_delconfirm_${characterId}` },
              { type: 2, style: 2, label: "Cancel", custom_id: "rpt_delcancel" }
            ]
          }],
          flags: 64
        });
        return;
      }

      if (interaction.customId === "rpt_delcancel") {
        await interaction.update({ content: "Deletion cancelled.", components: [] });
        return;
      }

      if (interaction.customId.startsWith("rpt_delconfirm_")) {
        const characterId = interaction.customId.replace("rpt_delconfirm_", "");
        const character = getCharacterById(characterId, interaction.guildId);

        if (!character) {
          await interaction.update({ content: `Character \`${characterId}\` no longer exists.`, components: [] });
          return;
        }

        const charName = character.name;
        deleteCharacterFromGuild(interaction.guildId, characterId);

        await interaction.update({
          content: `${SUCCESSFUL_EMOJI_RAW} Character **${charName}** (\`${characterId}\`) has been deleted.`,
          components: []
        });
        return;
      }

      if (interaction.customId.startsWith("edit_basic_")) {
        const characterId = interaction.customId.replace("edit_basic_", "");
        const character = getCharacterById(characterId, interaction.guildId);

        if (!character) {
          await replyComponentsV2(
            interaction,
            "Edit Character",
            [`Character with ID "${characterId}" does not exist.`],
            [],
            { ephemeral: true }
          );
          return;
        }

        // Check permissions
        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
        const isOwner = getAssignedUserId(interaction.guildId, characterId) === interaction.user.id;

        if (!isAdmin && !isOwner) {
          await replyComponentsV2(
            interaction,
            "Edit Character",
            ["You do not have permission to edit this character."],
            [],
            { ephemeral: true }
          );
          return;
        }

        try {
          const nameInput = new TextInputBuilder()
            .setCustomId("name")
            .setLabel("Character Name")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Leave empty to keep current value")
            .setValue(character.name || "")
            .setRequired(false)
            .setMaxLength(100);

          const bioInput = new TextInputBuilder()
            .setCustomId("bio")
            .setLabel("Biography")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Leave empty to keep current value")
            .setValue(character.bio || "")
            .setRequired(false)
            .setMaxLength(500);

          const personalityInput = new TextInputBuilder()
            .setCustomId("personality")
            .setLabel("Personality")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Leave empty to keep current value")
            .setValue(character.personality || "")
            .setRequired(false)
            .setMaxLength(500);

          const backstoryInput = new TextInputBuilder()
            .setCustomId("backstory")
            .setLabel("Backstory")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Leave empty to keep current value")
            .setValue(character.backstory || "")
            .setRequired(false)
            .setMaxLength(1000);

          const actionRow1 = new ActionRowBuilder().addComponents(nameInput);
          const actionRow2 = new ActionRowBuilder().addComponents(bioInput);
          const actionRow3 = new ActionRowBuilder().addComponents(personalityInput);
          const actionRow4 = new ActionRowBuilder().addComponents(backstoryInput);

          const modal = new ModalBuilder()
            .setCustomId(`edit_character_basic_${characterId}`)
            .setTitle("Edit Character - Basic")
            .addComponents(actionRow1, actionRow2, actionRow3, actionRow4);

          console.log("Showing basic edit modal for character:", characterId);
          await interaction.showModal(modal);
        } catch (error) {
          console.error("Error creating/showing basic edit modal:", error);
          await replyComponentsV2(
            interaction,
            "Error",
            ["Failed to open edit form. Please try again."],
            [],
            { ephemeral: true }
          );
        }
        return;
      }


      if (interaction.customId.startsWith("edit_more_")) {
        const characterId = interaction.customId.replace("edit_more_", "");
        const character = getCharacterById(characterId, interaction.guildId);

        if (!character) {
          await replyComponentsV2(
            interaction,
            "Edit More Fields",
            [`Character with ID "${characterId}" does not exist.`],
            [],
            { ephemeral: true }
          );
          return;
        }

        // Check permissions
        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
        const isOwner = getAssignedUserId(interaction.guildId, characterId) === interaction.user.id;

        if (!isAdmin && !isOwner) {
          await replyComponentsV2(
            interaction,
            "Edit More Fields",
            ["You do not have permission to edit this character."],
            [],
            { ephemeral: true }
          );
          return;
        }

        try {
          const ageInput = new TextInputBuilder()
            .setCustomId("age")
            .setLabel("Age")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Number or 'Unknown', empty to keep current")
            .setValue(character.age ? String(character.age) : "")
            .setRequired(false)
            .setMaxLength(50);

          const raceInput = new TextInputBuilder()
            .setCustomId("race")
            .setLabel("Race/Species")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Leave empty to keep current value")
            .setValue(character.race || "")
            .setRequired(false)
            .setMaxLength(100);

          const classInput = new TextInputBuilder()
            .setCustomId("class")
            .setLabel("Class/Role")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Leave empty to keep current value")
            .setValue(character.class || "")
            .setRequired(false)
            .setMaxLength(100);

          const relationshipInput = new TextInputBuilder()
            .setCustomId("relationship")
            .setLabel("Relationship")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("ally, foe, or neutral")
            .setValue(character.relationship || "")
            .setRequired(false)
            .setMaxLength(20);

          const actionRow1 = new ActionRowBuilder().addComponents(ageInput);
          const actionRow2 = new ActionRowBuilder().addComponents(raceInput);
          const actionRow3 = new ActionRowBuilder().addComponents(classInput);
          const actionRow4 = new ActionRowBuilder().addComponents(relationshipInput);

          const modal = new ModalBuilder()
            .setCustomId(`edit_character_extended_${characterId}`)
            .setTitle("Edit Character - Advanced")
            .addComponents(actionRow1, actionRow2, actionRow3, actionRow4);

          console.log("Showing advanced edit modal for character:", characterId);
          await interaction.showModal(modal);
        } catch (error) {
          console.error("Error creating/showing advanced edit modal:", error);
          await replyComponentsV2(
            interaction,
            "Error",
            ["Failed to open edit form. Please try again."],
            [],
            { ephemeral: true }
          );
        }
        return;
      }

      if (interaction.customId.startsWith("edit_title_")) {
        const characterId = interaction.customId.replace("edit_title_", "");
        const character = getCharacterById(characterId, interaction.guildId);

        if (!character) {
          await replyComponentsV2(
            interaction,
            "Select Title",
            [`Character with ID "${characterId}" does not exist.`],
            [],
            { ephemeral: true }
          );
          return;
        }

        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
        const isOwner = getAssignedUserId(interaction.guildId, characterId) === interaction.user.id;

        if (!isAdmin && !isOwner) {
          await replyComponentsV2(
            interaction,
            "Select Title",
            ["You do not have permission to edit this character."],
            [],
            { ephemeral: true }
          );
          return;
        }

        const ownedIds = getOwnedTitleIds(interaction.guildId, interaction.user.id);
        if (ownedIds.length === 0) {
          await replyComponentsV2(
            interaction,
            "Select Title",
            ["You don't own any titles yet. Buy titles from `/shop`."],
            [],
            { ephemeral: true }
          );
          return;
        }

        const options = [
          { label: "No Title", value: "none", description: "Remove current title" }
        ];
        for (const titleId of ownedIds) {
          const titleItem = getTitleById(interaction.guildId, titleId);
          if (titleItem) {
            options.push({
              label: titleItem.name,
              value: titleId,
              description: titleItem.description.slice(0, 100),
              default: character.selectedTitle === titleId
            });
          }
        }

        if (options.length === 1) {
          await replyComponentsV2(
            interaction,
            "Select Title",
            ["Your owned titles no longer exist in this server. Buy titles from `/shop`."],
            [],
            { ephemeral: true }
          );
          return;
        }

        const titleSelectComponents = [
          { type: 10, content: `## Select Title for ${character.name}` },
          { type: 14, divider: true, spacing: 1 },
          { type: 10, content: `Current title: **${character.selectedTitle ? (getTitleById(interaction.guildId, character.selectedTitle)?.name || "Unknown") : "None"}**` },
          {
            type: 1,
            components: [
              {
                type: 3,
                custom_id: `select_title_${characterId}`,
                placeholder: "Choose a title...",
                min_values: 1,
                max_values: 1,
                options: options
              }
            ]
          }
        ];

        await interaction.reply({
          flags: 32768,
          components: [{ type: 17, components: titleSelectComponents }],
          ephemeral: true
        });
        return;
      }

      if (interaction.customId.startsWith("edit_card_style_")) {
        const characterId = interaction.customId.replace("edit_card_style_", "");
        const character = getCharacterById(characterId, interaction.guildId);

        if (!character) {
          await replyComponentsV2(
            interaction,
            "Edit Card Style",
            [`Character with ID "${characterId}" does not exist.`],
            [],
            { ephemeral: true }
          );
          return;
        }

        // Check permissions: admin OR character owner
        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
        const isOwner = getAssignedUserId(interaction.guildId, characterId) === interaction.user.id;

        if (!isAdmin && !isOwner) {
          await replyComponentsV2(
            interaction,
            "Edit Card Style",
            ["You do not have permission to edit this character."],
            [],
            { ephemeral: true }
          );
          return;
        }

        // Check premium for background image
        const hasPremium = getPremiumSlotBonus(interaction.guildId, interaction.user.id) > 0;

        try {
          const themeInput = new TextInputBuilder()
            .setCustomId("card_theme")
            .setLabel("Theme (arcane / ember / verdant / frost)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("arcane")
            .setValue(character.cardTheme || "arcane")
            .setRequired(false)
            .setMaxLength(10);

          const accentInput = new TextInputBuilder()
            .setCustomId("card_accent")
            .setLabel("Accent Color (HEX, e.g. #54C0FF)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Leave empty for theme default")
            .setValue(character.cardAccent || "")
            .setRequired(false)
            .setMaxLength(7);

          const bgInput = new TextInputBuilder()
            .setCustomId("card_background")
            .setLabel(hasPremium ? "Background Image URL (premium)" : "Background Image URL (premium only)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(hasPremium ? "Paste an image URL or leave empty" : "Requires +5 Slots premium subscription")
            .setValue(character.cardBackground || "")
            .setRequired(false)
            .setMaxLength(500);

          const modal = new ModalBuilder()
            .setCustomId(`edit_character_card_style_${characterId}`)
            .setTitle("Edit Card Style")
            .addComponents(
              new ActionRowBuilder().addComponents(themeInput),
              new ActionRowBuilder().addComponents(accentInput),
              new ActionRowBuilder().addComponents(bgInput)
            );

          await interaction.showModal(modal);
        } catch (error) {
          console.error("Error creating/showing card style edit modal:", error);
          await replyComponentsV2(
            interaction,
            "Error",
            ["Failed to open card style form. Please try again."],
            [],
            { ephemeral: true }
          );
        }
        return;
      }

      if (interaction.customId.startsWith("edit_media_")) {
        const characterId = interaction.customId.replace("edit_media_", "");
        const character = getCharacterById(characterId, interaction.guildId);

        if (!character) {
          await replyComponentsV2(
            interaction,
            "Edit Media",
            [`Character with ID "${characterId}" does not exist.`],
            [],
            { ephemeral: true }
          );
          return;
        }

        // Check permissions
        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
        const isOwner = getAssignedUserId(interaction.guildId, characterId) === interaction.user.id;

        if (!isAdmin && !isOwner) {
          await replyComponentsV2(
            interaction,
            "Edit Media",
            ["You do not have permission to edit this character."],
            [],
            { ephemeral: true }
          );
          return;
        }

        try {
          const avatarInput = new TextInputBuilder()
            .setCustomId("avatar")
            .setLabel("Avatar URL")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Leave empty to keep current value")
            .setValue(character.avatarUrl || "")
            .setRequired(false)
            .setMaxLength(500);

          const actionRow = new ActionRowBuilder().addComponents(avatarInput);

          const modal = new ModalBuilder()
            .setCustomId(`edit_character_media_${characterId}`)
            .setTitle("Edit Character - Media")
            .addComponents(actionRow);

          console.log("Showing media edit modal for character:", characterId);
          await interaction.showModal(modal);
        } catch (error) {
          console.error("Error creating/showing media edit modal:", error);
          await replyComponentsV2(
            interaction,
            "Error",
            ["Failed to open edit form. Please try again."],
            [],
            { ephemeral: true }
          );
        }
        return;
      }

      if (interaction.customId === "confirm_delete" || interaction.customId === "cancel_delete") {
        // Button handler is already in the delete command above
        // This is just for safety
        return;
      }
    }
  } catch (error) {
    console.error("Interaction error:", error);
    try {
      if (interaction.isAutocomplete?.()) {
        // Autocomplete interactions cannot be replied to — just log and bail
        return;
      }
      if (!interaction.replied && !interaction.deferred) {
        await replyComponentsV2(
          interaction,
          "Error",
          ["Something went wrong handling that interaction."],
          [],
          { ephemeral: true }
        );
      } else if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({
          content: "Something went wrong handling that interaction.",
          components: []
        });
      } else {
        await interaction.followUp({
          content: "Something went wrong handling that interaction.",
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error("Failed to send error message:", replyError);
    }
  } finally {
    clearAckGuard();
  }
});

client.on("entitlementCreate", (entitlement) => {
  try {
    const skuId = getEntitlementSkuId(entitlement);
    const userId = getEntitlementUserId(entitlement);
    const guildId = getEntitlementGuildId(entitlement);
    console.log(`[Entitlement] Created: SKU=${skuId}, User=${userId || "none"}, Guild=${guildId || "none"}`);

    if (DISCORD_PREMIUM_SLOT_SKU_IDS.size === 0 || !DISCORD_PREMIUM_SLOT_SKU_IDS.has(skuId) || !userId) {
      return;
    }

    // Eagerly update the in-memory cache so the user's subscription slots are visible immediately
    if (guildId) {
      const scopeKey = getUserSlotsKey(guildId, userId);
      entitlementSlotBonusByScopeUser.set(scopeKey, DISCORD_PREMIUM_SUBSCRIPTION_SLOTS);
    }
  } catch (error) {
    console.error("Failed to handle entitlementCreate:", error);
  }
});

client.on("entitlementDelete", (entitlement) => {
  try {
    const skuId = getEntitlementSkuId(entitlement);
    const userId = getEntitlementUserId(entitlement);
    const guildId = getEntitlementGuildId(entitlement);
    console.log(`[Entitlement] Deleted: SKU=${skuId}, User=${userId || "none"}, Guild=${guildId || "none"}`);

    if (DISCORD_PREMIUM_SLOT_SKU_IDS.size === 0 || !DISCORD_PREMIUM_SLOT_SKU_IDS.has(skuId) || !userId || !guildId) {
      return;
    }

    // Remove from in-memory cache; next interaction will re-sync from Discord
    const scopeKey = getUserSlotsKey(guildId, userId);
    entitlementSlotBonusByScopeUser.delete(scopeKey);
  } catch (error) {
    console.error("Failed to handle entitlementDelete:", error);
  }
});

client.on("messageCreate", async (message) => {
  try {
    if (!message.guild) {
      return;
    }

    if (message.author?.bot) {
      return;
    }

    if (message.webhookId) {
      return;
    }

    if (shouldAwardPoints(messagePointsCooldowns, message.guild.id, message.author.id, MESSAGE_POINTS_COOLDOWN_MS)) {
      addPoints(message.guild.id, message.author.id, getRandomMessagePointsReward());
    }
  } catch (error) {
    console.error("Failed to award message points:", error);
  }
});

client.on("error", (error) => {
  console.error("Discord client error:", error);
});

client.on("shardError", (error) => {
  console.error("Discord shard websocket error:", error);
});

client.on("shardDisconnect", (event, shardId) => {
  console.warn(`Discord shard ${shardId} disconnected (code=${event?.code || "unknown"}).`);
});

client.on("shardReconnecting", (shardId) => {
  console.log(`Discord shard ${shardId} reconnecting.`);
});

client.on("shardResume", (shardId, replayedEvents) => {
  console.log(`Discord shard ${shardId} resumed (replayedEvents=${replayedEvents}).`);
});

client.on("invalidated", () => {
  console.error("Discord session invalidated. Exiting so Railway can restart cleanly.");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

// Minimal HTTP server so Railway health checks succeed and the container
// is never considered idle/unhealthy when the bot is running fine.
const _healthPort = parseInt(process.env.PORT || "3000", 10);
http
  .createServer((_req, res) => {
    const status = client.isReady() ? "ready" : "starting";
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(`OK:${status}`);
  })
  .listen(_healthPort, () => {
    console.log(`Health-check server listening on port ${_healthPort}.`);
  });

await initEconomyDatabase();

const token = process.env.DISCORD_TOKEN;
if (!token) {
  throw new Error("DISCORD_TOKEN must be set in the environment.");
}

// Retry login to handle transient network timeouts at container startup.
const isTokenError = (e) => e?.code === "TokenInvalid" || String(e?.message).includes("TOKEN_INVALID");
const isTransientNetworkError = (e) => {
  const code = e?.code || "";
  return ["UND_ERR_CONNECT_TIMEOUT", "ETIMEDOUT", "ECONNRESET", "ENETUNREACH", "EAI_AGAIN"].includes(code);
};
let loginAttempt = 0;
while (true) {
  loginAttempt++;
  try {
    await client.login(token);
    break; // success
  } catch (error) {
    if (isTokenError(error)) {
      console.error("Discord token is invalid. Verify DISCORD_TOKEN in Railway Variables.", error);
      process.exit(1);
    }

    if (!isTransientNetworkError(error)) {
      console.error("Login failed with a non-transient error. Exiting:", error);
      process.exit(1);
    }

    const delaySec = Math.min(30, loginAttempt * 5);
    console.error(`Login attempt ${loginAttempt} failed (${error?.code || error?.message}). Retrying in ${delaySec}s...`);
    await new Promise((r) => setTimeout(r, delaySec * 1000));
  }
}
