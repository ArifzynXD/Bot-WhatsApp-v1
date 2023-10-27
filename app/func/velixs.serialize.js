const {
  extractMessageContent,
  jidNormalizedUser,
  proto,
  jidDecode,
} = require("@whiskeysockets/baileys");
const { prefixs } = require("../../config.js");

function getTypeMessage(message) {
  const type = Object.keys(message);
  var restype =
    (!["senderKeyDistributionMessage", "messageContextInfo"].includes(
      type[0],
    ) &&
      type[0]) || // Sometimes message in the front
    (type.length >= 3 && type[1] !== "messageContextInfo" && type[1]) || // Sometimes message in midle if mtype length is greater than or equal to 3
    type[type.length - 1] ||
    Object.keys(message)[0]; // common case
  return restype;
}

function decodeJid(jid) {
  if (!jid) return jid;  
  if (/:\d+@/gi.test(jid)) {
    let decode = jidDecode(jid) || {};
    return (
      (decode.user && decode.server && decode.user + "@" + decode.server) || jid
    );
  } else return jid;
}

exports.Client = async (conn, store) => {
	delete store.groupMetadata

   // Combining Store to Client
   for (let v in store) {
      conn[v] = store[v]
   }

   const client = Object.defineProperties(conn, {
      getContentType: {
         value(content) {
            if (content) {
               const keys = Object.keys(content);
               const key = keys.find(k => (k === 'conversation' || k.endsWith('Message') || k.endsWith('V2') || k.endsWith('V3')) && k !== 'senderKeyDistributionMessage');
               return key
            }
         },
         enumerable: true
      },

      decodeJid: {
         value(jid) {
            if (/:\d+@/gi.test(jid)) {
               const decode = jidNormalizedUser(jid);
               return decode
            } else return jid;
         }
      },

      generateMessageID: {
         value(id = "3EB0", length = 18) {
            return id + Crypto.randomBytes(length).toString('hex').toUpperCase()
         }
      },

      getName: {
         value(jid) {
            let id = conn.decodeJid(jid)
            let v
            if (id?.endsWith("@g.us")) return new Promise(async (resolve) => {
               v = conn.contacts[id] || conn.messages["status@broadcast"]?.array?.find(a => a?.key?.participant === id)
               if (!(v.name || v.subject)) v = conn.groupMetadata[id] || {}
               resolve(v?.name || v?.subject || v?.pushName || (parsePhoneNumber('+' + id.replace("@g.us", "")).format("INTERNATIONAL")))
            })
            else v = id === "0@s.whatsapp.net" ? {
               id,
               name: "WhatsApp"
            } : id === conn.decodeJid(conn?.user?.id) ?
               conn.user : (conn.contacts[id] || {})
            return (v?.name || v?.subject || v?.pushName || v?.verifiedName || (parsePhoneNumber('+' + id.replace("@s.whatsapp.net", "")).format("INTERNATIONAL")))
         }
      },

      sendContact: {
         async value(jid, number, quoted, options = {}) {
            let list = []
            for (let v of number) {
               list.push({
                  displayName: await conn.getName(v),
                  vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${await conn.getName(v + "@s.whatsapp.net")}\nFN:${await conn.getName(v + "@s.whatsapp.net")}\nitem1.TEL;waid=${v}:${v}\nitem1.X-ABLabel:Ponsel\nitem2.EMAIL;type=INTERNET:${config.Exif.packEmail}\nitem2.X-ABLabel:Email\nitem3.URL:${config.Exif.packWebsite}\nitem3.X-ABLabel:Instagram\nitem4.ADR:;;Indonesia;;;;\nitem4.X-ABLabel:Region\nEND:VCARD`
               })
            }
            return conn.sendMessage(jid, {
               contacts: {
                  displayName: `${list.length} Contact`,
                  contacts: list
               },
               mentions: quoted?.participant ? [conn.decodeJid(quoted?.participant)] : [conn.decodeJid(conn?.user?.id)],
               ...options
            }, { quoted, ...options })
         },
         enumerable: true
      },

      parseMention: {
         value(text) {
            return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map(v => v[1] + '@s.whatsapp.net') || []
         }
      },

      downloadMediaMessage: {
         async value(message, filename) {
            let mime = {
               imageMessage: "image",
               videoMessage: "video",
               stickerMessage: "sticker",
               documentMessage: "document",
               audioMessage: "audio",
               ptvMessage: "video"
            }[message.type]

            if ('thumbnailDirectPath' in message.msg && !('url' in message.msg)) {
               message = {
                  directPath: message.msg.thumbnailDirectPath,
                  mediaKey: message.msg.mediaKey
               };
               mime = 'thumbnail-link'
            } else {
               message = message.msg
            }

            return await toBuffer(await downloadContentFromMessage(message, mime))
         },
         enumerable: true
      },

      sendMedia: {
         async value(jid, url, quoted = "", options = {}) {
            let { mime, data: buffer, ext, size } = await Function.getFile(url)
            mime = options?.mimetype ? options.mimetype : mime
            let data = { text: "" }, mimetype = /audio/i.test(mime) ? "audio/mpeg" : mime
            if (size > 45000000) data = { document: buffer, mimetype: mime, fileName: options?.fileName ? options.fileName : `${conn.user?.name} (${new Date()}).${ext}`, ...options }
            else if (options.asDocument) data = { document: buffer, mimetype: mime, fileName: options?.fileName ? options.fileName : `${conn.user?.name} (${new Date()}).${ext}`, ...options }
            else if (options.asSticker || /webp/.test(mime)) {
               let pathFile = await writeExif({ mimetype, data: buffer }, { ...options })
               data = { sticker: fs.readFileSync(pathFile), mimetype: "image/webp", ...options }
               fs.existsSync(pathFile) ? await fs.promises.unlink(pathFile) : ""
            }
            else if (/image/.test(mime)) data = { image: buffer, mimetype: options?.mimetype ? options.mimetype : 'image/png', ...options }
            else if (/video/.test(mime)) data = { video: buffer, mimetype: options?.mimetype ? options.mimetype : 'video/mp4', ...options }
            else if (/audio/.test(mime)) data = { audio: buffer, mimetype: options?.mimetype ? options.mimetype : 'audio/mpeg', ...options }
            else data = { document: buffer, mimetype: mime, ...options }
            let msg = await conn.sendMessage(jid, data, { quoted, ...options })
            return msg
         },
         enumerable: true
      },

      cMod: {
         value(jid, copy, text = '', sender = conn.user.id, options = {}) {
            let mtype = conn.getContentType(copy.message)
            let content = copy.message[mtype]
            if (typeof content === "string") copy.message[mtype] = text || content
            else if (content.caption) content.caption = text || content.text
            else if (content.text) content.text = text || content.text
            if (typeof content !== "string") {
               copy.message[mtype] = { ...content, ...options }
               copy.message[mtype].contextInfo = {
                  ...(content.contextInfo || {}),
                  mentionedJid: options.mentions || content.contextInfo?.mentionedJid || []
               }
            }
            if (copy.key.participant) sender = copy.key.participant = sender || copy.key.participant
            if (copy.key.remoteJid.includes("@s.whatsapp.net")) sender = sender || copy.key.remoteJid
            else if (copy.key.remoteJid.includes("@broadcast")) sender = sender || copy.key.remoteJid
            copy.key.remoteJid = jid
            copy.key.fromMe = areJidsSameUser(sender, conn.user.id)
            return proto.WebMessageInfo.fromObject(copy)
         }
      },

      sendPoll: {
         async value(chatId, name, values, options = {}) {
            let selectableCount = options?.selectableCount ? options.selectableCount : 1
            return await conn.sendMessage(chatId, {
               poll: {
                  name,
                  values,
                  selectableCount
               },
               ...options
            }, { ...options })
         },
         enumerable: true
      },

      setProfilePicture: {
         async value(jid, media, type = "full") {
            let { data } = await Function.getFile(media)
            if (/full/i.test(type)) {
               data = await Function.resizeImage(media, 720)
               await conn.query({
                  tag: 'iq',
                  attrs: {
                     to: await conn.decodeJid(jid),
                     type: 'set',
                     xmlns: 'w:profile:picture'
                  },
                  content: [{
                     tag: 'picture',
                     attrs: { type: 'image' },
                     content: data
                  }]
               })
            } else {
               data = await Function.resizeImage(media, 640)
               await conn.query({
                  tag: 'iq',
                  attrs: {
                     to: await conn.decodeJid(jid),
                     type: 'set',
                     xmlns: 'w:profile:picture'
                  },
                  content: [{
                     tag: 'picture',
                     attrs: { type: 'image' },
                     content: data
                  }]
               })
            }
         },
         enumerable: true
      },

      sendGroupV4Invite: {
         async value(jid, groupJid, inviteCode, inviteExpiration, groupName, jpegThumbnail, caption = "Invitation to join my WhatsApp Group", options = {}) {
            const media = await prepareWAMessageMedia({ image: (await Function.getFile(jpegThumbnail)).data }, { upload: conn.waUploadToServer })
            const message = proto.Message.fromObject({
               groupJid,
               inviteCode,
               inviteExpiration: inviteExpiration ? parseInt(inviteExpiration) : +new Date(new Date() + (3 * 86400000)),
               groupName,
               jpegThumbnail: media.imageMessage?.jpegThumbnail || jpegThumbnail,
               caption
            })

            const m = generateWAMessageFromContent(jid, message, { userJid: conn.user?.id })
            await conn.relayMessage(jid, m.message, { messageId: m.key.id })

            return m
         },
         enumerable: true
      }
   })

   return conn
}

exports.serialize = (conn, m, options = {}) => {
  if (!m) return m;
  let M = proto.WebMessageInfo;
  m = M.fromObject(m);
  if (m.key) {
    m.from = jidNormalizedUser(m.key.remoteJid || m.key.participant);
    m.fromMe = m.key.fromMe;
    m.id = m.key.id;
    m.isBot = m.id.startsWith("BAE5") && m.id.length == 16;
    m.botNumber = jidNormalizedUser(conn.user?.id);
    m.isGroup = m.from.endsWith("@g.us");
    m.sender = jidNormalizedUser(
      (m.fromMe && conn.user?.id) || m.key.participant || m.from || "",
    );
  }
  if (m.message) {
    m.type = getTypeMessage(m.message);
    m.msg =
      m.type == "viewOnceMessage"
        ? m.message[m.type].message[getTypeMessage(m.message[m.type].message)]
        : m.message[m.type];
    m.message = extractMessageContent(m.message);
    m.mentions = m.msg?.contextInfo ? m.msg?.contextInfo.mentionedJid : [];
    m.quoted = m.msg?.contextInfo ? m.msg?.contextInfo.quotedMessage : null;
    if (m.quoted) {
      m.quoted.type = getTypeMessage(m.quoted);
      m.quoted.msg = m.quoted[m.quoted.type];
      m.quoted.mentions = m.msg.contextInfo.mentionedJid;
      m.quoted.id = m.msg.contextInfo.stanzaId;
      m.quoted.sender = jidNormalizedUser(
        m.msg.contextInfo.participant || m.sender,
      );
      m.quoted.from = m.from;
      m.quoted.isGroup = m.quoted.from.endsWith("@g.us");
      m.quoted.isBot = m.quoted.id.startsWith("BAE5") && m.quoted.id == 16;
      m.quoted.fromMe =
        m.quoted.sender == jidNormalizedUser(conn.user && conn.user?.id);
      m.quoted.text =
        m.quoted.msg?.text ||
        m.quoted.msg?.caption ||
        m.quoted.msg?.conversation ||
        m.quoted.msg?.contentText ||
        m.quoted.msg?.selectedDisplayText ||
        m.quoted.msg?.title ||
        "";
      let vM = (m.quoted.fakeObj = M.fromObject({
        key: {
          remoteJid: m.quoted.from,
          fromMe: m.quoted.fromMe,
          id: m.quoted.id,
        },
        message: m.quoted,
        ...(m.quoted.isGroup ? { participant: m.quoted.sender } : {}),
      }));
      m.quoted.delete = () =>
        conn.sendMessage(m.quoted.from, { delete: vM.key });
    }
  }
  m.body =
    m.message?.conversation ||
    m.message?.[m.type]?.text ||
    m.message?.[m.type]?.caption ||
    m.message?.[m.type]?.contentText ||
    m.message?.[m.type]?.selectedDisplayText ||
    m.message?.[m.type]?.title ||
    "";
  m.commandWithPrefix = m.body.split(/ +/).slice(0)[0];
  m.commandWithoutPrefix = prefixs.some((prefix) =>
    m.commandWithPrefix.startsWith(prefix),
  )
    ? m.commandWithPrefix.slice(1)
    : m.commandWithPrefix;
  m.withPrefix =
    prefixs.filter((prefix) => m.body.startsWith(prefix))[0] ?? null;
  m.prefix =
    prefixs.filter((prefix) => m.body.startsWith(prefix))[0] ?? prefixs[0];
  // m.args = message.split(" ").slice(1).filter(arg => { return arg.trim() !== '' })
  m.args = m.body.split(/ +/).slice(1);
  m.arg = m.body.slice(m.commandWithPrefix.length + 1);

  m.reply = (text) => {
    return conn.sendMessage(m.from, { text }, { quoted: m });
  };
  return m;
};
