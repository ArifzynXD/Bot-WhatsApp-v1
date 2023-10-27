const {
  default: makeWASocket,
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  WASocket,
  makeInMemoryStore,
  jidDecode,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");
const log = require("../func/log.js");
const { Client } = require("../func/velixs.serialize.js");
const sessions = new Map();
const path = require("path")
const retryCount = new Map();
const chalk = require("chalk")
const Database = require("../database/database")

const database = new Database()

const credentials = {
  dir: "./storage/wa_credentials/",
  prefix: "_credentials",
};

function nocache(module, cb = () => {}) {
  fs.watchFile(require.resolve(module), async () => {
    await uncache(require.resolve(module))
    cb(module)
  })
}

function uncache(module = '.') {
  return new Promise((resolve, reject) => {
  	try {
  		delete require.cache[require.resolve(module)]
  		resolve()
      } catch (e) {
      	reject(e)
      }
  })
}

const startSession = async (sessionId = "ilsya") => {
  if (isSessionExistAndRunning(sessionId)) return getSession(sessionId);

  const content = await database.read()
   if (content && Object.keys(content).length === 0) {
      global.db = {
         users: {},
         groups: {},
         ...(content || {}),
      }
      await database.write(global.db)
   } else {
      global.db = content
   }

  const { version } = await fetchLatestBaileysVersion();
  const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) })
  // store.readFromFile(credentials.dir+sessionId+credentials.prefix+'/baileys_store.json')
  // store.writeToFile(credentials.dir+sessionId+credentials.prefix+'/baileys_store.json')
  const startSocket = async () => {
    const { state, saveCreds } = await useMultiFileAuthState(
      credentials.dir + sessionId + credentials.prefix,
    );
    const sock = makeWASocket({
      version,
      printQRInTerminal: true,
      auth: state,
      logger: pino({ level: "silent" }),
      markOnlineOnConnect: false,
      browser: ["VelixS", "Safari", "3.0"],
    });
    
    store.bind(sock.ev)
    
    sessions.set(sessionId, { ...sock });

    try {
      sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection == "connecting") {
          log.debug(`SESSION : ${sessionId} Conecting.`);
        }
        if (connection === "close") {
          const code =
            lastDisconnect?.error?.output?.statusCode ||
            lastDisconnect?.error?.output?.payload?.statusCode;

          let retryAttempt = retryCount.get(sessionId) ?? 0;
          let shouldRetry;
          if (code != DisconnectReason.loggedOut && retryAttempt < 10) {
            shouldRetry = true;
          }
          if (shouldRetry) {
            retryAttempt++;
          }
          if (shouldRetry) {
            retryCount.set(sessionId, retryAttempt);
            startSocket();
          } else {
            log.error(`SESSION : ${sessionId} Disconnected.`);
            retryCount.delete(sessionId);
            deleteSession(sessionId);
          } 
        }
        if (connection == "open") {
          log.info(`SESSION : ${sessionId} Connected.`);
          retryCount.delete(sessionId);
        }
      });
      sock.ev.on("creds.update", async () => {
        await saveCreds();
      });
    } catch (e) {
      log.error("SOCKET : " + e);
    }
    
    await Client(sock, store)
    
    global.command = {}
    const cmdFolder = path.join(__dirname, "../../commands")
    const fitur = fs.readdirSync(cmdFolder)
    fitur.forEach(async (res) => {
    	const Arifzyn = fs.readdirSync(cmdFolder + "/" + res).filter((file) => file.endsWith(".js"))
    	for (let filename of Arifzyn) {
    		try {
    			const filePath = path.resolve(cmdFolder, res, filename);
    			
    			global.command[filename] = require(filePath);
    			
    			fs.watch(filePath, (event, filename) => {
    				if (event === 'change') {
    					console.log(`File changed. Restarting command: ${filename}`);
    					delete require.cache[require.resolve(filePath)];
    					global.command[filename] = require(filePath);
                    }
               })
    		} catch (e) {
    			console.error(`Command Error in ${filename}:`, error);
    			delete global.command[filename];
    		}
    	}
    })
    
    setInterval(async () => {
      if (global.db) await database.write(global.db)
   }, 30000)

    return sock;
  };

  return startSocket();
};

const getSession = (sessionId = "ilsya") => {
  return sessions.get(sessionId);
};

const isSessionExistAndRunning = (sessionId) => {
  if (
    fs.existsSync(credentials.dir) &&
    fs.existsSync(credentials.dir + sessionId + credentials.prefix) &&
    fs.readdirSync(credentials.dir + sessionId + credentials.prefix).length &&
    getSession(sessionId)
  ) {
    return true;
  }
  return false;
};

const shouldLoadSession = (sessionId) => {
  if (
    fs.existsSync(credentials.dir) &&
    fs.existsSync(credentials.dir + sessionId + credentials.prefix) &&
    fs.readdirSync(credentials.dir + sessionId + credentials.prefix).length &&
    !getSession(sessionId)
  ) {
    return true;
  }
  return false;
};

const loadSessionsFromStorage = async () => {
  if (!fs.existsSync(credentials.dir)) {
    fs.mkdirSync(credentials.dir);
  }
  fs.readdir(credentials.dir, async (err, dirs) => {
    if (err) {
      throw err;
    }
    for (const dir of dirs) {
      const sessionId = dir.split("_")[0];
      if (!shouldLoadSession(sessionId)) continue;
      startSession(sessionId);
    }
  });
};

const deleteSession = async (sessionId = "ilsya") => {
  const session = getSession(sessionId);
  try {
    await session?.logout();
  } catch {}
  session?.end(undefined);
  sessions.delete(sessionId);
  if (fs.existsSync(credentials.dir + sessionId + credentials.prefix)) {
    fs.rmSync(credentials.dir + sessionId + credentials.prefix, {
      force: true,
      recursive: true,
    });
  }
};

module.exports = {
  startSession,
  getSession,
  loadSessionsFromStorage,
};
