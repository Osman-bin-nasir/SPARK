const initialSchemaMigration = require('./001_initial_schema');
const whatsappIntegrationMigration = require('./002_add_whatsapp_integration');
const timestampTriggersMigration = require('./003_add_timestamp_triggers');
const vendorResolutionMigration = require('./004_vendor_resolution');
const vendorSynonymsBackfillMigration = require('./005_vendor_synonyms_backfill');
const insightsFrequencyMigration = require('./006_add_insights_frequency');
const expandRolesMigration = require('./007_expand_roles_and_insights_recipients');
const adjustVendorAliasesConstraintMigration = require('./008_adjust_vendor_aliases_constraint');

const migrations = [
  initialSchemaMigration,
  whatsappIntegrationMigration,
  timestampTriggersMigration,
  vendorResolutionMigration,
  vendorSynonymsBackfillMigration,
  insightsFrequencyMigration,
  expandRolesMigration,
  adjustVendorAliasesConstraintMigration
];

const latestMigrationName = migrations[migrations.length - 1]?.name || null;

module.exports = {
  latestMigrationName,
  migrations
};


