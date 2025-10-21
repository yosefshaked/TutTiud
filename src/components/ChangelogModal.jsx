import React, { useEffect } from 'react';

export default function ChangelogModal({ open, onClose }) {
  // סגירה עם ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="changelog-title"
      onClick={(e) => {
        // סגירה בלחיצה מחוץ לקופסה
        if (e.target === e.currentTarget) onClose?.();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(2,6,23,0.25)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 16,
          boxShadow: '0 10px 30px rgba(2,6,23,0.2)',
          width: 'min(90vw, 860px)',
          height: 'min(85vh, 640px)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 18,
            left: 18,
            background: 'transparent',
            border: 'none',
            fontSize: 22,
            color: '#64748b',
            cursor: 'pointer',
            zIndex: 10001,
          }}
          aria-label="סגור עדכונים"
        >
          ×
        </button>

        <h2
          id="changelog-title"
          style={{ fontSize: 22, fontWeight: 700, color: '#2563eb', marginBottom: 18 }}
        >
          עדכונים במערכת
        </h2>

        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#334155', fontSize: 17 }}>

          {/* 1.3.0 */}
          <li className="mb-4" dir="rtl" style={{ marginBottom: 20, textAlign: 'right' }}>
            <article className="space-y-3">
              <header>
                <h1 className="font-bold text-lg" style={{ fontWeight: 700, fontSize: 18, margin: 0 }}>
                  <time dateTime="2025-09-08">08/09/2025</time> – גרסה 1.3.0
                </h1>
              </header>
              <section>
                <ul className="list-disc pr-5 space-y-1" style={{ paddingRight: 18, margin: 0 }}>
                  <li>הוספת טבלה לניהול רישום הזמנים</li>
                  <li>תיקון באגים.</li>
                </ul>
              </section>
            </article>
          </li>

          {/* 1.2.1 */}
          <li className="mb-4" dir="rtl" style={{ marginBottom: 20, textAlign: 'right' }}>
            <article className="space-y-3">
              <header>
                <h1 className="font-bold text-lg" style={{ fontWeight: 700, fontSize: 18, margin: 0 }}>
                  <time dateTime="2025-09-08">08/09/2025</time> – גרסה 1.2.1
                </h1>
              </header>
              <section>
                <ul className="list-disc pr-5 space-y-1" style={{ paddingRight: 18, margin: 0 }}>
                  <li>חיפוש בדף העובדים כעת מוצא אם רשמתם בטעות באנגלית.</li>
                  <li>תיקון באגים.</li>
                </ul>
              </section>
            </article>
          </li>

          {/* 1.2.1 */}
          <li className="mb-4" dir="rtl" style={{ marginBottom: 20, textAlign: 'right' }}>
            <article className="space-y-3">
              <header>
                <h1 className="font-bold text-lg" style={{ fontWeight: 700, fontSize: 18, margin: 0 }}>
                  <time dateTime="2025-09-08">08/09/2025</time> – גרסה 1.2.1
                </h1>
              </header>
              <section>
                <ul className="list-disc pr-5 space-y-1" style={{ paddingRight: 18, margin: 0 }}>
                  <li>חיפוש בדף העובדים כעת מוצא אם רשמתם בטעות באנגלית.</li>
                  <li>תיקון באגים.</li>
                </ul>
              </section>
            </article>
          </li>
          
          {/* 1.2.0 */}
          <li className="mb-4" dir="rtl" style={{ marginBottom: 20, textAlign: 'right' }}>
            <article className="space-y-3">
              <header>
                <h1 className="font-bold text-lg" style={{ fontWeight: 700, fontSize: 18, margin: 0 }}>
                  <time dateTime="2025-09-08">08/09/2025</time> – 🚀 גרסה 1.2.0 זמינה!
                </h1>
              </header>
              <section>
                <ul className="list-disc pr-5 space-y-1" style={{ paddingRight: 18, margin: 0 }}>
                  <li>הסברים בעברית במדדים ודוחות.</li>
                  <li>אזהרה כשנבחר חודש חלקי - לתשומת לב כאשר נדרשים חישובים מדויקים יותר.</li>
                  <li>תווית "התאמה" בפעילות אחרונה.</li>
                  <li>גרפי מדריכים בצבעי שירותים.</li>
                  <li>חישובים חודשיים מדויקים יותר (תשלומים, מגמות, דוחות, סיכומי שכר).</li>
                  <li>תיקוני באגים ושיפורי תוויות בעברית.</li>
                </ul>
              </section>
            </article>
          </li>

          {/* 1.1.0 */}
          <li className="mb-4" dir="rtl" style={{ marginBottom: 20, textAlign: 'right' }}>
            <article className="space-y-3">
              <header>
                <h1 className="font-bold text-lg" style={{ fontWeight: 700, fontSize: 18, margin: 0 }}>
                  <time dateTime="2025-09-07">07/09/2025</time> – ✨ גרסה 1.1.0
                </h1>
              </header>
              <section>
                <ul className="list-disc pr-5 space-y-1" style={{ paddingRight: 18, margin: 0 }}>
                  <li>סוג עובד חדש – "גלובלי" עם שכר חודשי קבוע.</li>
                  <li>דף התאמות שכר: יכולת ניכוי וזיכוי/בונוס לעובדים.</li>
                  <li>תצוגת טבלת עובדים מקצועית עם קיפול/פתיחת תעריפי מדריכים + "פתח/סגור הכל".</li>
                  <li>בסיס לניהול חופשות (LeaveBalances). יכולת בפיתוח.</li>
                  <li>שיפור לדיוק היסטוריית השכר והפעולות.</li>
                  <li>תיקוני באגים קטנים ושיפורי ממשק.</li>
                </ul>
              </section>
            </article>
          </li>

          {/* 1.0.0 (כפי שהיה בקוד שלך) */}
          <li className="mb-4" dir="rtl" style={{ marginBottom: 0, textAlign: 'right' }}>
            <article className="space-y-3">
              <header>
                <h1 className="font-bold text-lg" style={{ fontWeight: 700, fontSize: 18, margin: 0 }}>
                  <time dateTime="2025-09-07">07/09/2025</time> – 🎉 ברוכים הבאים לגרסה 1.0.0 של מערכת ניהול עובדים ושכר!
                </h1>
                <p style={{ marginTop: 6, marginBottom: 10 }}>
                  זוהי ההשקה הרשמית של המערכת החדשה, שנבנתה כדי להחליף את קובצי ה־Excel
                  המורכבים ולאפשר עבודה פשוטה, מדויקת ואמינה.
                </p>
              </header>

              <section>
                <h2 className="font-semibold" style={{ fontWeight: 600, fontSize: 16, margin: '6px 0' }}>
                  מה כולל בשלב זה:
                </h2>
                <ul className="list-disc pr-5 space-y-1" style={{ paddingRight: 18, margin: 0 }}>
                  <li>📋 ניהול עובדים לפי סוג העסקה (שעתי / מדריך לפי שיעור)</li>
                  <li>💰 הגדרת תעריפים דינמיים עם שמירת היסטוריה מלאה</li>
                  <li>🐎 ניהול סוגי שירותים ומעקב אחרי ביצועי מדריכים</li>
                  <li>📊 רישום שעות ושיעורים עם חישוב אוטומטי ושקיפות מלאה</li>
                  <li>🔎 דיווחים אינטראקטיביים עם שמירה על דיוק היסטורי</li>
                </ul>
              </section>

              <section>
                <h2 className="font-semibold" style={{ fontWeight: 600, fontSize: 16, margin: '10px 0 6px' }}>
                  מה חשוב לדעת:
                </h2>
                <ul className="list-disc pr-5 space-y-1" style={{ paddingRight: 18, margin: 0 }}>
                  <li>זוהי גרסת בסיס הראשונה – יתכנו עדכונים ושיפורים בהמשך.</li>
                  <li>הפידבק שלכם קריטי – כל רעיון, תקלה או שאלה יעזרו לשפר.</li>
                  <li>כל הנתונים נשמרים בצורה מאובטחת ונשענים על בסיס נתונים יציב (PostgreSQL + Supabase).</li>
                </ul>
              </section>
            </article>
          </li>
        </ul>
        </div>
      </div>
      </div>
    );
  }

