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
- ארגון שלא סומן כ־`"connected"` מקבל מסלול מודרך: שלב 1 מסביר כיצד לחשוף את סכימת tuttiud דרך Settings → API, מציג את סקריפט ההכנה הרשמי (גרסה 2.1) עם כפתור העתקה ומפרט את השלבים להרצה ב-Supabase.
- שלב 2 אוסף את הערך `APP_DEDICATED_KEY` שנוצר בסוף הסקריפט, שומר אותו במטא־דאטה של הארגון ומוודא שהמפתח קיים לפני כל בדיקה.
- שלב 3 נשלט בידי המשתמש: רק לאחר לחיצה על "בדיקת החיבור" מתבצעת קריאה ל-`tuttiud.setup_assistant_initialize`. אם המערכת כבר מסומנת כ־`"connected"`, האשף מדלג על ההתחול וממשיך הלאה.
- שלב 4 ו־שלב 5 נשארו אוטומטיים: אימות מבנה (`setup_assistant_schema_status`) עם אפשרות להריץ `setup_assistant_run_bootstrap`, ולבסוף דיאגנוסטיקה (`setup_assistant_diagnostics`) עם הנחיות ידידותיות.
- מסך בחירת הארגון מפנה לאשף כאשר הסטטוס אינו `"connected"`, והאשף מעדכן את המטא־דאטה באמצעות `updateTuttiudConnectionStatus` לאחר שכל השלבים עוברים בהצלחה.

## Documentation

- מסמכי תהליך ורקע נוספים זמינים תחת התיקייה `ProjectDocs/` (עברית ואנגלית).
- מדריך הקמה מלא (Setup) זמין בקובץ [`ProjectDocs/setup.md`](ProjectDocs/setup.md) וכולל הוראות מפורטות באנגלית ועברית לפריסה ותחזוקה.
- הנחיות עבור סוכני AI זמינות בקובץ `AGENTS.md` בשורש המאגר.

## License

© TutTiud. כל הזכויות שמורות.
