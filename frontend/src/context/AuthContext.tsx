import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchMe, login as loginRequest, logout as logoutRequest } from "@/api/endpoints";
import { setAuthToken } from "@/api/client";
import { decodeJwtPayload } from "@/utils/jwt";
import type { AuthUser, LoginUserId } from "@/types/api";

const TOKEN_STORAGE_KEY = "cortex.access_token";
const USER_STORAGE_KEY = "cortex.user";

/** Sources role/categories from the JWT's own claims (RBAC-driving fields), keeping the
 * remaining profile fields (name/email/avatar) from the server response body. */
function mergeUserWithTokenClaims(user: AuthUser, token: string): AuthUser {
  const claims = decodeJwtPayload(token);
  if (!claims) return user;
  return { ...user, role: claims.role, categories: claims.categories };
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isInitializing: boolean;
  isLoggingIn: boolean;
  loginError: string | null;
  loginAs: (userId: LoginUserId) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Rehydrate from localStorage on mount (refresh-persistence), then
  // validate the token against /auth/me so stale/expired tokens are cleared.
  //
  // React 18 StrictMode intentionally double-invokes effects in development
  // (mount -> cleanup -> mount) to surface missing cleanup like this. The
  // AbortController cancels the first invocation's in-flight request outright
  // (so it doesn't hit the network twice per mount) rather than merely
  // ignoring its result, and the `cancelled` flag additionally guards against
  // any late resolution racing a setState after teardown.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    const storedUser = readStoredUser();

    if (!storedToken || !storedUser) {
      setIsInitializing(false);
      return;
    }

    setAuthToken(storedToken);
    setToken(storedToken);
    setUser(mergeUserWithTokenClaims(storedUser, storedToken));

    fetchMe(controller.signal)
      .then((freshUser) => {
        if (cancelled) return;
        const merged = mergeUserWithTokenClaims(freshUser, storedToken);
        setUser(merged);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(merged));
      })
      .catch((err) => {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        setAuthToken(null);
        setToken(null);
        setUser(null);
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(USER_STORAGE_KEY);
      })
      .finally(() => {
        if (!cancelled) setIsInitializing(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const loginAs = useCallback(async (userId: LoginUserId) => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const response = await loginRequest({ user_id: userId });
      const user = mergeUserWithTokenClaims(response.user, response.access_token);
      setAuthToken(response.access_token);
      setToken(response.access_token);
      setUser(user);
      localStorage.setItem(TOKEN_STORAGE_KEY, response.access_token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setLoginError(message);
      throw err;
    } finally {
      setIsLoggingIn(false);
    }
  }, []);

  const logout = useCallback(() => {
    // Best-effort: record the logout audit event before the token is gone. Not awaited - the
    // UI shouldn't block on it, and a failed request here shouldn't prevent logging out locally.
    void logoutRequest().catch(() => {});
    setAuthToken(null);
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, isInitializing, isLoggingIn, loginError, loginAs, logout }),
    [user, token, isInitializing, isLoggingIn, loginError, loginAs, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
