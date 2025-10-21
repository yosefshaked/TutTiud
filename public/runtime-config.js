(function preloadRuntimeConfig() {
  const globalScope = typeof window !== 'undefined' ? window : undefined;
  if (!globalScope) {
    return;
  }

  function normalizeConfig(raw, source) {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const supabaseUrl = raw.supabaseUrl || raw.supabase_url;
    const supabaseAnonKey = raw.supabaseAnonKey || raw.supabase_anon_key || raw.anon_key;

    const trimmedUrl = typeof supabaseUrl === 'string' ? supabaseUrl.trim() : '';
    const trimmedKey = typeof supabaseAnonKey === 'string' ? supabaseAnonKey.trim() : '';

    if (!trimmedUrl || !trimmedKey) {
      return null;
    }

    const orgId = raw.orgId ?? raw.org_id ?? null;

    return {
      supabaseUrl: trimmedUrl,
      supabaseAnonKey: trimmedKey,
      orgId: orgId != null ? String(orgId) : null,
      source: raw.source || source || 'preload',
    };
  }

  function assignRuntimeConfig(value) {
    if (value && typeof value === 'object') {
      globalScope.__RUNTIME_CONFIG__ = value;
    } else {
      globalScope.__RUNTIME_CONFIG__ = null;
    }
  }

  if (globalScope.__RUNTIME_CONFIG__ && typeof globalScope.__RUNTIME_CONFIG__ === 'object') {
    const normalizedExisting = normalizeConfig(globalScope.__RUNTIME_CONFIG__, 'inline');
    assignRuntimeConfig(normalizedExisting);
    return;
  }

  let normalized = null;

  try {
    const inlineNode = document.querySelector('script[type="application/json"][data-runtime-config]');
    if (inlineNode?.textContent) {
      const inlinePayload = JSON.parse(inlineNode.textContent);
      normalized = normalizeConfig(inlinePayload, 'inline');
    }
  } catch (error) {
    console.warn('[runtime-config] failed to parse inline config', error);
  }

  if (!normalized) {
    try {
      const request = new XMLHttpRequest();
      request.open('GET', '/api/config', false);
      request.setRequestHeader('Accept', 'application/json');
      request.send(null);

      if (request.status >= 200 && request.status < 300) {
        const responseText = request.responseText || '';
        if (responseText.trim()) {
          const payload = JSON.parse(responseText);
          normalized = normalizeConfig(payload, 'preload');
        }
      }
    } catch (error) {
      console.warn('[runtime-config] failed to preload configuration', error);
    }
  }

  assignRuntimeConfig(normalized);
})();
