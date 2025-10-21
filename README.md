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

- עבור פונקציות ה-Azure (Function App): היכנס אל **Azure Portal → Function App → Configuration → Application settings** והוסף את המשתנים הבאים עם הערכים מה-Control DB ומהמערכת המארחת.
  - `SUPABASE_URL` – כתובת ה-Control DB לשימוש עם מפתח ה-Service Role.
  - `SUPABASE_SERVICE_ROLE_KEY` – מפתח ה-Service Role של Supabase שמאפשר לפונקציות להפעיל RPC מאובטח.
  - `APP_ORG_CREDENTIALS_ENCRYPTION_KEY` – סוד סימטרי להצפנת מפתח היישום של כל ארגון.
- לאחר שמירת המשתנים לחץ על **Save** ו-**Restart** כדי שהפונקציות ייטענו מחדש עם ההגדרות החדשות. ללא שלושת הערכים הללו פונקציית `/api/store-tuttiud-app-key` תחזיר הודעת שגיאה ולא תשמור את המפתח.

למידע מפורט נוסף וצילומי מסך, ראה/י את מדריך ההקמה המלא בקובץ [`ProjectDocs/setup.md`](ProjectDocs/setup.md#azure-static-web-apps) המתעד גם בעברית וגם באנגלית את תהליך ההזנה של משתני Azure.

## אשף ההקמה (Setup Wizard)

- בעת הטעינה האשף פונה ל-`/api/setup-status` (פונקציית Azure חדשה) כדי לבדוק אם קיים ערך מוצפן בעמודת `organizations.dedicated_key_encrypted`. התוצאה קובעת אם המשתמש יראה מסלול "חדש" או "חוזר".
- אם נמצא מפתח שמור, מוצג כרטיס "ברוכים השבים" וכפתור "אימות ההגדרה". לחיצה עליו מריצה את `/api/verify-tuttiud-setup`, שמפענחת את המפתח הקיים ומריצה את `tuttiud.setup_assistant_diagnostics` לפני המשך הבדיקות.
- ארגון חדש (ללא מפתח שמור) ממשיך למסלול המלא: **שלב 0** מציג צ'ק-ליסט חשיפה/סקריפט/העתקת המפתח וייפתח רק לאחר שכל המשימות סומנו. **שלב 1** מאפשר להדביק את `APP_DEDICATED_KEY` ולשמור אותו דרך `/api/store-tuttiud-app-key` (שמעדכנת גם את `org_settings.metadata`).
- אם אימות המפתח הקיים נכשל, האשף מחזיר את המשתמש לשלבי ההכנה אך מותיר רק את פעולת הרצת הסקריפט (המערכת מזכירה שהמפתח כבר שמור ולכן לא מוצג שלב הזנה נוסף).
- **שלב 2** מאחד את שני העולמות: ארגונים חוזרים מריצים אימות בלבד בעוד ארגונים חדשים מריצים `setup_assistant_initialize`. לאחר מכן מתבצעים תמיד בדיקות ה-`schema_status` והדיאגנוסטיקה, ולבסוף `updateTuttiudConnectionStatus` מסמן את החיבור כ-`connected` כאשר כל השלבים מצליחים.
- מסך בחירת הארגון עדיין מפנה לאשף כאשר `metadata.connections.tuttiud` אינו `"connected"`, כך שאף ארגון לא מדלג בטעות על המסלול המתאים לו.

## שכבת BFF מאובטחת (Azure Functions)

- הפונקציה `/api/store-tuttiud-app-key` מחייבת כעת אימות משתמש, מצפינה את מפתח היישום ושומרת אותו בעמודת `organizations.dedicated_key_encrypted` רק עבור מנהלים ובעלי מערכת.
- פונקציות `/api/setup-status` ו-`/api/verify-tuttiud-setup` מריצות את בדיקות ההקמה הראשוניות ומאפשרות לאשף להבדיל בין ארגונים חדשים לחוזרים.
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
