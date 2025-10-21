const DEFAULT_ERROR_MESSAGE = 'אירעה שגיאה לא צפויה.';

export class SupabaseHttpError extends Error {
  constructor(message, { status = null, code = null } = {}) {
    super(message);
    if (status !== null && status !== undefined) {
      this.status = status;
    }
    if (code !== null && code !== undefined) {
      this.code = code;
    }
  }
}

export function asError(value, fallbackMessage = DEFAULT_ERROR_MESSAGE) {
  if (value instanceof Error) {
    return value;
  }

  if (value && typeof value === 'object') {
    const message = typeof value.message === 'string' && value.message.trim()
      ? value.message
      : fallbackMessage;
    return new Error(message);
  }

  if (typeof value === 'string' && value.trim()) {
    return new Error(value);
  }

  return new Error(fallbackMessage);
}

export class MissingRuntimeConfigError extends Error {
  constructor(message = 'טעינת ההגדרות נכשלה. ודא שפונקציית /api/config זמינה ומחזירה JSON תקין.') {
    const finalMessage = message === undefined || message === null ? undefined : message;
    super(finalMessage ?? 'טעינת ההגדרות נכשלה. ודא שפונקציית /api/config זמינה ומחזירה JSON תקין.');
  }
}
