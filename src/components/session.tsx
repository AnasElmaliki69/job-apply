"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase";
import { message } from "@/lib/schemas";
type State = { client: SupabaseClient | null; session: Session | null; loading: boolean; error: string };
const Context = createContext<State>({ client: null, session: null, loading: true, error: "" });
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ client: null, session: null, loading: true, error: "" });
  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    try {
      const client = getBrowserClient();
      let changed = false;
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        changed = true;
        if (active) setState({ client, session, loading: false, error: "" });
      });
      unsubscribe = () => data.subscription.unsubscribe();
      void client.auth.getSession().then(({ data, error }) => {
        if (active && !changed) setState({ client, session: data.session, loading: false, error: error?.message ?? "" });
      }).catch((error: unknown) => {
        if (active) setState({ client, session: null, loading: false, error: message(error) });
      });
    } catch (error) { setState({ client: null, session: null, loading: false, error: message(error) }); }
    return () => { active = false; unsubscribe(); };
  }, []);
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export function useSession() { return useContext(Context); }
