import { Link } from 'react-router-dom';

function ReceiptIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3h10a2 2 0 0 1 2 2v16l-3-1.5L13 21l-3-1.5L7 21l-3-1.5V5a2 2 0 0 1 2-2h1Z" stroke="#84adff" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="#84adff" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3 5 6v6c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-3Z" stroke="#d674ff" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" stroke="#d674ff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 13h4l2.5-6 4 12 2.5-6h5" stroke="#00fd93" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AuthAside() {
  return (
    <aside className="auth-visual">
      <div className="auth-brand-row">
        <Link className="auth-brand" to="/" aria-label="SPARK home">
          <img src="/logo.png" alt="" />
          <span>SPARK</span>
        </Link>
        <Link className="auth-home-link" to="/">
          Back to site
          <span aria-hidden="true">↗</span>
        </Link>
      </div>

      <div className="auth-visual-body">
        <span className="auth-pill">
          <span className="auth-pill-dot" aria-hidden="true" />
          Finance runs itself
        </span>
        <h1 className="auth-headline">
          Receipts in.
          <br />
          Books <em>closed.</em>
        </h1>
        <p className="auth-lede">
          Forward a receipt from Telegram, WhatsApp, Drive, or a direct upload. SPARK extracts the details,
          blocks duplicates, and keeps your burn and runway honest.
        </p>

        <ul className="auth-points">
          <li className="auth-point">
            <span className="auth-point-icon"><ReceiptIcon /></span>
            <span><strong>OCR + LLM extraction</strong> turns messy receipts into structured vendor, tax, and category records.</span>
          </li>
          <li className="auth-point">
            <span className="auth-point-icon"><ShieldIcon /></span>
            <span><strong>Duplicate shield</strong> checks every upload, Drive file, and chat forward before it posts.</span>
          </li>
          <li className="auth-point">
            <span className="auth-point-icon"><PulseIcon /></span>
            <span><strong>Live burn, runway, and budgets</strong> with approvals routed to the right owner.</span>
          </li>
        </ul>

        <div className="auth-metrics">
          <div>
            <span className="auth-metric-value">92%</span>
            <span className="auth-metric-label">Auto-categorized</span>
          </div>
          <div>
            <span className="auth-metric-value">99%</span>
            <span className="auth-metric-label">Duplicate checks</span>
          </div>
          <div>
            <span className="auth-metric-value">8 hrs</span>
            <span className="auth-metric-label">Saved weekly</span>
          </div>
        </div>
      </div>

      <div className="auth-visual-footer">
        <span>© 2026 SPARK Financial</span>
        <span>
          <Link to="/privacy-policy">Privacy</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/terms-of-service">Terms</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/contact">Contact</Link>
        </span>
      </div>
    </aside>
  );
}
