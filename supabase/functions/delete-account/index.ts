// Permanently deletes the account of whoever is signed in.
//
// Called from the app's Account screen and from web/delete-account.html. The caller's own
// sign-in token is checked here, so deploy with --no-verify-jwt.
//
// What happens to their data:
//   - trips nobody else is on are deleted, with everything in them
//   - trips shared with other users stay for those users and are handed to one of them
//   - their link to every trip, their phones' notification tokens and their sign-in are removed

import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// The web page is served from another address, so browsers ask for permission first.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

/** Stops at the first database error rather than deleting a sign-in whose data is half cleaned up. */
function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.data;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (request.method !== 'POST') {
    return reply({ error: 'Use POST' }, 405);
  }

  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return reply({ error: 'Sign in again to delete your account.' }, 401);
  }
  const userId = data.user.id;

  try {
    const created = check(await admin.from('trips').select('id').eq('created_by', userId)) ?? [];
    for (const trip of created) {
      const others = check(
        await admin.from('trip_users').select('user_id').eq('trip_id', trip.id).neq('user_id', userId).limit(1),
      );
      if (others && others.length > 0) {
        // Someone else still uses this trip: it becomes theirs, so it can still be deleted one day.
        check(await admin.from('trips').update({ created_by: others[0].user_id }).eq('id', trip.id));
      } else {
        check(await admin.from('trips').delete().eq('id', trip.id));
      }
    }

    check(await admin.from('activity').update({ actor_id: null }).eq('actor_id', userId));
    check(await admin.from('reminders').delete().eq('created_by', userId));

    // Removing the sign-in also removes their trip links and notification tokens.
    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error) {
      throw new Error(removed.error.message);
    }
    return reply({ deleted: true });
  } catch (problem) {
    console.error(problem);
    return reply({ error: 'The account could not be deleted. Nothing was removed from your sign-in; please try again.' }, 500);
  }
});
