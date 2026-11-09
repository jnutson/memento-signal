"use client";

import DemoRestart from "@/components/DemoRestart";
import useReimagined from "@/lib/reimagined/use-reimagined";
import ReimaginedView from "./ReimaginedView";

export default function Reimagined({
  defaultRelease,
}: {
  defaultRelease?: string;
}) {
  return (
    <>
      <DemoRestart />
      <ReimaginedView v={useReimagined(defaultRelease)} />
    </>
  );
}
