import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  LoaderCircle,
  Undo2,
  X,
} from "lucide-react";
export function ConnectionToast({
  message,
  error,
  busy,
  onUndo,
  onDismiss,
}: {
  message: string;
  error: boolean;
  busy: boolean;
  onUndo?: () => void;
  onDismiss: () => void;
}) {
  const [hovered, setHovered] = useState(false),
    [focused, setFocused] = useState(false);
  const remaining = useRef(onUndo ? 8000 : 5000);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    remaining.current = onUndo ? 8000 : 5000;
  }, [message, error, busy, !!onUndo]);
  useEffect(() => {
    if (error || busy || hovered || focused) return;
    const started = Date.now();
    const timer = setTimeout(() => dismiss.current(), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(
        0,
        remaining.current - (Date.now() - started),
      );
    };
  }, [message, error, busy, !!onUndo, hovered, focused]);
  return (
    <div
      className={`ssh-move-feedback ${error ? "is-error" : busy ? "is-busy" : "is-success"}`}
      role={error ? "alert" : "status"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setFocused(false);
      }}
    >
      <div className="ssh-toast-icon" aria-hidden="true">
        {error ? (
          <AlertCircle size={18} />
        ) : busy ? (
          <LoaderCircle size={18} className="update-spinning" />
        ) : (
          <CheckCircle2 size={18} />
        )}
      </div>
      <span>{message}</span>
      {onUndo && !busy && !error && (
        <button className="ssh-toast-undo" onClick={onUndo}>
          <Undo2 size={13} />
          Undo
        </button>
      )}
      {!busy && (
        <button
          className="icon-button ssh-toast-close"
          aria-label="Dismiss connection notification"
          onClick={onDismiss}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
