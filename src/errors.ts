import type { Boom } from '@hapi/boom';

export class WhatsAppError extends Error {
  constructor(
    message: string,
    public cause?: Error | Boom,
  ) {
    super(message);
    this.name = 'WhatsAppError';
    Object.setPrototypeOf(this, WhatsAppError.prototype);
  }
}
