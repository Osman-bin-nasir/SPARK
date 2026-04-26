const initialSchemaMigration = require('./001_initial_schema');

const migrations = [
  initialSchemaMigration
];

const latestMigrationName = migrations[migrations.length - 1]?.name || null;

module.exports = {
  latestMigrationName,
  migrations
};
