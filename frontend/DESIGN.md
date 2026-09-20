# Design System Document: Financial Precision & Kinetic Depth

## 1. Overview & Creative North Star
**Creative North Star: The Kinetic Vault**

This design system is engineered to move fintech beyond the static grid of traditional banking into a high-performance, editorial experience. It prioritizes "Kinetic Depth"—the feeling that the UI is composed of intelligent, layered surfaces that react to user intent. By utilizing a deep, near-black foundation contrasted with hyper-visible neon accents, we create a "Dark Mode First" environment that feels premium, authoritative, and technologically advanced. 

The system breaks away from "template" looks through **intentional asymmetry** and **high-contrast typography scales**. Large, display-grade numerals are treated as hero elements, while metadata is tucked into technical, mono-spaced labels. The result is a dashboard that feels less like a spreadsheet and more like a high-end physical timepiece.

---

## 2. Colors & Surface Philosophy
The palette is built on a "Total Black" ethos, using shifts in luminosity rather than lines to define structure.

### Core Palette
- **Background (`#0e0e0e`):** The absolute foundation. All depth is built *up* from here.
- **Primary (`#f3ffca`) & Primary Container (`#cafd00`):** These "Neon Sulfur" tones are reserved for high-action touchpoints and critical financial data.
- **Secondary (`#6bfe9c`):** Used for "Growth" metrics and secondary positive actions.
- **Surface Tiers:** From `surface-container-lowest` (`#000000`) to `surface-bright` (`#2c2c2c`), these define the hierarchy.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders to section content. Boundaries must be defined solely through:
1. **Background Color Shifts:** A `surface-container-low` card sitting on a `surface` background.
2. **Subtle Tonal Transitions:** Using depth to imply containment.

### The "Glass & Gradient" Rule
To inject "soul" into the dark interface, use **Glassmorphism** for floating elements (modals, dropdowns, navigation bars). Apply a semi-transparent `surface-variant` with a 20px-40px backdrop blur. For main CTAs, use a linear gradient from `primary` to `primary-container` to create a 3D "lit-from-within" effect.

---

## 3. Typography: Editorial Authority
The type system uses a mix of **Manrope** for structural authority and **Inter** for functional clarity, punctuated by **Space Grotesk** for technical data.

- **Display & Headlines (Manrope):** Large, bold, and unapologetic. Use `display-lg` (3.5rem) for total account balances. The tight tracking and heavy weight convey financial security.
- **Body (Inter):** High-legibility sans-serif for descriptions and transactional data.
- **Labels (Space Grotesk):** This is our "Technical Signature." Use `label-md` for ID numbers, timestamps, and micro-copy. Its geometric, slightly industrial feel reinforces the high-tech fintech aesthetic.

---

## 4. Elevation & Depth: Tonal Layering
Traditional drop shadows are replaced by **Ambient Luminance**.

- **The Layering Principle:** Stack `surface-container` tiers to create natural lift. Place a `surface-container-highest` card inside a `surface-container-low` section to highlight a specific transaction.
- **Ambient Shadows:** For floating elements, use extra-diffused shadows (e.g., `box-shadow: 0 20px 40px rgba(0,0,0,0.4)`). The shadow should never look "grey"; it should appear as the absence of the ambient neon glow.
- **The "Ghost Border" Fallback:** If accessibility requires a container boundary, use the `outline-variant` token at **10% opacity**. It should be felt, not seen.
- **Haptic Surfaces:** Buttons and interactive cards should use `surface-bright` on hover, creating the illusion of the element moving toward the screen's light source.

---

## 5. Components

### Buttons
- **Primary:** Gradient-filled (`primary` to `primary_container`) with `on_primary_fixed` text. Roundedness: `full`.
- **Secondary:** Ghost-style with a `primary` ghost-border (15% opacity) and `primary` text.
- **Tertiary:** Purely typographic, using `label-md` for a technical, understated feel.

### Cards & Lists
- **Rule:** Forbid divider lines. 
- **Execution:** Separate list items using 12px of vertical white space or by alternating between `surface-container` and `surface-container-low`. 
- **Financial Cards:** Use `surface-container-high` with an `xl` (1.5rem) corner radius. These should feel like physical, weighted slabs.

### Input Fields
- **State:** Active inputs should glow. Use a 1px `primary` border with a `primary` outer-glow (blur: 8px, opacity: 20%).
- **Typography:** Placeholder text uses `on_surface_variant`. Input text uses `on_surface`.

### Additional Component: "The Pulse"
A custom component for financial dashboards—a small, breathing `secondary_dim` dot next to "Live Market" data to indicate real-time connectivity without using heavy text labels.

---

## 6. Do's and Don'ts

### Do:
- **Use "Space as Structure":** Lean on the spacing scale to separate "Deposit" and "Withdrawal" actions rather than drawing a line between them.
- **Embrace Asymmetry:** Place a large balance (`display-md`) on the left, balanced by a subtle "Detail" chip on the right to create dynamic visual tension.
- **Tonal Nesting:** Put `surface-container-lowest` elements inside `surface-container-highest` parents to create "recessed" wells for data entry.

### Don't:
- **Never use Pure White for Body Text:** Use `on_surface_variant` for secondary text to reduce eye strain and maintain the premium dark aesthetic.
- **No Sharp Corners:** Avoid the `none` or `sm` roundedness tokens for containers. We want "Premium High-Tech," which requires the organic feel of `lg` and `xl` radii.
- **Avoid High-Opacity Borders:** High-contrast lines break the "Kinetic Depth" illusion and make the UI feel like a 2010s-era spreadsheet.