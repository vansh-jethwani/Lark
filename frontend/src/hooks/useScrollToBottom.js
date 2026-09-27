import { useEffect, useRef } from "react";

const NEAR_BOTTOM_PX = 120;

/**
 * Scrolls a container to the bottom when `threadKey` or `lastItemId` changes
 * (e.g. new message or switched conversation). Returns a ref for the scrollable element.
 *
 * When the conversation switches, it waits until the new conversation's
 * messages have actually arrived and then jumps to the bottom once, so the
 * latest messages are visible. For new messages it only auto-scrolls when
 * the user is already near the bottom, so reading older history is never
 * yanked away.
 */
function useScrollToBottom(threadKey, lastItemId) {
  const scrollRef = useRef(null);
  const prevThreadKeyRef = useRef(threadKey);
  const pendingInitialScrollRef = useRef(true);

  useEffect(() => {
    if (threadKey == null || threadKey === "") return;
    const el = scrollRef.current;
    if (!el) return;

    if (prevThreadKeyRef.current !== threadKey) {
      prevThreadKeyRef.current = threadKey;
      // Don't scroll yet — the message list is still empty; wait until the
      // new conversation's messages arrive below.
      pendingInitialScrollRef.current = true;
    }

    const scrollToBottom = () => {
      el.scrollTop = el.scrollHeight;
    };

    if (pendingInitialScrollRef.current) {
      if (lastItemId == null) return; // messages haven't loaded yet
      pendingInitialScrollRef.current = false;
      scrollToBottom();
      requestAnimationFrame(scrollToBottom);
      return;
    }

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom > NEAR_BOTTOM_PX) return;

    scrollToBottom();
    requestAnimationFrame(scrollToBottom);
  }, [threadKey, lastItemId]);

  return scrollRef;
}

export default useScrollToBottom;
