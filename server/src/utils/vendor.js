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

module.exports = {
  normalizeComparableText,
  slugifyVendorName
};
