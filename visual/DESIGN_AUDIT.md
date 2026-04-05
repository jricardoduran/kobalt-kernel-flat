# Design System Audit — Kobalt Red FLAT
*Fase 0 — Auditado el 2026-04-04. Base: Phase 2 tokens completos.*

---

## RESUMEN EJECUTIVO

El sistema tiene ahora una arquitectura de tokens sólida (5 archivos en `visual/tokens/`).
Los problemas detectados en esta audit son de **aplicación** — componentes que no usan
los tokens disponibles, o HTML que tiene estilos inline que deberían vivir en CSS.

---

## 1. BUGS CRÍTICOS (rompían funcionalidad)

### BUG-01: Botones de login sin clase `btn` ✅ CORREGIDO
- **Problema:** `<button class="btn-primary">` — el CSS ahora requiere `.btn.btn-primary`
- **Efecto:** Botón "Ingresar" y "Registrar" sin estilos, sin gradiente, inoperables visualmente
- **Fix:** Añadida clase `btn` en `index.html` líneas 46 y 71

---

## 2. VIOLACIONES DE INVARIANTE I13 (CSS inline en HTML)

### Resueltos en esta fase:
| Elemento | Inline style eliminado | Movido a |
|---|---|---|
| `#db-mobile-menu` | display, background, border, color, font-size, cursor, padding | `dashboard.css` |
| `#db-breadcrumb` | color, font-size | `dashboard.css` |
| `#sync-badge` | display:none | `dashboard.css` |
| `#db-sync-btn` | display:none, font-size | `dashboard.css` |
| `#btn-accounts` | display:none, font-size | `dashboard.css` |
| `#acc-badge` | display:none | `dashboard.css` |
| `#thIconL` | display:none | `dashboard.css` |

### Pendientes en commerce.js (template COMMERCE_HTML):
Los template strings en JS contienen `style="..."` inline — violación de I13.
Requiere extraer esos estilos a `apps/commerce/commerce.css`.

| Elemento | Inline style pendiente |
|---|---|
| `#ki-session` | font-family, font-size, color |
| `#add-name`, `#add-sku`, `#add-stk` | flex, width, min-width |
| `#chip-nostock`, `#chip-low` | display:none |
| `#chip-nosku` | display:none |
| varios | flex:1, display:none |

---

## 3. VIOLACIONES DE INVARIANTE ⑥ (cero !important)

### Resueltos en dashboard.css:
| Selector antiguo | Fix aplicado |
|---|---|
| `.db-section-head { font-size !important; ... }` | `.db-section .db-section-head.db-nav-item` (especificidad natural) |
| `.db-section-head:hover { color !important }` | Idem |
| `.db-nav-view { font-size !important; ... }` | `.db-app-children .db-nav-view.db-nav-item` |
| `.db-nav-view:hover { color !important }` | Idem |
| `.db-nav-view.active { color !important; background !important }` | Idem |
| `#db-sidebar.collapsed .db-section-body { display !important }` | ID + class = especificidad alta sin !important |
| `#db-logout-foot:hover { color !important; background !important }` | `#db-logout-foot.db-nav-item:hover` |

**Total eliminados: 11 declaraciones `!important`**

### Pendientes en kobalt.css:
Ninguno — ya se eliminó el `!important` de `.btn-primary` en Phase 2.

---

## 4. COLORES HARDCODEADOS

### Resueltos en dashboard.css:
| Valor antiguo | Token usado |
|---|---|
| `#FFFFFF` (logo dark) | `var(--color-white)` |
| `rgba(92,217,160,.25)` (online badge border) | `var(--ok-border)` |
| `rgba(92,217,160,.08)` (online badge bg) | `var(--ok-bg)` |
| `rgba(240,194,78,.25)` (offline badge border) | `var(--warn-border)` |
| `rgba(240,194,78,.08)` (offline badge bg) | `var(--warn-bg)` |
| `rgba(0,0,0,.52)` (card-overlay) | `var(--color-scrim)` |
| `rgba(92,217,160,.12)` (card-overlay-label bg) | `var(--ok-bg)` |
| `rgba(92,217,160,.35)` (card-overlay-label border) | `var(--ok-border)` |
| `rgba(248,113,113,.6)` (logout color) | `var(--err)` |
| `rgba(248,113,113,.07)` (logout hover bg) | `var(--err-bg)` |

**Total reemplazados: 10 valores hardcodeados**

### Pendientes (aceptados como excepción documentada):
| Valor | Dónde | Razón |
|---|---|---|
| `#2C2838`, `#7A7090` | Logo light mode gradient | Colores de identidad de marca específicos para el logo, no semánticos |
| `rgba(41,197,246,.12)`, `rgba(77,106,247,.08)` | Sidebar border gradient | Definidos en token `--sidebar-grad-border` en dashboard.css |

---

## 5. LAYOUT — ANCHO DEL SIDEBAR

### Resuelto:
| Antes | Después |
|---|---|
| `--sidebar-w: 200px` | `--sidebar-w: clamp(180px, 16%, 240px)` |

El sidebar ahora es fluido entre 180px y 240px dependiendo del ancho del viewport.
En mobile (<768px) cambia a overlay via `position:absolute + transform`.

---

## 6. SIDEBAR HOVER — IMPLEMENTACIÓN SLIDE-IN

**Antes:** `background: var(--sidebar-item-hover)` — cambio de color instantáneo

**Después (spec cumplida):**
- `::before` pseudo-elemento con `translateX(-100%) → translateX(0)` en `120ms var(--ease-out)`
- `::after` pseudo-elemento para indicador izquierdo (`scaleY(0) → scaleY(1)`)
- Active: indicador con opacidad completa, hover con `.45`
- Contenido (icon, label, chevron) en `z-index:1` encima del slide-in

---

## 7. ESTADOS INTERACTIVOS — INVENTARIO

### Completados en esta fase:
| Elemento | default | hover | focus | disabled |
|---|---|---|---|---|
| `.btn.btn-primary` | ✓ grad | ✓ brightness+translate | ✗ pendiente | ✓ opacity |
| `.btn-secondary` | ✓ | ✓ accent | ✗ | ✗ |
| `.btn-ghost` | ✓ | ✓ | ✗ | ✗ |
| `.btn-danger` | ✓ | ✓ shadow | ✗ | ✗ |
| `.btn-cyan` | ✓ | ✓ shadow | ✗ | ✗ |
| `.db-nav-item` | ✓ | ✓ slide-in | ✗ | — |
| `.k-input` | ✓ | ✗ | ✓ glow | ✗ |
| `.toggle` | ✓ | ✗ | ✗ | ✗ |

**Pendientes de completar (Fase 3 del design system):**
- `focus-visible` en todos los botones e inputs
- `disabled` en .btn-secondary, .btn-ghost, .btn-danger, .btn-cyan
- `hover` en .k-input (border-color subtle)
- `hover` en .toggle
- `focus` en .db-nav-item

---

## 8. SPACING — VALORES NO-MÚLTIPLO DE 4

Estos valores existen en el codebase y no son múltiplos de 4px:
- `gap: 10px` en topbar, sidebar → candidato a `var(--space-2)` (8px) o `var(--space-3)` (12px)
- `padding: 14px` en cards → candidato a `var(--space-3)` (12px) o `var(--space-4)` (16px)
- `gap: 7px` en login-card logo → valor cosmético aceptado
- `padding: 6px 8px` en nav items → valores de densidad compacta, aceptados

Regla: para componentes de navegación densa, valores entre múltiplos son aceptables cuando el diseño visual lo requiere. Documentar como excepción.

---

## 9. RESPONSIVE — ESTADO ACTUAL

| Viewport | Login | Dashboard | Sidebar | Tablas |
|---|---|---|---|---|
| 360px | ✓ | ✓ (drawer) | overlay ✓ | pendiente scroll |
| 768px | ✓ | ✓ | overlay ✓ | pendiente |
| 1280px | ✓ | ✓ | inline ✓ | ✓ |
| 1920px | ✓ | ✓ | inline ✓ | ✓ |

**Pendiente:** Tabla en 360px — necesita scroll horizontal limitado al `.table-wrap`.

---

## 10. PRÓXIMAS FASES

| Fase | Descripción | Prioridad |
|---|---|---|
| **Fase 2** | Completar estados focus + disabled en todos los botones | ALTA |
| **Fase 3** | Sidebar hover spec completa (slide-in + indicador) ✅ | COMPLETADO |
| **Fase 4** | Tabla profesional: hover, acciones inline, responsive | MEDIA |
| **Fase 5** | commerce.js: mover inline styles a commerce.css | MEDIA |
| **Fase 6** | Showcase: design app con todos los componentes | BAJA |

---

## TOKENS DISPONIBLES (referencia rápida)

```
FEEDBACK:   --ok  --ok-bg  --ok-border  --warn  --warn-bg  --warn-border
            --err --err-bg --err-border --info-bg --info-border
            --cyan-bg --cyan-border

SUPERFICIES: --page-bg  --surface  --surface-raised  --surface-overlay
             --surface-high  --card-bg  --nav-bg

TEXTO:      --text-primary  --text-secondary  --text-muted

BORDES:     --border-subtle  --border-default  --border-hover

ACENTO:     --accent  --accent-dim  --accent-glow

SOMBRAS:    --shadow-sm  --shadow-md  --shadow-lg  --shadow-drawer
            --shadow-glow  --shadow-glow-cyan  --shadow-btn-*

TIPOGRAFÍA: --text-2xs → --text-display
            --weight-regular → --weight-extrabold
            --leading-*  --tracking-*

SPACING:    --space-1 (4px) → --space-18 (72px)
            --gap-*  --pad-*  --r-xs → --r-full

ANIMACIÓN:  --duration-instant → --duration-slow
            --ease-standard  --ease-natural  --ease-out
            --transition-btn  --transition-card  --transition-input
```
