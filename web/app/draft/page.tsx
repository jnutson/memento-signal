import { Suspense } from "react";
import FocusDraft from "@/components/draft/FocusDraft";

export const metadata = { title: "Memento Loop · A clearer kind of attention" };

export default function DraftPage() {
  return (
    <Suspense>
      <FocusDraft />
    </Suspense>
  );
}
