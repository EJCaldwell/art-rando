import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Deletes all gallery posts (any status) older than 7 days and removes their
// images from Storage.  Called weekly by a pg_cron job — see the migration
// "schedule_weekly_gallery_cleanse" for the cron setup.
Deno.serve(async (req: Request) => {
  // Only allow calls that carry the service-role key (set by the cron job).
  // verify_jwt is also true on the function itself as a second layer.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  // Fetch every post older than 7 days so we can delete their Storage objects.
  const { data: oldPosts, error: fetchErr } = await supabase
    .from("gallery_posts")
    .select("id, image_path")
    .lt("created_at", cutoff.toISOString());

  if (fetchErr) {
    return new Response(JSON.stringify({ error: fetchErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!oldPosts || oldPosts.length === 0) {
    return new Response(JSON.stringify({ deleted: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Remove images from Storage (best-effort; DB row still deleted even if
  // a file is already missing).
  const paths = oldPosts.map((p: { image_path: string }) => p.image_path);
  await supabase.storage.from("gallery-images").remove(paths);

  // Delete the DB rows.
  const ids = oldPosts.map((p: { id: string }) => p.id);
  const { error: deleteErr } = await supabase
    .from("gallery_posts")
    .delete()
    .in("id", ids);

  if (deleteErr) {
    return new Response(JSON.stringify({ error: deleteErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ deleted: oldPosts.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
