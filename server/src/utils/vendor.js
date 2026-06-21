const CUSTOM_DISPLAY_NAMES = {
  'aws': 'AWS',
  'gcp': 'GCP',
  'open ai': 'OpenAI',
  'openai': 'OpenAI'
};

function slugifyVendorName(value) {
  const corporateSuffixes = new Set([
    'co',
    'company',
    'corp',
    'corporation',
    'gmbh',
    'inc',
    'incorporated',
    'limited',
    'llc',
    'ltd',
    'pvt'
  ]);

  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim();

  const collapsed = normalized
    .split(/\s+/)
    .filter((token) => token && !corporateSuffixes.has(token))
    .join('-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    .replace(/-$/g, '');

  return collapsed || 'unknown-vendor';
}

function normalizeComparableText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeVendorName(name) {
  if (!name) return '';
  let normalized = name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(pvt|ltd|llc|inc|services|solutions)\b/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  if (!normalized) {
    normalized = name.toLowerCase().replace(/[^\w\s]/g, ' ').trim().replace(/\s+/g, ' ');
  }
  return normalized;
}

function cleanDisplayName(name) {
  if (!name) return '';
  // 1. Remove corporate suffixes and clean up punctuation/spaces
  let cleaned = name
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(pvt|ltd|llc|inc|services|solutions)\b/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  
  if (!cleaned) {
    cleaned = name.trim().replace(/\s+/g, ' ');
  }

  // 2. Convert to Title Case first
  let titleCased = cleaned
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  // 3. Replace known entities with their exact custom casing (case-insensitive search)
  titleCased = titleCased
    .replace(/\bopen\s+ai\b/gi, 'OpenAI')
    .replace(/\bopenai\b/gi, 'OpenAI')
    .replace(/\baws\b/gi, 'AWS')
    .replace(/\bgcp\b/gi, 'GCP');

  return titleCased;
}

module.exports = {
  normalizeComparableText,
  slugifyVendorName,
  normalizeVendorName,
  cleanDisplayName
};
