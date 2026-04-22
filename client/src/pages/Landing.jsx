import { Link } from 'react-router-dom';

const stats = [
  {
    value: '18k+',
    label: 'Receipts processed',
    accent: 'text-[#84adff]',
    body: 'Hyper-accurate OCR pipeline capturing every decimal from Telegram and Drive.'
  },
  {
    value: '64%',
    label: 'Approval cycles',
    accent: 'text-[#d674ff]',
    body: 'Faster feedback loops by routing exceptions directly to project leads.'
  },
  {
    value: '5 days',
    label: 'Month close saved',
    accent: 'text-[#00fd93]',
    body: 'Eliminating manual data entry to sync books in real time across your stack.'
  }
];

const TELEGRAM_BOT_URL = 'https://t.me/osman80bot';

function SparkIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M13.2 2 5 13.4h6.1L9.7 22 19 9.7h-6.4L13.2 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg className="mb-6 h-9 w-9 text-[#84adff]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3h10a2 2 0 0 1 2 2v16l-3-1.5L13 21l-3-1.5L7 21l-3-1.5V5a2 2 0 0 1 2-2h1Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function RouteIcon() {
  return (
    <svg className="mb-6 h-9 w-9 text-[#d674ff]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 5v4a3 3 0 0 0 3 3h6a3 3 0 0 1 3 3v4M6 5h5M6 5H3M18 19h3M18 19h-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 12V5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg className="mb-6 h-9 w-9 text-[#00fd93]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 13h6V4H4v9ZM14 20h6V4h-6v16ZM4 20h6v-4H4v4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function LandingPage({ isAuthenticated = false }) {
  const appPath = isAuthenticated ? '/dashboard' : '/login';

  return (
    <main className="min-h-screen bg-[#0e0e0e] font-sans text-white selection:bg-[#84adff] selection:text-[#00214e]">
      <section id="overview" className="relative flex min-h-[760px] items-center overflow-hidden px-5 py-20 sm:px-6 lg:py-24">
        <div className="pointer-events-none absolute right-[-36%] top-[12%] h-[560px] w-[560px] opacity-20 sm:right-[-12%] lg:right-[2%] lg:top-[8%]" aria-hidden="true">
          <div className="absolute inset-0 rounded-full bg-[#84adff]/20 blur-[90px]" />
          <img
            className="relative h-full w-full object-contain drop-shadow-[0_0_34px_rgba(132,173,255,0.35)]"
            src="/logo.png"
            alt=""
          />
        </div>

        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 lg:grid-cols-12">
          <div className="relative z-10 lg:col-span-7">
            <div className="mb-8">
              <Link className="inline-flex items-center gap-2 text-[#84adff]" to="/">
                <img className="h-8 w-8 object-contain" src="/logo.png" alt="" />
                <span className="text-2xl font-black tracking-tight">SPARK</span>
              </Link>
            </div>
            <span className="mb-6 inline-flex rounded-full border border-white/10 bg-[#262626] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#00fd93]">
              System Status: Active
            </span>
            <h1 className="mb-8 max-w-4xl text-5xl font-black leading-[1.15] tracking-tight text-white sm:text-6xl md:text-7xl">
              SPARK turns receipts, approvals, and <span className="text-[#84adff] drop-shadow-[0_0_8px_rgba(132,173,255,0.4)]">spend signals</span> into a live finance command center.
            </h1>
            <div className="flex flex-wrap items-center gap-4">
              <a
                className="rounded-full bg-[#84adff] px-8 py-4 text-base font-bold text-[#00214e] shadow-[0_0_30px_rgba(132,173,255,0.3)] transition hover:scale-105 active:scale-95"
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noreferrer"
              >
                Launch Bot on Telegram
              </a>
              <Link className="rounded-full border border-white/10 px-8 py-4 font-medium text-white/80 transition hover:bg-white/5" to="/privacy-policy">
                Review privacy
              </Link>
            </div>
          </div>

          <div className="relative lg:col-span-5">
            <div className="relative z-10 rounded-2xl border border-white/5 bg-[#84adff]/[0.03] p-6 backdrop-blur-2xl">
              <div className="mb-12 flex items-start justify-between">
                <div>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">Real-time runway</p>
                  <div className="text-4xl font-black tracking-tighter">$4,200<span className="text-2xl opacity-50">.00</span></div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00fd93]/20 text-[#00fd93]">
                  <SparkIcon className="h-5 w-5" />
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/60">Automated Approvals</span>
                  <span className="font-bold text-[#00fd93]">92%</span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-[#262626]">
                  <div className="h-full w-[92%] bg-[#00fd93]" />
                </div>
              </div>
            </div>
            <div className="absolute -inset-4 rounded-full bg-[#84adff]/10 blur-[80px]" />
          </div>
        </div>
      </section>

      <section className="border-y border-white/5 bg-[#131313] px-5 py-24 sm:px-6">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 md:grid-cols-3 md:gap-24">
          {stats.map((stat) => (
            <div className="space-y-2" key={stat.label}>
              <div className="text-5xl font-black tracking-tight text-white">{stat.value}</div>
              <p className={`text-[11px] font-bold uppercase tracking-[0.2em] ${stat.accent}`}>{stat.label}</p>
              <p className="text-sm leading-relaxed text-white/60">{stat.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="px-5 py-32 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16">
            <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-[#84adff]">Capabilities</h2>
            <h3 className="text-4xl font-black tracking-tight text-white">TODAY: Finance workspace</h3>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
            <article className="group relative overflow-hidden rounded-3xl border border-white/5 bg-[#131313] p-8 md:col-span-8 md:min-h-[360px]">
              <div className="relative z-10 max-w-sm">
                <ReceiptIcon />
                <h4 className="mb-4 text-2xl font-bold">Capture receipts from Drive, Telegram, and manual uploads</h4>
                <p className="leading-relaxed text-white/60">No more chasing PDFs. Forward a receipt on Telegram and SPARK categorizes it instantly using context-aware AI.</p>
              </div>
              <div className="absolute bottom-0 right-0 h-64 w-72 translate-x-10 translate-y-10 rounded-tl-3xl bg-[#262626] p-5 opacity-60 transition duration-700 group-hover:opacity-90 sm:w-96">
                <div className="h-full rounded-2xl bg-white/5 p-5">
                  <div className="mb-4 h-4 w-24 rounded bg-white/10" />
                  <div className="space-y-3">
                    <div className="h-3 rounded bg-white/10" />
                    <div className="h-3 w-5/6 rounded bg-white/10" />
                    <div className="h-3 w-2/3 rounded bg-white/10" />
                  </div>
                  <div className="mt-8 grid grid-cols-2 gap-3">
                    <div className="h-14 rounded bg-[#84adff]/20" />
                    <div className="h-14 rounded bg-[#00fd93]/20" />
                  </div>
                </div>
              </div>
            </article>

            <article className="flex flex-col justify-between rounded-3xl border border-white/10 bg-[#262626] p-8 md:col-span-4">
              <div>
                <RouteIcon />
                <h4 className="mb-4 text-xl font-bold">Route exceptions to the right approver</h4>
                <p className="text-sm leading-relaxed text-white/60">Automated logic handles 90% of spend. For the rest, we find the decision maker for you.</p>
              </div>
              <div className="mt-8 flex items-center -space-x-3">
                <div className="grid h-10 w-10 place-items-center rounded-full border-2 border-[#0e0e0e] bg-[#84adff] text-xs font-black text-[#00214e]">FA</div>
                <div className="grid h-10 w-10 place-items-center rounded-full border-2 border-[#0e0e0e] bg-[#d674ff] text-xs font-black text-[#390050]">AP</div>
                <div className="grid h-10 w-10 place-items-center rounded-full border-2 border-[#0e0e0e] bg-neutral-800 text-[10px] font-bold">+12</div>
              </div>
            </article>

            <article className="group flex flex-col items-center gap-12 rounded-3xl border border-white/5 bg-[#131313] p-8 md:col-span-12 md:flex-row md:p-10">
              <div className="order-2 flex-1 md:order-1">
                <DashboardIcon />
                <h4 className="mb-4 text-2xl font-bold">Track spend, budgets, and month-close status in one workspace</h4>
                <p className="mb-8 leading-relaxed text-white/60">Visual command center for founders who need to know where every dollar is going without opening a spreadsheet.</p>
                <Link className="inline-flex items-center gap-2 font-bold tracking-tight text-[#84adff] transition-all group-hover:gap-4" to={appPath}>
                  Explore Workspace <span aria-hidden="true">-&gt;</span>
                </Link>
              </div>
              <div className="order-1 min-h-72 w-full flex-1 overflow-hidden rounded-2xl bg-[#262626] shadow-2xl md:order-2">
                <div className="relative flex h-full min-h-72 items-center justify-center p-8">
                  <div className="absolute inset-8 rounded-full bg-[#84adff]/10 blur-[70px]" />
                  <div className="relative grid w-full max-w-sm gap-5 rounded-2xl border border-white/10 bg-[#0e0e0e]/70 p-6 backdrop-blur-xl">
                    <div className="flex items-center gap-3">
                      <img className="h-12 w-12 object-contain drop-shadow-[0_0_14px_rgba(132,173,255,0.4)]" src="/logo.png" alt="" />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00fd93]">Live workspace</p>
                        <p className="text-lg font-black tracking-tight">SPARK Finance OS</p>
                      </div>
                    </div>
                    <div className="grid gap-3">
                      <div className="rounded-xl border border-white/5 bg-white/[0.04] p-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">Inbox</p>
                        <p className="mt-2 text-sm font-semibold text-white">Receipts, approvals, and spend context</p>
                      </div>
                      <div className="rounded-xl border border-[#00fd93]/20 bg-[#00fd93]/10 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#00fd93]">Automation ready</p>
                        <p className="mt-2 text-sm text-white/70">Telegram inputs flow into review queues.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section id="audit" className="px-5 py-32 sm:px-6">
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-[40px] border border-white/5 bg-[#84adff]/[0.03] p-12 text-center backdrop-blur-2xl md:p-20">
          <div className="absolute left-1/2 top-0 h-1/2 w-full -translate-x-1/2 rounded-full bg-[#84adff]/10 blur-[120px]" />
          <div className="relative">
            <h2 className="mx-auto mb-6 max-w-xl text-3xl font-black tracking-tight text-white md:text-5xl">Ready to ignite your finance stack?</h2>
            <p className="mx-auto mb-8 max-w-md text-sm leading-relaxed text-white/70">Join 500+ high-growth companies centralizing their spend signals with SPARK.</p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <a
                className="rounded-full bg-[#84adff] px-8 py-4 font-bold text-[#00214e] shadow-[0_0_30px_rgba(132,173,255,0.25)] transition hover:scale-105 active:scale-95"
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noreferrer"
              >
                Launch Bot on Telegram
              </a>
              <Link className="rounded-full border border-white/10 px-8 py-4 font-medium text-white/80 transition hover:bg-white/5" to="/contact">
                Talk to founder
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 bg-[#000] px-5 py-10 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 text-[10px] uppercase tracking-[0.2em] text-white/50 md:flex-row md:items-center md:justify-between">
          <Link className="font-black text-white" to="/">SPARK</Link>
          <p>© 2026 SPARK Financial.</p>
          <div className="flex gap-6">
            <Link className="transition hover:text-white" to="/contact">Contact</Link>
            <Link className="transition hover:text-white" to="/privacy-policy">Privacy</Link>
            <Link className="transition hover:text-white" to="/terms-of-service">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

export default LandingPage;
