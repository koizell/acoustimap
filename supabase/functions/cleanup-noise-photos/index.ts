import { createClient } from 'npm:@supabase/supabase-js@2';
import { cleanupExpiredPhotos } from './cleanup.mjs';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const token = Deno.env.get('PHOTO_CLEANUP_TOKEN');
  if (!token) return new Response('Cleanup token is not configured', { status: 503 });
  if (request.headers.get('x-cleanup-token') !== token) return new Response('Unauthorized', { status: 401 });

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return new Response('Supabase service credentials are unavailable', { status: 503 });

  try {
    const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await cleanupExpiredPhotos(client);
    return Response.json(result);
  } catch (error) {
    console.error('Photo cleanup failed:', error);
    return new Response('Photo cleanup failed', { status: 500 });
  }
});
