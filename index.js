/**
 * @author Mr.king x Aliya
 * Aliya Official V4 Engine
 * Ultra Fast Auto-Recovery Launcher
 */

"use strict";

const { spawn } = require("child_process");
const net = require("net");

const BOT_FILE = "Aliya.js";
const RESTART_DELAY = 1000;
const MAX_CRASH_COUNT = 5;
const CRASH_RESET_TIME = 60000; // 1 min
const CRASH_PAUSE_TIME = 30000; // 30 sec

// ───────────── Colors ─────────────
const C = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    gray: "\x1b[90m"
};

const BANNER = `${C.magenta}${C.bold}
  █████╗ ██╗     ██╗██╗   ██╗ █████╗     ██╗   ██╗██╗  ██╗
 ██╔══██╗██║     ██║╚██╗ ██╔╝██╔══██╗    ██║   ██║██║  ██║
 ███████║██║     ██║ ╚████╔╝ ███████║    ██║   ██║███████║
 ██╔══██║██║     ██║  ╚██╔╝  ██╔══██║    ╚██╗ ██╔╝╚════██║
 ██║  ██║███████╗██║   ██║   ██║  ██║     ╚████╔╝      ██║
 ╚═╝  ╚═╝╚══════╝╚═╝   ╚═╝   ╚═╝  ╚═╝      ╚═══╝       ╚═╝${C.reset}
`;

let child = null;
let shuttingDown = false;
let restartTimer = null;
let restartCount = 0;
let starting = false;
let paused = false; // crash-guard pause (watchdog must not interfere)
let crashCount = 0;
let lastCrashTime = 0;

// Smart Port Picker
// - Uses process.env.PORT (Render/Koyeb/Railway) or 8080 by default.
// - If busy, retries a few times, then falls back to a random free port.
// - The chosen port is passed to the bot as process.env.PORT.
const PREFERRED_PORT = Number(process.env.PORT) || 8080;

function now() {
    return new Date().toTimeString().split(" ")[0];
}

function log(symbol, tag, msg, color = C.cyan) {
    console.log(`${C.gray}[${now()}]${C.reset} ${symbol} ${color}${C.bold}[${tag}]${C.reset} ${C.gray}──►${C.reset} ${msg}`);
}

function errMsg(err) {
    if (!err) return "Unknown error";
    return err.stack ? err.stack.split("\n").slice(0, 3).join(" | ") : String(err.message || err);
}

function isPortFree(port) {
    return new Promise(resolve => {
        const tester = net.createServer();
        tester.once("error", () => resolve(false));
        tester.once("listening", () => tester.close(() => resolve(true)));
        tester.listen(port, "0.0.0.0");
    });
}

function getRandomFreePort() {
    return new Promise((resolve, reject) => {
        const tester = net.createServer();
        tester.once("error", reject);
        tester.listen(0, "0.0.0.0", () => {
            const port = tester.address().port;
            tester.close(() => resolve(port));
        });
    });
}

async function pickPort() {
    for (let i = 0; i < 5; i++) {
        if (await isPortFree(PREFERRED_PORT)) return PREFERRED_PORT;
        await new Promise(r => setTimeout(r, 500));
    }
    const port = await getRandomFreePort();
    log("⚠️", "PORT", `Port ${PREFERRED_PORT} is busy. Using free port ${port} instead.`, C.yellow);
    return port;
}

function isChildRunning() {
    return child && child.exitCode === null && !child.killed;
}

function printBanner(port) {
    const line = "═".repeat(59);
    const row = (text) => ` ${C.cyan}║${C.reset} ${text.padEnd(57)} ${C.cyan}║${C.reset}`;
    console.log("\n" + BANNER);
    console.log(` ${C.cyan}╔${line}╗${C.reset}`);
    console.log(row(`${C.bold}👑 ALIYA OFFICIAL V4 ENGINE${C.reset}`.padEnd(57 + 8)));
    console.log(row(`👤 DEVELOPER    : Mr.king`));
    console.log(row(`🔄 LAUNCH COUNT : ${restartCount}`));
    console.log(row(`🌐 PORT         : ${port}`));
    console.log(row(`⚡ MODE         : Multi-Group Ready`));
    console.log(` ${C.cyan}╚${line}╝${C.reset}\n`);
}

async function startBot() {
    if (shuttingDown || starting || paused) return;

    if (isChildRunning()) {
        log("⚠️", "INDEX", "Aliya.js is already running!", C.yellow);
        return;
    }

    if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
    }

    starting = true;
    let botPort;
    try {
        botPort = await pickPort();
    } catch (e) {
        starting = false;
        log("❌", "PORT_FAIL", e.message, C.red);
        scheduleRestart();
        return;
    }
    starting = false;
    if (shuttingDown) return;

    restartCount++;
    printBanner(botPort);

    try {
        child = spawn(process.execPath, [BOT_FILE], {
            cwd: __dirname,
            stdio: "inherit",
            shell: false,
            env: {
                ...process.env,
                PORT: String(botPort),
                // Bigger libuv thread pool => many groups can do file/network work in parallel
                UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE || "32"
            }
        });
    } catch (error) {
        log("❌", "SPAWN_FAIL", `Failed to start ${BOT_FILE}: ${error.message}`, C.red);
        child = null;
        scheduleRestart();
        return;
    }

    log("🚀", "SYSTEM", `Bot core spawned | PID: ${C.green}${child.pid}${C.reset}`, C.green);

    child.on("error", error => {
        log("❌", "PROCESS_ERR", `Error in ${BOT_FILE}: ${error.message}`, C.red);
    });

    child.on("exit", (code, signal) => {
        child = null;
        log("💀", "EXIT", `Stopped | Code: [ ${code} ] | Signal: [ ${signal} ]`, C.red);

        if (shuttingDown) return;

        // Code 0 = intentionally stopped / logged out
        if (code === 0) {
            log("🛑", "STOP", "Bot stopped / ID logged out. Server turning OFF...", C.yellow);
            shuttingDown = true;
            process.exit(0);
        }

        // Code 2 = planned restart (autoRestart / restart command) -> not a crash
        if (code === 2) {
            log("🔁", "RESTART", "Planned restart requested. Booting again...", C.green);
            crashCount = 0;
            scheduleRestart();
            return;
        }

        // Crash-Loop Protection
        const currentTime = Date.now();
        if (currentTime - lastCrashTime < CRASH_RESET_TIME) {
            crashCount++;
        } else {
            crashCount = 1;
        }
        lastCrashTime = currentTime;

        if (crashCount >= MAX_CRASH_COUNT) {
            log("🚨", "CRASH_GUARD", `Too many crashes (${crashCount} in 1 min). Pausing for ${CRASH_PAUSE_TIME / 1000}s...`, C.red);
            paused = true;
            setTimeout(() => {
                paused = false;
                crashCount = 0;
                scheduleRestart();
            }, CRASH_PAUSE_TIME);
            return;
        }

        log("⚠️", "AUTO_HEAL", `Crash detected! Consecutive crashes: [ ${crashCount} ]`, C.yellow);
        scheduleRestart();
    });
}

function scheduleRestart() {
    if (shuttingDown || restartTimer || paused) return;

    log("🛡️", "RECOVERY", `Re-booting in ${RESTART_DELAY / 1000}s...`, C.green);

    restartTimer = setTimeout(() => {
        restartTimer = null;
        if (!shuttingDown) startBot();
    }, RESTART_DELAY);
}

// Watchdog Anti-Hang Protection
setInterval(() => {
    if (!shuttingDown && !paused && !isChildRunning() && !restartTimer && !starting) {
        log("⚠️", "WATCHDOG", "Bot is inactive! Forcing start...", C.yellow);
        scheduleRestart();
    }
}, 10000);

// Graceful Shutdown
function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;

    log("⚠️", "SHUTDOWN", `${signal} received. Cleaning up...`, C.yellow);
    if (restartTimer) clearTimeout(restartTimer);
    if (child) {
        try { child.kill(signal); } catch (e) {}
    }
    setTimeout(() => process.exit(0), 500);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", err => log("❌", "UNCAUGHT", errMsg(err), C.red));
process.on("unhandledRejection", err => log("⚠️", "UNHANDLED", errMsg(err), C.yellow));

// Directly launch engine
startBot();
