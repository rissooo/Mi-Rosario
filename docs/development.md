# Desarrollo y acceso individual

Esta es una base local de contratos, no una implementación de endpoints, base de datos ni mapa. La integración en ejecución queda para changes funcionales posteriores. Empezá leyendo AGENTS.md y el change de OpenSpec elegido; los archivos de entrada de Claude y Gemini piden explícitamente esas lecturas.

## Verificaciones locales

El checkout existente tiene Node 24 y las dependencias del proyecto instaladas. Al configurar otra máquina, usá el lockfile del proyecto y una versión de Node compatible. Esta base no agrega dependencias nuevas.

```powershell
npm.cmd run check:contracts
npm.cmd run lint
npm.cmd exec -- tsc --noEmit --incremental false
openspec.cmd validate establish-team-architecture --strict
git diff --check
```

`check:contracts` usa el compilador de TypeScript y el runner de tests de Node instalados. Compila solo el grafo de tests de contratos en un directorio temporal único del sistema, lo ejecuta y borra esa salida temporal. No necesita archivo de entorno, red, sesión de Supabase ni clave de proveedor. No levanta Next.js, no descarga URLs de imágenes ni contacta a Gemini. Ninguno de los comandos de arriba, que no usan credenciales, carga `.env.local` para acceder a servicios.

Si OpenSpec no está en el PATH, usá `npm.cmd config get prefix` para encontrar su instalación global y ejecutá el archivo `openspec.cmd` que está ahí. No inicialices ni regeneres OpenSpec ni las integraciones de los asistentes para arreglar un problema de PATH.

## Cuentas y secretos

Agus usa su propio login de Gemini/Antigravity, Fran su propio login de Claude y Valen su propio login de Codex. Usá el flujo de inicio de sesión vigente de cada herramienta instalada, independiente de las credenciales de proveedores de la aplicación. Los pasos exactos de incorporación y versión de cada producto todavía tienen que verificarse en el entorno de cada compañero; acá no se afirma que la incorporación esté completa.

Para los recursos alojados, invitá la cuenta propia de cada compañero con el rol necesario en el proyecto de prueba. Nunca compartas contraseñas personales de paneles, cookies de sesión ni historiales privados. Usá datos sintéticos o un entorno de prueba dedicado. Los secretos de entorno necesarios se entregan aparte por un canal de secretos aprobado.

Nombres de las variables existentes de la aplicación, **solo con valores ficticios**:

```text
NEXT_PUBLIC_SUPABASE_URL=https://example.invalid
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=placeholder-not-a-real-key
```

Un futuro módulo de visión puede necesitar `GEMINI_API_KEY=placeholder-not-a-real-key`, solo en el servidor; no hace falta para desarrollar contratos del backend. Nunca uses el prefijo `NEXT_PUBLIC_` en secretos de proveedores o de service-role. La configuración publicable de Supabase no reemplaza las políticas de RLS y Storage de la base de datos.

La regla existente que ignora `.env*` también ignora `.env.example`. Mantené los ejemplos en este documento en lugar de agregar una excepción general al ignore. No versiones archivos de entorno privados, credenciales de asistentes ni cachés; revisá qué se ignora y qué se versiona antes de agregar configuración de herramientas. No mires ni copies los secretos de un compañero para incorporarte.

## Revisiones pendientes

- Agus y Fran revisan los DTO comunes, los validadores puros y los fixtures sintéticos antes de integrar módulos.
- Fran demuestra que Claude lee explícitamente las instrucciones compartidas; Agus hace lo mismo en su propia sesión de Gemini/Antigravity.
- Revisar la hoja de contratos de `contracts.md` en una pantalla de celular. Es una revisión de documentos y fixtures, no la aceptación de una pantalla del producto.
- Verificar los flujos exactos de incorporación en esos entornos. Esta base no envió mensajes, invitaciones ni hizo cambios en cuentas.

Ver `contracts.md` para las reglas de ramas y PRs, los responsables de las tareas y las decisiones de producto y operación pendientes.
