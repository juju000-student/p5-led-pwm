# p5 슬라이더로 Arduino LED 밝기 조절

p5.js 화면의 **세로 슬라이더**를 움직이면 Web Serial로 Arduino Uno R3에 `PWM:값`을 보내서, D9에 연결한 LED2의 밝기를 0~255 단계로 조절하는 프로젝트입니다.
수업 예제(LED 토글, 가변저항 표시)에 **LED2 밝기 슬라이더**를 추가했습니다.

![실행 화면](images/screenshot.png)



https://github.com/user-attachments/assets/54988f19-367b-409e-805e-c131dfe460ce



## 구성

| 파일 | 내용 |
| --- | --- |
| `index.html` | p5.js 페이지 |
| `sketch.js` | 화면 그리기, 슬라이더, 시리얼 송수신 |
| `arduino/led_pwm/led_pwm.ino` | Arduino 스케치 (TaskScheduler, I2C LCD) |

| 기능 | 메시지 | Arduino 동작 |
| --- | --- | --- |
| LED 원 클릭 | `ON` / `OFF` 전송 | D13 LED 켜기 / 끄기 |
| **세로 슬라이더** | **`PWM:0~255` 전송** | **D9 LED2 밝기 조절** |
| 가변저항 막대 | `POT: 512` 수신 | A0 값 표시 |

## 회로

| 부품 | 연결 |
| --- | --- |
| LED | D13 → 220 Ω → LED → GND |
| **LED2** | **D9 → 220 Ω → LED 긴 다리(+), 짧은 다리(−) → GND** |
| 푸시 버튼 | D2 → 버튼 → GND (내부 풀업) |
| 가변저항 | 양 끝 5 V · GND, 가운데 → A0 |
| I2C LCD 16×2 | SDA → A4, SCL → A5, VCC → 5 V, GND → GND |



---

## 슬라이더 구현 설명

### 1. 전체 흐름

```
마우스로 손잡이를 끌기
  → mouseY를 0~255 값으로 바꿈        (setPwmFromMouse)
  → 50 ms마다 최신 값 하나만 전송     (flushPwm)  →  "PWM:106\n"
  → Arduino가 숫자를 읽어서           (handleCommand)
  → analogWrite(9, 106)               (setPWM)    →  LED2 밝기 변경
```

슬라이더는 p5의 `createSlider()`를 쓰지 않고 **캔버스에 직접 그렸습니다.**
왜냐하면 `createSlider()`는 가로 HTML 요소라서, 세로로 세우거나 다른 그림과 같은 색·위치로 맞추기 어렵기 때문입니다.

### 2. 위치와 값

```javascript
const SLIDER_X = 540;
const SLIDER_TOP = 110;
const SLIDER_BOTTOM = 300;
const KNOB_D = 28;

let pwmValue = 0;
let dragging = false;
```

| 변수 | 뜻 |
| --- | --- |
| `SLIDER_X` | 슬라이더 중심의 x 좌표 |
| `SLIDER_TOP` | 값 255가 되는 위쪽 끝 y |
| `SLIDER_BOTTOM` | 값 0이 되는 아래쪽 끝 y |
| `KNOB_D` | 손잡이 원의 지름 |
| `pwmValue` | 현재 슬라이더 값 (0~255) |
| `dragging` | 지금 손잡이를 끌고 있는지 |

값 범위를 0~255로 한 이유는 Arduino의 `analogWrite()`가 0(꺼짐)~255(최대 밝기)를 받기 때문입니다.

### 3. 슬라이더 그리기 — `drawSlider()`

```javascript
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
```

- **`map(pwmValue, 0, 255, SLIDER_BOTTOM, SLIDER_TOP)`**: 값 0~255를 y 좌표 300~110으로 바꿉니다. 출력 범위를 `BOTTOM → TOP` 순서로 준 이유는 화면 y축이 아래로 갈수록 커지기 때문입니다. 이렇게 해야 값이 커질수록 손잡이가 **위로** 올라갑니다.
  - 예: `pwmValue = 106` → `300 - 106/255 × 190 ≈ 221`
- **회색 막대 → 주황 막대 순서로 그리기**: 회색은 전체 길이, 주황은 손잡이부터 아래 끝까지라서, 주황이 차오른 높이가 곧 밝기를 나타냅니다.
- **`rectMode(CORNERS)`**: 사각형을 "왼쪽 위 점, 오른쪽 아래 점"으로 지정합니다. 손잡이 y부터 바닥까지 채우는 막대는 두 점으로 쓰는 쪽이 계산이 없어서 간단하기 때문입니다. 그린 뒤에는 `rectMode(CORNER)`로 되돌립니다. 다른 그림의 `rect()`가 영향을 받지 않게 하기 위해서입니다.
- `draw()`가 1초에 약 60번 이 함수를 부르므로, `pwmValue`가 바뀌면 다음 프레임에 바로 화면에 반영됩니다.

### 4. 마우스로 조작하기

```javascript
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
  ...
}

function mouseDragged() {
  if (dragging) setPwmFromMouse();
}

function mouseReleased() {
  dragging = false;
}
```

- **`overSlider()`**: 마우스가 슬라이더 영역 안에 있는지 확인합니다. 가로로는 중심에서 ±28 px, 세로로는 위아래 끝에서 손잡이 반지름만큼 더 넓게 잡았습니다. 손잡이가 끝에 있을 때도 원 전체를 눌러서 잡을 수 있게 하기 위해서입니다.
- **`setPwmFromMouse()`**: 그리기와 반대 방향으로 `map()`을 써서 마우스 y → 값 0~255로 바꿉니다.
  - `constrain(…, 0, 255)`: 마우스가 슬라이더 위아래 밖으로 나가도 값이 0보다 작거나 255보다 커지지 않게 막습니다.
  - `round()`: `analogWrite()`는 정수만 받기 때문에 소수를 반올림합니다.
  - `if (value !== pwmValue)`: 값이 실제로 바뀌었을 때만 `pendingPwm`에 넣습니다. 같은 값을 계속 보내 시리얼을 낭비하지 않기 위해서입니다.
- **`dragging` 변수**: 누를 때 `true`, 뗄 때 `false`가 됩니다. 이 변수가 있어야 손잡이를 잡은 상태에서는 마우스가 슬라이더 밖으로 벗어나도 계속 조절됩니다. 반대로 다른 곳을 누르고 끌 때는 슬라이더가 움직이지 않습니다.
- `mousePressed()`에서 슬라이더를 먼저 확인하고 `return` 합니다. 슬라이더를 누른 클릭이 LED 원 토글로 처리되지 않게 하기 위해서입니다.

### 5. 전송 속도 조절 — `flushPwm()`

```javascript
const SEND_INTERVAL = 50;
let pendingPwm = null;
let sending = false;
let lastSendTime = -SEND_INTERVAL;

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
```

마우스를 끌면 값이 1초에 수십 번 바뀌는데, 그때마다 바로 보내지 않고 **50 ms에 한 번, 가장 최근 값 하나만** 보냅니다.
왜냐하면 9600 baud는 1초에 약 960글자밖에 보낼 수 없기 때문입니다. `PWM:106\n`은 8글자라서, 60 fps로 매 프레임 보내면 1초에 480글자가 됩니다. 그러면 Arduino가 읽는 속도보다 빨리 쌓여서 명령이 밀리거나 수신 버퍼(64바이트)가 넘칩니다.

| 변수 | 역할 |
| --- | --- |
| `pendingPwm` | 아직 보내지 않은 최신 값. 끌 때마다 덮어쓰므로 중간 값은 버려지고 마지막 값만 남음 |
| `sending` | 이전 전송이 끝나기 전에 또 보내지 않도록 막음 |
| `lastSendTime` | 마지막으로 보낸 시각. `-SEND_INTERVAL`로 시작해서 첫 값은 기다리지 않고 바로 보냄 |

`draw()` 끝에서 매 프레임 `flushPwm()`을 부르기 때문에 손을 뗀 뒤에도 마지막 값이 반드시 전송됩니다. 전송에 성공하면 화면 위 상태 줄에 `전송: PWM:106 · 9600 baud`가 표시됩니다.

### 6. Arduino에서 밝기 바꾸기

```cpp
const uint8_t LED2_PIN = 9;

Task tSerial(20, TASK_FOREVER, &taskSerialCallback, &runner, true);

void setPWM(int value) {
  value = constrain(value, 0, 255);
  if (pwmValue == value) return;
  pwmValue = value;
  analogWrite(LED2_PIN, pwmValue);
  Serial.print("PWM: ");
  Serial.println(pwmValue);
}

  } else if (strncmp(command, "PWM:", 4) == 0) {
    int value = parseNumber(command + 4);
    if (value >= 0) setPWM(value);
    else Serial.println("Invalid PWM value");
  }
```

- **D9를 쓴 이유**: 우노에서 `analogWrite()`가 되는 핀은 `~` 표시가 있는 3, 5, 6, 9, 10, 11번뿐이기 때문입니다. 기존 LED가 있는 D13은 PWM이 안 돼서 켜짐/꺼짐만 할 수 있습니다.
- **`analogWrite(9, 106)`**: 핀을 아주 빠르게 켰다 껐다 하면서 켜져 있는 시간 비율을 106/255(약 42 %)로 맞춥니다. 눈에는 깜빡임이 보이지 않고 그 비율만큼 어둡게 보입니다.
- **`strncmp(command, "PWM:", 4)`**: 앞 4글자가 `PWM:`인지 확인한 뒤, `command + 4`(콜론 다음 위치)부터 숫자를 읽습니다. `parseNumber()`는 숫자가 아닌 글자가 섞이면 -1을 돌려줍니다. 그래서 `PWM:abc` 같은 잘못된 명령은 무시됩니다.
- **시리얼 작업 주기 500 ms → 20 ms**: 수업 예제처럼 500 ms마다 읽으면 슬라이더를 움직여도 LED가 최대 0.5초 늦게 반응합니다. 또 그사이 쌓인 명령이 64바이트 수신 버퍼를 넘칠 수 있습니다. 20 ms마다 읽으면 50 ms 간격으로 오는 명령을 밀리지 않고 처리할 수 있습니다.
- 바뀐 값은 LCD 첫 줄에도 `LED: OFF PWM:106`처럼 표시됩니다.

### 7. 확인 방법

1. 시리얼 모니터(9600 baud, Newline)에서 `PWM:255` → LED2 최대 밝기, `PWM:30` → 어둡게, `PWM:0` → 꺼짐
2. p5에서 슬라이더를 아래 → 위로 천천히 올리면 LED2가 점점 밝아짐

> 참고: `sketch.js` 첫 줄의 `// noprotect`는 p5 웹 에디터의 무한 루프 감시를 끄는 표시입니다. 시리얼 수신은 메시지를 계속 기다려야 해서, 에디터가 이를 무한 루프로 오해해 멈추는 것을 막기 위해 넣었습니다.
