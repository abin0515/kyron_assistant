import Link from "next/link";

const projectSteps = [
  "Describe the course",
  "Add source material",
  "Generate a Kyron draft",
] as const;

export default function HomePage() {
  return (
    <main className="page-shell">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <section className="hero" aria-labelledby="page-title">
        <header className="site-header">
          <Link className="brand" href="/" aria-label="Kyron launcher home">
            <span className="brand-mark" aria-hidden="true">
              K
            </span>
            <span>Stevens CPE</span>
          </Link>

          <span className="status-pill">
            <span className="status-dot" aria-hidden="true" />
            Preview environment
          </span>
        </header>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Course creation, streamlined</p>
            <h1 id="page-title">
              Launch a thoughtful first draft in Kyron.
            </h1>
            <p className="intro">
              A focused workspace for the Stevens CPE team to prepare course
              details, add source material, and start an editable Kyron draft.
            </p>

            <div className="actions" aria-label="Project status">
              <span className="primary-action" aria-disabled="true">
                Launcher coming next
              </span>
              <a className="secondary-action" href="#deployment-status">
                View deployment status
              </a>
            </div>
          </div>

          <aside className="workflow-card" aria-label="Planned workflow">
            <div className="card-heading">
              <span>Draft workflow</span>
              <span className="card-label">MVP</span>
            </div>

            <ol className="workflow-list">
              {projectSteps.map((step, index) => (
                <li key={step}>
                  <span className="step-number">{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>

            <div className="workflow-footer">
              <span className="mini-mark" aria-hidden="true">
                ✓
              </span>
              Human review remains in Kyron Studio
            </div>
          </aside>
        </div>

        <footer className="deployment-bar" id="deployment-status">
          <div>
            <span className="deployment-kicker">Deployment status</span>
            <strong>Next.js project shell is ready</strong>
          </div>
          <span className="environment-tag">Vercel preview</span>
        </footer>
      </section>
    </main>
  );
}
