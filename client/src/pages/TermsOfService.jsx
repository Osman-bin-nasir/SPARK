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

export default function TermsOfServicePage() {
  return (
    <PublicPageShell
      eyebrow="SPARK Legal"
      title="Terms of Service"
      updatedAt={updatedAt}
      description="These Terms of Service govern your use of the SPARK website, web application, connected workflows, Google Drive storage, and Google Sheets reporting."
    >
      <LegalSection title="1. Acceptance of Terms">
        <p>
          By accessing or using SPARK, you agree to these Terms of Service. If you use SPARK on behalf of an
          organization, you represent that you have authority to bind that organization to these terms.
        </p>
        <p className="text-sm">
          You can also review our
          {' '}
          <Link className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4" to="/privacy-policy">
            Privacy Policy
          </Link>
          {' '}
          or
          {' '}
          <Link className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4" to="/contact">
            contact us
          </Link>
          {' '}
          with questions about these terms.
        </p>
      </LegalSection>

      <LegalSection title="2. Eligibility and Authorized Use">
        <LegalList
          items={[
            'You must be legally able to enter into a binding agreement to use SPARK.',
            'You may use SPARK only for lawful business purposes.',
            "If you connect Google Drive for an organization, you represent that you are authorized to connect that Google account for that organization's document-storage workflow."
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Accounts and Security">
        <LegalList
          items={[
            'You are responsible for maintaining the confidentiality of your login credentials.',
            'You are responsible for activity that occurs under your account.',
            'You must promptly notify SPARK if you believe your account or connected services have been compromised.'
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Core Service">
        <p>
          SPARK helps teams collect finance documents and related text, process those submissions, store or reference
          the documents, maintain transaction records and dashboards, and sync organization transaction reports to
          SPARK-created Google Sheets.
        </p>
        <p className="border-l-4 border-blue-600 pl-4 text-sm font-medium leading-6 text-slate-800">
          SPARK uses submitted data, Google Drive data, and Google Sheets data only for the core functionality of the
          service. SPARK does not sell user data or Google user data.
        </p>
      </LegalSection>

      <LegalSection title="5. Your Content">
        <LegalList
          items={[
            'You retain ownership of the documents, text, and other data you submit to SPARK.',
            'You grant SPARK a limited, non-exclusive permission to host, store, process, display, and transmit that content only as needed to operate the service for your organization.',
            'You are responsible for ensuring you have the right to submit the content you upload or transmit through SPARK.'
          ]}
        />
      </LegalSection>

      <LegalSection title="6. Google Drive and Google Sheets Integration">
        <p>
          If you connect Google Drive, you authorize SPARK to use the Google permissions granted by you to create,
          organize, upload, process, report on, share with authorized organization members, and when necessary delete
          SPARK-managed finance documents and SPARK-created Google Sheets files in the connected Google Drive account.
        </p>
        <LegalList
          items={[
            'SPARK requests the drive.file permission so it can work with files, folders, and spreadsheets created or used through SPARK.',
            'SPARK does not request or use broad Google Drive or Google Sheets access that is unnecessary for the service.',
            'SPARK-created Google Sheets reports may include organization transaction data and may be shared with organization member email addresses.',
            'You are responsible for ensuring that the connected Google account and organization member list are appropriate for your organization data.',
            'SPARK does not sell Google user data.',
            'SPARK does not use Google Drive data for advertising or unrelated purposes.'
          ]}
        />
      </LegalSection>

      <LegalSection title="7. Acceptable Use">
        <LegalList
          items={[
            'You may not use SPARK to violate any law, regulation, contract, or third-party right.',
            'You may not upload malicious code, attempt unauthorized access, or interfere with the service.',
            'You may not misuse Google integrations or attempt to access data you are not authorized to access.'
          ]}
        />
      </LegalSection>

      <LegalSection title="8. Service Availability and Changes">
        <p>
          We may update, improve, suspend, or discontinue parts of SPARK from time to time. We may also modify these
          terms by posting an updated version and updating the effective date.
        </p>
      </LegalSection>

      <LegalSection title="9. Suspension or Termination">
        <p>
          We may suspend or terminate access to SPARK if we reasonably believe a user or organization has violated
          these terms, created a security risk, or used the service unlawfully.
        </p>
      </LegalSection>

      <LegalSection title="10. Disclaimer">
        <p>
          SPARK is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. To the fullest extent permitted by law,
          we disclaim implied warranties, including implied warranties of merchantability, fitness for a particular
          purpose, and non-infringement.
        </p>
      </LegalSection>

      <LegalSection title="11. Limitation of Liability">
        <p>
          To the fullest extent permitted by law, SPARK will not be liable for indirect, incidental, special,
          consequential, exemplary, or punitive damages, or for any loss of profits, revenues, data, or goodwill
          arising from or related to the use of the service.
        </p>
      </LegalSection>

      <LegalSection title="12. Contact">
        <p>
          For questions about these terms, Google OAuth verification, or legal requests, contact
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
