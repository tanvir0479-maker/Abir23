module.exports = {
  config: {
    name: "boxlist",
    aliases: ["gclist"],
    version: "2.0.0",
    author: "𝔐𝔯.𝔎𝔦𝔫𝔤",
    countDown: 5,
    role: 4,
    shortDescription: "List active GCs and leave specific GC",
    longDescription: "Shows the list of all group chats where the bot is currently added and allows leaving using index number like boxlist -r 1",
    category: "system",
    guide: {
      en: "{p}boxlist or {p}boxlist -r <number>"
    }
  },

  onStart: async function ({ api, event, args }) {
    try {
      const inbox = await api.getThreadList(100, null, ["INBOX"]);
      const list = inbox.filter(thread => thread.isGroup && thread.isSubscribed);

      if (list.length == 0) {
        return api.sendMessage("❌ Kono active Group Chat (GC) e bot add nei!", event.threadID, event.messageID);
      }

      const input = args[0];
      
      if (input === "-r" || input === "leave") {
        const index = parseInt(args[1]);
        if (isNaN(index) || index < 1 || index > list.length) {
          return api.sendMessage(`⚠️ Sothik GC number dao! Jemon: boxlist -r 1 (1 theke ${list.length} porjonto)`, event.threadID, event.messageID);
        }

        const targetGC = list[index - 1];
        const doneMsg = `✅ Sothikvabe GC theke leave niya hoyeche: ${targetGC.name || "Unnamed GC"}`;

        // If the bot leaves the very GC the command was sent in, it can't reply afterwards
        if (String(targetGC.threadID) === String(event.threadID)) {
          await api.sendMessage(doneMsg, event.threadID);
        }

        // removeUserFromGroup is callback-based in most FCA builds; awaiting it directly never waits/catches errors
        await new Promise((resolve, reject) => {
          const r = api.removeUserFromGroup(api.getCurrentUserID(), targetGC.threadID, err => (err ? reject(err) : resolve()));
          if (r && typeof r.then === "function") r.then(resolve, reject);
        });

        if (String(targetGC.threadID) === String(event.threadID)) return;
        return api.sendMessage(doneMsg, event.threadID, event.messageID);
      }

      let msg = "🌸 𝐀𝐋𝐈𝐘𝐀 𝐀𝐂𝐓𝐈𝐕𝐄 𝐆𝐂 𝐋𝐈𝐒𝐓 🦢\n\n";
      list.forEach((gc, i) => {
        msg += `${i + 1}. ${gc.name || "Unnamed GC"}\nID: ${gc.threadID}\n\n`;
      });
      msg += `💡 GC theke leave nite use koro: boxlist -r <number>`;

      return api.sendMessage(msg, event.threadID, event.messageID);

    } catch (err) {
      return api.sendMessage("❌ Error: " + (err.message || err), event.threadID, event.messageID);
    }
  }
};
