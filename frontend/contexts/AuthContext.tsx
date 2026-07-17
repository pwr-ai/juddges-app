"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User, Session, AuthChangeEvent } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Create the Supabase client only once per session
    const supabase = createClient();

    // Initial session check
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession || null);
      setUser(currentSession?.user || null);
      setLoading(false);
    });

    // Set up auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, currentSession: Session | null) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        setLoading(false);
      }
    );

    // Cleanup function to prevent memory leaks
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await createClient().auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await createClient().auth.signUp({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    // Server-side signout first: clears auth cookies and emits the
    // server-authoritative auth_signed_out event (app/api/auth/signout).
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
    const { error } = await createClient().auth.signOut();
    if (error) throw error;
    // Purge any per-user data the service worker may have cached during this
    // session before the next user can hit the same browser profile (#210).
    if (typeof navigator !== "undefined" && navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "CLEAR_CACHES" });
    }
    router.push("/auth/login");
  };

  const value = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
