import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

interface UserApproval {
  user_id: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  notes: string | null;
}

// List all pending users (admin only)
export async function GET() {
  try {
    const supabase = createClient();
    
    // Check if current user is approved (only approved users can view pending users)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: currentUserApproval } = await (supabase as any)
      .from('user_approvals')
      .select('status')
      .eq('user_id', user.id)
      .single() as { data: { status: string } | null };

    if (!currentUserApproval || currentUserApproval.status !== 'approved') {
      return NextResponse.json({ error: 'Forbidden - admin access required' }, { status: 403 });
    }

    // Use service role to get all pending approvals
    const serviceClient = createServiceRoleClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pendingUsers, error } = await (serviceClient as any)
      .from('user_approvals')
      .select('*')
      .order('requested_at', { ascending: false }) as { data: UserApproval[] | null; error: Error | null };

    if (error) {
      console.error('Error fetching pending users:', error);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    return NextResponse.json({ users: pendingUsers });
  } catch (error) {
    console.error('Error in GET /api/admin/users:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Approve or reject a user
export async function PATCH(request: Request) {
  try {
    const supabase = createClient();
    
    // Check if current user is approved
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: currentUserApproval } = await (supabase as any)
      .from('user_approvals')
      .select('status')
      .eq('user_id', user.id)
      .single() as { data: { status: string } | null };

    if (!currentUserApproval || currentUserApproval.status !== 'approved') {
      return NextResponse.json({ error: 'Forbidden - admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { userId, status, notes } = body;

    if (!userId || !status || !['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Use service role to update approval
    const serviceClient = createServiceRoleClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (serviceClient as any)
      .from('user_approvals')
      .update({
        status,
        notes,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq('user_id', userId)
      .select()
      .single() as { data: UserApproval | null; error: Error | null };

    if (error) {
      console.error('Error updating user approval:', error);
      return NextResponse.json({ error: 'Failed to update approval' }, { status: 500 });
    }

    return NextResponse.json({ approval: data });
  } catch (error) {
    console.error('Error in PATCH /api/admin/users:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}








