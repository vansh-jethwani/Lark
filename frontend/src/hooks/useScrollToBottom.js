import { useEffect, useRef } from "react";

const NEAR_BOTTOM_PX = 120;

/**
 * Scrolls a container to the bottom when `threadKey` or `lastItemId` changes
 * (e.g. new message or switched conversation). Returns a ref for the scrollable element.
 *
 * When the conversation switches, it always scrolls to the bottom. For new
 * messages it only auto-scrolls when the user is already near the bottom,
 * so reading older history is never yanked away.
 */
function useScrollToBottom(threadKey, lastItemId) {
  const scrollRef = useRef(null);
  const prevThreadKeyRef = useRef(threadKey);

  useEffect(() => {
    if (threadKey == null || threadKey === "") return;
    const el = scrollRef.current;
    if (!el) return;

    const switchedConversation = prevThreadKeyRef.current !== threadKey;
    prevThreadKeyRef.current = threadKey;

    if (!switchedConversation) {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom > NEAR_BOTTOM_PX) return;
    }

    const scrollToBottom = () => {
      el.scrollTop = el.scrollHeight;
    };
    scrollToBottom();
    requestAnimationFrame(scrollToBottom);
  }, [threadKey, lastItemId]);

  return scrollRef;
}

export default useScrollToBottom;
