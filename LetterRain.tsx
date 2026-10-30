import { addPropertyControls, ControlType, RenderTarget } from "framer"
import { useEffect, useRef, useState } from "react"
import Matter from "https://esm.sh/matter-js@0.19.0"

// Collision categories: blown-away letters stop colliding with the walls
const LETTER = 0x0001
const WALL = 0x0002

// Light to dense: cloud edges get the light characters, the core the heavy ones
const RAMP = ".:-=+*#%@"

// Rain falls as smileys, so any real letter in the pile is one a visitor typed
const DRIZZLE = [":)"]

type Cloud = { img: HTMLCanvasElement; x: number; y: number; w: number; h: number; speed: number }

type Corner = "bottom-left" | "bottom-right" | "top-left" | "top-right"

type Props = {
    fontSize: number
    fontWeight: number
    fontFamily: string
    color: string
    cloudColor: string
    cloudSize: number
    cloudTop: number
    gravity: number
    rain: number
    showRainControl: boolean
    maxLetters: number
    hint: string
    hintColor: string
    clearLabel: string
    buttonPosition: Corner
    style?: React.CSSProperties
}

type Letter = {
    body: Matter.Body
    ch: string
    font: string
    color: string
    ox: number
    oy: number
    blowAt?: number
    blown?: boolean
    popAt?: number
}

/**
 * Letters drop and pile up as visitors type. "Clear" blows them away.
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 */
export default function LetterRain({
    fontSize = 11,
    fontWeight = 400,
    fontFamily = `"Open Runde", "Open Runde Placeholder", system-ui, sans-serif`,
    color = "#081F5C",
    cloudColor = "rgba(8, 31, 92, 0.75)",
    cloudSize = 7,
    cloudTop = 96,
    gravity = 1,
    rain = 3,
    showRainControl = true,
    maxLetters = 500,
    hint = "Go ahead, type something",
    hintColor = "rgba(8, 31, 92, 0.45)",
    clearLabel = "Clear",
    buttonPosition = "bottom-left",
    style,
}: Props) {
    const wrapRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const api = useRef<{ drop(ch: string): void; pop(): void; blow(): void; makeClouds(): void }>()
    const [count, setCount] = useState(0)
    const [typed, setTyped] = useState(false)
    const [isTouch, setIsTouch] = useState(false)
    // Visitors can change the rain on the page; the Rain prop sets where it starts
    const [rainRate, setRainRate] = useState(rain)
    useEffect(() => setRainRate(rain), [rain])

    // Latest props, read by the running simulation without restarting it
    const cfg = useRef({ fontSize, fontWeight, fontFamily, color, cloudColor, cloudSize, cloudTop, gravity, rain: rainRate, maxLetters })
    cfg.current = { fontSize, fontWeight, fontFamily, color, cloudColor, cloudSize, cloudTop, gravity, rain: rainRate, maxLetters }

    useEffect(() => {
        setIsTouch(window.matchMedia("(hover: none)").matches)
    }, [])

    useEffect(() => {
        const wrap = wrapRef.current!
        const canvas = canvasRef.current!
        const ctx = canvas.getContext("2d")!
        const { Engine, Bodies, Body, Composite, Sleeping } = Matter
        const onCanvas = RenderTarget.current() === RenderTarget.canvas

        const engine = Engine.create({ enableSleeping: true, positionIterations: 8, velocityIterations: 6 })
        const letters: Letter[] = []
        let clouds: Cloud[] = []
        let walls: Matter.Body[] = []
        let w = 0
        let h = 0
        let dpr = 1
        let ratio = 1 // how much of the component is on screen

        const rand = (a: number, b: number) => a + Math.random() * (b - a)
        const live = () => letters.filter((l) => !l.blown && !l.popAt).length
        const sync = () => setCount(live())

        function layout() {
            w = wrap.offsetWidth
            h = wrap.offsetHeight
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

        // Spread clouds across the top; rebuilt when the size or cloud settings change
        function makeClouds() {
            const c = cfg.current
            const n = Math.max(2, Math.round(w / 380))
            clouds = Array.from({ length: n }, (_, i) => {
                const img = cloudImage(rand(220, 360), c.cloudSize, c.cloudColor)
                const cw = img.width / dpr
                return {
                    img,
                    x: ((i + rand(0.1, 0.5)) / n) * (w + cw) - cw,
                    y: c.cloudTop + (i % 2) * 36 + rand(-8, 8),
                    w: cw,
                    h: img.height / dpr,
                    speed: rand(5, 12),
                }
            })
        }

        // A puffy cloud shape (a few overlapping circles on a flat base), filled with ASCII
        // characters that get denser towards the core and the shaded underside
        function cloudImage(W: number, size: number, fill: string) {
            const H = W * rand(0.28, 0.34)
            const base = H * 0.8
            const puffs: { x: number; y: number; r: number }[] = []
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
            const field = (x: number, y: number) => {
                let f = 1 - Math.hypot((x - W / 2) / (W * 0.4), (y - (base - H * 0.2)) / (H * 0.16))
                for (const p of puffs) f = Math.max(f, 1 - Math.hypot(x - p.x, y - p.y) / p.r)
                return f
            }

            const font = `${size}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`
            const out = document.createElement("canvas")
            out.width = Math.ceil(W * dpr)
            out.height = Math.ceil(H * dpr)
            const g = out.getContext("2d")!
            g.scale(dpr, dpr)
            g.font = font
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

        function drop(ch: string, auto = false) {
            const c = cfg.current
            const font = `${c.fontWeight} ${c.fontSize}px ${c.fontFamily}`
            ctx.font = font
            const m = ctx.measureText(ch)
            const left = m.actualBoundingBoxLeft
            const right = m.actualBoundingBoxRight
            const asc = m.actualBoundingBoxAscent
            const desc = m.actualBoundingBoxDescent
            const bw = Math.max(left + right, c.fontSize * 0.25) + 1
            const bh = Math.max(asc + desc, c.fontSize * 0.25) + 1

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

            letters.push({
                body,
                ch,
                font,
                color: c.color,
                // offset from the body's centre to the text origin
                ox: -(right - left) / 2,
                oy: (asc - desc) / 2,
            })

            // Over the limit: the oldest letters shrink away and the pile settles
            const extra = live() - c.maxLetters
            for (let i = 0, n = 0; n < extra && i < letters.length; i++) {
                if (!letters[i].blown && !letters[i].popAt) {
                    letters[i].popAt = performance.now()
                    n++
                }
            }
            if (!auto) setTyped(true)
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

        function gust(l: Letter) {
            const b = l.body
            Sleeping.set(b, false)
            b.collisionFilter.mask = LETTER
            Body.setVelocity(b, { x: rand(10, 22), y: -rand(9, 20) })
            Body.setAngularVelocity(b, rand(-0.35, 0.35))
            l.blowAt = undefined
        }

        api.current = { drop, pop, blow, makeClouds }

        layout()
        const ro = new ResizeObserver(layout)
        ro.observe(wrap)

        const io = new IntersectionObserver(([e]) => (ratio = e.intersectionRatio), {
            threshold: [0, 0.25, 0.5, 0.75, 1],
        })
        io.observe(wrap)

        let raf = 0
        let last = performance.now()
        let drizzle = 0
        function frame(now: number) {
            raf = requestAnimationFrame(frame)
            const dt = Math.min(now - last, 50)
            last = now
            if (ratio === 0) return

            for (const l of letters) if (l.blowAt !== undefined && now >= l.blowAt) gust(l)

            // Drizzle: `rain` random letters per second
            drizzle += (cfg.current.rain * dt) / 1000
            for (; drizzle >= 1; drizzle--) drop(DRIZZLE[Math.floor(Math.random() * DRIZZLE.length)], true)

            engine.gravity.y = cfg.current.gravity
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

        function onKey(e: KeyboardEvent) {
            if (ratio < 0.5 || e.ctrlKey || e.metaKey || e.altKey) return
            const t = e.target as HTMLElement | null
            if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
            if (e.key === "Backspace") return pop()
            if (e.key === " ") return e.preventDefault() // don't scroll the page mid-word
            if ([...e.key].length === 1) drop(e.key)
        }
        // Typing is desktop only; on phones and tablets it just rains
        const touch = window.matchMedia("(hover: none)").matches
        if (!onCanvas && !touch) window.addEventListener("keydown", onKey)

        // Give the designer something to look at in the Framer editor
        if (onCanvas) [..."Hello"].forEach((ch, i) => setTimeout(() => drop(ch), i * 120))

        return () => {
            cancelAnimationFrame(raf)
            ro.disconnect()
            io.disconnect()
            window.removeEventListener("keydown", onKey)
            Engine.clear(engine)
        }
    }, [])

    useEffect(() => api.current?.makeClouds(), [cloudSize, cloudTop, cloudColor])

    const corner = buttonPosition.split("-")
    const hasLetters = count > 0

    return (
        <div
            ref={wrapRef}
            style={{ position: "relative", overflow: "hidden", width: "100%", height: "100%", ...style }}
        >
            <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />

            {!isTouch && (
                <div
                    style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 32,
                        textAlign: "center",
                        font: `500 14px ${fontFamily}`,
                        color: hintColor,
                        pointerEvents: "none",
                        opacity: typed ? 0 : 1,
                        transition: "opacity 0.4s",
                    }}
                >
                    {hint}
                </div>
            )}

            {/* Controls line up with the page content: a centred row, max 1072px wide */}
            <div
                style={{
                    position: "absolute",
                    [corner[0]]: 24,
                    left: 0,
                    right: 0,
                    pointerEvents: "none",
                }}
            >
                <div
                    style={{
                        width: "calc(100% - 48px)",
                        maxWidth: 1072,
                        margin: "0 auto",
                        display: "flex",
                        flexDirection: corner[1] === "right" ? "row-reverse" : "row",
                        alignItems: "center",
                        gap: 8,
                    }}
                >
                    <button
                        type="button"
                        onClick={() => api.current?.blow()}
                        tabIndex={hasLetters ? 0 : -1}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            boxSizing: "border-box",
                            height: 36,
                            padding: "0 16px 0 13px",
                            border: "none",
                            borderRadius: 999,
                            background: "#171717",
                            color: "#fff",
                            font: `600 14px ${fontFamily}`,
                            cursor: "pointer",
                            opacity: hasLetters ? 1 : 0,
                            transform: hasLetters ? "none" : "translateY(6px) scale(0.96)",
                            pointerEvents: hasLetters ? "auto" : "none",
                            transition: "opacity 0.25s, transform 0.25s",
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12.8 19.6A2 2 0 1 0 14 16H2" />
                            <path d="M17.5 8a2.5 2.5 0 1 1 2 4H2" />
                            <path d="M9.8 4.4A2 2 0 1 1 11 8H2" />
                        </svg>
                        {clearLabel}
                    </button>

                    {showRainControl && (
                        <label
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                boxSizing: "border-box",
                                height: 36, // same as the Clear button
                                padding: "0 14px",
                                borderRadius: 999,
                                background: "rgba(255, 255, 255, 0.1)",
                                border: "1px solid #E3E1E1",
                                color,
                                font: `500 14px ${fontFamily}`,
                                backdropFilter: "blur(6px)",
                                pointerEvents: "auto",
                            }}
                        >
                            Rain
                            <input
                                type="range"
                                className="letterrain-range"
                                min={0}
                                max={30}
                                step={0.5}
                                value={rainRate}
                                onChange={(e) => setRainRate(Number(e.currentTarget.value))}
                                style={
                                    {
                                        "--c": color,
                                        "--p": `${(rainRate / 30) * 100}%`,
                                    } as React.CSSProperties
                                }
                            />
                            <span style={{ minWidth: 36, fontVariantNumeric: "tabular-nums", opacity: 0.6 }}>{rainRate}/s</span>
                        </label>
                    )}
                </div>
            </div>
            <style>{RANGE_CSS}</style>
        </div>
    )
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

addPropertyControls(LetterRain, {
    fontSize: { type: ControlType.Number, title: "Letter Size", min: 6, max: 96, step: 1, defaultValue: 11 },
    fontWeight: { type: ControlType.Number, title: "Weight", min: 100, max: 900, step: 100, defaultValue: 400 },
    fontFamily: { type: ControlType.String, title: "Font", defaultValue: `"Open Runde", "Open Runde Placeholder", system-ui, sans-serif` },
    color: { type: ControlType.Color, title: "Color", defaultValue: "#081F5C" },
    cloudColor: { type: ControlType.Color, title: "Cloud Color", defaultValue: "rgba(8, 31, 92, 0.75)" },
    cloudSize: { type: ControlType.Number, title: "Cloud Detail", min: 4, max: 16, step: 1, unit: "px", defaultValue: 7 },
    cloudTop: { type: ControlType.Number, title: "Cloud Top", min: 0, max: 400, step: 1, defaultValue: 96 },
    gravity: { type: ControlType.Number, title: "Gravity", min: 0.2, max: 3, step: 0.1, defaultValue: 1 },
    rain: { type: ControlType.Number, title: "Rain", min: 0, max: 30, step: 0.5, unit: "/s", defaultValue: 3 },
    showRainControl: { type: ControlType.Boolean, title: "Rain Slider", defaultValue: true, enabledTitle: "Show", disabledTitle: "Hide" },
    maxLetters: { type: ControlType.Number, title: "Max Letters", min: 20, max: 1500, step: 10, defaultValue: 500 },
    hint: { type: ControlType.String, title: "Hint", defaultValue: "Go ahead, type something" },
    hintColor: { type: ControlType.Color, title: "Hint Color", defaultValue: "rgba(8, 31, 92, 0.45)" },
    clearLabel: { type: ControlType.String, title: "Clear Label", defaultValue: "Clear" },
    buttonPosition: {
        type: ControlType.Enum,
        title: "Button",
        options: ["bottom-left", "bottom-right", "top-left", "top-right"],
        optionTitles: ["Bottom Left", "Bottom Right", "Top Left", "Top Right"],
        defaultValue: "bottom-left",
    },
})
