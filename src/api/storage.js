import { features } from '@/features.js';

const disabledMetrics = Object.freeze({
  storageBytes: null,
  dbBytes: null,
  fetchedAt: null,
  errors: {},
  hints: {},
  disabled: true,
});

export const fetchStorageQuotaSettings = async () => {
  if (!features.storageUsage) {
    return null;
  }
  return null;
};

export const saveStorageQuotaSettings = async (_client, draftSettings) => {
  if (!features.storageUsage) {
    return draftSettings ?? null;
  }
  return draftSettings ?? null;
};

export const fetchStorageUsageMetrics = async () => {
  if (!features.storageUsage) {
    return { ...disabledMetrics, fetchedAt: new Date().toISOString() };
  }
  return { ...disabledMetrics, fetchedAt: new Date().toISOString() };
};
