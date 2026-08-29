import { useState } from "react";
import { PlayIcon } from "lucide-react";

import { isImageKitUrl, withTransform } from "../../lib/imagekit";

// Chat videos are stored on ImageKit, so we let ImageKit optimize delivery
// on the fly via URL transformations (compressed + sized for the bubble).
// Note: q-auto isn't enabled for video on this account (returns 400), so use a fixed quality.
// https://imagekit.io/docs/video-transformation
const POSTER_TRANSFORM = "q-80,w-640";

/** ImageKit can extract a poster frame by appending `/ik-thumbnail.jpg`. */
function buildPosterUrl(url) {
  if (!isImageKitUrl(url)) return undefined;
  const [path] = url.split("?");
  return withTransform(`${path}/ik-thumbnail.jpg`, POSTER_TRANSFORM);
}

/** ImageKit-optimized chat video poster with an app-level play action. */
export function MessageVideo({ src, thumbnailSrc, onOpen }) {
  const [posterFailed, setPosterFailed] = useState(false);
  const posterSrc = posterFailed ? undefined : thumbnailSrc || buildPosterUrl(src);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative mb-px block max-w-full cursor-pointer overflow-hidden rounded-md bg-black"
      aria-label="Open video preview"
    >
      {posterSrc ? (
        <img
          src={posterSrc}
          alt=""
          className="h-[clamp(12rem,32vw,16rem)] w-[clamp(14rem,42vw,22rem)] max-w-[72vw] object-cover opacity-90"
          onError={() => setPosterFailed(true)}
        />
      ) : (
          <span className="grid h-28 min-w-44 place-items-center bg-black text-white/70">
          Video
        </span>
      )}

      <span className="absolute inset-0 grid place-items-center bg-black/20">
        <span className="grid size-10 place-items-center rounded-full bg-black/65 text-white shadow-lg">
          <PlayIcon className="ml-0.5 size-5 fill-current" aria-hidden />
        </span>
      </span>
    </button>
  );
}
