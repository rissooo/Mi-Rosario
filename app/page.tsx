import { redirect } from "next/navigation";

// La app es el mapa: la raíz lleva directo a /mapa. Es un redirect temporal (307) para poder
// reemplazarlo más adelante por una portada.
export default function Home() {
  redirect("/mapa");
}
