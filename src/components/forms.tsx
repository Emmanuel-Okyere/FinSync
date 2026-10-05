"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/lib/action";
import { Icon } from "./Icon";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;
const Ctx = createContext<FormState & { pending?: boolean }>({});

export function ActionForm({
  action,
  children,
  className,
  style,
  reset = false,
  showOk = false,
  onOk,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  reset?: boolean;
  showOk?: boolean;
  onOk?: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.ok) return;
    if (reset) ref.current?.reset();
    ref.current?.closest("dialog")?.close();
    onOk?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <Ctx.Provider value={{ ...state, pending }}>
      <form
        ref={ref}
        action={formAction}
        className={className}
        style={style}
        onSubmit={(e) => {
          // Submit manually so React doesn't auto-reset the fields when the server returns an error.
          e.preventDefault();
          const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
          startTransition(() => formAction(fd));
        }}
      >
        {state.error && !state.fields ? (
          <div className="sk-alert" role="alert">
            {state.error}
          </div>
        ) : null}
        {showOk && state.ok ? (
          <div className="sk-alert sk-alert--ok" role="status">
            {state.ok}
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

/** A one-button form (toggle, delete, move…). */
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
  confirm?: string;
  ariaLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form
      action={formAction}
      style={{ display: "contents" }}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" className={className} disabled={pending} aria-label={ariaLabel} title={state.error}>
        {children}
      </button>
      {state.error ? (
        <span className="sk-err" role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
