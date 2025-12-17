import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// List all pending users (admin only)
export async function GET() {
  try {
    const supabase = createClient();
    
    // Check if current user is approved (only approved users can view pending users)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: currentUserApproval } = await supabase
      .from('user_approvals')
      .select('status')
      .eq('user_id', user.id)
      .single();

    if (!currentUserApproval || currentUserApproval.status !== 'approved') {
      return NextResponse.json({ error: 'Forbidden - admin access required' }, { status: 403 });
    }

    // Use service role to get all pending approvals
    const serviceClient = createServiceRoleClient();
    const { data: pendingUsers, error } = await serviceClient
      .from('user_approvals')
      .select('*')
      .order('requested_at', { ascending: false });

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

    const { data: currentUserApproval } = await supabase
      .from('user_approvals')
      .select('status')
      .eq('user_id', user.id)
      .single();

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
    const { data, error } = await serviceClient
      .from('user_approvals')
      .update({
        status,
        notes,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq('user_id', userId)
      .select()
      .single();

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








