"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { FLASH_COOKIE } from "@/lib/flash-name";

/* ------------------------------------------------------------------ Toasts */

type Tone = "ok" | "error";
type Toast = { id: number; message: string; tone: Tone };
type ConfirmOptions = { title: string; body?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };

type Feedback = {
  toast: (message: string, tone?: Tone) => void;
  confirm: (opts: ConfirmOptions | string) => Promise<boolean>;
};

const Ctx = createContext<Feedback>({ toast: () => {}, confirm: async () => true });

export const useToast = () => useContext(Ctx).toast;
export const useConfirm = () => useContext(Ctx).confirm;

function ToastItem({ t, onDone }: { t: Toast; onDone: (id: number) => void }) {
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useCallback(() => {
    timer.current = setTimeout(() => setLeaving(true), t.tone === "error" ? 6500 : 4000);
  }, [t.tone]);
  useEffect(() => {
    start();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [start]);
  useEffect(() => {
    if (!leaving) return;
    const out = setTimeout(() => onDone(t.id), 200);
    return () => clearTimeout(out);
  }, [leaving, onDone, t.id]);
  return (
    <div
      className={`sk-toast sk-toast--${t.tone}${leaving ? " is-leaving" : ""}`}
      role={t.tone === "error" ? "alert" : "status"}
      onMouseEnter={() => timer.current && clearTimeout(timer.current)}
      onMouseLeave={start}
    >
      <span className="sk-toast__icon">
        <Icon name={t.tone === "error" ? "close" : "check"} />
      </span>
      <span className="sk-toast__msg">{t.message}</span>
      <button type="button" className="sk-toast__close" aria-label="Dismiss" onClick={() => setLeaving(true)}>
        <Icon name="close" />
      </button>
    </div>
  );
}

/** Shows a message carried across a server redirect (set by flash() on the server), then clears it. */
function FlashReader({ toast }: { toast: Feedback["toast"] }) {
  const path = usePathname();
  useEffect(() => {
    const raw = document.cookie.split("; ").find((c) => c.startsWith(`${FLASH_COOKIE}=`));
    if (!raw) return;
    document.cookie = `${FLASH_COOKIE}=; Max-Age=0; Path=/${location.protocol === "https:" ? "; Secure" : ""}`;
    try {
      let value = raw.slice(FLASH_COOKIE.length + 1);
      for (let i = 0; i < 3 && value.startsWith("%"); i++) value = decodeURIComponent(value);
      const { m, t } = JSON.parse(value) as { m: string; t: Tone };
      if (typeof m === "string" && m) toast(m.slice(0, 200), t === "error" ? "error" : "ok");
    } catch {
      /* ignore malformed */
    }
  }, [path, toast]);
  return null;
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const toast = useCallback((message: string, tone: Tone = "ok") => {
    const id = ++seq.current;
    // Same message twice in a row (e.g. double submit) shows once; keep at most 3.
    setToasts((ts) => (ts.some((x) => x.message === message) ? ts : [...ts, { id, message, tone }].slice(-3)));
  }, []);
  const remove = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  /* ---------------------------------------------------------- Confirm modal */
  const dialog = useRef<HTMLDialogElement>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const confirm = useCallback((o: ConfirmOptions | string) => {
    const next = typeof o === "string" ? { title: o } : o;
    resolver.current?.(false);
    setOpts(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);
  useEffect(() => {
    if (opts && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [opts]);
  const settle = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    dialog.current?.close();
    setOpts(null);
  };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <FlashReader toast={toast} />
      <div className="sk-toasts" aria-live="polite">
        {toasts.map((t) => (
          <ToastItem key={t.id} t={t} onDone={remove} />
        ))}
      </div>
      {opts ? (
        <dialog
          ref={dialog}
          className="sk-dialog sk-confirm"
          aria-labelledby="confirm-title"
          aria-describedby={opts.body ? "confirm-body" : undefined}
          onCancel={(e) => {
            e.preventDefault();
            settle(false);
          }}
          onClick={(e) => {
            if (e.target === dialog.current) settle(false);
          }}
        >
          <div className="sk-sheet" style={{ gap: 12 }}>
            {opts.danger ? (
              <span className="sk-tile sk-tile--over" aria-hidden>
                <Icon name="trash" />
              </span>
            ) : null}
            <h2 className="sk-h" id="confirm-title">{opts.title}</h2>
            {opts.body ? (
              <p className="sk-muted" id="confirm-body">
                {opts.body}
              </p>
            ) : null}
            <div className="sk-grid g-2" style={{ gap: 10, marginTop: 6 }}>
              <button type="button" className="sk-btn sk-btn--ghost" onClick={() => settle(false)} autoFocus>
                {opts.cancelLabel ?? "Cancel"}
              </button>
              <button type="button" className={`sk-btn${opts.danger ? " sk-btn--destructive" : ""}`} onClick={() => settle(true)}>
                {opts.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </dialog>
      ) : null}
    </Ctx.Provider>
  );
}
