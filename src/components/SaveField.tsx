"use client";

import { useId, useState } from "react";
import type { PayAccount } from "@/lib/paid-with";

/**
 * Automatic saving the bank takes on a payment from this account (e.g. GH₵ 100 to lifestyle savings).
 * On unless the category is one the account skips; the amount starts from the last one used.
 * Submits saveUi=1, addSave=on and save (GH₵).
 */
export function SaveField({ account, categoryId, remembered, initial }: { account: PayAccount; categoryId: string; remembered?: number; initial?: number }) {
  const uid = useId();
  const save = account.save!;
  const skipped = Boolean(categoryId && save.except.includes(categoryId));
  const [include, setInclude] = useState<boolean | null>(initial != null ? initial > 0 : null);
  const [custom, setCustom] = useState<string | null>(initial ? (initial / 100).toFixed(2) : null);
  const on = include ?? !skipped;
  const value = custom ?? ((remembered ?? save.amount) / 100).toFixed(2);
  return (
    <div className="sk-between" style={{ gap: 12 }}>
      <input type="hidden" name="saveUi" value="1" />
      <label className="sk-row" style={{ gap: 10, cursor: "pointer" }} htmlFor={`${uid}-on`}>
        <input id={`${uid}-on`} type="checkbox" name="addSave" checked={on} onChange={(e) => setInclude(e.target.checked)} style={{ width: 20, height: 20, accentColor: "var(--brand)", margin: 0 }} />
        <span>
          <b style={{ fontSize: 14 }}>Saved to {save.to}</b>
          <span className="sk-cap" style={{ display: "block" }}>
            {skipped && include == null ? `${account.name} doesn't save on this category.` : `${account.name} moves this to ${save.to} on each payment.`}
          </span>
        </span>
      </label>
      {on ? (
        <div className="sk-input sk-input--sm" style={{ width: 120, flex: "none", gap: 6 }}>
          <span className="sk-cap">GH₵</span>
          <input aria-label={`Amount saved to ${save.to}`} name="save" inputMode="decimal" value={value} maxLength={10} onChange={(e) => setCustom(e.target.value)} />
        </div>
      ) : null}
    </div>
  );
}
