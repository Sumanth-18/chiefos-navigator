import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to Postgres changes on the given tables and run `onChange`
 * whenever any row in them is inserted, updated or deleted — including
 * changes made from another page, tab or device. No caching involved.
 */
export function useRealtime(tables: string[], onChange: () => void, enabled = true) {
  const cb = useRef(onChange);
  cb.current = onChange;
  const key = tables.slice().sort().join(",");

  useEffect(() => {
    if (!enabled || !key) return;
    const list = key.split(",");
    const channel = supabase.channel(`realtime:${key}:${Math.random().toString(36).slice(2)}`);
    for (const table of list) {
      channel.on(
        // @ts-expect-error - supabase-js overload for postgres_changes
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => cb.current(),
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [key, enabled]);
}
