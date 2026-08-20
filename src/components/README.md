# Accessibility conventions

Every interactive `Pressable` and `TouchableOpacity` must carry:

```tsx
accessibilityRole="button"
accessibilityLabel="<action in plain language>"
```

Label rules:
- Describe the **action**, not the icon: "Go back", "Add reminder", "Delete", "Edit event Title".
- Backdrop overlays that dismiss a modal: `accessibilityLabel="Dismiss"`.
- Structural containers that stop propagation but are not standalone controls: `importantForAccessibility="no"`.
- Dynamic labels (e.g. Play/Pause toggles): use a ternary on the relevant state variable.
- List rows whose label matches a nested edit button: label the row with the item title only; reserve "Edit X" for the dedicated pencil button.

Checked by `npm run lint` and the test suite. Verified manually with TalkBack on a physical Android device for P0 screens (Calculator, Phone, ControlCenter, Camera, LockScreen).
