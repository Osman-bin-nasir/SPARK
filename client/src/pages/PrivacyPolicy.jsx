import { Link } from 'react-router-dom';
import PublicPageShell, { LegalSection } from './legal/public-page-shell';

const updatedAt = 'April 17, 2026';

function LegalList({ items }) {
  return (
    <ul className="list-disc space-y-3 pl-5 marker:text-blue-600">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <PublicPageShell
      eyebrow="SPARK Legal"
      title="Privacy Policy"
      updatedAt={updatedAt}
      description="This Privacy Policy explains how SPARK collects, uses, stores, protects, and deletes information when you use the SPARK website, app, connected workflows, Google Drive storage, and Google Sheets reporting."
    >
      <LegalSection title="1. What SPARK Does">
        <p>
          SPARK is a finance operations platform for startup teams. It helps users collect receipts, invoices, and
          expense information, store finance documents, maintain transaction records, and review those records in a
          shared workspace.
        </p>
        <p className="border-l-4 border-blue-600 pl-4 text-sm font-medium leading-6 text-slate-800">
          SPARK does not sell, rent, or trade user data or Google user data.
        </p>
        <p>
          Google data access is user-authorized and limited to SPARK&apos;s user-facing finance document storage,
          transaction reporting, audit, and support workflows.
        </p>
        <p className="text-sm">
          You can also review our
          {' '}
          <Link className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4" to="/terms-of-service">
            Terms of Service
          </Link>
          {' '}
          or
          {' '}
          <Link className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4" to="/contact">
            contact us
          </Link>
          {' '}
          with privacy or deletion requests.
        </p>
      </LegalSection>

      <LegalSection title="2. Information We Collect">
        <LegalList
          items={[
            'Account and organization information, such as email address, password hash, organization membership, and user role.',
            'Linked service information, such as a Telegram ID if a user chooses to link Telegram.',
            'Finance submission data, such as receipts, invoices, PDFs, images, text submissions, original file names, extracted text, transaction details, duplicate checks, and audit history tied to those records.',
            'Google Drive and Google Sheets integration data, such as the connected Google email address, an encrypted refresh token, Drive folder IDs, Drive file IDs, app-created spreadsheet IDs, and files, folders, or spreadsheets created or managed by SPARK in the connected Google Drive account.',
            'Google Drive and Google Sheets metadata needed to run the integration, such as file names, folder names, spreadsheet names, tab titles, MIME types, parent folder relationships, and related file, folder, or spreadsheet identifiers.',
            'Transaction export data written to SPARK-created Google Sheets, such as transaction dates, vendors, categories, amounts, statuses, confidence scores, duplicate scores, transaction IDs, and created-at timestamps.',
            'Operational and security data, such as authentication events, request logs, ingestion status, and error logs.'
          ]}
        />
        <p>
          We access Google Drive or Google Sheets data only after the user or authorized organization administrator
          explicitly grants consent through Google&apos;s OAuth authorization flow.
        </p>
      </LegalSection>

      <LegalSection title="3. How We Use Information">
        <p>We use data only for SPARK&apos;s core functionality, security, and support.</p>
        <LegalList
          items={[
            'Creating and securing user accounts.',
            'Receiving finance submissions and storing uploaded documents.',
            'Uploading user-submitted receipts, invoices, PDFs, images, and finance files to the connected Google Drive account.',
            'Creating and organizing folders in Google Drive so submitted files are stored in the correct SPARK folder structure.',
            'Creating and updating a SPARK Transactions Google Sheet in the connected Google Drive account when users sync transaction reports.',
            'Writing organization transaction rows to SPARK-created Google Sheets tabs for the selected reporting windows.',
            'Sharing SPARK-created Google Sheets files with organization member email addresses so authorized team members can use the report.',
            'Reading file content from submitted finance documents and running OCR or similar extraction steps to support transaction records.',
            'Reading basic file and spreadsheet metadata, such as names, MIME types, tab titles, file IDs, spreadsheet IDs, and parent folders, to display, manage, organize, and link files to records inside SPARK.',
            'Detecting duplicates, maintaining audit trails, and showing finance data inside the app.',
            'Maintaining service reliability, troubleshooting failed uploads, and cleaning up orphaned files.',
            'Complying with legal obligations and protecting the security of the service.'
          ]}
        />
        <p>
          We do not use Google Drive data or other user data for advertising, resale, or unrelated profiling.
        </p>
      </LegalSection>

      <LegalSection title="4. Google Drive, Google Sheets, and Google User Data">
        <p>
          If an authorized organization founder or admin connects Google Drive, SPARK requests the
          {' '}
          <code className="rounded-md bg-slate-100 px-2 py-1 text-[13px] text-slate-900">https://www.googleapis.com/auth/drive.file</code>
          {' '}
          scope so SPARK can create and manage the SPARK folder structure, uploaded finance documents, and
          SPARK-created Google Sheets reports needed for the service.
        </p>
        <LegalList
          items={[
            'We access only the Google Drive files, folders, and SPARK-created Google Sheets files that the user authorizes or uses with SPARK.',
            'SPARK uses Google Drive access only for core functionality requested by the user or organization.',
            "SPARK does not request broad access to all files in a user's Drive.",
            "SPARK does not request the broad Google Sheets spreadsheets scope and does not read, search, or modify spreadsheets that were not created or used through SPARK.",
            'SPARK does not allow humans to read Google Drive files or Google Sheets data unless the user asks for support, it is necessary for security, or it is required by law.',
            'SPARK does not sell Google user data.',
            'SPARK does not use Google user data for advertising or any purpose unrelated to the user-facing features of SPARK.'
          ]}
        />
        <p>
          SPARK&apos;s use and transfer of information received from Google APIs will adhere to the Google API Services
          User Data Policy, including the Limited Use requirements.
        </p>
      </LegalSection>

      <LegalSection title="5. How We Share Information">
        <LegalList
          items={[
            "Within the user's organization, based on roles and access controls needed to operate SPARK.",
            'With organization members when SPARK shares an app-created Google Sheets report with member email addresses for the connected organization.',
            'With service providers that help us operate SPARK, such as hosting, database, document-processing, or infrastructure vendors, but only to the extent needed to provide the service.',
            'When required by law, regulation, legal process, or to protect the safety, rights, or security of SPARK or others.'
          ]}
        />
        <p>
          We do not sell personal information or Google user data to third parties, and we do not transfer Google user
          data to advertising platforms, data brokers, or information resellers.
        </p>
      </LegalSection>

      <LegalSection title="6. Data Storage and Retention">
        <p>
          Uploaded finance documents connected through the Google Drive integration are stored in the user&apos;s
          connected Google Drive account inside SPARK-managed folders. SPARK-created Google Sheets reports are also
          stored in the connected Google Drive account.
        </p>
        <p>
          SPARK also stores limited related application data, such as account details, transaction records, audit logs,
          connected Google account information, encrypted tokens, Drive file or folder identifiers, and app-created
          spreadsheet identifiers, in its hosted application database and servers.
        </p>
        <p>
          We store only the minimum data reasonably needed to provide and secure the service. We retain information for
          as long as needed to operate SPARK, maintain records, resolve disputes, support legitimate business and
          security needs, and comply with legal obligations.
        </p>
        <p>
          App-managed Google Drive files may also be deleted automatically if an upload fails after file creation or if
          a cleanup process identifies an orphaned file that is no longer needed. Google Drive files and Google Sheets
          files in a user&apos;s own Drive may remain under that user&apos;s control unless the user or organization asks us to
          delete SPARK-managed files before revoking access.
        </p>
      </LegalSection>

      <LegalSection title="7. Security">
        <LegalList
          items={[
            'We use HTTPS or other encrypted transport protections in production to protect data in transit.',
            'Passwords are stored as hashes, not as plaintext passwords.',
            'Google refresh tokens are encrypted at rest before storage.',
            'Access to Google Drive management is restricted to authenticated founder or admin users for an organization.',
            'We use reasonable administrative, technical, and organizational safeguards to protect data.'
          ]}
        />
        <p>No system is completely secure, but we work to protect information appropriately for the nature of the service.</p>
      </LegalSection>

      <LegalSection title="8. Data Deletion and OAuth Revocation">
        <p>Users and organizations can control connected Google Drive access and request deletion of their data.</p>
        <LegalList
          items={[
            'Users may choose whether to connect Google Drive.',
            'Organizations may choose what finance documents or text to submit through SPARK.',
            'Organization administrators control which members can access organization data inside SPARK.',
            'Users can revoke Google OAuth access at https://myaccount.google.com/permissions.',
            'Users may request deletion of SPARK-stored application data, deletion of SPARK-managed Drive or Sheets files where technically possible, and disconnection of the Google integration by emailing sparkfinancehq@gmail.com.'
          ]}
        />
      </LegalSection>

      <LegalSection title="9. User Rights">
        <LegalList
          items={[
            'Users control whether they connect Google Drive to SPARK.',
            'Users can request deletion of their SPARK-stored data.',
            "Users can revoke SPARK's Google Drive access at any time through their Google account permissions."
          ]}
        />
      </LegalSection>

      <LegalSection title="10. Children's Privacy">
        <p>
          SPARK is intended for business use and is not directed to children under 13. We do not knowingly collect
          personal information from children under 13.
        </p>
      </LegalSection>

      <LegalSection title="11. Changes to This Policy">
        <p>
          We may update this Privacy Policy from time to time. If we make material changes, we will update the
          effective date on this page.
        </p>
      </LegalSection>

      <LegalSection title="12. Contact">
        <p>
          For privacy questions, deletion requests, or Google OAuth verification questions, contact
          {' '}
          <a className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4" href="mailto:sparkfinancehq@gmail.com">
            sparkfinancehq@gmail.com
          </a>
          .
        </p>
      </LegalSection>
    </PublicPageShell>
  );
}
