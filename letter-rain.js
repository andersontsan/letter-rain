// Letter Rain: letters fall and pile up as visitors type, smileys drizzle from ASCII
// clouds, and "Clear" blows everything away. No framework needed.
//
//   import { createLetterRain } from "./letter-rain.js"
//   const rain = createLetterRain(document.querySelector(".hero"), { color: "#081F5C" })
//   rain.destroy() // when you're done
//
// This is the plain-JavaScript twin of LetterRain.tsx (the Framer component).

import Matter from "https://esm.sh/matter-js@0.19.0"

// Collision categories: blown-away letters stop colliding with the walls
const LETTER = 0x0001
const WALL = 0x0002

// Light to dense: cloud edges get the light characters, the core the heavy ones
const RAMP = ".:-=+*#%@"

// Rain falls as smileys, so any real letter in the pile is one a visitor typed
const DRIZZLE = [":)"]

const DEFAULTS = {
    fontSize: 11,
    fontWeight: 400,
    fontFamily: `"Open Runde", system-ui, sans-serif`,
    color: "#081F5C",
    cloudColor: "rgba(8, 31, 92, 0.75)",
    cloudSize: 7,
    cloudTop: 96,
    gravity: 1,
    rain: 3,
    showRainControl: true,
    maxLetters: 500,
    hint: "Go ahead, type something",
    hintColor: "rgba(8, 31, 92, 0.45)",
    clearLabel: "Clear",
    buttonPosition: "bottom-left", // bottom-left | bottom-right | top-left | top-right
}

// Range inputs can only be restyled through pseudo-elements, so this lives in a <style> tag.
// Thin 2px bar filled up to the value (--p), with a pill-shaped handle.
const RANGE_CSS = `
.letterrain-range { -webkit-appearance: none; appearance: none; width: 90px; height: 18px; margin: 0; background: transparent; cursor: pointer; }
.letterrain-range::-webkit-slider-runnable-track { height: 2px; border-radius: 1px; background: linear-gradient(to right, var(--c) var(--p), rgba(8, 31, 92, 0.15) var(--p)); }
.letterrain-range::-webkit-slider-thumb { -webkit-appearance: none; width: 24px; height: 16px; margin-top: -7px; border: none; border-radius: 999px; background: var(--c); }
.letterrain-range::-moz-range-track { height: 2px; border-radius: 1px; background: rgba(8, 31, 92, 0.15); }
.letterrain-range::-moz-range-progress { height: 2px; border-radius: 1px; background: var(--c); }
.letterrain-range::-moz-range-thumb { width: 24px; height: 16px; border: none; border-radius: 999px; background: var(--c); }
.letterrain-range:focus-visible { outline: 2px solid var(--c); outline-offset: 4px; border-radius: 4px; }
`

const WIND_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/></svg>`

function el(tag, style = {}, props = {}) {
    const node = document.createElement(tag)
    Object.assign(node.style, style)
    Object.assign(node, props)
    return node
}

/**
 * Fills `target` (usually your hero section) with the Letter Rain effect.
 * Returns { clear, setRain, destroy }.
 */
export function createLetterRain(target, options = {}) {
    const o = { ...DEFAULTS, ...options }
    const { Engine, Bodies, Body, Composite, Sleeping } = Matter
    const touch = window.matchMedia("(hover: none)").matches
    const corner = o.buttonPosition.split("-")

    // ---- DOM -------------------------------------------------------------------

    if (getComputedStyle(target).position === "static") target.style.position = "relative"
    if (!document.getElementById("letterrain-css")) {
        document.head.append(el("style", {}, { id: "letterrain-css", textContent: RANGE_CSS }))
    }

    const root = el("div", { position: "absolute", inset: "0", overflow: "hidden", pointerEvents: "none", zIndex: "0" })
    const canvas = el("canvas", { position: "absolute", inset: "0", width: "100%", height: "100%" })
    root.append(canvas)

    const hint = el(
        "div",
        {
            position: "absolute",
            left: "0",
            right: "0",
            bottom: "32px",
            textAlign: "center",
            font: `500 14px ${o.fontFamily}`,
            color: o.hintColor,
            transition: "opacity 0.4s",
        },
        { textContent: o.hint }
    )
    if (!touch && o.hint) root.append(hint)

    // Controls line up with the page content: a centred row, max 1072px wide
    const bar = el("div", { position: "absolute", [corner[0]]: "24px", left: "0", right: "0" })
    const row = el("div", {
        width: "calc(100% - 48px)",
        maxWidth: "1072px",
        margin: "0 auto",
        display: "flex",
        flexDirection: corner[1] === "right" ? "row-reverse" : "row",
        alignItems: "center",
        gap: "8px",
    })
    bar.append(row)
    root.append(bar)

    const clearBtn = el(
        "button",
        {
            display: "flex",
            alignItems: "center",
            gap: "6px",
            boxSizing: "border-box",
            height: "36px",
            padding: "0 16px 0 13px",
            border: "none",
            borderRadius: "999px",
            background: "#171717",
            color: "#fff",
            font: `600 14px ${o.fontFamily}`,
            cursor: "pointer",
            transition: "opacity 0.25s, transform 0.25s",
        },
        { type: "button", innerHTML: WIND_ICON }
    )
    clearBtn.append(o.clearLabel)
    clearBtn.addEventListener("click", () => blow())
    row.append(clearBtn)

    let rainRate = o.rain
    let showRain = () => {}
    if (o.showRainControl) {
        const label = el("label", {
            display: "flex",
            alignItems: "center",
            gap: "10px",
            boxSizing: "border-box",
            height: "36px", // same as the Clear button
            padding: "0 14px",
            borderRadius: "999px",
            background: "rgba(255, 255, 255, 0.1)",
            border: "1px solid #E3E1E1",
            color: o.color,
            font: `500 14px ${o.fontFamily}`,
            backdropFilter: "blur(6px)",
            pointerEvents: "auto",
        })
        const range = el("input", {}, { type: "range", min: 0, max: 30, step: 0.5, value: rainRate, className: "letterrain-range" })
        const value = el("span", { minWidth: "36px", fontVariantNumeric: "tabular-nums", opacity: "0.6" })
        showRain = () => {
            range.value = rainRate
            range.style.setProperty("--c", o.color)
            range.style.setProperty("--p", `${(rainRate / 30) * 100}%`)
            value.textContent = `${rainRate}/s`
        }
        range.addEventListener("input", () => {
            rainRate = Number(range.value)
            showRain()
        })
        showRain()
        label.append("Rain", range, value)
        row.append(label)
    }

    target.prepend(root)

    // ---- Simulation ------------------------------------------------------------

    const ctx = canvas.getContext("2d")
    const engine = Engine.create({ enableSleeping: true, positionIterations: 8, velocityIterations: 6 })
    engine.gravity.y = o.gravity
    const letters = []
    let clouds = []
    let walls = []
    let w = 0
    let h = 0
    let dpr = 1
    let ratio = 1 // how much of the effect is on screen

    const rand = (a, b) => a + Math.random() * (b - a)
    const live = () => letters.filter((l) => !l.blown && !l.popAt).length

    // Show the Clear button only when there's something to clear
    function sync() {
        const has = live() > 0
        clearBtn.style.opacity = has ? "1" : "0"
        clearBtn.style.transform = has ? "none" : "translateY(6px) scale(0.96)"
        clearBtn.style.pointerEvents = has ? "auto" : "none"
        clearBtn.tabIndex = has ? 0 : -1
    }

    function layout() {
        w = root.offsetWidth
        h = root.offsetHeight
        dpr = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
        Composite.remove(engine.world, walls)
        const T = 400
        const opts = { isStatic: true, collisionFilter: { category: WALL, mask: LETTER } }
        walls = [
            Bodies.rectangle(w / 2, h + T / 2, w + T * 2, T, opts),
            Bodies.rectangle(-T / 2, 0, T, h * 3, opts),
            Bodies.rectangle(w + T / 2, 0, T, h * 3, opts),
        ]
        Composite.add(engine.world, walls)
        for (const l of letters) Sleeping.set(l.body, false)
        makeClouds()
    }

    // Spread clouds across the top
    function makeClouds() {
        const n = Math.max(2, Math.round(w / 380))
        clouds = Array.from({ length: n }, (_, i) => {
            const img = cloudImage(rand(220, 360), o.cloudSize, o.cloudColor)
            const cw = img.width / dpr
            return {
                img,
                x: ((i + rand(0.1, 0.5)) / n) * (w + cw) - cw,
                y: o.cloudTop + (i % 2) * 36 + rand(-8, 8),
                w: cw,
                h: img.height / dpr,
                speed: rand(5, 12),
            }
        })
    }

    // A puffy cloud shape (a few overlapping circles on a flat base), filled with ASCII
    // characters that get denser towards the core and the shaded underside
    function cloudImage(W, size, fill) {
        const H = W * rand(0.28, 0.34)
        const base = H * 0.8
        const puffs = []
        const n = 4 + Math.floor(Math.random() * 3)
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1)
            // Bigger puffs in the middle make the bumpy top
            const r = H * (0.18 + 0.2 * Math.sin(Math.PI * t)) * rand(0.85, 1.15)
            puffs.push({ x: W * (0.16 + 0.68 * t) + rand(-10, 10), y: base - r * rand(0.6, 0.95), r })
        }
        // Smaller puffs hanging underneath make the bottom lumpy instead of flat
        for (let i = 0; i < n - 1; i++) {
            const r = H * rand(0.12, 0.19)
            puffs.push({ x: W * (0.24 + (0.52 * i) / Math.max(1, n - 2)) + rand(-15, 15), y: base - r * rand(0.1, 0.5), r })
        }
        const field = (x, y) => {
            let f = 1 - Math.hypot((x - W / 2) / (W * 0.4), (y - (base - H * 0.2)) / (H * 0.16))
            for (const p of puffs) f = Math.max(f, 1 - Math.hypot(x - p.x, y - p.y) / p.r)
            return f
        }

        const out = document.createElement("canvas")
        out.width = Math.ceil(W * dpr)
        out.height = Math.ceil(H * dpr)
        const g = out.getContext("2d")
        g.scale(dpr, dpr)
        g.font = `${size}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`
        g.fillStyle = fill
        g.textBaseline = "top"
        const cw = g.measureText("@").width
        const lh = size * 0.95
        for (let y = 0; y + lh <= H; y += lh) {
            for (let x = 0; x + cw <= W; x += cw) {
                const f = field(x + cw / 2, y + lh / 2)
                if (f <= 0) continue
                const d = Math.min(1, f * 2.4) * 0.75 + (y / H) * 0.25 + rand(-0.08, 0.08)
                const k = Math.max(0, Math.min(RAMP.length - 1, Math.floor(d * RAMP.length)))
                g.fillText(RAMP[k], x, y)
            }
        }
        return out
    }

    function drop(ch, auto = false) {
        const font = `${o.fontWeight} ${o.fontSize}px ${o.fontFamily}`
        ctx.font = font
        const m = ctx.measureText(ch)
        const left = m.actualBoundingBoxLeft
        const right = m.actualBoundingBoxRight
        const asc = m.actualBoundingBoxAscent
        const desc = m.actualBoundingBoxDescent
        const bw = Math.max(left + right, o.fontSize * 0.25) + 1
        const bh = Math.max(asc + desc, o.fontSize * 0.25) + 1

        // Rain from the underside of a cloud that's on screen
        const visible = clouds.filter((k) => k.x > 0 && k.x + k.w < w)
        const from = visible[Math.floor(Math.random() * visible.length)]
        const x = from ? from.x + from.w * rand(0.15, 0.85) : w * rand(0.12, 0.88)
        const y = from ? from.y + from.h : -bh

        const body = Bodies.rectangle(x, y, bw, bh, {
            angle: rand(-0.5, 0.5),
            chamfer: { radius: Math.min(bw, bh) * 0.2 },
            restitution: 0.15,
            friction: 0.5,
            frictionAir: 0.015,
            collisionFilter: { category: LETTER, mask: LETTER | WALL },
        })
        Body.setAngularVelocity(body, rand(-0.08, 0.08))
        Composite.add(engine.world, body)

        // ox/oy: offset from the body's centre to the text origin
        letters.push({ body, ch, font, color: o.color, ox: -(right - left) / 2, oy: (asc - desc) / 2 })

        // Over the limit: the oldest letters shrink away and the pile settles
        const extra = live() - o.maxLetters
        for (let i = 0, n = 0; n < extra && i < letters.length; i++) {
            if (!letters[i].blown && !letters[i].popAt) {
                letters[i].popAt = performance.now()
                n++
            }
        }
        if (!auto) hint.style.opacity = "0"
        sync()
    }

    function pop() {
        for (let i = letters.length - 1; i >= 0; i--) {
            if (!letters[i].blown && !letters[i].popAt) {
                letters[i].popAt = performance.now()
                break
            }
        }
        sync()
    }

    function blow() {
        const now = performance.now()
        for (const l of letters) {
            if (l.blown || l.popAt) continue
            // A gust sweeping left to right
            l.blowAt = now + (Math.max(0, l.body.position.x) / w) * 350 + rand(0, 90)
            l.blown = true
        }
        sync()
    }

    function gust(l) {
        const b = l.body
        Sleeping.set(b, false)
        b.collisionFilter.mask = LETTER
        Body.setVelocity(b, { x: rand(10, 22), y: -rand(9, 20) })
        Body.setAngularVelocity(b, rand(-0.35, 0.35))
        l.blowAt = undefined
    }

    layout()
    sync()
    const ro = new ResizeObserver(layout)
    ro.observe(root)

    const io = new IntersectionObserver(([e]) => (ratio = e.intersectionRatio), {
        threshold: [0, 0.25, 0.5, 0.75, 1],
    })
    io.observe(root)

    let raf = 0
    let last = performance.now()
    let drizzle = 0
    function frame(now) {
        raf = requestAnimationFrame(frame)
        const dt = Math.min(now - last, 50)
        last = now
        if (ratio === 0) return

        for (const l of letters) if (l.blowAt !== undefined && now >= l.blowAt) gust(l)

        // Drizzle: `rainRate` smileys per second
        drizzle += (rainRate * dt) / 1000
        for (; drizzle >= 1; drizzle--) drop(DRIZZLE[Math.floor(Math.random() * DRIZZLE.length)], true)

        // Two substeps keep small letters from tunnelling through each other
        Engine.update(engine, dt / 2)
        Engine.update(engine, dt / 2)

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, w, h)
        ctx.textAlign = "left"

        for (const k of clouds) {
            k.x += (k.speed * dt) / 1000
            if (k.x > w) k.x = -k.w
            ctx.drawImage(k.img, k.x, k.y, k.w, k.h)
        }

        ctx.textBaseline = "alphabetic"
        for (let i = letters.length - 1; i >= 0; i--) {
            const l = letters[i]
            const { x, y } = l.body.position
            const scale = l.popAt ? 1 - (now - l.popAt) / 160 : 1
            if (scale <= 0 || (l.blown && (y > h + 300 || x > w + 300 || x < -300))) {
                Composite.remove(engine.world, l.body)
                letters.splice(i, 1)
                continue
            }
            ctx.save()
            ctx.translate(x, y)
            ctx.rotate(l.body.angle)
            if (scale !== 1) ctx.scale(scale, scale)
            ctx.font = l.font
            ctx.fillStyle = l.color
            ctx.fillText(l.ch, l.ox, l.oy)
            ctx.restore()
        }
    }
    raf = requestAnimationFrame(frame)

    function onKey(e) {
        if (ratio < 0.5 || e.ctrlKey || e.metaKey || e.altKey) return
        const t = e.target
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
        if (e.key === "Backspace") return pop()
        if (e.key === " ") return e.preventDefault() // don't scroll the page mid-word
        if ([...e.key].length === 1) drop(e.key)
    }
    // Typing is desktop only; on phones and tablets it just rains
    if (!touch) window.addEventListener("keydown", onKey)

    return {
        /** Blow every letter away, like pressing Clear */
        clear: blow,
        /** Change the drizzle rate (smileys per second) */
        setRain(n) {
            rainRate = n
            showRain()
        },
        /** Stop everything and remove the effect from the page */
        destroy() {
            cancelAnimationFrame(raf)
            ro.disconnect()
            io.disconnect()
            window.removeEventListener("keydown", onKey)
            Engine.clear(engine)
            root.remove()
        },
    }
}
