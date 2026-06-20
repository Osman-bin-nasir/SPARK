const initialSchemaMigration = require('./001_initial_schema');
const whatsappIntegrationMigration = require('./002_add_whatsapp_integration');

const migrations = [
  initialSchemaMigration,
  whatsappIntegrationMigration
];

const latestMigrationName = migrations[migrations.length - 1]?.name || null;

module.exports = {
  latestMigrationName,
  migrations
};
