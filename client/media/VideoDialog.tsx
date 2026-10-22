import { useEffect, useRef, useState } from "react";
import { X, Play } from "lucide-react";
import { mountDemoPlayer, type DemoStatus } from "./video-player";
export function VideoDialog({
  open,
  muted,
  onClose,
}: {
  open: boolean;
  muted: boolean;
  onClose: (reason: "ended" | "dismissed") => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    host = useRef<HTMLDivElement>(null),
    player = useRef<ReturnType<typeof mountDemoPlayer> | null>(null),
    close = useRef(onClose);
  close.current = onClose;
  const [status, setStatus] = useState<DemoStatus>("loading");
  useEffect(() => {
    if (!open) return;
    const element = dialog.current!,
      focus = document.activeElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    player.current = mountDemoPlayer(host.current!, {
      muted,
      onStatus: setStatus,
      onEnded: () => close.current("ended"),
    });
    return () => {
      player.current?.destroy();
      player.current = null;
      element.close();
      document.body.style.overflow = overflow;
      if (focus instanceof HTMLElement && focus.isConnected)
        focus.focus({ preventScroll: true });
    };
  }, [open, muted]);
  return (
    <dialog
      className="video-dialog"
      ref={dialog}
      aria-labelledby="video-title"
      data-audio-control
      onCancel={(e) => {
        e.preventDefault();
        onClose("dismissed");
      }}
    >
      <div className="stage-heading">
        <h2 id="video-title">A closer look.</h2>
        <button
          className="icon-button"
          autoFocus
          aria-label="Close video"
          onClick={() => onClose("dismissed")}
        >
          <X size={22} />
        </button>
      </div>
      <div className="video-frame" ref={host} />
      <div className="video-status" aria-live="polite">
        {status === "blocked" ? (
          <button
            className="button secondary"
            onClick={() => player.current?.play()}
          >
            <Play size={16} />
            Play video
          </button>
        ) : status === "error" ? (
          <p>The video couldn’t load. Close it to continue our conversation.</p>
        ) : (
          <p>We’ll continue when it finishes. Close anytime.</p>
        )}
      </div>
    </dialog>
  );
}
