import type { AttendeeRecord } from "../types";

const sanitize = (value?: string | null) =>
  (value ?? "")
    .replace(/[^\x20-\x7E]/g, " ") // strip non printable characters
    .trim();

export const buildBadgeZpl = (
  attendee: AttendeeRecord,
  copies = 1,
  options?: { labelWidthDots?: number; labelHeightDots?: number }
) => {
  const width = options?.labelWidthDots ?? 640; // 80mm @ ~203dpi
  const height = options?.labelHeightDots ?? 400; // 50mm @ ~203dpi
  const firstName = sanitize(attendee.first_name) || "ATTENDEE";
  const company = sanitize(attendee.company) || " ";

  return [
    "^XA",
    `^PW${width}`,
    `^LL${height}`,
    "^CF0,100",
    `^FO75,40^FD${firstName}^FS`,
    "^CF0,60",
    `^FO75,200image.png^FD${company}^FS`,
    `^PQ${Math.max(1, copies)}`,
    "^XZ",
  ].join("\n");
};
