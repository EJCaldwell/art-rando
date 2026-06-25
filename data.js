// ─────────────────────────────────────────────────────────────────────────────
// ART_DATA — master content tree used as the default for all four wheels.
//
// Special key:
//   _forms   — flat array of artistic forms/styles (wheel 3). Not a category.
//
// Category keys (everything except _forms):
//   media[]    — specific materials/tools, shown on wheel 2 (Medium)
//   subjects[] — topics to depict, shown on wheel 4 (Subject)
//
// Four-wheel spin order:
//   1. Category  — Object.keys(data).filter(k => k !== '_forms')
//   2. Medium    — data[category].media
//   3. Form      — data._forms
//   4. Subject   — data[category].subjects
//
// This file is only the fallback default. User edits are saved to localStorage
// by editor.js and loaded by loadData() instead of reading directly from here.
// ─────────────────────────────────────────────────────────────────────────────

const ART_DATA = {
  // Forms are a global concept — they don't belong to any single category.
  // Examples: how the finished piece is approached or presented.
  _forms: [
    'Sketch', 'Study', 'Illustration', 'Quick Gesture',
    'Finished Piece', 'Rendering', 'Comic Style', 'Abstract'
  ],

  Drawing: {
    media:    ['Pencil', 'Charcoal', 'Ink', 'Conte', 'Pastel', 'Colored Pencil'],
    subjects: ['Portrait', 'Landscape', 'Figure Study', 'Urban Sketch', 'Animal', 'Botanical', 'Abstract', 'Still Life']
  },
  Painting: {
    media:    ['Watercolor', 'Oil', 'Acrylic', 'Gouache', 'Tempera', 'Fresco'],
    subjects: ['Portrait', 'Landscape', 'Abstract', 'Still Life', 'Seascape', 'Cityscape', 'Floral', 'Mythology']
  },
  'Digital Art': {
    media:    ['Pixel Art', 'Vector', 'Digital Painting', 'Generative', '3D Render', 'Photo Manipulation'],
    subjects: ['Character Design', 'Environment', 'Abstract', 'Portrait', 'Sci-Fi Scene', 'Fantasy', 'Typography', 'Concept Art']
  },
  Sculpture: {
    media:    ['Clay', 'Wire', 'Stone Carving', 'Wood Carving', 'Papier-Mâché', 'Casting'],
    subjects: ['Figure', 'Abstract Form', 'Animal', 'Portrait Bust', 'Relief', 'Kinetic', 'Found Object', 'Miniature']
  },
  'Game Art': {
    media:    ['Pixel Art', 'Low Poly 3D', 'Concept Sketch', 'Digital Painting', 'Voxel Art', 'Vector Art'],
    subjects: ['Character', 'Enemy Design', 'Boss', 'Environment', 'Prop', 'UI Element', 'Creature', 'Weapon']
  }
};
