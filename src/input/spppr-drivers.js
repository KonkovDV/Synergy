// Drivers of the СПППР stream for a real MCU (task of 28.10.2026). Each one has the shape of EmulatorDriver: `start(onPacket)`
// hands every received text line of the contract to onPacket(text, arrivalMs), `stop()` ends it. Parsing, the MCU clock,
// smoothing and the joystick stay in core/spppr.js — a driver only moves bytes. Which driver the game uses is the one
// line of spppr-driver.js. Not exercised against hardware here (no prosthesis during the jam; LIMITS.md).
import { LineAssembler, connectBle } from './ble.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** The MCU (or a gateway) serves the packets over a WebSocket, one JSON object per message. Reconnects with backoff. */
export class WebSocketDriver {
  constructor({ url, WebSocketImpl = globalThis.WebSocket, clock = now } = {}) { Object.assign(this, { url, WebSocketImpl, clock }); this.kind = 'websocket'; this.retryMs = 500; }
  start(onPacket) {
    this.onPacket = onPacket; this.stopped = false;
    const open = () => {
      if (this.stopped || !this.WebSocketImpl) return;
      const ws = new this.WebSocketImpl(this.url);
      this.ws = ws;
      ws.onopen = () => { this.retryMs = 500; };
      ws.onmessage = e => { if (typeof e.data === 'string') for (const line of e.data.split('\n')) if (line.trim()) this.onPacket?.(line, this.clock()); };
      ws.onclose = () => { if (!this.stopped) { this.timer = setTimeout(open, this.retryMs); this.retryMs = Math.min(5000, this.retryMs * 2); } };
      ws.onerror = () => { try { ws.close(); } catch { /* closed */ } };
    };
    open();
  }
  stop() { this.stopped = true; clearTimeout(this.timer); if (this.ws) { this.ws.onclose = null; try { this.ws.close(); } catch { /* closed */ } } }
}

/** The MCU on USB or UART (Web Serial: Chrome and Edge on a computer): NDJSON lines. Must start from a click. */
export class WebSerialDriver {
  constructor({ baudRate = 115200, serial = globalThis.navigator?.serial, clock = now } = {}) { Object.assign(this, { baudRate, serial, clock }); this.kind = 'serial'; }
  async start(onPacket) {
    if (!this.serial) throw new Error('Web Serial недоступен: нужен Chrome или Edge на компьютере');
    this.port = await this.serial.requestPort();
    await this.port.open({ baudRate: this.baudRate });
    const decoder = new TextDecoder(), lines = new LineAssembler();
    this.reader = this.port.readable.getReader();
    this.reading = (async () => {
      for (;;) {
        const { value, done } = await this.reader.read();
        if (done) break;
        for (const line of lines.push(decoder.decode(value, { stream: true }))) onPacket(line, this.clock());
      }
    })().catch(() => { /* the port was closed */ });
  }
  async stop() { try { await this.reader?.cancel(); await this.port?.close(); } catch { /* already closed */ } }
}

/** The MCU over Bluetooth LE, Nordic UART Service (the same link as the two-channel sensors, input/ble.js). */
export class BleNusDriver {
  constructor({ clock = now } = {}) { this.clock = clock; this.kind = 'ble'; }
  async start(onPacket) { this.link = await connectBle({ onLine: line => onPacket(line, this.clock()) }); }
  stop() { this.link?.disconnect(); }
}

/**
 * The host application feeds the packets (a native app that already talks to the prosthesis): it calls
 * `window.SynergySpppr.push(jsonText)`. The bridge (window.Synergy.feed, postMessage) recognizes packets of the task too.
 */
export class HostDriver {
  constructor({ clock = now, target = globalThis } = {}) { this.clock = clock; this.target = target; this.kind = 'host'; }
  start(onPacket) { this.target.SynergySpppr = { push: text => { onPacket(text, this.clock()); return true; } }; }
  stop() { delete this.target.SynergySpppr; }
}
