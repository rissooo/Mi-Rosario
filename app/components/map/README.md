# Límite del mapa

Reservado para el change de interfaz aparte. Acá no se agrega ninguna librería de mapas, componente ni ruta.

Mantené la estructura existente de `app/` en la raíz. Consultá la documentación de Next.js instalada antes de definir el límite de Leaflet, que funciona solo en el navegador. Las futuras consultas por área visible recorren todas las páginas del cursor y usan `categoryId`, el `status` de cuatro etapas y un bounding box validado.

Las etapas institucionales no están disponibles en los datos reales del MVP. Nunca muestres ejemplos sintéticos municipales o resueltos como actividad oficial. Los fixtures aislados tienen que conservar la etiqueta "Simulación - sin aval municipal". Ver `docs/contracts.md` para las dependencias de integración.
