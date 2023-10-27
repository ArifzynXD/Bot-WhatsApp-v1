const { exec } = require("child_process")
const util = require("util")

module.exports = {
  name: "exec",
  description: "Exec",
  cmd: ["$"],
  options: {
    withoutPrefix: true,
  },
  run: async ({ m, sock }) => {
    if (!m.isOwner) return
    try {
    	exec(m.args.join(" "), function (er, st) {
    		if (er) m.reply(util.format(er.toString().replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,"")));
            if (st) m.reply(util.format(st.toString().replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,"")));
        })      
    } catch (e) {
    	console.log(e);
    }
  },
};
