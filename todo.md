# Lunch Wheel - TODO

## Database & Backend
- [x] Schema: wheels, restaurants, tags, restaurant_tags, spin_history, wheel_members tables
- [x] DB helpers: wheels CRUD, restaurants CRUD, tags, spin history, wheel members
- [x] tRPC router: wheels (create, list, get, update, delete, join)
- [x] tRPC router: restaurants (add, edit, delete, list by wheel)
- [x] tRPC router: tags (list predefined, create custom)
- [x] tRPC router: spin (record spin, get history, toggle exclusion)
- [x] Invite link generation and validation

## Frontend - Global
- [x] Dark-mode cinematic theme in index.css (colors, fonts, CSS variables)
- [x] Google Fonts: distinctive display + body font pair
- [x] App.tsx: routes and ThemeProvider set to dark
- [x] Landing/home page with login CTA
- [x] Authenticated main layout with wheel selector

## Frontend - Wheel Tab (Tab 1)
- [x] WebGL/Canvas shader background with animated gradient
- [x] 2D pie-chart wheel rendered on Canvas with category-based colors
- [x] Smooth spin animation with deceleration (easing)
- [x] Glowing gradient effects on wheel segments
- [x] Tag filter bar (AND logic, empty-state warning)
- [x] Spin button with cinematic animation
- [x] Result modal/overlay after spin

## Frontend - Restaurant Tab (Tab 2)
- [x] Restaurant list view with tags
- [x] Add restaurant form (name, tags, notes)
- [x] Edit/delete for wheel creator only
- [x] Custom tag creation
- [x] Tag filter chips for browsing

## Frontend - History Tab (Tab 3)
- [x] Spin history list with timestamps
- [x] 3-day auto-exclusion indicator per restaurant
- [x] Manual re-enable toggle per excluded restaurant
- [x] Clear visual distinction for excluded vs active restaurants

## Shared Wheels
- [x] Create shared wheel with public/private toggle
- [x] Invite link generation and copy
- [x] Join wheel via invite link
- [x] Wheel member list display
- [x] Permission enforcement (creator edit/delete, members add only)

## Tests
- [x] Vitest: tag intersection filter logic
- [x] Vitest: 3-day exclusion logic
- [x] Vitest: spin history recording
- [x] Vitest: wheel permission checks
