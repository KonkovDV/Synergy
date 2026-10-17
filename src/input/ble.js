// Bluetooth EMG sensors over the Nordic UART Service (NUS) — the de-facto «serial over BLE» used by
// ESP32/nRF boards, e.g. MyoWare 2.0 with the SparkFun wireless shield (MyoWareBLEUART example).
// The board notifies text lines ("a b\n", "a,b\n" or JSON); each line goes to BridgeSource.feed(),
// so parsing stays in parseExternal() (DRY). Web Bluetooth: Chrome/Edge on Android, Windows, macOS,
// ChromeOS; not available in iOS Safari or the Android WebView (there use the native pushFrame()).
// Reference firmware: bridge/firmware/esp32_emg_ble/esp32_emg_ble.ino.

export const NUS = Object.freeze({
  service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  rx: '6e400002-b5a3-f393-e0a9-e50e24dcca9e', // write: phone → board
  tx: '6e400003-b5a3-f393-e0a9-e50e24dcca9e', // notify: board → phone
});

const MAX_LINE = 512;
export const RECONNECT_DELAYS_MS = [1000, 2000, 4000];

/** Reassembles notification chunks (≤ 20 bytes each on default MTU) into complete lines. */
export class LineAssembler {
  constructor() { this.buffer = ''; }
  push(chunk) {
    this.buffer += chunk;
    const parts = this.buffer.split(/\r?\n/);
    this.buffer = parts.pop() ?? '';
    if (this.buffer.length > MAX_LINE) this.buffer = ''; // garbage without newlines: drop, do not grow
    return parts.map(p => p.trim()).filter(Boolean);
  }
}

export function bleSupported() {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth?.requestDevice;
}

/**
 * Asks the user to pick a NUS device (must be called from a click), subscribes to its notifications
 * and reconnects by itself after a dropout (statuses: connecting, connected, disconnected, failed).
 * @returns {Promise<{ name: string, disconnect(): void }>}
 */
export async function connectBle({ onLine, onStatus = () => {} }) {
  const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [NUS.service] }], optionalServices: [NUS.service] });
  const decoder = new TextDecoder();
  const lines = new LineAssembler();
  const onValue = e => { for (const line of lines.push(decoder.decode(e.target.value, { stream: true }))) onLine(line); };
  let tx = null, closed = false, timer = 0;
  const subscribe = async () => {
    onStatus('connecting');
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(NUS.service);
    tx = await service.getCharacteristic(NUS.tx);
    tx.addEventListener('characteristicvaluechanged', onValue);
    await tx.startNotifications();
    onStatus('connected');
  };
  const retry = (attempt = 0) => {
    if (closed) return;
    if (attempt >= RECONNECT_DELAYS_MS.length) { onStatus('failed'); return; }
    timer = setTimeout(() => subscribe().catch(() => retry(attempt + 1)), RECONNECT_DELAYS_MS[attempt]);
  };
  const onGone = () => { tx?.removeEventListener('characteristicvaluechanged', onValue); onStatus('disconnected'); retry(); };
  device.addEventListener('gattserverdisconnected', onGone);
  await subscribe();
  return {
    name: device.name || 'BLE-датчик',
    disconnect() {
      closed = true; clearTimeout(timer);
      tx?.removeEventListener('characteristicvaluechanged', onValue);
      device.removeEventListener('gattserverdisconnected', onGone);
      if (device.gatt.connected) device.gatt.disconnect();
    },
  };
}
