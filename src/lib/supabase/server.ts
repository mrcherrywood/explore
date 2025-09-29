import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { Database } from '@/lib/supabase/database.types';

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase URL or anon key. Check NEXT_PUBLIC_SUPABASE_URL/ANON_KEY or SUPABASE_URL/ANON_KEY.');
  }

  return createServerClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        async get(name: string) {
          const cookieStore = await cookies();
          return cookieStore.get(name)?.value;
        },
        async set(name: string, value: string, options: CookieOptions) {
          try {
            const mutableCookies = (await cookies()) as unknown as {
              set?: (args: { name: string; value: string } & CookieOptions) => void;
            };
            mutableCookies.set?.({ name, value, ...options });
          } catch {
            // Handle cookie setting in server components
          }
        },
        async remove(name: string, options: CookieOptions) {
          try {
            const mutableCookies = (await cookies()) as unknown as {
              set?: (args: { name: string; value: string } & CookieOptions) => void;
            };
            mutableCookies.set?.({ name, value: '', ...options, maxAge: 0 });
          } catch {
            // Handle cookie removal in server components
          }
        },
      },
    }
  );
}

let serviceRoleClient: SupabaseClient<Database> | null = null;

export function createServiceRoleClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const fallbackAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error('Missing Supabase URL for service role client. Set SUPABASE_URL.');
  }

  const clientKey = serviceRoleKey ?? fallbackAnonKey;

  if (!clientKey) {
    throw new Error('Missing Supabase service role key or anon key for server-side access.');
  }

  if (!serviceRoleClient) {
    serviceRoleClient = createSupabaseClient<Database>(url, clientKey, {
      auth: { persistSession: false },
    });
  }

  return serviceRoleClient;
}
