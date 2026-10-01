import { ImageResponse } from "next/og";
import { HarbourMark } from "@/lib/brand/icon-art";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<HarbourMark size={64} inset={0} />, size);
}
