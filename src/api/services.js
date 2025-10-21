import { authenticatedFetch } from '@/lib/api-client.js';

function normalizeOrgId(orgId) {
  if (typeof orgId !== 'string') {
    return '';
  }
  return orgId.trim();
}

function normalizeServiceId(serviceId) {
  if (typeof serviceId === 'number' && Number.isFinite(serviceId)) {
    return serviceId;
  }
  if (typeof serviceId !== 'string') {
    return '';
  }
  return serviceId.trim();
}

async function servicesRequest(method, { session, orgId, body, signal, serviceId } = {}) {
  if (!session) {
    throw new Error('נדרשת התחברות כדי לגשת לשירותים.');
  }

  const normalizedOrgId = normalizeOrgId(orgId);
  if (!normalizedOrgId) {
    throw new Error('יש לבחור ארגון פעיל לפני ביצוע הפעולה.');
  }

  const normalizedServiceId = normalizeServiceId(serviceId);
  const path = normalizedServiceId ? `services/${normalizedServiceId}` : 'services';
  const search = method === 'GET' ? `?org_id=${encodeURIComponent(normalizedOrgId)}` : '';
  const hasObjectBody = body && typeof body === 'object' && !(body instanceof FormData);
  const payload = method === 'GET'
    ? undefined
    : hasObjectBody
      ? { ...body, org_id: normalizedOrgId }
      : body;

  const requestOptions = {
    session,
    method,
    signal,
  };

  if (typeof payload !== 'undefined') {
    requestOptions.body = payload;
  }

  try {
    return await authenticatedFetch(`${path}${search}`, requestOptions);
  } catch (error) {
    if (!error?.message) {
      error.message = 'הפעולה נכשלה. נסה שוב מאוחר יותר.';
    }
    throw error;
  }
}

export function createService({ body, ...options } = {}) {
  return servicesRequest('POST', {
    ...options,
    body: body && typeof body === 'object' ? { service: body } : body,
  });
}

export function getServices(options = {}) {
  return servicesRequest('GET', options);
}

export function updateService({ serviceId, body, ...options } = {}) {
  if (!serviceId) {
    throw new Error('חסר מזהה שירות לעדכון.');
  }

  return servicesRequest('PATCH', {
    ...options,
    serviceId,
    body: body && typeof body === 'object' ? { updates: body } : body,
  });
}

export function deleteService({ serviceId, ...options } = {}) {
  if (!serviceId) {
    throw new Error('חסר מזהה שירות למחיקה.');
  }

  return servicesRequest('DELETE', {
    ...options,
    serviceId,
  });
}
