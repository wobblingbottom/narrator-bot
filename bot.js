import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import sharp from "sharp";
import {
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

const DATA_DIR = path.resolve("./data");
const CONFIG_DIR = path.resolve("./config");
const CHARACTERS_PATH = path.join(CONFIG_DIR, "characters.json");
const ASSIGNMENTS_PATH = path.join(DATA_DIR, "assignments.json");
const SELECTIONS_PATH = path.join(DATA_DIR, "selections.json");
const WEBHOOKS_PATH = path.join(DATA_DIR, "webhooks.json");
const LOGS_CHANNEL_PATH = path.join(DATA_DIR, "logsChannel.json");
const MESSAGE_LOGS_PATH = path.join(DATA_DIR, "messageLogs.json");
const USERS_PROFILES_PATH = path.join(DATA_DIR, "userProfiles.json");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to read ${filePath}:`, error);
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

ensureDir(DATA_DIR);
ensureDir(CONFIG_DIR);

if (!fs.existsSync(CHARACTERS_PATH)) {
  throw new Error("Missing config/characters.json. Create it before starting the bot.");
}

const characters = readJson(CHARACTERS_PATH, []);
if (!Array.isArray(characters) || characters.length === 0) {
  throw new Error("config/characters.json must be a non-empty array.");
}

let assignments = readJson(ASSIGNMENTS_PATH, {});
let selections = readJson(SELECTIONS_PATH, {});
let webhooks = readJson(WEBHOOKS_PATH, {});
let logsChannelId = readJson(LOGS_CHANNEL_PATH, null);
let messageLogs = readJson(MESSAGE_LOGS_PATH, []);
let userProfiles = readJson(USERS_PROFILES_PATH, {});

function saveAssignments() {
  writeJson(ASSIGNMENTS_PATH, assignments);
}

function saveSelections() {
  writeJson(SELECTIONS_PATH, selections);
}

function saveWebhooks() {
  writeJson(WEBHOOKS_PATH, webhooks);
}

function saveLogsChannel() {
  writeJson(LOGS_CHANNEL_PATH, logsChannelId);
}

function saveMessageLogs() {
  writeJson(MESSAGE_LOGS_PATH, messageLogs);
}

function saveUserProfiles() {
  writeJson(USERS_PROFILES_PATH, userProfiles);
}

function buildComponentsBox(title, lines = [], extraComponents = []) {
  const components = [];
  if (title) {
    components.push({ type: 10, content: `## ${title}` });
  }
  if (lines.length > 0) {
    if (title) {
      components.push({ type: 14, divider: true, spacing: 1 });
    }
    for (const line of lines) {
      components.push({ type: 10, content: line });
    }
  }
  if (extraComponents.length > 0) {
    components.push({ type: 14, divider: true, spacing: 1 });
    components.push(...extraComponents);
  }
  return [{ type: 17, components }];
}

async function replyComponentsV2(interaction, title, lines, extraComponents, options = {}) {
  const replyOptions = {
    flags: 32768,
    components: buildComponentsBox(title, lines, extraComponents),
    ...options
  };
  delete replyOptions.accentColor;
  await interaction.reply(replyOptions);
}

async function editComponentsV2(interaction, title, lines, extraComponents, options = {}) {
  const replyOptions = {
    flags: 32768,
    components: buildComponentsBox(title, lines, extraComponents),
    ...options
  };
  delete replyOptions.accentColor;
  await interaction.editReply(replyOptions);
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

function logMessage(userId, characterName, message, channelId, guildId) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    userId: userId,
    characterName: characterName,
    message: message,
    channelId: channelId,
    guildId: guildId
  };
  messageLogs.push(logEntry);
  // Keep last 1000 messages
  if (messageLogs.length > 1000) {
    messageLogs = messageLogs.slice(-1000);
  }
  saveMessageLogs();
  return logEntry;
}

function getCharacterById(characterId) {
  return characters.find((character) => character.id === characterId);
}

function getOwnedCharacters(userId) {
  return characters.filter((character) => assignments[character.id] === userId);
}

async function registerCommands() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

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
      subcommand.setName("pick").setDescription("Pick your character")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("assign")
        .setDescription("Assign a character to a user (admin only)")
        .addStringOption((option) =>
          option
            .setName("character")
            .setDescription("Character ID to assign")
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
            .setDescription("Character ID to remove")
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
            .setDescription("Character ID to edit")
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("profile")
        .setDescription("View character profile")
        .addStringOption((option) =>
          option
            .setName("character")
            .setDescription("Character ID to view")
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
            .setDescription("Character ID to delete")
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

  const sayCommand = new SlashCommandBuilder()
    .setName("say")
    .setDescription("Send a message as your selected character")
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Message content")
        .setRequired(true)
        .setMaxLength(2000)
    );

  const setupCommand = new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configure bot settings (admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup-logs-channel")
        .setDescription("Set the channel for bot logs")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel for logs")
            .setRequired(true)
            .addChannelTypes(0, 5) // Text and News channels
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

  const commands = [characterCommand.toJSON(), userCommand.toJSON(), sayCommand.toJSON(), setupCommand.toJSON(), botSayCommand.toJSON(), helpCommand.toJSON()];
  const rest = new REST({ version: "10" }).setToken(token);

  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands
      });
      console.log("Registered guild commands.");
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log("Registered global commands.");
    }
  } catch (error) {
    console.error("Failed to register commands:", error);
    throw error;
  }
}

async function ensureWebhook(channel, character, botMember) {
  // For threads, we need to use the parent channel for webhooks
  const isThread = channel.isThread();
  const targetChannel = isThread ? channel.parent : channel;
  const channelId = targetChannel.id;
  const entry = webhooks[channelId]?.[character.id];

  // Try to validate cached webhook
  if (entry?.id && entry?.token) {
    try {
      const webhookClient = new WebhookClient({
        id: entry.id,
        token: entry.token
      });
      // Test by fetching the webhook
      await webhookClient.fetch();
      return entry;
    } catch (error) {
      console.log(`Cached webhook invalid for ${character.id}, recreating...`);
      // Delete invalid cached webhook
      if (webhooks[channelId]) {
        delete webhooks[channelId][character.id];
        saveWebhooks();
      }
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

  // Fetch existing webhooks to find one we can reuse
  let webhook;
  try {
    const existingWebhooks = await targetChannel.fetchWebhooks();
    // Find any webhook created by this bot
    webhook = existingWebhooks.find((wh) => wh.owner?.id === botMember.id);
    
    if (webhook) {
      console.log(`Reusing existing webhook in channel ${targetChannel.id}`);
    } else {
      // Create a new webhook only if we don't have one
      webhook = await targetChannel.createWebhook({
        name: "Character RP",
        avatar: undefined
      });
      console.log(`Created new webhook in channel ${targetChannel.id}`);
    }
  } catch (error) {
    if (error.code === 30007) {
      // Maximum webhooks reached, try to reuse ANY webhook in the channel
      const existingWebhooks = await channel.fetchWebhooks();
      webhook = existingWebhooks.first();
      if (!webhook) {
        throw new Error("Maximum webhooks reached and no webhooks available to reuse.");
      }
      console.log(`Reusing any available webhook due to limit in channel ${channel.id}`);
    } else {
      throw error;
    }
  }

  if (!webhooks[channelId]) {
    webhooks[channelId] = {};
  }

  webhooks[channelId][character.id] = {
    id: webhook.id,
    token: webhook.token
  };
  saveWebhooks();

  return webhooks[channelId][character.id];
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
      const avatarResized = await sharp(character.avatarUrl)
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


const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      const subcommand = interaction.options.getSubcommand();
      if (interaction.commandName === "character" && (subcommand === "assign" || subcommand === "remove" || subcommand === "edit" || subcommand === "delete" || subcommand === "profile")) {
        const focusedValue = interaction.options.getFocused(true);
        if (focusedValue.name === "character") {
          let choices;
          
          // For edit command, only show user's own characters (unless admin)
          if (subcommand === "edit") {
            const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
            if (isAdmin) {
              // Admins see all characters
              choices = characters
                .map((c) => c.id)
                .filter((id) => id.toLowerCase().includes(focusedValue.value.toLowerCase()));
            } else {
              // Regular users see only their assigned characters
              choices = characters
                .filter((c) => assignments[c.id] === interaction.user.id)
                .map((c) => c.id)
                .filter((id) => id.toLowerCase().includes(focusedValue.value.toLowerCase()));
            }
          } else {
            // For other commands, show all characters
            choices = characters
              .map((c) => c.id)
              .filter((id) => id.toLowerCase().includes(focusedValue.value.toLowerCase()));
          }
          
          await interaction.respond(
            choices.slice(0, 25).map((choice) => ({ name: choice, value: choice }))
          );
        }
      }
      return;
    }

    if (interaction.isChatInputCommand()) {
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
          const character = getCharacterById(characterId);

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

          assignments[characterId] = user.id;
          saveAssignments();

          await replyComponentsV2(
            interaction,
            "Character Assigned",
            [`Assigned **${character.name}** to **${user.tag}**.`],
            [],
            { ephemeral: true, accentColor: COLORS.SUCCESS }
          );
          return;
        }

        if (subcommand === "pick") {
          const ownedCharacters = getOwnedCharacters(interaction.user.id);

          if (ownedCharacters.length === 0) {
            await replyComponentsV2(
              interaction,
              null,
              ["You do not have any characters assigned. Ask an admin to assign one."],
              [],
              { ephemeral: true }
            );
            return;
          }

          const pickComponents = [
            { type: 10, content: "Choose your character from the menu below:" },
            {
              type: 1,
              components: [
                {
                  type: 3,
                  custom_id: "character_select",
                  placeholder: "Select your character",
                  options: ownedCharacters.slice(0, 25).map((character) => ({
                    label: character.name,
                    value: character.id
                  }))
                }
              ]
            }
          ];

          await interaction.reply({
            flags: 32768,
            components: [{ type: 17, components: pickComponents }],
            ephemeral: true
          });
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
          if (characters.some((c) => c.id === characterId)) {
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
            { ephemeral: true, accentColor: COLORS.SUCCESS }
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
          if (characters.some((c) => c.id === characterId)) {
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
          assignments[characterId] = interaction.user.id;
          
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
          const character = getCharacterById(characterId);
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
          if (assignments[characterId] !== targetUserId) {
            await replyComponentsV2(
              interaction,
              "Remove Character",
              [`Character **${character.name}** is not assigned to that user.`],
              [],
              { ephemeral: true }
            );
            return;
          }

          delete assignments[characterId];
          saveAssignments();

          // Also remove from selections if the target user had it selected
          if (selections[targetUserId] === characterId) {
            delete selections[targetUserId];
            saveSelections();
          }

          const targetName = targetUser ? `<@${targetUserId}>` : "yourself";
          await replyComponentsV2(
            interaction,
            "Assignment Removed",
            [`Removed assignment for **${character.name}** from ${targetName}.`],
            [],
            { ephemeral: true, accentColor: COLORS.SUCCESS }
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

          const ownedCharacters = characters.filter((c) => assignments[c.id] === targetUserId);

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

          ownedCharacters.forEach((c) => {
            const bioSnippet = c.bio ? c.bio.substring(0, 100) + (c.bio.length > 100 ? "..." : "") : "_(No bio)_";
            components.push({
              type: 10,
              content: `**${c.name}** (\`${c.id}\`)\n${bioSnippet}`
            });
          });

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
          const character = getCharacterById(characterId);
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
          const isOwner = assignments[characterId] === interaction.user.id;

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

        if (subcommand === "profile") {
          const characterId = interaction.options.getString("character", true);
          const character = getCharacterById(characterId);

          if (!character) {
            await replyComponentsV2(
              interaction,
              "View Profile",
              [`Character with ID "${characterId}" does not exist.`],
              [],
              { ephemeral: true }
            );
            return;
          }

          await replyComponentsV2(
            interaction,
            character.name,
            [
              character.bio ? `**Bio:** ${character.bio}` : "",
              character.personality ? `**Personality:** ${character.personality}` : "",
              character.backstory ? `**Backstory:** ${character.backstory}` : "",
              character.age ? `**Age:** ${character.age}` : "",
              character.race ? `**Race/Species:** ${character.race}` : "",
              character.class ? `**Class:** ${character.class}` : "",
              character.relationship ? `**Status:** ${character.relationship}` : ""
            ].filter(line => line),
            []
          );
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
          const character = getCharacterById(characterId);
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
                  custom_id: "confirm_delete",
                  emoji: { name: "🗑️" }
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
              const index = characters.findIndex((c) => c.id === characterId);
              if (index > -1) {
                characters.splice(index, 1);
                writeJson(CHARACTERS_PATH, characters);
              }

              // Remove assignments
              if (assignments[characterId]) {
                delete assignments[characterId];
                saveAssignments();
              }

              // Remove from selections
              for (const userId in selections) {
                if (selections[userId] === characterId) {
                  delete selections[userId];
                }
              }
              saveSelections();

              // Log the deletion
              const deleteLog = `Deleted character \`${characterId}\` (${character.name})`;
              logMessage(interaction.user.id, `[ADMIN] Character Delete`, deleteLog, interaction.channelId, interaction.guildId);

              // Send log to logs channel if configured
              if (logsChannelId) {
                try {
                  const logsChannel = await interaction.client.channels.fetch(logsChannelId);
                  if (logsChannel?.isTextBased()) {
                    const actorName = interaction.user.username;
                    const deleteLogComponents = [
                      { type: 10, content: `## Character Deleted` },
                      { type: 14, divider: true, spacing: 1 },
                      { type: 10, content: `**Admin:** ${actorName}` },
                      { type: 10, content: `**Character:** ${character.name} (\`${characterId}\`)` },
                      { type: 14, divider: true, spacing: 1 },
                      { type: 10, content: `_${interaction.user.username}_ • ${new Date().toISOString()}` }
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
                { type: 10, content: "## Character Deleted ✅" },
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
      }

      if (interaction.commandName === "user") {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "profile") {
          const targetUser = interaction.options.getUser("user") || interaction.user;
          const userId = targetUser.id;
          const userProfile = userProfiles[userId];

          const profileLines = userProfile ? [
            userProfile.nickname ? `**Nickname:** ${userProfile.nickname}` : "",
            userProfile.about ? `**About:** ${userProfile.about}` : "",
            userProfile.interests ? `**Interests:** ${userProfile.interests}` : ""
          ].filter(line => line) : [];

          await replyComponentsV2(
            interaction,
            `${targetUser.username}`,
            profileLines.length > 0 ? profileLines : ["No profile information set."],
            []
          );
        }

        if (subcommand === "edit") {
          const userId = interaction.user.id;
          const userProfile = userProfiles[userId];

          const profileLines = userProfile ? [
            userProfile.nickname ? `**Nickname:** ${userProfile.nickname}` : "",
            userProfile.about ? `**About:** ${userProfile.about}` : "",
            userProfile.interests ? `**Interests:** ${userProfile.interests}` : ""
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

        const selectedCharacterId = selections[interaction.user.id];
        if (!selectedCharacterId) {
          await editComponentsV2(
            interaction,
            null,
            ["Select a character first with /character pick."],
            []
          );
          return;
        }

        if (assignments[selectedCharacterId] !== interaction.user.id) {
          await editComponentsV2(
            interaction,
            null,
            ["You are not assigned to that character."],
            []
          );
          return;
        }

        const character = getCharacterById(selectedCharacterId);
        if (!character) {
          await editComponentsV2(
            interaction,
            null,
            ["Selected character no longer exists."],
            []
          );
          return;
        }

        const message = interaction.options.getString("message", true);

        let webhookInfo;
        try {
          const botMember = await interaction.guild.members.fetchMe();
          webhookInfo = await ensureWebhook(channel, character, botMember);
        } catch (error) {
          console.error("Webhook setup failed:", error);
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

          const webhookOptions = {
            content: message,
            username: character.name,
            avatarURL: character.avatarUrl || undefined,
            allowedMentions: { parse: [] }
          };

          // If we're in a thread, specify the thread ID
          if (channel.isThread()) {
            webhookOptions.threadId = channel.id;
          }

          await webhookClient.send(webhookOptions);

          // Log the message
          logMessage(interaction.user.id, character.name, message, interaction.channelId, interaction.guildId);

          // Send log to logs channel if configured
          if (logsChannelId) {
            try {
              const logsChannel = await interaction.client.channels.fetch(logsChannelId);
              if (logsChannel?.isTextBased()) {
                const actorName = interaction.user.username;
                const messageLogComponents = [
                  { type: 10, content: `## Message Sent` },
                  { type: 14, divider: true, spacing: 1 },
                  { type: 10, content: `**User:** ${actorName}` },
                  { type: 10, content: `**Character:** ${character.name}` },
                  { type: 10, content: `**Channel:** <#${interaction.channelId}>` },
                  { type: 14, divider: false, spacing: 1 },
                  { type: 10, content: `**Message:**\n${message.substring(0, 1900) || "_(empty)_"}` },
                  { type: 14, divider: true, spacing: 1 },
                  { type: 10, content: `_${interaction.user.username}_ • ${new Date().toISOString()}` }
                ];
                await logsChannel.send({
                  flags: 32768,
                  components: [{ type: 17, components: messageLogComponents }],
                  allowedMentions: { parse: [] }
                });
              }
            } catch (logError) {
              console.error("Failed to send log to logs channel:", logError);
            }
          }

          await editComponentsV2(
            interaction,
            null,
            [`Sent as **${character.name}**.`],
            []
          );
        } catch (error) {
          console.error("Webhook send error:", error);
          try {
            await editComponentsV2(
              interaction,
              null,
              ["Failed to send the message using the webhook."],
              []
            );
          } catch (replyError) {
            console.error("Failed to send error reply:", replyError);
          }
        }
      }

      if (interaction.commandName === "setup") {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          await replyComponentsV2(
            interaction,
            "Setup",
            ["You do not have permission to configure the bot."],
            [],
            { ephemeral: true }
          );
          return;
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "setup-logs-channel") {
          const channel = interaction.options.getChannel("channel", true);

          if (!channel.isTextBased()) {
            await replyComponentsV2(
              interaction,
              "Setup",
              ["The channel must be a text-based channel."],
              [],
              { ephemeral: true }
            );
            return;
          }

          logsChannelId = channel.id;
          saveLogsChannel();

          await replyComponentsV2(
            interaction,
            "Setup",
            [`Logs channel set to <#${channel.id}>.`],
            [],
            { ephemeral: true }
          );
        }
      }

      if (interaction.commandName === "help") {
        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

        const publicCommands = [
          { name: "/character pick", desc: "Select your active character" },
          { name: "/character profile [character]", desc: "View character details" },
          { name: "/character remove [character]", desc: "Remove character assignment" },
          { name: "/character list", desc: "List your assigned characters" },
          { name: "/character edit [character]", desc: "Edit your character info" },
          { name: "/character create-and-assign", desc: "Create and auto-assign a character" },
          { name: "/user profile [user]", desc: "View user profile" },
          { name: "/user edit", desc: "Edit your profile" },
          { name: "/say [message]", desc: "Send message as your character" }
        ];

        const adminCommands = [
          { name: "/character assign [character] [user]", desc: "Assign character to user" },
          { name: "/character create [options]", desc: "Create character (admin only)" },
          { name: "/character delete [character]", desc: "Delete character" },
          { name: "/character clear-webhooks", desc: "Clear webhook cache" },
          { name: "/setup setup-logs-channel [channel]", desc: "Set logging channel" },
          { name: "/bot-say [message] [channel]", desc: "Send message as bot" }
        ];

        const buildHelpEmbed = (type) => {
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

        const initialComponents = buildHelpEmbed("public");
        
        await interaction.reply({
          flags: 32768,
          components: [{ type: 17, components: initialComponents }],
          ephemeral: true
        });
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

        const message = interaction.options.getString("message", true);
        const targetChannel = interaction.options.getChannel("channel", false) || interaction.channel;

        if (!targetChannel || !targetChannel.isTextBased()) {
          await replyComponentsV2(
            interaction,
            "Bot Say",
            ["The target channel must be a text-based channel."],
            [],
            { ephemeral: true }
          );
          return;
        }

        try {
          await targetChannel.send({
            content: message
          });

          await replyComponentsV2(
            interaction,
            "Bot Say",
            [`Message sent to <#${targetChannel.id}>.`],
            [],
            { ephemeral: true }
          );
        } catch (error) {
          console.error("Failed to send bot message:", error);
          await replyComponentsV2(
            interaction,
            "Bot Say",
            ["Failed to send the message. Check bot permissions."],
            [],
            { ephemeral: true }
          );
        }
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId !== "character_select") {
        return;
      }

      const characterId = interaction.values[0];
      const character = getCharacterById(characterId);

      if (!character) {
        await replyComponentsV2(
          interaction,
          "Select Character",
          ["That character does not exist."],
          [],
          { ephemeral: true }
        );
        return;
      }

      if (assignments[characterId] !== interaction.user.id) {
        await replyComponentsV2(
          interaction,
          "Select Character",
          ["You are not assigned to that character."],
          [],
          { ephemeral: true }
        );
        return;
      }

      selections[interaction.user.id] = characterId;
      saveSelections();

      await replyComponentsV2(
        interaction,
        null,
        [`Selected **${character.name}**.`],
        [],
        { ephemeral: true }
      );
    }

    if (interaction.isButton()) {
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
          { name: "/say [message]", desc: "Send message as your character" }
        ];

        const adminCommands = [
          { name: "/character assign [character] [user]", desc: "Assign character to user" },
          { name: "/character create [options]", desc: "Create character (admin only)" },
          { name: "/character delete [character]", desc: "Delete character" },
          { name: "/character clear-webhooks", desc: "Clear webhook cache" },
          { name: "/setup setup-logs-channel [channel]", desc: "Set logging channel" },
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
    }

    if (interaction.isModalSubmit()) {
      console.log("=== MODAL SUBMIT ===");
      console.log("Modal customId:", interaction.customId);
      console.log("Checking edit_user_profile_modal...");
      
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
        if (logsChannelId) {
          try {
            const logsChannel = await interaction.client.channels.fetch(logsChannelId);
            if (logsChannel?.isTextBased()) {
              const logComponents = [
                { type: 10, content: "## User Profile Updated" },
                { type: 14, divider: true, spacing: 1 },
                { type: 10, content: `**User:** ${interaction.user.username}` },
                { type: 10, content: `**Changes:**\n${updates.join("\n")}` },
                { type: 14, divider: true, spacing: 1 },
                { type: 10, content: `_${interaction.user.username}_ • ${new Date().toISOString()}` }
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
        const character = getCharacterById(characterId);
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
        const isOwner = assignments[characterId] === interaction.user.id;

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
        if (logsChannelId) {
          try {
            const logsChannel = await interaction.client.channels.fetch(logsChannelId);
            if (logsChannel?.isTextBased()) {
              const actorName = interaction.user.username;
              const logComponents = [
                { type: 10, content: "## Character Edited" },
                { type: 14, divider: true, spacing: 1 },
                { type: 10, content: `**${isAdmin ? "Admin" : "User"}:** ${actorName}` },
                { type: 10, content: `**Character ID:** \`${characterId}\`` },
                { type: 10, content: `**Changes:**\n${updates.join("\n")}` },
                { type: 14, divider: true, spacing: 1 },
                { type: 10, content: `_${interaction.user.username}_ • ${new Date().toISOString()}` }
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
        const character = getCharacterById(characterId);
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
        const isOwner = assignments[characterId] === interaction.user.id;

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
        if (logsChannelId) {
          try {
            const logsChannel = await interaction.client.channels.fetch(logsChannelId);
            if (logsChannel?.isTextBased()) {
              const actorName = interaction.user.username;
              const logComponents = [
                { type: 10, content: "## Character Edited" },
                { type: 14, divider: true, spacing: 1 },
                { type: 10, content: `**${isAdmin ? "Admin" : "User"}:** ${actorName}` },
                { type: 10, content: `**Character ID:** \`${characterId}\`` },
                { type: 10, content: `**Changes:**\n${updates.join("\n")}` },
                { type: 14, divider: true, spacing: 1 },
                { type: 10, content: `_${interaction.user.username}_ • ${new Date().toISOString()}` }
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

      console.log("Checking edit_character_media_...");
      if (interaction.customId.startsWith("edit_character_media_")) {
        console.log("=== MEDIA EDIT HANDLER ===");
        const characterId = interaction.customId.replace("edit_character_media_", "");

        // Check if character exists
        const character = getCharacterById(characterId);
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
        const isOwner = assignments[characterId] === interaction.user.id;

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
          if (logsChannelId) {
            try {
              const logsChannel = await interaction.client.channels.fetch(logsChannelId);
              if (logsChannel?.isTextBased()) {
                const actorName = interaction.user.username;
                const logComponents = [
                  { type: 10, content: "## Character Edited" },
                  { type: 14, divider: true, spacing: 1 },
                  { type: 10, content: `**${isAdmin ? "Admin" : "User"}:** ${actorName}` },
                  { type: 10, content: `**Character ID:** \`${characterId}\`` },
                  { type: 10, content: `**Changes:**\n${updates.join("\n")}` },
                  { type: 14, divider: true, spacing: 1 },
                  { type: 10, content: `_${interaction.user.username}_ • ${new Date().toISOString()}` }
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
      if (interaction.customId.startsWith("edit_basic_")) {
        const characterId = interaction.customId.replace("edit_basic_", "");
        const character = getCharacterById(characterId);

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
        const isOwner = assignments[characterId] === interaction.user.id;

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
        const character = getCharacterById(characterId);

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
        const isOwner = assignments[characterId] === interaction.user.id;

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

      if (interaction.customId.startsWith("edit_media_")) {
        const characterId = interaction.customId.replace("edit_media_", "");
        const character = getCharacterById(characterId);

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
        const isOwner = assignments[characterId] === interaction.user.id;

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
      if (!interaction.replied && !interaction.deferred) {
        await replyComponentsV2(
          interaction,
          "Error",
          ["Something went wrong handling that interaction."],
          [],
          { ephemeral: true }
        );
      }
    } catch (replyError) {
      console.error("Failed to send error message:", replyError);
    }
  }
});

await registerCommands();

const token = process.env.DISCORD_TOKEN;
if (!token) {
  throw new Error("DISCORD_TOKEN must be set in the environment.");
}

client.login(token);
