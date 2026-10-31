"use client";

import { useId, useState } from "react";
import { METHOD_LABEL, transferFee, type FeeRules } from "@/lib/fees";

const f2 = (m: number) => new Intl.NumberFormat("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(m / 100);

/**
 * Transfer charge for a payment, worked out from the user's rules as amount/method change.
 * Submits feeUi=1, addFee=on (when included) and fee (GH₵, editable).
 */
export function ChargeField({ amount, method, rules, initialFee }: { amount: number; method: string; rules: FeeRules; initialFee?: number }) {
  const uid = useId();
  const computed = transferFee(amount, method, rules);
  const [include, setInclude] = useState<boolean | null>(initialFee != null ? initialFee > 0 : null);
  const [custom, setCustom] = useState<string | null>(initialFee ? (initialFee / 100).toFixed(2) : null);
  const on = method !== "cash" && (include ?? computed > 0);
  const value = custom ?? (computed / 100).toFixed(2);
  const rule = rules[method];
  const explain =
    method === "cash"
      ? "No charge on cash."
      : amount <= 0 && custom == null
        ? `Worked out from your ${METHOD_LABEL[method] ?? method} rule once you enter an amount.`
      : computed > 0 && custom == null
        ? `${rule.pct}% of GH₵ ${f2(amount)}${rule.cap ? `, max ${f2(rule.cap)}` : ""} (your ${METHOD_LABEL[method] ?? method} rule)`
        : computed === 0 && custom == null
          ? `No charge for ${METHOD_LABEL[method] ?? method} under your rules.`
          : "Your own amount.";
  return (
    <div className="sk-stack" style={{ gap: 6 }}>
      <input type="hidden" name="feeUi" value="1" />
      <div className="sk-between" style={{ gap: 12 }}>
        <label className="sk-row" style={{ gap: 10, cursor: "pointer" }} htmlFor={`${uid}-on`}>
          <input
            id={`${uid}-on`}
            type="checkbox"
            name="addFee"
            checked={on}
            onChange={(e) => setInclude(e.target.checked)}
            style={{ width: 20, height: 20, accentColor: "var(--brand)", margin: 0 }}
            disabled={method === "cash"}
          />
          <span>
            <b style={{ fontSize: 14 }}>Transfer charge</b>
            <span className="sk-cap" style={{ display: "block" }}>{explain}</span>
          </span>
        </label>
        {on ? (
          <div className="sk-input sk-input--sm" style={{ width: 120, flex: "none", gap: 6 }}>
            <span className="sk-cap">GH₵</span>
            <input aria-label="Charge amount" name="fee" inputMode="decimal" value={value} maxLength={10} onChange={(e) => setCustom(e.target.value)} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
