# Supabase Connection Troubleshooting Guide

## Current Status ✅

Your Supabase connection has been diagnosed and the main issues identified:

### ✅ Working Components
- Supabase URL and anon key are correctly configured
- Basic client connection is successful
- Database `messages` table exists and is accessible
- TypeScript types are properly defined

### ❌ Missing Components
- `SUPABASE_SERVICE_ROLE_KEY` - Required for server-side operations
- `OPENROUTER_API_KEY` - Required for AI chat functionality

## How to Fix

### Step 1: Get Your Supabase Service Role Key
1. Go to your Supabase project dashboard: https://supabase.com/dashboard
2. Navigate to **Settings** → **API**
3. Find the **service_role** key (NOT the anon key)
4. Copy this key

### Step 2: Get Your OpenRouter API Key
1. Go to https://openrouter.ai/
2. Sign up or log in to your account
3. Navigate to your API keys section
4. Create a new API key or copy an existing one

### Step 3: Update Your Environment File
Replace the placeholder values in your `.env.local` file:

```bash
# Replace YOUR_SERVICE_ROLE_KEY_HERE with your actual service role key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Replace YOUR_OPENROUTER_API_KEY_HERE with your actual OpenRouter key
OPENROUTER_API_KEY=sk-or-v1-...
```

### Step 4: Restart Your Development Server
After updating the environment variables:
```bash
npm run dev
```

## Testing Your Connection

Run the diagnostic script:
```bash
node test-supabase.js
```

Expected output after fixing:
```
=== Supabase Connection Diagnostics ===

1. Environment Variables:
NEXT_PUBLIC_SUPABASE_URL: ✓ Set
NEXT_PUBLIC_SUPABASE_ANON_KEY: ✓ Set
SUPABASE_SERVICE_ROLE_KEY: ✓ Set
OPENROUTER_API_KEY: ✓ Set

2. Client Creation:
✓ Supabase client created successfully

3. Connection Test:
✓ Connection successful
  → Messages table exists with 0 rows
```

## Common Issues & Solutions

### Issue: "cookies was called outside a request scope"
This is a known issue with Next.js server components and Supabase. Your current server.ts implementation already handles this with try-catch blocks.

### Issue: Schema cache problems
If you encounter schema cache issues after database changes:
1. Restart your development server
2. Clear your browser cache
3. Wait a few minutes for Supabase cache to refresh

### Issue: Database table doesn't exist
If the messages table doesn't exist, create it with this SQL:

```sql
CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  content TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  metadata JSONB
);

-- Enable Row Level Security
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Create a policy (adjust as needed for your use case)
CREATE POLICY "Enable all operations for authenticated users" ON messages
  FOR ALL USING (true);
```

## Security Notes

- Never commit your `.env.local` file to version control
- The service role key has admin privileges - keep it secure
- Consider using environment-specific keys for production

## Next Steps

Once you've added the missing environment variables:
1. Test the chat functionality in your app
2. Verify messages are being stored in the database
3. Check that the AI responses are working through OpenRouter
