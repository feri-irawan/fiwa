import type { Browsers } from "baileys";

export interface FiWhatsAppOptions {
  logPath?: string;
  sessionDir?: string;
  maxRetries?: number;
  browser?: keyof typeof Browsers;
  device?: string;
}
