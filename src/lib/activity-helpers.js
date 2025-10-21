import { HOLIDAY_TYPE_LABELS, inferLeaveType, isLeaveEntryType } from '@/lib/leave.js';

const DEFAULT_ACTIVITY_LABEL = 'שעות עבודה';
const DEFAULT_ACTIVITY_COLOR = '#0F766E';
const ADJUSTMENT_LABEL = 'התאמה';
const ADJUSTMENT_ACTIVITY_COLOR = '#7C3AED';
const FALLBACK_LEAVE_LABEL = 'חופשה';
const LEAVE_ACTIVITY_COLOR = '#2563EB';
const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function normalizeColor(color) {
  if (typeof color === 'string') {
    const trimmed = color.trim();
    if (HEX_COLOR_PATTERN.test(trimmed)) {
      return trimmed;
    }
  }

  return DEFAULT_ACTIVITY_COLOR;
}

function buildDefaultDisplay() {
  return { label: DEFAULT_ACTIVITY_LABEL, color: DEFAULT_ACTIVITY_COLOR, variant: 'outline' };
}

export function getActivityDisplayDetails(workSession) {
  if (!workSession || typeof workSession !== 'object') {
    return buildDefaultDisplay();
  }

  const entryType = workSession.entry_type;

  if (isLeaveEntryType(entryType)) {
    const leaveType = inferLeaveType(workSession);
    const leaveLabel = leaveType ? HOLIDAY_TYPE_LABELS[leaveType] : null;
    return {
      label: leaveLabel || FALLBACK_LEAVE_LABEL,
      color: LEAVE_ACTIVITY_COLOR,
      variant: 'solid',
    };
  }

  if (entryType === 'adjustment') {
    return {
      label: ADJUSTMENT_LABEL,
      color: ADJUSTMENT_ACTIVITY_COLOR,
      variant: 'solid',
    };
  }

  const employeeType = workSession.employee?.employee_type || workSession.employee_type;

  if (entryType === 'session') {
    const serviceName = workSession.service?.name || workSession.service_name;
    const serviceColor = workSession.service?.color || workSession.service_color;
    return {
      label: serviceName || DEFAULT_ACTIVITY_LABEL,
      color: normalizeColor(serviceColor),
      variant: 'outline',
    };
  }

  if (entryType === 'hours') {
    const serviceName = workSession.service?.name || workSession.service_name;
    if (employeeType === 'instructor' && serviceName) {
      return {
        label: serviceName,
        color: DEFAULT_ACTIVITY_COLOR,
        variant: 'outline',
      };
    }

    return {
      label: DEFAULT_ACTIVITY_LABEL,
      color: DEFAULT_ACTIVITY_COLOR,
      variant: 'outline',
    };
  }

  if (employeeType === 'instructor') {
    const serviceName = workSession.service?.name || workSession.service_name;
    if (serviceName) {
      const serviceColor = workSession.service?.color || workSession.service_color;
      return {
        label: serviceName,
        color: normalizeColor(serviceColor),
        variant: 'outline',
      };
    }
  }

  return buildDefaultDisplay();
}
