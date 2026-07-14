/**
 * Deterministic synonym map for abbreviations and brand aliases.
 * Keys are lowercase, stripped of punctuation. Values are the canonical expanded form.
 * Only whole-string matches are applied (not partial/token matches).
 */
const VENDOR_SYNONYMS = {
  'aws': 'amazon web services',
  'gcp': 'google cloud platform',
  'msft': 'microsoft',
  'ms office': 'microsoft office',
  'ms teams': 'microsoft teams',
  'gh': 'github',
  'fb': 'facebook',
  'fb ads': 'facebook ads',
  'meta': 'meta',
  'meta ads': 'meta ads',
  'ig': 'instagram',
  'ig ads': 'instagram ads',
  'yt': 'youtube',
  'yt ads': 'youtube ads',
  'goog': 'google',
  'amzn': 'amazon',
  'k8s': 'kubernetes',
  'mongo': 'mongodb',
  'pg': 'postgresql',
  'postgres': 'postgresql',
  'tf': 'terraform',
  'cf': 'cloudflare',
  'do': 'digitalocean',
  'digital ocean': 'digitalocean',
  'li': 'linkedin',
  'li ads': 'linkedin ads',
};

/**
 * Custom display name overrides for known entities.
 * Keys are normalized (lowercase, suffix-stripped) forms.
 */
const CUSTOM_DISPLAY_NAMES = {
  'amazon web': 'Amazon Web Services (AWS)',
  'amazon web services': 'Amazon Web Services (AWS)',
  'aws': 'Amazon Web Services (AWS)',
  'google cloud platform': 'Google Cloud Platform (GCP)',
  'gcp': 'Google Cloud Platform (GCP)',
  'open ai': 'OpenAI',
  'openai': 'OpenAI',
  'openai api': 'OpenAI',
  'github': 'GitHub',
  'linkedin': 'LinkedIn',
  'linkedin ads': 'LinkedIn Ads',
  'digitalocean': 'DigitalOcean',
  'cloudflare': 'Cloudflare',
  'mongodb': 'MongoDB',
  'postgresql': 'PostgreSQL',
  'kubernetes': 'Kubernetes',
  'terraform': 'Terraform',
  'youtube': 'YouTube',
  'helpscout': 'HelpScout',
};

/**
 * Expands known abbreviations/synonyms to their canonical form.
 * Only applies when the ENTIRE cleaned input matches a synonym key.
 * @param {string} name - Raw vendor input
 * @returns {string} Expanded name, or original if no synonym match
 */
function expandVendorSynonyms(name) {
  if (!name) return name;
  const cleaned = name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  if (VENDOR_SYNONYMS[cleaned]) {
    return VENDOR_SYNONYMS[cleaned];
  }
  return name;
}

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

/**
 * Normalizes a vendor name for matching purposes.
 * 1. Lowercases, strips punctuation, removes corporate suffixes
 * 2. Tries synonym expansion on the result
 * 3. If synonym matched, re-normalizes the expanded form
 */
function normalizeVendorName(name) {
  if (!name) return '';

  // Step 1: Basic normalization (lowercase, strip punctuation, remove suffixes)
  let normalized = _basicNormalize(name);
  if (!normalized) {
    normalized = name.toLowerCase().replace(/[^\w\s]/g, ' ').trim().replace(/\s+/g, ' ');
  }

  // Step 2: Try synonym expansion on the normalized result
  if (VENDOR_SYNONYMS[normalized]) {
    // Re-normalize the expanded form (to strip suffixes like 'services' from 'amazon web services')
    const expanded = VENDOR_SYNONYMS[normalized];
    const reNormalized = _basicNormalize(expanded);
    return reNormalized || expanded;
  }

  return normalized;
}

/**
 * Internal helper: basic text normalization without synonym expansion.
 */
function _basicNormalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(pvt|ltd|llc|inc|services|solutions)\b/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Cleans a vendor name for display purposes.
 * 1. Strips suffixes, then checks synonym map
 * 2. If synonym match → use CUSTOM_DISPLAY_NAMES for the expanded form
 * 3. Otherwise, title-case with entity corrections
 */
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

  const lowerCleaned = cleaned.toLowerCase();

  // 2. Check if the cleaned form is a known synonym
  if (VENDOR_SYNONYMS[lowerCleaned]) {
    const expanded = VENDOR_SYNONYMS[lowerCleaned];
    // Use custom display name for the expanded form if available
    if (CUSTOM_DISPLAY_NAMES[expanded]) {
      return CUSTOM_DISPLAY_NAMES[expanded];
    }
    // Otherwise, check the cleaned (suffix-stripped) form of the expansion
    const expandedCleaned = _basicNormalize(expanded);
    if (CUSTOM_DISPLAY_NAMES[expandedCleaned]) {
      return CUSTOM_DISPLAY_NAMES[expandedCleaned];
    }
    // Fallback: title-case the expanded form
    return expanded.split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  // 3. Check custom display names for the cleaned form
  if (CUSTOM_DISPLAY_NAMES[lowerCleaned]) {
    return CUSTOM_DISPLAY_NAMES[lowerCleaned];
  }

  // 4. Convert to Title Case
  let titleCased = cleaned
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  // 5. Replace known entities with their exact custom casing (fallback for partial matches)
  titleCased = titleCased
    .replace(/\bopen\s+ai\b/gi, 'OpenAI')
    .replace(/\bopenai\b/gi, 'OpenAI')
    .replace(/\baws\b/gi, 'AWS')
    .replace(/\bgcp\b/gi, 'GCP')
    .replace(/\bgithub\b/gi, 'GitHub')
    .replace(/\blinkedin\b/gi, 'LinkedIn')
    .replace(/\byoutube\b/gi, 'YouTube')
    .replace(/\bdigitalocean\b/gi, 'DigitalOcean')
    .replace(/\bmongodb\b/gi, 'MongoDB')
    .replace(/\bpostgresql\b/gi, 'PostgreSQL')
    .replace(/\bcloudflare\b/gi, 'Cloudflare')
    .replace(/\bkubernetes\b/gi, 'Kubernetes')
    .replace(/\bhelpscout\b/gi, 'HelpScout');

  return titleCased;
}

module.exports = {
  VENDOR_SYNONYMS,
  CUSTOM_DISPLAY_NAMES,
  normalizeComparableText,
  slugifyVendorName,
  normalizeVendorName,
  cleanDisplayName,
  expandVendorSynonyms
};
