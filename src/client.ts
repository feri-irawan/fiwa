import type { Boom } from "@hapi/boom";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type WASocket,
} from "baileys";
import { EventEmitter } from "events";
import NodeCache from "node-cache";
import P from "pino";
import { WhatsAppError } from "./errors";
import type { FiWhatsAppEventMap, FiWhatsAppOptions } from "./types";
import { rm } from "fs/promises";

export class FiWhatsAppClient extends EventEmitter<FiWhatsAppEventMap> {
  sock: WASocket;
  private logger: P.Logger;
  private logPath: string;
  private sessionDir: string;
  private groupCache: NodeCache;
  private maxRetries: number;
  private retryCount: number;
  private isConnected: boolean;
  private browser: keyof typeof Browsers;
  private device: string;
  private phoneNumber: string;

  constructor(options: FiWhatsAppOptions = {}) {
    super();

    // Validate options
    if (options.maxRetries && options.maxRetries < 1) {
      throw new WhatsAppError("maxRetries must be at least 1");
    }

    this.sock = {} as WASocket;
    this.phoneNumber = options.phoneNumber || "";
    this.logPath = options.logPath || "./whatsapp.log";
    this.sessionDir = options.sessionDir || "./whatsapp_session";
    this.maxRetries = options.maxRetries || 3;
    this.retryCount = 0;
    this.isConnected = false;
    this.browser = options.browser || "macOS";
    this.device = options.device || "Desktop";

    this.groupCache = new NodeCache({
      stdTTL: 60 * 60, // 1 hour
      checkperiod: 60 * 60, // 1 hour
    });

    this.logger = P(
      { timestamp: () => `,"time":"${new Date().toJSON()}"` },
      P.destination(this.logPath)
    );
  }

  public async start(): Promise<void> {
    try {
      this.logger.info("Starting WhatsApp client...");
      await this.connect();
      this.logger.info("WhatsApp client started successfully");
    } catch (error) {
      this.logger.error("Failed to start client:", error);
      throw error;
    }
  }

  private async connect(): Promise<void> {
    try {
      this.logger.info("Connecting to WhatsApp...");

      // Create session state
      const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);

      // Get latest WhatsApp version
      const { version, isLatest } = await fetchLatestBaileysVersion();
      this.logger.info(
        `Using WhatsApp v${version.join(".")}, isLatest: ${isLatest}`
      );

      // Configure socket
      this.sock = makeWASocket({
        browser: Browsers[this.browser](this.device),
        logger: this.logger,
        printQRInTerminal: !this.phoneNumber,
        markOnlineOnConnect: false,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, this.logger),
        },
        msgRetryCounterCache: new NodeCache(),
        cachedGroupMetadata: async (jid) => this.groupCache.get(jid),
        generateHighQualityLinkPreview: true,
        connectTimeoutMs: 30000,
      });

      // Setup event handlers
      this.setupSocketEvents(saveCreds);
    } catch (error) {
      this.logger.error("Connection failed:", error);
      throw error;
    }
  }

  private setupSocketEvents(saveCreds: () => Promise<void>): void {
    // Save credentials
    this.sock.ev.on("creds.update", async () => {
      try {
        await saveCreds();
        this.logger.info("Credentials updated successfully");
      } catch (error) {
        this.logger.error("Failed to save credentials:", error);
      }
    });

    // Handle connection updates
    this.sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.emit("qr", qr);
        this.logger.info("QR code received");

        // Request pairing code if phone number is provided
        if (this.phoneNumber && !this.sock.authState.creds.registered) {
          this.logger.info("Requesting pairing code");
          const code = await this.sock.requestPairingCode(this.phoneNumber);
          this.emit("pairingCode", code);
        }
      }

      if (connection === "open") {
        this.retryCount = 0;
        this.isConnected = true;
        this.emit("ready");
        this.logger.info("Connected to WhatsApp");
      }

      if (connection === "close") {
        this.isConnected = false;
        if (lastDisconnect?.error) {
          this.logger.error("Disconnected:", lastDisconnect.error);
        }

        // Handle reconnection logic
        const errorCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const isLoggedOut = errorCode === DisconnectReason.loggedOut;
        if (!isLoggedOut) {
          if (this.retryCount < this.maxRetries) {
            this.retryCount++;

            // Delete the session directory if failed to reconnect with a phone number.
            // Why? Because if the session directory is not deleted or empty, connecting with a phone number will throw an error, even if we retry to connect many times.
            // So, we need to delete the session directory and restart the client to fix it.
            // Why >1? Because the first retry is just a normal retry, after scanning the QR code. Ref: https://baileys.wiki/docs/socket/connecting
            if (
              this.retryCount > 1 &&
              (this.phoneNumber || this.sock.authState.creds.me)
            ) {
              this.logger.info("Deleting session directory");
              await rm(this.sessionDir, { recursive: true, force: true });
            }

            this.logger.info(
              `Attempting reconnection (${this.retryCount}/${this.maxRetries})`
            );
            await this.connect();
            this.emit("reconnect");
          } else {
            this.logger.error("Max retries reached");
            this.emit("error", new WhatsAppError("Max retries reached"));
          }
        } else {
          this.logger.info("Logged out");
          await this.sock.logout();
          this.emit("logout");
        }
      }
    });

    // Handle messages
    this.sock.ev.on("messages.upsert", async ({ type, messages }) => {
      if (type === "notify") {
        for (const message of messages) {
          this.emit("message", message);
          this.logger.debug("Received message:", message.key.id);
        }
      }
    });

    // Handle message deletion
    this.sock.ev.on("messages.delete", (key) => {
      this.emit("messages.delete", key);
      this.logger.debug("Message deleted:", key);
    });

    // Handle message updates
    this.sock.ev.on("messages.update", (update) => {
      this.emit("messages.update", update);
      this.logger.debug("Message updated:", update);
    });
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.sock) {
        await this.sock.logout();
        this.isConnected = false;
        this.logger.info("Disconnected from WhatsApp");
      }
    } catch (error) {
      this.logger.error("Error disconnecting:", error);
      throw error;
    }
  }

  public async sendText(to: string, text: string): Promise<void> {
    if (!this.isConnected) {
      throw new WhatsAppError("Client is not connected");
    }

    try {
      await this.sock.sendMessage(to, { text });
      this.logger.info(`Text message sent to ${to}`);
    } catch (error) {
      this.logger.error("Failed to send text message:", error);
      throw error;
    }
  }

  public async getGroupMetadata(groupId: string): Promise<any> {
    if (!this.isConnected) {
      throw new WhatsAppError("Client is not connected");
    }

    try {
      const metadata = await this.sock.groupMetadata(groupId);
      this.groupCache.set(groupId, metadata);
      return metadata;
    } catch (error) {
      this.logger.error("Failed to get group metadata:", error);
      throw error;
    }
  }

  public async joinGroup(inviteCode: string): Promise<void> {
    if (!this.isConnected) {
      throw new WhatsAppError("Client is not connected");
    }

    try {
      await this.sock.groupAcceptInvite(inviteCode);
      this.logger.info(`Joined group with invite code: ${inviteCode}`);
    } catch (error) {
      this.logger.error("Failed to join group:", error);
      throw error;
    }
  }

  public async leaveGroup(groupId: string): Promise<void> {
    if (!this.isConnected) {
      throw new WhatsAppError("Client is not connected");
    }

    try {
      await this.sock.groupLeave(groupId);
      this.logger.info(`Left group: ${groupId}`);
    } catch (error) {
      this.logger.error("Failed to leave group:", error);
      throw error;
    }
  }
}
