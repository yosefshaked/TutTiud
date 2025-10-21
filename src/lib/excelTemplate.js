function formatDate(today) {
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function downloadCsvTemplate() {
  const today = formatDate(new Date());
  const lines = [
    '# הוראות: מלאו את העמודות לפי הכותרות.',
    '# סוגי רישום מותרים: שיעור | שעות | התאמה | חופשה בתשלום',
    '# פורמט תאריך: DD/MM/YYYY',
    '# לעובד גלובלי אין להזין "שירות".',
    '# שורות המסומנות "(דוגמה)" הן למטרת המחשה — מחקו לפני העלאה.',
    'תאריך,סוג רישום,שירות,שעות,מספר שיעורים,מספר תלמידים,סכום התאמה,הערות',
    `${today},שעות,,8,,,,(דוגמה)`,
    `${today},שיעור,שם שירות לדוגמה,,1,1,,(דוגמה)`,
    `${today},חופשה בתשלום,,,,,,(דוגמה)`,
  ];
  const bom = '\ufeff';
  const csv = lines.join('\n');
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'תבנית-ייבוא-רישומים.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadExcelTemplate() {
  // Placeholder: real XLSX generation requires external library
  const today = formatDate(new Date());
  const lines = [
    '# קובץ זה בפורמט CSV לשימוש כתחליף ל-Excel במערכת הנוכחית.',
    'תאריך,סוג רישום,שירות,שעות,מספר שיעורים,מספר תלמידים,סכום התאמה,הערות',
    `${today},שעות,,8,,,,(דוגמה)`,
    `${today},שיעור,שם שירות לדוגמה,,1,1,,(דוגמה)`,
    `${today},חופשה בתשלום,,,,,,(דוגמה)`,
  ];
  const bom = '\ufeff';
  const csv = lines.join('\n');
  const blob = new Blob([bom + csv], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'תבנית-ייבוא-רישומים.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}
