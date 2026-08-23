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
export function MessageVideo({ src, onOpen }) {
  const posterSrc = buildPosterUrl(src);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative mb-1.5 block max-w-full cursor-pointer overflow-hidden rounded-lg bg-black sm:rounded-xl"
      aria-label="Open video preview"
    >
      {posterSrc ? (
        <img
          src={posterSrc}
          alt=""
          className="max-h-52 max-w-full object-contain opacity-90 sm:max-h-64"
        />
      ) : (
        <span className="grid h-40 min-w-56 place-items-center bg-black text-white/70">
          Video
        </span>
      )}

      <span className="absolute inset-0 grid place-items-center bg-black/20">
        <span className="grid size-14 place-items-center rounded-full bg-black/65 text-white shadow-lg">
          <PlayIcon className="ml-0.5 size-7 fill-current" aria-hidden />
        </span>
      </span>
    </button>
  );
}
