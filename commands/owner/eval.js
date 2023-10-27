const syntaxerror = require("syntax-error");
const util = require("util")

module.exports = {
  name: "eval",
  description: "Eval",
  cmd: ["=>", ">"],
  options: {
    withoutPrefix: true,
  },
  run: async ({ m, sock }) => {
    if (!m.isOwner) return
    const arg = m.commandWithoutPrefix == ">" ? m.args.join(" ") : "return " + m.args.join(" ");
    try {
    	var txtt = util.format(await eval(`(async()=>{ ${arg} })()`));
    	sock.sendMessage(m.from, { text: txtt }, { quoted: m });
    } catch (e) {
    	let _syntax = "";
    	let _err = util.format(e);
    	let err = syntaxerror(arg, "EvalError", {
    		allowReturnOutsideFunction: true,
            allowAwaitOutsideFunction: true,
            sourceType: "module",
    	});
    	if (err) _syntax = err + "\n\n";
    	sock.sendMessage(m.from, { text: util.format(_syntax + _err) }, { quoted: m });
    } 
  },
};
