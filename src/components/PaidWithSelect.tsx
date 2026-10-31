"use client";

import { PAYMENT_METHODS } from "@/lib/fees";
import type { PayAccount } from "@/lib/paid-with";

/** "Paid with": the user's accounts first, then plain payment methods. Submits `paidWith`. */
export function PaidWithSelect({ id, accounts, value, onChange, className = "sk-input sk-input--sm" }: { id: string; accounts: PayAccount[]; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <select id={id} className={className} name="paidWith" value={value} onChange={(e) => onChange(e.target.value)}>
      {accounts.length ? (
        <optgroup label="Your accounts">
          {accounts.map((a) => (
            <option key={a.id} value={`a:${a.id}`}>{a.name}</option>
          ))}
        </optgroup>
      ) : null}
      <optgroup label={accounts.length ? "Other ways" : "Paid with"}>
        {PAYMENT_METHODS.map((m) => (
          <option key={m.value} value={`m:${m.value}`}>{m.label}</option>
        ))}
      </optgroup>
    </select>
  );
}
