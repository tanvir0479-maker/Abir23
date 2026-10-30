const axios = require("axios");

const API_URL = "https://azadx69x.is-a.dev/api/lyrics";
const HTTP = { timeout: 30000, headers: { "User-Agent": "Mozilla/5.0" } };
const why = err => err?.response ? `HTTP ${err.response.status}` : (err?.code === "ECONNABORTED" ? "timeout" : (err?.code || err?.message || "unknown"));

module.exports = {
  config: {
    name: "lyrics",
    aliases: ["lyric", "songlyrics"],
    version: "1.1.0",
    author: "𝔐𝔯.𝔎𝔦𝔫𝔤",
    countDown: 5,
    role: 0,
    shortDescription: "Get song lyrics using Azadx69x API",
    category: "media",
    guide: { en: "{p}lyrics <song name>" }
  },

  onStart: async function ({ message, args, api, event }) {
    try {
      const query = args.join(" ");
      if (!query) return message.reply("⚠️ গানের নাম লিখে সার্চ করো! যেমন: `/lyrics Nadaaniyan`");

      if (api && typeof api.sendTypingIndicator === "function") {
        try { api.sendTypingIndicator(event.threadID, () => {}); } catch (e) {}
      }

      const res = await axios.get(`${API_URL}?song=${encodeURIComponent(query)}`, HTTP);
      const resData = res?.data;

      const songTitle = resData?.data?.song || query;
      const artistName = resData?.data?.artist || "Unknown Artist";
      let songLyrics = resData?.data?.lyrics;

      if (!songLyrics) {
        console.error("[lyrics] API returned no lyrics:", JSON.stringify(resData)?.slice(0, 300));
        return message.reply("❌ এই গানের লিরিক্স খুঁজে পাওয়া যায়নি, অন্য গান দিয়ে চেষ্টা করো!");
      }

      // Messenger rejects very long messages
      if (songLyrics.length > 15000) songLyrics = songLyrics.slice(0, 15000) + "\n...";

      const signature = `╭───────────────⬣\n│ 𝐌𝐚𝐝𝐞 𝐰𝐢𝐭𝐡 🤍 𝐛𝐲 --𝔐𝔯.𝔎𝔦𝔫𝔤\n╰───────────────⬣`;

      const output = `📜 𝐒𝐎𝐍𝐆 𝐋𝐘𝐑𝐈𝐂𝐒 🌸\n\n` +
                     `🎵 𝐓𝐢𝐭𝐥𝐞: ${songTitle}\n` +
                     `🎤 𝐀𝐫𝐭𝐢𝐬𝐭: ${artistName}\n\n` +
                     `───────────────────\n` +
                     `${songLyrics}\n` +
                     `───────────────────\n\n` +
                     signature;

      return message.reply(output);

    } catch (err) {
      console.error("[lyrics] failed:", why(err), err?.response?.data || err?.message);
      return message.reply(`❌ লিরিক্স ফেচ করতে সমস্যা হয়েছে, একটু পর আবার চেষ্টা করো! (${why(err)})`);
    }
  }
};
