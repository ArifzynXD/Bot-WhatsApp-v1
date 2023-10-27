const limit = {
   free: 15,
   premium: 150,
   VIP: "Infinity",
   download: {
      free: 50000000, // use byte
      premium: 350000000, // use byte
      VIP: 1130000000, // use byte
   }
}

module.exports = {
  sessionName: 'session',
  prefixs: ['!', '#', '/', '.'],
  owner: ['62895347198105'],
  apis: {
    velixs: {
      endpoint: "https://api.velixs.com",
      apikey: "YOUR_API_KEY"
    }
  },

  storage: __dirname + "/storage",
  database: "database.json",
  
  msg: {
    isAdmin: "_Fitur Untuk Admin Group_",
    isGroup: "_Fitur Ini hanya untuk group._",
    isOwner: "_Fitur Ini hanya untuk owner._",
    isBotAdmin: "_Bot Bukan Admin._",
  },

  react: {
    process: '⏳',
    success: '✅',
    failed: '❌' 
  },
  limit,
}
