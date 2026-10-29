const integrations=require('../db/google-integrations.repository');
const organizations=require('../db/organizations.repository');
const driveService=require('./google-drive.service');
const {pool}=require('../db/pool');
const {HttpError}=require('../utils/http-error');
async function permissions(drive,fileId) {
  const all=[];let pageToken;
  do {const result=await drive.permissions.list({fileId,pageToken,fields:'nextPageToken,permissions(id,type,emailAddress,role,permissionDetails(inherited))'});
    all.push(...(result.data.permissions||[]));pageToken=result.data.nextPageToken;}while(pageToken);
  return all;
}
async function revokeMember(organizationId,userId,client) {
  const integration=await integrations.findByOrganizationId(organizationId,client);
  if(integration?.owner_user_id===userId)throw new HttpError(409,'Reconnect Google Drive under another active member before removing its integration owner');
  if(!integration?.transactions_sheet_id) return null;
  const {rows}=await client.query('SELECT email FROM users WHERE id=$1',[userId]);
  const email=rows[0]?.email?.toLowerCase();if(!email)return;
  const {drive}=await driveService.getOrganizationDriveClient(organizationId,client);
  const fileId=integration.transactions_sheet_id;
  const revoked=[];
  const existing=await permissions(drive,fileId);
  const memberPermissions=existing.filter(permission=>permission.emailAddress?.toLowerCase()===email);
  for(const permission of existing) {
    if(permission.role==='owner'&&permission.emailAddress?.toLowerCase()!==integration.google_email?.toLowerCase())throw new HttpError(409,'Transfer the existing SPARK workbook to the active Google integration owner before removing members');
    if(memberPermissions.includes(permission)&&(permission.role==='owner'||permission.permissionDetails?.some(d=>d.inherited)))throw new HttpError(409,'Transfer ownership or remove inherited Google access before removing this member');
  }
  try {
    for(const permission of memberPermissions) {
      await drive.permissions.delete({fileId,permissionId:permission.id});
      revoked.push({type:permission.type,emailAddress:permission.emailAddress,role:permission.role});
      await client.query('DELETE FROM managed_sheet_permissions WHERE file_id=$1 AND permission_id=$2',[fileId,permission.id]);
    }
  } catch(error) {
    if(revoked.length) {
      try { await restoreMemberRevocation({organizationId,fileId,email,drive,revoked}); } catch { /* retry via reconciliation */ }
    }
    throw error;
  }
  return revoked.length ? {organizationId,fileId,email,drive,revoked} : null;
}
async function restoreMemberRevocation(revocation) {
  if(!revocation)return;
  for(const permission of revocation.revoked) {
    // A sync may have restored the membership's grant after the transaction
    // rolled back but before this compensation runs. Reuse it instead of
    // creating a duplicate Drive permission.
    const current=(await permissions(revocation.drive,revocation.fileId))
      .find(item=>item.emailAddress?.toLowerCase()===revocation.email);
    const result=current ? {data:{id:current.id}} : await revocation.drive.permissions.create({
      fileId:revocation.fileId,fields:'id',sendNotificationEmail:false,
      requestBody:{type:permission.type||'user',emailAddress:permission.emailAddress,role:permission.role}
    });
    await pool.query('INSERT INTO managed_sheet_permissions(organization_id,file_id,permission_id,email) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [revocation.organizationId,revocation.fileId,result.data.id,revocation.email]);
  }
}
async function reconcile({drive,spreadsheetId,organizationId}) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    // Membership removal takes the same row lock, preventing a stale sync from
    // re-granting access after removal has completed.
    await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[organizationId]);
    const members=await organizations.listOrganizationMembers({organizationId},client);
    const integration=await integrations.findByOrganizationId(organizationId,client);
    const ownerActive=members.some(m=>m.user_id===integration?.owner_user_id);
    const emails=new Set(members.map(m=>m.email?.trim().toLowerCase()).filter(Boolean));
    const existing=await permissions(drive,spreadsheetId);
    // This workbook is generated for workspace members only. Reconcile legacy
    // grants too; never alter permissions on unrelated Drive files.
    for(const p of existing)if(!emails.has(p.emailAddress?.toLowerCase())) {
      if(p.role==='owner'&&ownerActive&&p.emailAddress?.toLowerCase()===integration.google_email?.toLowerCase())continue;
      if(p.role==='owner'||p.permissionDetails?.some(d=>d.inherited))throw new HttpError(409,'This SPARK workbook has external owner/inherited access. Transfer ownership or remove parent sharing before syncing');
      await drive.permissions.delete({fileId:spreadsheetId,permissionId:p.id});
      await client.query('DELETE FROM managed_sheet_permissions WHERE file_id=$1 AND permission_id=$2',[spreadsheetId,p.id]);
    }
    for(const email of emails)if(!existing.some(p=>p.emailAddress?.toLowerCase()===email)) {
      let result;
      try {
        result=await drive.permissions.create({fileId:spreadsheetId,fields:'id',sendNotificationEmail:false,requestBody:{role:'writer',type:'user',emailAddress:email}});
      } catch(error) {
        // Some member addresses cannot receive Drive access. Other grants and
        // workbook writes may proceed once unsafe existing access is removed.
        console.warn('Unable to grant SPARK workbook access', {
          organizationId, status:error?.response?.status||error?.status||error?.code||null
        });
        continue;
      }
      await client.query('INSERT INTO managed_sheet_permissions(organization_id,file_id,permission_id,email) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[organizationId,spreadsheetId,result.data.id,email]);
    }
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
module.exports={permissions,revokeMember,restoreMemberRevocation,reconcile};
