class VendorCache {
  constructor(ttlMs = 10 * 60 * 1000) { // Default TTL: 10 minutes
    this.cache = new Map();
    this.ttlMs = ttlMs;
  }

  _getKey(orgId, normalizedVendor) {
    return `${orgId}:${normalizedVendor}`;
  }

  get(orgId, normalizedVendor) {
    const key = this._getKey(orgId, normalizedVendor);
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  set(orgId, normalizedVendor, vendorId) {
    const key = this._getKey(orgId, normalizedVendor);
    this.cache.set(key, {
      value: vendorId,
      expiry: Date.now() + this.ttlMs
    });
  }

  delete(orgId, normalizedVendor) {
    const key = this._getKey(orgId, normalizedVendor);
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}

module.exports = new VendorCache();
