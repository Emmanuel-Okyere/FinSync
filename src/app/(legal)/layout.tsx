import Link from "next/link";
import { Wordmark } from "@/components/Logo";

export default function Legal({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 64px", display: "flex", flexDirection: "column", gap: 16 }}>
      <Link href="/" style={{ textDecoration: "none" }}>
        <Wordmark />
      </Link>
      {children}
    </main>
  );
}
