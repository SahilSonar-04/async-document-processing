/**
 * Top-level application shell providing navigation bar, identity status, and layout framing.
 *
 * @packageDocumentation
 */

import Link from "next/link";
import { useRouter } from "next/router";
import { LayoutGrid, Upload as UploadIcon, MessageSquare, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/upload", label: "Upload", icon: UploadIcon },
  { href: "/ask", label: "Ask", icon: MessageSquare },
];

/**
 * Props contract for the main application Layout component.
 */
interface LayoutProps {
  /** Page child nodes to render inside main container */
  children: React.ReactNode;
}

/**
 * Global responsive application layout with sticky header navigation and user session controls.
 */
export function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const handleLogout = () => {
    clearAuth();
    router.push("/login");
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-10 border-b border-subtle bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md border border-subtle font-mono text-xs font-semibold text-accent">
              {"{ }"}
            </span>
            <span className="text-sm font-semibold text-primary">DocFlow</span>
          </Link>

          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = router.pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                    active ? "text-primary" : "text-secondary hover:text-primary"
                  )}
                >
                  <Icon size={14} />
                  {item.label}
                  {active && (
                    <span className="absolute -bottom-[9px] left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-accent" />
                  )}
                </Link>
              );
            })}

            {user && (
              <div className="ml-2 flex items-center gap-2 border-l border-subtle pl-3">
                <span className="hidden font-mono text-xs text-tertiary sm:inline">{user.email}</span>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-secondary hover:bg-surface-raised hover:text-primary"
                  title="Log out"
                >
                  <LogOut size={14} />
                </button>
              </div>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
