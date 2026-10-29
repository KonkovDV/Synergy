// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  THE ONE LINE (task of 28.10.2026: «the emulator can be replaced with the driver of the real MCU in one line of code»).
//
//  Every packet of the СПППР the game reads — on-screen pads, keyboard, autopilot, tests — goes through the driver this
//  function returns. A driver gives JSON text lines of the task's contract to `onPacket(text, arrivalMs)`; nothing else
//  of the game knows where they come from. To play on the prosthesis, swap the emulator for a driver of spppr-drivers.js:
//
//    export const createSppprDriver = o => new EmulatorDriver(new SppprEmulator(o));            // emulator (default)
//    export const createSppprDriver = o => new WebSocketDriver({ url: 'ws://192.168.4.1:81' }); // MCU over Wi-Fi
//    export const createSppprDriver = o => new WebSerialDriver({ baudRate: 115200 });            // MCU over USB/UART
//    export const createSppprDriver = o => new BleNusDriver();                                   // MCU over BLE (NUS)
//    export const createSppprDriver = o => new HostDriver();                                     // the host app feeds it
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { EmulatorDriver, SppprEmulator } from './spppr-emulator.js';

export const createSppprDriver = o => new EmulatorDriver(new SppprEmulator(o));
