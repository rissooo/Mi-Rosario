"use client";

import { useEffect, useRef, useState } from "react";
import { PhotoError, preparePhoto } from "./photo";

const sizeFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

/** Elegir o sacar la foto; se prepara en el navegador antes de guardarla en el borrador. */
export function PhotoField({
  photo,
  onChange,
  errors,
}: {
  photo: File | null;
  onChange: (photo: File | null) => void;
  errors?: string[];
}) {
  const [preparing, setPreparing] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);

  // La URL de la vista previa se crea al elegir la foto y se libera al cambiarla o al salir.
  const replacePreview = (file: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = file ? URL.createObjectURL(file) : null;
    setPreviewUrl(previewRef.current);
  };
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setPreparing(true);
    setReadError(null);
    try {
      const prepared = await preparePhoto(file);
      replacePreview(prepared);
      onChange(prepared);
    } catch (error) {
      replacePreview(null);
      onChange(null);
      setReadError(error instanceof PhotoError ? error.message : "No pudimos leer la foto. Probá con otra.");
    } finally {
      setPreparing(false);
    }
  };

  const messages = [...(readError ? [readError] : []), ...(errors ?? [])];

  return (
    <div className="flex flex-col gap-2">
      {photo && previewUrl && (
        // La vista previa es un blob local del dispositivo; next/image no aplica.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt="Vista previa de la foto del reporte" className="aspect-video w-full rounded-lg object-cover" />
      )}
      <label className="flex h-12 cursor-pointer items-center justify-center rounded-full border border-black/[.08] bg-white px-5 font-medium dark:border-white/[.145] dark:bg-zinc-950">
        {preparing ? "Preparando la foto..." : photo ? "Cambiar la foto" : "Sacar o elegir una foto"}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={preparing}
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      {photo && !preparing && (
        <p className="text-sm text-zinc-500">Foto lista ({sizeFormat.format(photo.size / (1024 * 1024))} MB)</p>
      )}
      {messages.map((message) => (
        <p key={message} role="alert" className="text-sm text-red-700 dark:text-red-400">{message}</p>
      ))}
    </div>
  );
}
