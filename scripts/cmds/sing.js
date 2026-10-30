const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const API_URL = "https://azadx69x.is-a.dev/api/sing";
const MAX_SIZE = 25 * 1024 * 1024; // Messenger attachment limit
const HTTP = { timeout: 30000, headers: { "User-Agent": "Mozilla/5.0" } };

const react = (api, event, emoji) => {
  try {
    if (api && typeof api.setMessageReaction === "function") api.setMessageReaction(emoji, event.messageID, () => {}, true);
  } catch (e) {}
};

// Short, human readable reason so you can tell "API is down" from "my code is broken"
const why = err => err?.response ? `HTTP ${err.response.status}` : (err?.code === "ECONNABORTED" ? "timeout" : (err?.code || err?.message || "unknown"));

module.exports = {
  config: {
    name: "sing",
    aliases: ["playaudio", "song", "audio"],
    version: "2.1.0",
    author: "azadx69x x Mr.king",
    countDown: 3,
    role: 0,
    shortDescription: "Download and play song audio quickly",
    category: "media",
    guide: { en: "{p}sing <song name>" }
  },

  onStart: async function ({ message, args, api, event }) {
    const query = args.join(" ");
    if (!query) return message.reply("⚠️ Ganer nam ba keyword dao! Jemon: `/sing Nadaaniyan`");

    react(api, event, "⌛️");
    let filePath;

    try {
      const res = await axios.get(`${API_URL}?song=${encodeURIComponent(query)}`, HTTP);
      const resData = res?.data;

      const audioUrl = resData?.data?.audio?.url;
      const title = resData?.data?.info?.title || query;
      const artist = resData?.data?.info?.artist || "Unknown Artist";

      if (!audioUrl) {
        console.error("[sing] API returned no audio url:", JSON.stringify(resData)?.slice(0, 300));
        react(api, event, "❌️");
        return message.reply("❌ Ganer audio link khuje pawa jayni, onno gan try koro!");
      }

      const buffer = (await axios.get(audioUrl, {
        ...HTTP,
        timeout: 120000,
        responseType: "arraybuffer",
        maxContentLength: MAX_SIZE,
        maxBodyLength: MAX_SIZE
      })).data;

      filePath = path.join(__dirname, "cache", `sing_${Date.now()}.mp3`);
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, Buffer.from(buffer));

      react(api, event, "✅️");

      const caption =
        `🎵 𝐒𝐎𝐍𝐆 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐑 🌸\n` +
        `📌 𝐓𝐢𝐭𝐥𝐞: ${title}\n` +
        `🎤 𝐀𝐫𝐭𝐢𝐬𝐭: ${artist}\n\n` +
        `╭───────────────⬣\n│ 𝐌𝐚𝐝𝐞 𝐰𝐢𝐭𝐡 🤍 𝐛𝐲 --𝔐𝔯.𝔎𝔦𝔫𝔤\n╰───────────────⬣`;

      const file = filePath;
      return message.reply({
        body: caption,
        attachment: fs.createReadStream(file)
      }, () => fs.remove(file).catch(() => {}));

    } catch (err) {
      console.error("[sing] failed:", why(err), err?.message);
      if (filePath) fs.remove(filePath).catch(() => {});
      react(api, event, "❌️");
      const tooBig = /maxContentLength|max content length/i.test(err?.message || "");
      return message.reply(tooBig
        ? "❌ Audio file ta onek boro (25MB er beshi), onno gan try koro!"
        : `❌ Gan download korte samossya hoyeche, abar chesta koro! (${why(err)})`);
    }
  }
};
