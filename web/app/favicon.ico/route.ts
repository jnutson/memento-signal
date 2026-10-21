// Older browsers may request this URL even with an explicit SVG icon link.
export function GET() {
  return new Response(null, { status: 308, headers: { Location: "/icon.svg" } });
}
