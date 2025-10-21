import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.5?target=deno';

type StorageRow = {
  [key: string]: unknown;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'OPTIONS, GET, POST',
};

const PAGE_SIZE = 1000;

type JsonError = {
  error: string;
  details?: unknown;
  total_bytes?: string;
};

type JsonSuccess = {
  total_bytes: number;
};

const normalizeSize = (value: unknown): bigint | null => {
  if (typeof value === 'bigint') {
    return value >= 0n ? value : 0n;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    return BigInt(Math.floor(value));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = BigInt(trimmed);
      return parsed >= 0n ? parsed : 0n;
    } catch {
      const numeric = Number(trimmed);
      if (!Number.isFinite(numeric) || numeric < 0) return null;
      return BigInt(Math.floor(numeric));
    }
  }
  return null;
};

const extractRowSize = (row: StorageRow): bigint | null => {
  if (!row || typeof row !== 'object') return null;
  const candidates = [
    row['metadata->>size'],
    row.size,
    row.bytes,
    row.total_bytes,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeSize(candidate);
    if (normalized != null) return normalized;
  }
  return null;
};

const jsonResponse = (body: JsonError | JsonSuccess, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('SUPABASE_PROJECT_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({
      error: 'Missing Supabase credentials. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are configured.',
    }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let totalBytes = 0n;
  let page = 0;

  try {
    while (true) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, status } = await supabase
        .from('storage.objects')
        .select('metadata->>size')
        .range(from, to);

      if (error) {
        return jsonResponse({
          error: 'Failed to query storage.objects metadata.',
          details: error.message ?? error,
        }, status ?? 500);
      }

      if (!data || data.length === 0) {
        break;
      }

      for (const row of data) {
        const size = extractRowSize(row as StorageRow);
        if (size != null) {
          totalBytes += size;
        }
      }

      if (data.length < PAGE_SIZE) {
        break;
      }

      page += 1;
    }
  } catch (error) {
    return jsonResponse({
      error: 'Unexpected error while calculating storage usage.',
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }

  if (totalBytes > BigInt(Number.MAX_SAFE_INTEGER)) {
    return jsonResponse({
      error: 'Total exceeds JavaScript safe integer range. Refer to total_bytes for the precise bigint value.',
      total_bytes: totalBytes.toString(),
    }, 422);
  }

  return jsonResponse({ total_bytes: Number(totalBytes) });
});
