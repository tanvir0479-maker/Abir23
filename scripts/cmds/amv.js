const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const defaultQueries = [
  "anime 4k edit",
  "anime 4k edits",
  "anime x phonk",
  "goku aura",
  "anime aliya 4k editz",
  "anime amv 4k",
  "best anime edit"
];

module.exports = {
  config: {
    name: "amv",
    version: "2.0.0",
    author: "𝔐𝔯.𝔎𝔦𝔫𝔤",
    role: 0,
    shortDescription: "High quality anime 4K edits and AMV videos",
    longDescription: "Sends random or searched high quality 4K anime edits, phonk edits, and AMV videos.",
    category: "anime",
    guide: { en: "{p}amv [optional query]" }
  },

  onStart: async function({ api, event, args }) {
    let query = args.join(" ").trim();
    
    // If no query is provided, pick a random default query from the list
    if (!query) {
      query = defaultQueries[Math.floor(Math.random() * defaultQueries.length)];
    } else {
      // Forcefully prepend or ensure anime-related context so it stays strictly anime
      query = `anime ${query}`;
    }

    // Set waiting reaction 🏯
    api.setMessageReaction("🏯", event.messageID, () => {}, true);

    try {
      const apiURL = `https://aliyaanisr.vercel.app/api/tiktok?query=${encodeURIComponent(query)}`;
      const res = await axios.get(apiURL);

      if (!res.data || !res.data.data || !Array.isArray(res.data.data) || res.data.data.length === 0) {
        throw new Error("No anime videos found!");
      }

      const videos = res.data.data;
      const randomIndex = Math.floor(Math.random() * videos.length);
      const selectedVideo = videos[randomIndex];
      const videoURL = selectedVideo.video_url;

      if (!videoURL) throw new Error("Video link not found!");

      const buffer = (await axios.get(videoURL, { responseType: "arraybuffer" })).data;
      const filePath = path.join(__dirname, "cache", `amv_${Date.now()}.mp4`);

      await fs.ensureDir(path.dirname(filePath));
      fs.writeFileSync(filePath, Buffer.from(buffer));

      // Set video delivered reaction 🐇
      api.setMessageReaction("🐇", event.messageID, () => {}, true);

      const infoCard = 
        `╭───────────────⬣\n` +
        `│ 𝐌𝐚𝐝𝐞 𝐰𝐢𝐭𝐡 🤍 𝐛𝐲 --𝔐𝔯.𝔎𝔦𝔫𝔤\n` +
        `╰───────────────⬣`;

      api.sendMessage(
        { body: infoCard, attachment: fs.createReadStream(filePath) },
        event.threadID,
        () => fs.unlinkSync(filePath),
        event.messageID
      );

    } catch (error) {
      console.error("AMV Error:", error.message);
      api.setMessageReaction("❌", event.messageID, () => {}, true);
      api.sendMessage("❌ Failed to fetch anime video, please try again!", event.threadID, event.messageID);
    }
  }
};
        
