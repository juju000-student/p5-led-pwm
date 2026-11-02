// noprotect
let serial;
let connectButton;
let ledOn = false;
let potValue = 0;
let statusText = 'Arduino를 연결해 주세요.';

const SLIDER_X = 540;
const SLIDER_TOP = 110;
const SLIDER_BOTTOM = 300;
const KNOB_D = 28;

let pwmValue = 0;
let dragging = false;

const SEND_INTERVAL = 50;
let pendingPwm = null;
let sending = false;
let lastSendTime = -SEND_INTERVAL;

function setup() {
  createCanvas(600, 400);
  textFont('sans-serif');
  serial = new LedSerial(9600, receiveLine, message => statusText = message);
  connectButton = createButton('Arduino 연결 / 해제');
  connectButton.style('margin-top', '8px');
  connectButton.style('padding', '10px 20px');
  connectButton.style('font-size', '15px');
  connectButton.mousePressed(() => serial.toggle());
}

function draw() {
  background(242, 246, 250);
  noStroke();
  textAlign(CENTER, BASELINE);

  fill(30, 41, 59);
  textSize(26);
  text('Arduino Uno R3 · Web Serial', 300, 40);
  fill(71, 85, 105);
  textSize(14);
  text(statusText, 300, 66);

  fill(ledOn ? '#22c55e' : '#64748b');
  circle(160, 175, 110);
  fill(255);
  textSize(22);
  text(ledOn ? 'ON' : 'OFF', 160, 183);
  fill(51, 65, 85);
  textSize(14);
  text('원을 클릭하면 LED 토글', 160, 260);

  fill(51, 65, 85);
  textSize(14);
  text('가변저항 A0', 340, 121);
  fill(226, 232, 240);
  rect(240, 155, 200, 40, 10);
  fill(59, 130, 246);
  rect(240, 155, map(potValue, 0, 1023, 0, 200), 40, 10);
  fill(30, 41, 59);
  textSize(24);
  text(potValue + ' / 1023', 340, 235);

  drawSlider();

  fill(71, 85, 105);
  textSize(13);
  text('9600 baud · ON / OFF / PWM:0~255 + 줄바꿈', 300, 345);
  text('수신: 0~1023 또는 POT:값 · LED:ON / LED:OFF', 300, 370);

  cursor(overLed() || overSlider() || dragging ? HAND : ARROW);

  flushPwm();
}

function drawSlider() {
  const knobY = map(pwmValue, 0, 255, SLIDER_BOTTOM, SLIDER_TOP);

  fill(51, 65, 85);
  textSize(14);
  text('LED2 밝기', SLIDER_X, 85);

  rectMode(CORNERS);
  fill(226, 232, 240);
  rect(SLIDER_X - 6, SLIDER_TOP, SLIDER_X + 6, SLIDER_BOTTOM, 6);
  fill(245, 158, 11);
  rect(SLIDER_X - 6, knobY, SLIDER_X + 6, SLIDER_BOTTOM, 6);
  rectMode(CORNER);

  stroke(245, 158, 11);
  strokeWeight(4);
  fill(255);
  circle(SLIDER_X, knobY, KNOB_D);
  noStroke();

  fill(30, 41, 59);
  textSize(16);
  text(pwmValue + ' / 255', SLIDER_X, 330);
}

function overLed() {
  return dist(mouseX, mouseY, 160, 175) <= 55;
}

function overSlider() {
  return abs(mouseX - SLIDER_X) <= KNOB_D &&
         mouseY >= SLIDER_TOP - KNOB_D / 2 &&
         mouseY <= SLIDER_BOTTOM + KNOB_D / 2;
}

function setPwmFromMouse() {
  const value = round(constrain(map(mouseY, SLIDER_BOTTOM, SLIDER_TOP, 0, 255), 0, 255));
  if (value !== pwmValue) {
    pwmValue = value;
    pendingPwm = value;
  }
}

async function mousePressed() {
  if (overSlider()) {
    dragging = true;
    setPwmFromMouse();
    return;
  }
  if (!overLed()) return;

  const next = !ledOn;
  if (await serial.send(next ? 'ON' : 'OFF')) ledOn = next;
}

function mouseDragged() {
  if (dragging) setPwmFromMouse();
}

function mouseReleased() {
  dragging = false;
}

async function flushPwm() {
  if (pendingPwm === null || sending) return;
  if (millis() - lastSendTime < SEND_INTERVAL) return;

  const value = pendingPwm;
  pendingPwm = null;
  sending = true;
  lastSendTime = millis();

  const ok = await serial.send('PWM:' + value);
  sending = false;
  if (ok) statusText = '전송: PWM:' + value + ' · 9600 baud';
}

function receiveLine(line) {
  const text = String(line);
  console.log('수신:', text);
  const message = text.replace(/\s+/g, '').toUpperCase();
  if (message.includes('LED:ON') || message === 'ON') {
    ledOn = true;
  } else if (message.includes('LED:OFF') || message === 'OFF') {
    ledOn = false;
  } else {
    const match = message.match(/POT\D*(\d+)/) || message.match(/^(\d+)$/);
    if (match) potValue = constrain(Number(match[1]), 0, 1023);
  }
}

class LedSerial {
  constructor(baudRate, onLine, onStatus) {
    this.baudRate = baudRate;
    this.onLine = onLine;
    this.onStatus = onStatus;
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.readDone = null;
    this.encoder = new TextEncoder();

    if ('serial' in navigator) {
      navigator.serial.addEventListener('disconnect', e => {
        if (e.target === this.port) this.disconnect('Arduino 연결이 끊어졌습니다.');
      });
    }
  }

  status(message) {
    if (this.onStatus) this.onStatus(message);
  }

  get connected() {
    return this.writer !== null;
  }

  async toggle() {
    if (this.port) await this.disconnect();
    else await this.connect();
  }

  async connect() {
    if (!('serial' in navigator)) {
      this.status('Web Serial 미지원 브라우저입니다. Chrome 또는 Edge를 사용하세요.');
      return false;
    }
    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: this.baudRate });
    } catch (err) {
      this.port = null;
      this.status('연결 취소 또는 실패: ' + err.message);
      return false;
    }
    this.writer = this.port.writable.getWriter();
    this.readDone = this.readLoop();
    this.status('연결됨 · ' + this.baudRate + ' baud');
    return true;
  }

  readLoop() {
    return new Promise(resolveDone => {
      const decoder = new TextDecoder();
      let buffer = '';

      const start = () => {
        if (!this.port || !this.port.readable) { resolveDone(); return; }
        this.reader = this.port.readable.getReader();
        readNext();
      };

      const stop = retry => {
        try { this.reader.releaseLock(); } catch (err) {}
        this.reader = null;
        if (retry && this.port) setTimeout(start, 20);
        else resolveDone();
      };

      const readNext = () => {
        this.reader.read().then(({ value, done }) => {
          if (done) { stop(false); return; }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop();
          lines.forEach(line => {
            if (line.trim() === '' || !this.onLine) return;
            try { this.onLine(line); } catch (err) { console.error(err); }
          });
          readNext();
        }).catch(err => {
          console.warn('수신 오류, 다시 읽기 시작:', err.message);
          buffer = '';
          stop(true);
        });
      };

      start();
    });
  }

  async disconnect(message = '연결 해제됨') {
    if (!this.port) return;
    const port = this.port;
    this.port = null;
    try { if (this.reader) await this.reader.cancel(); } catch (err) {}
    try { await this.readDone; } catch (err) {}
    try { if (this.writer) this.writer.releaseLock(); } catch (err) {}
    this.writer = null;
    try { await port.close(); } catch (err) {}
    this.status(message);
  }

  async send(text) {
    if (!this.connected) {
      this.status('먼저 Arduino를 연결해 주세요.');
      return false;
    }
    try {
      await this.writer.write(this.encoder.encode(text + '\n'));
      return true;
    } catch (err) {
      this.status('전송 실패: ' + err.message);
      return false;
    }
  }
}
