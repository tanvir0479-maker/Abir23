const axios = require("axios");
module.exports = {
config: {
name: "fork",
version: "2.0.0",
author: "Mr.king x Aliya",
countDown: 5,
role: 0,
shortDescription: "Get Aliya Bot v4 Repository Link",
longDescription: "Sends the official GitHub repository and git clone instructions for Aliya Bot v4 with an image",
category: "system",
guide: {
en: "{p}fork"
}
},
onStart: async function ({ message, event }) {
const imageUrl = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS4Bajq7KeozS19EhsrKZXtn9MxZoTSyE0TxcaByeRNew&s=10";
const textMessage =
`𓍢ִ໋🌸✧ ── ͟͟͞͞𝗔𝗹𝗶𝘆𝗮 𝘃𝟰 𝗦𝗼𝘂𝗿𝗰𝗲 𝗖𝗼𝗱𝗲 & 𝗚𝗶𝘁 𝗚𝘂𝗶𝗱𝗲 ── ✧🌸𓍢ִ໋🌷͙֒
ᥫ᭡ 𝗥𝗲𝗽𝗼𝘀𝗶𝘁𝗼𝗿𝘆 : 𝗔𝗹𝗶𝘆𝗮-𝗢𝗳𝗳𝗶𝗰𝗶𝗮𝗹-𝗩𝟰-𝗽𝗲𝗿𝘀𝗼𝗻𝗮𝗹
ᥫ᭡ 𝗢𝘄𝗻𝗲𝗿 / 𝗗𝗲𝘃 : 𝗠𝗿.𝗸𝗶𝗻𝗴
🌸 𝗚𝗶𝘁𝗛𝘂𝗯 𝗟𝗶𝗻𝗸 :
🔗 https://github.com/mrking-svg/Aliya-Official-V4-personal.git
🦢 𝗛𝗼𝘄 𝘁𝗼 𝗨𝘀𝗲 (𝗚𝗶𝘁 𝗖𝗹𝗼𝗻𝗲 & 𝗦𝗲𝘁𝘂𝗽) :
𝟭. Termux ba terminal-e giye niche command dao:
\`git clone https://github.com/mrking-svg/Aliya-Official-V4-personal.git\`
𝟮. Folder-e entry karo:
\`cd Aliya-Official-V4-personal\`
𝟯. Dependencies install karo:
\`npm install\`
𝟰. Bot start karo:
\`node index.js\`
✧─────── ͟͟͞͞𝗔𝗹𝗶𝘆𝗮 𝗕𝗼𝘁 𝗦𝘆𝘀𝘁𝗲𝗺 ───────✧`;
try {
const imageStream = (await axios.get(imageUrl, { responseType: "stream" })).data;
return message.reply({
body: textMessage,
attachment: imageStream
});
} catch (error) {
return message.reply(textMessage);
}
}
};
