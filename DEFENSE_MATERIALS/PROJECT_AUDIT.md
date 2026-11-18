# PROJECT_AUDIT — аудит проєкту WorkStudio (зона MOB)

Дата аудиту: 18.11.2026. Гілка: `main` (локально), коміт `e5d2536` + незакомічені виправлення MOB.

## 1. Що таке WorkStudio

Система бронювання робочих місць у коворкінгу (СРС v1.3, BA — Davyd Borovyk).
Ролі: **Client** (мобільний застосунок Android) і **Administrator** (веб-панель React).

Команда за СРС:

| Учасник | Роль |
|---|---|
| Anastasiia Chubenko | SCRUM-master |
| Andrii Zub | Frontend (React) |
| **Nikita Pshenychnyi** | **Mobile developer (MOB)** |
| Daniil Volosatov | Back-end |
| Oleksandr Yatsenko | QA (автор Task Case у Testiny) |
| Daria Posokhova | UI/UX |
| Davyd Borovyk | Business Analyst |

## 2. Структура репозиторію

| Папка | Модуль | Технології | Відповідальний |
|---|---|---|---|
| `backend/` | BE | Node.js 24, TypeScript, Express 5, Prisma 7 + PostgreSQL, Zod, bcrypt, JWT-сесії, LiqPay test | Back-end |
| `frontend/` | WEB | React + Vite + TypeScript, react-router | Frontend |
| `mobile/` | **MOB** | **Kotlin, Jetpack Compose (Material 3), Android SDK 26–37, без сторонніх мережевих бібліотек** | **Я** |

Сервер розгорнутий: `https://workstudio-api.onrender.com/api` (перевірено: `GET /health` → `status: ok, database: reachable`).

## 3. Архітектура MOB (карта для пояснення)

```
┌──────────────────────── Android-застосунок (Kotlin + Compose) ────────────────────────┐
│ MainActivity.kt  ─ WorkStudioApp(): Loading → Login / Register / Guest / Client       │
│     │                                                                                 │
│     ├─ AuthScreens.kt     LoginScreen, RegisterScreen (+ AuthValidation)              │
│     └─ WorkspaceScreen.kt ClientHome: нижня навігація 4 вкладки + діалоги             │
│            ├─ Spaces   → SpacesScreens.kt  (список, дата/час, деталі, вільні слоти)   │
│            ├─ Booking  → AccountScreens.kt (Календар Day/Week/Month + History)        │
│            ├─ Tariffs  → AccountScreens.kt (тарифи, вибір тарифу)                     │
│            └─ Profile  → AccountScreens.kt (профіль, верифікація email, вихід)        │
│               діалоги: Confirm booking, Pay → LiqPayCheckout.kt (WebView)             │
│                                                                                       │
│ Шар даних:  WorkApi.kt (типізовані виклики, Dispatchers.IO)                           │
│             StudioApi.kt (HttpURLConnection, JSON-конверт, ApiException, тексти помилок)│
│             Models.kt (data-класи + толерантний парсинг JSON)                          │
│ Допоміжне:  BookingValidation.kt (перевірка інтервалу), Formatters.kt (дати, статуси, │
│             періоди календаря), SecureSession.kt (токен, AES-GCM Android Keystore),   │
│             Theme.kt (кольори Figma, кнопки, бейджі)                                  │
└───────────────────────────────────────┬───────────────────────────────────────────────┘
                                        │ HTTPS, JSON, Bearer-токен
                              backend REST API (Render)
                                        │
                                  PostgreSQL / LiqPay (sandbox)
```

Принцип: **сервер — джерело істини** (доступність, ціни, статус бронювання й оплати). Застосунок лише
показує дані, робить клієнтську попередню валідацію і коректно обробляє помилки сервера.

### Ендпоінти, які використовує MOB

| Метод | Шлях | Де в коді |
|---|---|---|
| POST | `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/resend-verification` | `WorkApi` → Auth/Profile |
| GET | `/auth/me` | відновлення сесії, профіль |
| GET | `/workspaces/availability?date&startTime&endTime` | вкладка Spaces (опитування ~1 с) |
| GET | `/workspaces/:id/available-slots?date` | екран деталей робочого місця |
| GET | `/tariffs` | вкладка Tariffs |
| POST | `/bookings` (`confirm: true`) | діалог Confirm booking |
| GET | `/bookings/calendar?fromDate&toDate` | Календар |
| GET | `/bookings/history?page&pageSize` | Історія |
| POST | `/bookings/:id/payments/liqpay` (+ `Idempotency-Key`) | оплата LiqPay test |
| POST | `/bookings/:id/mock-payments` | лише dev-сервер з mock-оплатою |

## 4. Розподіл відповідальності (скриншот Sprint Backlog)

Завдання з міткою **MOB**:
- відображення доступних робочих місць; деталі (назва, тип, локація, опис); вибір дати для перевірки доступності;
- вибір місця, дати, часу для бронювання;
- відображення тарифів і цін; вибір тарифу; деталі бронювання та сума перед оплатою;
- форма реєстрації з валідацією; логін і робота із сесією;
- інтерфейс календаря бронювань; деталі бронювання в календарі;
- інтеграція LiqPay у мобільному застосунку;
- вибір місця і дати для перегляду вільних слотів; відображення вільних слотів.

Не MOB: усі **BE**-задачі (API, перевірка конфліктів, хешування паролів, ролі, LiqPay callback),
**WEB**-задачі (адмін-панель, форми робочих місць/тарифів), **Design**, **QA**, **Doc**.

## 5. Стан функцій MOB

| Функція | Стан |
|---|---|
| Список робочих місць + статус Free/Occupied/Unavailable + «available until» | Реалізовано, перевірено |
| Деталі місця (тип, зона, опис) + вільні слоти дня, тап по слоту заповнює From/To | Реалізовано, перевірено |
| Вибір дати (минулі дати заблоковані) і часу (в межах годин роботи) | Реалізовано, перевірено |
| «Немає вільних місць» + найближчі дати | Реалізовано, перевірено |
| Гостьовий режим (перегляд без входу, «Sign in to book») | Реалізовано, перевірено |
| Реєстрація з валідацією, логін, вихід, відновлення сесії, 401 → логін | Реалізовано, перевірено |
| Тарифи з сервера, вибір тарифу, підтвердження з сумою | Реалізовано, перевірено |
| Створення бронювання, обробка 409 конфлікту | Реалізовано; 409 перевірено через API, обробка — за кодом |
| Календар **Day/Week/Month**, порожній стан, деталі з локацією та ID | **Доопрацьовано мною в ході аудиту**, перевірено |
| Історія з пагінацією, статусами оплати, ознакою recurring | Реалізовано |
| Оплата LiqPay (test) у WebView, ключ ідемпотентності | Сторінка LiqPay відкривається з правильною сумою; успішний callback не перевірявся |
| Профіль, статус верифікації email, повторна відправка листа | Реалізовано, перевірено |
| Повторюване бронювання (СРС 3.2.4, пріоритет Should) | **Не реалізовано в MOB** (є у веб-клієнті `RecurringPage`, бекенд готовий) |
| Вхід через Google (СРС: optional) | Не реалізовано, кнопка чесно повідомляє «not supported yet» |
| Українська мова інтерфейсу (СРС, Language Support) | Інтерфейс англійською, як у макетах Figma (свідоме рішення команди, зазначено в README) |

## 6. Стан інших модулів (для контексту, не моя зона)

- Бекенд працює на Render, БД доступна; mock-оплата на продакшені вимкнена, LiqPay test налаштовано.
- У `origin/main` є 2 нові коміти від Daniil Volosatov (`41aa20b`, `d8d0b8b`, лише `frontend/`), які
  не підтягнуті в локальний `main`. MOB вони не зачіпають. Я їх не мерджив.
- Історія Git: у коміті `1cd3867` колись було видалено `src/` веб-фронтенду, але згодом його повернуто в
  `frontend/src` — усі веб-сторінки на місці (не MOB).

## 7. Як запустити MOB

```
cd mobile
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
gradlew.bat :app:testDebugUnitTest :app:assembleDebug
adb install -r app\build\outputs\apk\debug\app-debug.apk
```
Або Android Studio → відкрити папку `mobile` → Run `app` на емуляторі `Medium_Phone_API_37.0`.
Потрібен інтернет (сервер Render може «прокидатися» до хвилини).
