"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/lib/action";
import { Icon } from "./Icon";
import { useConfirm, useToast } from "./feedback";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;
const Ctx = createContext<FormState & { pending?: boolean }>({});

/**
 * Runs a server action and reports the result through the app-wide toast host.
 * Toasts fire from the action's completion, not from a component effect, so they still show
 * when the triggering element disappears (e.g. deleting the row the button lives in).
 */
export function useServerAction(
  action: Action,
  opts: { toastOk?: boolean; toastError?: boolean; onDone?: (s: FormState) => void } = {},
) {
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  const toast = useToast();
  const latest = useRef(state);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });
  const run = useCallback(
    (fd: FormData) =>
      start(async () => {
        let next: FormState;
        try {
          next = await action(latest.current, fd);
        } catch {
          next = { error: "Couldn't reach FinSync. Check your connection and try again.", at: Date.now() };
        }
        if (!next) return; // redirected
        latest.current = next;
        setState(next);
        const o = optsRef.current;
        if (next.ok && o.toastOk !== false) toast(next.ok);
        if (next.error && o.toastError) toast(next.error, "error");
        o.onDone?.(next);
      }),
    [action, toast],
  );
  return [state, run, pending] as const;
}

export function ActionForm({
  action,
  children,
  className,
  style,
  reset = false,
  silent = false,
  keepOpen = false,
  onOk,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  reset?: boolean;
  /** Don't toast on success (rare; e.g. when the page itself shows the result). */
  silent?: boolean;
  /** Leave the surrounding dialog open on success (multi-step forms). */
  keepOpen?: boolean;
  onOk?: () => void;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useServerAction(action, {
    toastOk: !silent,
    onDone: (s) => {
      if (!s.ok) return;
      if (reset) ref.current?.reset();
      if (!keepOpen) ref.current?.closest("dialog")?.close();
      onOk?.();
    },
  });
  return (
    <Ctx.Provider value={{ ...state, pending }}>
      <form
        ref={ref}
        className={className}
        style={style}
        onSubmit={(e) => {
          // Submitted by hand: keeps typed values after a server error (no auto-reset).
          e.preventDefault();
          run(new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter));
        }}
      >
        {state.error && !state.fields ? (
          <div className="sk-alert" role="alert">
            {state.error}
          </div>
        ) : null}
        {children}
      </form>
    </Ctx.Provider>
  );
}

export function useFormState() {
  return useContext(Ctx);
}

export function FieldError({ name, id }: { name: string; id?: string }) {
  const s = useContext(Ctx);
  const msg = s.fields?.[name];
  return msg ? (
    <span className="sk-err" id={id} role="alert">
      {msg}
    </span>
  ) : null;
}

export function Field({
  name,
  label,
  type = "text",
  defaultValue,
  placeholder,
  required,
  autoComplete,
  inputMode,
  icon,
  maxLength,
  min,
  max,
  step,
  hint,
  line,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  icon?: string;
  maxLength?: number;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  hint?: string;
  line?: boolean;
}) {
  const s = useContext(Ctx);
  const err = s.fields?.[name];
  const id = useId();
  return (
    <div className="sk-field">
      <label htmlFor={id}>{label}</label>
      <div className={`sk-input${line ? " sk-input--line" : ""}`}>
        {icon ? <Icon name={icon} /> : null}
        <input
          id={id}
          name={name}
          type={type}
          defaultValue={defaultValue ?? undefined}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          inputMode={inputMode}
          maxLength={maxLength ?? (type === "text" ? 120 : undefined)}
          min={min}
          max={max}
          step={step}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? `${id}-err` : undefined}
        />
      </div>
      {hint && !err ? <span className="sk-cap">{hint}</span> : null}
      <FieldError name={name} id={`${id}-err`} />
    </div>
  );
}

export function SelectField({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue?: string | null;
}) {
  const id = useId();
  return (
    <div className="sk-field">
      <label htmlFor={id}>{label}</label>
      <div className="sk-input">
        <select id={id} name={name} defaultValue={defaultValue ?? undefined}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <FieldError name={name} />
    </div>
  );
}

export function Submit({ children, className = "sk-btn sk-btn--block", pendingText }: { children: ReactNode; className?: string; pendingText?: string }) {
  const status = useFormStatus();
  const ctx = useContext(Ctx);
  const pending = status.pending || Boolean(ctx.pending);
  return (
    <button type="submit" className={className} disabled={pending} aria-disabled={pending}>
      {pending ? (pendingText ?? "Saving…") : children}
    </button>
  );
}

/** Bottom sheet on phones, modal on desktop. Built on <dialog> for focus trapping and Esc.
 *  Content mounts only while open, so long lists don't carry hidden forms. */
export function Dialog({
  label,
  title,
  children,
  triggerClassName = "sk-btn sk-btn--sm",
  ariaLabel,
}: {
  label: ReactNode;
  title: string;
  children: ReactNode;
  triggerClassName?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  useEffect(() => {
    if (open && ref.current && !ref.current.open) ref.current.showModal();
  }, [open]);
  return (
    <>
      <button type="button" className={triggerClassName} aria-label={ariaLabel} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {label}
      </button>
      {open ? (
        <dialog
          ref={ref}
          className="sk-dialog"
          aria-labelledby={titleId}
          onClose={() => setOpen(false)}
          onClick={(e) => {
            if (e.target === ref.current) ref.current?.close();
          }}
        >
          <div className="sk-sheet">
            <div className="sk-grab hide-desktop" />
            <div className="sk-between">
              <h2 className="sk-h" id={titleId}>{title}</h2>
              <button type="button" className="sk-iconbtn" style={{ width: 34, height: 34 }} aria-label="Close" onClick={() => ref.current?.close()}>
                <Icon name="close" />
              </button>
            </div>
            {children}
          </div>
        </dialog>
      ) : null}
    </>
  );
}

type ConfirmSpec = string | { title: string; body?: string; confirmLabel?: string; danger?: boolean };

/** A one-button form (toggle, delete, move…). Confirms in a modal when asked, then toasts the outcome. */
export function ActionButton({
  action,
  fields,
  children,
  className = "sk-btn sk-btn--sm",
  confirm,
  ariaLabel,
}: {
  action: Action;
  fields: Record<string, string>;
  children: ReactNode;
  className?: string;
  confirm?: ConfirmSpec;
  ariaLabel?: string;
}) {
  const ask = useConfirm();
  const formRef = useRef<HTMLFormElement>(null);
  const [, run, pending] = useServerAction(action, {
    toastError: true,
    onDone: (s) => {
      if (s.ok) formRef.current?.closest("dialog")?.close();
    },
  });
  return (
    <form
      ref={formRef}
      style={{ display: "contents" }}
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (confirm) {
          const spec = typeof confirm === "string" ? { title: confirm } : confirm;
          if (!(await ask({ confirmLabel: "Confirm", ...spec }))) return;
        }
        run(fd);
      }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" className={className} disabled={pending} aria-busy={pending} aria-label={ariaLabel}>
        {children}
      </button>
    </form>
  );
}
