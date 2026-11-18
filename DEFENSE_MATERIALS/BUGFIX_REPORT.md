# BUGFIX_REPORT — знайдені та виправлені проблеми MOB

Резервні копії файлів до змін: `DEFENSE_MATERIALS/backup/before_fix/` та
`DEFENSE_MATERIALS/backup/BookingValidation.kt.corrupted` (папка `backup/` не комітиться).

## 1. Критично: «видалений» файл `BookingValidation.kt` — ВІДНОВЛЕНО

- **Що було:** у робочій копії весь вміст `mobile/app/src/main/java/com/workstudio/mobile/BookingValidation.kt`
  (31 рядок) замінено на два символи «пе» (схоже на випадковий набір на клавіатурі). `git status` показував
  файл як змінений, а не видалений, тому це легко було пропустити.
- **Наслідок:** без об'єкта `BookingValidation` не компілюється `WorkspaceScreen.kt` (там 3 виклики
  `BookingValidation.message`) — застосунок не збирається, перевірка інтервалу (TC-03) зникає.
  Збірку з пошкодженим файлом я не запускав — висновок зроблено з коду.
- **Як виправлено:** `git checkout -- …/BookingValidation.kt` (останній закомічений вміст із `d5eaa2b`).
- **Перевірка:** `assembleDebug` — BUILD SUCCESSFUL; `BookingValidationTest` 5/5.

Інших видалених екранів MOB у Git-історії немає: усі Composable-екрани з попередніх версій
(`LoginScreen`, `RegisterScreen`, `WorkspaceScreen`→`ClientHome`, `LiqPayCheckoutScreen`) присутні на `main`.

## 2. TC-13: календар мав лише вигляд «Місяць» — ДОРОБЛЕНО

- **Було:** `BookingCalendar` показував тільки місячну сітку. СРС (3.2.3, «за замовчуванням поточний тиждень») і
  TC-13 вимагають Day / Week / Month.
- **Стало:** перемикач Day / Week / Month (за замовчуванням Week), стрілки ‹ › переходять на попередній /
  наступний період, запит `GET /bookings/calendar` іде саме за видимий період. Логіку періодів винесено в
  чисті функції `calendarRange`, `shiftPeriod`, `periodTitle` (`Formatters.kt`) і покрито тестом
  `CalendarPeriodTest`.

## 3. TC-15: порожній календар без виходу на бронювання — ВИПРАВЛЕНО

- **Було:** «No bookings on this day.» без кнопки.
- **Стало:** якщо в періоді немає бронювань — «No upcoming bookings found» і кнопка **Book a workspace**,
  яка відкриває вкладку Spaces (новий параметр `onBookNew` у `BookingsTab`).

## 4. TC-12: у деталях бронювання не було локації, ID обрізаний — ВИПРАВЛЕНО

- **Було:** діалог показував лише 8 символів ID у верхньому регістрі; локація відсутня.
- **Стало:** рядок **Location** (береться з каталогу робочих місць за `workspaceId`, бо API бронювання
  повертає лише назву) і **Reservation ID** — повний `reference` як у БД. Модель `Booking` розширено полями
  `workspaceId`, `reference`, `isRecurring`.

## 5. Помилка завантаження календаря виглядала як «порожній календар» — ВИПРАВЛЕНО

- **Було:** при помилці мережі `entries = emptyList()` → користувач бачив «немає бронювань» (порушення СРС 3.2.3.5
  «показати помилку з можливістю повторити»).
- **Стало:** текст помилки + кнопка **Retry**; при `401` — вихід на екран логіну, як і раніше.

## 6. Дрібні покращення відповідно до вимог

- Картка робочого місця показує опис (TC-01: «name, type, location, description»).
- Історія бронювань позначає повторювані бронювання «Recurring booking» (FR-HIS-02).
- Повідомлення після створення бронювання містить референс (TC-05, СРС 3.2.2.4).

## Змінені файли

| Файл | Зміна |
|---|---|
| `BookingValidation.kt` | відновлено з Git |
| `AccountScreens.kt` | календар Day/Week/Month, порожній стан, Retry, деталі з Location / Reservation ID, recurring у картці |
| `Formatters.kt` | `CalendarView`, `calendarRange`, `shiftPeriod`, `periodTitle` |
| `Models.kt` | `Booking.workspaceId`, `reference`, `isRecurring` |
| `WorkspaceScreen.kt` | мапа локацій, `onBookNew`, референс у повідомленні |
| `SpacesScreens.kt` | опис у картці робочого місця |
| `test/CalendarPeriodTest.kt` | новий юніт-тест |
| `mobile/README.md` | оновлено опис календаря і тестів |

Чужі модулі (`backend/`, `frontend/`) не змінювались. Конфігурація і БД не змінювались.

## Відомі обмеження (не виправлялось)

- Повторюване бронювання (СРС 3.2.4, Should) у мобільному застосунку відсутнє; бекенд і веб-клієнт його мають.
- Вхід через Google (optional) і відновлення пароля — заглушки з чесним повідомленням.
- У TC-11 тариф обирається до створення бронювання (послідовність відрізняється від тест-кейсу, але сума і
  знімок ціни коректні).
- Мова інтерфейсу — англійська (як у Figma), хоча в СРС (Language Support) основною мовою вказано українську.
