# TutTiud Setup Guide | מדריך הקמה למערכת TutTiud

> **Important / חשוב**: השלבים הבאים מתארים הקמה של סביבת TutTiud מלאה הכוללת חיבור ל-Supabase ופריסה ב-Azure Static Web Apps. ודא/י שכל הערכים הרגישים נשמרים באופן מאובטח ושההרשאות תואמות את מדיניות הארגון שלך.

## 1. Prerequisites | דרישות מוקדמות

### English
- **Azure Static Web Apps account** with permissions to create an app.
- **Active Supabase project** that will host the tuttiud schema for each tenant organization.
- **Control DB** (central) that includes the tables: `organizations`, `org_memberships`, `org_invitations`, and related identity metadata.
- **Supabase JWT Secret** for the Control DB environment to sign secure tokens. Store it outside source control.

### עברית
- **חשבון Azure Static Web Apps** עם הרשאות ליצירת אפליקציה.
- **פרויקט Supabase פעיל** שישמש כבסיס הנתונים של TutTiud.
- **מסד נתונים מרכזי Control DB** עם הטבלאות `organizations`, `org_memberships`, `org_invitations` וכו'.
- **Supabase JWT Secret** – יש להגדיר במשתני הסביבה ולשמור מחוץ למאגר הקוד.

## 2. Azure Static Web Apps | הגדרת Azure Static Web Apps

### English
1. Sign in to the [Azure Portal](https://portal.azure.com/) and create a **Static Web App**.
2. Choose **GitHub** as the deployment source (recommended for automatic CI/CD from this repository).
3. Configure the build template:
   - **Framework**: React
   - **App location**: `/`
   - **Output location**: `dist`
   - **API location**: *(leave blank)*
4. Complete the wizard and allow Azure to provision the resource. The GitHub workflow that Azure generates will run `npm install`, `npm run build`, and deploy the `dist` folder automatically.

### עברית
1. היכנס/י אל [Azure Portal](https://portal.azure.com/) וצר/י **Static Web App** חדש.
2. בחר/י ב־**GitHub** כמקור פריסה (מומלץ עבור CI/CD אוטומטי מהמאגר).
3. הגדר/י את תבנית הבנייה:
   - **Framework**: React
   - **App location**: `/`
   - **Output location**: `dist`
   - **API location**: השאר ריק
4. השלם/י את האשף ואפשר/י ל-Azure להקים את המשאב. ה-Workflow ש-Azure יוצר יריץ אוטומטית `npm install`, `npm run build`, ויפרס את תיקיית `dist`.

## 3. Control DB Record | הוספת רשומה ל-Control DB

### English
1. Connect to the Control DB (Supabase or another managed Postgres instance).
2. Insert a new row into `organizations` with the following fields:
   - `name`: Human-friendly organization name (e.g., "חוות תות").
   - `supabase_url`: The URL of the tenant Supabase project.
   - `supabase_anon_key`: The anonymous key for that tenant.
3. Ensure the onboarding admin user exists in `org_memberships` and is linked to the new organization (typically via the `user_id` column).
4. If invitations are required, create matching rows in `org_invitations` referencing the same organization ID.

### עברית
1. התחבר/י ל-Control DB (בין אם ב-Supabase או ב-Postgres מנוהל אחר).
2. הוסף/י רשומה חדשה לטבלה `organizations` עם השדות הבאים:
   - `name`: שם ארגון קריא (לדוגמה: "חוות תות").
   - `supabase_url`: כתובת ה-Supabase של הארגון.
   - `supabase_anon_key`: המפתח האנונימי של אותו ארגון.
3. ודא/י שלמשתמש המוגדר להקמה יש רשומה ב-`org_memberships` המשויכת לארגון החדש (דרך `user_id`).
4. במידת הצורך, צר/י גם הזמנות בטבלת `org_invitations` עבור אותו ארגון.

## 4. Secrets & Environment | סודות והגדרות סביבה

### English
1. Duplicate the example environment file:
   ```bash
   cp .env.example .env.local
   ```
2. Set the required variables:
   ```ini
   VITE_SUPABASE_URL="https://<control-project>.supabase.co"
   VITE_SUPABASE_ANON_KEY="<control-anon-key>"
   ```
3. Add additional secrets (such as service-role keys) only in server-side environments. Do **not** commit them to the repository.
4. In each tenant Supabase project, create an `app_user` role (or dedicated service role) that owns the `tuttiud` schema objects. The SQL should be executed via the Supabase SQL editor or through secure migrations.
5. Run the TutTiud Setup Wizard after authentication to bootstrap or validate the schema.

#### Azure Static Web Apps

- `.env.local` is **only** for local development machines. For production deployments on Azure Static Web Apps, configure the same `VITE_*` variables inside the Azure Portal: **Static Web App → Configuration → Application settings**.
- Alternatively, commit the variables to the generated GitHub workflow (`azure-static-web-apps.yml`) under the `env:` block so each build receives them securely.
- Required keys:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- After updating the values, trigger a redeploy (rerun the GitHub Action) so the build picks up the changes.
- See the [Azure Deployment section in the README](../README.md#-azure-deployment-environment-variables) for a quick reference.

### עברית
1. שכפל/י את קובץ הסביבה לדוגמה:
   ```bash
   cp .env.example .env.local
   ```
2. הגדר/י את המשתנים הנדרשים:
   ```ini
   VITE_SUPABASE_URL="https://<control-project>.supabase.co"
   VITE_SUPABASE_ANON_KEY="<control-anon-key>"
   ```
3. סודות נוספים (כגון service-role) יש לשמור רק בצד השרת ולא במאגר הקוד.
4. בכל פרויקט Supabase של דייר, צור/י משתמש `app_user` (או role ייעודי) שישמש כבעלים של עצמי סכימת `tuttiud`. הרצת ה-SQL תתבצע דרך Supabase SQL Editor או תהליך מיגרציות מאובטח.
5. לאחר ההתחברות, הרץ/י את Setup Wizard של TutTiud כדי לאתחל או לוודא את תקינות הסכמה.

#### Azure Static Web Apps

- הקובץ `.env.local` מיועד **רק** לפיתוח מקומי. בפריסות Production של Azure Static Web Apps יש להזין את משתני `VITE_*` ישירות ב-Azure: **Static Web App → Configuration → Application settings**.
- לחלופין ניתן להגדיר את הערכים בקובץ ה-Workflow ש-Azure יוצר (`azure-static-web-apps.yml`) תחת המקטע `env:` כדי שירוצו באופן מאובטח בכל Build.
- משתנים חובה:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- לאחר שינוי הערכים יש להריץ Redeploy (או להפעיל מחדש את ה-GitHub Action) כדי שהשינויים ייכנסו לבנייה.
- לעיון נוסף, ראה/י את [סעיף Azure ב-README](../README.md#-azure-deployment-environment-variables) לקבלת תקציר מהיר והקשר נוסף.

## 5. Verification & Testing | בדיקה ואימות

### English
1. Install dependencies and start the development server:
   ```bash
   npm install
   npm run dev
   ```
2. Open [http://localhost:5173](http://localhost:5173) and authenticate using a Control DB user that has access to the organization you added.
3. Navigate to the **Setup Wizard** page. The wizard will:
   - Validate the Supabase connection using organization settings.
   - Check whether the `tuttiud` schema exists.
   - Offer to run the schema bootstrap if it is missing.
   - Execute `setup_assistant_diagnostics()` (if available) to highlight missing tables, RLS policies, or permissions issues.
4. If diagnostics report issues, follow the SQL remediation guidance shown on screen and rerun the checks until all statuses are green.

### עברית
1. התקן/י תלויות והפעל/י את שרת הפיתוח:
   ```bash
   npm install
   npm run dev
   ```
2. פתח/י את [http://localhost:5173](http://localhost:5173) והתחבר/י עם משתמש Control DB שיש לו גישה לארגון שהוספת.
3. נווט/י לעמוד **Setup Wizard**. האשף:
   - יאמת את החיבור ל-Supabase על סמך הגדרות הארגון.
   - יבדוק האם קיימת סכימה `tuttiud`.
   - יציע להריץ את תהליך האתחול אם הסכמה חסרה.
   - יריץ את `setup_assistant_diagnostics()` (אם קיימת) ויציג טבלאות חסרות, מדיניות RLS חסרה או בעיות הרשאות.
4. אם יש שגיאות, עקוב/י אחר הוראות ה-SQL שמוצגות במסך וחזור/י על הבדיקות עד שכל השלבים מסומנים כתקינים.

---

🔄 אם חלק מהשלבים אינם מתאימים למבנה הארגון שלך או דורשים הרשאות נוספות, מומלץ לפרק את התהליך לתת-משימות ולתעד כל חריגה לצורך מעקב. / If any step cannot be completed in one run, break it down into follow-up tasks and document the remaining work for future prompts.
