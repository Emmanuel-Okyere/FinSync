"use client";

/** A toggle that submits its form as soon as it changes. */
export function AutoSubmitToggle({ name, defaultChecked, label }: { name: string; defaultChecked: boolean; label?: string }) {
  return (
    <input
      type="checkbox"
      className="sk-toggle"
      name={name}
      defaultChecked={defaultChecked}
      aria-label={label}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
    />
  );
}
