import DemoStart from "@/components/DemoStart";
import { redirect } from "next/navigation";
export default function Page() {
  // Preserve the independent frozen original demo; normal product entry is Weekly.
  if (
    process.env.MEMENTO_SERVING_MODE !== "cloudflare" &&
    process.env.MEMENTO_DEMO_BUNDLE === "1"
  )
    return <DemoStart />;
  redirect("/weekly");
}
