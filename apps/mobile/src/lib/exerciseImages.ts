/** Prefer jsDelivr — GitHub raw is flaky / rate-limited in browsers. */
const RAW_PREFIX = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";
const CDN_PREFIX = "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises";

export const EXERCISE_IMAGE_CDN = CDN_PREFIX;

/** Encode each path segment so names like Calf_Raises_-_With_Bands work everywhere. */
function encodeExercisePath(path: string): string {
  return path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

/** Rewrite known GitHub raw exercise image URLs to the CDN mirror. */
export function normalizeExerciseImageUrl(uri: string | null | undefined): string | null {
  if (!uri) return null;
  let path: string | null = null;
  if (uri.startsWith(CDN_PREFIX)) path = uri.slice(CDN_PREFIX.length).replace(/^\//, "");
  else if (uri.startsWith(RAW_PREFIX)) path = uri.slice(RAW_PREFIX.length).replace(/^\//, "");
  else if (!uri.startsWith("http")) path = uri.replace(/^\//, "");
  else return uri;

  if (!path) return null;
  // Avoid double-encoding
  const decoded = path
    .split("/")
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    })
    .join("/");
  return `${CDN_PREFIX}/${encodeExercisePath(decoded)}`;
}
