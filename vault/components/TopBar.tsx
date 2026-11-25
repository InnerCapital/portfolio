import ThemeToggle from "./ThemeToggle";

export default function TopBar({
  section,
  children,
}: {
  section?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="topbar">
      <a href="/" className="brand" aria-label="AH Vault home">
        <span className="brand-mark">ACME HIRE.</span>
        <span className="brand-sep" />
        <span className="brand-sub">Vault{section ? ` / ${section}` : ""}</span>
      </a>
      <nav>
        {children}
        <ThemeToggle />
      </nav>
    </header>
  );
}
