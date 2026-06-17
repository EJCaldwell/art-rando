// supabase.js — creates the shared Supabase client used by every page.
//
// Requires the Supabase JS CDN to be loaded before this script so that
// window.supabase is available.  All other scripts reference _sb directly.
//
// Project: Art-Randomizer (qvnlxgzdkkppkcztuesy)

const _sb = window.supabase.createClient(
  'https://qvnlxgzdkkppkcztuesy.supabase.co',
  'sb_publishable_MdQKS-yKVaZl9nTZmAn2ng_ni0R75-X'
);
