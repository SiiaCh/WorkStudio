# DEMO_GUIDE — порядок демонстрації

## Підготовка (за 10 хв до пари)

1. Відкрити https://workstudio-api.onrender.com/api/health у браузері: має бути `"status":"ok"`.
   Сервер Render «засинає» і прокидається до хвилини, тому відкрийте його заздалегідь.
2. Запустити емулятор `Medium_Phone_API_37.0` (Android Studio → Device Manager → ▶) або підключити телефон.
3. Встановити свіжу збірку:
   ```
   cd C:\WorkStudio-git\mobile
   gradlew.bat :app:assembleDebug
   adb install -r app\build\outputs\apk\debug\app-debug.apk
   ```
   Або Android Studio → Run `app`.
4. Мати під рукою логін/пароль тестового клієнта (`DEFENSE_MATERIALS/backup/test_accounts.local.txt`).
   Бронювання, створені 18.11, вже прострочені (тримаються 15 хв), тож календар буде порожнім. Це
   зручно для TC-15.
5. Для оплати потрібна тестова картка LiqPay з офіційної документації LiqPay (sandbox). Справжню
   картку не вводьте.

## Сценарій показу (≈5–7 хв)

| # | Дія | Що сказати / показати | TC |
|---|---|---|---|
| 1 | Запустити застосунок → **Browse workspaces as a guest** | Гостьовий режим: список місць, бейджі Free/Occupied/Unavailable, «Available until» | TC-01 |
| 2 | Змінити **To** на час раніше за **From** | Червоне повідомлення, список не вантажиться | TC-03 |
| 3 | Повернути коректний час → тап по картці місця | Деталі: тип, зона, опис, вільні проміжки; тап по проміжку заповнює From/To | TC-01 |
| 4 | **Sign in to book** | Гостя переносить на вхід | TC-01/06 |
| 5 | Ввести неправильний пароль → **Sign In** | «Incorrect email or password.» | TC-08 |
| 6 | Ввести правильні дані | Вхід → вкладка Spaces | TC-08 |
| 7 | Вкладка **Booking** | Порожній календар: «No upcoming bookings found» + **Book a workspace** | TC-15 |
| 8 | **Book a workspace** → **Book workspace** на вільному місці | Перехід на тарифи з підписом місця/дати/часу | — |
| 9 | **Select tariff** → діалог **Confirm booking** → **Confirm** | Підсумок і сума; бронювання «Awaiting payment», відлік 15 хв | TC-05 |
| 10 | У діалозі оплати **Continue to LiqPay** | Тестова сторінка LiqPay із сумою; ввести тестову картку LiqPay | TC-11 |
| 11 | **Back to bookings · refresh status** | Статус оплати оновлюється з сервера (через кілька секунд **Confirmed**, зелена позначка) | TC-11/14 |
| 12 | Перемкнути **Day / Week / Month**, стрілки ‹ › | Бронювання на правильному дні в усіх режимах | TC-13 |
| 13 | Тап по бронюванню | Деталі: Location, дата, час, тариф, сума, статус оплати, Reservation ID | TC-12 |
| 14 | **History** | Історія з бейджами статусів і статусом оплати | — |
| 15 | **Profile** → **Log out** | Статус «Email verified», вихід на екран логіну | TC-08 |

## Якщо щось пішло не так

- «No connection to the server…» — сервер прокидається; зачекайте 30–60 с і натисніть **Refresh**.
- «LiqPay payments are not configured on the server yet» — на сервері вимкнений LiqPay (зона BE). Покажіть
  створення бронювання і календар, а оплату поясніть словами.
- Після LiqPay статус ще «In progress» — це нормально: статус змінює тільки сервер після callback. Натисніть
  **Refresh** у вкладці Booking.
- Слот хтось зайняв — застосунок покаже повідомлення про конфлікт і поверне на Spaces (TC-04). Це теж
  можна показати як обробку помилки.
