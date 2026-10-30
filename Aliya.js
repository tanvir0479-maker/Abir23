/**
 * @author Mr.king
 * ! Modified and Updated for Aliya Bot v4 Engine
 */

"use strict";

// ───────────── Stability layer ─────────────
// Network hiccups are normal for a Messenger bot: log them and keep running.
const TRANSIENT_ERR = /ECONNRESET|ETIMEDOUT|ESOCKETTIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|EPIPE|socket hang up|network/i;
const recentFatal = [];

process.on('unhandledRejection', error => console.error("[UNHANDLED_REJECTION]", error));
process.on('uncaughtException', error => {
	console.error("[UNCAUGHT_EXCEPTION]", error);
	const text = `${error && error.code || ""} ${error && error.message || error}`;
	if (TRANSIENT_ERR.test(text)) return;

	// Previously every error was swallowed forever, which can leave the bot "alive but dead".
	// If non-network errors keep piling up, exit so the launcher gives a clean restart.
	const t = Date.now();
	recentFatal.push(t);
	while (recentFatal.length && t - recentFatal[0] > 60000) recentFatal.shift();
	if (recentFatal.length >= 3) {
		console.error("[STABILITY] 3 uncaught errors in 60s. Exiting for a clean restart...");
		process.exit(1);
	}
});

// Heartbeat -> launcher (index.js) kills & restarts us if the event loop ever freezes
if (typeof process.send === "function") {
	const beat = () => { try { process.send({ type: "heartbeat" }); } catch (e) { } };
	beat();
	setInterval(beat, 15000).unref();
	if (process.channel && typeof process.channel.unref === "function") process.channel.unref();
	// Launcher died -> don't keep running as an orphan holding the port
	process.on("disconnect", () => process.exit(0));
}

// Memory guard: restart cleanly (exit 2) *before* the OS OOM-kills the process
const MEM_LIMIT_MB = Number(process.env.MEM_LIMIT_MB) || 0;
if (MEM_LIMIT_MB > 0) {
	const maxRss = MEM_LIMIT_MB * 0.85 * 1048576;
	setInterval(() => {
		let rss = process.memoryUsage().rss;
		if (rss < maxRss) return;
		if (typeof global.gc === "function") {
			try { global.gc(); } catch (e) { }
			rss = process.memoryUsage().rss;
		}
		if (rss >= maxRss) {
			console.error(`[STABILITY] Memory ${Math.round(rss / 1048576)}MB is over 85% of ${MEM_LIMIT_MB}MB. Restarting cleanly...`);
			process.exit(2);
		}
	}, 30000).unref();
}

// Many groups = many listeners/events at once. Raise limit so Node doesn't spam warnings.
require("events").EventEmitter.defaultMaxListeners = 100;
process.setMaxListeners(100);

const fs = require("fs-extra");
const google = require("googleapis").google;
const nodemailer = require("nodemailer");
const log = require('./logger/log.js');
const path = require("path");

process.env.BLUEBIRD_W_FORGOTTEN_RETURN = 0;

// Dynamic Path Loader
function getConfigPath(baseName, ext = ".json") {
	const devPath = path.join(__dirname, `${baseName}.dev${ext}`);
	const normalPath = path.join(__dirname, `${baseName}${ext}`);
	if (fs.existsSync(devPath)) {
		console.log(`⚙️ Loaded ${baseName}.dev${ext}`);
		return devPath;
	} else if (fs.existsSync(normalPath)) {
		console.log(`⚙️ Loaded ${baseName}${ext}`);
		return normalPath;
	} else {
		throw new Error(`❌ Missing ${baseName}${ext} or ${baseName}.dev${ext}`);
	}
}

// Fast Built-in JSON Validator
function validJSON(pathDir) {
	if (!fs.existsSync(pathDir)) throw new Error(`File "${pathDir}" not found`);
	try {
		const content = fs.readFileSync(pathDir, "utf-8");
		JSON.parse(content);
		return true;
	} catch (err) {
		throw new Error(`JSON Syntax Error in ${pathDir}: ${err.message}`);
	}
}

const dirConfig = getConfigPath("config", ".json");
const dirConfigCommands = getConfigPath("configCommands", ".json");
const dirAccount = getConfigPath("account", ".txt");

for (const pathDir of [dirConfig, dirConfigCommands]) {
	try {
		validJSON(pathDir);
	} catch (err) {
		log.error("CONFIG", `${err.message}\nPlease fix it and restart bot.`);
		process.exit(1);
	}
}

const config = require(dirConfig);
if (config.whiteListMode?.whiteListIds && Array.isArray(config.whiteListMode.whiteListIds)) {
	config.whiteListMode.whiteListIds = config.whiteListMode.whiteListIds.map(id => id.toString());
}
const configCommands = require(dirConfigCommands);

// Global Bot Storage Initialization
global.GoatBot = {
	startTime: Date.now() - process.uptime() * 1000,
	commands: new Map(),
	eventCommands: new Map(),
	commandFilesPath: [],
	eventCommandsFilesPath: [],
	aliases: new Map(),
	onFirstChat: [],
	onChat: [],
	onEvent: [],
	onReply: new Map(),
	onReaction: new Map(),
	onAnyEvent: [],
	config,
	configCommands,
	envCommands: {},
	envEvents: {},
	envGlobal: {},
	reLoginBot: function () { },
	Listening: null,
	oldListening: [],
	callbackListenTime: {},
	storage5Message: [],
	fcaApi: null,
	botID: null
};

global.db = {
	allThreadData: [],
	allUserData: [],
	allDashBoardData: [],
	allGlobalData: [],
	threadModel: null,
	userModel: null,
	dashboardModel: null,
	globalModel: null,
	threadsData: null,
	usersData: null,
	dashBoardData: null,
	globalData: null,
	receivedTheFirstMessage: {}
};

global.client = {
	dirConfig,
	dirConfigCommands,
	dirAccount,
	countDown: {},
	cache: {},
	database: {
		creatingThreadData: [],
		creatingUserData: [],
		creatingDashBoardData: [],
		creatingGlobalData: []
	},
	commandBanned: configCommands.commandBanned
};

const utils = require("./utils.js");
global.utils = utils;

global.temp = {
	createThreadData: [],
	createUserData: [],
	createThreadDataError: [],
	filesOfGoogleDrive: {
		arraybuffer: {},
		stream: {},
		fileNames: {}
	},
	contentScripts: {
		cmds: {},
		events: {}
	}
};

// Hot Reloading Setup
const watchAndReloadConfig = (dir, type, prop, logName) => {
	let lastModified = fs.statSync(dir).mtimeMs;
	const watcher = fs.watch(dir, (eventType) => {
		if (eventType === type) {
			setTimeout(() => {
				try {
					const currentMtime = fs.statSync(dir).mtimeMs;
					if (lastModified === currentMtime) return;
					lastModified = currentMtime;

					global.GoatBot[prop] = JSON.parse(fs.readFileSync(dir, 'utf-8'));
					log.success(logName, `Reloaded ${dir.replace(process.cwd(), "")}`);
				} catch (err) {
					log.warn(logName, `Can't reload ${dir.replace(process.cwd(), "")}`);
				}
			}, 200);
		}
	});
	// Unhandled watcher errors (EMFILE/ENOSPC...) used to take the whole bot down
	watcher.on("error", err => log.warn(logName, `Config watcher error: ${err.message}`));
};

watchAndReloadConfig(dirConfigCommands, 'change', 'configCommands', 'CONFIG COMMANDS');
watchAndReloadConfig(dirConfig, 'change', 'config', 'CONFIG');

global.GoatBot.envGlobal = global.GoatBot.configCommands.envGlobal;
global.GoatBot.envCommands = global.GoatBot.configCommands.envCommands;
global.GoatBot.envEvents = global.GoatBot.configCommands.envEvents;

const getText = global.utils.getText;

// Auto Restart Manager
if (config.autoRestart) {
	const time = config.autoRestart.time;
	if (!isNaN(time) && time > 0) {
		utils.log.info("AUTO RESTART", getText("Goat", "autoRestart1", utils.convertTime(time, true)));
		// setTimeout overflows above 2^31-1 ms (~24.8 days) and fires instantly -> endless restart loop
		setTimeout(() => {
			utils.log.info("AUTO RESTART", "Restarting system...");
			process.exit(2);
		}, Math.min(time, 2147483647));
	} else if (typeof time == "string" && time.match(/^((((\d+,)+\d+|(\d+(\/|-|#)\d+)|\d+L?|\*(\/\d+)?|L(-\d+)?|\?|[A-Z]{3}(-[A-Z]{3})?) ?){5,7})$/gmi)) {
		utils.log.info("AUTO RESTART", getText("Goat", "autoRestart2", time));
		const cron = require("node-cron");
		cron.schedule(time, () => {
			utils.log.info("AUTO RESTART", "Restarting system...");
			process.exit(2);
		});
	}
}

// A hung network call at startup (Gmail/Drive) must never block the bot from logging in
const withTimeout = (promise, ms, name) => new Promise((resolve, reject) => {
	const timer = setTimeout(() => reject(new Error(`${name} timed out after ${ms / 1000}s`)), ms);
	Promise.resolve(promise).then(
		v => { clearTimeout(timer); resolve(v); },
		e => { clearTimeout(timer); reject(e); }
	);
});

// Async Main Bootstrapper
(async () => {
	// 1. Gmail & OAuth2 Setup
	try {
		const { gmailAccount } = config.credentials || {};
		if (gmailAccount?.email && gmailAccount?.refreshToken) {
			const { email, clientId, clientSecret, refreshToken } = gmailAccount;
			const OAuth2 = google.auth.OAuth2;
			const OAuth2_client = new OAuth2(clientId, clientSecret);
			OAuth2_client.setCredentials({ refresh_token: refreshToken });
			
			const accessToken = await withTimeout(OAuth2_client.getAccessToken(), 15000, "Gmail getAccessToken");
			const transporter = nodemailer.createTransport({
				host: 'smtp.gmail.com',
				service: 'Gmail',
				auth: {
					type: 'OAuth2',
					user: email,
					clientId,
					clientSecret,
					refreshToken,
					accessToken
				}
			});

			global.utils.sendMail = async ({ to, subject, text, html, attachments }) => {
				return await transporter.sendMail({ from: email, to, subject, text, html, attachments });
			};
			global.utils.transporter = transporter;
		}
	} catch (err) {
		log.warn("GMAIL_INIT", "Gmail/Nodemailer bypass: " + err.message);
	}

	// 2. Google Drive Setup
	try {
		if (utils.drive && typeof utils.drive.checkAndCreateParentFolder === "function") {
			utils.drive.parentID = await withTimeout(utils.drive.checkAndCreateParentFolder("AliyaBot"), 15000, "Google Drive init");
		}
	} catch (err) {
		log.warn("GDRIVE_INIT", "Google Drive bypass: " + err.message);
	}

	// 3. Trigger Core Login
	console.log("\x1b[35m\x1b[1m👑 ALIYA V4\x1b[0m \x1b[90m|\x1b[0m \x1b[36mStarting login...\x1b[0m \x1b[90m|\x1b[0m \x1b[32mMulti-group mode ON\x1b[0m");
	try {
		require(`./bot/login/login.js`);
	} catch (err) {
		// Before: this rejection was swallowed and the process sat there idle ("bot off").
		console.error("[LOGIN_FATAL]", err);
		process.exit(1);
	}
})().catch(err => {
	console.error("[BOOT_FATAL]", err);
	process.exit(1);
});
	
