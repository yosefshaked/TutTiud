import { authenticatedFetch } from '@/lib/api-client.js';

function normalizeOrgId(orgId) {
  if (typeof orgId !== 'string') {
    return '';
  }
  return orgId.trim();
}

async function employeesRequest(method, { session, orgId, body, signal, employeeId } = {}) {
  if (!session) {
    throw new Error('נדרשת התחברות כדי לגשת לנתוני העובדים.');
  }

  const normalizedOrgId = normalizeOrgId(orgId);
  if (!normalizedOrgId) {
    throw new Error('יש לבחור ארגון פעיל לפני ביצוע הפעולה.');
  }

  const path = employeeId ? `employees/${employeeId}` : 'employees';
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

export function fetchEmployeesList(options) {
  return employeesRequest('GET', options);
}

export function createEmployee(options) {
  return employeesRequest('POST', options);
}

export function updateEmployee(options) {
  return employeesRequest('PATCH', options);
}

export function deleteEmployee(options) {
  return employeesRequest('DELETE', options);
}
