# Kobalt — Proxies

Intermediarios stateless que traducen autenticación HMAC → auth nativa.

El nodo siempre llama DIRECTO al endpoint del proxy.
El proxy no es una capa — es un tipo de servicio cuyo endpoint
traduce el token HMAC del nodo a la autenticación nativa del
servicio destino (PRIVATE-TOKEN de GitLab, AWS Sig V4, etc.).

## Tipos planificados

- **WasmerPHP/** — mismo proxy.php en Wasmer. Fallback automático cuando el servidor principal cae.
- **Node/**      — proxy JavaScript (Vercel Edge, Deno Deploy, Cloudflare Workers).

## Invariante

Wasmer es efímero por diseño: stateless, sin estado que perder.
Eso lo hace el candidato perfecto para fallback.
El servidor Kobalt puede caer — GitLab y R2 siguen respondiendo vía Wasmer.
