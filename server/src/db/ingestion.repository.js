const { pool } = require('./pool');

async function createIngestionJob({ id, organizationId, source, fileName, platform = null }, client = pool) {
  const { rows } = await client.query(
    `INSERT INTO ingestion_jobs (id, organization_id, source, file_name, status, platform)
     VALUES ($1, $2, $3, $4, 'processing', $5)
     RETURNING id, organization_id, source, file_name, status, error_message, created_at, completed_at, platform`,
    [id, organizationId, source, fileName, platform]
  );

  return rows[0];
}

async function markIngestionJobCompleted(id, client = pool) {
  await client.query(
    `UPDATE ingestion_jobs
     SET status = 'completed',
         completed_at = NOW(),
         error_message = NULL
     WHERE id = $1`,
    [id]
  );
}

async function markIngestionJobFailed(id, errorMessage, client = pool) {
  await client.query(
    `UPDATE ingestion_jobs
     SET status = 'failed',
         error_message = $2,
         completed_at = NOW()
     WHERE id = $1`,
    [id, errorMessage]
  );
}

async function createOrphanDriveFile({ id, organizationId, driveFileId }, client = pool) {
  const { rows } = await client.query(
    `INSERT INTO orphan_drive_files (id, organization_id, drive_file_id, cleanup_status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING id, organization_id, drive_file_id, cleanup_status, created_at`,
    [id, organizationId, driveFileId]
  );

  if (client === pool) require('../services/automation-events').emit('orphans');
  return rows[0];
}

async function claimOrphanDriveFiles(limit = 10, client = pool) {
  const { rows } = await client.query(
    `WITH candidates AS (
       SELECT id
       FROM orphan_drive_files
       WHERE cleanup_status IN ('pending', 'failed') AND cleanup_attempts < 5
         AND next_cleanup_at <= NOW()
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE orphan_drive_files odf SET cleanup_attempts = cleanup_attempts + 1,
       next_cleanup_at = NOW() + INTERVAL '1 day'
     FROM candidates c WHERE c.id = odf.id RETURNING odf.*`,
    [limit]
  );

  return rows;
}

async function markOrphanDriveFileCleanupStatus(id, cleanupStatus, client = pool) {
  await client.query(
    `UPDATE orphan_drive_files
     SET cleanup_status = $2
     WHERE id = $1`,
    [id, cleanupStatus]
  );
}

module.exports = {
  claimOrphanDriveFiles,
  createIngestionJob,
  createOrphanDriveFile,
  markIngestionJobCompleted,
  markIngestionJobFailed,
  markOrphanDriveFileCleanupStatus
};
