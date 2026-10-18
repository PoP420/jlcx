import { useContext, useEffect, useMemo, useState, type ReactNode, useCallback } from "react";
import { createContext } from "react";
import { supabase } from "../lib/supabase";
import type { Session, User } from "@supabase/supabase-js";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<{ error: Error | null }>;
  acceptInvite: (email: string, inviteHash: string, password: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const initialize = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    };

    const authSubscription = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!active) return;
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);
      },
    );

    initialize();

    return () => {
      active = false;
      authSubscription.data.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? new Error(error.message) : null };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    return { error: error ? new Error(error.message) : null };
  }, []);

  const acceptInvite = useCallback(
    async (email: string, inviteHash: string, password: string) => {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: inviteHash,
        type: "invite",
      });
      if (verifyError) {
        return { error: new Error(verifyError.message) };
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      return { error: updateError ? new Error(updateError.message) : null };
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, session, loading, signIn, signOut, acceptInvite }),
    [user, session, loading, signIn, signOut, acceptInvite],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}