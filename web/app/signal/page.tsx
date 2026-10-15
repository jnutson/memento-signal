import { redirect } from "next/navigation";
// Preserve old bookmarks without exposing a fourth product page.
export default function SignalPage() {
  redirect("/attention");
}
