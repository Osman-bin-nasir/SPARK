const initialSchemaMigration = require('./001_initial_schema');
const whatsappIntegrationMigration = require('./002_add_whatsapp_integration');
const timestampTriggersMigration = require('./003_add_timestamp_triggers');
const vendorResolutionMigration = require('./004_vendor_resolution');

const migrations = [
  initialSchemaMigration,
  whatsappIntegrationMigration,
  timestampTriggersMigration,
  vendorResolutionMigration
];

const latestMigrationName = migrations[migrations.length - 1]?.name || null;

module.exports = {
  latestMigrationName,
  migrations
};

