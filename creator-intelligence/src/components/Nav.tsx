"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import BrandLogo from "./BrandLogo";

const links = [
  { href: "/", label: "Home" },
  { href: "/ideas", label: "Ideas" },
  { href: "/library", label: "Library" },
];
const menuLinks = [
  { href: "/creators", label: "Muses" },
  { href: "/profile", label: "Your profile" },
  { href: "/settings", label: "Settings" },
];

export default function Nav({ who }: { who?: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const initial = (who || "?").replace(/^@/, "").slice(0, 1).toUpperCase();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <nav className="top">
      <Link href="/" className="brand" aria-label="Home">
        <BrandLogo height={38} />
      </Link>
      <div className="links">
        {links.map((l) => (
          <Link key={l.href} href={l.href} aria-current={active(l.href) ? "page" : undefined}>{l.label}</Link>
        ))}
        <div className="acct-menu" ref={ref}>
          <button className="avatar-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={who || "Account"}>
            <span className="avatar-initial">{initial}</span>
          </button>
          {open ? (
            <div className="acct-pop" role="menu">
              {who ? <div className="acct-who">{who}</div> : null}
              {menuLinks.map((l) => (
                <Link key={l.href} href={l.href} role="menuitem" onClick={() => setOpen(false)}>{l.label}</Link>
              ))}
              <form method="post" action="/api/auth/logout"><button type="submit" role="menuitem">Sign out</button></form>
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
