import type { ReactNode } from "react";
import { ConsoleShell } from "@/components/ConsoleShell";
import { OwnerProvider } from "@/lib/OwnerProvider";
import "@/components/console.css";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <OwnerProvider>
      <ConsoleShell>{children}</ConsoleShell>
    </OwnerProvider>
  );
}
