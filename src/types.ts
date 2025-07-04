import type { BaileysEventMap, Browsers, WAMessage } from 'baileys';

export interface FiWhatsAppOptions {
  logPath?: string;
  sessionDir?: string;
  maxRetries?: number;
  browser?: keyof typeof Browsers;
  device?: string;
  phoneNumber?: string;
  mongodb?: {
    url: string;
    databaseName?: string;
    collectionName?: string;
  };
}

export interface FiWhatsAppEventMap {
  qr: [string];
  pairingCode: [string];
  ready: [];
  reconnect: [];
  logout: [];
  error: [Error];
  message: [WAMessage];
  messageFromClient: [WAMessage];
  'messages.delete': [BaileysEventMap['messages.delete']];
  'messages.update': [BaileysEventMap['messages.update']];
}
