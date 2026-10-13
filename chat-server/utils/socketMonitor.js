// Socket connection monitoring.
//
// Records every stage of a user's chat connection (engine errors, auth
// rejections, connect/upgrade/disconnect, handler errors, slow handlers,
// client-side reports) so a complaint like "chat keeps loading" can be traced
// to a concrete cause for that specific user.
//
// Storage:
//   - logs/<date>/socket-monitor/*.log   one JSON line per event (file, full history)
//   - Redis sockmon:user:<id>             per-user timeline (last USER_TRAIL_LEN, 7 days)
//   - Redis sockmon:cs:<clientSession>    per-browser-tab timeline when no user id is known
//   - Redis sockmon:events                global feed of important events (last GLOBAL_LEN)
//   - Redis sockmon:stats:<YYYY-MM-DD>    counters per event type / reason (30 days)
//   - Redis sockmon:health                event-loop lag / memory / socket count every minute (24h)

const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const { monitorEventLoopDelay } = require('perf_hooks');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const redis = require('../config/reddis');
const { getLogger } = require('./logger');

const log = getLogger('socket-monitor');
const als = new AsyncLocalStorage();

const INSTANCE = process.env.NODE_APP_INSTANCE ?? process.env.pm_id ?? '0';
const PID = process.pid;

const USER_TRAIL_LEN = 300;
const GLOBAL_LEN = 5000;
const HEALTH_LEN = 1440;
const USER_TTL_SEC = 7 * 24 * 3600;
const STATS_TTL_SEC = 30 * 24 * 3600;
const SLOW_HANDLER_MS = 3000;
const TRAIL_TIMING_MS = 1000;
const STALL_MS = 1000;

// High-frequency events that would flood the per-user trail
const NOISY_EVENTS = new Set(['typing', 'support-typing', 'user-typing', 'support-user-typing', 'online-users']);
const RESERVED_EVENTS = new Set(['disconnect', 'disconnecting', 'error', 'connect', 'connect_error']);

const ENGINE_ERROR_NAMES = {
  0: 'TRANSPORT_UNKNOWN',
  1: 'SESSION_ID_UNKNOWN', // usually: server restarted mid-session or requests hit a different instance
  2: 'BAD_HANDSHAKE_METHOD',
  3: 'BAD_REQUEST',
  4: 'FORBIDDEN',
  5: 'UNSUPPORTED_PROTOCOL_VERSION',
};

const istDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const truncate = (value, max = 500) => {
  if (value === undefined || value === null) return value;
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return str.length > max ? `${str.slice(0, max)}…` : str;
};

const errorToObject = (err) => {
  if (!err) return undefined;
  if (err instanceof Error) {
    return { name: err.name, message: truncate(err.message), code: err.code, stack: truncate(err.stack, 1500) };
  }
  return truncate(err);
};

const getClientInfo = (req) => {
  if (!req) return {};
  const headers = req.headers || {};
  let query = req._query;
  if (!query && req.url) {
    try {
      query = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    } catch {
      query = {};
    }
  }
  query = query || {};
  const forwarded = (headers['x-forwarded-for'] || '').split(',')[0].trim();
  return {
    ip: forwarded || headers['x-real-ip'] || req.socket?.remoteAddress || req.connection?.remoteAddress,
    ua: truncate(headers['user-agent'], 300),
    origin: headers.origin,
    transport: query.transport,
    cs: typeof query.cs === 'string' ? query.cs.slice(0, 64) : undefined,
  };
};

// Identify who a request belongs to WITHOUT verifying the token. Only used to
// label monitoring events — never for authorization.
const identify = (cookieHeader) => {
  const cookies = cookieHeader ? cookie.parse(cookieHeader) : {};
  const result = {
    hasCookieHeader: Boolean(cookieHeader),
    cookieNames: Object.keys(cookies),
    hasAccessCookie: Boolean(cookies.AccessToken && cookies.AccessToken !== 'null' && cookies.AccessToken !== 'undefined'),
    hasRefreshCookie: Boolean(cookies.RefreshToken),
  };
  for (const [name, source] of [['AccessToken', 'access'], ['RefreshToken', 'refresh']]) {
    const decoded = cookies[name] ? jwt.decode(cookies[name]) : null;
    if (decoded?.user_id) {
      result.userId = decoded.user_id;
      result.role = decoded.role;
      result.idSource = source;
      if (decoded.exp) result[`${source}Exp`] = new Date(decoded.exp * 1000).toISOString();
      break;
    }
  }
  return result;
};

const toRedis = (entry, { global, trail }) => {
  if (!redis.isReady) return;
  const line = JSON.stringify(entry);
  const multi = redis.multi();
  if (global) {
    multi.lPush('sockmon:events', line);
    multi.lTrim('sockmon:events', 0, GLOBAL_LEN - 1);
    const statsKey = `sockmon:stats:${istDay()}`;
    multi.hIncrBy(statsKey, entry.code ? `${entry.type}:${entry.code}` : entry.type, 1);
    multi.expire(statsKey, STATS_TTL_SEC);
  }
  if (trail) {
    const owners = [];
    if (entry.userId) owners.push(`sockmon:user:${entry.userId}`);
    if (entry.cs) owners.push(`sockmon:cs:${entry.cs}`);
    for (const key of owners) {
      multi.lPush(key, line);
      multi.lTrim(key, 0, USER_TRAIL_LEN - 1);
      multi.expire(key, USER_TTL_SEC);
    }
  }
  multi.exec().catch((err) => log.warn(`sockmon redis write failed: ${err.message}`));
};

/**
 * Record a monitoring event.
 * @param {string} type    event type, e.g. 'auth_rejected'
 * @param {object} data    context; include userId and/or cs so it lands in a timeline
 * @param {object} opts    level: winston level; global: include in global feed + stats;
 *                         file: false keeps high-volume trail events out of log files/stdout
 */
const record = (type, data = {}, { level = 'info', global = true, trail = true, file = true } = {}) => {
  try {
    const entry = { t: new Date().toISOString(), type, inst: INSTANCE, pid: PID, ...data };
    if (file) log[level](JSON.stringify(entry));
    toRedis(entry, { global, trail });
  } catch (err) {
    log.error(`sockmon record failed: ${err.message}`);
  }
};

// ---------- Auth middleware helpers ----------

const recordAuth = (socket, type, data = {}, level = 'warn') => {
  const req = socket.request;
  record(type, { ...getClientInfo(req), ...identify(req?.headers?.cookie), ...data }, { level });
};

// ---------- console.error capture inside socket handlers ----------

let lastUncontextedError = { msg: null, at: 0 };
const originalConsoleError = console.error;
console.error = (...args) => {
  originalConsoleError(...args);
  try {
    const message = truncate(
      args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}\n${a.stack}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' '),
      2000,
    );
    const ctx = als.getStore();
    if (ctx) {
      record('handler_error', { userId: ctx.userId, role: ctx.role, sid: ctx.sid, cs: ctx.cs, event: ctx.event, message }, { level: 'error' });
      return;
    }
    // Errors outside a socket context (Redis/DB reconnect loops etc.): file only, throttled
    const now = Date.now();
    if (message !== lastUncontextedError.msg || now - lastUncontextedError.at > 10000) {
      lastUncontextedError = { msg: message, at: now };
      log.error(JSON.stringify({ t: new Date().toISOString(), type: 'process_console_error', inst: INSTANCE, pid: PID, message }));
    }
  } catch {
    // never let monitoring break logging
  }
};

/**
 * Run fn inside a monitoring context for this socket, recording duration and
 * any console.error calls it makes. Used for the post-connect setup in chat.js.
 */
const track = (socket, event, fn) => {
  const ctx = { ...socketBase(socket), event, startedAt: Date.now() };
  return als.run(ctx, async () => {
    try {
      return await fn();
    } finally {
      const ms = Date.now() - ctx.startedAt;
      record(`${event}_done`, { ...socketBase(socket), ms }, { level: ms > SLOW_HANDLER_MS ? 'warn' : 'debug', global: ms > SLOW_HANDLER_MS });
    }
  });
};

const socketBase = (socket) => ({
  userId: socket.user?.user_id,
  role: socket.user?.role,
  sid: socket.id,
  cs: socket.data?.cs,
});

// ---------- Attach to socket.io ----------

const attachSocketMonitor = (io) => {
  record('server_start', { node: process.version }, { level: 'warn', trail: false });

  io.engine.on('connection_error', (err) => {
    const req = err.req;
    record(
      'engine_error',
      {
        code: ENGINE_ERROR_NAMES[err.code] || String(err.code),
        message: err.message,
        context: truncate(err.context, 300),
        url: truncate(req?.url, 200),
        ...getClientInfo(req),
        ...identify(req?.headers?.cookie),
      },
      { level: 'warn' },
    );
  });

  io.on('connection', (socket) => {
    const connectedAt = Date.now();
    const info = getClientInfo(socket.request);
    socket.data.cs = info.cs;
    const base = socketBase(socket);

    record('connected', {
      ...base,
      ip: info.ip,
      ua: info.ua,
      origin: info.origin,
      transport: socket.conn.transport.name,
      totalSockets: io.engine.clientsCount,
    });

    socket.conn.once('upgrade', (transport) => {
      record('upgraded', { ...base, transport: transport.name, afterMs: Date.now() - connectedAt }, { level: 'debug', global: false });
    });

    socket.conn.on('close', (reason, description) => {
      // Engine-level close (fires before socket 'disconnect') — keeps the low-level detail
      if (reason !== 'forced close' && reason !== 'server shutting down') {
        record('transport_closed', { ...base, reason, detail: truncate(errorToObject(description), 300) }, { level: 'debug', global: false });
      }
    });

    socket.on('disconnect', (reason, description) => {
      record('disconnected', {
        ...base,
        reason,
        detail: truncate(errorToObject(description), 300),
        durationMs: Date.now() - connectedAt,
      });
    });

    // Trail of every incoming event (start), with timing + errors via ALS
    const originalOn = socket.on.bind(socket);
    socket.on = (event, handler) => {
      if (typeof handler !== 'function' || RESERVED_EVENTS.has(event)) return originalOn(event, handler);
      return originalOn(event, function monitoredHandler(...args) {
        const ctx = { ...base, event, startedAt: Date.now() };
        if (!NOISY_EVENTS.has(event)) record('in', { ...base, event }, { level: 'debug', global: false, file: false });
        return als.run(ctx, () => {
          const finish = () => {
            const ms = Date.now() - ctx.startedAt;
            if (ms > SLOW_HANDLER_MS) record('slow_handler', { ...base, event, ms }, { level: 'warn' });
            else if (ms > TRAIL_TIMING_MS) record('handled', { ...base, event, ms }, { level: 'debug', global: false });
          };
          let result;
          try {
            result = handler.apply(this, args);
          } catch (err) {
            record('handler_threw', { ...base, event, error: errorToObject(err) }, { level: 'error' });
            throw err;
          }
          if (result && typeof result.then === 'function') {
            result.then(finish, (err) => {
              record('handler_rejected', { ...base, event, error: errorToObject(err) }, { level: 'error' });
              throw err; // preserve existing unhandledRejection behaviour
            });
          } else {
            finish();
          }
          return result;
        });
      });
    };

    // Trail of every outgoing event, and every 'error' sent to the client
    const originalEmit = socket.emit.bind(socket);
    socket.emit = (event, ...args) => {
      try {
        const ctx = als.getStore();
        if (event === 'error') {
          record('server_error_emit', { ...base, message: truncate(args[0]?.message || args[0]), during: ctx?.event }, { level: 'warn' });
        } else if (!NOISY_EVENTS.has(event)) {
          record('out', { ...base, event, during: ctx?.event }, { level: 'debug', global: false, file: false });
        }
      } catch {
        // ignore
      }
      return originalEmit(event, ...args);
    };
  });

  // Server health: event-loop lag stalls make every user's chat "keep loading"
  const loopDelay = monitorEventLoopDelay({ resolution: 20 });
  loopDelay.enable();
  const healthTimer = setInterval(() => {
    const mem = process.memoryUsage();
    const snapshot = {
      t: new Date().toISOString(),
      inst: INSTANCE,
      pid: PID,
      sockets: io.engine.clientsCount,
      lagP99Ms: Math.round(loopDelay.percentile(99) / 1e6),
      lagMaxMs: Math.round(loopDelay.max / 1e6),
      rssMb: Math.round(mem.rss / 1048576),
      heapMb: Math.round(mem.heapUsed / 1048576),
      redisReady: redis.isReady,
    };
    loopDelay.reset();
    log.debug(JSON.stringify({ type: 'health', ...snapshot }));
    if (snapshot.lagMaxMs > STALL_MS) record('event_loop_stall', snapshot, { level: 'warn', trail: false });
    if (redis.isReady) {
      redis
        .multi()
        .lPush('sockmon:health', JSON.stringify(snapshot))
        .lTrim('sockmon:health', 0, HEALTH_LEN - 1)
        .exec()
        .catch(() => {});
    }
  }, 60000);
  healthTimer.unref();
};

// ---------- HTTP endpoints ----------

const reportBuckets = new Map();
const REPORT_LIMIT_PER_MIN = 60;
const allowReport = (ip) => {
  const now = Date.now();
  const bucket = reportBuckets.get(ip);
  if (!bucket || now - bucket.start > 60000) {
    reportBuckets.set(ip, { start: now, count: 1 });
    if (reportBuckets.size > 10000) reportBuckets.clear();
    return true;
  }
  bucket.count += 1;
  return bucket.count <= REPORT_LIMIT_PER_MIN;
};

const safeEqual = (a, b) => {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

// Access: header x-monitor-key / ?key= matching MONITOR_KEY, or a logged-in admin cookie
const requireMonitorAccess = (req, res, next) => {
  const key = req.get('x-monitor-key') || req.query.key;
  if (process.env.MONITOR_KEY && key && safeEqual(key, process.env.MONITOR_KEY)) return next();
  try {
    const cookies = req.headers.cookie ? cookie.parse(req.headers.cookie) : {};
    const decoded = cookies.AccessToken && jwt.verify(cookies.AccessToken, process.env.JWT_SECRET);
    if (decoded?.role === 'admin') return next();
  } catch {
    // fall through
  }
  return res.status(401).json({ status: 'failed', message: 'Monitor access denied' });
};

const parseList = (rows) =>
  rows
    .map((row) => {
      try {
        return JSON.parse(row);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

const PROBLEM_TYPES = new Set([
  'auth_rejected',
  'engine_error',
  'server_error_emit',
  'handler_error',
  'handler_rejected',
  'handler_threw',
  'slow_handler',
  'client_connect_error',
  'client_reconnect_failed',
  'client_connect_slow',
  'client_chat_load_timeout',
  'client_socket_error',
]);

const registerMonitorRoutes = (app, io) => {
  const BASE = '/socket/monitor';

  // Called by the frontend when it can't connect (the socket itself is down, so this is plain HTTP)
  app.post(`${BASE}/client-report`, (req, res) => {
    const info = getClientInfo(req);
    if (!allowReport(info.ip || 'unknown')) return res.status(429).end();

    const body = req.body || {};
    const cs = typeof body.cs === 'string' ? body.cs.slice(0, 64) : undefined;
    const who = identify(req.headers.cookie);
    const env = body.env && typeof body.env === 'object' ? body.env : {};
    const events = Array.isArray(body.events) ? body.events.slice(0, 30) : [];

    for (const evt of events) {
      if (!evt || typeof evt.type !== 'string') continue;
      const type = `client_${evt.type.replace(/[^a-z0-9_]/gi, '').slice(0, 40)}`;
      const { type: _ignored, ...rest } = evt;
      record(
        type,
        {
          userId: who.userId,
          role: who.role,
          idSource: who.idSource,
          hasAccessCookie: who.hasAccessCookie,
          hasRefreshCookie: who.hasRefreshCookie,
          accessExp: who.accessExp,
          cs,
          ip: info.ip,
          ua: info.ua,
          origin: info.origin,
          page: truncate(env.page, 200),
          online: env.online,
          connection: truncate(env.connection, 100),
          visibility: env.visibility,
          data: truncate(rest, 3000),
        },
        { level: PROBLEM_TYPES.has(type) ? 'warn' : 'info', global: PROBLEM_TYPES.has(type) },
      );
    }
    return res.status(204).end();
  });

  // Full timeline for one user (newest first), merged with their browser-tab trails
  app.get(`${BASE}/user/:userId`, requireMonitorAccess, async (req, res) => {
    try {
      const userId = req.params.userId;
      const limit = Math.min(parseInt(req.query.limit, 10) || 200, USER_TRAIL_LEN);
      const userEvents = parseList(await redis.lRange(`sockmon:user:${userId}`, 0, limit - 1));
      const sessions = [...new Set(userEvents.map((e) => e.cs).filter(Boolean))].slice(0, 10);
      const sessionEvents = (
        await Promise.all(sessions.map((cs) => redis.lRange(`sockmon:cs:${cs}`, 0, limit - 1)))
      ).flatMap(parseList);

      const seen = new Set();
      const merged = [...userEvents, ...sessionEvents]
        .filter((e) => {
          const k = `${e.t}|${e.type}|${e.sid || ''}|${e.event || ''}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .sort((a, b) => (a.t < b.t ? 1 : -1))
        .slice(0, limit);

      const problems = {};
      for (const e of merged) if (PROBLEM_TYPES.has(e.type)) problems[e.code ? `${e.type}:${e.code}` : e.type] = (problems[e.code ? `${e.type}:${e.code}` : e.type] || 0) + 1;

      res.json({
        userId,
        currentlyOnline: (await redis.sIsMember('online_users', String(userId))) ? true : false,
        problems,
        sessions,
        events: merged,
      });
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // Timeline for a browser tab that never identified (no cookies at all)
  app.get(`${BASE}/session/:cs`, requireMonitorAccess, async (req, res) => {
    try {
      res.json({ cs: req.params.cs, events: parseList(await redis.lRange(`sockmon:cs:${req.params.cs}`, 0, USER_TRAIL_LEN - 1)) });
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // Global feed of important events. ?type=auth_rejected&userId=12&limit=100
  app.get(`${BASE}/recent`, requireMonitorAccess, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 100, 1000);
      const all = parseList(await redis.lRange('sockmon:events', 0, GLOBAL_LEN - 1));
      const filtered = all.filter(
        (e) =>
          (!req.query.type || e.type === req.query.type) &&
          (!req.query.userId || String(e.userId) === String(req.query.userId)) &&
          (req.query.problemsOnly !== '1' || PROBLEM_TYPES.has(e.type)),
      );
      res.json({ count: filtered.length, events: filtered.slice(0, limit) });
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // Users with the most connection problems in the last N hours
  app.get(`${BASE}/problem-users`, requireMonitorAccess, async (req, res) => {
    try {
      const hours = Math.min(parseFloat(req.query.hours) || 24, 24 * 7);
      const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
      const all = parseList(await redis.lRange('sockmon:events', 0, GLOBAL_LEN - 1));
      const users = {};
      for (const e of all) {
        if (e.t < since || !PROBLEM_TYPES.has(e.type)) continue;
        const key = e.userId ? `user:${e.userId}` : `anon:${e.cs || e.ip || 'unknown'}`;
        const u = (users[key] ||= { who: key, userId: e.userId, total: 0, byType: {}, lastAt: e.t, lastUa: e.ua });
        u.total += 1;
        const k = e.code ? `${e.type}:${e.code}` : e.type;
        u.byType[k] = (u.byType[k] || 0) + 1;
      }
      res.json({
        hours,
        oldestEventInBuffer: all.length ? all[all.length - 1].t : null,
        users: Object.values(users).sort((a, b) => b.total - a.total).slice(0, 200),
      });
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // Counters per day + server health
  app.get(`${BASE}/stats`, requireMonitorAccess, async (req, res) => {
    try {
      const days = Math.min(parseInt(req.query.days, 10) || 3, 30);
      const byDay = {};
      for (let i = 0; i < days; i += 1) {
        const day = new Date(Date.now() - i * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        byDay[day] = await redis.hGetAll(`sockmon:stats:${day}`);
      }
      const health = parseList(await redis.lRange('sockmon:health', 0, 59));
      res.json({
        instance: INSTANCE,
        pid: PID,
        uptimeSec: Math.round(process.uptime()),
        socketsOnThisInstance: io.engine.clientsCount,
        byDay,
        healthLastHour: health,
      });
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });
};

module.exports = {
  record,
  recordAuth,
  track,
  attachSocketMonitor,
  registerMonitorRoutes,
  getClientInfo,
  identify,
};
