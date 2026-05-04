/**
 * Standard page header used across list pages — matches the Connected Hub
 * design's `.ch-page-header` block. Server-component-safe (no hooks).
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="ch-page-header">
      <div>
        <h1 className="ch-page-title">{title}</h1>
        {subtitle && <p className="ch-page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="ch-page-actions">{actions}</div>}
    </div>
  );
}
