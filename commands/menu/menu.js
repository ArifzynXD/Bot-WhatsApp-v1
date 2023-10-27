const { menuByLabel } = require("../../app/func/loadCommands.js");
const { react } = require("../../config.js");
const Message = require("../../app/func/Message.js");

module.exports = {
  name: "menu",
  description: "this bot menu",
  cmd: ["help", "menu"],
  run: async ({ m, sock }) => {
    const message = new Message({ m, sock });
    message.react(react.process);
    
    const user = db.users[m.sender]
    
    let text = "";
    text += `*Hai, ${m.pushName}.*\n\n`;
    text += `  • *Limit :* ${user.limit}\n`
    text += `  • *VIP :* ${user.vip ? "Yes" : "No"}\n`
    text += `  • *Premium :* ${user.premium ? "Yes" : "No"}\n`
    text += `  • *Status :* ${m.isOwner ? "owner" : "user"}\n`
    menuByLabel.forEach((val, key) => { 
      text += `\n*${key.toUpperCase()}*\n`; 
      val.forEach((v) => {  
        text += `• ${m.prefix + v.cmd[0]}\n`;
      });
    });
    
    text += `_Copyright © 2023 Arifzyn_`; 

    await message.react(react.success);
    await sock.sendMessage(m.from, { text: text }, { quoted: m }).catch(() => {
      message.react(react.failed);
    });
  },
};
