const { pool } = require('./pool');

async function createIngestionJob({ id, organizationId, source, fileName }, client = pool) {
  const { rows } = await client.query(
    `INSERT INTO ingestion_jobs (id, organization_id, source, file_name, status)
     VALUES ($1, $2, $3, $4, 'processing')
     RETURNING id, organization_id, source, file_name, status, error_message, created_at, completed_at`,
    [id, organizationId, source, fileName]
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

  return rows[0];
}

async function claimOrphanDriveFiles(limit = 10, client = pool) {
  const { rows } = await client.query(
    `WITH candidates AS (
       SELECT id
       FROM orphan_drive_files
       WHERE cleanup_status = 'pending'
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     SELECT odf.id,
            odf.organization_id,
            odf.drive_file_id,
            odf.cleanup_status,
            odf.created_at
     FROM orphan_drive_files odf
     INNER JOIN candidates c ON c.id = odf.id`,
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
