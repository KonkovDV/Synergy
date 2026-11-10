// Reference firmware (not compiled or tested by the team yet): two EMG envelope sensors → BLE.
// Board: ESP32 (Arduino core 2.x/3.x). Sensors: e.g. 2 × MyoWare 2.0, ENV output → GPIO 34 (A) and 35 (B).
// Protocol: Nordic UART Service, notifications with text lines "a b\n" (raw 12-bit ADC, 0..4095) at 50 Hz.
// The game normalizes them after Settings → «Калибровка датчиков» (rest + comfortable 70 % contraction).
// Safety: battery power only while electrodes touch the skin — never a mains-powered USB connection.
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>

#define NUS_SERVICE "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_RX      "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_TX      "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
const int PIN_A = 34, PIN_B = 35, PERIOD_MS = 20;

BLECharacteristic *tx;
bool connected = false;
struct Callbacks : BLEServerCallbacks {
  void onConnect(BLEServer *) override { connected = true; }
  void onDisconnect(BLEServer *s) override { connected = false; s->startAdvertising(); }
};

void setup() {
  analogReadResolution(12);
  BLEDevice::init("Synergy EMG");
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new Callbacks());
  BLEService *nus = server->createService(NUS_SERVICE);
  tx = nus->createCharacteristic(NUS_TX, BLECharacteristic::PROPERTY_NOTIFY);
  tx->addDescriptor(new BLE2902());
  nus->createCharacteristic(NUS_RX, BLECharacteristic::PROPERTY_WRITE); // reserved: commands from the game
  nus->start();
  BLEAdvertising *adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(NUS_SERVICE);
  adv->start();
}

void loop() {
  // 5.27: elapsed time by unsigned subtraction — it stays right when millis() wraps after ~49.7 days; the old
  // «millis() < next» stopped or flooded the stream at the wrap.
  static uint32_t last = 0;
  uint32_t now = millis();
  if (now - last < PERIOD_MS) return;
  last = now;
  if (!connected) return;
  char line[24];
  int n = snprintf(line, sizeof line, "%d %d\n", analogRead(PIN_A), analogRead(PIN_B));
  tx->setValue((uint8_t *)line, n);
  tx->notify();
}
