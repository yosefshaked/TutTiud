// src/lib/colorUtils.js

// פלטת הצבעים הראשית של האפליקציה
const COLORS = [
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#06B6D4', // Cyan
];

// הפונקציה החכמה שלנו
export const getColorForService = (serviceId) => {
  // אם אין ID (למשל, עבודה שעתית), החזר צבע ברירת מחדל
  if (!serviceId) {
    return '#3B82F6'; // תמיד כחול לעבודה שעתית
  }

  // המרת ה-ID למספר קבוע (hashing)
  let hash = 0;
  for (let i = 0; i < serviceId.length; i++) {
    const char = serviceId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // בחירת צבע מהפלטה על בסיס ה-hash
  // אנחנו מתחילים מהצבע השני בפלטה, כי הראשון שמור לעבודה שעתית
  const index = Math.abs(hash) % (COLORS.length - 1);
  return COLORS[index + 1];
};