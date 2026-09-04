import { type Href, useRouter } from "expo-router";

/** Back that never dead-ends on web after an update / hard refresh. */
export function safeGoBack(router: ReturnType<typeof useRouter>, fallback: Href = "/(tabs)/you") {
  try {
    if (typeof router.canGoBack === "function" && router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    /* fall through */
  }
  router.replace(fallback);
}

export function useSafeBack(fallback: Href = "/(tabs)/you") {
  const router = useRouter();
  return () => safeGoBack(router, fallback);
}
