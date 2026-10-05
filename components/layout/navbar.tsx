"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { CloseIcon, MenuIcon, UserIcon, WaveIcon } from "@/components/ui/icons";
import { ThemeToggle } from "./theme-toggle";
import type { SessionUser } from "@/lib/auth/types";
import { cn } from "@/lib/utils/cn";

const NAV_LINKS = [
  { href: "/tts", label: "Text → Speech" },
  { href: "/stt", label: "Speech → Text" },
  { href: "/roundtrip", label: "Round-Trip" },
  { href: "/about", label: "About" },
] as const;

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { user: null }))
      .then((payload: { user: SessionUser | null }) => {
        if (!cancelled) setUser(payload.user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    setOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      toast.success("You have been signed out.");
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Sign-out failed. Please try again.");
    }
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6" aria-label="Main">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg px-1 py-1 text-lg font-bold tracking-tight"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-on-primary">
            <WaveIcon width={20} height={20} />
          </span>
          VoiceBridge
        </Link>

        <div className="ml-4 hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive(link.href)
                  ? "bg-subtle text-fg"
                  : "text-muted hover:bg-subtle hover:text-fg",
              )}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/dashboard"
            aria-current={isActive("/dashboard") ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive("/dashboard")
                ? "bg-subtle text-fg"
                : "text-muted hover:bg-subtle hover:text-fg",
            )}
          >
            Dashboard
          </Link>
          {user?.role === "admin" && (
            <Link
              href="/admin"
              aria-current={isActive("/admin") ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive("/admin")
                  ? "bg-subtle text-fg"
                  : "text-muted hover:bg-subtle hover:text-fg",
              )}
            >
              Admin
            </Link>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />

          {loading ? (
            <div className="skeleton hidden h-9 w-28 sm:block" aria-hidden="true" />
          ) : user ? (
            <div className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => setMenuOpen((value) => !value)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="btn btn-secondary !min-h-9 !px-3 !py-1.5"
              >
                <UserIcon width={16} height={16} />
                <span className="max-w-[8rem] truncate">{user.name}</span>
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-line bg-card p-1 shadow-lg"
                >
                  <div className="border-b border-line px-3 py-2 text-xs text-muted">
                    {user.email}
                  </div>
                  <Link
                    href="/dashboard"
                    role="menuitem"
                    className="block rounded-lg px-3 py-2 text-sm hover:bg-subtle"
                  >
                    Dashboard
                  </Link>
                  {user.role === "admin" && (
                    <Link
                      href="/admin"
                      role="menuitem"
                      className="block rounded-lg px-3 py-2 text-sm hover:bg-subtle"
                    >
                      Admin console
                    </Link>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={logout}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-subtle"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link href="/login" className="btn btn-ghost !min-h-9">
                Log in
              </Link>
              <Link href="/register" className="btn btn-primary !min-h-9">
                Create account
              </Link>
            </div>
          )}

          <button
            type="button"
            className="btn btn-ghost btn-icon lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-line bg-bg px-4 py-3 lg:hidden">
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-lg px-3 py-3 text-sm font-medium",
                  isActive(link.href) ? "bg-subtle text-fg" : "text-muted",
                )}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/dashboard"
              className={cn(
                "rounded-lg px-3 py-3 text-sm font-medium",
                isActive("/dashboard") ? "bg-subtle text-fg" : "text-muted",
              )}
            >
              Dashboard
            </Link>
            {user?.role === "admin" && (
              <Link href="/admin" className="rounded-lg px-3 py-3 text-sm font-medium text-muted">
                Admin
              </Link>
            )}
            <div className="mt-2 flex flex-col gap-2 border-t border-line pt-3">
              {user ? (
                <>
                  <div className="px-1 text-xs text-muted">
                    Signed in as {user.email}
                  </div>
                  <button type="button" onClick={logout} className="btn btn-secondary w-full">
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" className="btn btn-secondary w-full">
                    Log in
                  </Link>
                  <Link href="/register" className="btn btn-primary w-full">
                    Create account
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
