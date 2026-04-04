# Kobalt Kernel FLAT — Contexto permanente

## Marco doctrinal

Este proyecto es un motor algebraico de estado local-first.
Analiza siempre como sistema matemático local-first, NO como app cliente-servidor.
Habla siempre en español. Primero claridad matemática, luego claridad conceptual, luego código.

## Axiomas fundamentales

1. **Local-first fuerte**: la verdad semántica nace en local. La red es persistencia opaca y pasiva.
2. **La red es pasiva**: los conectores no interpretan entidades, no calculan identidad, no deciden conflictos.
3. **Identidad de génesis**: entityId nace de (nodeId + counter), NO del payload inicial.
4. **Estado separado de identidad**: stateHash depende del payload actual. entityId no.
5. **Actualidad compacta**: la actualidad resume el universo visible. No es historia completa.
6. **Sync ≠ repaint**: sincronizar no implica actualizar el DOM. Solo renderizar si hay diferencia visible.
7. **Función universal**: si dos funciones comparten transformación y solo cambia el input, son una familia universal.

## Separación de identidades — invariante absoluta

- `H_u` → identidad de usuario
- `nodeId` → identidad estable de la instalación local
- `entityId` = H(nodeId ∥ counter)[0..7] → identidad de entidad
- `stateHash` = H(payload)[0..15] → estado actual
- `mapHash` = H(canonical(entidades)) → actualidad compacta

## Estructura del sistema — tres regímenes

S (servidor) ∩ K (kernel) = ∅

- **S**: autenticación, cómputo de H_u. Después del login, desaparece.
- **B**: puente efímero. Recibe H_u, computa anchor, destruye H_u.
- **L**: kernel local. Toda la ontología vive aquí.
- **Conectores**: dimensión separada. Contrato mínimo: put/get/list/status.

## Metodología obligatoria — nunca código primero

1. Claridad matemática → ¿qué transforma qué? ¿qué invariantes se mantienen?
2. Claridad conceptual → ¿cuáles son las piezas? ¿qué hace cada una?
3. Solo entonces → código simple, fiable y mínimo.

Al analizar código o diseño:
1. Identifica axiomas
2. Identifica funciones universales
3. Detecta redundancias conceptuales
4. Verifica invariantes
5. Propón simplificaciones fieles a la arquitectura

## Invariantes que nunca se rompen

- `entityId` no depende del payload
- `stateHash` cambia cuando cambia el contenido
- `nodeId` es estable en la instalación local
- La red nunca conoce el payload claro
- Sin conectores, la app sigue siendo operativa
- Si mapHash coincide, no hay trabajo de sync estructural
- Si el estado visible no cambia, el DOM no se toca

## Reducción de primitivas

KERNEL = (Ω, ℱ, ℐ)
  Ω = estado local-first
  ℱ = {HMAC, AES-GCM, Opacidad, canonical}
  ℐ = invariantes
  ∀ f ∈ ℱ: f(Ω) ⊆ Ω ∧ ℐ(f(Ω)) = true

No multipliques conceptos si una misma estructura algebraica ya los explica.
Los conectores no son kernel: son persistencia remota bajo contrato común.
Evalúa cada pieza preguntando: ¿qué es ontológicamente? ¿qué preserva? ¿qué transforma? ¿qué invariante mantiene? ¿es primitiva real o instancia semántica de algo más general?
