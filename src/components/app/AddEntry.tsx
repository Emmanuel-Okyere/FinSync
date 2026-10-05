"use client";

import { createContext, useContext } from "react";
import { Dialog } from "@/components/forms";
import { Icon } from "@/components/Icon";
import { EntryForm, type EntryCat, type EntryInit } from "./EntryForm";

type Data = { cats: EntryCat[]; today: string; policies: { id: string; name: string }[]; inHousehold: boolean };
const Ctx = createContext<Data>({ cats: [], today: "", policies: [], inHousehold: false });

export function AddEntryProvider({ data, children }: { data: Data; children: React.ReactNode }) {
  return <Ctx.Provider value={data}>{children}</Ctx.Provider>;
}

export function AddEntryButton({ fab = false, label = "Add entry", className, presetCategory }: { fab?: boolean; label?: string; className?: string; presetCategory?: string }) {
  const d = useContext(Ctx);
  const form = <EntryForm cats={d.cats} today={d.today} policies={d.policies} inHousehold={d.inHousehold} presetCategory={presetCategory} />;
  if (fab)
    return (
      <Dialog label={<Icon name="plus" />} ariaLabel="Add entry" title="New entry" triggerClassName="sk-fab">
        {form}
      </Dialog>
    );
  return (
    <span className={className ?? "hide-mobile"}>
      <Dialog label={<><Icon name="plus" />{label}</>} title="New entry" triggerClassName="sk-btn sk-btn--gold">
        {form}
      </Dialog>
    </span>
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
      <EntryForm cats={d.cats} today={d.today} initial={entry} />
    </Dialog>
  );
}
