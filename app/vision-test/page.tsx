import { notFound } from "next/navigation";
import VisionTestClient from "./vision-test-client";

/** Esta pantalla de verificación jamás se ofrece en un deploy de Vercel. */
export default function VisionTestPage() {
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL !== undefined) notFound();
  return <VisionTestClient />;
}
