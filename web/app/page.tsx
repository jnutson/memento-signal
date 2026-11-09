import DemoStart from "@/components/signal/DemoStart";
import { redirect } from "next/navigation";
export default function HomePage() {
  if (process.env.MEMENTO_SERVING_MODE === "cloudflare") redirect("/report");
  return <DemoStart />;
}
