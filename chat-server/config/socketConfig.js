
// const socketConfig = {
//   cors: {
//     origin: process.env.NODE_ENV === 'production' 
//       ? process.env.ALLOWED_ORIGINS?.split(',') || []
//       : ["http://localhost:3000", "http://localhost:8080", "http://202.131.117.213:8080"],
//     methods: ["GET", "POST"],
//     credentials: true
//   },
//   pingTimeout: 60000,
//   pingInterval: 25000,
//   upgradeTimeout: 30000,
//   allowUpgrades: true,
//   cookie: false,
//   serveClient: false,
//   transports: ['websocket', 'polling']
// };



const allowedOrigins = '*'

// const allowedOrigins = process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
const socketConfig = {
  path: '/socket/socket.io',
  cors: {
    origin: function (origin, callback) {
      const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim());
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST"],
  },
  transports: ['websocket', 'polling'],
}; 

module.exports = socketConfig;