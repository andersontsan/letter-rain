# Letter Rain

A playful hero background. Visitors type and the letters fall and pile up at the bottom of the screen. Smileys `:)` drizzle from drifting ASCII clouds, a slider controls the rain, and **Clear** blows everything away with a gust of wind.

**[Live demo →](https://andersontsan.github.io/letter-rain/)**

- Typed letters tumble down and stack, with real physics ([matter-js](https://brm.io/matter-js/))
- Dense, filled ASCII clouds drift across the top; the rain falls from under them
- Smiley rain keeps the hero alive before anyone types, and any real letter in the pile is one a visitor typed
- **Clear** sends a left-to-right gust that throws every letter off screen
- **Backspace** removes the last letter
- Typing is desktop only; on phones and tablets it just rains
- Pauses when scrolled off screen, and only listens to keys while the hero is mostly visible

There are two versions with the same behaviour:

| File | For |
| --- | --- |
| [`LetterRain.tsx`](LetterRain.tsx) | Framer (code component) |
| [`letter-rain.js`](letter-rain.js) | Any website, no framework or build step |

## Framer

1. In your project, open **Assets → Code → + → New Code File**, name it `LetterRain`, and paste in [`LetterRain.tsx`](LetterRain.tsx).
2. Drag **LetterRain** into your hero section.
3. Set it to **Position: Absolute** with top, right, bottom and left at **0**, and move it to the bottom of the hero's layers so your content stays on top.
4. Give the hero a height (for example 100vh) and **Overflow: Hidden**.
5. Adjust it from the right panel, then use **Preview** to try typing. Typing is off on the editor canvas, which shows "Hello" falling instead.

## Any website

Copy [`letter-rain.js`](letter-rain.js) next to your page, then:

```html
<section class="hero">
  <div class="hero-content">…your heading and buttons…</div>
</section>

<style>
  .hero { height: 100vh; }
  /* keep your content above the falling letters */
  .hero-content { position: relative; z-index: 1; }
</style>

<script type="module">
  import { createLetterRain } from "./letter-rain.js"

  const rain = createLetterRain(document.querySelector(".hero"), {
    color: "#081F5C",
    rain: 3,
  })
</script>
```

It fills whatever element you pass in. Serve the page from a web server (or GitHub Pages): browsers block JavaScript modules on pages opened straight from disk.

`createLetterRain` returns:

- `clear()` blows every letter away, like pressing **Clear**
- `setRain(n)` sets the rain to `n` smileys per second
- `destroy()` stops the effect and removes it from the page

[`index.html`](index.html) is a complete example.

## Options

The same settings exist as Framer properties and as `createLetterRain` options.

| Option | Default | What it does |
| --- | --- | --- |
| `fontSize` | `11` | Size of the falling letters, in px |
| `fontWeight` | `400` | Weight of the falling letters |
| `fontFamily` | `"Open Runde", system-ui, sans-serif` | Font for letters, hint and controls |
| `color` | `#081F5C` | Letter and slider colour |
| `cloudColor` | `rgba(8, 31, 92, 0.75)` | Cloud colour |
| `cloudSize` | `7` | Size of the cloud characters in px; smaller means finer clouds (Framer: **Cloud Detail**) |
| `cloudTop` | `96` | Distance from the top to the clouds, in px |
| `gravity` | `1` | How fast letters fall |
| `rain` | `3` | Smileys per second at the start; `0` turns rain off |
| `showRainControl` | `true` | Show the Rain slider |
| `maxLetters` | `500` | Past this, the oldest letters shrink away |
| `hint` | `Go ahead, type something` | Text at the bottom until someone types; empty to hide |
| `hintColor` | `rgba(8, 31, 92, 0.45)` | Hint colour |
| `clearLabel` | `Clear` | Clear button text |
| `buttonPosition` | `bottom-left` | `bottom-left`, `bottom-right`, `top-left` or `top-right` |

## Credits

Physics by [matter-js](https://github.com/liabru/matter-js) (MIT), loaded from [esm.sh](https://esm.sh).

Made by [Anderson Tsan](https://anderson-tsan.framer.website/).
