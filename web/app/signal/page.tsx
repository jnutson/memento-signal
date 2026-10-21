import { Suspense } from "react";
import Reimagined from "@/components/signal/reimagined/Reimagined";

export const metadata = { title: "Memento Loop · Connected evidence" };
export default function SignalPage() {
  return (
    <Suspense fallback={<p role="status">Loading connected demo…</p>}>
      <Reimagined defaultRelease={process.env.MEMENTO_DEMO_RELEASE_ID} />
    </Suspense>
  );
}
