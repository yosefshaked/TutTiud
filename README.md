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

## Documentation

- מסמכי תהליך ורקע נוספים זמינים תחת התיקייה `ProjectDocs/` (עברית ואנגלית).
- הנחיות עבור סוכני AI זמינות בקובץ `AGENTS.md` בשורש המאגר.

## License

© TutTiud. כל הזכויות שמורות.
