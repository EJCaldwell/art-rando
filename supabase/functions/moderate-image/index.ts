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

    const imgBuffer = await imgRes.arrayBuffer();
    const imgBytes  = new Uint8Array(imgBuffer);
    const mediaType = detectMediaType(imgBytes);

    // If the format isn't supported by Claude (e.g. HEIC uploaded from a non-Apple
    // device where canvas compression silently fell back to the original), leave the
    // post pending so the admin can review it manually instead of returning an error.
    if (!mediaType) {
      console.log(`Post ${postId}: unsupported image format — left pending for manual review`);
      return new Response(
        JSON.stringify({ postId, status: 'pending', note: 'unsupported image format' }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    const base64 = arrayBufferToBase64(imgBuffer);

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
            source: { type: 'base64', media_type: mediaType, data: base64 },
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

// Sniffs the image format from magic bytes.
// Returns null for types Claude's API doesn't accept (HEIC, AVIF, BMP, TIFF) so
// callers can leave the post pending for manual review instead of erroring.
// Claude accepts: image/jpeg, image/png, image/gif, image/webp.
function detectMediaType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | null {
  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
  // GIF: GIF87a or GIF89a
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  // WebP: RIFF container (bytes 0-3) + "WEBP" fourcc at bytes 8-11
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  // Anything else (HEIC/HEIF, AVIF, BMP, TIFF) is not supported by Claude API.
  return null;
}

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
