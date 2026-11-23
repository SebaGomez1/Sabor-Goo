import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';
export async function GET(req: NextRequest) {
 const admin = getAdminFromRequest(req);
 if (!admin) return NextResponse.json({ active: false }, { status: 401 });
 const sb = getSupabaseAdmin();
 const since = new Date(Date.now() - 25000).toISOString();
 const { data } = await sb.from('orders').select('id,order_number,customer_name,total_uyu').gte('created_at', since).in('order_status', ['pending','preparing']).order('created_at', { ascending: false }).limit(1);
 const o = Array.isArray(data) ? data : null;
 return NextResponse.json({ active: Boolean(o), order: o });
}
