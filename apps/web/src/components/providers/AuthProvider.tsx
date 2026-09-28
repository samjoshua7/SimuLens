'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const userRef = useRef<User | null>(null);
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      sessionRef.current = session;
      userRef.current = session?.user ?? null;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        const newUser = newSession?.user ?? null;
        // Only update user reference if the actual user ID or email changed (or logged in/out)
        // This prevents window focus / TOKEN_REFRESHED events from resetting components across tab switches
        const userChanged =
          (!userRef.current && newUser) ||
          (userRef.current && !newUser) ||
          (userRef.current && newUser && (userRef.current.id !== newUser.id || userRef.current.email !== newUser.email));

        if (userChanged) {
          userRef.current = newUser;
          setUser(newUser);
        }

        if (newSession?.access_token !== sessionRef.current?.access_token) {
          sessionRef.current = newSession;
          setSession(newSession);
        }

        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    userRef.current = null;
    sessionRef.current = null;
    setUser(null);
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut: handleSignOut }}>
      {children}
    </AuthContext.Provider>
  );
}
