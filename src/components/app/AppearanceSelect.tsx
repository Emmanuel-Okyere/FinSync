"use client";

export function AppearanceSelect({ value }: { value: string }) {
  return (
    <select id="appearance" name="appearance" defaultValue={value} className="sk-cellin" style={{ width: 120, textAlign: "left" }} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  );
}
