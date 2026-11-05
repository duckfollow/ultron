import { CheckCircle2 } from "lucide-react";

// Render inside the active dialog so the notification stays in its top layer.
export function CopyToast({ message }: { message: string }) {
  return (
    <div
      className="ssh-copy-toast"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <CheckCircle2 size={17} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
