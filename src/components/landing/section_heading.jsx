// Eyebrow, h2 and optional subtitle that every landing section starts with.
function SectionHeading({ eyebrow, title, subtitle, id, align = 'center' }) {
  return (
    <header className={`lp-heading lp-heading--${align}`} data-reveal>
      {eyebrow && <span className="section-eyebrow">{eyebrow}</span>}
      <h2 className="lp-title" id={id}>{title}</h2>
      {subtitle && <p className="lp-subtitle">{subtitle}</p>}
    </header>
  );
}

export default SectionHeading;
