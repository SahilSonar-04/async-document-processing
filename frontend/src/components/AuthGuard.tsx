/**
 * Client-side route authentication guard.
 *
 * Automatically redirects unauthenticated users to `/login` for protected routes.
 *
 * @packageDocumentation
 */

import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuthStore } from "@/store/authStore";

const PUBLIC_PATHS = ["/login", "/register"];

/**
 * Route protection wrapper component verifying JWT token presence in state.
 *
 * @param props - Component child nodes.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!token && !PUBLIC_PATHS.includes(router.pathname)) {
      router.replace("/login");
    }
  }, [token, router]);

  if (!token && !PUBLIC_PATHS.includes(router.pathname)) {
    return null;
  }

  return <>{children}</>;
}
