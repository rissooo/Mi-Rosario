import { MAX_IMAGE_BYTES } from "@/lib/contracts/reports";
import { fitWithin, JPEG_QUALITIES } from "./photo-size";

export class PhotoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhotoError";
  }
}

const toJpeg = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

/**
 * Prepara la foto para publicar: aplica la rotación del EXIF, achica el lado mayor a 2560 px y la
 * vuelve a codificar como JPEG. Rehacer la imagen en un canvas descarta todos los metadatos EXIF,
 * incluida la ubicación GPS de donde se sacó.
 */
export async function preparePhoto(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoError("No pudimos leer la foto. Probá con otra.");
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new PhotoError("No pudimos procesar la foto. Probá con otra.");
    context.drawImage(bitmap, 0, 0, width, height);
    for (const quality of JPEG_QUALITIES) {
      const blob = await toJpeg(canvas, quality);
      if (blob && blob.size <= MAX_IMAGE_BYTES) return new File([blob], "foto.jpg", { type: "image/jpeg" });
    }
    throw new PhotoError("La foto sigue siendo muy pesada. Probá con otra.");
  } finally {
    bitmap.close();
  }
}
