import { Link } from 'react-router-dom';
import PublicPageShell, { LegalSection } from './legal/public-page-shell';

const updatedAt = 'April 17, 2026';

export default function ContactPage() {
  return (
    <PublicPageShell
      eyebrow="SPARK Support"
      title="Contact SPARK"
      updatedAt={updatedAt}
      description="Use this page for support, privacy requests, Google data deletion requests, Google Drive revocation help, and Google OAuth verification follow-up. Right now the fastest way to reach us is by email."
    >
      <LegalSection title="How To Reach Us">
        <p>
          Email
          {' '}
          <a className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4" href="mailto:sparkfinancehq@gmail.com">
            sparkfinancehq@gmail.com
          </a>
          {' '}
          for general support, privacy questions, data deletion requests, or Google OAuth verification questions.
        </p>
        <p>
          If you are contacting us about Google Drive, Google Sheets, OAuth access, or data deletion, include your
          organization name, the email address used in SPARK, and a short description of the request so we can respond
          faster.
        </p>
        <p className="text-sm">
          Before reaching out, you can review the
          {' '}
          <Link className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4" to="/privacy-policy">
            Privacy Policy
          </Link>
          {' '}
          and
          {' '}
          <Link className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4" to="/terms-of-service">
            Terms of Service
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="What To Include In Your Email">
        <ul className="list-disc space-y-3 pl-5 marker:text-blue-600">
          <li>General support: describe the issue, the page or flow involved, and any error message you saw.</li>
          <li>Privacy or deletion requests: include your organization name and the email address used in SPARK.</li>
          <li>Google OAuth verification questions: mention that the request is related to Google Drive, Google Sheets, scopes, or legal documentation.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Privacy and Data Deletion Requests">
        <p>
          You can email us to request deletion of SPARK-stored application data, disconnection of the Google
          integration, or deletion of SPARK-managed Drive or Sheets files where technically possible.
        </p>
        <p>
          For security, we may need to verify that the requester controls the SPARK account or is authorized to act for
          the organization before completing deletion or disconnection requests.
        </p>
      </LegalSection>

      <LegalSection title="Google Drive Access and Revocation">
        <p>
          Users can revoke SPARK&apos;s Google Drive access at any time through Google Account permissions. Revocation
          stops future access from SPARK, but it does not automatically delete records already stored in SPARK or files
          already stored in your Google Drive.
        </p>
        <a
          href="https://myaccount.google.com/permissions"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-md border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-800 transition hover:border-blue-300 hover:bg-blue-50 hover:text-slate-950"
        >
          Open Google Account Permissions
        </a>
      </LegalSection>

      <LegalSection title="Helpful Links">
        <div className="flex flex-wrap gap-5 text-sm font-medium">
          <Link
            to="/privacy-policy"
            className="text-blue-700 transition hover:text-blue-800"
          >
            Privacy Policy
          </Link>
          <Link
            to="/terms-of-service"
            className="text-blue-700 transition hover:text-blue-800"
          >
            Terms of Service
          </Link>
          <a
            href="mailto:sparkfinancehq@gmail.com"
            className="text-blue-700 transition hover:text-blue-800"
          >
            Email SPARK
          </a>
        </div>
      </LegalSection>
    </PublicPageShell>
  );
}
