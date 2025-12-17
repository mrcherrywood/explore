-- Migration: Create user_approvals table to track signup approvals
-- New users must be approved by an admin before they can access the app

CREATE TABLE IF NOT EXISTS user_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX idx_user_approvals_user_id ON user_approvals(user_id);
CREATE INDEX idx_user_approvals_status ON user_approvals(status);
CREATE INDEX idx_user_approvals_email ON user_approvals(email);

-- Enable RLS
ALTER TABLE user_approvals ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own approval status
CREATE POLICY "Users can view own approval status"
  ON user_approvals
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Only approved admins can view all approvals (you'll need to manually mark yourself as approved first)
-- For now, we use the service role for admin operations

-- Function to automatically create approval record on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_approvals (user_id, email, status)
  VALUES (NEW.id, NEW.email, 'pending');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call function on new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_approvals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER update_user_approvals_timestamp
  BEFORE UPDATE ON user_approvals
  FOR EACH ROW EXECUTE FUNCTION update_user_approvals_updated_at();








