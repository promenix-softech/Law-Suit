"use client";

import { useEffect } from "react";
import { authLinkTarget } from "@/lib/auth-link";

/**
 * An invitation or reset link that lands on any page other than /auth/set-password (the Site URL
 * of links sent from the Supabase dashboard) is passed on to it, tokens and all, so the person can
 * set their password instead of seeing the sign-in page. Renders nothing.
 */
export function AuthLinkForwarder() {
  useEffect(() => {
    const target = authLinkTarget(window.location.href);
    if (target) window.location.replace(target);
  }, []);
  return null;
}
