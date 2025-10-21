# תיק פרויקט: מערכת ניהול שכר ועובדים

**גרסה: 1.11.0**
**תאריך עדכון אחרון: 2025-10-22**

## 1. חזון ומטרה

מטרת הפרויקט היא לספק פתרון אפליקטיבי, נוח ויעיל לניהול תשלומי שכר לעובדים, כתחליף לקובץ אקסל שהיה מועד לטעויות. המערכת מותאמת אישית לצרכים של עסק עם שני סוגי עובדים עיקריים: עובדים שעתיים ומדריכים המקבלים תשלום פר-סשן.

**דרישות מפתח:**
- ממשק פשוט ואינטואיטיבי בעברית.
- יכולת להגדיר תעריפים דינמיים ומשתנים לאורך זמן.
- ניהול גמיש של סוגי שירותים (סשנים) שהמדריכים יכולים לבצע.
- דוחות מדויקים ואינטראקטיביים.
- שמירה על דיוק היסטורי של נתונים פיננסיים.

---

## 2. ארכיטקטורה וטכנולוגיות

המערכת בנויה בארכיטקטורת שרת-לקוח מודרנית, ארוזה כאפליקציית דסקטופ עצמאית.

*   **מעטפת אפליקציית דסקטופ:**
    *   **Framework:** Electron
    *   **כלי אריזה:** electron-builder
    *   **תכונות:** כולל Launcher מותאם אישית לפתיחת האפליקציה בחלון משלה או בדפדפן ברירת המחדל של המשתמש.

*   **Frontend (צד לקוח):** אפליקציית Single Page Application (SPA) שנבנתה באמצעות:
    *   **Framework:** React
    *   **ניתוב:** React Router (`HashRouter` לתאימות עם דסקטופ)
    *   **כלי בנייה:** Vite
    *   **עיצוב:** Tailwind CSS
    *   **ספריית רכיבים:** shadcn/ui

*   **Backend ובסיס נתונים:**
    *   **שער API מאובטח:** פונקציות Azure מאחסנות את כל נקודות הקצה תחת `/api/*`, ומתווכות כל בקשה לאחר אימות זהות, חברות בארגון והרשאות תפקיד.
    *   **פלטפורמת נתונים:** פרויקטי PostgreSQL של Supabase לכל לקוח, נגישים רק דרך `tenantClient` שנוצר בצד השרת לאחר פענוח המפתח הייעודי.
    *   **כלל גישת נתונים:** צד הלקוח אינו פונה ישירות לבסיס הנתונים של הלקוח לצורכי כתיבה; הוא פונה ל-API המאובטח שמבצע את הפעולה ומחזיר תשובה.

*   **ניהול תצורה:**
    *   האישורים נטענים בזמן ריצה אך ורק מפונקציית Azure `/api/config`. ללא טוקן היא מחזירה את כתובת ה-Supabase וה-anon key המוגדרים במשתנים `APP_SUPABASE_URL` ו-`APP_SUPABASE_ANON_KEY`.
*   לאחר התחברות ובחירת ארגון מבוצעת בקשת `GET /api/org/<org-id>/keys` עם הכותרת `X-Supabase-Authorization: Bearer <supabase_access_token>`. ה-API מעביר את ה-JWT לפונקציית ה-RPC `public.get_org_public_keys` ב-Supabase, המאמתת חברות לפני החזרת פרטי החיבור של הארגון.

### 2.1 מודל ארגון וחברות

- המערכת מחזיקה פרויקט Supabase ייעודי למטא-דאטה של האפליקציה. הטבלאות המרכזיות הן `organizations`, `org_memberships` ו-`org_invitations`.
- בכל רשומת ארגון נשמרים פרטי החיבור הציבוריים של Supabase (`supabase_url`, `supabase_anon_key`), המפתח הייעודי המוצפן (`dedicated_key_encrypted`), רשימת `policy_links` (מחרוזות URL), והגדרות משפטיות (JSON עם מייל איש קשר, תנאי שימוש ומדיניות פרטיות) לצד דגלי `setup_completed` ו-`verified_at`.
- רשומת חברות מקשרת `user_id` ממנגנון Supabase Auth לארגון בודד ולתפקיד (`admin`/`member`). החלפת ארגון מעדכנת את ההקשר של הבקשות ל-API המאובטח במקום להחליף לקוח Supabase בצד הלקוח.
- טבלת ההזמנות שומרת כתובות מייל ממתינות. מנהלים יכולים להזמין, לבטל הזמנה או להסיר חברים (למעט עצמם) מתוך **הגדרות → חברי ארגון**.
- לאחר ההתחברות `OrgProvider` טוען את החברויות, שומר ב-`localStorage` את הארגון האחרון שנבחר, ומוודא שעד להגדרת חיבור תקין רק מסך ההגדרות נגיש לצורך השלמת אשף ההתקנה. ההקשר הפעיל נשלח יחד עם כל קריאה ל-API במקום ביצוע פעולות כתיבה ישירות מה-UI.

### 2.2 זרימת "שער API מאובטח"

- **התחלת בקשה:** ה-Frontend מבצע בקשות מאומתות לנקודות קצה כמו `POST /api/services` או `GET /api/work-sessions`, ותמיד מצרף את ה-JWT של המשתמש בכותרת `Authorization: Bearer <token>`.
- **אימות בבסיס הבקרה:** פונקציית Azure מאמתת את ה-JWT מול בסיס הנתונים המרכזי (Control DB) ומוודאת שהסשן פעיל.
- **בדיקת חברות ותפקיד:** הפונקציה בודקת את טבלת `org_memberships` ומוודאת שהמשתמש שייך לארגון המבוקש; פעולות כתיבה מותרות רק לבעלי תפקיד `admin` או `owner`.
- **איתור טננט:** לאחר האישור נטענים פרטי החיבור של הארגון, כולל המפתח הייעודי המוצפן (`dedicated_key_encrypted`).
- **פענוח מפתח:** באמצעות הסוד הצד-שרת `APP_ORG_CREDENTIALS_ENCRYPTION_KEY` מפענחים את המפתח ויוצרים `tenantClient` עם תפקיד `app_user` שמתחבר לפרויקט Supabase של הלקוח.
- **פעולה במסד:** כל קריאה או כתיבה מתבצעת דרך `tenantClient` בצד השרת (למשל שליפת שירותים ממוינים או יצירת WorkSessions), תוך טיפול בשגיאות.
- **תגובה ללקוח:** הפונקציה מחזירה תשובת JSON מסודרת ל-Frontend וממפה שגיאות Supabase להודעות API עקביות. המפתח הייעודי אינו נחשף לעולם ללקוח וה-UI אינו כותב ישירות לבסיס הנתונים.

### 2.3 API הזמנות לארגון

- פונקציית Azure בנתיב `/api/invitations` מרכזת את כל פעולות ההזמנה: יצירה, שליפה, ולידציה ופעולות קבלה/דחייה.
- היא מקימה לקוח Supabase אדמין עם `APP_CONTROL_DB_URL` ו-`APP_CONTROL_DB_SERVICE_ROLE_KEY`, מאמתת את ה-JWT של הפונה ומוודאת מחדש חברות ותפקיד מול `org_memberships` לפני כל שינוי נתונים.
- `POST /api/invitations` מקבל `{ orgId, email, expiresAt?, redirectTo?, emailData? }` ממנהלים/בעלים, בודק שאין חברות קיימת או הזמנה ממתינה, מוסיף שורה ל-`org_invitations` ואז מפעיל `supabase.auth.admin.inviteUserByEmail` עם מטא-דאטה `{ orgId, orgName, invitationId, invitationToken }`.
- `GET /api/invitations` (למנהלים בלבד) מחזיר הזמנות ממתינות לאחר שהפונקציה מעדכנת הזמנות שפג תוקפן לסטטוס `expired` כך שהן לא יוצגו ל-UI.
- `GET /api/invitations/token/:token` פתוח ללא אימות, מאמת את הטוקן והפג תוקף ומחזיר שם ארגון, מייל וסטטוס ללא חשיפת שדות רגישים.
- `POST /api/invitations/:id/accept` דורש שהמייל המאומת של המוזמן יתאים להזמנה, מוסיף/מעדכן רשומת `org_memberships` עם תפקיד `member` ומסמן את ההזמנה כ-`accepted`.
- `POST /api/invitations/:id/decline` מאמת את המוזמן ומעדכן סטטוס `declined`; `DELETE /api/invitations/:id` מאפשר למנהלים לבטל הזמנות פתוחות.
- מחזור הסטטוסים: `pending` → (`accepted` | `declined` | `revoked` | `expired` | `failed`). עדכון פקיעת תוקף מתבצע בצד השרת לפני המענה ללקוח.

### 2.4 ממשק הזמנות בלשונית "חברי ארגון"

- הקובץ `src/api/invitations.js` עוטף את פונקציית Azure עם הפונקציות `createInvitation`, `listPendingInvitations` ו-`revokeInvitation`, מבצע ולידציה למזהי UUID ולאימיילים ומחזיר הודעות שגיאה מקומיות כאשר קריאות נכשלות.
- `OrgMembersCard.jsx` טוען את ההזמנות הממתינות בעת טעינת הרכיב, מציג מצבי טעינה/שגיאה/ריק ומרענן את הרשימה לאחר כל יצירה או ביטול. שימוש ב-AbortController מונע עדכוני state לאחר שהרכיב מוסר מה-DOM.
- רק מנהלים ובעלי ארגון רואים את טופס ההזמנה (עם תווית נגישה לשדה האימייל) ואת רשימת ההזמנות הממתינות; משתמשי member נשארים בתצוגת קריאה בלבד של חברים פעילים. הצלחות מוצגות בטוסט ירוק, ושגיאות מוצגות בטוסט אדום.
- הרשימה מציגה אימייל, תאריך שליחה ותג סטטוס יחד עם כפתור ביטול שנכנס למצב זמני "מבטל..." עד לקבלת תשובת ה-API.

### 2.5 זרימת השלמת הרשמה להזמנה

- מיילי ההזמנה מפנים משתמשים חדשים ל-`/#/complete-registration?token_hash=<supabase>&invitation_token=<internal>` שבו נטען רכיב **CompleteRegistrationPage** הייעודי.
- בעת טעינת הדף נשלף הפרמטר `token_hash` ומבוצעת מיידית קריאה אל `supabase.auth.verifyOtp({ type: 'invite', token_hash })` דרך לקוח האימות המשותף. הצלחת הקריאה מקימה סשן Supabase כדי שהמשתמש יהיה מחובר לפני שפעולת UI נוספת מתבצעת.
- לאחר האימות מוצג טופס ממותג לקביעת סיסמה (סיסמה חדשה + אימות). ולידציה בצד הלקוח מוודאת ששני השדות אינם ריקים ותואמים לפני קריאת `supabase.auth.updateUser({ password })`.
- עם שמירת הסיסמה האפליקציה מנתבת אוטומטית ל-`/#/accept-invite`, תוך העברת פרמטר `invitation_token` כדי שזרימת קבלת ההזמנה הארגונית תוכל להסתיים ללא בקשת מטא-דאטה נוספת.

### 2.6 זרימת קבלת הזמנה

- הקובץ `/components/pages/AcceptInvitePage.jsx` מנהל את חוויית הקבלה המאובטחת בנתיב `/#/accept-invite`.
- בעת טעינה נשלף `invitation_token`, מתבצעת קריאה אל `getInvitationByToken(token)`, ומוצגים מצבי טעינה ושגיאה ממותגים תוך טיפול בקישורים שפג תוקפם או שאינם תקינים.
- תרחיש א' (ללא סשן פעיל): מוצג שם הארגון ואימייל ההזמנה לצד כפתורי "כניסה" ו"השלמת הרשמה" ששומרים את הטוקן בעת הניווט למסכים המתאימים.
- תרחיש ב' (סשן פעיל ואימייל תואם): מוצגים כפתורי "אישור" ו"דחייה" המחוברים ל-`acceptInvitation` / `declineInvitation`, כולל הודעות שגיאה מקומיות והפניה לדשבורד לאחר אישור.
- תרחיש ג' (סשן פעיל ואימייל שאינו תואם): באנר אזהרה מסביר שיש להתנתק. כפתור "החלפת חשבון" קורא ל-`signOut` ומחזיר ל-`/login` עם הנחיות, תוך שמירת טוקן ההזמנה.

---

## 3. מבנה בסיס הנתונים (Database Schema)

זהו לב המערכת. בסיס הנתונים מורכב מארבע טבלאות מרכזיות:

### 3.1. טבלת `Employees`
מכילה מידע כללי על כל עובד.

| עמודה | סוג | תיאור | אילוצים |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | מזהה ייחודי אוטומטי | **Primary Key** |
| `name` | `text` | שם מלא של העובד | Not NULL |
| `employee_type`| `text` | סוג עובד ('hourly', 'instructor', 'global') | Not NULL |
| `current_rate`| `numeric`| תעריף שעתי או חודשי נוכחי | |
| `working_days` | `jsonb` | מערך של ימי עבודה (למשל `["SUN","MON"]`) | ברירת מחדל: `["SUN","MON","TUE","WED","THU"]` |
| `is_active` | `boolean`| האם העובד פעיל כרגע | Default: `true` |
| ... | ... | שדות נוספים: `employee_id`, `phone`, `email`, `start_date`, `notes` | |

### 3.2. טבלת `Services`
מכילה את הרשימה הדינמית של שירותים/סשנים שמדריכים יכולים לבצע.

| עמודה | סוג | תיאור | אילוצים |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | מזהה ייחודי אוטומטי | **Primary Key** |
| `name` | `text` | שם השירות (למשל, "רכיבה טיפולית 30 דק'") | Not NULL |
| `duration_minutes`| `int8` | משך השירות בדקות (לצורך חישוב שעות) | |
| `payment_model`| `text` | מודל תשלום ('fixed_rate' או 'per_student') | Not NULL |
| `color` | `text` | קוד צבע הקסדצימלי (למשל, `#8B5CF6`) לתצוגה בממשק | |

### 3.3. טבלת `RateHistory`
הטבלה הקריטית ביותר. שומרת את יומן התעריפים ההיסטורי לכל עובד ושירות.

| עמודה | סוג | תיאור | אילוצים |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | מזהה ייחודי אוטומטי | **Primary Key** |
| `employee_id` | `uuid` | מצביע לטבלת `Employees` | **Foreign Key** |
| `service_id` | `uuid` | מצביע לטבלת `Services` | **Foreign Key** |
| `rate` | `numeric` | סכום התעריף | Not NULL |
| `effective_date`| `date` | התאריך שממנו התעריף הזה נכנס לתוקף | Not NULL |
| `notes` | `text` | הערות על שינוי התעריף | |
| **אילוץ ייחודיות משולב** | `UNIQUE` | על העמודות: `employee_id`, `service_id`, `effective_date` | |

### 3.4. טבלת `WorkSessions`
יומן העבודה. כל שורה מייצגת סשן עבודה שהושלם.

| עמודה | סוג | תיאור | אילוצים |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | מזהה ייחודי אוטומטי | **Primary Key** |
| `employee_id` | `uuid` | מצביע לטבלת `Employees` | **Foreign Key** |
| `service_id` | `uuid` | מצביע לטבלת `Services` (למדריכים) | **Foreign Key** |
| `date` | `date` | תאריך ביצוע העבודה | Not NULL |
| `entry_type` | `text` | 'session', 'hours', 'adjustment', 'leave_employee_paid', 'leave_system_paid', 'leave_unpaid', 'leave_half_day' | Not NULL |
| `hours` | `numeric` | מספר שעות (שדה תצוגה בלבד בגלובלי) | |
| `sessions_count`| `int8` | מספר מפגשים (למדריכים) | |
| `students_count`| `int8` | מספר תלמידים (למודל `per_student`) | |
| `rate_used` | `numeric`| "תמונת מצב" של התעריף שהיה בשימוש בזמן החישוב | |
| `total_payment`| `numeric`| "תמונת מצב" של הסכום הסופי שחושב | |

#### כללי חישוב ב-WorkSessions

- `rate_used` נטען מטבלת `RateHistory` בכל יצירה או עדכון. מדריכים מחשבים לפי `(employee_id, service_id, date)`; עובדים שעתיים וגלובליים לפי `(employee_id, date)`.
- עבור רישומי מדריכים `service_id` הוא חובה. אם אין תעריף תקף לתאריך – הפעולה נחסמת עם הודעת שגיאה.
- `effectiveWorkingDays(employee, month)` סופר את ימי החודש בהם היום בשבוע כלול ב-`employee.working_days`. אם התוצאה היא `0` – השמירה נחסמת עם הודעה ברורה.
- `total_payment` מחושב ונשמר בכל שורה:
  - מדריכים: `sessions_count * students_count * rate_used` (או ללא תלמידים כאשר התשלום אינו פר תלמיד).
  - עובדים שעתיים: `hours * rate_used`.
  - עובדים גלובליים: `rate_used / effectiveWorkingDays(employee, month)` (כל שורה מייצגת יום אחד; שדה השעות אינו משפיע וריבוי רישומים באותו יום לא מכפיל שכר).
  - חופשות: חופשה בתשלום נשמרת כ-`entry_type='leave_employee_paid'`, חג בתשלום על חשבון המערכת כ-`entry_type='leave_system_paid'`, חופשה ללא תשלום כ-`entry_type='leave_unpaid'` עם `total_payment=0`, וחצי יום נשמר כ-`entry_type='leave_half_day'` עם חצי מתעריף היום המלא.
- סיכומי חודש ודוחות מתבססים אך ורק על סכימת `total_payment` משורות `WorkSessions`, תוך סיכום רישומי גלובלי לפי יום אחד.
- כל רישום יכול לכלול שדה הערות חופשי (עד 300 תווים).

סיווג חצי יום מתבסס על `entry_type='leave_half_day'`; המטא-דאטה כבר אינו מכיל דגל `leave.half_day` חדש.

קריאות `POST /api/work-sessions` מחזירות כעת את הרשומות שנוצרו במלואן (לא רק מזהים) כדי שניתן יהיה לשייך מיד חופשות חדשות ל-`LeaveBalances`.

#### תהליך מחיקה של WorkSessions

- **מחיקה רכה כברירת מחדל:** פעולות מחיקה שמקורן במסכים הרגילים מבצעות עדכון של `deleted=true` ו-`deleted_at=NOW()` כדי להשאיר את הרישום זמין לשחזור.
- **מחיקה לצמיתות מוגבלת:** רק לשונית סל האשפה מאפשרת מחיקה בלתי הפיכה, תוך דרישת הקלדת "מחק" ושליחת בקשה ל-`DELETE /api/work-sessions/{id}?permanent=true`.
- **חוזה API:** פונקציית ה-Azure מפרשת `permanent=true` כמחיקה מלאה (`DELETE`). קריאות ללא הפרמטר יבצעו תמיד מחיקה רכה.
- **סנכרון ספר התנועות:** כאשר מוחקים רישום חופשה, ה-API מוחק לצמיתות את שורת `LeaveBalances` המקושרת במחיקה רכה, ומשחזר אותה אוטומטית בעת שחזור. מחיקה לצמיתות מוחקת את שני הרישומים יחד.
- **דיאלוגים בממשק:** מחוץ לסל האשפה מוצג דיאלוג מידע פשוט שמדגיש שהרישום מועבר לסל. דיאלוג הקלדת "מחק" מופיע רק בלשונית סל האשפה לפני מחיקה לצמיתות.

### 3.5. טבלת `Settings`
מאחסנת הגדרות רוחב-ארגון הנשמרות לפי מפתח קבוע.

| עמודה | סוג | תיאור | אילוצים |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | מזהה ייחודי אוטומטי | **Primary Key** |
| `key` | `text` | מזהה ההגדרה (למשל `leave_policy`) | **Unique** |
| `settings_value` | `jsonb` | מטען JSON מובנה של ההגדרה | Not NULL |
| `created_at` | `timestamptz` | חותמת יצירה | ברירת מחדל: `now()` |
| `updated_at` | `timestamptz` | חותמת עדכון אחרונה | ברירת מחדל: `now()` |

רשומת `leave_policy` מכילה את תצורת ניהול החופשות המשמשת בכל חלקי המערכת:

- `allow_half_day` – מאפשר לעובדים לצרוך 0.5 יום בכל פעולה.
- `allow_negative_balance` – מאפשר חריגה למינוס עד הגבול המוגדר.
- `negative_floor_days` – היתרה המינימלית המותרת (ערך שלילי מציין כמה אפשר לרדת מתחת לאפס).
- `carryover_enabled` / `carryover_max_days` – שליטה על העברת יתרות חיוביות לשנה הבאה.
- `holiday_rules[]` – מערך של אובייקטים `{ id, name, type, start_date, end_date, recurrence }` שמגדירים טווחי חגים ומסווגים אותם כחופשה בתשלום על חשבון המערכת, חופשה בתשלום, חופשה ללא תשלום, מעורב או חצי יום חופשה.

יש להשתמש בפונקציות העזר שב-`src/lib/leave.js` לכל פעולת קריאה/כתיבה כדי לנרמל את ה-JSON ולשמור על עקביות מזהים.

### 3.6. טבלת `LeaveBalances`
משמשת כספר תנועות בלתי הפיך להקצאות חופשה ולניצולים בפועל.

| עמודה | סוג | תיאור | אילוצים |
| :--- | :--- | :--- | :--- |
| `id` | `bigint` | מזהה רץ אוטומטי | **Primary Key** |
| `employee_id` | `uuid` | מצביע לטבלת `Employees` | **Foreign Key** |
| `work_session_id` | `uuid` | קישור לרישום `WorkSessions` שממנו נוצרה התנועה (ברישומי זמן) | **Foreign Key**, Nullable |
| `leave_type` | `text` | תיאור סוג התנועה (למשל `allocation`, `usage_employee_paid`, `time_entry_leave_employee_paid`) | Not NULL |
| `balance` | `numeric` | ערכים חיוביים מוסיפים מכסה, ערכים שליליים מנכים ניצול | Not NULL, ברירת מחדל `0` |
| `effective_date` | `date` | תאריך ההשפעה של התנועה | Not NULL |
| `notes` | `text` | פרטים חופשיים אופציונליים | |
| `created_at` | `timestamptz` | חותמת יצירה | ברירת מחדל: `now()` |

הרישומים תומכים בערכים שבריים (למשל `-0.5` עבור חצי יום כשמאופשר במדיניות). רישומי ניכוי נבדקים מול רצפת המינוס שהוגדרה; ניסיון לרדת מעבר לגבול יציג את הטוסט "חריגה ממכסה ימי החופשה המותרים" ויחסם. כל שמירת חופשה דרך מסך רישום הזמן יוצרת גם שורת `LeaveBalances` מקושרת באמצעות `work_session_id`, גם עבור חופשות ללא תשלום או חופשות מערכתיות (balance `0`).

### מצב הזנה מרובה

ניתן להפעיל מצב **"בחר תאריכים להזנה מרובה"** בטבלה, לבחור עובדים ותאריכים, וללחוץ **"הזן"** כדי לפתוח מודאל המציג את כל התאריכים כרשימת טפסים קטנים—שורה אחת לכל תאריך ולעובד. לצד כל שדה מופיע כפתור **"העתק מהרישום הקודם"**.
עובדים גלובליים רואים שדה שעות לצורכי תצוגה בלבד ויכולים לבחור בין "יום רגיל" ל"חופשה בתשלום"; השכר מחושב תמיד לפי יום אחד לכל שורה.
שמירה יוצרת רשומת `WorkSessions` עבור כל צירוף של עובד ותאריך שנבחר.

### ייבוא נתונים בעברית

מודל הייבוא מאפשר להדביק טקסט או להעלות קובץ `.csv`. שורות שמתחילות ב-`#` יזוהו כהערות וידולגו. העובד נבחר בתוך המודל ואין לכלול עמודת עובד בקובץ. המערכת מזהה אוטומטית את המפריד (פסיק / TAB / נקודה-פסיק / קו-אנכי) וניתן לבחור מפריד ידנית.

**מיפוי כותרות**

| עברית            | שדה פנימי |
|------------------|-----------|
| תאריך           | `date` (DD/MM/YYYY → YYYY-MM-DD) |
| סוג רישום       | `entry_type` (`שיעור`=`session`, `שעות`=`hours`, `התאמה`=`adjustment`, `חופשה בתשלום`=`leave_employee_paid`, `חופשה מערכת`=`leave_system_paid`, `חופשה ללא תשלום`=`leave_unpaid`, `חצי יום`=`leave_half_day`) |
| שירות           | `service_name` |
| שעות            | `hours` |
| מספר שיעורים    | `sessions_count` |
| מספר תלמידים    | `students_count` |
| סכום התאמה      | `adjustment_amount` |
| הערות           | `notes` |

התצוגה המקדימה מציגה עד 100 שורות עם הודעות שגיאה לכל שורה. שורות כפולות מסומנות ומדולגות אלא אם המשתמש בוחר לייבא אותן בכל זאת.

**תבניות**

כפתורי הורדה מספקים תבנית CSV (עם BOM) ותבנית אקסל בסיסית. שני הקבצים כוללים שורות הוראות ודוגמאות מסומנות "(דוגמה)" שיש למחוק לפני הייבוא.

**כללי ולידציה**

- `date` חייב להיות תקין.
- `session` דורש `service_name`, `sessions_count` ≥1, `students_count` ≥1 ותעריף תקף.
- `hours` דורש תעריף; עובד שעתי חייב שעות, עובד גלובלי משתמש בתעריף יומי ללא קשר לשעות.
- סוגי חופשה (`leave_employee_paid`, `leave_system_paid`, `leave_half_day`) דורשים תעריף יומי תקף לעובד ולתאריך; `leave_unpaid` נשמרת עם סכום 0 אך עדיין מחייבת פרטי זיהוי מלאים.
- `adjustment` דורש `adjustment_amount` ומתעלם משדות אחרים.

רק שורות תקינות נשלחות לטבלת `WorkSessions`; בסיום מוצג סיכום של שורות שהוזנו, שגויות ומדולגות.

### עורך יום גלובלי
- בעת עריכת עובד גלובלי ביום מסוים, מוצג כותר יום עם בורר סוג יום יחיד ורשימת מקטעי שעות. הוספת מקטע אינה מכפילה שכר, ומחיקת המקטע האחרון נחסמת עם הודעה.
- בטבלת החודש מוצג סכום השעות לכל יום גלובלי כ-`X שעות`, כאשר השכר נספר פעם אחת בלבד ליום.

---

## 4. החלטות ארכיטקטוניות ומסקנות (Lessons Learned)

במהלך הפיתוח התקבלו מספר החלטות מפתח שעיצבו את המערכת:

1.  **שימוש בטבלת `RateHistory` נפרדת:** במקום להוסיף עמודות תעריפים לטבלת `Employees`.
    *   **היגיון:** זה מספק גמישות אינסופית להוספת שירותים חדשים מבלי לשנות את סכמת בסיס הנתונים. והכי חשוב, זה שומר על **היסטוריית תעריפים מדויקת**, שחיונית לחישובים רטרואקטיביים.
    *   **מסקנה:** דיוק היסטורי בנתונים פיננסיים גובר על הפשטות של מבנה נתונים "שטוח".

2.  **שימוש ב-`upsert` עם `onConflict` משולב:** כדי למנוע רשומות תעריפים כפולות לאותו היום, הגדרנו אילוץ ייחודיות על השילוב של `employee_id`, `service_id`, ו-`effective_date`.
    *   **היגיון:** זה מאפשר לנו להשתמש בפקודת `upsert` יעילה ש"דורסת" שינויים שנעשו באותו היום, ובכך מונעת "בלגן" בבסיס הנתונים ושומרת על "מקור אמת אחד" לכל יום נתון.
    *   **מסקנה:** שימוש נכון באילוצים (constraints) בבסיס הנתונים מפשט את הלוגיקה בקוד ומונע באגים.

3.  **הפיכת רכיבים ל"חכמים" ועצמאיים:** באג שבו טופס עריכת העובד לא הציג תעריפים מעודכנים נפתר על ידי הפיכת `EmployeeForm` לרכיב שאחראי להביא את הנתונים העדכניים שלו בעצמו, במקום להסתמך על מידע שעלול להיות "ישן" מהרכיב האב.
    *   **מסקנה:** חיוני לנהל את ה-state בחוכמה ולהבטיח שרכיבים תמיד עובדים עם המידע העדכני ביותר שהם צריכים.

4.  **תעדוף חווית המשתמש (UX):** התלבטנו רבות לגבי התנהגות טפסים, במיוחד במעבר בין סוגי עובדים.
    *   **ההחלטה:** במקום איפוס טופס מלא, יישמנו "איפוס חלקי חכם" והוספנו `AlertDialog` מעוצב כדי לתת למשתמש שליטה מלאה על פעולות שעלולות לגרום לאיבוד מידע.
    *   **מסקנה:** חווית משתמש טובה דורשת חשיבה על מקרי קצה והימנעות מהתנהגויות אוטומטיות שעלולות לתסכל את המשתמש.

5.  **ניהול מרוכז של היסטוריית תעריפים:** רכיב `RateHistoryManager` הייעודי מאפשר להוסיף או לערוך רשומות היסטוריית תעריפים ישירות מתוך טופס העובד; מחיקה אינה זמינה כדי לשמור על עקבות.
    *   **מסקנה:** ריכוז עריכת התעריפים במקום אחד שומר על נתוני השכר עקביים ושקופים.

6.  **דפוס קריסת שורות ידני לטבלאות חופשה:** מקטעי drill-down בתוך טבלאות נשענים כעת על מצב `useState` שמוסיף `<tr>` נוסף עם תא פרוס במקום לעטוף שורות ברכיבי Collapsible כלליים.
    *   **היגיון:** שמירה על `<tr>` אחים שומרת על סמנטיקה נגישה של טבלאות, מונעת חוסר יישור של עמודות ומונעת תיקוני פריסה אוטומטיים של הדפדפן עבור HTML לא תקין.
    *   **מסקנה:** בעת הרחבת טבלאות עם מגירות מידע, עדיף רינדור תנאי מפורש על פני רכיבי חשיפה גנריים כדי לשמור על שלמות המבנה.

---

## 5. מדריך התקנה ופריסה

מדריך זה מיועד למפתח (או AI) חדש שמצטרף לפרויקט וצריך להקים את סביבת הפיתוח מאפס.

### הגדרת סביבת פיתוח

1.  **שכפל את המאגר:** `git clone [כתובת המאגר]`
2.  **התקן תלויות:** `npm install`
3.  **הקם פרויקט ב-Supabase:**
    *   צור פרויקט חדש ב-`supabase.com`.
    *   צור את 4 הטבלאות (`Employees`, `Services`, `RateHistory`, `WorkSessions`) כפי שמפורט בסעיף 3.
    *   ודא שכל ה-`Primary Keys`, `Foreign Keys`, וה-`Constraints` מוגדרים כראוי.

### תהליך הצטרפות לארגון

1. התחבר באמצעות Supabase Auth (Google, Microsoft או אימייל+סיסמה).
2. מסך **בחירת ארגון** מציג את החברויות הקיימות. צור ארגון חדש או אשר הזמנה פתוחה כדי להמשיך.
3. לאחר בחירת ארגון פתח את **הגדרות → אשף הגדרה** לשמירת כתובת ה-Supabase והמפתח הציבורי ולהרצת ה-SQL המונחה.
4. מנהלים יכולים להזמין חברים נוספים מתוך **הגדרות → חברי ארגון**; המשתמש המוזמן יאשר את ההזמנה במסך בחירת הארגון ויקבל את אותו חיבור.

### בסיס אבטחת Supabase (Row Level Security)

כל פרויקט לקוח חייב להפעיל Row Level Security (RLS) כדי שרק משתמשים מאומתים יוכלו לקרוא או לעדכן נתונים. אשף ההגדרה שבאפליקציה (הגדרות → אשף הגדרה) מלווה את מנהל המערכת בשלושה צעדים מחייבים:

1. **חיבור** – הזינו את כתובת ה-URL הציבורית ואת מפתח ה-ANON של Supabase. הערכים נשמרים ברשומת הארגון (`app_organizations.supabase_url` / `supabase_anon_key`) יחד עם קישורי מדיניות והגדרות משפטיות כדי שכל המנהלים יעבדו מול אותה תצורה.
2. **החלת SQL** – הריצו את בלוק הסכימה ובלוק ה-RLS שלמטה (בסדר הזה) בעורך ה-SQL של Supabase בזמן שאתם מחוברים כבעלי הפרויקט.
3. **אימות** – לחצו על "הרץ אימות" באשף. הפונקציה `setup_assistant_diagnostics()` פועלת עם המפתח האנונימי, מדגישה רכיבים חסרים, ומעדכנת את `app_organizations.setup_completed` ו-`verified_at` כאשר כל הטבלאות והמדיניות מאובטחות. עד אז הניווט חסום למסכים אחרים פרט להגדרות.

#### פקודות SQL מחייבות

יש לכלול בסקריפט ההתקנה של כל לקוח את הפקודות הבאות **לפני** הפעלת מדיניות ה-RLS:

```sql
INSERT INTO "public"."Services" ("id", "name", ...)
VALUES ('00000000-...', 'תעריף כללי...', ...);
```

```sql
GRANT app_user TO postgres, anon;
```

```sql
ALTER TABLE public."RateHistory"
ADD CONSTRAINT "RateHistory_employee_service_effective_date_key"
UNIQUE (employee_id, service_id, effective_date);
```

פקודות אלו יוצרות את שירות ברירת המחדל, מיישרות את היררכיית ההרשאות מול שער ה-API המאובטח, ומבטיחות היסטוריית תעריפים ללא כפילויות בכל הטננטים.

#### SQL לסכימה ולעזר

סקריפט הסכימה המלא ופונקציית העזר נשמרים כעת בקובץ `src/lib/setup-sql.js`. אשף ההתקנה באפליקציה מציג למשתמש גרסה מוכנה להעתקה של הסקריפט.

#### SQL למדיניות RLS

```sql
-- שלב 2: הפעלת RLS והוספת מדיניות מאובטחת
alter table public."Employees" enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Employees'
      and policyname = 'Authenticated select Employees'
  ) then
    create policy "Authenticated select Employees" on public."Employees"
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Employees'
      and policyname = 'Authenticated insert Employees'
  ) then
    create policy "Authenticated insert Employees" on public."Employees"
      for insert to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Employees'
      and policyname = 'Authenticated update Employees'
  ) then
    create policy "Authenticated update Employees" on public."Employees"
      for update to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Employees'
      and policyname = 'Authenticated delete Employees'
  ) then
    create policy "Authenticated delete Employees" on public."Employees"
      for delete to authenticated
      using (true);
  end if;
end;
$$;

alter table public."WorkSessions" enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'WorkSessions'
      and policyname = 'Authenticated select WorkSessions'
  ) then
    create policy "Authenticated select WorkSessions" on public."WorkSessions"
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'WorkSessions'
      and policyname = 'Authenticated insert WorkSessions'
  ) then
    create policy "Authenticated insert WorkSessions" on public."WorkSessions"
      for insert to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'WorkSessions'
      and policyname = 'Authenticated update WorkSessions'
  ) then
    create policy "Authenticated update WorkSessions" on public."WorkSessions"
      for update to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'WorkSessions'
      and policyname = 'Authenticated delete WorkSessions'
  ) then
    create policy "Authenticated delete WorkSessions" on public."WorkSessions"
      for delete to authenticated
      using (true);
  end if;
end;
$$;

alter table public."LeaveBalances" enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'LeaveBalances'
      and policyname = 'Authenticated select LeaveBalances'
  ) then
    create policy "Authenticated select LeaveBalances" on public."LeaveBalances"
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'LeaveBalances'
      and policyname = 'Authenticated insert LeaveBalances'
  ) then
    create policy "Authenticated insert LeaveBalances" on public."LeaveBalances"
      for insert to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'LeaveBalances'
      and policyname = 'Authenticated update LeaveBalances'
  ) then
    create policy "Authenticated update LeaveBalances" on public."LeaveBalances"
      for update to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'LeaveBalances'
      and policyname = 'Authenticated delete LeaveBalances'
  ) then
    create policy "Authenticated delete LeaveBalances" on public."LeaveBalances"
      for delete to authenticated
      using (true);
  end if;
end;
$$;

alter table public."RateHistory" enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'RateHistory'
      and policyname = 'Authenticated select RateHistory'
  ) then
    create policy "Authenticated select RateHistory" on public."RateHistory"
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'RateHistory'
      and policyname = 'Authenticated insert RateHistory'
  ) then
    create policy "Authenticated insert RateHistory" on public."RateHistory"
      for insert to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'RateHistory'
      and policyname = 'Authenticated update RateHistory'
  ) then
    create policy "Authenticated update RateHistory" on public."RateHistory"
      for update to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'RateHistory'
      and policyname = 'Authenticated delete RateHistory'
  ) then
    create policy "Authenticated delete RateHistory" on public."RateHistory"
      for delete to authenticated
      using (true);
  end if;
end;
$$;

alter table public."Services" enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Services'
      and policyname = 'Authenticated select Services'
  ) then
    create policy "Authenticated select Services" on public."Services"
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Services'
      and policyname = 'Authenticated insert Services'
  ) then
    create policy "Authenticated insert Services" on public."Services"
      for insert to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Services'
      and policyname = 'Authenticated update Services'
  ) then
    create policy "Authenticated update Services" on public."Services"
      for update to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Services'
      and policyname = 'Authenticated delete Services'
  ) then
    create policy "Authenticated delete Services" on public."Services"
      for delete to authenticated
      using (true);
  end if;
end;
$$;

alter table public."Settings" enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Settings'
      and policyname = 'Authenticated select Settings'
  ) then
    create policy "Authenticated select Settings" on public."Settings"
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Settings'
      and policyname = 'Authenticated insert Settings'
  ) then
    create policy "Authenticated insert Settings" on public."Settings"
      for insert to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Settings'
      and policyname = 'Authenticated update Settings'
  ) then
    create policy "Authenticated update Settings" on public."Settings"
      for update to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Settings'
      and policyname = 'Authenticated delete Settings'
  ) then
    create policy "Authenticated delete Settings" on public."Settings"
      for delete to authenticated
      using (true);
  end if;
end;
$$;
```

#### אימות

- `setup_assistant_diagnostics()` מחזירה שורה לכל טבלה עם `has_table`, `rls_enabled`, `missing_policies[]` וקטע `delta_sql` שתוכלו להעתיק חזרה ל-SQL במידה שחסר משהו.
- האשף מציג את ה-`delta_sql` ומריץ את הבדיקות מחדש בכל לחיצה על כפתור האימות עד שכל הסמלים הופכים לירוקים.
4.  **הגדר את API runtime:**
    *   צור את `api/local.settings.json` עם התוכן הבא:
        ----------------------------------------------------------------
        {
          "IsEncrypted": false,
          "Values": {
            "APP_SUPABASE_URL": "https://<metadata-project>.supabase.co",
            "APP_SUPABASE_ANON_KEY": "public-anon-key",
            "APP_SUPABASE_SERVICE_ROLE": "service-role-key-with-org-access"
          }
        }
        ----------------------------------------------------------------
    *   בעת פריסה ל-Azure Static Web Apps, הוסף את אותם משתנים תחת הגדרות ה-API כדי ש-`/api/config` ישרת גם את הבוטסטרפ וגם את חיבורי הארגונים.
5.  **הרץ את אפליקציית הפיתוח:**
    -----------------------
    npm run electron:dev
    -----------------------
    פעולה זו תפעיל את האפליקציה בחלון דסקטופ עם טעינה חמה (hot-reloading). בחלון טרמינל נוסף הרץ `swa start http://localhost:5173 --api-location api` כדי לחשוף את פונקציית `/api/config` בסביבה מקומית.

### בנייה ל-Production

1.  **הרץ את פקודת הבנייה:**
    -----------------------
    npm run electron:build
    -----------------------
2.  פקודה זו תבצע:
    *   בנייה של אפליקציית ה-React לתיקיית `/dist`.
    *   אריזה של האפליקציה עם Electron לקובץ התקנה הפעלה.
3.  קובץ ההתקנה/האפליקציה הסופי ימוקם בתיקיית `/release` (שנוצרת מחוץ לתיקיית הפרויקט).

## 6. ניהול חופשות וחגים

מודול החופשות מרכז את כל כללי החגים, מכסות והספר הכפול כדי שכל חלקי המערכת יתבססו על אמת אחת.

### 6.1. הגדרות מנהל

- מסך **"חגים וימי חופשה"** תחת הגדרות עורכת את ה-JSON של `leave_policy` שתואר בסעיף 3.5.
- המתגים מוצגים עם הטקסטים: "אישור חצי יום", "היתרה יכולה לרדת למינוס", "כמות חריגה מימי החופש המוגדרים", "העברת יתרה לשנה הבאה" ו-"מקסימום להעברה".
- שורות חגים כוללות שם, טווח תאריכים ותגית מתוך:
  - `system_paid` → "חופשה בתשלום (על חשבון המערכת)" (אין ניכוי, השכר מסומן כמשולם על ידי הארגון).
  - `employee_paid` → "חופשה בתשלום" (ניכוי מהמכסה של העובד).
  - `unpaid` → "חופשה ללא תשלום".
  - `mixed` → "מעורב".
  - `half_day` → "חצי יום חופשה" (זמין רק כאשר חצי יום מאושר במדיניות).
- השמירה מתבצעת דרך ה-API המאובטח, שמבצע `upsert` בטבלת `Settings` כדי למנוע כפילויות מפתח.

### 6.2. מכסה לעובד ופרו-רייטה

- לכל עובד נוסף שדה `annual_leave_days`. הפונקציה `computeEmployeeLeaveSummary` מחשבת פרו-רייטה לפי `start_date` וכמות הימים שנותרו בלוח השנה.
- העברת יתרות לשנה הבאה מתבצעת אוטומטית כשהיא פעילה ומוגבלת ל-`carryover_max_days`.
- הנתונים המסוכמים כוללים `quota`, `used`, `carryIn`, `remaining` ו-`adjustments` להצגה אחידה בלוחות בקרה.

### 6.3. רישום ניצולים

- לשונית החופשות מציגה כעת מבט יתרות לקריאה בלבד עם שורות מתרחבות. פירוט ההיסטוריה מופיע בטבלה פנימית, וכל הקלט החדש
  (הקצאות או ניכויים) מתבצע דרך זרימת **Time Entry** הייעודית.
- בטופס Time Entry המתג "על חשבון המערכת" הוא המנגנון היחיד לסימון חג משולם; תיבות הבחירה מציגות כעת רק "חופשה בתשלום",
  "חופשה ללא תשלום" ו"חצי יום חופשה" לשיפור הבהירות.
- ניכוי יוצר `balance` שלילי ב-`LeaveBalances` עם `leave_type` כגון `usage_employee_paid` או `time_entry_leave_employee_paid`. הקצאה מוסיפה `balance` חיובי עם `leave_type='allocation'`.
- כאשר `allow_half_day` כבוי, הממשק חוסם ערכים שאינם שלמים. כאשר הוא פעיל, חגים מסוג חצי יום ממלאים אוטומטית `-0.5`.
- חריגה מעבר לגבול `negative_floor_days` נחסמת ומציגה את הטוסט **"חריגה ממכסה ימי החופשה המותרים"**.
- ימי `holiday_paid_system` מסומנים בטבלת השכר כמשולמים ללא יצירת רישום שלילי, כדי לשמור על התאמה עם סיכומי WorkSessions.

### 6.4. בוררי מידע משותפים

- `selectHolidayForDate(policy, date)` מאתר את כלל החג הרלוונטי לצורך חסימת תאריכים בתאריכון וסימון בטבלאות השכר.
- `selectLeaveRemaining(employeeId, date, context)` משתמש ב-`computeEmployeeLeaveSummary` ועליו להניע את מסכי העובדים, הדוחות והשכר כדי לשמור על יתרות זהות.
- אותן פונקציות מגובות בבדיקות יחידה שב-`test/leave.test.js` המגנות על חישובי הפרו-רייטה ועל אכיפת רצפת המינוס.

---

## 7. הנחיות לפיתוח

- **חוק הזהב – רק דרך ה-API המאובטח:** קוד Frontend **אסור** שיקרא ל-`dataClient.insert()`, `dataClient.update()` או כל פעולת כתיבה ישירה אחרת מול פרויקט Supabase של הלקוח. כל פעולת יצירה, עדכון או מחיקה חייבת להשתמש בפונקציית עזר מ-`src/api/` שפונה לנקודת קצה מאובטחת (`/api/...`) ומטפלת באימות, הרשאות ופענוח המפתח בצד השרת.

## עדכונים אחרונים

- מצב החופשה בהזנה מרובה משקף כעת את טופס היום הבודד: ניתן לבחור את כל סוגי החופשות, להגדיר חצי יום ולתאר את החצי השני, והכל נשמר דרך ה-hook המאוחד `useTimeEntry`.
- ניהול מדיניות חופשות מרוכז במסך הגדרות חדש, כולל תגיות חג ובקרות חריגה למינוס.
- יתרות חופשה נשענות על ספר התנועות `LeaveBalances` עם פרו-רייטה שנתית והגבלת carry-over.
- הדוחות וטבלת השכר משתמשים בבוררי החופשות המשותפים כדי לשמור על עקביות בין ימי חג משולמים ליתרות עובדים.
- הדוחות כוללים מסנן וטור "היקף משרה" שמופיעים רק כאשר ההגדרה `employment_scope_policy` מפעילה את סוגי העובדים הרלוונטיים.
- מסנני התאריכים בדוחות תומכים בהקלדה או בבחירה מהיומן ומכירים פורמטים מרובים.
- KPI השעות נספר רק עבור עובדים שעתיים, והמסנן כולל גם עובדים גלובליים.
- דו"ח הרישומים המפורטים מאפשר קיבוץ לפי סוג עובד עם סכומי ביניים.
- הצבירה לימים גלובליים מסתמכת כעת ישירות על `total_payment` של כל רישום ומחברת את כל הרישומים היומיים כדי למנוע תשלום כפול בימים מחולקים.
- טבלת הדוח החודשי מציגה כעת עמודת "תשלום חופשה" ייעודית הנשענת על סכום החופשות ששולמו לכל עובד.
- כרטיס "פעילות אחרונה" בלוח הבקרה משתמש כעת בעזר `getActivityDisplayDetails` כדי למפות את `entry_type` של רישומי עבודה לתוויות עבריות מדויקות עבור חופשות, התאמות ושירותי מדריכים, ומבדיל בין גרסאות תגיות: תגיות קו מתאר לפעילויות עבודה/מפגשים בצבע טורקיז או בצבע השירות, ותגיות מלאות בכחול/סגול עבור חופשות והתאמות.

## 8. סקירת חוויית משתמש – רישום זמן מאוחד

- ליישר אלמנטים מבניים בין טופס יום יחיד לחלון הרב-תאריכים (כותרות מקטעים משותפות, סדר כפתורים וקיבוץ שדות) כך שמנהלים יזהו מיד את אותו תהליך בכל ערוץ הזנה.
- להוסיף הסבר מוטמע כאשר מקטע גלובלי מחושב ל-₪0 (למשל בועה צפה או טקסט עזר לצד הסכום) כדי להבהיר שהיום כבר קיבל את מלוא התשלום ממקטע אחר או מחופשה בתשלום.
- להציג סיכום משולב ליום מעורב שמדגיש את החלק שנותר לתשלום לאחר בחירת חופשה בשני הזרמים, כדי לצמצם ניחושים לפני שמירת שילוב של חופשה ועבודה.
- לשפר את רשימת הבדיקה במצב רב-תאריכים כך שתדגיש שורות לא שלמות ותציע קפיצות מהירות לעריכה, ובכך להפחית מאמץ לפני שליחת אצוות גדולות.
- להציג משוב לאחר שמירה שמבדיל בין רישומים שנשמרו לבין כאלה שדולגו או נרשמו עם סכום אפס, כדי למנוע בלבול כאשר אצוות כוללות מקטעים ללא תשלום.

## 9. יצוא CSV של דוח רישומים

### 8.1 סכמת יצוא מפורטת (גרסת דסקטופ)

דף הדוחות מייצר כעת קובצי CSV באמצעות שרשרת טרנספורמציה ייעודית שמיישבת רשומות עובדים, שירותים, תוויות היקף משרה ומידע על חופשות לפני סדרת הערכים, כולל הוספת סימן BOM ל-UTF-8 לטובת תאימות עם Excel. השורות ממוינות לפי תאריך העבודה (מהישן לחדש) כדי להקל על בדיקה כרונולוגית במצב אופליין.

| כותרת עמודה (עברית) | שדות מקור | כללי תוכן |
| :--- | :--- | :--- |
| שם העובד | `WorkSession.employee_id` → `Employee.name` | נופל חזרה ל"לא ידוע" כאשר רשומת העובד חסרה. |
| מספר עובד | `Employee.employee_id` | נשאר ריק אם לא הוגדר מזהה פנימי. |
| סוג עובד | `Employee.employee_type` | ממופה בעזרת `EMPLOYEE_TYPE_LABELS` ("שעתי", "גלובלי", "מדריך"); ריק אם הסוג לא ידוע. |
| היקף משרה | עזרי היקף משרה של העובד | משתמש ב-`getEmploymentScopeValue` + `getEmploymentScopeLabel`; ריק כאשר העמודה מושבתת או לא הוגדר ערך. |
| תאריך | `WorkSession.date` | מפורמט כ-`DD/MM/YYYY` באמצעות `date-fns`. |
| יום בשבוע | `WorkSession.date` | מוצג בעזרת הלוקאל העברי (למשל "יום שני"). |
| סוג רישום | `WorkSession.entry_type` | סוגי חופשה ממופים דרך `HOLIDAY_TYPE_LABELS`; סוגים אחרים מקבלים תוויות מקומיות (שעות, מפגשים, התאמות) עם "רישום אחר" כברירת מחדל. |
| תיאור / שירות | `WorkSession.entry_type`, `service_id` | חופשות משתמשות בתווית החופשה, רישומי מפגש מציגים את שם השירות ("שירות לא ידוע" כברירת מחדל), ושאר הסוגים מציגים "עבודה שעתית". |
| שעות | `WorkSession.hours` | מוצג רק לעובדים שעתיים/גלובליים עם `entry_type === 'hours'`; מספרים נשמרים כשלמים או עם שתי ספרות עשרוניות. |
| מספר מפגשים | `WorkSession.sessions_count` | מאוכלס רק כאשר `entry_type === 'session'`. |
| מספר תלמידים | `WorkSession.students_count` | מאוכלס רק עבור רישומי מפגש. |
| תעריף | `WorkSession.rate_used` | נכתב עם שתי ספרות עשרוניות כאשר הערך מספרי; אחרת נשאר ריק. |
| סה"כ לתשלום | `WorkSession.total_payment` | נכתב עם שתי ספרות עשרוניות כאשר הערך מספרי; אחרת נשאר ריק. |
| הערות | `WorkSession.notes` | טקסט חופשי; ריק כאשר אין הערה. |

