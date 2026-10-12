// Sends push notifications for a new activity line or reminder.
//
// The database calls this with only a row id (see request_notification() in schema.sql). The
// function looks the row up itself and marks it as notified, so calling it again, or calling it
// with made-up input, sends nothing. That is why it can run without a signed-in caller:
// deploy with --no-verify-jwt.
//
// Needs one secret: FIREBASE_SERVICE_ACCOUNT, the JSON key of a Firebase service account.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { importPKCS8, SignJWT } from 'npm:jose@5';

type Row = Record<string, any>;
type Message = { kind: 'activity' | 'reminder'; title: string; body: string; tripId: string; userIds: string[] };

/** The app's violet, so the icon and app name in the notification match the app. */
const BRAND_COLOR = '#6C4DF6';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const account = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT') ?? '{}');

function rupees(paise: unknown): string {
  const amount = Math.abs(Number(paise) || 0);
  const whole = String(Math.floor(amount / 100));
  const grouped = whole.length > 3 ? `${whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${whole.slice(-3)}` : whole;
  const rest = amount % 100;
  return `₹${grouped}${rest === 0 ? '' : `.${String(rest).padStart(2, '0')}`}`;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Google only accepts a short-lived token obtained by signing a request with the service account's key. */
async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const key = await importPKCS8(account.private_key, 'RS256');
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(account.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Google refused the service account: ${JSON.stringify(json)}`);
  }
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.value;
}

async function send(message: Message): Promise<number> {
  if (message.userIds.length === 0) {
    return 0;
  }
  const { data: phones } = await admin.from('push_tokens').select('token').in('user_id', message.userIds);
  if (!phones || phones.length === 0) {
    return 0;
  }

  const token = await accessToken();
  const results = await Promise.all(
    phones.map(async ({ token: phone }) => {
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: phone,
            notification: { title: message.title, body: message.body },
            data: { tripId: message.tripId, kind: message.kind },
            android: {
              priority: 'HIGH',
              notification: {
                channel_id: message.kind === 'reminder' ? 'reminders' : 'default',
                color: BRAND_COLOR,
                // A repeated reminder for the same trip replaces the earlier one instead of piling up.
                ...(message.kind === 'reminder' ? { tag: `reminder:${message.tripId}` } : {}),
              },
            },
          },
        }),
      });
      // A phone that uninstalled the app or cleared its data has a dead token; forget it.
      if (response.status === 404) {
        await admin.from('push_tokens').delete().eq('token', phone);
      }
      return response.ok;
    }),
  );
  return results.filter(Boolean).length;
}

/** Marks the row as handled and returns it, or null if it was handled before or does not exist. */
async function claim(table: 'activity' | 'reminders', id: number): Promise<Row | null> {
  const { data } = await admin
    .from(table)
    .update({ notified_at: new Date().toISOString() })
    .eq('id', id)
    .is('notified_at', null)
    .select()
    .maybeSingle();
  return data;
}

async function tripNames(tripId: string) {
  const [{ data: trip }, { data: members }] = await Promise.all([
    admin.from('trips').select('name').eq('id', tripId).maybeSingle(),
    admin.from('members').select('id, name').eq('trip_id', tripId),
  ]);
  const names = new Map((members ?? []).map((member: Row) => [member.id, member.name]));
  return { tripName: trip?.name ?? 'your trip', name: (memberId: unknown) => names.get(memberId) ?? 'Someone' };
}

/** What to say about an activity line, or null if it is not worth interrupting anyone for. */
function describe(row: Row, who: string, name: (memberId: unknown) => string): string | null {
  const before = row.before ?? {};
  const after = row.after ?? {};
  const item = row.action === 'removed' ? before : after;

  if (row.entity === 'expense') {
    if (row.action === 'added') {
      return `${who} added “${item.description}” · ${rupees(item.amount)}`;
    }
    if (row.action === 'removed') {
      return `${who} deleted “${item.description}” · ${rupees(item.amount)}`;
    }
    return before.amount === after.amount
      ? `${who} changed “${after.description}”`
      : `${who} changed “${after.description}” from ${rupees(before.amount)} to ${rupees(after.amount)}`;
  }
  if (row.entity === 'payment') {
    const parties = `${name(item.from_member_id)} → ${name(item.to_member_id)} ${rupees(item.amount)}`;
    return row.action === 'added' ? `${who} marked ${parties} as paid` : `${who} undid the payment ${parties}`;
  }
  if (row.entity === 'trip' && row.action === 'changed') {
    if (!before.finalized_at && after.finalized_at) {
      return `${who} finalised the trip. Time to settle up.`;
    }
    if (before.finalized_at && !after.finalized_at) {
      return `${who} reopened the trip.`;
    }
  }
  return null;
}

async function activityMessage(id: number): Promise<Message | null> {
  const row = await claim('activity', id);
  if (!row) {
    return null;
  }
  const { tripName, name } = await tripNames(row.trip_id);
  const body = describe(row, row.actor_member_id ? name(row.actor_member_id) : 'Someone', name);
  if (!body) {
    return null;
  }
  // Everyone on the trip except whoever made the change.
  const { data: users } = await admin.from('trip_users').select('user_id').eq('trip_id', row.trip_id);
  const userIds = (users ?? []).map((user: Row) => user.user_id).filter((userId: string) => userId !== row.actor_id);
  return { kind: 'activity', title: tripName, body, tripId: row.trip_id, userIds };
}

async function reminderMessage(id: number): Promise<Message | null> {
  const row = await claim('reminders', id);
  if (!row) {
    return null;
  }
  const { tripName, name } = await tripNames(row.trip_id);
  const { data: userIds } = await admin.rpc('reminder_recipients', {
    trip: row.trip_id,
    from_member: row.from_member_id,
    sender: row.created_by,
  });
  return {
    kind: 'reminder',
    title: `Reminder · ${tripName}`,
    body: `${name(row.from_member_id)} owes ${name(row.to_member_id)} ${rupees(row.amount)}. Open FamSplit to settle up.`,
    tripId: row.trip_id,
    userIds: (userIds ?? []) as string[],
  };
}

Deno.serve(async (request) => {
  try {
    const { kind, id } = await request.json();
    const message =
      kind === 'activity' ? await activityMessage(Number(id)) : kind === 'reminder' ? await reminderMessage(Number(id)) : null;
    const sent = message ? await send(message) : 0;
    return Response.json({ sent });
  } catch (error) {
    console.error(error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
});
