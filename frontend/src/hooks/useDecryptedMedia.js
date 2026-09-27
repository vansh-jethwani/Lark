import { useEffect, useState } from "react";
import {
  cacheDecryptedMediaUrl,
  fetchDecryptedMediaBytes,
  fetchGroupKey,
  getCachedDecryptedMediaUrl,
} from "../lib/groupCrypto";
import { refreshMessageMedia } from "../lib/media";

/**
 * Resolves a displayable/downloadable object URL for group-E2EE media.
 * For plaintext media returns { url: null } so callers fall back to the
 * original signed URL. For encrypted media the raw ciphertext URL is never
 * exposed — callers must render a placeholder until `url` resolves.
 */
export function useDecryptedMediaUrl({
  messageId,
  signedUrl,
  groupId,
  keyVersion,
  mediaIv,
  fileType,
  mediaType = "file",
}) {
  const encrypted = Boolean(
    messageId && signedUrl && groupId && Number(keyVersion) > 0 && mediaIv
  );

  const [url, setUrl] = useState(() =>
    encrypted ? getCachedDecryptedMediaUrl(messageId) : null
  );
  const [isLoading, setIsLoading] = useState(
    () => encrypted && !getCachedDecryptedMediaUrl(messageId)
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!encrypted || url) return; // url already resolved (e.g. from cache)
    let cancelled = false;

    const decryptFrom = async (src) => {
      const key = await fetchGroupKey(String(groupId), Number(keyVersion));
      return fetchDecryptedMediaBytes(src, key, mediaIv, fileType);
    };

    (async () => {
      try {
        let blob = await decryptFrom(signedUrl);
        if (!blob && messageId) {
          // Signed URL may have expired — refresh once and retry.
          try {
            const fresh = await refreshMessageMedia(messageId, mediaType);
            if (fresh?.url) blob = await decryptFrom(fresh.url);
          } catch {
            // fall through to failure state
          }
        }
        if (cancelled) return;
        if (blob) {
          const blobUrl = URL.createObjectURL(blob);
          cacheDecryptedMediaUrl(messageId, blobUrl);
          setUrl(blobUrl);
        } else {
          setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [encrypted, url, messageId, signedUrl, groupId, keyVersion, mediaIv, fileType, mediaType]);

  return { url: encrypted ? url : null, isLoading, failed, encrypted };
}
