/**
 * Invitation and password-reset links from Supabase sign the person in with a token in the URL
 * (hash `#access_token=…&type=invite`, a PKCE `?code=`, or `?token_hash=&type=`). Links sent from
 * the app land on /auth/set-password; links sent from the Supabase dashboard ("Invite user") land
 * on the Site URL instead — the home or sign-in page, which ignored them. This says where such a
 * URL should go: the same tokens, on /auth/set-password. Null when there is nothing to forward.
 */
export const SET_PASSWORD = "/auth/set-password";

export function authLinkTarget(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.pathname === SET_PASSWORD) return null;
  const hash = new URLSearchParams(url.hash.slice(1));
  const q = url.searchParams;
  const carriesLink =
    (hash.has("access_token") && hash.has("refresh_token")) ||
    hash.has("error_description") ||
    q.has("code") ||
    (q.has("token_hash") && q.has("type")) ||
    q.has("error_description");
  return carriesLink ? `${SET_PASSWORD}${url.search}${url.hash}` : null;
}
