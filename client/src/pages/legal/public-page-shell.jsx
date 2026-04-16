export function LegalSection({ title, children }) {
  return (
    <section className="border-t border-slate-200 py-8 first:border-t-0 first:pt-0">
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-7 text-slate-700">
        {children}
      </div>
    </section>
  );
}

export default function PublicPageShell({
  eyebrow,
  title,
  description,
  updatedAt,
  children
}) {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <header>
          <p className="text-xs font-semibold uppercase text-blue-600">{eyebrow}</p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-950 sm:text-[2.8rem]">{title}</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600 sm:text-[17px]">
            {description}
          </p>
          <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-4 text-sm text-slate-600 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <span>
                <span className="font-medium text-slate-950">Updated:</span>
                {' '}
                {updatedAt}
              </span>
              <a
                href="mailto:sparkfinancehq@gmail.com"
                className="font-medium text-blue-700 transition hover:text-blue-800"
              >
                sparkfinancehq@gmail.com
              </a>
            </div>
          </div>
        </header>

        <main className="mt-8 border-t border-slate-200 bg-transparent">{children}</main>
      </div>
    </div>
  );
}
