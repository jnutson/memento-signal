import SignalAttention from "@/components/product/SignalAttention";

export const metadata = { title: "Memento Loop · Attention" };

export default async function AttentionPage({
  searchParams,
}: {
  searchParams: Promise<{ signal?: string | string[] }>;
}) {
  const { signal } = await searchParams;
  return (
    <SignalAttention initialId={typeof signal === "string" ? signal : null} />
  );
}
