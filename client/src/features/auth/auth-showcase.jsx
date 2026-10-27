export default function AuthShowcase({ signup = false }) {
  return (
    <aside className="auth-showcase" aria-label="SPARK dashboard preview">
      <div className="auth-showcase-copy">
        <h2>{signup ? <>A clear view,<br />{' '}from day one.</> : <>Your workspace,<br />{' '}in focus.</>}</h2>
        <p>{signup ? 'Your receipts and cash flow, in one workspace.' : 'Cash flow, receipts, and approvals in one place.'}</p>
      </div>
      <figure className="auth-dashboard-preview">
        <img src="/images/spark-dashboard-preview.jpg"
          alt="SPARK dashboard with demo cash balance, burn rate, runway, and expense charts"
          width="1521" height="990" decoding="async" />
      </figure>
      <span className="auth-showcase-caption">SPARK dashboard · Demo data</span>
    </aside>
  );
}
