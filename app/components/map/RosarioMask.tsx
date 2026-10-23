"use client";

import L from "leaflet";
import { useEffect } from "react";
import { Polygon, TileLayer, useMap } from "react-leaflet";
import { ROSARIO_BBOX, ROSARIO_BOUNDARY } from "./rosario-boundary";

// Un poco al oeste de la costa, para que la vista la ocupe la ciudad y no las islas del Paraná.
export const ROSARIO_CENTER: L.LatLngTuple = [-32.952, -60.66];
// La vista se mantiene alrededor del municipio; la máscara oscurece lo que queda fuera del límite.
export const ROSARIO_BOUNDS = L.latLngBounds(ROSARIO_BBOX[0], ROSARIO_BBOX[1]);
// Margen extra (dentro de la zona oscurecida) para que un marcador del borde de la ciudad, como el
// centro junto al río, se pueda seguir moviendo para que salga de abajo del panel de detalle.
export const PANNING_BOUNDS = ROSARIO_BOUNDS.pad(0.35);

const BOUNDARY_RINGS: L.LatLngTuple[][] = ROSARIO_BOUNDARY.map((ring) => [...ring]);
const WORLD_RING: L.LatLngTuple[] = [[-90, -180], [-90, 180], [90, 180], [90, -180]];
const OUTSIDE_MASK: L.LatLngTuple[][] = [WORLD_RING, ...BOUNDARY_RINGS];

/** El límite para alejar el zoom depende del tamaño de la pantalla: como máximo, la ciudad entera ocupa la vista. */
function RosarioZoomLimit() {
  const map = useMap();
  useEffect(() => {
    const update = () => map.setMinZoom(map.getBoundsZoom(ROSARIO_BOUNDS));
    update();
    map.on("resize", update);
    return () => {
      map.off("resize", update);
    };
  }, [map]);
  return null;
}

/**
 * Capas comunes de los mapas de Rosario: tiles de OpenStreetMap, todo lo de afuera del límite
 * municipal oscurecido, el contorno de la ciudad y el límite para alejar el zoom. Va dentro de un
 * MapContainer con `maxBounds={PANNING_BOUNDS}`.
 */
export function RosarioMask() {
  return (
    <>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        bounds={PANNING_BOUNDS}
      />
      <Polygon
        positions={OUTSIDE_MASK}
        interactive={false}
        pathOptions={{ stroke: false, fillColor: "#3f3f46", fillOpacity: 0.55 }}
      />
      <Polygon
        positions={BOUNDARY_RINGS}
        interactive={false}
        pathOptions={{ color: "#18181b", weight: 2, fill: false }}
      />
      <RosarioZoomLimit />
    </>
  );
}
