const { pool } = require('./pool');

function mapIntegration(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    organization_id: row.organization_id,
    owner_user_id: row.owner_user_id,
    google_email: row.google_email,
    refresh_token_ciphertext: row.refresh_token_ciphertext,
    refresh_token_iv: row.refresh_token_iv,
    refresh_token_tag: row.refresh_token_tag,
    drive_root_folder_id: row.drive_root_folder_id,
    transactions_sheet_id: row.transactions_sheet_id,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function findByOrganizationId(organizationId, client = pool) {
  const { rows } = await client.query(
    `SELECT id,
            organization_id,
            owner_user_id,
            google_email,
            refresh_token_ciphertext,
            refresh_token_iv,
            refresh_token_tag,
            drive_root_folder_id,
            transactions_sheet_id,
            created_at,
            updated_at
     FROM google_integrations
     WHERE organization_id = $1
     LIMIT 1`,
    [organizationId]
  );

  return mapIntegration(rows[0]);
}

async function upsertIntegration(
  {
    organizationId,
    ownerUserId,
    googleEmail,
    refreshTokenCiphertext,
    refreshTokenIv,
    refreshTokenTag,
    driveRootFolderId,
    transactionsSheetId = null
  },
  client = pool
) {
  const { rows } = await client.query(
    `INSERT INTO google_integrations (
       organization_id,
       owner_user_id,
       google_email,
       refresh_token_ciphertext,
       refresh_token_iv,
       refresh_token_tag,
       drive_root_folder_id,
       transactions_sheet_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (organization_id)
     DO UPDATE SET
       owner_user_id = EXCLUDED.owner_user_id,
       google_email = EXCLUDED.google_email,
       refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
       refresh_token_iv = EXCLUDED.refresh_token_iv,
       refresh_token_tag = EXCLUDED.refresh_token_tag,
       drive_root_folder_id = EXCLUDED.drive_root_folder_id,
       transactions_sheet_id = COALESCE(EXCLUDED.transactions_sheet_id, google_integrations.transactions_sheet_id),
       updated_at = NOW()
     RETURNING id,
               organization_id,
               owner_user_id,
               google_email,
               refresh_token_ciphertext,
               refresh_token_iv,
               refresh_token_tag,
               drive_root_folder_id,
               transactions_sheet_id,
               created_at,
               updated_at`,
    [
      organizationId,
      ownerUserId,
      googleEmail,
      refreshTokenCiphertext,
      refreshTokenIv,
      refreshTokenTag,
      driveRootFolderId,
      transactionsSheetId
    ]
  );

  return mapIntegration(rows[0]);
}

async function setTransactionsSheetId({ organizationId, transactionsSheetId }, client = pool) {
  const { rows } = await client.query(
    `UPDATE google_integrations
     SET transactions_sheet_id = $2,
         updated_at = NOW()
     WHERE organization_id = $1
     RETURNING id,
               organization_id,
               owner_user_id,
               google_email,
               refresh_token_ciphertext,
               refresh_token_iv,
               refresh_token_tag,
               drive_root_folder_id,
               transactions_sheet_id,
               created_at,
               updated_at`,
    [organizationId, transactionsSheetId]
  );

  return mapIntegration(rows[0]);
}

module.exports = {
  findByOrganizationId,
  mapIntegration,
  setTransactionsSheetId,
  upsertIntegration
};
