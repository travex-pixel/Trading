"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createLocalStore } from "./local-store";
import type { Repository, Store } from "./types";

let storeSingleton: Store | null = null;

export function getStore(): Store {
  if (!storeSingleton) storeSingleton = createLocalStore();
  return storeSingleton;
}

/** Subscribe to a repository's contents. Re-reads after any mutation through `mutate`. */
export function useRepository<T extends { id: string }>(select: (s: Store) => Repository<T>) {
  const repo = useMemo(() => select(getStore()), [select]);
  const [items, setItems] = useState<T[] | null>(null);
  const refresh = useCallback(async () => {
    setItems(await repo.list());
  }, [repo]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const put = useCallback(
    async (item: T) => {
      await repo.put(item);
      await refresh();
    },
    [repo, refresh],
  );
  const remove = useCallback(
    async (id: string) => {
      await repo.remove(id);
      await refresh();
    },
    [repo, refresh],
  );
  return { items, loading: items === null, put, remove, refresh, repo };
}

export const selectExperiments = (s: Store) => s.experiments;
export const selectPortfolios = (s: Store) => s.portfolios;
export const selectCompetitions = (s: Store) => s.competitions;
