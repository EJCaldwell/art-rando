// moderate-image — auto-moderates new gallery submissions using Claude Haiku vision.
// Called by a pg_net database trigger on gallery_posts INSERT.
// Sets status to 'approved' or 'rejected' with reason; leaves 'pending' on error for manual review.

import Anthropic from 'npm:@anthropic-ai/sdk';

const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;
const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!;

Deno.serve(async (req: Request) => {
  try {
    const payload = await req.json();
    const record  = payload.record;

    // Only process newly-inserted pending posts.
    if (!record || record.status !== 'pending') {
      return new Response('skipped', { status: 200 });
    }

    const postId    = record.id;
    const imagePath = record.image_path;

    // Fetch the image from public storage.
    const imageUrl = `${supabaseUrl}/storage/v1/object/public/gallery-images/${imagePath}`;
    const imgRes   = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Image fetch failed: ${imgRes.status}`);

    const base64 = arrayBufferToBase64(await imgRes.arrayBuffer());

    // Ask Claude Haiku whether the image contains inappropriate content.
    // If yes, include a brief reason so admins can see why it was rejected.
    const client  = new Anthropic({ apiKey: anthropicKey });
    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 40,
      messages: [{
        role: 'user',
        content: [
          {
            type:   'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
          },
          {
            type: 'text',
            text: 'Does this image contain nudity, sexual content, graphic violence, gore, or hate symbols? If yes, reply with "yes: " followed by a brief reason (e.g. "yes: nudity", "yes: graphic violence", "yes: hate symbols"). If no, reply with only "no".',
          },
        ],
      }],
    });

    const answer          = message.content[0].type === 'text'
      ? message.content[0].text.trim()
      : 'no';
    const inappropriate   = answer.toLowerCase().startsWith('yes');
    const newStatus       = inappropriate ? 'rejected' : 'approved';
    const rejectionReason = inappropriate
      ? (answer.replace(/^yes:\s*/i, '').trim() || 'inappropriate content')
      : null;

    // Update the post status using the service role key.
    const updateRes = await fetch(
      `${supabaseUrl}/rest/v1/gallery_posts?id=eq.${encodeURIComponent(postId)}`,
      {
        method:  'PATCH',
        headers: {
          'apikey':        serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type':  'application/json',
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify({
          status:           newStatus,
          reviewed_at:      new Date().toISOString(),
          rejection_reason: rejectionReason,
        }),
      },
    );

    if (!updateRes.ok) throw new Error(`Status update failed: ${updateRes.status}`);

    console.log(`Post ${postId}: ${newStatus}${rejectionReason ? ` (${rejectionReason})` : ''}`);
    return new Response(JSON.stringify({ postId, status: newStatus, rejectionReason }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    // On any failure leave the post as 'pending' so the admin can review it manually.
    console.error('moderate-image error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status:  500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// Converts an ArrayBuffer to a base64 string without hitting the call-stack limit
// that spread-based approaches hit on large images.
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary  = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
