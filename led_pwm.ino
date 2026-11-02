// p5 슬라이더로 LED2 밝기 조절
//  - D13 LED      : 'ON' / 'OFF' 명령, 버튼(D2)으로 토글
//  - D9  LED2     : 'PWM:0~255' 명령으로 밝기 조절 (analogWrite)
//  - A0  가변저항 : 5 이상 변하면 'POT: 값' 보고
//  - I2C LCD      : 1줄 "LED: ON  PWM:106", 2줄 "POT: 512"
// 필요한 라이브러리: TaskScheduler, LiquidCrystal_I2C

#include <TaskScheduler.h>
#include <LiquidCrystal_I2C.h>
#include <ctype.h>
#include <string.h>

const uint8_t BUTTON_PIN = 2;
const uint8_t LED_PIN    = 13;
const uint8_t LED2_PIN   = 9;    // PWM 가능 핀 (~3, 5, 6, 9, 10, 11 중 하나)
const uint8_t POT_PIN    = A0;

LiquidCrystal_I2C lcd(0x27, 16, 2);

bool ledState = false;
int  pwmValue = 0;                       // LED2 밝기 (0~255)
int  potValue = -1;
const int POT_THRESHOLD = 5;

volatile bool buttonEvent = false;
volatile unsigned long lastInterruptTime = 0;
const unsigned long DEBOUNCE_MS = 50;

const uint8_t CMD_SIZE = 12;             // "PWM:255" + 여유

// ---------- 작업 함수 선언 ----------
void taskButtonCallback();
void taskPotCallback();
void taskSerialCallback();
void taskLCDCallback();

Scheduler runner;
Task tButton(10,  TASK_FOREVER, &taskButtonCallback, &runner, true);
Task tPot   (100, TASK_FOREVER, &taskPotCallback,    &runner, true);
// 슬라이더 반응이 느리지 않도록 500 ms → 20 ms로 줄임
Task tSerial(20,  TASK_FOREVER, &taskSerialCallback, &runner, true);
Task tLCD   (100, TASK_FOREVER, &taskLCDCallback,    &runner, true);

// ---------- LED 제어 ----------
void setLED(bool state) {
  if (ledState == state) return;
  ledState = state;
  digitalWrite(LED_PIN, ledState ? HIGH : LOW);
  Serial.print("LED: ");
  Serial.println(ledState ? "ON" : "OFF");
}

void setPWM(int value) {
  value = constrain(value, 0, 255);
  if (pwmValue == value) return;
  pwmValue = value;
  analogWrite(LED2_PIN, pwmValue);
  Serial.print("PWM: ");
  Serial.println(pwmValue);
}

// ---------- 인터럽트 ----------
void buttonISR() {
  unsigned long now = millis();
  if (now - lastInterruptTime >= DEBOUNCE_MS) {
    buttonEvent = true;
    lastInterruptTime = now;
  }
}

// ---------- 작업 ----------
void taskButtonCallback() {
  bool event = false;
  noInterrupts();
  if (buttonEvent) {
    event = true;
    buttonEvent = false;
  }
  interrupts();
  if (event) setLED(!ledState);
}

void taskPotCallback() {
  int value = analogRead(POT_PIN);
  if (potValue == -1 || abs(value - potValue) >= POT_THRESHOLD) {
    potValue = value;
    Serial.print("POT: ");
    Serial.println(potValue);
  }
}

// "PWM:" 뒤의 숫자를 읽음. 숫자가 아니면 -1
int parseNumber(const char *p) {
  if (*p == '\0') return -1;
  long value = 0;
  while (*p) {
    if (!isdigit(*p)) return -1;
    value = value * 10 + (*p - '0');
    if (value > 255) value = 255;        // 너무 크면 255로 제한
    p++;
  }
  return (int)value;
}

void handleCommand(const char *command) {
  if (strcmp(command, "ON") == 0) {
    setLED(true);
  } else if (strcmp(command, "OFF") == 0) {
    setLED(false);
  } else if (strncmp(command, "PWM:", 4) == 0) {
    int value = parseNumber(command + 4);
    if (value >= 0) setPWM(value);
    else Serial.println("Invalid PWM value");
  } else {
    Serial.println("Invalid command");
  }
}

void taskSerialCallback() {
  static char command[CMD_SIZE];
  static uint8_t length = 0;
  static bool tooLong = false;

  while (Serial.available() > 0) {
    char c = Serial.read();

    if (c == '\n' || c == '\r') {        // 줄바꿈 → 명령 완성
      if (tooLong) {
        Serial.println("Command too long");
      } else if (length > 0) {
        command[length] = '\0';
        handleCommand(command);
      }
      length = 0;
      tooLong = false;
    } else if (c == ' ') {
      // 공백은 무시 ("PWM: 100"도 허용)
    } else if (length < CMD_SIZE - 1) {
      command[length++] = toupper(c);
    } else {
      tooLong = true;
    }
  }
}

void taskLCDCallback() {
  static bool firstUpdate = true;
  static bool previousLED = false;
  static int  previousPWM = -1;
  static int  previousPOT = -1;

  // 1번째 줄: LED 상태 + PWM 값  예) "LED: OFF PWM:255"
  if (firstUpdate || ledState != previousLED || pwmValue != previousPWM) {
    lcd.setCursor(0, 0);
    lcd.print("LED: ");
    lcd.print(ledState ? "ON " : "OFF");
    lcd.print(" PWM:");
    lcd.print(pwmValue);
    lcd.print("  ");
    previousLED = ledState;
    previousPWM = pwmValue;
  }

  // 2번째 줄: 가변저항 값
  if (potValue >= 0 && (firstUpdate || potValue != previousPOT)) {
    lcd.setCursor(0, 1);
    lcd.print("POT: ");
    lcd.print(potValue);
    lcd.print("          ");
    previousPOT = potValue;
  }

  firstUpdate = false;
}

// ---------- setup / loop ----------
void setup() {
  Serial.begin(9600);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  pinMode(LED2_PIN, OUTPUT);
  pinMode(POT_PIN, INPUT);
  digitalWrite(LED_PIN, LOW);
  analogWrite(LED2_PIN, 0);

  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 1);
  lcd.print("POT: ----");

  lastInterruptTime = millis() - DEBOUNCE_MS;
  attachInterrupt(digitalPinToInterrupt(BUTTON_PIN), buttonISR, FALLING);

  Serial.println("System Ready");
  Serial.println("Commands: ON / OFF / PWM:0~255");
}

void loop() {
  runner.execute();
}
