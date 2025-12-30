# Design Guidelines: WhatsApp Multi-Account CRM System

## Design Approach

**Selected Approach:** Design System + Reference-Based Hybrid
- **Primary References:** WhatsApp Web (chat UI patterns) + Chatwoot (CRM organization) + Linear (professional polish)
- **Rationale:** Utility-focused productivity tool requiring familiar chat patterns with professional CRM aesthetics

## Core Design Principles

1. **Information Density:** Maximize workspace efficiency without overwhelming users
2. **Familiar Patterns:** Leverage established chat UI conventions for zero learning curve
3. **Professional Restraint:** Clean, modern SaaS aesthetic over flashy design
4. **Functional Clarity:** Every element serves a clear purpose

## Typography

**Font Stack:** Inter (primary) + system-ui fallback
- **Headings:** 
  - H1: 24px, semibold (page titles)
  - H2: 18px, semibold (section headers)
  - H3: 16px, medium (card titles)
- **Body Text:**
  - Regular: 14px, normal (messages, list items)
  - Small: 13px, normal (metadata, timestamps)
  - Tiny: 12px, normal (labels, hints)
- **Special:**
  - Message content: 15px, normal (improved readability)
  - Contact names: 15px, medium (emphasis in lists)

## Layout System

**Spacing Primitives:** Consistent use of Tailwind units: 1, 2, 3, 4, 6, 8, 12, 16
- **Micro-spacing:** p-2, gap-2 (within components)
- **Component-spacing:** p-4, gap-4 (card padding, button groups)
- **Section-spacing:** p-6, py-8 (between major sections)
- **Macro-spacing:** p-12, py-16 (page-level separation)

**Grid System:**
- Three-column dashboard layout: `16rem | flex-1 | 20rem` (conversations | chat | details)
- Responsive breakpoint: Stack to single column below 1024px
- Container max-width: Full viewport (no centering constraints)

## Component Library

### Navigation & Structure

**Top Navigation Bar:**
- Height: h-14
- Border bottom: 1px solid
- Contents: Company logo/name (left), user menu (right)
- Padding: px-6

**Sidebar/Conversation List:**
- Width: 16rem (fixed)
- Scrollable content area
- Filters section at top (py-4, px-3)
- Conversation items: h-20, px-3, hover state, active highlight
- Avatar: 48px circle
- Timestamp alignment: top-right
- Tag pills: Small, rounded-full, inline

**Chat Window (Center):**
- Header: h-14, border-bottom, contact info + status dropdown
- Message area: flex-1, overflow-auto, px-6, py-4
- Message bubbles: max-w-lg, rounded-2xl, px-4, py-2
- Input footer: border-top, p-4, textarea with min-h-12

**Details Panel (Right):**
- Width: 20rem (fixed)
- Scrollable sections
- Contact card: centered avatar (96px), p-6
- Notes textarea: min-h-32, p-3
- Tags section: flex-wrap gap-2 for chips

### Core UI Elements

**Buttons:**
- Primary: px-4, py-2, rounded-lg, medium weight
- Secondary: border variant, same sizing
- Icon buttons: p-2, rounded-lg (for actions)

**Input Fields:**
- Height: h-10 (standard), h-12 (prominent like search)
- Padding: px-3
- Border: 1px solid, rounded-lg
- Focus: ring-2 treatment

**Dropdowns/Selects:**
- Height: h-10
- Custom styled to match input fields
- Dropdown menus: rounded-lg, shadow-lg, border

**Cards:**
- Rounded: rounded-lg
- Padding: p-4 or p-6 (depending on content)
- Borders: 1px solid

**Tags/Pills:**
- Height: h-6
- Padding: px-2.5
- Font: 12px, medium
- Rounded: rounded-full
- Remove button: hover state with X icon

### Data Display

**Conversation List Items:**
- Structure: Avatar (left) | Content (center) | Meta (right)
- Avatar size: 48px
- Name: 15px, medium, truncate
- Message preview: 13px, normal, text-gray, truncate
- Timestamp: 12px, top-right
- Active state: subtle background, border-left accent (3px)

**Message Bubbles:**
- Incoming: align-left, rounded-2xl (tighter radius on left)
- Outgoing: align-right, rounded-2xl (tighter radius on right)
- Internal notes: full-width, different border, italic text
- Spacing: gap-3 between messages, gap-6 between different senders
- Max-width: 65% of chat area

**Status Indicators:**
- Dots: 8px circles with status meanings
- Badges: rounded-full, px-2, py-0.5, uppercase text, 11px

### Forms

**Text Inputs:** Border, rounded-lg, px-3, h-10, focus ring
**Textareas:** Same styling, min-h-24, resize-y
**Checkboxes/Radio:** 16px size, rounded appropriately
**Form Groups:** gap-4 vertical spacing, labels mb-2

### Modals/Overlays

**Modal Structure:**
- Backdrop: backdrop-blur-sm
- Container: max-w-lg, rounded-xl, shadow-2xl
- Header: p-6, border-bottom
- Body: p-6
- Footer: p-6, border-top, flex justify-end gap-3

**QR Code Display:** Center modal, 300px square QR, padding p-8

## Visual Hierarchy

**Emphasis Layers:**
1. Active conversation: Border-left accent + background tint
2. Primary actions: Solid buttons, medium weight text
3. Content: Regular weight, standard text
4. Metadata: Smaller size, muted treatment

**Border Strategy:**
- Main divisions: 1px solid borders
- Active elements: 2-3px accent borders
- Never use heavy/thick borders except for focus states

## Interaction Patterns

**Hover States:** Subtle background change (5% opacity), no dramatic shifts
**Active/Selected:** Border accent + background tint, clear visual feedback
**Focus States:** ring-2 offset pattern for keyboard navigation
**Loading States:** Subtle spinner, skeleton screens for list items
**Empty States:** Centered icon (48px) + text, helpful message

## Animations

**Minimal Approach:**
- Transitions: 150ms ease-in-out for hovers, 200ms for state changes
- Message send: Subtle slide-in from right
- List updates: Fade-in for new items
- Avoid: Page transitions, elaborate effects, anything distracting

## Responsive Behavior

**Desktop (1024px+):** Three-column layout as specified
**Tablet (768-1023px):** Two-column (hide details panel, show on action)
**Mobile (<768px):** Single column, navigation between views
- Use bottom navigation bar on mobile
- Full-screen chat when conversation selected

## Images

**Avatar Placeholders:** Colored circles with initials (use consistent color generation per contact)
**Empty States:** Simple line-art illustrations (max 200px), centered
**No hero images:** This is a utility application, not marketing

**Icon Library:** Heroicons (outline for most UI, solid for emphasis)

## Accessibility

- Minimum contrast ratio: 4.5:1 for all text
- Focus indicators: Always visible ring-2 pattern
- Keyboard navigation: Full support, logical tab order
- ARIA labels: All interactive elements, especially icon-only buttons
- Screen reader: Proper heading hierarchy, landmark regions