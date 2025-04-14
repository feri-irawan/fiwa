# fiwa

A simple WhatsApp bot built on top of [Baileys](https://github.com/WhiskeySockets/Baileys).

## Features

- Event-driven architecture for handling WhatsApp events like `ready`, `message`, `qr`, and more.
- Send and receive messages with ease.
- Group management: join, leave, and fetch group metadata.
- Automatic reconnection with retry logic.
- Customizable options for session management, logging, and device configuration.

## Installation

You can install fiwa using your preferred package manager, but I recommend using [Bun](https://bun.sh):

```bash
bun i fiwa
```

## Usage

Here is a basic example of how to use the library:

```ts
import { FiWhatsAppClient } from "fiwa";

const client = new FiWhatsAppClient({
  phoneNumber: "1234567890", // Optional: for pairing code
  maxRetries: 5, // Optional: retry attempts for reconnection
});

client.on("qr", (qr) => {
  console.log("Scan this QR code:", qr);
});

client.on("ready", () => {
  console.log("Client is ready");
});

client.on("message", (message) => {
  const jid = message.key.remoteJid;
  client.sendText(jid!, "Hello world!");
});

client.start();
```

## API Reference

### `FiWhatsAppClient`

#### Constructor

```ts
new FiWhatsAppClient(options?: FiWhatsAppOptions);
```

- `options` (optional):
  - `logPath` (string): Path to the log file.
  - `sessionDir` (string): Directory for session data.
  - `maxRetries` (number): Maximum retry attempts for reconnection.
  - `browser` (string): Browser type (e.g., `macOS`, `Windows`).
  - `device` (string): Device name.
  - `phoneNumber` (string): Phone number for pairing.

#### Methods

- `start(): Promise<void>`: Starts the WhatsApp client.
- `disconnect(): Promise<void>`: Disconnects the client.
- `sendText(to: string, text: string): Promise<void>`: Sends a text message.
- `getGroupMetadata(groupId: string): Promise<any>`: Fetches metadata for a group.
- `joinGroup(inviteCode: string): Promise<void>`: Joins a group using an invite code.
- `leaveGroup(groupId: string): Promise<void>`: Leaves a group.

#### Events

- `ready`: Emitted when the client is ready.
- `message`: Emitted when a new message is received.
- `qr`: Emitted when a QR code is generated.
- `pairingCode`: Emitted when a pairing code is generated.
- `reconnect`: Emitted when the client reconnects.
- `logout`: Emitted when the client logs out.
- `error`: Emitted when an error occurs.

## Contribution

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to contribute to this project.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

This project was created using `bun init` in bun v1.2.9. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
