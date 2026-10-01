import { ImageResponse } from "next/og";
import { HarbourMark } from "@/lib/brand/icon-art";

const VARIANTS: Record<string, { size: number; inset: number }> = {
  "192": { size: 192, inset: 0 },
  "512": { size: 512, inset: 0 },
  "maskable-512": { size: 512, inset: 0.12 },
};

export async function GET(_request: Request, { params }: { params: Promise<{ variant: string }> }) {
  const variant = VARIANTS[(await params).variant];
  if (!variant) return new Response("Not found", { status: 404 });
  return new ImageResponse(<HarbourMark size={variant.size} inset={variant.inset} />, {
    width: variant.size,
    height: variant.size,
  });
}
