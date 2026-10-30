/**
 * @author Mr.king x Aliya
 * 🌸 Aliya Official V4 Engine 🦢
 * 🦋 Multi-GC Optimized & Ultra Fast Auto-Recovery Launcher 🌷
 */

"use strict";

const { spawn } = require("child_process");
const net = require("net");
const os = require("os");

const BOT_FILE = "Aliya.js";
const RESTART_DELAY = 1000;            // planned restart / first crash delay
const MAX_RESTART_DELAY = 15000;       // exponential backoff cap
const MAX_CRASH_COUNT = 5;
const STABLE_UPTIME = 60000;           // ran this long = healthy, crash counter resets
const MIN_PLANNED_UPTIME = 15000;      // exit(2) sooner than this is a crash loop, not a planned restart
const CRASH_PAUSE_TIME = 30000;        // 30 sec
const HEARTBEAT_TIMEOUT = 180000;      // child event loop frozen this long => kill & restart
const KILL_GRACE = 5000;               // SIGTERM -> SIGKILL grace
// Set RESTART_ON_CLEAN_EXIT=1 to also restart when the bot exits with code 0
const RESTART_ON_CLEAN_EXIT = process.env.RESTART_ON_CLEAN_EXIT === "1";

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
  🌸█████╗ ██╗     ██╗██╗   ██╗ █████╗     ██╗   ██╗██╗  ██╗🦢
  🌷██╔══██╗██║     ██║╚██╗ ██╔╝██╔══██╗    ██║   ██║██║  ██║🌷
  🦋███████║██║     ██║ ╚████╔╝ ███████║    ██║   ██║███████║🦋
  🐇██╔══██║██║     ██║  ╚██╔╝  ██╔══██║    ╚██╗ ██╔╝╚════██║🐇
  🌸██║  ██║███████╗██║   ██║   ██║  ██║     ╚████╔╝      ██║🌸
  🦢╚═╝  ╚═╝╚══════╝╚═╝   ╚═╝   ╚═╝  ╚═╝      ╚═══╝       ╚═╝🦢${C.reset}
`;

let child = null;
let shuttingDown = false;
let restartTimer = null;
let restartCount = 0;
let starting = false;
let paused = false; // crash-guard pause (watchdog must not interfere)
let crashCount = 0;
let spawnedAt = 0;
let lastBeat = 0;
let gotBeat = false;
let heartbeatTimer = null;
let pauseTimer = null;

// Smart Port Picker for Multi-GC / Multi-Process handling
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

// `killed` turns true as soon as a signal is *sent*, even if the process is still alive,
// which could let the watchdog spawn a 2nd instance. Check real exit state instead.
function isChildRunning() {
    return !!child && child.exitCode === null && child.signalCode === null;
}

// Real memory budget (respects container/cgroup limits when Node can see them)
function getMemLimitMB() {
    let limit = os.totalmem();
    try {
        const c = typeof process.constrainedMemory === "function" ? process.constrainedMemory() : 0;
        if (c && c > 0 && c < limit) limit = c;
    } catch (e) {}
    return Math.floor(limit / 1048576);
}

function killChild(proc, reason) {
    log("🔪", "KILL", reason, C.red);
    try { proc.kill("SIGTERM"); } catch (e) {}
    setTimeout(() => {
        if (proc.exitCode === null && proc.signalCode === null) {
            try { proc.kill("SIGKILL"); } catch (e) {}
        }
    }, KILL_GRACE);
}

// Detects a *frozen* (not crashed) bot: process alive but event loop blocked
function watchHeartbeat(proc) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
        if (child !== proc || shuttingDown || !gotBeat) return;
        const silent = Date.now() - lastBeat;
        if (silent > HEARTBEAT_TIMEOUT) {
            clearInterval(heartbeatTimer);
            killChild(proc, `Bot frozen (no heartbeat for ${Math.round(silent / 1000)}s). Forcing restart...`);
        }
    }, 10000);
}

function printBanner(port) {
    const line = "═".repeat(59);
    const row = (text) => ` ${C.cyan}║${C.reset} ${text.padEnd(57)} ${C.cyan}║${C.reset}`;
    console.log("\n" + BANNER);
    console.log(` ${C.cyan}╔${line}╗${C.reset}`);
    console.log(row(`${C.bold}🌸 👑 ALIYA OFFICIAL V4 ENGINE 🦢${C.reset}`.padEnd(57 + 8)));
    console.log(row(`👤 DEVELOPER    : Mr.king 🦋`));
    console.log(row(`🔄 LAUNCH COUNT : ${restartCount} 🚀`));
    console.log(row(`🌐 PORT         : ${port} 🌐`));
    console.log(row(`⚡ MODE         : Multi-GC Heavy Load Ready 🌷`));
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

    const memLimitMB = getMemLimitMB();
    // Never give V8 more heap than the machine really has (4GB heap on a 512MB host = OOM-kill loop)
    const heapMB = Math.max(256, Math.min(4096, Math.floor(memLimitMB * 0.7)));

    let proc;
    try {
        proc = spawn(process.execPath, [BOT_FILE], {
            cwd: __dirname,
            // 4th channel = IPC, used for the heartbeat
            stdio: ["inherit", "inherit", "inherit", "ipc"],
            shell: false,
            env: {
                ...process.env,
                PORT: String(botPort),
                MEM_LIMIT_MB: String(memLimitMB),
                // Threadpool threads are created on demand; 128 was overkill and memory hungry
                UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE || "32",
                NODE_OPTIONS: process.env.NODE_OPTIONS || `--max-old-space-size=${heapMB} --expose-gc`
            }
        });
    } catch (error) {
        log("❌", "SPAWN_FAIL", `Failed to start ${BOT_FILE}: ${error.message}`, C.red);
        child = null;
        scheduleRestart();
        return;
    }

    child = proc;
    spawnedAt = Date.now();
    lastBeat = spawnedAt;
    gotBeat = false;

    log("🚀", "SYSTEM", `Bot core spawned | PID: ${C.green}${proc.pid}${C.reset} | RAM budget: ${memLimitMB}MB | Heap: ${heapMB}MB`, C.green);

    proc.on("message", msg => {
        if (msg && msg.type === "heartbeat") {
            lastBeat = Date.now();
            gotBeat = true;
        }
    });
    watchHeartbeat(proc);

    let finished = false;
    const onEnd = (code, signal) => {
        if (finished) return;
        finished = true;

        clearInterval(heartbeatTimer);
        if (child === proc) child = null;
        log("💀", "EXIT", `Stopped | Code: [ ${code} ] | Signal: [ ${signal} ]`, C.red);

        if (shuttingDown) return;

        const uptime = Date.now() - spawnedAt;

        // Code 0 = intentionally stopped / logged out
        if (code === 0) {
            if (RESTART_ON_CLEAN_EXIT) {
                log("🔁", "RESTART", "Clean exit, but RESTART_ON_CLEAN_EXIT=1. Booting again...", C.green);
                scheduleRestart();
                return;
            }
            log("🛑", "STOP", "Bot stopped / ID logged out. Server turning OFF...", C.yellow);
            shuttingDown = true;
            process.exit(0);
        }

        // Code 2 = planned restart (autoRestart / memory guard). If it happens right after boot
        // it is a restart *loop*, so it must count as a crash.
        if (code === 2 && uptime >= MIN_PLANNED_UPTIME) {
            log("🔁", "RESTART", "Planned restart requested. Booting again...", C.green);
            crashCount = 0;
            scheduleRestart();
            return;
        }

        // Crash-Loop Protection: a bot that stayed up for a while is healthy, start counting fresh
        if (uptime >= STABLE_UPTIME) {
            crashCount = 1;
        } else {
            crashCount++;
        }

        if (crashCount >= MAX_CRASH_COUNT) {
            log("🚨", "CRASH_GUARD", `Too many quick crashes (${crashCount}). Pausing for ${CRASH_PAUSE_TIME / 1000}s...`, C.red);
            paused = true;
            pauseTimer = setTimeout(() => {
                pauseTimer = null;
                paused = false;
                crashCount = 0;
                scheduleRestart();
            }, CRASH_PAUSE_TIME);
            return;
        }

        log("⚠️", "AUTO_HEAL", `Crash detected! Consecutive crashes: [ ${crashCount} ] | Uptime: ${Math.round(uptime / 1000)}s`, C.yellow);
        // Exponential backoff: 1s, 2s, 4s, 8s ... (max 15s) so a broken start does not hammer Facebook/DB
        scheduleRestart(Math.min(RESTART_DELAY * 2 ** Math.max(0, crashCount - 1), MAX_RESTART_DELAY));
    };

    proc.on("error", error => {
        log("❌", "PROCESS_ERR", `Error in ${BOT_FILE}: ${error.message}`, C.red);
        // A failed spawn never emits "exit" -> without this the launcher would think the bot is alive forever
        if (!proc.pid) onEnd(null, "SPAWN_ERROR");
    });

    proc.on("exit", onEnd);
}

function scheduleRestart(delay = RESTART_DELAY) {
    if (shuttingDown || restartTimer || paused) return;

    log("🛡️", "RECOVERY", `Re-booting in ${delay / 1000}s...`, C.green);

    restartTimer = setTimeout(() => {
        restartTimer = null;
        if (!shuttingDown) startBot();
    }, delay);
}

// Watchdog Anti-Hang Protection for Multi-GC Stability
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
    if (pauseTimer) clearTimeout(pauseTimer);
    clearInterval(heartbeatTimer);

    const proc = child;
    if (!proc || !isChildRunning()) return process.exit(0);

    proc.once("exit", () => process.exit(0));
    try { proc.kill(signal); } catch (e) {}
    setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch (e) {}
        process.exit(0);
    }, KILL_GRACE);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", err => log("❌", "UNCAUGHT", errMsg(err), C.red));
process.on("unhandledRejection", err => log("⚠️", "UNHANDLED", errMsg(err), C.yellow));

// Directly launch engine
startBot();
