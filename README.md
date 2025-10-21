# TutTiud

TutTiud הוא יישום SaaS לניהול ותיעוד פגישות מודרכות בארגוני בריאות ורווחה. הפרויקט נבנה באמצעות Vite, React, Tailwind CSS, ו-Supabase.

## Prerequisites

- Node.js 20+
- npm 10+

## Getting Started

1. התקן תלויות:
   ```bash
   npm install
   ```
2. העתק את קובץ ההגדרות והשלם את הפרטים מסביבת Supabase:
   ```bash
   cp .env.example .env.local
   ```
3. עדכן את המפתחות `VITE_SUPABASE_URL` ו-`VITE_SUPABASE_ANON_KEY` בקובץ החדש.
4. הפעל את סביבת הפיתוח:
   ```bash
   npm run dev
   ```
5. פתח את הדפדפן בכתובת [http://localhost:5173](http://localhost:5173).

## Available Scripts

- `npm run dev` – מפעיל את סביבת הפיתוח.
- `npm run build` – בונה את היישום לפרודקשן.
- `npm run preview` – מציג תצוגה מקדימה של הבנייה.
- `npm run lint` – מפעיל את ESLint על כל הקבצים.

## Project Structure

```
src/
  app/            # הגדרות ניתוב, פרוביידרים ופריסת האפליקציה
  components/     # רכיבי UI כולל בסיס shadcn/ui
  hooks/          # הוקים לשימוש חוזר (למשל אחסון מקומי)
  lib/            # כלים ולקוחות לשימוש בשכבות נמוכות
  pages/          # עמודים ורכיבי ניתוב ברמת מסך
  types/          # טיפוסים משותפים
```

## RTL & Hebrew Support

- הממשק מוגדר בברירת המחדל לכיוון RTL עם גופנים ידידותיים לעברית.
- כל המסכים הראשוניים מוצגים בשפה העברית.

## Supabase Configuration

היישום עושה שימוש ב-`@supabase/supabase-js` בלבד. יש להגדיר מפתחות אנונימיים ברמת ה-Front-End בלבד. מפתחות בעלי הרשאות כתיבה חייבים להיות מאוחסנים בצד השרת ולהיחשף באמצעות API מאובטח בלבד.

## 🔧 Azure Deployment: Environment Variables

> `.env.local` נועד לסביבת פיתוח מקומית בלבד. בסביבת Azure Static Web Apps יש להגדיר את משתני `VITE_*` דרך הגדרות הענן כדי שיקומפלו בזמן הבנייה.

- עבור פיתוח מקומי: ערוך את הקובץ `.env.local` והזן את הערכים הדרושים.
- עבור פריסה ב-Azure: היכנס אל **Azure Portal → Static Web App → Configuration → Application settings** והוסף שם את המשתנים הבאים, או עדכן אותם בקובץ ה-Workflow של GitHub ש-Azure יוצר (`azure-static-web-apps.yml`).
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- לאחר כל שינוי במשתנים יש לבצע Redeploy (או להריץ מחדש את ה-Workflow) כדי שהשינויים ייכנסו לבילד.

למידע מפורט נוסף וצילומי מסך, ראה/י את מדריך ההקמה המלא בקובץ [`ProjectDocs/setup.md`](ProjectDocs/setup.md#azure-static-web-apps) המתעד גם בעברית וגם באנגלית את תהליך ההזנה של משתני Azure.

## אשף ההקמה (Setup Wizard)

- בעמוד `Setup Wizard` נטענות הגדרות הארגון מטבלת `org_settings`, כולל סטטוס החיבור (`metadata.connections.tuttiud`) והמפתח הייעודי (`metadata.credentials.tuttiudAppJwt`), כדי להבין אם נדרשת הכנה ידנית.
- ארגון שלא סומן כ־`"connected"` מקבל מסלול מודרך שמתחיל ב**שלב 0**: צ'ק-ליסט מונחה לחשיפת הסכימה tuttiud, להרצת סקריפט ההכנה הרשמי (גרסה 2.1) ולהעתקת ערך `APP_DEDICATED_KEY`. לחצן "סיימתי את ההכנה" נפתח רק לאחר שכל תיבה סומנה, כדי לוודא שהמשתמש עבר על כל ההוראות.
- **שלב 1** אוסף את ערך `APP_DEDICATED_KEY` שנוצר בסוף הסקריפט ושולח אותו לפונקציית Azure המאובטחת (`/api/store-tuttiud-app-key`) שמצפינה את המפתח, שומרת אותו בעמודת `organizations.dedicated_key_encrypted`, ומעדכנת את `org_settings.metadata` ללא חשיפת המפתח ל-Front-End.
- **שלב 2** נשלט בידי המשתמש: רק לאחר לחיצה על "בדיקת החיבור" מתבצעת קריאה ל-`tuttiud.setup_assistant_initialize`. אם המערכת כבר מסומנת כ־`"connected"`, האשף מדלג על ההתחול וממשיך לשלב הבא.
- **שלב 3** ו-**שלב 4** נשארו אוטומטיים: אימות מבנה (`setup_assistant_schema_status`) עם אפשרות להריץ `setup_assistant_run_bootstrap`, ולבסוף דיאגנוסטיקה (`setup_assistant_diagnostics`) עם הנחיות ידידותיות.
- מסך בחירת הארגון מפנה לאשף כאשר הסטטוס אינו `"connected"`, והאשף מעדכן את המטא־דאטה באמצעות `updateTuttiudConnectionStatus` לאחר שכל השלבים עוברים בהצלחה.

## שכבת BFF מאובטחת (Azure Functions)

- הפונקציה `/api/store-tuttiud-app-key` מחייבת כעת אימות משתמש, מצפינה את מפתח היישום ושומרת אותו בעמודת `organizations.dedicated_key_encrypted` רק עבור מנהלים ובעלי מערכת.
- נוספו שלושה קצות API ייעודיים הפועלים מול מסד הנתונים הייעודי של הארגון בסכימת `tuttiud`:
  - `GET /api/students` – מחזיר את התלמידים המשויכים למדריך המחובר.
  - `POST /api/session-records` – יוצר תיעוד מפגש חדש לאחר וידוא שהמדריך אכן משויך לתלמיד שנבחר.
  - `GET /api/backup` – מפיק קובץ גיבוי מלא של הטבלאות המרכזיות וזמין למנהלים/בעלים בלבד.
- כל הפונקציות מאמתות את המשתמש מול ה-Control DB, מפענחות את מפתח היישום דרך משתנה הסביבה `APP_ORG_CREDENTIALS_ENCRYPTION_KEY`, ומבצעות פעולות בלעדית בסכימת `tuttiud` בהתאם למדיניות ה־schema.

## חוויית משתמש חדשה במודולים הראשיים

- בעמוד "התלמידים שלי" מוצג כעת כרטיס חכם לכל תלמיד משויך עם אפשרות לרענון וריצת תהליך יצירת מפגש חדש.
- עמוד "יצירת תיעוד מפגש" (Step-by-step) מנחה את המדריך לבחור תלמיד, לבחור תאריך ולתעד את תוכן המפגש, תוך שימוש ב־API המאובטח.
- עמוד "גיבוי נתונים" מאפשר למנהלים להפיק קובץ JSON מאובטח להורדה עם כל הנתונים החיוניים.
- ה־Landing Page מציג קישורים מהירים ואבני דרך לעבודה השוטפת לאחר ההגדרה הראשונית.

## Documentation

- מסמכי תהליך ורקע נוספים זמינים תחת התיקייה `ProjectDocs/` (עברית ואנגלית).
- מדריך הקמה מלא (Setup) זמין בקובץ [`ProjectDocs/setup.md`](ProjectDocs/setup.md) וכולל הוראות מפורטות באנגלית ועברית לפריסה ותחזוקה.
- הנחיות עבור סוכני AI זמינות בקובץ `AGENTS.md` בשורש המאגר.

## License

© TutTiud. כל הזכויות שמורות.
