"use client";

import { ActionButton, ActionForm, Submit } from "@/components/forms";
import { saveFeeRules } from "@/app/(app)/_actions/settings";
import { CHARGEABLE_METHODS, METHOD_LABEL, transferFee, type FeeRules } from "@/lib/fees";

const f2 = (m: number) => (m / 100).toFixed(2);

/** Settings → Transfer charges: % and cap per payment method. */
export function FeeRulesForm({ rules }: { rules: FeeRules }) {
  return (
    <div className="sk-stack" style={{ gap: 14 }}>
      <p className="sk-muted">
        Charges are worked out from these when you log a payment, and you can change any single charge on the entry. Defaults follow the usual Ghana rates as of 2026: MoMo sends 0.75% up to GH₵ 7.50, bills via MoMoPay and GhanaPay free (E-Levy was scrapped in 2025). Banks vary, so check yours.
      </p>
      <ActionForm action={saveFeeRules} className="sk-stack" style={{ gap: 10 }}>
        <div className="sk-grid" style={{ gridTemplateColumns: "1fr 84px 96px", gap: 8, alignItems: "center" }}>
          <span className="sk-over">Paid with</span>
          <span className="sk-over">%</span>
          <span className="sk-over">Max (GH₵)</span>
          {CHARGEABLE_METHODS.map((m) => {
            const r = rules[m] ?? { pct: 0, cap: 0 };
            return (
              <div key={m} style={{ display: "contents" }}>
                <div>
                  <b style={{ fontSize: 14 }}>{METHOD_LABEL[m]}</b>
                  <div className="sk-cap">GH₵ 100 → {f2(transferFee(10000, m, rules))}</div>
                </div>
                <input className="sk-input sk-input--sm" name={`${m}.pct`} inputMode="decimal" defaultValue={r.pct || ""} placeholder="0" aria-label={`${METHOD_LABEL[m]} percentage`} maxLength={5} />
                <input className="sk-input sk-input--sm" name={`${m}.cap`} inputMode="decimal" defaultValue={r.cap ? f2(r.cap) : ""} placeholder="No cap" aria-label={`${METHOD_LABEL[m]} maximum charge`} maxLength={8} />
              </div>
            );
          })}
        </div>
        <p className="sk-cap">Cash never has a charge. Mark subscriptions and direct debits as &ldquo;No transfer charge&rdquo; on Fixed expenses.</p>
        <Submit>Save charges</Submit>
      </ActionForm>
      <ActionButton action={saveFeeRules} fields={{ reset: "1" }} className="sk-btn sk-btn--ghost sk-btn--block">
        Reset to usual rates
      </ActionButton>
    </div>
  );
}
