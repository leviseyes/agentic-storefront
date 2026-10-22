import { storefront } from "../../storefront.config.js";
export const demoVideoId = storefront.video?.youtubeId || "";
export const demoVideoUrl = `https://www.youtube.com/watch?v=${demoVideoId}`;
type Player = {
  playVideo: () => void;
  unMute: () => void;
  mute: () => void;
  destroy: () => void;
};
type PlayerEvent = { target: Player; data?: number };
type YouTube = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars: Record<string, string | number>;
      events: Record<string, (event: PlayerEvent) => void>;
    },
  ) => Player;
};
type YouTubeWindow = Window & {
  YT?: YouTube;
  onYouTubeIframeAPIReady?: () => void;
};
export type DemoStatus = "loading" | "ready" | "playing" | "blocked" | "error";
let apiPromise: Promise<YouTube> | undefined;

function loadYouTube(): Promise<YouTube> {
  const browser = window as YouTubeWindow;
  if (browser.YT?.Player) return Promise.resolve(browser.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YouTube>((resolve, reject) => {
    const script = document.createElement("script"),
      previous = browser.onYouTubeIframeAPIReady;
    const finish = (error?: Error) => {
      clearTimeout(timer);
      script.onerror = null;
      browser.onYouTubeIframeAPIReady = previous;
      if (error) {
        script.remove();
        apiPromise = undefined;
        reject(error);
      } else resolve(browser.YT!);
    };
    const timer = setTimeout(
      () => finish(Error("The video player took too long to load.")),
      15000,
    );
    browser.onYouTubeIframeAPIReady = () => {
      finish();
      previous?.();
    };
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => finish(Error("The video player could not load."));
    document.head.appendChild(script);
  });
  return apiPromise;
}

// YouTube owns only a disposable child; React retains the surrounding dialog.
export function mountDemoPlayer(
  host: HTMLElement,
  {
    onStatus,
    onEnded,
    muted = false,
  }: {
    muted?: boolean;
    onStatus: (status: DemoStatus) => void;
    onEnded: () => void;
  },
  loadApi = loadYouTube,
) {
  let disposed = false,
    finished = false,
    player: Player | undefined;
  const deadline = setTimeout(() => {
    if (!disposed) onStatus("error");
  }, 20000);
  onStatus("loading");
  void loadApi()
    .then((api) => {
      if (disposed) return;
      const iframe = document.createElement("iframe");
      const params = new URLSearchParams({
        enablejsapi: "1",
        autoplay: "1",
        playsinline: "1",
        rel: "0",
        mute: muted ? "1" : "0",
        origin: location.origin,
      });
      iframe.src = `https://www.youtube.com/embed/${demoVideoId}?${params}`;
      iframe.title = "Product walkthrough";
      iframe.allow =
        "autoplay; encrypted-media; picture-in-picture; fullscreen";
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      host.replaceChildren(iframe);
      player = new api.Player(iframe, {
        videoId: demoVideoId,
        playerVars: {
          autoplay: 1,
          playsinline: 1,
          rel: 0,
          mute: muted ? 1 : 0,
          origin: location.origin,
        },
        events: {
          onReady: ({ target }) => {
            if (!disposed) {
              clearTimeout(deadline);
              onStatus("ready");
              if (muted) target.mute();
              else target.unMute();
              target.playVideo();
            }
          },
          onStateChange: ({ data }) => {
            if (disposed) return;
            if (data === 1) onStatus("playing");
            if (data === 0 && !finished) {
              finished = true;
              onEnded();
            }
          },
          onAutoplayBlocked: () => {
            if (!disposed) onStatus("blocked");
          },
          onError: () => {
            clearTimeout(deadline);
            if (!disposed) onStatus("error");
          },
        },
      });
    })
    .catch(() => {
      clearTimeout(deadline);
      if (!disposed) onStatus("error");
    });
  return {
    play: () => {
      if (!disposed) {
        if (muted) player?.mute();
        else player?.unMute();
        player?.playVideo();
      }
    },
    destroy: () => {
      if (disposed) return;
      disposed = true;
      clearTimeout(deadline);
      player?.destroy();
      host.replaceChildren();
    },
  };
}
