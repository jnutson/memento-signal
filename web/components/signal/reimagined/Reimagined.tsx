"use client";

import useReimagined from "@/lib/reimagined/use-reimagined";
import ReimaginedView from "./ReimaginedView";

export default function Reimagined({
  defaultRelease,
}: {
  defaultRelease?: string;
}) {
  return <ReimaginedView v={useReimagined(defaultRelease)} />;
}
