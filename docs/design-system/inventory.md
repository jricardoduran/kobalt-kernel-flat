# Design System Audit — Kobalt Red FLAT
*Generado después de leer: kobalt.css (578 líneas), dashboard.css (543 líneas)*

---

## 1. TOKENS EXISTENTES

### Paleta base (`:root`) ✓
```
--p-cyan:#29C5F6  --p-blue:#4D6AF7  --p-purple:#7B4FE0
--p-magenta  --p-pink  --p-orange
--ok:#34D399  --warn:#FBBF24  --err:#F87171
```

### Border radii ⚠️ PARCIAL
```
--r-xs:5px   ← no es múltiplo de 4
--r-sm:8px   ✓
--r-md:12px  ✓
--r-lg:18px  ← no es múltiplo de 4
```
**Falta:** `--r-pill` (para badges 20px), `--r-full` (50% para avatares/circles)
**Inconsistencia:** `4px`, `3px`, `2px` hardcodeados en +12 lugares

### Fuentes ✓
```
--font-body  --font-mono
```
**Falta:** escala tipográfica como tokens. Se usan 32 tamaños diferentes (ver §4)

### Sombras ⚠️ PARCIAL
```
--shadow-md  --shadow-drawer  --shadow-glow  --shadow-glow-cyan
```
**Falta:** `--shadow-sm`, `--shadow-lg`, `--shadow-inset`

### Gradientes ✓ (5 tokens)
```
--grad-main  --grad-border  --grad-subtle  --grad-btn  --k-gh  --k-gb
```

### Spacing ✗ NO EXISTE
No hay ningún token de espaciado. Todos los valores son literales.

### Timing / Motion ✗ NO EXISTE
Transiciones hardcodeadas en cada componente. No hay tokens de duración ni easing.

### Tokens semánticos ⚠️ PARCIAL
Existen pero mezclados con primitivos en el mismo bloque:
```
--surface  --surface-raised  --surface-overlay  --surface-high
--text-primary  --text-secondary  --text-muted
--border-default  --border-subtle  --border-hover
--accent  --accent-dim  --accent-glow
--nav-bg  --card-bg  --page-bg
--input-bg  --input-border  --input-focus-border  --input-focus-glow
--badge-ok-bg/color/border  (×3 estados)
--sidebar-bg  --sidebar-border  --sidebar-item-hover  --sidebar-item-active-bg
```
**Falta:** `--color-action-primary`, `--color-action-danger`, separación clara primitivo vs semántico

---

## 2. COLORES HARDCODEADOS — CRÍTICO

### En kobalt.css
| Valor | Veces | Dónde |
|-------|-------|-------|
| `#34D399` | 7 | progress-fill.ok, badge-ok, chip.ok, cname-save, dot.s, alert-ok, hl3 |
| `#FBBF24` | 5 | badge-warn, progress-fill.warn, chip.warn, alert-warn |
| `#F87171` | 4 | badge-err, alert-err |
| `rgba(52,211,153,…)` | 9 | btn-add, badge-ok, alert-ok, connectivity badge, card-overlay |
| `rgba(248,113,113,…)` | 7 | btn-danger, s0 badge, cname-cancel |
| `rgba(77,106,247,…)` | 12 | block hover, card hover, múltiples !important overrides |
| `rgba(41,197,246,…)` | 8 | btn-cyan, chip.cyan, topbar badge |
| `rgba(240,194,78,…)` | 5 | chip-low, hist-month, connectivity offline |
| `rgba(244,112,128,…)` | 3 | s0 badge — ⚠️ distinto de --err #F87171 → inconsistencia |
| `#050C18` | 1 | `.sbp:hover` color — completamente hardcodeado |
| `rgba(0,0,0,.52)` | 1 | card-overlay background |
| `#fff` / `#ffffff` | 6 | btn-primary color, toggle checked, acc-avatar |

### En dashboard.css
| Valor | Veces | Dónde |
|-------|-------|-------|
| `rgba(41,197,246,.12)` | 1 | sidebar border-box gradient |
| `rgba(77,106,247,.08)` | 1 | sidebar border-box gradient |
| `rgba(248,113,113,.6)` | 1 | logout foot color |
| `rgba(248,113,113,.07)` | 1 | logout foot hover bg |
| `#FFFFFF` | 1 | db-logo-text dark mode |
| `#2C2838`, `#7A7090` | 1 | db-logo-text light mode gradient |

**Total hardcodes identificados: ~65 instancias**

---

## 3. VIOLACIONES DE !important — CRÍTICO

```css
/* kobalt.css */
.btn-primary          { background !important; color !important; border-color !important }
.btn-primary:hover    { color:#fff !important }

/* dashboard.css */
.db-section-head      { font-size !important; font-weight !important; color !important }
.db-section-head:hover{ color !important }
.db-nav-view          { font-size !important; color !important; min-height !important; padding !important }
.db-nav-view:hover    { color !important }
.db-nav-view.active   { color !important; background !important }
.db-logout-foot:hover { color !important; background !important }
.db-sidebar.collapsed .db-section-body { display !important }
```
**Total: 15 declaraciones con !important** — todas eliminables con especificidad correcta.

La causa raíz: `.btn-primary` extiende `.btn` en lugar de ser una variante limpia.
Solución: arquitectura BEM `.btn--primary` o uso de `[class~="btn-primary"]` con mayor especificidad natural.

---

## 4. ESCALA TIPOGRÁFICA — CAÓTICA

Se encontraron **32 tamaños de fuente distintos**:
```
.58 .6 .62 .63 .65 .66 .68 .7 .72 .73 .74 .75 .76 .78
.8 .82 .84 .85 .86 .87 .88 .9 .92 .95 .96 1 1.25 1.3
1.4 1.8 2 2.4 rem
```
Un sistema coherente necesita **6-8 tamaños máximo** con tokens:
```
--text-2xs  --text-xs  --text-sm  --text-base  --text-md
--text-lg  --text-xl  --text-2xl  --text-3xl  --text-display
```

---

## 5. ESCALA DE ESPACIADO — NO EXISTE

Valores de padding/gap encontrados en el código:
```
2px 3px 4px 5px 6px 7px 8px 9px 10px 11px 12px 13px 14px
16px 18px 20px 22px 24px 28px 30px 32px 40px 48px 64px 72px
```
La base debería ser **4px**. Algunos valores (3, 5, 6, 7, 9, 11, 13) no son múltiplos de 4.

Tokens necesarios:
```
--space-1:4px  --space-2:8px  --space-3:12px  --space-4:16px
--space-5:20px --space-6:24px --space-8:32px  --space-10:40px
--space-12:48px --space-16:64px
```

---

## 6. TRANSICIONES EMBEBIDAS — VIOLA ARQUITECTURA

Cada componente define sus propias duraciones y easings:
```
.btn            transition: all .15s cubic-bezier(.4,0,.2,1)
.card           transition: box-shadow .2s, transform .15s, border-color .18s
.card::before   transition: left .45s ease
.card::after    transition: opacity .22s
.toggle-slider  transition: all .2s
.db-nav-item    transition: all .12s
.cp-btn         transition: border-color .2s, box-shadow .2s
.accounts-drawer transition: transform .3s cubic-bezier(.4,0,.2,1)
.k-input        transition: border-color .2s, box-shadow .2s
```
**9 duraciones distintas: .12s .15s .18s .2s .22s .25s .3s .3s .45s**
**4 easing distintos** sin tokens

---

## 7. ESTADOS INCOMPLETOS POR COMPONENTE

| Componente | default | hover | focus | disabled | loading |
|------------|---------|-------|-------|----------|---------|
| .btn       | ✓ | ✓ | ✗ | solo primary | ✗ |
| .btn-secondary | ✓ | ✓ | ✗ | ✗ | ✗ |
| .btn-ghost | ✓ | ✓ | ✗ | ✗ | ✗ |
| .btn-danger | ✓ | ✓ | ✗ | ✗ | ✗ |
| .k-input | ✓ | ✗ | ✓ | ✗ | — |
| .k-select | ✓ | ✗ | ✓ | ✗ | — |
| .toggle | ✓ | ✗ | ✗ | ✗ | — |
| .fbtn | ✓ | ✓ | ✗ | ✗ | — |
| .app-tab | ✓ | ✓ | ✗ | ✗ | — |
| .tab-btn | ✓ | ✓ | ✗ | ✗ | — |

---

## 8. DUPLICACIONES Y CONFLICTOS

```css
/* Definido 2 veces: */
#toast          → línea 235 y 570 (la segunda sobreescribe — intencional pero frágil)
.input-wrap     → línea 526 y 575 (ídem)
.table-wrap tbody tr → línea 459 y 565 (conflicto en cascade)

/* .chip redefinido: */
kobalt.css §F1-F5: .chip { background:var(--surface-raised); border:var(--border-subtle) }
kobalt.css §design: .chip { display:inline-flex; background:var(--surface-raised); border:var(--border-default) }
→ misma clase, definición diferente, el orden de cascada decide
```

---

## 9. INCONSISTENCIAS DETECTADAS

1. **`.s0` badge** usa `rgba(244,112,128,…)` — diferente al token `--err:#F87171` y `rgba(248,113,113,…)` usados en el resto
2. **Border radii**: `4px` hardcodeado en badge, `3px` en sbadge/fi/sb — ninguno es un token
3. **Logo dark**: `color:#FFFFFF` hardcodeado en lugar de `var(--text-primary)` o token de nav
4. **`.db-section-body { display:none !important }`** en collapsed — innecesario si la especificidad fuera correcta
5. **Sidebar border gradient** hardcodea colores cyan/blue en lugar de usar `--grad-main`
6. **Alert colors** usan hex puro en lugar de los tokens `--badge-*-color` ya existentes

---

## 10. ARQUITECTURA ACTUAL vs OBJETIVO

### Actual
```
visual/
  kobalt.css     ← 578 líneas, todo mezclado
dashboard/
  dashboard.css  ← 543 líneas, layout + componentes + hardcodes
```

### Objetivo
```
visual/tokens/
  colors.css       ← paleta base (ramps, sin semántica)
  semantic.css     ← tokens semánticos dark + light
  typography.css   ← escala tipográfica con tokens
  spacing.css      ← escala 4px base
  animations.css   ← @keyframes + timing variables

visual/components/
  button.css       ← .btn y todas sus variantes/estados
  badge.css        ← .badge y variantes
  input.css        ← .k-input, .k-select, .input-group
  toggle.css       ← .toggle y estados
  card.css         ← .card y variantes
  table.css        ← .table-wrap
  alert.css        ← .alert y variantes
  toast.css        ← #toast
  sidebar.css      ← navegación del dashboard

visual/kobalt.css  ← solo @import de tokens + components
```

---

## 11. PRIORIDADES DE CORRECCIÓN

### CRÍTICO (bloquean escalabilidad)
- [ ] Crear `tokens/spacing.css` — sin esto todo spacing es magia
- [ ] Crear `tokens/typography.css` — reducir 32 tamaños a 8
- [ ] Crear `tokens/animations.css` — unificar timing
- [ ] Eliminar todos los `!important` — causan bugs en producción
- [ ] Resolver duplicados (`#toast`, `.input-wrap`, `.table-wrap tbody tr`)

### MEDIO (afectan consistencia)
- [ ] Tokenizar los 65 hardcodes de color identificados
- [ ] Añadir `--r-pill:20px`, `--r-full:9999px` a radii
- [ ] Estados `focus-visible` y `disabled` en todos los interactivos
- [ ] Unificar `.s0` (usa color diferente al token --err)
- [ ] Logo dark: usar token en lugar de `#FFFFFF`

### COSMÉTICO (mejoran pulido)
- [ ] Sidebar border-box gradient → usar `--grad-main`
- [ ] Alert usar tokens `--badge-*` ya existentes
- [ ] Separar archivos por componente
- [ ] Eliminar `.chip` duplicado

---

## RESUMEN EJECUTIVO

El sistema tiene **buena base de tokens semánticos** dark/light, **buena paleta de marca**,
y **componentes funcionales**. Los problemas son estructurales:

1. **Sin escala de spacing** → cada dev inventa los valores
2. **Sin escala tipográfica** → 32 tamaños caóticos
3. **15 !important** → especificidad rota
4. **65 hardcodes de color** → temas imposibles de mantener
5. **9 duraciones distintas** sin tokens → animaciones inconsistentes
6. **Monolito de 1121 líneas totales** → imposible de mantener a escala

**La Fase 2 debe empezar por `tokens/`** — el resto son síntomas.
