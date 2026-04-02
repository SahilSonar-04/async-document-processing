import Link from "next/link";
import { useRouter } from "next/router";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/",       label: "Dashboard",  icon: "⊞" },
  { href: "/upload", label: "Upload",     icon: "↑" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <Link href="/" className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center text-white text-sm font-bold">
                D
              </span>
              <span className="font-semibold text-gray-900 text-sm">DocFlow</span>
            </Link>

            <nav className="flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors",
                    router.pathname === item.href
                      ? "bg-brand-50 text-brand-700 font-medium"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  )}
                >
                  <span className="text-xs">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
              <a
                href="http://localhost:5555"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-100"
              >
                <span className="text-xs">◉</span>
                Flower
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
