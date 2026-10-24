# Tasks

## 1. Inicio

- [x] 1.1 Reemplazar `app/page.tsx` por un `redirect("/mapa")` temporal. Verificar con `npm run build` y con `next dev` que `/` responde 307 hacia `/mapa`.

## 2. Verificación

- [x] 2.1 Correr `npm run lint`, `npx tsc --noEmit --incremental false`, `npm run build`, `openspec validate redirect-home-to-map --strict` y `git diff --check`.
- [ ] 2.2 Abrir la dirección pública en un celular y comprobar que entra directo al mapa.
