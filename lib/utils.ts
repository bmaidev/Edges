import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// The one class-name helper for the UI primitives: merges conditional classes
// (clsx) and de-duplicates conflicting Tailwind utilities (tailwind-merge), so a
// caller can always override a primitive's default (e.g. pass `p-2` to beat a
// built-in `p-4`) without specificity fights.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
