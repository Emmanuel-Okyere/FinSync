import { LEGAL } from "@/lib/legal";

export function Contact() {
  return LEGAL.contactEmail ? (
    <a className="sk-link" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
  ) : (
    <span>the contact address published by {LEGAL.operator}</span>
  );
}
