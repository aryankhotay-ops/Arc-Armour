// Minimal RFC 6455 WebSocket server transport over node:http — no third-party packages.
// Text frames only (the protocol is JSON), with masking, fragmentation rejection, ping/pong
// and close handling. Oversized payloads are dropped before JSON parsing per COMMAND_LIMITS.
import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export interface SocketHandlers {
  readonly onMessage: (text: string) => void;
  readonly onClose: () => void;
  /** A protocol violation (bad frame, unmasked client data, oversized payload). */
  readonly onViolation: (reason: string) => void;
}

export class ServerSocket {
  private buffer = Buffer.alloc(0);
  private closed = false;

  public constructor(
    private readonly stream: Duplex,
    private readonly maxPayloadBytes: number,
    private readonly handlers: SocketHandlers,
  ) {
    stream.on('data', (chunk: Buffer) => this.ingest(chunk));
    const close = (): void => this.dispose();
    stream.on('end', close);
    stream.on('close', close);
    stream.on('error', close);
  }

  public send(text: string): void {
    if (this.closed) return;
    const payload = Buffer.from(text, 'utf8');
    let header: Buffer;
    if (payload.length < 126) {
      header = Buffer.from([0x81, payload.length]);
    } else if (payload.length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    try {
      this.stream.write(Buffer.concat([header, payload]));
    } catch {
      this.dispose();
    }
  }

  public close(): void {
    if (this.closed) return;
    try {
      this.stream.write(Buffer.from([0x88, 0x00])); // close frame
    } catch {
      /* already gone */
    }
    this.dispose();
  }

  private dispose(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.stream.destroy();
    } catch {
      /* already destroyed */
    }
    this.handlers.onClose();
  }

  private violation(reason: string): void {
    this.handlers.onViolation(reason);
    this.close();
  }

  private ingest(chunk: Buffer): void {
    if (this.closed) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    // Parse as many complete frames as are buffered.
    for (;;) {
      if (this.buffer.length < 2) return;
      const first = this.buffer[0]!;
      const second = this.buffer[1]!;
      const fin = (first & 0x80) !== 0;
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let payloadLength = second & 0x7f;
      let offset = 2;
      if (payloadLength === 126) {
        if (this.buffer.length < 4) return;
        payloadLength = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        if (this.buffer.length < 10) return;
        const big = this.buffer.readBigUInt64BE(2);
        if (big > BigInt(this.maxPayloadBytes)) return this.violation('oversized');
        payloadLength = Number(big);
        offset = 10;
      }
      if (payloadLength > this.maxPayloadBytes) return this.violation('oversized');
      if (!masked) return this.violation('unmasked-client-frame');
      if (this.buffer.length < offset + 4 + payloadLength) return;
      const mask = this.buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(
        this.buffer.subarray(offset + 4, offset + 4 + payloadLength),
      );
      for (let i = 0; i < payload.length; i++) payload[i] = payload[i]! ^ mask[i % 4]!;
      this.buffer = this.buffer.subarray(offset + 4 + payloadLength);

      if (opcode === 0x8) return this.dispose(); // close
      if (opcode === 0x9) {
        // ping -> pong with same payload
        const header = Buffer.from([0x8a, payload.length]);
        try {
          this.stream.write(Buffer.concat([header, payload]));
        } catch {
          return this.dispose();
        }
        continue;
      }
      if (opcode === 0xa) continue; // pong
      if (!fin || opcode !== 0x1) return this.violation('unsupported-frame');
      this.handlers.onMessage(payload.toString('utf8'));
    }
  }
}

/** Completes the HTTP upgrade handshake and returns the framed socket. */
export const acceptUpgrade = (
  request: IncomingMessage,
  stream: Duplex,
  maxPayloadBytes: number,
  handlers: SocketHandlers,
): ServerSocket | undefined => {
  const key = request.headers['sec-websocket-key'];
  if (
    typeof key !== 'string' ||
    request.headers.upgrade?.toLowerCase() !== 'websocket'
  ) {
    stream.destroy();
    return undefined;
  }
  const accept = createHash('sha1')
    .update(key + WEBSOCKET_GUID)
    .digest('base64');
  stream.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  return new ServerSocket(stream, maxPayloadBytes, handlers);
};
