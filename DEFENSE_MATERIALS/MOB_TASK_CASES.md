# MOB_TASK_CASES — Task Case з Testiny та результати перевірки

Джерело: Testiny, проєкт **WorkStudio** (Kharkiv National University of Radioelectronics), 16 тест-кейсів,
автор — QA Oleksandr Yatsenko. У Testiny на 18.11.2026 немає жодного тестового прогону (усі 16 — «Not Run»);
результати нижче — моя ручна перевірка на емуляторі Android (API 37) проти розгорнутого сервера Render.

Тестові акаунти: два клієнти `test-mob-a-…@example.com` / `test-mob-b-…@example.com`, створені для перевірки
(облікові дані — у `DEFENSE_MATERIALS/backup/test_accounts.local.txt`, не комітиться).

Статуси: **PASS** — виконано і працює; **PARTIAL** — частина кроків виконана / відхилення; **BLOCKED** — не
вдалося виконати з об'єктивних причин; **N/A** — не належить до MOB.

| Task Case | Що перевіряє | Модуль | Статус | Доказ |
|---|---|---|---|---|
| TC-01 Guest views workspaces and availability | Гість бачить список (назва, тип, локація, опис), деталі, вільні слоти; «Book» → логін | MOB + BE | **PASS** | `screenshots/02_guest_workspaces_TC01.jpg`; екран деталей показав Type/Zone/Features і слот 08:00–22:00; «Sign in to book» відкрив екран входу |
| TC-02 No available workspaces | Повідомлення «немає місць» + найближчі дати; тап по даті | MOB + BE | **PASS** | Усі 3 місця зайняті на 19.11 10:00–11:00 → «No available workspaces…» + Fri/Sat/Sun; тап по Nov 20 → нова дата, місця Free. `screenshots/03_no_free_places_TC02.jpg` |
| TC-03 Invalid period | Минула дата / кінець раніше початку відхиляються | MOB (+BE) | **PASS** | To=09:00 при From=10:00 → «"To" must be later than "From".», список не завантажується (`screenshots/04_invalid_period_TC03.jpg`); минулі дати заблоковані в DatePicker; юніт-тест `BookingValidationTest` (5 тестів) |
| TC-04 Booking conflict (two clients) | Другий клієнт не може забронювати той самий слот | BE (атомарність) + MOB (реакція) | **PASS (BE) / PARTIAL (MOB)** | Клієнт A забронював Desk A1 у застосунку; клієнт B через API → `409 BOOKING_CONFLICT`. Реакцію застосунку на 409 (повідомлення + повернення на Spaces з оновленням) перевірено за кодом (`WorkspaceScreen.kt`, `selectionErrors`), гонку двох пристроїв одночасно не відтворював |
| TC-05 Successful booking | Підсумок → Confirm → Pending Payment, референс, таймер; інший клієнт бачить слот зайнятим | MOB + BE | **PASS** | Діалог «Confirm booking» з місцем/датою/тарифом/сумою (`05_confirm_booking_TC05.jpg`); статус «Awaiting payment», «Pay within 14:13»; повідомлення з ref.; для іншого клієнта Desk A1 → `BOOKING_CONFLICT`, у застосунку «Occupied · Already booked for this time» |
| TC-06 Unauthenticated user or invalid input | Без входу бронювання неможливе; без дати/часу — помилка | MOB + BE | **PASS** | Гість: «Sign in to book» і вкладки Booking/Tariffs/Profile → екран входу. Дата і час у застосунку завжди мають значення (пікери), пустий запит неможливий; невалідний інтервал блокується (TC-03) |
| TC-07 Registration | Реєстрація, дубль email, некоректний email / слабкий пароль, хеш пароля | MOB (форма) + BE (хеш, унікальність) | **PASS (MOB-частина)** | «bad-email» → «Enter a valid email address.»; пароль «short» → «Password must be at least 8 characters.»; валідні дані → «Account created…», після підтвердження email вхід успішний. Хеш пароля в БД — BE, не перевірявся мною (немає доступу до БД) |
| TC-08 Login and roles | Вхід, неправильний пароль, адмінка для клієнта, сесія | MOB + BE + WEB | **PASS (MOB-частина)** | Неправильний пароль → «Incorrect email or password.»; правильний → вкладка Spaces. Клієнт → `/admin/bookings` → `403 FORBIDDEN` (API). Після logout токен → `401`. Протермінований токен при запуску → «Your session has expired…» (`01_login_session_expired.jpg`). Адмін-вхід у веб — WEB, N/A для мене |
| TC-09 Add and edit (admin) | Адмін додає/редагує місця й тарифи | WEB + BE | **N/A** | Адмін-панель — не MOB. Мобільний застосунок лише відображає нові дані з `GET /tariffs` і `/availability` (ціни не захардкоджені) |
| TC-10 Delete (admin) | Видалення місць/тарифів, знімок ціни | WEB + BE | **N/A** | Не MOB |
| TC-11 Successful payment | Тарифи → сума → Pay → LiqPay → callback → Confirmed | MOB + BE + LiqPay | **PARTIAL / BLOCKED** | Тарифи з цінами показуються, сума = ціна тарифу (₴100), «Continue to LiqPay» відкриває сторінку LiqPay «Тестовий режим», 100.00 UAH (`06_liqpay_test_checkout_TC11.jpg`); статус оплати став «In progress». Крок callback + «Confirmed» **не виконано**: я не вводив карткові дані (навіть тестові) на зовнішньому сайті — це має зробити студент на демонстрації тестовою карткою LiqPay. Відхилення: у MOB тариф обирається **до** створення бронювання, а не після |
| TC-12 View an upcoming booking | Календар, бронювання завтра, деталі (локація, дата, час, ID) | MOB + BE | **PASS (після виправлення)** | Календар → блок на 19.11 → діалог: Location «Main hall, Zone A», дата, 10:00–11:00, Reservation ID повний UUID (`08_booking_details_TC12.jpg`). До виправлення не було локації і показувалися лише 8 символів ID |
| TC-13 Switch views | Day / Week / Month | MOB | **PASS (після виправлення)** | Day: Nov 18 порожньо, › → Nov 19 з бронюванням; Week: Nov 16–22 з бронюванням 19.11; Month: November 2026, день 19 з маркером. До виправлення був лише Month. Юніт-тест `CalendarPeriodTest` (5 тестів) |
| TC-14 Booking status is visible | Різні маркери Confirmed і Pending | MOB | **PASS (частково перевірено)** | Легенда: коричнева крапка «Awaiting payment», зелена «Confirmed»; бейдж статусу на картці (`07_calendar_week_status_TC14.jpg`). Підтвердженого бронювання на сервері не було (оплата не завершена), тому зелений маркер на реальних даних не бачив — перевірено за кодом `CalendarDay`/`bookingStatusColors` |
| TC-15 Calendar without bookings | Порожній календар із «No upcoming bookings found» і кнопкою бронювання | MOB | **PASS (після виправлення)** | Новий клієнт → «No upcoming bookings found» + «Book a workspace» → вкладка Spaces (`09_empty_calendar_TC15.jpg`). До виправлення був лише текст «No bookings on this day.» без кнопки |
| TC-16 Privacy and access | Клієнт B не бачить бронювань A; без входу календар недоступний | BE (IR-04) + MOB | **PASS** | Календар клієнта B (API) → `bookings: []`, хоча A мав бронювання; гість, тап на «Booking» → екран входу |

## Підсумок для MOB

- PASS: TC-01, 02, 03, 05, 06, 07 (MOB), 08 (MOB), 12, 13, 15, 16; TC-14 — частково на реальних даних.
- PARTIAL: TC-04 (реакція застосунку на конфлікт — за кодом), TC-11 (до сторінки LiqPay включно).
- BLOCKED: TC-11 крок callback/Confirmed — потребує введення тестової картки на сторінці LiqPay.
- N/A (не MOB): TC-09, TC-10.

## Автоматизовані тести MOB

`mobile/app/src/test` — 18 юніт-тестів, усі зелені (`gradlew :app:testDebugUnitTest`):
`BookingValidationTest` (5), `FormattersTest` (7), `CalendarPeriodTest` (5, додано), `ExampleUnitTest` (1).
