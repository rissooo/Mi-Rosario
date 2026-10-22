# Límite de la interfaz de reportes — Fran

Reservado para `feature/interface-map`. Acá no se implementa ningún componente ni pantalla; un README no expone una ruta de Next.js.

Usá los contratos y fixtures públicos de `lib/contracts/`. Los futuros formularios permiten elegir a mano las cuatro categorías, editar las sugerencias de Gemini (que pueden ser nulas) y que el vecino revise la gravedad y la ubicación. Conservá el archivo original en el dispositivo hasta la publicación explícita en multipart, mantené una sola clave de idempotencia entre reintentos y recuperá el borrador después de un error.

El futuro detalle del marcador muestra foto, título, descripción, categoría, gravedad, estado, ubicación, fecha y cantidad de confirmaciones. Pedí `/confirmations/me` solo con sesión. Mostrá el estado y el umbral que devuelve el servidor en lugar de fijar transiciones en el código. No importes repositorios, clientes del servidor ni código de proveedores, ni escribas directamente en las tablas del producto. Conservá el comportamiento existente del login, el logout y el callback.
