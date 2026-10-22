/** Synthetic map examples spread across Rosario. Not real reports or official data. */
import { cloneFixture, REPORT_FIXTURES, VERIFICATION_FIXTURES } from "../../../lib/contracts/fixtures";
import type { CategoryId } from "../../../lib/contracts/categories";
import type { Report, Severity } from "../../../lib/contracts/reports";
import { validateReport } from "../../../lib/contracts/validation";

type SampleInput = {
  title: string;
  description: string;
  categoryId: CategoryId;
  severity: Severity;
  latitude: number;
  longitude: number;
  /** Approximate address for the synthetic example. */
  street: string;
  number: number | null;
  createdAt: string;
  /** Verification base: 0 pending, 1 at threshold 3, 2 at alternate threshold 5. */
  verification?: "below-threshold" | "at-threshold" | "alternate-threshold";
};

const VERIFICATION_BASES = {
  "below-threshold": VERIFICATION_FIXTURES[0],
  "at-threshold": VERIFICATION_FIXTURES[1],
  "alternate-threshold": VERIFICATION_FIXTURES[2],
} as const;

const INPUTS: readonly SampleInput[] = [
  { title: "Bache profundo frente al Monumento", description: "Bache de casi un metro sobre la calzada, los autos lo esquivan invadiendo el otro carril.", categoryId: "pothole", severity: "high", latitude: -32.9477, longitude: -60.6304, street: "Santa Fe", number: 581, createdAt: "2026-10-20T13:10:00.000Z", verification: "at-threshold" },
  { title: "Falta de luz en Plaza 25 de Mayo", description: "Tres columnas de alumbrado apagadas sobre el lado de calle Córdoba.", categoryId: "missing-light", severity: "medium", latitude: -32.947, longitude: -60.6363, street: "Córdoba", number: 650, createdAt: "2026-10-19T22:40:00.000Z", verification: "below-threshold" },
  { title: "Vereda levantada por raíces en Pichincha", description: "Las raíces de un árbol levantaron las baldosas y cuesta pasar con cochecito.", categoryId: "damaged-sidewalk", severity: "medium", latitude: -32.9387, longitude: -60.6513, street: "Güemes", number: 2150, createdAt: "2026-10-18T15:05:00.000Z" },
  { title: "Semáforo que no cambia en Echesortu", description: "La persona declara que el semáforo queda fijo en rojo para ambas manos.", categoryId: "faulty-traffic-light", severity: "high", latitude: -32.9496, longitude: -60.6702, street: "Mendoza", number: 4000, createdAt: "2026-10-21T08:30:00.000Z", verification: "alternate-threshold" },
  { title: "Bache en la entrada del Parque Independencia", description: "Pozo mediano en la curva de ingreso, se llena de agua cuando llueve.", categoryId: "pothole", severity: "medium", latitude: -32.9572, longitude: -60.6576, street: "Parque Independencia", number: null, createdAt: "2026-10-17T11:20:00.000Z" },
  { title: "Baldosas sueltas en barrio Martin", description: "Varias baldosas flojas en la vereda, se mueven al pisarlas.", categoryId: "damaged-sidewalk", severity: "low", latitude: -32.9523, longitude: -60.6289, street: "Chacabuco", number: 1850, createdAt: "2026-10-16T17:45:00.000Z" },
  { title: "Falta de luz en pasaje del Abasto", description: "El pasaje está sin alumbrado desde hace una semana.", categoryId: "missing-light", severity: "low", latitude: -32.9601, longitude: -60.6403, street: "Ayacucho", number: 2650, createdAt: "2026-10-15T21:15:00.000Z" },
  { title: "Bache sobre avenida en Alberdi", description: "Bache grande en el carril derecho de la avenida, cerca de la parada de colectivo.", categoryId: "pothole", severity: "high", latitude: -32.8918, longitude: -60.6915, street: "Av. Alberdi", number: 950, createdAt: "2026-10-21T10:00:00.000Z", verification: "below-threshold" },
  { title: "Semáforo peatonal apagado en Fisherton", description: "La persona declara que el semáforo peatonal no enciende en ningún momento.", categoryId: "faulty-traffic-light", severity: "medium", latitude: -32.93, longitude: -60.733, street: "Av. Eva Perón", number: 8200, createdAt: "2026-10-14T09:50:00.000Z" },
  { title: "Vereda rota en barrio Belgrano", description: "Tramo de vereda hundido de unos tres metros frente a la escuela.", categoryId: "damaged-sidewalk", severity: "high", latitude: -32.9454, longitude: -60.7037, street: "Córdoba", number: 6400, createdAt: "2026-10-20T07:35:00.000Z", verification: "at-threshold" },
  { title: "Falta de luz en República de la Sexta", description: "Cuadra completa sin alumbrado público sobre la calle interna.", categoryId: "missing-light", severity: "medium", latitude: -32.9643, longitude: -60.6386, street: "Ituzaingó", number: 1300, createdAt: "2026-10-13T23:05:00.000Z" },
  { title: "Bache chico en Saladillo", description: "Bache pequeño junto al cordón, todavía no complica la circulación.", categoryId: "pothole", severity: "low", latitude: -33.001, longitude: -60.6385, street: "Lamadrid", number: 650, createdAt: "2026-10-12T14:25:00.000Z" },
];

function toReport(input: SampleInput, index: number): Report {
  const base = input.verification ? VERIFICATION_BASES[input.verification] : REPORT_FIXTURES[index % REPORT_FIXTURES.length];
  const report = cloneFixture(base);
  const suffix = String(index + 1).padStart(12, "0");
  return {
    ...report,
    id: `20000000-0000-4000-8000-${suffix}`,
    title: input.title,
    description: input.description,
    categoryId: input.categoryId,
    severity: input.severity,
    location: {
      latitude: input.latitude,
      longitude: input.longitude,
      address: { street: input.street, number: input.number },
    },
    photo: { ...report.photo, id: `30000000-0000-4000-8000-${suffix}` },
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export const SAMPLE_REPORTS: readonly Report[] = INPUTS.map(toReport);

if (process.env.NODE_ENV !== "production") {
  for (const report of SAMPLE_REPORTS) {
    const result = validateReport(report);
    if (!result.valid) {
      throw new Error(`Sample report ${report.id} is invalid: ${JSON.stringify(result.error.fieldErrors)}`);
    }
  }
}
