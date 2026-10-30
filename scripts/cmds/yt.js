const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const SEARCH_URL = "https://azadx69x.is-a.dev/api/youtube-search";
const AUTODL_URL = "https://xsaim8x-xxx-api.onrender.com/api/auto";
const MAX_SIZE = 25 * 1024 * 1024; // Messenger attachment limit
const HTTP = { timeout: 30000, headers: { "User-Agent": "Mozilla/5.0" } };
const SIGNATURE = `╭───────────────⬣\n│ 𝐌𝐚𝐝𝐞 𝐰𝐢𝐭𝐡 🤍 𝐛𝐲 --𝔐𝔯.𝔎𝔦𝔫𝔤\n╰───────────────⬣`;

const react = (api, event, emoji) => {
  try {
    if (api && typeof api.setMessageReaction === "function") api.setMessageReaction(emoji, event.messageID, () => {}, true);
  } catch (e) {}
};
const why = err => err?.response ? `HTTP ${err.response.status}` : (err?.code === "ECONNABORTED" ? "timeout" : (err?.code || err?.message || "unknown"));

module.exports = {
  config: {
    name: "yt",
    aliases: ["yts", "youtubesearch", "ytsearch"],
    version: "2.2.0",
    author: "𝔐𝔯.𝔎𝔦𝔫𝔤",
    countDown: 3,
    role: 0,
    shortDescription: "Search YouTube and download audio/video with autodl engine",
    category: "media",
    guide: { en: "{p}yt <search query>" }
  },

  onStart: async function ({ message, args, api, event }) {
    try {
      const query = args.join(" ");
      if (!query) return message.reply("⚠️ Please provide a search query! Example: `/yt Phonk`");

      react(api, event, "⌛️");

      const res = await axios.get(`${SEARCH_URL}?query=${encodeURIComponent(query)}&type=Bazil`, HTTP);
      const results = res?.data?.data?.results;

      if (!Array.isArray(results) || results.length === 0) {
        console.error("[yt] no results:", JSON.stringify(res?.data)?.slice(0, 300));
        react(api, event, "❌️");
        return message.reply("❌ No results found on YouTube!");
      }

      react(api, event, "✅️");

      let msg = `📺 𝐘𝐎𝐔𝐓𝐔𝐁𝐄 𝐒𝐄𝐀𝐑𝐂𝐇 𝐑𝐄𝐒𝐔𝐋𝐓𝐒 🌸\n` +
                `📌 𝐐𝐮𝐞𝐫𝐲: ${query}\n\n`;

      const listItems = [];
      results.forEach((item, index) => {
        listItems.push(item);
        msg += `[ ${index + 1} ] 🎬 ${item.title}\n` +
               `⏱️ Duration: ${item.duration} | 👁️ Views: ${item.views}\n` +
               `📌 Channel: ${item.channel}\n───────────────────\n`;
      });

      msg += `\n💬 Reply with format:\n👉 video <number> (e.g. video 1)\n👉 audio <number> (e.g. audio 1)\n\n${SIGNATURE}`;

      return message.reply(msg, (err, info) => {
        if (err || !info) return;
        global.GoatBot.onReply.set(info.messageID, {
          // literal name on purpose: `this` is undefined when the loader calls onStart detached
          commandName: "yt",
          messageID: info.messageID,
          author: event.senderID,
          results: listItems
        });
      });

    } catch (err) {
      console.error("[yt] search failed:", why(err), err?.message);
      react(api, event, "❌️");
      return message.reply(`❌ Error occurred while searching YouTube, please try again! (${why(err)})`);
    }
  },

  // GoatBot passes the stored data as `Reply` (capital R). Older code used `reply`; accept both.
  onReply: async function ({ message, event, api, Reply, reply }) {
    let filePath;
    try {
      const data = Reply || reply;
      if (!data || !Array.isArray(data.results)) {
        return message.reply("⚠️ Ei search result ta expire hoye geche, abar /yt dao!");
      }
      const { author, results } = data;
      if (event.senderID !== author) return message.reply("⚠️ You cannot use this search result!");

      const args = String(event.body || "").trim().split(/\s+/);
      const action = args[0]?.toLowerCase();
      const index = parseInt(args[1]) - 1;

      if (!["video", "audio"].includes(action) || isNaN(index) || !results[index]) {
        return message.reply("⚠️ Invalid format! Use: `audio 1` or `video 1`");
      }

      const selectedItem = results[index];
      let downloadUrl = action === "video" ? selectedItem.download_video : selectedItem.download_audio;

      react(api, event, "⌛️");

      if (data.messageID) global.GoatBot.onReply.delete(data.messageID);

      // Autodl API fallback if the primary download url is missing
      if (!downloadUrl && selectedItem.url) {
        try {
          const autoRes = await axios.get(`${AUTODL_URL}?url=${encodeURIComponent(selectedItem.url)}`, { ...HTTP, timeout: 60000 });
          if (autoRes.data) {
            downloadUrl = action === "video"
              ? (autoRes.data.high_quality || autoRes.data.low_quality)
              : (autoRes.data.audio || autoRes.data.high_quality);
          }
        } catch (e) {
          console.error("[yt] autodl fallback failed:", why(e));
        }
      }

      if (!downloadUrl) {
        react(api, event, "❌️");
        return message.reply("❌ Download link not found for this file!");
      }

      const buffer = (await axios.get(downloadUrl, {
        ...HTTP,
        timeout: 180000,
        responseType: "arraybuffer",
        maxContentLength: MAX_SIZE,
        maxBodyLength: MAX_SIZE
      })).data;

      const extension = action === "video" ? "mp4" : "mp3";
      filePath = path.join(__dirname, "cache", `yt_${Date.now()}.${extension}`);
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, Buffer.from(buffer));

      react(api, event, "✅️");

      const caption = `📥 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃 (${action.toUpperCase()}) 🌸\n` +
                      `📌 𝐓𝐢𝐭𝐥𝐞: ${selectedItem.title}\n\n${SIGNATURE}`;

      const file = filePath;
      return message.reply({
        body: caption,
        attachment: fs.createReadStream(file)
      }, () => fs.remove(file).catch(() => {}));

    } catch (err) {
      console.error("[yt] download failed:", why(err), err?.message);
      if (filePath) fs.remove(filePath).catch(() => {});
      react(api, event, "❌️");
      const tooBig = /maxContentLength|max content length/i.test(err?.message || "");
      return message.reply(tooBig
        ? "❌ File ta onek boro (25MB er beshi). Audio ba chhoto video try koro!"
        : `❌ Failed to download and send the file! (${why(err)})`);
    }
  }
};
