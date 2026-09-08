import { useMemo, useRef } from "react";
import type { ChatEntry } from "../network/types.js";
import { layoutMessage, type MessageRow } from "../ui/MessageList.js";

type LayoutParams = {
  cols: number;
  hostNickname: string;
  showHostBadge: boolean;
};

/**
 * Flat row list for the whole transcript, laid out once per entry. The cache is keyed by
 * entry id and dropped whenever the layout parameters change, so a normal render only
 * lays out the entries that were just appended.
 */
export function useMessageRows(
  messages: readonly ChatEntry[],
  cols: number,
  hostNickname: string,
  showHostBadge: boolean,
): readonly MessageRow[] {
  const cacheRef = useRef(new Map<string, MessageRow[]>());
  const paramsRef = useRef<LayoutParams>({ cols, hostNickname, showHostBadge });

  const params = paramsRef.current;
  if (
    params.cols !== cols ||
    params.hostNickname !== hostNickname ||
    params.showHostBadge !== showHostBadge
  ) {
    cacheRef.current.clear();
    paramsRef.current = { cols, hostNickname, showHostBadge };
  }

  return useMemo(() => {
    const cache = cacheRef.current;
    const rows: MessageRow[] = [];
    const live = new Set<string>();

    for (const entry of messages) {
      live.add(entry.id);
      let entryRows = cache.get(entry.id);
      if (entryRows === undefined) {
        entryRows = layoutMessage(entry, cols, hostNickname, showHostBadge);
        cache.set(entry.id, entryRows);
      }
      // Spreading would hit the argument limit on a message with tens of thousands of rows.
      for (const row of entryRows) rows.push(row);
    }

    if (cache.size > live.size) {
      for (const id of cache.keys()) {
        if (!live.has(id)) cache.delete(id);
      }
    }

    return rows;
  }, [messages, cols, hostNickname, showHostBadge]);
}
