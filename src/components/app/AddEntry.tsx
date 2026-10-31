"use client";

import { createContext, useContext } from "react";
import { Dialog } from "@/components/forms";
import { Icon } from "@/components/Icon";
import { DEFAULT_FEES, type FeeRules } from "@/lib/fees";
import type { PayAccount } from "@/lib/paid-with";
import { EntryForm, type EntryCat, type EntryInit } from "./EntryForm";

type Data = { cats: EntryCat[]; today: string; policies: { id: string; name: string }[]; inHousehold: boolean; fees: FeeRules; accounts: PayAccount[]; saveMemory: Record<string, number> };
const Ctx = createContext<Data>({ cats: [], today: "", policies: [], inHousehold: false, fees: DEFAULT_FEES, accounts: [], saveMemory: {} });

/** The user's transfer-charge rules (Settings → Transfer charges). */
export const useFeeRules = () => useContext(Ctx).fees;
/** The user's accounts and remembered automatic-saving amounts. */
export const usePayData = () => {
  const d = useContext(Ctx);
  return { accounts: d.accounts, saveMemory: d.saveMemory, rules: d.fees };
};

export function AddEntryProvider({ data, children }: { data: Data; children: React.ReactNode }) {
  return <Ctx.Provider value={data}>{children}</Ctx.Provider>;
}

export function AddEntryButton({
  fab = false,
  label = "Add entry",
  className,
  presetCategory,
  presetKind,
  triggerClassName = "sk-btn sk-btn--gold",
}: {
  fab?: boolean;
  label?: string;
  className?: string;
  presetCategory?: string;
  presetKind?: "income" | "expense";
  triggerClassName?: string;
}) {
  const d = useContext(Ctx);
  const form = <EntryForm cats={d.cats} today={d.today} policies={d.policies} inHousehold={d.inHousehold} presetCategory={presetCategory} presetKind={presetKind} feeRules={d.fees} accounts={d.accounts} saveMemory={d.saveMemory} />;
  if (fab)
    return (
      <Dialog label={<Icon name="plus" />} ariaLabel="Add entry" title="New entry" triggerClassName="sk-fab">
        {form}
      </Dialog>
    );
  return (
    <span className={className ?? "hide-mobile"}>
      <Dialog label={<><Icon name="plus" />{label}</>} title={presetKind === "income" ? "Add income" : "New entry"} triggerClassName={triggerClassName}>
        {form}
      </Dialog>
    </span>
  );
}

/** "+" on a budget line: log spending straight into that line. */
export function AddToLineButton({ categoryId, name, defaultDate }: { categoryId: string; name: string; defaultDate?: string }) {
  const d = useContext(Ctx);
  return (
    <Dialog label={<Icon name="plus" />} ariaLabel={`Add spending to ${name}`} title={`Add to ${name}`} triggerClassName="sk-iconbtn sk-iconbtn--sm">
      <EntryForm cats={d.cats} today={d.today} policies={d.policies} inHousehold={d.inHousehold} presetCategory={categoryId} defaultDate={defaultDate} feeRules={d.fees} accounts={d.accounts} saveMemory={d.saveMemory} />
    </Dialog>
  );
}

/** A transaction row that opens the edit sheet. */
export function TxRow({
  entry,
  icon,
  tone,
  meta,
  amountText,
  amountClass,
  highlight,
}: {
  entry: EntryInit;
  icon: string;
  tone: string;
  meta: string;
  amountText: string;
  amountClass?: string;
  highlight?: string;
}) {
  const d = useContext(Ctx);
  const name = entry.name;
  let nameNode: React.ReactNode = name;
  if (highlight) {
    const i = name.toLowerCase().indexOf(highlight.toLowerCase());
    if (i >= 0) nameNode = (<>{name.slice(0, i)}<mark>{name.slice(i, i + highlight.length)}</mark>{name.slice(i + highlight.length)}</>);
  }
  return (
    <Dialog
      title="Edit entry"
      triggerClassName="sk-tx"
      label={
        <>
          <span className={`sk-tile sk-tile--${tone}`}>
            <Icon name={icon} />
          </span>
          <span className="sk-tx__main" style={{ textAlign: "left" }}>
            <span className="sk-tx__name" style={{ display: "block" }}>{nameNode}</span>
            <span className="sk-cap">{meta}</span>
          </span>
          <span className={`sk-tx__amt ${amountClass ?? ""}`}>{amountText}</span>
        </>
      }
    >
      <EntryForm cats={d.cats} today={d.today} initial={entry} feeRules={d.fees} accounts={d.accounts} saveMemory={d.saveMemory} />
    </Dialog>
  );
}
