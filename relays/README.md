# Kobalt — Relays

Nodos que conectan nodos sin IP pública alcanzable.
No almacenan nada. Solo enrutan tráfico.

## Tipos planificados

- **IPv4/**             — servidor con IP pública fija (TCP/WS).
- **WebRTC/**           — STUN/TURN para P2P entre nodos de browser.
- **CloudflareTunnel/** — túnel HTTPS sin IP pública ni puertos abiertos.

## Nota

No implementar lógica hasta que el diseño P2P esté maduro.
La estructura de registro y descubrimiento (definition.json + services_api.php)
sigue el mismo patrón que storages y proxies.
