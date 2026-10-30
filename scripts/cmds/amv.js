const axios = require("axios");

module.exports = {
  config: {
    name: "amv",
    aliases: ["animeamv", "amvedit"],
    version: "1.0.2",
    author: "𝔐𝔯.𝔎𝔦𝔫𝔤",
    countDown: 5,
    role: 0,
    shortDescription: "Random Anime AMV video stream",
    category: "anime",
    guide: { en: "{p}amv" }
  },

  onStart: async function ({ message, api, event }) {
    try {
      if (api && typeof api.sendTypingIndicator === "function") {
        api.sendTypingIndicator(event.threadID, () => {});
      }

      const res = await axios.get("https://azadx69x.is-a.dev/api/amv");
      const resData = res?.data;

      if (!resData || !resData.success || !resData.data) {
        return message.reply("❌ Failed to fetch AMV data!");
      }

      const info = resData.data;
      const videoUrl = info.directUrl || info.embedUrl || info.youtube;

      if (!videoUrl) {
        return message.reply("❌ Video stream not found!");
      }

      const caption = `╭───────────────⬣\n│ 𝐌𝐚𝐝𝐞 𝐰𝐢𝐭𝐡 🤍 𝐛𝐲 --𝔐𝔯.𝔎𝔦𝔫𝔤\n╰───────────────⬣`;

      return message.reply({
        body: caption,
        attachment: await global.utils.getStreamFromURL(videoUrl)
      });

    } catch (err) {
      console.error("AMV Command Error:", err?.response?.data || err.message);
      return message.reply("❌ An error occurred on the server!");
    }
  }
};
    
