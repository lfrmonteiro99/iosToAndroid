---
name: ios-clone-visual-identity-audit
description: Audit React Native iOS-clone visual identity conformance — verify icons/colors/animations/typography per screen, file:line severity classification
metadata:
  created_by: agent
  scope: project
  source_session: agent-a56b3020f5c4a2313
  source_cwd: /home/luis-monteiro/Documentos/iosToAndroid
  source_repo: /home/luis-monteiro/Documentos/iosToAndroid
  created_at: 2026-08-21T01:00:49Z
---

# iOS Clone Visual Identity Audit

Systematically verify a React Native / Expo iOS-clone app's visual identity against a reference spec (typically iOS Settings/Messages/Weather/Photos as gold standard).

## Procedure

### 1. Define the spec (gold standard approach)
Identify reference apps and document per dimension:
- **Settings**: icon size, border radius, solid vibrant bg, grouped bg color, push animation
- **Messages/Phone**: bubble colors (blue=iMessage, green=SMS), gradients, avatar circles with initials
- **Weather**: animated background, frosted glass cards (BlurView), real vs mock data, white typography
- **Music**: floating player, album-art-derived blur, giant text
- **Photos**: grid margins (0 in year/month view, 2px in normal), corner radius variations
- **Icons**: family consistency (Ionicons preferred for iOS aesthetic), weight matching to adjacent text

### 2. Audit each screen systematically

For each app (Settings, Messages, Weather, Photos, etc.), read:
```bash
src/screens/<ScreenName>.tsx        # Main screen logic
src/components/<Component>.tsx       # Reusable UI components  
src/theme/CupertinoTheme.ts          # Centralized color/spacing tokens
src/navigation/TabNavigator.tsx      # Transition animations
src/utils/<Helper>.ts                # Business logic (e.g., avatarColor algorithm)
```

### 3. Verify each property with file:line

**Icon properties:**
```bash
grep -n "borderRadius\|width.*height\|iconBg" src/components/CupertinoListSection.tsx
```
Example: "Icon 29×29, `borderRadius: BorderRadius.tag` (=7): `src/components/CupertinoListSection.tsx:181-186`"

**Colors (group bg, bubble, text):**
```bash
grep -n "backgroundColor.*#\|color.*#\|colors\." src/screens/SettingsScreen.tsx src/theme/CupertinoTheme.ts
```

**Animations (push, slide, fade):**
```bash
grep -n "slideAnimation\|animation.*=\|slide_from" src/navigation/TabNavigator.tsx
```

**Gradient & blur (linear-gradient, BlurView):**
```bash
grep -n "LinearGradient\|BlurView" src/screens/WeatherScreen.tsx
```

**Grid layout (gaps, corners):**
```bash
grep -n "gap\|borderRadius\|THUMB_SIZE\|GRID_GAP\|margin" src/screens/PhotosScreen.tsx
```

**Bubble colors & protocol distinction:**
```bash
grep -n "isSent\|isIMessage\|#007AFF\|#34C759\|protocol" src/screens/MessageBubble.tsx
```

**Data source (real vs mock):**
```bash
grep -n "fetch\|axios\|mock\|hardcoded" src/screens/WeatherScreen.tsx
```

If a feature does not exist, say plainly — do not invent.

### 4. Classify deviation severity
- **Alta** — breaks spec, core feature missing/wrong
- **Média** — deviates from spec but doesn't break usability
- **Baixa** — minor polish, non-essential visual detail

### 5. Audit iconography consistency

```bash
# Count all icon families used
grep -ro "<Ionicons\|<MaterialIcons\|<FontAwesome\|<SFSymbols\|<MaterialCommunityIcons" src --include="*.tsx" | sort | uniq -c

# Check for weight variable (if using variable-weight system like SF Symbols)
grep -n "weight.*=\|fontWeight" src/screens/*.tsx

# Identify non-standard families (offenders)
grep -ro "<[A-Z][a-z]*Icons" src --include="*.tsx" | grep -v "^<Ionicons"
```

**Note SF Symbols limitation:** Apple-licensed, cannot be redistributed in Android APKs or RN multi-platform bundles. Achievable approximation is `@expo/vector-icons` Ionicons (Ionic open-source set, iOS-adjacent but not identical aesthetic).

### 6. Report format

```markdown
## Por app: Conforme / Desvios

### [App Name] — [CONFORME | DESVIO Alta/Média/Baixa]
- **Property**: description with `src/file.tsx:line` + severity
- **Another property**: description with `src/file.tsx:line` + severity

## Iconografia
- **Ionicons**: [count] ocorrências em [count] ficheiros (único import em uso)
- **MaterialIcons / FontAwesome / SFSymbols**: 0 ocorrências (conforme)
- **Weight matching**: [nenhuma prop `weight` encontrada | não aplicável com Ionicons]

## Limitações React Native / licenciamento
SF Symbols são propriedade Apple, licenciados só para iOS/macOS — não podem ser redistributos em APKs ou bundles RN multiplataforma. Aproximação alcançável: `@expo/vector-icons` Ionicons (set open-source Ionic, estética iOS-adjacente mas não idêntica, sem variação de peso).

## Ficheiros-chave
- src/screens/[ScreenName].tsx
- src/components/[Component].tsx  
- src/theme/CupertinoTheme.ts
- src/navigation/TabNavigator.tsx
- package.json (icon lib version)
```

## Pitfalls
- **Don't invent missing screens** — if PhotosScreen lacks year/month view, say it doesn't exist, don't assume hidden
- **Every claim needs file:line** — use "NÃO VERIFICADO" if unverifiable; grep for confirmation before citing
- **Check theme file first** — colors/spacing are typically centralized (`CupertinoTheme.ts`); don't duplicate searches
- **Static vs dynamic** — hardcoded `LinearGradient` colors differ fundamentally from data-driven ones; verify source
- **Grep syntax** — use `<ComponentName` to find JSX usages; `backgroundColor.*#` to find color definitions; `animation.*=` for transitions
- **Licensing upfront** — mention SF Symbols constraints early to avoid effort on unachievable requirements
