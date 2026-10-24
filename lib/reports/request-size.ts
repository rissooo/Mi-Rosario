import { MAX_MULTIPART_BYTES } from "../contracts/reports";

/** El multipart admite 64 KiB de encabezados además del máximo de la imagen. */
export function isMultipartContentLengthTooLarge(value: string | null): boolean {
  if (value === null || !/^\s*\d+\s*$/.test(value)) return false;
  return Number(value.trim()) > MAX_MULTIPART_BYTES;
}
