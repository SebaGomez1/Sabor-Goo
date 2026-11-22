import * as webpush from 'web-push';
import { getSupabaseAdmin } from './supabase';

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:contacto@saborgoo.uy';
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
  badgeCount?: number;
  tag?: string;
  playAlertSound?: boolean;
}

async function dispatchSubscriptions(subs: any[], payload: PushNotificationPayload): Promise<number> {
  if (!subs || subs.length === 0) return 0;
  const supabase = getSupabaseAdmin();
  let sentCount = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
      sentCount++;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      }
    }
  }
  return sentCount;
}

export async function sendPushToCustomerPhone(phone: string, payload: PushNotificationPayload): Promise<number> {
  if (!ensureVapidConfigured()) return 0;
  const supabase = getSupabaseAdmin();
  const { data: subs } = await supabase.from('push_subscriptions').select('*').eq('customer_phone', phone).is('admin_id', null);
  return dispatchSubscriptions(subs || [], payload);
}

export async function sendPushToAllClients(payload: PushNotificationPayload): Promise<number> {
  if (!ensureVapidConfigured()) return 0;
  const supabase = getSupabaseAdmin();
  const { data: subs } = await supabase.from('push_subscriptions').select('*').is('admin_id', null);
  return dispatchSubscriptions(subs || [], payload);
}

export async function sendPushToAllAdmins(payload: PushNotificationPayload): Promise<number> {
  if (!ensureVapidConfigured()) return 0;
  const supabase = getSupabaseAdmin();
  const { data: subs } = await supabase.from('push_subscriptions').select('*').not('admin_id', 'is', null);
  return dispatchSubscriptions(subs || [], payload);
}
