// logger.js - tiny, dependency-free pretty logger
const os = require("os");
const path = require("path");

const COLOR = process.env.NO_COLOR ? false : true;
const c = (code) => (s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const dim = c("2"); const bold = c("1");
const red = c("31"); const green = c("32"); const yellow = c("33"); const cyan = c("36"); const gray = c("90");
const bg = (n) => (s) => (COLOR ? `\x1b[${n}m${s}\x1b[0m` : String(s));
const bgi = bg("48;5;238"); // subtle dark bg for banners

const time = () => new Date().toLocaleTimeString();
function hr(char = "─", width = process.stdout.columns || 80) {
    const line = char.repeat(Math.max(20, Math.min(width, 120)));
    process.stdout.write(gray(line) + os.EOL);
}
function pad(s = "", n = 2) { return " ".repeat(n) + s; }
function box(title = "", lines = [], color = cyan) {
    const width = Math.min(Math.max(40, (process.stdout.columns || 80) - 2), 120);
    const top = "┌" + "─".repeat(width - 2) + "┐";
    const mid = "├" + "─".repeat(width - 2) + "┤";
    const bot = "└" + "─".repeat(width - 2) + "┘";
    const titleLine = (" " + title + " ").padEnd(width - 2, " ");
    console.log(color(top));
    console.log(color("│") + bold(titleLine) + color("│"));
    if (lines.length) {
        console.log(color(mid));
        for (const ln of lines) {
            const txt = (" " + ln).padEnd(width - 2, " ");
            console.log(color("│") + txt + color("│"));
        }
    }
    console.log(color(bot));
}
function banner(left = "call banner with 2 argument", right = "") {
    const L = pad(left);
    const R = right ? pad(gray(`• ${right}`)) : "";
    const full = bgi(bold(L + R));
    console.log(full);
}
function mkLogger(contextFile) {
    const ctx = path.basename(contextFile || "");
    const prefix = () => gray(`[${time()}]`) + " " + cyan(ctx ? `(${ctx})` : "");

    return {
        banner,
        hr,
        box,
        info: (msg, extra) => console.log(prefix(), msg, extra ?? ""),
        ok: (msg, extra) => console.log(prefix(), green("✓"), msg, extra ?? ""),
        warn: (msg, extra) => console.log(prefix(), yellow("!"), msg, extra ?? ""),
        error: (msg, extra) => console.log(prefix(), red("✗"), msg, extra ?? ""),
        clientlog: (msg, extra) => console.log(prefix(), dim("»"), msg, extra ?? ""),
        step: (title, kv = {}) => {
            const lines = Object.entries(kv).map(([k, v]) => `${k}: ${v}`);
            box(` ${title} `, lines, cyan);
        },
        section: (title) => {
            hr();
            console.log(bold(cyan(`» ${title}`)));
            hr();
        }
    };
}

module.exports = { mkLogger };
