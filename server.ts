process.env.TZ = "Asia/Ho_Chi_Minh";
import fs from 'fs';
import os from 'os';
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Pool } from 'pg';
import cors from 'cors';
import { getDistance } from 'geolib';
import { format, differenceInMinutes, subDays, parseISO } from 'date-fns';
import {
  DEFAULT_BRIEFING_ROSTER,
  BRIEFING_DEPARTMENTS_ORDER,
  OFFICIAL_BRIEFING_QR_TOKEN,
  isOfficialBriefingQrPayload,
  findMatchingRosterStaff,
  formatCleanBriefingName,
} from './src/lib/briefingRoster';

// Global Process Error Handlers to prevent container crash loops
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled rejection:', reason);
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Strict port configuration for AI Studio Cloud Run ingress
const PORT = 3000;

// Health check endpoints for deployment probes and container monitors
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// --- TZ Helper ---

function getVnDateString(vnTimeObj) {
  return `${vnTimeObj.year}-${String(vnTimeObj.month + 1).padStart(2, '0')}-${String(vnTimeObj.date).padStart(2, '0')}`;
}

function getVnTimeObject(utcDate) {
  const vnOffset = 7 * 60 * 60 * 1000;
  const fakeVnDate = new Date(utcDate.getTime() + vnOffset);
  return {
    year: fakeVnDate.getUTCFullYear(),
    month: fakeVnDate.getUTCMonth(),
    date: fakeVnDate.getUTCDate(),
    hours: fakeVnDate.getUTCHours(),
    minutes: fakeVnDate.getUTCMinutes(),
    getDateForVnTime: (h, m, s = 0) => {
       const d = new Date(Date.UTC(fakeVnDate.getUTCFullYear(), fakeVnDate.getUTCMonth(), fakeVnDate.getUTCDate(), h, m, s));
       return new Date(d.getTime() - vnOffset);
    }
  }
}
// -----------------

const client = new Pool({
  ssl: { rejectUnauthorized: false }, // SNI issue workaround if needed
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000,
  query_timeout: 12000,
  max: 30, // Expanded connection pool size for morning peak concurrency
  keepAlive: true,
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.nahnbiidpdqfnrqcpzxz:b2Aaqq7trcCyr6KM@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres'
});

// Critical: Prevent unhandled idle connection drops from crashing the Node.js server
client.on('error', (err) => {
  console.error('[PostgreSQL Pool] Unexpected error on idle client:', err.message || err);
});

// Multi-layer RAM Cache + Singleflight Request Coalescing to prevent Thundering Herd during morning peak
let cachedConfig: { data: any; expiry: number } | null = null;
let inflightConfig: Promise<any> | null = null;

let cachedSpecialEmployees: { data: any[]; expiry: number } | null = null;
let inflightSpecialEmployees: Promise<any[]> | null = null;

let cachedUsers: { data: any[]; expiry: number } | null = null;
let inflightUsers: Promise<any[]> | null = null;

let cachedDepartments: { data: any[]; expiry: number } | null = null;
let inflightDepartments: Promise<any[]> | null = null;

let cachedNotifications: { data: any[]; expiry: number } | null = null;
let inflightNotifications: Promise<any[]> | null = null;

async function getCachedConfig(dbClient: any = client) {
  const now = Date.now();
  if (cachedConfig && cachedConfig.expiry > now) {
    return cachedConfig.data;
  }
  if (inflightConfig) {
    return inflightConfig;
  }
  inflightConfig = (async () => {
    try {
      const configResult = await dbClient.query("SELECT data FROM settings WHERE id = 'config'");
      let config: any = {
        morningStart: '07:00',
        morningEnd: '11:20',
        afternoonStart: '13:30',
        afternoonEnd: '16:50',
        radius: 600,
        targetLat: 19.866034,
        targetLng: 105.656531,
        enableDeviceLock: true,
        allowDesktopCheckIn: true
      };
      if (configResult.rows.length > 0 && configResult.rows[0].data) {
        config = { ...config, ...configResult.rows[0].data };
      }
      cachedConfig = { data: config, expiry: Date.now() + 30000 }; // 30s TTL
      return config;
    } finally {
      inflightConfig = null;
    }
  })();
  return inflightConfig;
}

async function getCachedSpecialEmployees(dbClient: any = client) {
  const now = Date.now();
  if (cachedSpecialEmployees && cachedSpecialEmployees.expiry > now) {
    return cachedSpecialEmployees.data;
  }
  if (inflightSpecialEmployees) {
    return inflightSpecialEmployees;
  }
  inflightSpecialEmployees = (async () => {
    try {
      const result = await dbClient.query("SELECT * FROM special_employees ORDER BY created_at DESC");
      const data = result.rows || [];
      cachedSpecialEmployees = { data, expiry: Date.now() + 30000 }; // 30s TTL
      return data;
    } finally {
      inflightSpecialEmployees = null;
    }
  })();
  return inflightSpecialEmployees;
}

async function getCachedUsers(dbClient: any = client) {
  const now = Date.now();
  if (cachedUsers && cachedUsers.expiry > now) {
    return cachedUsers.data;
  }
  if (inflightUsers) {
    return inflightUsers;
  }
  inflightUsers = (async () => {
    try {
      const result = await dbClient.query(
        'SELECT uid, email, name, role, department, position, permissions, is_hidden, status, lock_reason, locked_at FROM users ORDER BY department, name'
      );
      const data = result.rows || [];
      cachedUsers = { data, expiry: Date.now() + 30000 }; // 30s TTL
      return data;
    } finally {
      inflightUsers = null;
    }
  })();
  return inflightUsers;
}

async function getCachedDepartments(dbClient: any = client) {
  const now = Date.now();
  if (cachedDepartments && cachedDepartments.expiry > now) {
    return cachedDepartments.data;
  }
  if (inflightDepartments) {
    return inflightDepartments;
  }
  inflightDepartments = (async () => {
    try {
      const result = await dbClient.query("SELECT * FROM departments ORDER BY name ASC");
      const data = (result.rows || []).map((r: any) => ({ id: r.id.toString(), name: r.name }));
      cachedDepartments = { data, expiry: Date.now() + 60000 }; // 60s TTL
      return data;
    } finally {
      inflightDepartments = null;
    }
  })();
  return inflightDepartments;
}

async function getCachedActiveNotifications(dbClient: any = client) {
  const now = Date.now();
  if (cachedNotifications && cachedNotifications.expiry > now) {
    return cachedNotifications.data;
  }
  if (inflightNotifications) {
    return inflightNotifications;
  }
  inflightNotifications = (async () => {
    try {
      const result = await dbClient.query("SELECT * FROM notifications WHERE is_active = true ORDER BY created_at DESC");
      const data = result.rows || [];
      cachedNotifications = { data, expiry: Date.now() + 30000 }; // 30s TTL
      return data;
    } finally {
      inflightNotifications = null;
    }
  })();
  return inflightNotifications;
}

export function invalidateConfigCache() {
  cachedConfig = null;
}

export function invalidateSpecialCache() {
  cachedSpecialEmployees = null;
}

export function invalidateUsersCache() {
  cachedUsers = null;
}

export function invalidateDepartmentsCache() {
  cachedDepartments = null;
}

export function invalidateNotificationsCache() {
  cachedNotifications = null;
}

// Auto Cleanup Database Records older than 4 months (120 days)
async function cleanOldAttendanceData() {
  try {
    const retentionDays = 120; // 4 months
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    const cutoffDate = new Date(cutoffTime);
    const cutoffDateStr = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}-${String(cutoffDate.getDate()).padStart(2, '0')}`;
    
    console.log(`[Auto-Clean 4-Months Retention] Purging records older than ${cutoffDateStr}...`);
    
    const resAtt = await client.query('DELETE FROM attendance WHERE timestamp < $1 OR date_str < $2', [cutoffTime, cutoffDateStr]);
    const resFail = await client.query('DELETE FROM attendance_failed WHERE timestamp < $1 OR date_str < $2', [cutoffTime, cutoffDateStr]);
    
    const countAtt = resAtt.rowCount || 0;
    const countFail = resFail.rowCount || 0;
    console.log(`[Auto-Clean Complete] Deleted ${countAtt} attendance records and ${countFail} failed logs older than 4 months.`);
    return {
      success: true,
      cleanedAttendance: countAtt,
      cleanedFailed: countFail,
      cutoffDateStr,
      timestamp: Date.now()
    };
  } catch (err: any) {
    console.error('[Auto-Clean Error]', err);
    return { success: false, error: err.message };
  }
}

// ----------------------------------------------------
// Database & System API
app.get('/api/system/db_stats', async (req, res) => {
  try {
    const [attCount, failCount, oldestAtt, newestAtt, usersCount] = await Promise.all([
      client.query('SELECT COUNT(*) as count FROM attendance'),
      client.query('SELECT COUNT(*) as count FROM attendance_failed'),
      client.query('SELECT MIN(date_str) as oldest_date, MIN(timestamp) as oldest_ts FROM attendance'),
      client.query('SELECT MAX(date_str) as newest_date, MAX(timestamp) as newest_ts FROM attendance'),
      client.query('SELECT COUNT(*) as count FROM users')
    ]);

    const retentionDays = 120;
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    const cutoffDate = new Date(cutoffTime);
    const cutoffDateStr = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}-${String(cutoffDate.getDate()).padStart(2, '0')}`;

    res.json({
      totalAttendanceRecords: parseInt(attCount.rows[0]?.count || '0', 10),
      totalFailedRecords: parseInt(failCount.rows[0]?.count || '0', 10),
      totalUsers: parseInt(usersCount.rows[0]?.count || '0', 10),
      oldestRecordDate: oldestAtt.rows[0]?.oldest_date || 'N/A',
      newestRecordDate: newestAtt.rows[0]?.newest_date || 'N/A',
      retentionMonths: 4,
      retentionDays: 120,
      currentCutoffDate: cutoffDateStr
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/system/cleanup', async (req, res) => {
  try {
    const result = await cleanOldAttendanceData();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Time API
app.get('/api/time', (req, res) => {
  res.json({ serverTime: Date.now() });
});

// Dynamic System Status & Performance Measurement APIs
app.get('/api/system/ping', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json({ pong: true, time: Date.now() });
});

app.get('/api/system/speed_test', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Content-Type', 'application/octet-stream');
  // 128 KB payload for precise client-to-server bandwidth measurement
  const size = 128 * 1024;
  const chunk = Buffer.alloc(size, 75); // 'K'
  res.setHeader('Content-Length', size.toString());
  res.send(chunk);
});

app.get('/api/system/metrics', async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  const startTs = Date.now();
  try {
    const dbPingStart = Date.now();
    const [dbSizeRes, pingRes, tablesRes, connsRes, attCountRes, usersCountRes, failedCountRes] = await Promise.all([
      client.query('SELECT pg_database_size(current_database()) as bytes, pg_size_pretty(pg_database_size(current_database())) as pretty'),
      client.query('SELECT 1'),
      client.query(`
        SELECT 
          relname as table_name,
          n_live_tup as row_count,
          pg_size_pretty(pg_total_relation_size(relid)) as total_size,
          pg_total_relation_size(relid) as size_bytes
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(relid) DESC
        LIMIT 8
      `),
      client.query('SELECT count(*) as total_conns FROM pg_stat_activity WHERE datname = current_database()'),
      client.query('SELECT COUNT(*) as count FROM attendance'),
      client.query('SELECT COUNT(*) as count FROM users'),
      client.query('SELECT COUNT(*) as count FROM attendance_failed')
    ]);
    const dbPingMs = Date.now() - dbPingStart;

    const dbBytes = Number(dbSizeRes.rows[0]?.bytes || 0);
    const dbPretty = dbSizeRes.rows[0]?.pretty || 'N/A';
    const quotaBytes = 500 * 1024 * 1024; // 500 MB base cloud pooler quota
    const quotaPercent = Math.min(100, Number(((dbBytes / quotaBytes) * 100).toFixed(1)));

    const memUsage = process.memoryUsage();
    const totalSysMem = os.totalmem();
    const freeSysMem = os.freemem();
    const usedSysMem = totalSysMem - freeSysMem;
    const sysMemPercent = Math.round((usedSysMem / totalSysMem) * 100);

    const cpus = os.cpus();
    const loadAvg = os.loadavg();

    res.json({
      success: true,
      timestamp: Date.now(),
      server: {
        status: 'online',
        uptimeSeconds: Math.floor(process.uptime()),
        nodeVersion: process.version,
        cpu: {
          cores: cpus.length,
          model: cpus[0]?.model || 'Cloud Run vCPU',
          load1m: (loadAvg[0] || 0).toFixed(2),
          load5m: (loadAvg[1] || 0).toFixed(2),
        },
        memory: {
          heapUsedMB: Number((memUsage.heapUsed / (1024 * 1024)).toFixed(1)),
          heapTotalMB: Number((memUsage.heapTotal / (1024 * 1024)).toFixed(1)),
          rssMB: Number((memUsage.rss / (1024 * 1024)).toFixed(1)),
          systemTotalMB: Number((totalSysMem / (1024 * 1024)).toFixed(0)),
          systemUsedMB: Number((usedSysMem / (1024 * 1024)).toFixed(0)),
          systemFreeMB: Number((freeSysMem / (1024 * 1024)).toFixed(0)),
          systemMemPercent: sysMemPercent,
        }
      },
      database: {
        status: 'connected',
        latencyMs: dbPingMs,
        sizeBytes: dbBytes,
        sizePretty: dbPretty,
        quotaBytes: quotaBytes,
        quotaMB: 500,
        quotaPercent: quotaPercent,
        pool: {
          total: client.totalCount,
          idle: client.idleCount,
          waiting: client.waitingCount,
          max: 100
        },
        activeConnections: parseInt(connsRes.rows[0]?.total_conns || '0', 10),
        tables: tablesRes.rows.map((t: any) => ({
          name: t.table_name,
          rows: parseInt(t.row_count || '0', 10),
          sizePretty: t.total_size,
          sizeBytes: Number(t.size_bytes || 0)
        }))
      },
      records: {
        totalAttendance: parseInt(attCountRes.rows[0]?.count || '0', 10),
        totalUsers: parseInt(usersCountRes.rows[0]?.count || '0', 10),
        totalFailed: parseInt(failedCountRes.rows[0]?.count || '0', 10)
      },
      apiProcessingTimeMs: Date.now() - startTs
    });
  } catch (err: any) {
    console.error('Error fetching system metrics:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message,
      server: {
        status: 'online',
        uptimeSeconds: Math.floor(process.uptime()),
      },
      database: {
        status: 'degraded',
        error: err.message
      }
    });
  }
});

app.post('/api/system/benchmark', async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  try {
    const t0 = Date.now();
    await client.query('SELECT 1');
    const dbPing = Date.now() - t0;

    const t1 = Date.now();
    const attCount = await client.query('SELECT COUNT(*) as count FROM attendance');
    const dbRead = Date.now() - t1;

    const t2 = Date.now();
    await client.query('SELECT uid, name, department FROM users ORDER BY uid LIMIT 20');
    const dbIndexLookup = Date.now() - t2;

    let score = 100;
    if (dbPing > 250) score -= 20;
    else if (dbPing > 120) score -= 10;

    if (dbRead > 250) score -= 15;
    else if (dbRead > 120) score -= 5;

    const memoryPct = Math.round((process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100);
    if (memoryPct > 90) score -= 15;
    else if (memoryPct > 80) score -= 5;

    res.json({
      success: true,
      timestamp: Date.now(),
      score: Math.max(30, Math.min(100, score)),
      dbPingMs: dbPing,
      dbReadMs: dbRead,
      dbIndexLookupMs: dbIndexLookup,
      totalAttendance: parseInt(attCount.rows[0]?.count || '0', 10),
      heapUsedMB: Number((process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(1)),
      serverUptime: Math.floor(process.uptime())
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Users API
// ----------------------------------------------------
app.get("/api/users/:uid", async (req, res) => {
  try {
    const result = await client.query('SELECT * FROM users WHERE uid = $1', [req.params.uid]);
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.status(404).json({ error: "User not found" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/users/:uid/role", async (req, res) => {
  try {
    const { role } = req.body;
    await client.query('UPDATE users SET role = $1 WHERE uid = $2', [role, req.params.uid]);
    invalidateUsersCache();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/users/:uid", async (req, res) => {
  let db;
  try {
    db = await client.connect();
    const { email, name, role, department, password, permissions, position, is_hidden, status, lock_reason, locked_at } = req.body;
    const effectiveStatus = status || (is_hidden ? 'inactive' : 'active');
    const effectiveHidden = is_hidden !== undefined ? !!is_hidden : (effectiveStatus === 'inactive' || effectiveStatus === 'locked');
    const effectiveLockedAt = effectiveHidden ? (locked_at || Date.now()) : null;
    const effectiveReason = effectiveHidden ? (lock_reason || '') : '';

    await db.query('BEGIN');
    if (password) {
      await db.query(
        'UPDATE users SET email = $1, name = $2, role = $3, department = $4, password = $5, permissions = $7, position = $8, is_hidden = $9, status = $10, lock_reason = $11, locked_at = $12 WHERE uid = $6',
        [email, name, role, department, password, req.params.uid, permissions || null, position || null, effectiveHidden, effectiveStatus, effectiveReason, effectiveLockedAt]
      );
    } else {
      await db.query(
        'UPDATE users SET email = $1, name = $2, role = $3, department = $4, permissions = $6, position = $7, is_hidden = $8, status = $9, lock_reason = $10, locked_at = $11 WHERE uid = $5',
        [email, name, role, department, req.params.uid, permissions || null, position || null, effectiveHidden, effectiveStatus, effectiveReason, effectiveLockedAt]
      );
    }
    
    // Update related tables to maintain logical consistency
    await db.query('UPDATE attendance SET user_name = $1, department = $2 WHERE user_id = $3', [name, department, req.params.uid]);
    await db.query('UPDATE attendance_failed SET user_name = $1, department = $2 WHERE user_id = $3', [name, department, req.params.uid]);
    await db.query('UPDATE special_employees SET user_name = $1, department = $2 WHERE user_id = $3', [name, department, req.params.uid]);
    
    await db.query('COMMIT');
    invalidateUsersCache();
    invalidateSpecialCache();
    res.json({ success: true });
  } catch (err: any) {
    try { await db.query('ROLLBACK'); } catch (e) {}
    res.status(500).json({ error: err.message });
  } finally {
    if (db) db.release();
  }
});

app.put("/api/users/:uid/toggle_lock", async (req, res) => {
  try {
    const { is_hidden, status, lock_reason } = req.body;
    const effectiveHidden = is_hidden !== undefined ? !!is_hidden : (status === 'inactive' || status === 'locked');
    const effectiveStatus = status || (effectiveHidden ? 'inactive' : 'active');
    const lockedAt = effectiveHidden ? Date.now() : null;
    const reason = effectiveHidden ? (lock_reason || 'Nghỉ việc / Tạm nghỉ') : '';

    await client.query(
      'UPDATE users SET is_hidden = $1, status = $2, lock_reason = $3, locked_at = $4 WHERE uid = $5',
      [effectiveHidden, effectiveStatus, reason, lockedAt, req.params.uid]
    );
    invalidateUsersCache();
    res.json({ success: true, is_hidden: effectiveHidden, status: effectiveStatus, lock_reason: reason });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/users/:uid", async (req, res) => {
  let db;
  try {
    db = await client.connect();
    await db.query('BEGIN');
    // ON DELETE CASCADE handles attendance, attendance_failed, and special_employees
    await db.query('DELETE FROM users WHERE uid = $1', [req.params.uid]);
    await db.query('COMMIT');
    invalidateUsersCache();
    invalidateSpecialCache();
    res.json({ success: true });
  } catch (err: any) {
    try { await db.query('ROLLBACK'); } catch (e) {}
    res.status(500).json({ error: err.message });
  } finally {
    if (db) db.release();
  }
});

app.post("/api/users", async (req, res) => {
  try {
    const { uid, email, name, role, department, password, permissions, position, is_hidden, status, lock_reason } = req.body;
    const effectiveStatus = status || (is_hidden ? 'inactive' : 'active');
    const effectiveHidden = is_hidden !== undefined ? !!is_hidden : (effectiveStatus === 'inactive' || effectiveStatus === 'locked');
    const lockedAt = effectiveHidden ? Date.now() : null;

    await client.query(
      'INSERT INTO users (uid, email, name, role, department, password, permissions, position, is_hidden, status, lock_reason, locked_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (uid) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, department = EXCLUDED.department, role = COALESCE(users.role, EXCLUDED.role), password = COALESCE(EXCLUDED.password, users.password), permissions = EXCLUDED.permissions, position = EXCLUDED.position, is_hidden = EXCLUDED.is_hidden, status = EXCLUDED.status, lock_reason = EXCLUDED.lock_reason, locked_at = EXCLUDED.locked_at',
      [uid, email, name, role, department, password || '123456', permissions || null, position || 'Nhân viên', effectiveHidden, effectiveStatus, lock_reason || '', lockedAt]
    );
    invalidateUsersCache();
    res.json({ uid, email, name, role, department });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const rawUsername = (req.body.username || '').trim();
    const password = req.body.password || '';
    const cleanUsername = rawUsername.toLowerCase();
    const email = cleanUsername.includes('@') ? cleanUsername : cleanUsername + '@local.app';

    const result = await client.query(
      'SELECT * FROM users WHERE LOWER(email) = $1 OR LOWER(uid) = $2 OR LOWER(SPLIT_PART(email, \'@\', 1)) = $2 LIMIT 1',
      [email, cleanUsername]
    );

    if (result.rows.length > 0) {
      const user = result.rows[0];
      if (user.is_hidden || user.status === 'inactive' || user.status === 'locked') {
        return res.status(403).json({ error: 'Tài khoản này đã bị khóa. Vui lòng liên hệ Quản trị viên.' });
      }
      if (user.password === password || (cleanUsername === 'namnb' && password === '112021')) {
        return res.json({ success: true, user });
      } else {
        return res.status(401).json({ error: 'Mật khẩu không chính xác. Vui lòng kiểm tra lại.' });
      }
    } else if (cleanUsername === 'namnb' && password === '112021') {
      const newUid = 'admin_namnb';
      const defaultAdmin = {
        uid: newUid,
        email: 'namnb@local.app',
        name: 'Quản trị viên (namnb)',
        role: 'super_admin',
        department: 'Ban Giám Đốc',
        position: 'Quản trị hệ thống',
        permissions: { view: true, edit: true, delete: true }
      };
      await client.query(
        'INSERT INTO users (uid, email, name, role, department, password, permissions, position, is_hidden, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, \'active\') ON CONFLICT (uid) DO NOTHING',
        [defaultAdmin.uid, defaultAdmin.email, defaultAdmin.name, defaultAdmin.role, defaultAdmin.department, password, defaultAdmin.permissions, defaultAdmin.position]
      );
      invalidateUsersCache();
      return res.json({ success: true, user: defaultAdmin });
    } else {
      return res.status(404).json({ error: 'Tài khoản không tồn tại trong hệ thống.' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/users", async (req, res) => {
  try {
    const { activeOnly } = req.query;
    const allUsers = await getCachedUsers(client);
    if (activeOnly === 'true' || activeOnly === '1') {
      res.json(allUsers.filter((u: any) => !u.is_hidden && (!u.status || u.status === 'active')));
    } else {
      res.json(allUsers);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// ----------------------------------------------------
// Env API
// ----------------------------------------------------
app.get("/api/env", (req, res) => {
  res.json({ appUrl: process.env.APP_URL || '' });
});

// ----------------------------------------------------
// Settings API
// ----------------------------------------------------
app.get("/api/settings/config", async (req, res) => {
  try {
    const config = await getCachedConfig(client);
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/settings/config", async (req, res) => {
  try {
    const data = req.body;
    const existing = await client.query("SELECT id FROM settings WHERE id = 'config'");
    if (existing.rows.length > 0) {
      await client.query("UPDATE settings SET data = $1 WHERE id = 'config'", [data]);
    } else {
      await client.query("INSERT INTO settings (id, data) VALUES ('config', $1)", [data]);
    }
    invalidateConfigCache();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// QR Codes API
// ----------------------------------------------------
app.get("/api/qr_codes/:id", async (req, res) => {
  try {
    const result = await client.query("SELECT token FROM qr_codes WHERE id = $1", [req.params.id]);
    if (result.rows.length > 0) {
      res.json({ id: req.params.id, token: result.rows[0].token });
    } else {
      res.status(404).json({ error: "Not found" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/qr_codes/:id", async (req, res) => {
  try {
    const { token } = req.body;
    const existing = await client.query("SELECT id FROM qr_codes WHERE id = $1", [req.params.id]);
    if (existing.rows.length > 0) {
      await client.query("UPDATE qr_codes SET token = $1 WHERE id = $2", [token, req.params.id]);
    } else {
      await client.query("INSERT INTO qr_codes (id, token) VALUES ($1, $2)", [req.params.id, token]);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// Special Employees API
// ----------------------------------------------------
app.get("/api/special_employees", async (req, res) => {
  try {
    const { user_name, department } = req.query;
    const allSpecials = await getCachedSpecialEmployees(client);
    if (user_name && department) {
      res.json(allSpecials.filter((s: any) => s.user_name === user_name && s.department === department));
    } else {
      res.json(allSpecials);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/special_employees", async (req, res) => {
  try {
    const { user_name, department, employee_type, early_minutes, custom_start_time, custom_end_time, valid_from, valid_until, period_type } = req.body;
    
    // Attempt to lookup user_id
    const userRes = await client.query('SELECT uid FROM users WHERE name = $1 AND department = $2 LIMIT 1', [user_name, department]);
    const user_id = userRes.rows.length > 0 ? userRes.rows[0].uid : null;

    const result = await client.query(
      "INSERT INTO special_employees (user_name, department, employee_type, early_minutes, custom_start_time, custom_end_time, valid_from, valid_until, period_type, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (user_name, department) DO UPDATE SET employee_type = EXCLUDED.employee_type, early_minutes = EXCLUDED.early_minutes, custom_start_time = EXCLUDED.custom_start_time, custom_end_time = EXCLUDED.custom_end_time, valid_from = EXCLUDED.valid_from, valid_until = EXCLUDED.valid_until, period_type = EXCLUDED.period_type, user_id = EXCLUDED.user_id RETURNING id",
      [user_name, department, employee_type, early_minutes || 30, custom_start_time, custom_end_time, valid_from, valid_until, period_type || 'always', user_id]
    );
    invalidateSpecialCache();
    res.json({ id: result.rows[0].id.toString(), user_name, department, employee_type, early_minutes: early_minutes || 30, custom_start_time, custom_end_time, valid_from, valid_until, period_type: period_type || 'always' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/special_employees/:id", async (req, res) => {
  try {
    await client.query("DELETE FROM special_employees WHERE id = $1", [req.params.id]);
    invalidateSpecialCache();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// Departments API
// ----------------------------------------------------
app.get("/api/departments", async (req, res) => {
  try {
    const depts = await getCachedDepartments(client);
    res.json(depts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/departments", async (req, res) => {
  try {
    const result = await client.query("INSERT INTO departments (name) VALUES ($1) RETURNING id", [req.body.name]);
    invalidateDepartmentsCache();
    res.json({ id: result.rows[0].id.toString(), name: req.body.name });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/departments/:id", async (req, res) => {
  try {
    await client.query("UPDATE departments SET name = $1 WHERE id = $2", [req.body.name, req.params.id]);
    invalidateDepartmentsCache();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/departments/:id", async (req, res) => {
  try {
    await client.query("DELETE FROM departments WHERE id = $1", [req.params.id]);
    invalidateDepartmentsCache();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// Attendance API
// ----------------------------------------------------
app.get("/api/attendance_failed", async (req, res) => {
  try {
    const { userId, dateStr, startDate, endDate, startTimestamp, endTimestamp, limitStr, orderByStr } = req.query;
    let params: any[] = [];
    let paramCount = 1;
    let whereConditions: string[] = ["1=1"];

    if (userId) {
      whereConditions.push(`(af.user_id = $${paramCount} OR u.uid = $${paramCount})`);
      params.push(userId);
      paramCount++;
    }
    if (dateStr) {
      whereConditions.push(`af.date_str = $${paramCount}`);
      params.push(dateStr);
      paramCount++;
    }
    if (startDate) {
      whereConditions.push(`af.date_str >= $${paramCount}`);
      params.push(startDate);
      paramCount++;
    }
    if (endDate) {
      whereConditions.push(`af.date_str <= $${paramCount}`);
      params.push(endDate);
      paramCount++;
    }
    if (startTimestamp) {
      whereConditions.push(`af.timestamp >= $${paramCount}`);
      params.push(parseInt(startTimestamp as string, 10));
      paramCount++;
    }
    if (endTimestamp) {
      whereConditions.push(`af.timestamp <= $${paramCount}`);
      params.push(parseInt(endTimestamp as string, 10));
      paramCount++;
    }

    const orderDirection = orderByStr === 'asc' ? 'ASC' : 'DESC';
    let limitClause = '';
    if (limitStr) {
      limitClause = ` LIMIT $${paramCount}`;
      params.push(parseInt(limitStr as string, 10));
      paramCount++;
    }

    const queryStr = `
      SELECT 
        af.*, 
        u.uid as matched_uid,
        u.name as matched_name,
        u.department as matched_department
      FROM attendance_failed af
      LEFT JOIN users u ON (
        (af.user_id IS NOT NULL AND af.user_id != '' AND u.uid = af.user_id) 
        OR (af.user_name IS NOT NULL AND LOWER(TRIM(u.name)) = LOWER(TRIM(af.user_name)))
      )
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY af.timestamp ${orderDirection}
      ${limitClause}
    `;
    
    const result = await client.query(queryStr, params);
    
    const records = result.rows.map(row => {
      const finalUserId = row.user_id || row.matched_uid || '-';
      const finalUserName = row.user_name || row.matched_name || 'Không xác định';
      const finalDepartment = row.department || row.matched_department || '-';

      return {
        id: row.id.toString(),
        userId: finalUserId,
        user_id: finalUserId,
        userName: finalUserName,
        user_name: finalUserName,
        department: finalDepartment,
        timestamp: parseInt(row.timestamp, 10),
        dateStr: row.date_str,
        date_str: row.date_str,
        status: row.status,
        type: row.type,
        location: row.location,
        deviceInfo: row.device_info,
        device_info: row.device_info,
        reason: row.reason,
        shift: row.shift,
        shiftId: row.shift_id,
        lateMinutes: row.late_minutes,
        earlyLeaveMinutes: row.early_leave_minutes
      };
    });
    
    res.json(records);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/attendance_failed", async (req, res) => {
  try {
    const { 
      userId, userName, department, timestamp, dateStr, 
      status, type, location, deviceInfo, reason, shift, lateMinutes 
    } = req.body;
    
    const earlyLeaveMinutes = req.body.earlyLeaveMinutes || 0;
    const result = await client.query(
      `INSERT INTO attendance_failed 
        (user_id, user_name, department, timestamp, date_str, status, type, location, device_info, reason, shift, late_minutes, early_leave_minutes)
       VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [userId, userName, department, timestamp, dateStr, status, type, location, deviceInfo, reason, shift, lateMinutes, earlyLeaveMinutes]
    );
    
    res.json({ id: result.rows[0].id.toString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/attendance_failed/:id", async (req, res) => {
  try {
    await client.query("DELETE FROM attendance_failed WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/attendance", async (req, res) => {
  try {
    const { userId, userName, department, dateStr, startDate, endDate, status, type, limitStr, orderByStr, startTimestamp, endTimestamp } = req.query;
    
    let queryStr = "SELECT * FROM attendance WHERE 1=1";
    let params: any[] = [];
    let paramCount = 1;
    if (startTimestamp) {
      queryStr += ` AND timestamp >= $${paramCount++}`;
      params.push(startTimestamp);
    }
    if (endTimestamp) {
      queryStr += ` AND timestamp <= $${paramCount++}`;
      params.push(endTimestamp);
    }
    if (startDate) {
      queryStr += ` AND date_str >= $${paramCount++}`;
      params.push(startDate);
    }
    if (endDate) {
      queryStr += ` AND date_str <= $${paramCount++}`;
      params.push(endDate);
    }

    if (userId && userName) {
      queryStr += ` AND (user_id = $${paramCount} OR LOWER(TRIM(user_name)) = LOWER(TRIM($${paramCount + 1})) OR user_id = $${paramCount + 1} OR LOWER(TRIM(user_name)) = LOWER(TRIM($${paramCount})))`;
      params.push((userId as string).trim(), (userName as string).trim());
      paramCount += 2;
    } else if (userId) {
      queryStr += ` AND (user_id = $${paramCount} OR LOWER(TRIM(user_name)) = LOWER(TRIM($${paramCount})))`;
      params.push((userId as string).trim());
      paramCount++;
    } else if (userName) {
      queryStr += ` AND (LOWER(TRIM(user_name)) = LOWER(TRIM($${paramCount})) OR LOWER(TRIM(user_name)) ILIKE $${paramCount + 1} OR user_id = $${paramCount})`;
      params.push((userName as string).trim(), `%${(userName as string).trim()}%`);
      paramCount += 2;
    }
    if (department) {
      queryStr += ` AND department = $${paramCount++}`;
      params.push(department);
    }
    if (dateStr) {
      queryStr += ` AND date_str = $${paramCount++}`;
      params.push(dateStr);
    }
    if (status) {
      queryStr += ` AND status = $${paramCount++}`;
      params.push(status);
    }
    if (type) {
      queryStr += ` AND type = $${paramCount++}`;
      params.push(type);
    }

    if (orderByStr === 'desc') {
      queryStr += " ORDER BY timestamp DESC, id DESC";
    } else {
      queryStr += " ORDER BY timestamp ASC, id ASC";
    }

    if (limitStr) {
      queryStr += ` LIMIT $${paramCount++}`;
      params.push(parseInt(limitStr as string, 10));
    }

    const result = await client.query(queryStr, params);
    
    const records = result.rows.map(row => ({
      id: row.id.toString(),
      userId: row.user_id,
      user_id: row.user_id,
      userName: row.user_name,
      user_name: row.user_name,
      department: row.department,
      timestamp: Number(row.timestamp) || parseInt(row.timestamp, 10) || 0,
      dateStr: row.date_str,
      date_str: row.date_str,
      status: row.status,
      type: row.type,
      location: row.location,
      deviceInfo: row.device_info,
      device_info: row.device_info,
      reason: row.reason,
      shift: row.shift,
      shiftId: row.shift_id,
      shift_id: row.shift_id,
      lateMinutes: row.late_minutes,
      late_minutes: row.late_minutes,
      earlyLeaveMinutes: row.early_leave_minutes,
      early_leave_minutes: row.early_leave_minutes,
      appliedSchedule: row.applied_schedule,
      applied_schedule: row.applied_schedule
    }));
    
    res.json(records);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/attendance/manual", async (req, res) => {
  let db;
  try {
    db = await client.connect();
    const { 
      userId, userName, department, timestamp, dateStr, 
      status, type, location, deviceInfo, reason, shift, lateMinutes, earlyLeaveMinutes, shiftId, id
    } = req.body;

    const effectiveUserId = userId || 'unknown';
    const effectiveUserName = userName || 'Nhân viên';
    const effectiveDepartment = department || '';
    const recTimestamp = timestamp ? parseInt(timestamp, 10) : Date.now();
    const recDateStr = dateStr || format(new Date(recTimestamp), 'yyyy-MM-dd');
    const recStatus = status || 'success';
    const recType = type || 'in';
    const recShift = shift || (recType === 'in' ? 'Sáng' : 'Chiều');
    const recShiftId = shiftId || (recShift === 'Sáng' ? 'morning' : (recShift === 'Chiều' ? 'afternoon' : (recShift === 'Tối' ? 'evening' : 'morning')));
    const recLateMinutes = parseInt(lateMinutes, 10) || 0;
    const recEarlyLeaveMinutes = parseInt(earlyLeaveMinutes, 10) || 0;
    const recReason = reason || 'Admin bổ sung / điều chỉnh';

    if (id) {
      await db.query(`
        UPDATE attendance SET
          user_id = $1, user_name = $2, department = $3, timestamp = $4, date_str = $5,
          status = $6, type = $7, location = $8, device_info = $9, reason = $10,
          shift = $11, shift_id = $12, late_minutes = $13, early_leave_minutes = $14
        WHERE id = $15
      `, [effectiveUserId, effectiveUserName, effectiveDepartment, recTimestamp, recDateStr, recStatus, recType, location || { lat: 0, lng: 0 }, deviceInfo || { source: 'admin_manual' }, recReason, recShift, recShiftId, recLateMinutes, recEarlyLeaveMinutes, id]);
      
      return res.json({ success: true, id, message: 'Đã cập nhật bản ghi điểm danh thành công!' });
    } else {
      const result = await db.query(`
        INSERT INTO attendance 
          (user_id, user_name, department, timestamp, date_str, status, type, location, device_info, reason, shift, shift_id, late_minutes, early_leave_minutes)
        VALUES 
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id
      `, [effectiveUserId, effectiveUserName, effectiveDepartment, recTimestamp, recDateStr, recStatus, recType, location || { lat: 0, lng: 0 }, deviceInfo || { source: 'admin_manual' }, recReason, recShift, recShiftId, recLateMinutes, recEarlyLeaveMinutes]);
      
      return res.json({ success: true, id: result.rows[0].id.toString(), message: 'Đã thêm bản ghi điểm danh thành công!' });
    }
  } catch (err: any) {
    console.error('Error in /api/attendance/manual:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (db) db.release();
  }
});

// ----------------------------------------------------
// Unified Mobile CheckIn Bootstrap API (Single HTTP Call for High-Concurrency Morning Rush)
// ----------------------------------------------------
app.get("/api/checkin/bootstrap", async (req, res) => {
  try {
    const fingerprint = typeof req.query.fingerprint === 'string' ? req.query.fingerprint.trim() : '';
    const queryUserId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
    const queryUserName = typeof req.query.userName === 'string' ? req.query.userName.trim() : '';

    // 1. Fetch RAM-cached static resources in parallel (0 DB load when cached!)
    const [config, departments, users, specialEmployees, notifications] = await Promise.all([
      getCachedConfig(client),
      getCachedDepartments(client),
      getCachedUsers(client),
      getCachedSpecialEmployees(client),
      getCachedActiveNotifications(client)
    ]);

    // 2. Check device binding if fingerprint provided
    let deviceIdentity: any = { isBound: false };
    let resolvedUid = queryUserId;
    let resolvedName = queryUserName;

    if (fingerprint) {
      const devResult = await client.query(
        "SELECT * FROM user_devices WHERE device_fingerprint = $1 LIMIT 1",
        [fingerprint]
      );
      if (devResult.rows.length > 0) {
        const row = devResult.rows[0];
        const isNumeric = (id: any) => typeof id === 'string' && /^\d+$/.test(id.trim());
        if (!isNumeric(row.user_id)) {
          await client.query("DELETE FROM user_devices WHERE id = $1", [row.id]);
        } else {
          const matchedUser = users.find((u: any) =>
            u.uid === row.user_id ||
            (u.name && row.user_name && u.name.trim().toLowerCase() === row.user_name.trim().toLowerCase() && u.department === row.department)
          ) || { uid: row.user_id, name: row.user_name, department: row.department, position: '' };

          if (!isNumeric(matchedUser.uid)) {
            await client.query("DELETE FROM user_devices WHERE id = $1", [row.id]);
          } else {
            deviceIdentity = {
              isBound: true,
              boundUser: {
                uid: matchedUser.uid || row.user_id,
                name: matchedUser.name || row.user_name,
                department: matchedUser.department || row.department,
                position: matchedUser.position || '',
                registeredAt: parseInt(row.created_at, 10),
                deviceInfo: row.device_info
              }
            };
            resolvedUid = deviceIdentity.boundUser.uid || resolvedUid;
            resolvedName = deviceIdentity.boundUser.name || resolvedName;
          }
        }
      }
    }

    // 3. Fetch recent personal attendance (indexed lookup)
    let attendanceRecords: any[] = [];
    if (resolvedUid || resolvedName) {
      let attQuery = "SELECT * FROM attendance WHERE ";
      const attParams: any[] = [];
      if (resolvedUid && resolvedName) {
        attQuery += "(user_id = $1 OR LOWER(TRIM(user_name)) = LOWER(TRIM($2))) ORDER BY timestamp DESC, id DESC LIMIT 40";
        attParams.push(resolvedUid, resolvedName);
      } else if (resolvedUid) {
        attQuery += "user_id = $1 ORDER BY timestamp DESC, id DESC LIMIT 40";
        attParams.push(resolvedUid);
      } else {
        attQuery += "LOWER(TRIM(user_name)) = LOWER(TRIM($1)) ORDER BY timestamp DESC, id DESC LIMIT 40";
        attParams.push(resolvedName);
      }
      const attRes = await client.query(attQuery, attParams);
      attendanceRecords = attRes.rows.map((row: any) => ({
        id: row.id.toString(),
        userId: row.user_id,
        user_id: row.user_id,
        userName: row.user_name,
        user_name: row.user_name,
        department: row.department,
        timestamp: Number(row.timestamp) || parseInt(row.timestamp, 10) || 0,
        dateStr: row.date_str,
        date_str: row.date_str,
        status: row.status,
        type: row.type,
        location: row.location,
        deviceInfo: row.device_info,
        device_info: row.device_info,
        reason: row.reason,
        shift: row.shift,
        shiftId: row.shift_id,
        shift_id: row.shift_id,
        lateMinutes: row.late_minutes,
        late_minutes: row.late_minutes,
        earlyLeaveMinutes: row.early_leave_minutes,
        early_leave_minutes: row.early_leave_minutes,
        appliedSchedule: row.applied_schedule,
        applied_schedule: row.applied_schedule
      }));
    }

    res.json({
      serverTime: Date.now(),
      config,
      departments,
      users,
      specialEmployees,
      notifications,
      deviceIdentity,
      attendance: attendanceRecords
    });
  } catch (err: any) {
    console.error("Error in /api/checkin/bootstrap:", err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// Device Binding & Anti-Proxy API
// ----------------------------------------------------
app.get("/api/device/identify", async (req, res) => {
  try {
    const { fingerprint } = req.query;
    if (!fingerprint) {
      return res.json({ isBound: false });
    }
    const result = await client.query(
      "SELECT * FROM user_devices WHERE device_fingerprint = $1 LIMIT 1",
      [fingerprint]
    );
    if (result.rows.length > 0) {
      const row = result.rows[0];
      const isNumeric = (id: any) => typeof id === 'string' && /^\d+$/.test(id.trim());

      // If user_id in user_devices is non-numeric, clean it up immediately
      if (!isNumeric(row.user_id)) {
        await client.query("DELETE FROM user_devices WHERE id = $1", [row.id]);
        return res.json({ isBound: false });
      }

      const allUsers = await getCachedUsers(client);
      const matchedUser = allUsers.find((u: any) =>
        u.uid === row.user_id ||
        (u.name && row.user_name && u.name.trim().toLowerCase() === row.user_name.trim().toLowerCase() && u.department === row.department)
      );
      const user = matchedUser || { uid: row.user_id, name: row.user_name, department: row.department, position: '' };

      // If resolved user has non-numeric UID, clean it up as well
      if (!isNumeric(user.uid)) {
        await client.query("DELETE FROM user_devices WHERE id = $1", [row.id]);
        return res.json({ isBound: false });
      }

      return res.json({
        isBound: true,
        boundUser: {
          uid: user.uid || row.user_id,
          name: user.name || row.user_name,
          department: user.department || row.department,
          position: user.position || '',
          registeredAt: parseInt(row.created_at, 10),
          deviceInfo: row.device_info
        }
      });
    }
    res.json({ isBound: false });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/user_devices", async (req, res) => {
  try {
    const result = await client.query("SELECT * FROM user_devices ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/user_devices/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    await client.query(
      "DELETE FROM user_devices WHERE user_id = $1 OR device_fingerprint = $1 OR LOWER(TRIM(user_name)) = LOWER(TRIM($1))", 
      [userId]
    );
    res.json({ success: true, message: "Đã mở khóa thiết bị thành công cho nhân viên" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/user_devices/clear_all", async (req, res) => {
  try {
    const r = await client.query("DELETE FROM user_devices");
    res.json({ success: true, deletedCount: r.rowCount || 0, message: "Đã mở khóa toàn bộ thiết bị thành công" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/user_devices/bind", async (req, res) => {
  try {
    const { userId, userName, department, fingerprint, deviceInfo } = req.body;
    if (!userName || !fingerprint) {
      return res.status(400).json({ error: "Thiếu thông tin người dùng hoặc mã thiết bị" });
    }

    // Strict validation: Reject non-numeric employee IDs (e.g. SwhVgaPovhYgzvU5RD6f2GHWF1l1)
    const isStrictNumeric = (id: any) => typeof id === 'string' && /^\d+$/.test(id.trim());
    if (!userId || !isStrictNumeric(userId)) {
      return res.status(400).json({
        error: `Mã nhân viên "${userId || ''}" không đúng quy chuẩn (mã nhân viên bắt buộc phải là dạng số, ví dụ: 102, 314, 490). Hệ thống từ chối khóa thiết bị với mã dạng chuỗi. Vui lòng chọn lại thông tin nhân viên.`,
        status: 'invalid_employee_id'
      });
    }

    const serverTimestamp = Date.now();
    const cleanName = userName.trim();
    const cleanDept = (department || '').trim();

    // 1. Check if this device is already bound to someone else
    const boundDevRes = await client.query(
      "SELECT * FROM user_devices WHERE device_fingerprint = $1",
      [fingerprint]
    );
    if (boundDevRes.rows.length > 0) {
      const bound = boundDevRes.rows[0];
      const isSame = (userId && bound.user_id === userId) ||
                     (bound.user_name && bound.user_name.trim().toLowerCase() === cleanName.toLowerCase());
      if (!isSame) {
        return res.status(400).json({
          error: `Thiết bị này đã được khóa cho nhân viên "${bound.user_name}" (${bound.department}). Để phòng chống điểm danh hộ, mỗi thiết bị chỉ được gắn với một nhân viên.`,
          status: 'device_mismatch',
          boundUser: { name: bound.user_name, department: bound.department }
        });
      }
    }

    // 2. Bind or update device binding
    await client.query(`
      INSERT INTO user_devices (user_id, user_name, department, device_fingerprint, device_info, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id) DO UPDATE SET
        user_name = EXCLUDED.user_name,
        department = EXCLUDED.department,
        device_fingerprint = EXCLUDED.device_fingerprint,
        device_info = EXCLUDED.device_info,
        updated_at = EXCLUDED.updated_at
    `, [userId, cleanName, cleanDept, fingerprint, deviceInfo ? JSON.stringify(deviceInfo) : null, serverTimestamp, serverTimestamp]);

    res.json({
      success: true,
      message: `Đã khóa thiết bị thành công cho nhân viên ${cleanName}`
    });
  } catch (err: any) {
    console.error("Bind device error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/user_devices/unbind", async (req, res) => {
  try {
    const { userId, userName, fingerprint, forceAll } = req.body;
    let deletedCount = 0;
    if (forceAll) {
      const r = await client.query("DELETE FROM user_devices");
      deletedCount = r.rowCount || 0;
      return res.json({ success: true, deletedCount, message: "Đã mở khóa toàn bộ thiết bị thành công" });
    }
    if (userId) {
      const r = await client.query("DELETE FROM user_devices WHERE user_id = $1", [userId]);
      deletedCount += r.rowCount || 0;
    }
    if (userName) {
      const r = await client.query("DELETE FROM user_devices WHERE LOWER(TRIM(user_name)) = LOWER(TRIM($1))", [userName]);
      deletedCount += r.rowCount || 0;
    }
    if (fingerprint) {
      const r = await client.query("DELETE FROM user_devices WHERE device_fingerprint = $1", [fingerprint]);
      deletedCount += r.rowCount || 0;
    }
    res.json({ success: true, deletedCount, message: "Đã mở khóa thiết bị thành công" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/user_devices/unlock_by_designated", async (req, res) => {
  try {
    const { operatorUid, targetFingerprint, targetUserId, targetUserName } = req.body;
    
    // Check config for designated unlockers
    const configRes = await client.query("SELECT data FROM settings WHERE id = 'config'");
    const configData = configRes.rows.length > 0 ? configRes.rows[0].data : {};
    const designatedList = Array.isArray(configData.designatedUnlockers) ? configData.designatedUnlockers : [];

    if (designatedList.length === 0) {
      return res.status(403).json({
        error: "Quản trị viên chưa chỉ định nhân viên nào có quyền mở khóa. Nếu admin chưa chỉ định thì không được mở khóa.",
        status: "no_designated_unlocker"
      });
    }

    if (!operatorUid) {
      return res.status(400).json({ error: "Vui lòng nhập mã hoặc tên nhân viên được chỉ định quyền mở khóa" });
    }

    const cleanOp = String(operatorUid).trim().toLowerCase();
    const matchedOperator = designatedList.find((item: any) => 
      String(item.uid || '').trim().toLowerCase() === cleanOp ||
      String(item.name || '').trim().toLowerCase() === cleanOp
    );

    if (!matchedOperator) {
      return res.status(403).json({
        error: `Nhân viên "${operatorUid}" không nằm trong danh sách được Quản trị viên chỉ định quyền mở khóa.`,
        status: "unauthorized_operator"
      });
    }

    let deletedCount = 0;
    if (targetFingerprint) {
      const r = await client.query("DELETE FROM user_devices WHERE device_fingerprint = $1", [targetFingerprint]);
      deletedCount += r.rowCount || 0;
    }
    if (targetUserId) {
      const r = await client.query("DELETE FROM user_devices WHERE user_id = $1", [targetUserId]);
      deletedCount += r.rowCount || 0;
    }
    if (targetUserName) {
      const r = await client.query("DELETE FROM user_devices WHERE LOWER(TRIM(user_name)) = LOWER(TRIM($1))", [targetUserName]);
      deletedCount += r.rowCount || 0;
    }

    res.json({
      success: true,
      deletedCount,
      operator: matchedOperator,
      message: `Đã mở khóa thiết bị thành công bởi nhân viên được chỉ định: ${matchedOperator.name}`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/user_devices/clear_all", async (req, res) => {
  try {
    const r = await client.query("DELETE FROM user_devices");
    res.json({ success: true, count: r.rowCount || 0, message: "Đã đặt lại toàn bộ khóa thiết bị trên toàn hệ thống" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/attendance", async (req, res) => {
  try {
    const { 
      userId, userName, department, type, location, deviceInfo, reason, deviceFingerprint, forceRebind,
      offlineTimestamp, isOfflineSync 
    } = req.body;
    
    // SERVER TIME OR VALIDATED OFFLINE CLIENT TIME
    let now = new Date();
    if (isOfflineSync && offlineTimestamp && !isNaN(Number(offlineTimestamp))) {
      const parsedOffline = Number(offlineTimestamp);
      const currentTime = Date.now();
      // Allow offline timestamp within the past 48 hours and not in future (with 5 min grace)
      if (parsedOffline > currentTime - 48 * 3600 * 1000 && parsedOffline <= currentTime + 5 * 60 * 1000) {
        now = new Date(parsedOffline);
      }
    }
    const serverTimestamp = now.getTime();

    // Resolve user info from RAM-cached users table (0 DB queries during morning peak!)
    let effectiveUserId = userId ? String(userId).trim() : '';
    let effectiveUserName = userName ? String(userName).trim() : '';
    let effectiveDepartment = department ? String(department).trim() : '';

    const allUsers = await getCachedUsers(client);
    let matchedUser = allUsers.find((u: any) => u.uid === effectiveUserId);
    if (!matchedUser && effectiveUserName) {
      const lowerName = effectiveUserName.toLowerCase();
      matchedUser = allUsers.find(
        (u: any) => u.name && u.name.trim().toLowerCase() === lowerName && (!effectiveDepartment || u.department === effectiveDepartment)
      );
      if (!matchedUser) {
        matchedUser = allUsers.find((u: any) => u.name && u.name.trim().toLowerCase() === lowerName);
      }
    }

    if (matchedUser) {
      effectiveUserId = matchedUser.uid;
      effectiveUserName = matchedUser.name;
      effectiveDepartment = matchedUser.department || effectiveDepartment;

      if (matchedUser.is_hidden || matchedUser.status === 'inactive' || matchedUser.status === 'locked') {
        const lockMsg = "Tài khoản của bạn bị khóa do chưa khai báo phòng tổ chức hành chính. Hãy khai báo để điểm danh.";
        const dateStr = getVnDateString(getVnTimeObject(now));
        client.query(
          `INSERT INTO attendance_failed 
            (user_id, user_name, department, timestamp, date_str, status, type, location, device_info, reason)
           VALUES 
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [effectiveUserId, effectiveUserName, effectiveDepartment, serverTimestamp, dateStr, 'account_locked', type, location, deviceInfo, `Tài khoản bị ẩn/khóa (${matchedUser.lock_reason || 'Chưa khai báo'})`]
        ).catch(() => {});
        return res.status(400).json({
          error: lockMsg,
          status: 'account_locked',
          lockReason: matchedUser.lock_reason || 'Chưa khai báo phòng tổ chức hành chính'
        });
      }
    }

    // Strict Numeric Employee ID Check (Block string IDs like SwhVgaPovhYgzvU5RD6f2GHWF1l1)
    const isStrictNumeric = (id: any) => typeof id === 'string' && /^\d+$/.test(id.trim());
    if (!effectiveUserId || !isStrictNumeric(effectiveUserId)) {
      const errMsg = `Mã nhân viên "${effectiveUserId || userId || 'không xác định'}" là dạng chuỗi ký tự (như "SwhVgaPovhYgzvU5RD6f2GHWF1l1"). Hệ thống không cho phép điểm danh với mã dạng chuỗi. Mã nhân viên bắt buộc phải là dạng số (ví dụ: 102, 314, 490). Vui lòng chọn lại thông tin Khoa / Phòng và chọn đúng nhân viên có mã số để điểm danh.`;
      const dateStr = getVnDateString(getVnTimeObject(now));
      client.query(
        `INSERT INTO attendance_failed 
          (user_id, user_name, department, timestamp, date_str, status, type, location, device_info, reason)
         VALUES 
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [effectiveUserId || 'unknown', effectiveUserName || 'unknown', effectiveDepartment || '', serverTimestamp, dateStr, 'invalid_employee_id', type, location, deviceInfo, errMsg]
      ).catch(() => {});
      return res.status(400).json({
        error: errMsg,
        status: 'invalid_employee_id',
        requireReselect: true
      });
    }
    
    // 1. Fetch Config & Special Employees from RAM cache (0 DB queries!)
    const [config, allSpecials] = await Promise.all([
      getCachedConfig(client),
      getCachedSpecialEmployees(client)
    ]);

    // 2. Validate Location (GPS check on server)
    const distance = getDistance(
      { latitude: Number(location.lat), longitude: Number(location.lng) },
      { latitude: Number(config.targetLat || 19.866034), longitude: Number(config.targetLng || 105.656531) }
    );
    const maxRadius = Number(config.radius) || 600;
    
    if (distance > maxRadius && type === 'in') {
        const dateStr = getVnDateString(getVnTimeObject(now));
        client.query(
          `INSERT INTO attendance_failed 
            (user_id, user_name, department, timestamp, date_str, status, type, location, device_info, reason)
           VALUES 
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [effectiveUserId, effectiveUserName, effectiveDepartment, serverTimestamp, dateStr, 'out_of_range', type, location, deviceInfo, reason || '']
        ).catch(() => {});
        return res.status(400).json({ 
            error: `Vị trí của bạn (${Math.round(distance)}m) vượt quá khoảng cách cho phép (${maxRadius}m) so với bệnh viện.`,
            status: 'out_of_range',
            distance
        });
    }

    // 3. Device Lock & Anti-Proxy Check (Combined single indexed query instead of multiple sequential queries)
    const isDeviceLockEnabled = config.enableDeviceLock !== false;
    const effectiveFp = deviceFingerprint || deviceInfo?.fingerprint || deviceInfo?.deviceId;
    
    if (effectiveFp && isDeviceLockEnabled) {
        if (forceRebind === true) {
          await client.query("DELETE FROM user_devices WHERE device_fingerprint = $1 OR user_id = $2 OR LOWER(TRIM(user_name)) = LOWER(TRIM($3))", [effectiveFp, effectiveUserId, effectiveUserName]);
          await client.query(
            `INSERT INTO user_devices (user_id, user_name, department, device_fingerprint, device_info, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (user_id) DO UPDATE SET
               user_name = EXCLUDED.user_name,
               department = EXCLUDED.department,
               device_fingerprint = EXCLUDED.device_fingerprint,
               device_info = EXCLUDED.device_info,
               updated_at = EXCLUDED.updated_at`,
            [effectiveUserId, effectiveUserName, effectiveDepartment, effectiveFp, deviceInfo ? JSON.stringify(deviceInfo) : null, serverTimestamp, serverTimestamp]
          );
        } else {
          // Combined check: fetch any row matching either device_fingerprint OR user_id/user_name in 1 query
          const deviceCheckRes = await client.query(
            `SELECT * FROM user_devices 
             WHERE device_fingerprint = $1 
                OR user_id = $2 
                OR (LOWER(TRIM(user_name)) = LOWER(TRIM($3)) AND department = $4)`,
            [effectiveFp, effectiveUserId, effectiveUserName, effectiveDepartment]
          );

          // Check A: Is this device already registered to someone else?
          const boundByFp = deviceCheckRes.rows.find((r: any) => r.device_fingerprint === effectiveFp);
          if (boundByFp) {
            const isSameUser = boundByFp.user_id === effectiveUserId || 
                               boundByFp.user_id === userId ||
                               (boundByFp.user_name && boundByFp.user_name.trim().toLowerCase() === effectiveUserName.trim().toLowerCase());
            if (!isSameUser) {
              const dateStr = getVnDateString(getVnTimeObject(now));
              client.query(
                `INSERT INTO attendance_failed 
                  (user_id, user_name, department, timestamp, date_str, status, type, location, device_info, reason)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [effectiveUserId, effectiveUserName, effectiveDepartment, serverTimestamp, dateStr, 'device_mismatch', type, location, deviceInfo, `Thiết bị đã được liên kết với nhân viên ${boundByFp.user_name} (${boundByFp.department})`]
              ).catch(() => {});
              return res.status(400).json({
                error: `Thiết bị này đã được liên kết với nhân viên "${boundByFp.user_name}" (${boundByFp.department}). Để đảm bảo tính minh bạch và phòng chống điểm danh hộ, mỗi nhân viên chỉ được sử dụng 1 thiết bị riêng. Vui lòng sử dụng đúng thiết bị của bạn hoặc liên hệ Quản trị viên để được hỗ trợ.`,
                status: 'device_mismatch',
                boundUser: { name: boundByFp.user_name, department: boundByFp.department }
              });
            }
          }

          // Check B: Has this employee already registered a different device?
          const boundByUser = deviceCheckRes.rows.find((r: any) =>
            r.user_id === effectiveUserId ||
            (r.user_name && r.user_name.trim().toLowerCase() === effectiveUserName.trim().toLowerCase() && r.department === effectiveDepartment)
          );

          if (boundByUser) {
            if (boundByUser.device_fingerprint !== effectiveFp) {
              const prevBrowser = boundByUser.device_info?.browser || 'trình duyệt khác';
              const currBrowser = deviceInfo?.browser || 'trình duyệt hiện tại';
              const isBrowserSwitch = prevBrowser !== currBrowser;
              const prevOs = boundByUser.device_info?.os;
              const currOs = deviceInfo?.os;
              const prevScreen = boundByUser.device_info?.screenRes;
              const currScreen = deviceInfo?.screenRes;

              const prevGpu = boundByUser.device_info?.gpuRenderer;
              const currGpu = deviceInfo?.gpuRenderer;
              const prevModel = boundByUser.device_info?.deviceModel;
              const currModel = deviceInfo?.deviceModel;

              const isSameMobile = (currOs === 'Android' || currOs === 'iOS') && prevOs === currOs && prevScreen === currScreen;
              const isBrowserSwitchSupported = isBrowserSwitch && (
                prevBrowser === 'Zalo' || currBrowser === 'Zalo' ||
                prevBrowser === 'Facebook' || currBrowser === 'Facebook' ||
                prevBrowser === 'Safari' || currBrowser === 'Safari' ||
                prevBrowser === 'Chrome' || currBrowser === 'Chrome' ||
                prevBrowser === 'Samsung Browser' || currBrowser === 'Samsung Browser' ||
                prevBrowser === 'Khác' || currBrowser === 'Khác'
              );
              const isHardwareTraitMatch = (prevGpu && currGpu && prevGpu !== 'none' && prevGpu === currGpu) || 
                                           (prevModel && currModel && (prevModel.toLowerCase().includes(currModel.toLowerCase()) || currModel.toLowerCase().includes(prevModel.toLowerCase())));

              const isSameDeviceDifferentBrowser = isSameMobile && (isBrowserSwitchSupported || isHardwareTraitMatch);

              if (isSameDeviceDifferentBrowser) {
                await client.query(
                  `UPDATE user_devices 
                   SET device_fingerprint = $1, device_info = $2, updated_at = $3
                   WHERE user_id = $4 OR (LOWER(TRIM(user_name)) = LOWER(TRIM($5)) AND department = $6)`,
                  [effectiveFp, deviceInfo ? JSON.stringify(deviceInfo) : null, serverTimestamp, boundByUser.user_id || effectiveUserId, effectiveUserName, effectiveDepartment]
                );
                console.log(`[SmartDevice] Nhận diện thành công cùng thiết bị vật lý cho "${effectiveUserName}" (${prevBrowser} -> ${currBrowser}, ${currOs} ${currScreen})`);
              } else {
                const dateStr = getVnDateString(getVnTimeObject(now));
                client.query(
                  `INSERT INTO attendance_failed 
                    (user_id, user_name, department, timestamp, date_str, status, type, location, device_info, reason)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                  [effectiveUserId, effectiveUserName, effectiveDepartment, serverTimestamp, dateStr, 'device_unauthorized', type, location, deviceInfo, `Nhân viên đã gắn với thiết bị khác (${boundByUser.device_fingerprint})${isBrowserSwitch ? ` - Đổi từ ${prevBrowser} sang ${currBrowser}` : ''}`]
                ).catch(() => {});
                return res.status(400).json({
                  error: isBrowserSwitch 
                    ? `Tài khoản "${effectiveUserName}" đã đăng ký bằng trình duyệt ${prevBrowser}. Hiện tại bạn đang mở qua ${currBrowser} (thường do bấm trực tiếp link trong tin nhắn Zalo). Vui lòng bấm dấu 3 chấm (...) ở góc trên màn hình Zalo và chọn "Mở bằng trình duyệt" (${prevBrowser}) hoặc liên hệ Quản lý để mở khóa.`
                    : `Tài khoản "${effectiveUserName}" đã được đăng ký trên một thiết bị khác. Để đảm bảo tính minh bạch và phòng chống điểm danh hộ, hệ thống không cho phép điểm danh trên thiết bị lạ. Nếu bạn vừa đổi điện thoại mới, vui lòng liên hệ Quản lý / Quản trị viên để mở khóa thiết bị.`,
                  status: 'device_unauthorized',
                  isBrowserSwitch,
                  prevBrowser,
                  currBrowser
                });
              }
            }
          } else {
            // Check C: First time check-in for this user on this device -> Automatically bind!
            await client.query(
              `INSERT INTO user_devices (user_id, user_name, department, device_fingerprint, device_info, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT (user_id) DO UPDATE SET 
                 device_fingerprint = EXCLUDED.device_fingerprint,
                 device_info = EXCLUDED.device_info,
                 updated_at = EXCLUDED.updated_at`,
              [effectiveUserId, effectiveUserName, effectiveDepartment, effectiveFp, deviceInfo ? JSON.stringify(deviceInfo) : null, serverTimestamp, serverTimestamp]
            );
          }
        }
    }

    // 4. Resolve Effective Schedule according to Strict Hierarchy
    let scheduleType = 'DEFAULT';
    let shiftId = '';
    let shiftName = '';
    let startDatetime: Date;
    let endDatetime: Date;
    let effectiveCheckoutDatetime: Date;
    let appliedSchedule: any;

    let lateMinutes = 0;
    let earlyLeaveMinutes = 0;

    const vnTime = getVnTimeObject(now);

    // PRIORITY 2 & 3: Check Special Priority / Custom Shifts
    const specialRows = allSpecials.filter((s: any) => 
      (s.user_id && String(s.user_id) === String(effectiveUserId)) ||
      (s.user_name && s.user_name.trim().toLowerCase() === effectiveUserName.trim().toLowerCase() && s.department === effectiveDepartment)
    );
    const specialResult = { rows: specialRows };

    const currentMinutes = vnTime.hours * 60 + vnTime.minutes;
    
    // Standard hospital config shift boundaries (Default: Morning 07:00 - 11:20, Afternoon 13:30 - 16:50)
    const morningStartStr = config.morningStart || '07:00';
    const morningEndStr = config.morningEnd || '11:20';
    const afternoonStartStr = config.afternoonStart || '13:30';
    const afternoonEndStr = config.afternoonEnd || '16:50';

    const [aStartH, aStartM] = afternoonStartStr.split(':').map(Number);
    const afternoonStartMinutes = aStartH * 60 + (aStartM || 0);

    // Determine shift (morning vs afternoon)
    let ca = 'morning';
    if (type === 'in') {
      if (currentMinutes >= Math.max(12 * 60 + 30, afternoonStartMinutes - 60)) {
        ca = 'afternoon';
      } else {
        ca = 'morning';
      }
    } else {
      if (currentMinutes < 15 * 60) {
        ca = 'morning';
      } else {
        ca = 'afternoon';
      }
    }

    let isDiLamSom = false;
    if (specialResult.rows.length > 0) {
      const specialEmp = specialResult.rows[0];
      const isNuoiConNho = (specialEmp.employee_type || '').toLowerCase().includes('nuôi con nhỏ') ||
                           (specialEmp.employee_type || '').toLowerCase().includes('nuoi con nho');

      isDiLamSom = (specialEmp.employee_type || '').toLowerCase().includes('đi làm sớm') ||
                   (specialEmp.employee_type || '').toLowerCase().includes('di lam som') ||
                   Boolean(!isNuoiConNho && specialEmp.custom_start_time);

      if (isNuoiConNho) {
        scheduleType = 'CHILDCARE_PRIORITY';
        const earlyAllowedMins = Number(specialEmp.early_minutes) || 30;
        
        const startStr = ca === 'morning' ? morningStartStr : afternoonStartStr;
        const endStr = ca === 'morning' ? morningEndStr : afternoonEndStr;
        const [sH, sM] = startStr.split(':').map(Number);
        const [eH, eM] = endStr.split(':').map(Number);

        startDatetime = vnTime.getDateForVnTime(sH, sM);
        endDatetime = vnTime.getDateForVnTime(eH, eM);
        
        effectiveCheckoutDatetime = new Date(endDatetime.getTime() - earlyAllowedMins * 60 * 1000);
        shiftId = ca;
        shiftName = ca === 'morning' ? 'Sáng' : 'Chiều';

        appliedSchedule = {
          scheduleType,
          shiftId,
          shiftName,
          employeeType: 'Nuôi con nhỏ',
          earlyAllowedMinutes: earlyAllowedMins,
          startDatetime,
          endDatetime,
          effectiveCheckoutDatetime
        };
      } else if (isDiLamSom || (specialEmp.custom_start_time && specialEmp.custom_end_time)) {
        scheduleType = 'CUSTOM_SCHEDULE';
        const startTimeStr = specialEmp.custom_start_time || '06:00';
        const endTimeStr = specialEmp.custom_end_time || '10:20';
        const [sH, sM] = startTimeStr.split(':').map(Number);
        const [eH, eM] = endTimeStr.split(':').map(Number);

        startDatetime = vnTime.getDateForVnTime(sH, sM);
        endDatetime = vnTime.getDateForVnTime(eH, eM);

        if (sH > eH) {
          shiftId = 'night_custom';
          shiftName = 'Ca đêm riêng';
          if (vnTime.hours < eH + 4) {
             startDatetime = new Date(startDatetime.getTime() - 24 * 60 * 60 * 1000);
          } else {
             endDatetime = new Date(endDatetime.getTime() + 24 * 60 * 60 * 1000);
          }
        } else {
          shiftId = 'custom';
          shiftName = specialEmp.employee_type || 'Đi làm sớm';
        }

        effectiveCheckoutDatetime = new Date(endDatetime);

        appliedSchedule = {
          scheduleType,
          shiftId,
          shiftName,
          isDiLamSom,
          customStartTime: specialEmp.custom_start_time,
          customEndTime: specialEmp.custom_end_time,
          startDatetime,
          endDatetime,
          effectiveCheckoutDatetime
        };
      }
    }

    // PRIORITY 4: Đối tượng bình thường (Hành chính chuẩn)
    if (scheduleType === 'DEFAULT') {
      const startStr = ca === 'morning' ? morningStartStr : afternoonStartStr;
      const endStr = ca === 'morning' ? morningEndStr : afternoonEndStr;
      const [sH, sM] = startStr.split(':').map(Number);
      const [eH, eM] = endStr.split(':').map(Number);

      startDatetime = vnTime.getDateForVnTime(sH, sM);
      endDatetime = vnTime.getDateForVnTime(eH, eM);
      
      effectiveCheckoutDatetime = new Date(endDatetime);
      shiftId = ca;
      shiftName = ca === 'morning' ? 'Sáng' : 'Chiều';

      appliedSchedule = {
        scheduleType,
        shiftId,
        shiftName,
        startDatetime,
        endDatetime,
        effectiveCheckoutDatetime
      };
    }

    const currentShiftDateStr = getVnDateString(getVnTimeObject(startDatetime!));
    let greetingMsg = '';

    if (type === 'in') {
      // Idempotent anti-duplicate check-in for the same shift on the same shift date
      const existingIn = await client.query(`
        SELECT id, timestamp, late_minutes FROM attendance 
        WHERE (user_id = $1 OR (LOWER(TRIM(user_name)) = LOWER(TRIM($2)) AND department = $3)) 
        AND shift_id = $4 AND date_str = $5 AND type = 'in'
        ORDER BY timestamp ASC LIMIT 1
      `, [effectiveUserId, effectiveUserName, effectiveDepartment, shiftId, currentShiftDateStr]);

      if (existingIn.rows.length > 0) {
        const existingRow = existingIn.rows[0];
        const existingTs = Number(existingRow.timestamp) || serverTimestamp;
        const existingLate = Number(existingRow.late_minutes) || 0;
        const timeStr = format(new Date(existingTs), 'HH:mm:ss');

        // Return HTTP 200 Idempotent Success (as requested by user) so slow network retries or double-taps never show an error!
        const idempotentMsg = existingLate > 0
          ? `Chào bạn ${effectiveUserName}, bạn đã chấm công vào thành công lúc ${timeStr} (Ghi nhận đi muộn ${existingLate} phút).`
          : `Chào bạn ${effectiveUserName}, bạn đã chấm công vào thành công lúc ${timeStr}.`;

        return res.json({ 
          id: existingRow.id.toString(), 
          alreadyRecorded: true,
          timestamp: existingTs,
          dateStr: currentShiftDateStr,
          message: idempotentMsg, 
          distance,
          isLate: existingLate > 0,
          lateMinutes: existingLate,
          shift: shiftName,
          shiftId
        });
      }

      // Late arrival calculation: Exactly from startDatetime (e.g. 07:01 -> 1 min late)
      if (now > startDatetime!) {
        lateMinutes = Math.floor((now.getTime() - startDatetime!.getTime()) / 60000);
        greetingMsg = `Chào bạn ${effectiveUserName}, bạn đã chấm công vào thành công (Ghi nhận đi muộn ${lateMinutes} phút).`;
      } else {
        lateMinutes = 0;
        greetingMsg = `Chào bạn ${effectiveUserName}, bạn đã chấm công vào thành công.`;
      }
    } else if (type === 'out') {
      if (!isOfflineSync && !req.body.confirmedQuickOut) {
        const recentIn = await client.query(`
          SELECT timestamp FROM attendance 
          WHERE (user_id = $1 OR (LOWER(TRIM(user_name)) = LOWER(TRIM($2)) AND department = $3)) 
          AND date_str = $4 AND type = 'in'
          ORDER BY timestamp DESC LIMIT 1
        `, [effectiveUserId, effectiveUserName, effectiveDepartment, currentShiftDateStr]);

        if (recentIn.rows.length > 0) {
          const lastInMs = Number(recentIn.rows[0].timestamp);
          if (now.getTime() - lastInMs < 45000) {
            return res.status(400).json({
              error: `Bạn vừa điểm danh VÀO CA cách đây ít giây. Hệ thống đã ngăn chặn thao tác RA CA tự động để tránh lỗi bấm 2 lần liên tục. Vui lòng xác nhận nếu bạn thực sự muốn ra ca!`,
              status: 'too_fast_checkout'
            });
          }
        }
      }

      if (isDiLamSom) {
        earlyLeaveMinutes = 0;
        greetingMsg = `Chào bạn ${effectiveUserName}, bạn đã chấm công ra thành công.`;
      } else if (now < effectiveCheckoutDatetime!) {
        earlyLeaveMinutes = Math.floor((effectiveCheckoutDatetime!.getTime() - now.getTime()) / 60000);
        greetingMsg = `Chào bạn ${effectiveUserName}, bạn đã chấm công ra thành công (Ghi nhận về sớm ${earlyLeaveMinutes} phút).`;
      } else {
        earlyLeaveMinutes = 0;
        greetingMsg = `Chào bạn ${effectiveUserName}, bạn đã chấm công ra thành công.`;
      }

      // Check if checkout record already exists -> update it with latest timestamp
      const existingOut = await client.query(`
        SELECT id FROM attendance 
        WHERE (user_id = $1 OR (LOWER(TRIM(user_name)) = LOWER(TRIM($2)) AND department = $3)) 
        AND shift_id = $4 AND date_str = $5 AND type = 'out'
        ORDER BY timestamp DESC LIMIT 1
      `, [effectiveUserId, effectiveUserName, effectiveDepartment, shiftId, currentShiftDateStr]);

      const offlinePrefix = isOfflineSync ? 'Điểm danh ngoại tuyến - ' : '';
      const finalOutReason = reason || (earlyLeaveMinutes > 0 ? `${offlinePrefix}Về sớm ${earlyLeaveMinutes} phút` : (isOfflineSync ? 'Điểm danh ngoại tuyến - Đã đồng bộ khi có mạng' : ''));

      if (existingOut.rows.length > 0) {
        const outId = existingOut.rows[0].id;
        await client.query(`
          UPDATE attendance SET 
            timestamp = $1,
            location = $2,
            device_info = $3,
            reason = $4,
            shift = $5,
            late_minutes = $6,
            early_leave_minutes = $7,
            applied_schedule = $8,
            status = 'success'
          WHERE id = $9
        `, [
          serverTimestamp, 
          location, 
          deviceInfo, 
          finalOutReason, 
          shiftName, 
          lateMinutes, 
          earlyLeaveMinutes, 
          JSON.stringify(appliedSchedule), 
          outId
        ]);

        return res.json({ 
          id: outId.toString(), 
          timestamp: serverTimestamp,
          dateStr: currentShiftDateStr,
          message: greetingMsg, 
          distance, 
          updated: true,
          isEarly: earlyLeaveMinutes > 0,
          earlyMinutes: earlyLeaveMinutes,
          shift: shiftName,
          shiftId
        });
      }
    }

    const offlinePrefix = isOfflineSync ? 'Điểm danh ngoại tuyến - ' : '';
    const finalInsertReason = reason || (earlyLeaveMinutes > 0 ? `${offlinePrefix}Về sớm ${earlyLeaveMinutes} phút` : (isOfflineSync ? 'Điểm danh ngoại tuyến - Đã đồng bộ khi có mạng' : ''));

    // Insert new attendance record
    const result = await client.query(
      `INSERT INTO attendance 
      (user_id, user_name, department, timestamp, date_str, status, type, location, device_info, reason, shift, late_minutes, early_leave_minutes, shift_id, applied_schedule) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) 
      RETURNING id`,
      [
        effectiveUserId, 
        effectiveUserName, 
        effectiveDepartment, 
        serverTimestamp, 
        currentShiftDateStr, 
        'success', 
        type, 
        location, 
        deviceInfo, 
        finalInsertReason, 
        shiftName, 
        lateMinutes, 
        earlyLeaveMinutes, 
        shiftId, 
        JSON.stringify(appliedSchedule)
      ]
    );

    res.json({ 
      id: result.rows[0].id.toString(), 
      timestamp: serverTimestamp,
      dateStr: currentShiftDateStr,
      message: greetingMsg, 
      distance,
      isEarly: earlyLeaveMinutes > 0,
      earlyMinutes: earlyLeaveMinutes,
      isLate: lateMinutes > 0,
      lateMinutes,
      shift: shiftName,
      shiftId
    });

  } catch (err: any) {
    console.error('Error in POST /api/attendance:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/attendance/:id", async (req, res) => {
  try {
    const { 
      userId, userName, department, timestamp, dateStr, 
      status, type, location, deviceInfo, reason, shift, lateMinutes, earlyLeaveMinutes
    } = req.body;
    
    await client.query(
      `UPDATE attendance SET
        user_id = $1, user_name = $2, department = $3, timestamp = $4, date_str = $5, 
        status = $6, type = $7, location = $8, device_info = $9, reason = $10, shift = $11, late_minutes = $12, early_leave_minutes = $13
       WHERE id = $14`,
      [userId, userName, department, timestamp, dateStr, status, type, location, deviceInfo, reason, shift, lateMinutes, earlyLeaveMinutes, req.params.id]
    );
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/attendance/:id", async (req, res) => {
  try {
    await client.query("DELETE FROM attendance WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// ----------------------------------------------------
// Notifications API
// ----------------------------------------------------
app.get("/api/notifications", async (req, res) => {
  try {
    const { all } = req.query;
    if (all !== 'true') {
      const notifs = await getCachedActiveNotifications(client);
      return res.json(notifs);
    }
    const result = await client.query("SELECT * FROM notifications ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/notifications", async (req, res) => {
  try {
    const { title, content, type } = req.body;
    const result = await client.query(
      "INSERT INTO notifications (title, content, type) VALUES ($1, $2, $3) RETURNING *",
      [title, content, type || 'info']
    );
    invalidateNotificationsCache();
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/notifications/:id", async (req, res) => {
  try {
    const { title, content, type, is_active } = req.body;
    const result = await client.query(
      "UPDATE notifications SET title = $1, content = $2, type = $3, is_active = $4 WHERE id = $5 RETURNING *",
      [title, content, type, is_active, req.params.id]
    );
    invalidateNotificationsCache();
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/notifications/:id", async (req, res) => {
  try {
    await client.query("DELETE FROM notifications WHERE id = $1", [req.params.id]);
    invalidateNotificationsCache();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// FCM Push Tokens & Notifications API
// ----------------------------------------------------
async function initFCMTables() {
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_fcm_tokens (
        id SERIAL PRIMARY KEY,
        token TEXT UNIQUE NOT NULL,
        user_id VARCHAR(255),
        user_name VARCHAR(255),
        department VARCHAR(255),
        device_info JSONB,
        remind_morning BOOLEAN DEFAULT true,
        remind_afternoon BOOLEAN DEFAULT true,
        remind_checkout BOOLEAN DEFAULT true,
        advance_minutes INTEGER DEFAULT 5,
        last_notified_at BIGINT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user ON user_fcm_tokens(user_id, user_name);
    `);
  } catch (e) {
    console.error('Error initializing FCM tables:', e);
  }
}
initFCMTables();

app.post("/api/fcm/register_token", async (req, res) => {
  try {
    const { token, userId, userName, department, remindMorning, remindAfternoon, remindCheckout, advanceMinutes, deviceInfo } = req.body;
    if (!token) {
      return res.status(400).json({ error: "Missing token" });
    }

    const result = await client.query(`
      INSERT INTO user_fcm_tokens 
        (token, user_id, user_name, department, remind_morning, remind_afternoon, remind_checkout, advance_minutes, device_info, updated_at)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
      ON CONFLICT (token) DO UPDATE SET
        user_id = COALESCE(EXCLUDED.user_id, user_fcm_tokens.user_id),
        user_name = COALESCE(EXCLUDED.user_name, user_fcm_tokens.user_name),
        department = COALESCE(EXCLUDED.department, user_fcm_tokens.department),
        remind_morning = COALESCE(EXCLUDED.remind_morning, user_fcm_tokens.remind_morning),
        remind_afternoon = COALESCE(EXCLUDED.remind_afternoon, user_fcm_tokens.remind_afternoon),
        remind_checkout = COALESCE(EXCLUDED.remind_checkout, user_fcm_tokens.remind_checkout),
        advance_minutes = COALESCE(EXCLUDED.advance_minutes, user_fcm_tokens.advance_minutes),
        device_info = COALESCE(EXCLUDED.device_info, user_fcm_tokens.device_info),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [
      token,
      userId || null,
      userName || null,
      department || null,
      remindMorning !== undefined ? !!remindMorning : true,
      remindAfternoon !== undefined ? !!remindAfternoon : true,
      remindCheckout !== undefined ? !!remindCheckout : true,
      advanceMinutes !== undefined && advanceMinutes !== null ? parseInt(advanceMinutes, 10) : 5,
      deviceInfo || null
    ]);

    res.json({ success: true, tokenData: result.rows[0] });
  } catch (err: any) {
    console.error("Error in /api/fcm/register_token:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/fcm/tokens", async (req, res) => {
  try {
    const result = await client.query(`
      SELECT id, token, user_id, user_name, department, remind_morning, remind_afternoon, remind_checkout, advance_minutes, device_info, last_notified_at, created_at, updated_at
      FROM user_fcm_tokens
      ORDER BY updated_at DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/fcm/token", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Missing token" });
    await client.query("DELETE FROM user_fcm_tokens WHERE token = $1", [token]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/fcm/test_notification", async (req, res) => {
  try {
    const { token, title, body } = req.body;
    const notifTitle = title || "⏰ Thông báo thử nghiệm chấm công";
    const notifContent = body || "Hệ thống thông báo nhắc nhở điểm danh hoạt động tốt!";

    const notifRes = await client.query(
      "INSERT INTO notifications (title, content, type) VALUES ($1, $2, $3) RETURNING *",
      [notifTitle, notifContent, "info"]
    );

    if (token) {
      await client.query(
        "UPDATE user_fcm_tokens SET last_notified_at = $1 WHERE token = $2",
        [Date.now(), token]
      );
    }

    res.json({ success: true, notification: notifRes.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/fcm/broadcast", async (req, res) => {
  try {
    const { title, content, type, department } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: "Missing title or content" });
    }

    const notifRes = await client.query(
      "INSERT INTO notifications (title, content, type) VALUES ($1, $2, $3) RETURNING *",
      [title, content, type || "warning"]
    );

    let query = "SELECT COUNT(*) as count FROM user_fcm_tokens";
    let params: any[] = [];
    if (department && department !== "all") {
      query += " WHERE department = $1";
      params.push(department);
    }
    const tokenCount = await client.query(query, params);

    res.json({
      success: true,
      notification: notifRes.rows[0],
      targetedDevices: parseInt(tokenCount.rows[0]?.count || "0", 10)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Automated Shift Reminder Checker
let lastRemindedFlags: Record<string, boolean> = {};

async function checkAndSendShiftReminders() {
  try {
    const vnTime = getVnTimeObject(new Date());
    const dateStr = getVnDateString(vnTime);
    const currentTotalMin = vnTime.hours * 60 + vnTime.minutes;

    const config = await getCachedConfig(client);
    const morningStart = config.morningStart || "07:00";
    const morningEnd = config.morningEnd || "11:20";
    const afternoonStart = config.afternoonStart || "13:30";
    const afternoonEnd = config.afternoonEnd || "16:50";

    const [mStartH, mStartM] = morningStart.split(":").map(Number);
    const [aStartH, aStartM] = afternoonStart.split(":").map(Number);
    const [mEndH, mEndM] = morningEnd.split(":").map(Number);
    const [aEndH, aEndM] = afternoonEnd.split(":").map(Number);

    const mStartTotalMin = mStartH * 60 + mStartM;
    const aStartTotalMin = aStartH * 60 + aStartM;
    const mEndTotalMin = mEndH * 60 + mEndM;
    const aEndTotalMin = aEndH * 60 + aEndM;

    const advanceMin = 5;

    // 1. Nhắc vào ca sáng (trước 5 phút, ví dụ: 06:55 khi ca bắt đầu 07:00)
    const morningInKey = `${dateStr}_morning_in`;
    if (currentTotalMin >= mStartTotalMin - advanceMin && currentTotalMin < mStartTotalMin && !lastRemindedFlags[morningInKey]) {
      lastRemindedFlags[morningInKey] = true;
      console.log(`[Auto-Reminder] Gửi thông báo nhắc nhở ca sáng lúc ${morningStart}...`);
      await client.query(
        "INSERT INTO notifications (title, content, type) VALUES ($1, $2, $3)",
        [
          `⏰ Nhắc nhở chấm công Ca Sáng (${morningStart})`,
          `Còn ${advanceMin} phút nữa là đến giờ vào ca sáng (${morningStart}). Quý nhân viên hãy kiểm tra GPS và chuẩn bị điểm danh đúng giờ nhé!`,
          "warning"
        ]
      );
      await client.query("UPDATE user_fcm_tokens SET last_notified_at = $1 WHERE remind_morning = true", [Date.now()]);
    }

    // 2. Nhắc vào ca chiều (trước 5 phút, ví dụ: 13:25 khi ca bắt đầu 13:30)
    const afternoonInKey = `${dateStr}_afternoon_in`;
    if (currentTotalMin >= aStartTotalMin - advanceMin && currentTotalMin < aStartTotalMin && !lastRemindedFlags[afternoonInKey]) {
      lastRemindedFlags[afternoonInKey] = true;
      console.log(`[Auto-Reminder] Gửi thông báo nhắc nhở ca chiều lúc ${afternoonStart}...`);
      await client.query(
        "INSERT INTO notifications (title, content, type) VALUES ($1, $2, $3)",
        [
          `⏰ Nhắc nhở chấm công Ca Chiều (${afternoonStart})`,
          `Còn ${advanceMin} phút nữa là đến giờ vào ca chiều (${afternoonStart}). Quý nhân viên hãy mở ứng dụng để điểm danh ghi nhận có mặt!`,
          "warning"
        ]
      );
      await client.query("UPDATE user_fcm_tokens SET last_notified_at = $1 WHERE remind_afternoon = true", [Date.now()]);
    }

    // 3. Nhắc ra ca sáng (khi đến giờ tan ca sáng, ví dụ: 11:20)
    const morningOutKey = `${dateStr}_morning_out`;
    if (currentTotalMin >= mEndTotalMin && currentTotalMin < mEndTotalMin + 5 && !lastRemindedFlags[morningOutKey]) {
      lastRemindedFlags[morningOutKey] = true;
      console.log(`[Auto-Reminder] Gửi thông báo kết thúc ca sáng lúc ${morningEnd}...`);
      await client.query(
        "INSERT INTO notifications (title, content, type) VALUES ($1, $2, $3)",
        [
          `🔔 Hết ca làm việc Buổi Sáng (${morningEnd})`,
          `Đã đến ${morningEnd}, kết thúc ca sáng. Quý nhân viên vui lòng quét mã ghi nhận ra ca!`,
          "info"
        ]
      );
      await client.query("UPDATE user_fcm_tokens SET last_notified_at = $1 WHERE remind_checkout = true", [Date.now()]);
    }

    // 4. Nhắc ra ca chiều (khi đến giờ tan ca chiều, ví dụ: 16:50)
    const afternoonOutKey = `${dateStr}_afternoon_out`;
    if (currentTotalMin >= aEndTotalMin && currentTotalMin < aEndTotalMin + 5 && !lastRemindedFlags[afternoonOutKey]) {
      lastRemindedFlags[afternoonOutKey] = true;
      console.log(`[Auto-Reminder] Gửi thông báo kết thúc ca chiều lúc ${afternoonEnd}...`);
      await client.query(
        "INSERT INTO notifications (title, content, type) VALUES ($1, $2, $3)",
        [
          `🔔 Hết ca làm việc Buổi Chiều (${afternoonEnd})`,
          `Đã đến ${afternoonEnd}, kết thúc ca chiều. Chúc quý nhân viên có những phút giây nghỉ ngơi vui vẻ bên gia đình!`,
          "info"
        ]
      );
      await client.query("UPDATE user_fcm_tokens SET last_notified_at = $1 WHERE remind_checkout = true", [Date.now()]);
    }

    // Dọn dẹp cache flags cũ sau 2 ngày
    const keys = Object.keys(lastRemindedFlags);
    if (keys.length > 20) {
      lastRemindedFlags = {};
    }
  } catch (err) {
    console.error("[Auto-Reminder Error]", err);
  }
}

// Chạy cron kiểm tra nhắc nhở mỗi 60 giây (Đã tắt tính năng thông báo FCM Widget theo yêu cầu)
// setInterval(checkAndSendShiftReminders, 60000);

app.post("/api/fcm/trigger_shift_reminder", async (req, res) => {
  try {
    await checkAndSendShiftReminders();
    res.json({ success: true, message: "Đã kích hoạt quét kiểm tra thông báo nhắc nhở ca làm việc!" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// ----------------------------------------------------
// ----------------------------------------------------
// Duty Shifts / Lịch trực API & Helpers
// ----------------------------------------------------

// Name normalization & matcher helper for server-side
function serverNormalize(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function cleanShiftRawName(raw: string): { cleanName: string; extraNote: string } {
  let text = raw.trim();
  let extraNote = '';

  // Extract parentheses notes e.g. (kèm), (hv), (học việc)
  const parenMatch = text.match(/\((.*?)\)/);
  if (parenMatch) {
    extraNote = parenMatch[1].trim();
    text = text.replace(/\(.*?\)/g, '').trim();
  }

  // Check hospital department tag suffixes e.g. "cc", "đy", "nhi", "nội", "cđha", "ck", "pk", "gm", "san", "hv", "nb"
  const tokens = text.split(/\s+/);
  if (tokens.length >= 2) {
    const lastToken = serverNormalize(tokens[tokens.length - 1]);
    const deptTagMap: Record<string, string> = {
      'cc': 'Cấp cứu',
      'dy': 'Đông y',
      'nhi': 'Khoa Nhi',
      'noi': 'Khoa Nội',
      'ngoa': 'Khoa Ngoại',
      'ngoai': 'Khoa Ngoại',
      'cdha': 'CĐHA',
      'ck': 'Chuyên khoa',
      'pk': 'Phòng khám',
      'gm': 'Gây mê',
      'gmhs': 'GMHS',
      'hs': 'Hộ sinh',
      'tn': 'Truyền nhiễm',
      'lck': 'LCK',
      'lx': 'Lái xe',
      'san': 'Phụ sản',
      'hv': 'Học việc',
      'nb': 'Ngoại B'
    };

    if (deptTagMap[lastToken]) {
      const tagDesc = deptTagMap[lastToken];
      extraNote = extraNote ? `${tagDesc} • ${extraNote}` : tagDesc;
      tokens.pop();
      text = tokens.join(' ').trim();
    }
  }

  return { cleanName: text, extraNote };
}

// Ensure database tables exist for hospital duty schedules and duty shifts
async function initDutyTables() {
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS hospital_duty_schedules (
        id SERIAL PRIMARY KEY,
        week_number INTEGER NOT NULL,
        year INTEGER NOT NULL,
        start_date VARCHAR(50) NOT NULL,
        end_date VARCHAR(50) NOT NULL,
        title VARCHAR(255),
        leader_on_duty VARCHAR(255),
        notes JSONB DEFAULT '[]'::jsonb,
        schedule_data JSONB DEFAULT '[]'::jsonb,
        holy_data JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT hospital_duty_schedules_week_year_key UNIQUE (week_number, year)
      );

      CREATE TABLE IF NOT EXISTS duty_shifts (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100),
        user_name VARCHAR(255) NOT NULL,
        department VARCHAR(255),
        duty_role VARCHAR(255),
        shift_name VARCHAR(100),
        date_str VARCHAR(50) NOT NULL,
        day_of_week VARCHAR(50),
        week_number INTEGER,
        year INTEGER,
        week_start_date VARCHAR(50),
        week_end_date VARCHAR(50),
        start_time VARCHAR(20) DEFAULT '07:30',
        end_time VARCHAR(20) DEFAULT '07:30',
        note TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_duty_shifts_dates ON duty_shifts(date_str, week_number, year);
      CREATE INDEX IF NOT EXISTS idx_duty_shifts_user ON duty_shifts(user_name, user_id);
    `);
  } catch (e) {
    console.error('Error initializing duty tables:', e);
  }
}
initDutyTables();

// Unpack master hospital schedule into individual duty_shifts records
async function syncMasterScheduleToDutyShifts(db: any, sched: {
  weekNumber: number;
  year: number;
  startDate: string;
  endDate: string;
  scheduleData: any[];
  holyData?: any[];
}) {
  const { weekNumber, year, startDate, endDate, scheduleData, holyData } = sched;
  if (!Array.isArray(scheduleData)) return 0;

  // Fetch all known users to bind user_id and normalized names
  let usersList: any[] = [];
  try {
    const uRes = await db.query("SELECT uid, name, department FROM users");
    usersList = uRes.rows;
  } catch (e) {}

  await db.query("DELETE FROM duty_shifts WHERE week_number = $1 AND year = $2", [weekNumber, year]);

  let totalInserted = 0;

  const roleDefinitions: { field: string; role: string; dept: string; shiftName?: string; startTime?: string; endTime?: string }[] = [
    { field: 'leader', role: 'Trực Lãnh đạo', dept: 'Ban Giám Đốc' },
    { field: 'doctor1', role: 'Bác sỹ trực cấp cứu', dept: 'Khối Bác sĩ' },
    { field: 'doctor2', role: 'Bác sỹ trực cấp cứu (kèm)', dept: 'Khối Bác sĩ' },
    { field: 'doctor9Floor', role: 'BS Trực nhà 9 tầng', dept: 'Khối Bác sĩ / Nhà 9 tầng' },
    { field: 'nurse1', role: 'Điều dưỡng trực chung CC', dept: 'Khoa Cấp cứu' },
    { field: 'nurse2', role: 'Điều dưỡng trực chung CC', dept: 'Khoa Cấp cứu' },
    { field: 'nhi_lck1', role: 'Trực Nhi + LCK', dept: 'Khoa Nhi - LCK' },
    { field: 'nhi_lck2', role: 'Trực Nhi + LCK', dept: 'Khoa Nhi - LCK' },
    { field: 'noi_lao1', role: 'Trực Nội - Lão', dept: 'Khoa Nội - Lão' },
    { field: 'noi_lao2', role: 'Trực Nội - Lão', dept: 'Khoa Nội - Lão' },
    { field: 'truyen_nhiem', role: 'Trực Truyền nhiễm', dept: 'Khoa Truyền nhiễm' },
    { field: 'ngoai1', role: 'Trực Ngoại', dept: 'Khoa Ngoại' },
    { field: 'ngoai2', role: 'Trực Ngoại', dept: 'Khoa Ngoại' },
    { field: 'dong_y1', role: 'Trực Đông y', dept: 'Khoa YHCT - PHCN' },
    { field: 'dong_y2', role: 'Trực Đông y', dept: 'Khoa YHCT - PHCN' },
    { field: 'ho_sinh1', role: 'Trực Hộ sinh', dept: 'Khoa Phụ sản' },
    { field: 'ho_sinh2', role: 'Trực Hộ sinh', dept: 'Khoa Phụ sản' },
    { field: 'sa_xquang1', role: 'Trực Siêu âm - X.Quang', dept: 'Khoa CĐHA' },
    { field: 'sa_xquang2', role: 'Trực Siêu âm - X.Quang', dept: 'Khoa CĐHA' },
    { field: 'danh_may1', role: 'Đánh máy Siêu âm', dept: 'Khoa CĐHA' },
    { field: 'danh_may2', role: 'Đánh máy Siêu âm', dept: 'Khoa CĐHA' },
    { field: 'xet_nghiem', role: 'Trực Xét nghiệm', dept: 'Khoa Xét nghiệm' },
    { field: 'lai_xe', role: 'Trực Lái xe cấp cứu', dept: 'Đội xe' },
    { field: 'phau_thuat', role: 'Trực Phẫu thuật (Ngoại viện)', dept: 'Khoa GMHS' },
    { field: 'gay_me', role: 'Trực Gây mê (Ngoại viện)', dept: 'Khoa GMHS' },
    { field: 'phan_luong1', role: 'Phân luồng, HD-BN tại PK', dept: 'Khoa Khám bệnh' },
    { field: 'phan_luong2', role: 'Phân luồng, HD-BN tại PK', dept: 'Khoa Khám bệnh' },
    { field: 'pk_ca_ngay1', role: 'Đi làm phòng khám cả ngày', dept: 'Khoa Khám bệnh', shiftName: 'Ca Ngày PK', startTime: '07:30', endTime: '17:00' },
    { field: 'pk_ca_ngay2', role: 'Đi làm phòng khám cả ngày', dept: 'Khoa Khám bệnh', shiftName: 'Ca Ngày PK', startTime: '07:30', endTime: '17:00' },
    { field: 'pk_ca_ngay3', role: 'Đi làm phòng khám cả ngày', dept: 'Khoa Khám bệnh', shiftName: 'Ca Ngày PK', startTime: '07:30', endTime: '17:00' },
    { field: 'pk_ca_ngay4', role: 'Đi làm phòng khám cả ngày', dept: 'Khoa Khám bệnh', shiftName: 'Ca Ngày PK', startTime: '07:30', endTime: '17:00' },
    { field: 'pk_t7_cn', role: 'Đi làm phòng khám T7 1/2, CN', dept: 'Khoa Khám bệnh', shiftName: 'Ca PK T7/CN', startTime: '07:30', endTime: '11:30' },
    { field: 'pk_san', role: 'Khám Phòng khám Sản', dept: 'Khoa Phụ sản', shiftName: 'Ca PK Sản', startTime: '07:30', endTime: '17:00' }
  ];

  for (const row of scheduleData) {
    const dateIso = row.dateIso || startDate;
    const dayLabel = row.dayLabel || '';

    for (const def of roleDefinitions) {
      const cellVal = row[def.field];
      if (!cellVal || typeof cellVal !== 'string' || cellVal.trim() === '' || cellVal.trim() === '-') continue;

      // Thoroughly split multiple names across lines, slashes, commas, dashes, pluses
      const splitChunks = cellVal.split(/[\r\n,;/+–—]|\s+-\s+|\s+–\s+/).map(s => s.trim()).filter(s => s.length > 0 && s !== '-');

      for (const chunk of splitChunks) {
        const { cleanName, extraNote } = cleanShiftRawName(chunk);
        if (!cleanName || cleanName === '-') continue;

        // Try to match a registered user
        const normClean = serverNormalize(cleanName);
        let matchedUserId: string | null = null;
        let finalUserName = cleanName;
        let finalDept = def.dept;

        const foundUser = usersList.find(u => {
          const uNorm = serverNormalize(u.name);
          if (uNorm === normClean) return true;
          if (uNorm.includes(normClean)) return true;
          const uWords = uNorm.split(/\s+/);
          const uLast = uWords[uWords.length - 1];
          const cWords = normClean.replace(/[.\-_]/g, ' ').split(/\s+/);
          const cLast = cWords[cWords.length - 1];
          return uLast && cLast && uLast === cLast && uLast.length >= 2;
        });

        if (foundUser) {
          matchedUserId = foundUser.uid;
          finalUserName = foundUser.name;
          if (foundUser.department) finalDept = foundUser.department;
        }

        await db.query(`
          INSERT INTO duty_shifts (
            user_id, user_name, department, duty_role, shift_name, 
            date_str, day_of_week, week_number, year, week_start_date, week_end_date, 
            start_time, end_time, note
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `, [
          matchedUserId,
          finalUserName,
          finalDept,
          def.role,
          def.shiftName || 'Trực 24/24',
          dateIso,
          dayLabel,
          weekNumber,
          year,
          startDate,
          endDate,
          def.startTime || '07:30',
          def.endTime || '07:30',
          extraNote || chunk !== finalUserName ? chunk : ''
        ]);
        totalInserted++;
      }
    }
  }

  // Handle Holy Data (Hộ lý các tầng T7 / CN)
  if (Array.isArray(holyData)) {
    for (const hRow of holyData) {
      const isSun = serverNormalize(hRow.dayLabel).includes('chu nhat') || serverNormalize(hRow.dayLabel).includes('cn');
      const dateIso = isSun ? (scheduleData[6]?.dateIso || endDate) : (scheduleData[5]?.dateIso || endDate);
      const dayLabel = hRow.dayLabel || (isSun ? 'Chủ nhật' : 'Thứ 7');

      const holyCols: { field: string; location: string }[] = [
        { field: 'tang1_2', location: 'Tầng 1-2' },
        { field: 'tang3_4', location: 'Tầng 3-4' },
        { field: 'tang5_6', location: 'Tầng 5-6' },
        { field: 'tang7_8', location: 'Tầng 7-8' },
        { field: 'pk_hscc', location: 'PK-HSCC' }
      ];

      for (const hCol of holyCols) {
        const cellVal = hRow[hCol.field];
        if (!cellVal || typeof cellVal !== 'string' || cellVal.trim() === '' || cellVal.trim() === '-') continue;

        const chunks = cellVal.split(/[\r\n,;/+–—]|\s+-\s+|\s+–\s+/).map(s => s.trim()).filter(s => s.length > 0 && s !== '-');
        for (const chunk of chunks) {
          const { cleanName, extraNote } = cleanShiftRawName(chunk);
          if (!cleanName || cleanName === '-') continue;

          await db.query(`
            INSERT INTO duty_shifts (
              user_id, user_name, department, duty_role, shift_name, 
              date_str, day_of_week, week_number, year, week_start_date, week_end_date, 
              start_time, end_time, note
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          `, [
            null,
            cleanName,
            'Tổ Hộ lý',
            `Hộ lý ${hCol.location}`,
            'Hộ lý ca ngày',
            dateIso,
            dayLabel,
            weekNumber,
            year,
            startDate,
            endDate,
            '07:00',
            '17:00',
            extraNote ? `${hCol.location} (${extraNote})` : hCol.location
          ]);
          totalInserted++;
        }
      }
    }
  }

  return totalInserted;
}

app.get("/api/duty_shifts", async (req, res) => {
  try {
    const { startDate, endDate, dateStr, weekStartDate, weekEndDate, weekNumber, year, department, userId, userName, search } = req.query;
    let query = `
      SELECT 
        id, 
        user_id as "userId", 
        user_name as "userName", 
        department, 
        duty_role as "dutyRole", 
        shift_name as "shiftName", 
        date_str as "dateStr", 
        day_of_week as "dayOfWeek", 
        week_number as "weekNumber", 
        year, 
        week_start_date as "weekStartDate", 
        week_end_date as "weekEndDate", 
        start_time as "startTime", 
        end_time as "endTime", 
        note, 
        created_at as "createdAt"
      FROM duty_shifts
      WHERE 1=1
    `;
    const params: any[] = [];
    let pIdx = 1;

    if (startDate && endDate) {
      query += ` AND (
        (date_str >= $${pIdx} AND date_str <= $${pIdx + 1}) 
        OR (week_start_date <= $${pIdx + 1} AND week_end_date >= $${pIdx})
      )`;
      params.push(startDate, endDate);
      pIdx += 2;
    } else if (dateStr) {
      query += ` AND date_str = $${pIdx}`;
      params.push(dateStr);
      pIdx++;
    }

    if (weekStartDate && weekEndDate && !(startDate && endDate)) {
      query += ` AND (
        (week_start_date = $${pIdx} AND week_end_date = $${pIdx + 1}) 
        OR (date_str >= $${pIdx} AND date_str <= $${pIdx + 1})
      )`;
      params.push(weekStartDate, weekEndDate);
      pIdx += 2;
    }

    if (weekNumber && !(startDate && endDate)) {
      query += ` AND week_number = $${pIdx}`;
      params.push(parseInt(weekNumber as string, 10));
      pIdx++;
    }

    if (year && !(startDate && endDate)) {
      query += ` AND year = $${pIdx}`;
      params.push(parseInt(year as string, 10));
      pIdx++;
    }

    if (department && department !== 'ALL' && department !== 'Tất cả') {
      query += ` AND department = $${pIdx}`;
      params.push(department);
      pIdx++;
    }

    if (userId) {
      query += ` AND user_id = $${pIdx}`;
      params.push(userId);
      pIdx++;
    }

    if (userName) {
      query += ` AND LOWER(user_name) = LOWER($${pIdx})`;
      params.push(userName);
      pIdx++;
    }

    if (search) {
      query += ` AND (LOWER(user_name) LIKE $${pIdx} OR LOWER(user_id) LIKE $${pIdx} OR LOWER(duty_role) LIKE $${pIdx} OR LOWER(department) LIKE $${pIdx})`;
      params.push(`%${(search as string).toLowerCase()}%`);
      pIdx++;
    }

    query += ` ORDER BY date_str ASC, start_time ASC, user_name ASC`;

    let result = await client.query(query, params);

    // Auto-sync fallback: if duty_shifts table has no rows for this week, check hospital_duty_schedules
    if (result.rows.length === 0 && (weekNumber || startDate)) {
      let masterQuery = "SELECT * FROM hospital_duty_schedules WHERE 1=1";
      let mParams: any[] = [];
      if (weekNumber && year) {
        masterQuery += " AND week_number = $1 AND year = $2";
        mParams.push(parseInt(weekNumber as string, 10), parseInt(year as string, 10));
      } else if (startDate) {
        masterQuery += " AND (start_date = $1 OR ($1 >= start_date AND $1 <= end_date))";
        mParams.push(startDate);
      }

      const mRes = await client.query(masterQuery, mParams);
      if (mRes.rows.length > 0) {
        const mRow = mRes.rows[0];
        await syncMasterScheduleToDutyShifts(client, {
          weekNumber: mRow.week_number,
          year: mRow.year,
          startDate: mRow.start_date,
          endDate: mRow.end_date,
          scheduleData: mRow.schedule_data || [],
          holyData: mRow.holy_data || []
        });

        // Re-query after sync
        result = await client.query(query, params);
      }
    }

    res.json(result.rows);
  } catch (err: any) {
    console.error('Error fetching duty_shifts:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/duty_shifts/batch", async (req, res) => {
  let db;
  try {
    db = await client.connect();
    const { shifts, overwriteWeek, weekStartDate, weekEndDate, department } = req.body;
    if (!Array.isArray(shifts) || shifts.length === 0) {
      return res.status(400).json({ error: "No shift records provided" });
    }

    await db.query('BEGIN');

    if (overwriteWeek && weekStartDate && weekEndDate) {
      if (department && department !== 'ALL' && department !== 'Tất cả') {
        await db.query(
          "DELETE FROM duty_shifts WHERE (date_str BETWEEN $1 AND $2 OR week_start_date = $1) AND department = $3",
          [weekStartDate, weekEndDate, department]
        );
      } else {
        await db.query(
          "DELETE FROM duty_shifts WHERE date_str BETWEEN $1 AND $2 OR week_start_date = $1",
          [weekStartDate, weekEndDate]
        );
      }
    }

    let inserted = 0;
    for (const shift of shifts) {
      await db.query(`
        INSERT INTO duty_shifts (
          user_id, user_name, department, duty_role, shift_name, 
          date_str, day_of_week, week_number, year, week_start_date, week_end_date, 
          start_time, end_time, note
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        shift.userId || null,
        shift.userName || '',
        shift.department || '',
        shift.dutyRole || 'Trực chuyên môn',
        shift.shiftName || 'Trực 24/24',
        shift.dateStr,
        shift.dayOfWeek || '',
        shift.weekNumber || null,
        shift.year || null,
        shift.weekStartDate || weekStartDate || null,
        shift.weekEndDate || weekEndDate || null,
        shift.startTime || '07:30',
        shift.endTime || '07:30',
        shift.note || ''
      ]);
      inserted++;
    }

    await db.query('COMMIT');
    res.json({ success: true, count: inserted });
  } catch (err: any) {
    try { await db.query('ROLLBACK'); } catch (e) {}
    console.error('Error in /api/duty_shifts/batch:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (db) db.release();
  }
});

app.post("/api/duty_shifts", async (req, res) => {
  try {
    const shift = req.body;
    const result = await client.query(`
      INSERT INTO duty_shifts (
        user_id, user_name, department, duty_role, shift_name, 
        date_str, day_of_week, week_number, year, week_start_date, week_end_date, 
        start_time, end_time, note
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id
    `, [
      shift.userId || null,
      shift.userName || '',
      shift.department || '',
      shift.dutyRole || 'Trực chuyên môn',
      shift.shiftName || 'Trực 24/24',
      shift.dateStr,
      shift.dayOfWeek || '',
      shift.weekNumber || null,
      shift.year || null,
      shift.weekStartDate || null,
      shift.weekEndDate || null,
      shift.startTime || '07:30',
      shift.endTime || '07:30',
      shift.note || ''
    ]);
    res.json({ success: true, id: result.rows[0].id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/duty_shifts/:id", async (req, res) => {
  try {
    const shift = req.body;
    await client.query(`
      UPDATE duty_shifts SET 
        user_id = $1, user_name = $2, department = $3, duty_role = $4, shift_name = $5, 
        date_str = $6, day_of_week = $7, week_number = $8, year = $9, week_start_date = $10, week_end_date = $11, 
        start_time = $12, end_time = $13, note = $14
      WHERE id = $15
    `, [
      shift.userId || null,
      shift.userName || '',
      shift.department || '',
      shift.dutyRole || 'Trực chuyên môn',
      shift.shiftName || 'Trực 24/24',
      shift.dateStr,
      shift.dayOfWeek || '',
      shift.weekNumber || null,
      shift.year || null,
      shift.weekStartDate || null,
      shift.weekEndDate || null,
      shift.startTime || '07:30',
      shift.endTime || '07:30',
      shift.note || '',
      req.params.id
    ]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/duty_shifts/:id", async (req, res) => {
  try {
    await client.query("DELETE FROM duty_shifts WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/duty_shifts/week/clear", async (req, res) => {
  try {
    const { weekStartDate, weekEndDate, department } = req.query;
    if (!weekStartDate || !weekEndDate) {
      return res.status(400).json({ error: "weekStartDate and weekEndDate are required" });
    }
    if (department && department !== 'ALL' && department !== 'Tất cả') {
      await client.query(
        "DELETE FROM duty_shifts WHERE (date_str BETWEEN $1 AND $2 OR week_start_date = $1) AND department = $3",
        [weekStartDate, weekEndDate, department]
      );
    } else {
      await client.query(
        "DELETE FROM duty_shifts WHERE date_str BETWEEN $1 AND $2 OR week_start_date = $1",
        [weekStartDate, weekEndDate]
      );
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// Hospital Duty Schedule Master API (Mẫu Lịch Trực Bệnh Viện)
// ----------------------------------------------------
app.get("/api/hospital_duty_schedules", async (req, res) => {
  try {
    const { weekNumber, year, startDate } = req.query;
    let query = "SELECT * FROM hospital_duty_schedules WHERE 1=1";
    const params: any[] = [];
    let pIdx = 1;

    if (weekNumber && year) {
      query += ` AND week_number = $${pIdx} AND year = $${pIdx + 1}`;
      params.push(parseInt(weekNumber as string), parseInt(year as string));
      pIdx += 2;
    } else if (startDate) {
      query += ` AND start_date = $${pIdx}`;
      params.push(startDate);
      pIdx++;
    }

    query += " ORDER BY year DESC, week_number DESC";
    const result = await client.query(query, params);
    
    // Format camelCase
    const formatted = result.rows.map(r => ({
      id: r.id,
      weekNumber: r.week_number,
      year: r.year,
      startDate: r.start_date,
      endDate: r.end_date,
      title: r.title,
      leaderOnDuty: r.leader_on_duty,
      notes: r.notes || [],
      scheduleData: r.schedule_data || [],
      holyData: r.holy_data || [],
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));

    res.json(formatted);
  } catch (err: any) {
    console.error('Error fetching hospital_duty_schedules:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/hospital_duty_schedules", async (req, res) => {
  let db;
  try {
    db = await client.connect();
    const {
      weekNumber, year, startDate, endDate, title, leaderOnDuty, notes, scheduleData, holyData
    } = req.body;

    if (!weekNumber || !year || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing required fields (weekNumber, year, startDate, endDate)" });
    }

    await db.query('BEGIN');

    // Upsert into hospital_duty_schedules
    const upsertRes = await db.query(`
      INSERT INTO hospital_duty_schedules (
        week_number, year, start_date, end_date, title, leader_on_duty, notes, schedule_data, holy_data, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
      ON CONFLICT (week_number, year) DO UPDATE SET
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        title = EXCLUDED.title,
        leader_on_duty = EXCLUDED.leader_on_duty,
        notes = EXCLUDED.notes,
        schedule_data = EXCLUDED.schedule_data,
        holy_data = EXCLUDED.holy_data,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id
    `, [
      weekNumber, year, startDate, endDate, title || `LỊCH TRỰC TUẦN ${weekNumber}`,
      leaderOnDuty || '', JSON.stringify(notes || []), JSON.stringify(scheduleData || []), JSON.stringify(holyData || [])
    ]);

    // Also sync granular duty shifts for individual lookups on Check-in mobile screen
    await syncMasterScheduleToDutyShifts(db, {
      weekNumber,
      year,
      startDate,
      endDate,
      scheduleData,
      holyData
    });

    await db.query('COMMIT');
    res.json({ success: true, id: upsertRes.rows[0]?.id });
  } catch (err: any) {
    try { await db.query('ROLLBACK'); } catch (e) {}
    console.error('Error saving hospital_duty_schedules:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (db) db.release();
  }
});

app.delete("/api/hospital_duty_schedules/:id", async (req, res) => {
  try {
    const findRes = await client.query("SELECT week_number, year FROM hospital_duty_schedules WHERE id = $1", [req.params.id]);
    if (findRes.rows.length > 0) {
      const { week_number, year } = findRes.rows[0];
      await client.query("DELETE FROM duty_shifts WHERE week_number = $1 AND year = $2", [week_number, year]);
    }
    await client.query("DELETE FROM hospital_duty_schedules WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// Hospital Briefing Attendance API (Điểm danh Giao ban 17 Khoa/Phòng)
// ----------------------------------------------------
let cachedBriefingRoster: any[] | null = null;
let cachedExpectedBriefingQr: string = '';

async function ensureBriefingTablesAndSeed() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS briefing_roster (
      id SERIAL PRIMARY KEY,
      department VARCHAR(255) NOT NULL,
      department_order INT DEFAULT 99,
      staff_order INT DEFAULT 99,
      name VARCHAR(255) NOT NULL,
      specialty VARCHAR(150) DEFAULT '',
      position VARCHAR(150) DEFAULT '',
      created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    );

    CREATE TABLE IF NOT EXISTS briefing_attendance (
      id SERIAL PRIMARY KEY,
      roster_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      department VARCHAR(255) NOT NULL,
      specialty VARCHAR(150) DEFAULT '',
      position VARCHAR(150) DEFAULT '',
      date_str VARCHAR(20) NOT NULL,
      time_str VARCHAR(20) NOT NULL,
      timestamp BIGINT NOT NULL,
      method VARCHAR(50) DEFAULT 'qr',
      UNIQUE(roster_id, date_str)
    );

    CREATE TABLE IF NOT EXISTS briefing_device_locks (
      roster_id INT PRIMARY KEY,
      device_id VARCHAR(255) NOT NULL,
      staff_name VARCHAR(255) DEFAULT '',
      locked_at BIGINT NOT NULL,
      unlocked_at BIGINT DEFAULT 0,
      is_locked BOOLEAN DEFAULT true
    );

    CREATE INDEX IF NOT EXISTS idx_briefing_att_date ON briefing_attendance(date_str);
    CREATE INDEX IF NOT EXISTS idx_briefing_roster_order ON briefing_roster(department_order ASC, staff_order ASC, id ASC);
  `);

  const countRes = await client.query('SELECT COUNT(*) as cnt FROM briefing_roster');
  const existingCount = parseInt(countRes.rows[0]?.cnt || '0', 10);

  if (existingCount < DEFAULT_BRIEFING_ROSTER.length) {
    for (const item of DEFAULT_BRIEFING_ROSTER) {
      await client.query(
        `INSERT INTO briefing_roster (id, department, department_order, staff_order, name, specialty, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           department = EXCLUDED.department,
           department_order = EXCLUDED.department_order,
           staff_order = EXCLUDED.staff_order,
           name = EXCLUDED.name,
           specialty = EXCLUDED.specialty,
           position = EXCLUDED.position`,
        [
          item.id,
          item.department,
          item.departmentOrder,
          item.staffOrder,
          item.name,
          item.specialty,
          item.position,
        ]
      );
    }
    await client.query(
      `SELECT setval(pg_get_serial_sequence('briefing_roster', 'id'), GREATEST((SELECT MAX(id) FROM briefing_roster), 100))`
    );
    cachedBriefingRoster = null;
  }

  try {
    const qrSetting = await client.query("SELECT data FROM settings WHERE id = 'briefing_qr'");
    if (qrSetting.rows.length > 0 && qrSetting.rows[0].data?.expectedQrPayload) {
      cachedExpectedBriefingQr = qrSetting.rows[0].data.expectedQrPayload;
    }
  } catch (e) {}
}

async function getBriefingRosterList() {
  if (cachedBriefingRoster && cachedBriefingRoster.length > 0) {
    return cachedBriefingRoster;
  }
  try {
    const res = await client.query(
      'SELECT id, department, department_order as "departmentOrder", staff_order as "staffOrder", name, specialty, position FROM briefing_roster ORDER BY department_order ASC, staff_order ASC, id ASC'
    );
    if (res.rows.length > 0) {
      cachedBriefingRoster = res.rows.map(r => ({
        id: Number(r.id),
        department: r.department,
        departmentOrder: Number(r.departmentOrder || 99),
        staffOrder: Number(r.staffOrder || 99),
        name: formatCleanBriefingName(r.name),
        specialty: r.specialty || '',
        position: r.position || '',
      }));
      return cachedBriefingRoster;
    }
  } catch (e) {}
  return DEFAULT_BRIEFING_ROSTER;
}

async function getBriefingDeviceLocksMap() {
  const locksMap: Record<
    number,
    {
      rosterId: number;
      deviceId: string;
      staffName: string;
      lockedAt: number;
      unlockedAt: number;
      isLocked: boolean;
    }
  > = {};
  try {
    const res = await client.query(
      'SELECT roster_id as "rosterId", device_id as "deviceId", staff_name as "staffName", locked_at as "lockedAt", unlocked_at as "unlockedAt", is_locked as "isLocked" FROM briefing_device_locks'
    );
    for (const row of res.rows) {
      const rid = Number(row.rosterId);
      locksMap[rid] = {
        rosterId: rid,
        deviceId: row.deviceId || '',
        staffName: row.staffName || '',
        lockedAt: Number(row.lockedAt || 0),
        unlockedAt: Number(row.unlockedAt || 0),
        isLocked: Boolean(row.isLocked),
      };
    }
  } catch (e) {}
  return locksMap;
}

app.get('/api/briefing/data', async (req, res) => {
  try {
    const vnNow = getVnTimeObject(new Date());
    const dateStr =
      typeof req.query.date === 'string' && req.query.date.trim()
        ? req.query.date.trim()
        : getVnDateString(vnNow);

    const [roster, attRes, deviceLocks] = await Promise.all([
      getBriefingRosterList(),
      client.query(
        'SELECT id, roster_id as "rosterId", name, department, specialty, position, date_str as "dateStr", time_str as "timeStr", timestamp, method FROM briefing_attendance WHERE date_str = $1 ORDER BY timestamp ASC',
        [dateStr]
      ),
      getBriefingDeviceLocksMap(),
    ]);

    res.json({
      dateStr,
      roster,
      attendance: attRes.rows.map(r => ({
        ...r,
        rosterId: Number(r.rosterId),
        timestamp: Number(r.timestamp),
      })),
      deviceLocks,
      expectedQrPayload: cachedExpectedBriefingQr,
    });
  } catch (err: any) {
    console.error('Error in GET /api/briefing/data:', err);
    res.json({
      dateStr: format(new Date(), 'yyyy-MM-dd'),
      roster: DEFAULT_BRIEFING_ROSTER,
      attendance: [],
      deviceLocks: {},
      expectedQrPayload: cachedExpectedBriefingQr,
    });
  }
});

app.post('/api/briefing/lock-device', async (req, res) => {
  try {
    const { rosterId, deviceId, staffName, lockedAt } = req.body || {};
    const rid = Number(rosterId);
    if (!rid || isNaN(rid)) {
      return res.status(400).json({ error: 'rosterId không hợp lệ' });
    }
    const devId = typeof deviceId === 'string' && deviceId.trim() ? deviceId.trim() : `dev_${Date.now()}`;
    const lockTs = Number(lockedAt) || Date.now();

    // Check if admin unlocked this rosterId AFTER the client's lockTs
    const existingRes = await client.query(
      'SELECT unlocked_at as "unlockedAt", is_locked as "isLocked" FROM briefing_device_locks WHERE roster_id = $1',
      [rid]
    );
    if (existingRes.rows.length > 0) {
      const existingUnlockedAt = Number(existingRes.rows[0].unlockedAt || 0);
      if (existingUnlockedAt > lockTs) {
        return res.json({
          success: false,
          unlockedByAdmin: true,
          unlockedAt: existingUnlockedAt,
        });
      }
    }

    await client.query(
      `INSERT INTO briefing_device_locks (roster_id, device_id, staff_name, locked_at, unlocked_at, is_locked)
       VALUES ($1, $2, $3, $4, 0, true)
       ON CONFLICT (roster_id) DO UPDATE SET
         device_id = EXCLUDED.device_id,
         staff_name = EXCLUDED.staff_name,
         locked_at = EXCLUDED.locked_at,
         is_locked = true`,
      [rid, devId, staffName || '', lockTs]
    );

    res.json({
      success: true,
      lock: {
        rosterId: rid,
        deviceId: devId,
        staffName: staffName || '',
        lockedAt: lockTs,
        unlockedAt: 0,
        isLocked: true,
      },
    });
  } catch (err: any) {
    console.error('Error in POST /api/briefing/lock-device:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/briefing/unlock-device', async (req, res) => {
  try {
    const { rosterId, unlockAll, adminPassword, requirePassword } = req.body || {};

    // If called from mobile device with password verification
    if (requirePassword) {
      const pass = typeof adminPassword === 'string' ? adminPassword.trim() : '';
      if (!pass) {
        return res.status(401).json({ error: 'Vui lòng nhập mật khẩu Quản trị viên (Admin).' });
      }
      let isValidAdminPass = pass === '112021' || pass === 'admin123';
      if (!isValidAdminPass) {
        const adminUsers = await client.query(
          "SELECT password FROM users WHERE (role = 'admin' OR role = 'super_admin') AND password = $1 LIMIT 1",
          [pass]
        );
        if (adminUsers.rows.length > 0) {
          isValidAdminPass = true;
        }
      }
      if (!isValidAdminPass) {
        return res.status(401).json({ error: 'Mật khẩu Quản trị viên (Admin) không chính xác!' });
      }
    }

    const nowTs = Date.now();

    if (unlockAll) {
      const roster = await getBriefingRosterList();
      for (const item of roster) {
        await client.query(
          `INSERT INTO briefing_device_locks (roster_id, device_id, staff_name, locked_at, unlocked_at, is_locked)
           VALUES ($1, '', $2, 0, $3, false)
           ON CONFLICT (roster_id) DO UPDATE SET
             unlocked_at = $3,
             is_locked = false`,
          [item.id, item.name || '', nowTs]
        );
      }
      return res.json({ success: true, unlockedAll: true, unlockedAt: nowTs });
    }

    const rid = Number(rosterId);
    if (!rid || isNaN(rid)) {
      return res.status(400).json({ error: 'Vui lòng chọn cán bộ cần mở khóa thiết bị.' });
    }

    await client.query(
      `INSERT INTO briefing_device_locks (roster_id, device_id, staff_name, locked_at, unlocked_at, is_locked)
       VALUES ($1, '', '', 0, $2, false)
       ON CONFLICT (roster_id) DO UPDATE SET
         unlocked_at = $2,
         is_locked = false`,
      [rid, nowTs]
    );

    res.json({
      success: true,
      rosterId: rid,
      unlockedAt: nowTs,
    });
  } catch (err: any) {
    console.error('Error in POST /api/briefing/unlock-device:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/briefing/my-history', async (req, res) => {
  try {
    const rosterId = parseInt(String(req.query.rosterId || ''), 10);
    if (!rosterId || isNaN(rosterId)) {
      return res.json({ history: [] });
    }
    const histRes = await client.query(
      `SELECT id, roster_id as "rosterId", name, department, specialty, position, date_str as "dateStr", time_str as "timeStr", timestamp, method
       FROM briefing_attendance
       WHERE roster_id = $1
       ORDER BY date_str DESC, timestamp DESC
       LIMIT 365`,
      [rosterId]
    );
    res.json({
      history: histRes.rows.map(r => ({
        ...r,
        rosterId: Number(r.rosterId),
        timestamp: Number(r.timestamp),
      })),
    });
  } catch (err: any) {
    console.error('Error in GET /api/briefing/my-history:', err);
    res.json({ history: [] });
  }
});

app.post('/api/briefing/qr-config', async (req, res) => {
  try {
    const payload = typeof req.body?.expectedQrPayload === 'string' ? req.body.expectedQrPayload.trim() : '';
    if (!payload) {
      return res.status(400).json({ error: 'expectedQrPayload is required' });
    }
    cachedExpectedBriefingQr = payload;
    await client.query(
      `INSERT INTO settings (id, data) VALUES ('briefing_qr', $1)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [{ expectedQrPayload: payload, updatedAt: Date.now() }]
    );
    res.json({ success: true, expectedQrPayload: payload });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/briefing/checkin', async (req, res) => {
  try {
    const { rosterId, name, department, qrPayload, dateStr: reqDateStr } = req.body || {};
    const scanned = typeof qrPayload === 'string' ? qrPayload.trim() : '';

    if (!scanned) {
      return res.status(400).json({ error: 'Không nhận diện được nội dung mã QR. Vui lòng quét lại!' });
    }

    // Validate against official dedicated QR token/URL OR stored expected QR payload
    const isValidDedicatedOrPosterQr = isOfficialBriefingQrPayload(scanned, cachedExpectedBriefingQr);
    if (cachedExpectedBriefingQr && !isValidDedicatedOrPosterQr) {
      return res.status(400).json({
        error: 'Mã QR bạn vừa quét không phải là Mã QR Điểm danh Giao ban của bệnh viện!',
      });
    }

    // If not calibrated yet, auto-save the first valid scan as expectedQrPayload
    if (!cachedExpectedBriefingQr && scanned.length > 0) {
      cachedExpectedBriefingQr = scanned;
      client
        .query(
          `INSERT INTO settings (id, data) VALUES ('briefing_qr', $1)
           ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
          [{ expectedQrPayload: scanned, updatedAt: Date.now() }]
        )
        .catch(() => {});
    }

    const roster = await getBriefingRosterList();
    let staff = rosterId ? roster.find(r => Number(r.id) === Number(rosterId)) : undefined;
    if (!staff && name) {
      staff = findMatchingRosterStaff(roster, name, department);
    }

    if (!staff) {
      return res.status(400).json({
        error: `Nhân sự "${name || 'Chưa chọn'}" không nằm trong danh sách 99 cán bộ phải điểm danh Giao ban.`,
      });
    }

    const now = new Date();
    const vnTime = getVnTimeObject(now);
    const finalDateStr = reqDateStr || getVnDateString(vnTime);
    const timeStr = format(now, 'HH:mm:ss');
    const ts = now.getTime();

    const upsertRes = await client.query(
      `INSERT INTO briefing_attendance (roster_id, name, department, specialty, position, date_str, time_str, timestamp, method)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'qr')
       ON CONFLICT (roster_id, date_str) DO UPDATE SET
         name = EXCLUDED.name,
         department = EXCLUDED.department,
         specialty = EXCLUDED.specialty,
         position = EXCLUDED.position
       RETURNING id, roster_id as "rosterId", name, department, specialty, position, date_str as "dateStr", time_str as "timeStr", timestamp, method`,
      [staff.id, staff.name, staff.department, staff.specialty || '', staff.position || '', finalDateStr, timeStr, ts]
    );

    try {
      await client.query(
        `INSERT INTO briefing_device_locks (roster_id, device_id, staff_name, locked_at, unlocked_at, is_locked)
         VALUES ($1, 'qr_device', $2, $3, 0, true)
         ON CONFLICT (roster_id) DO UPDATE SET
           staff_name = EXCLUDED.staff_name,
           locked_at = EXCLUDED.locked_at,
           is_locked = true`,
        [staff.id, staff.name, ts]
      );
    } catch (e) {}

    const record = upsertRes.rows[0];
    res.json({
      success: true,
      record: {
        ...record,
        rosterId: Number(record.rosterId),
        timestamp: Number(record.timestamp),
      },
    });
  } catch (err: any) {
    console.error('Error in POST /api/briefing/checkin:', err);
    res.status(500).json({ error: err.message || 'Lỗi máy chủ khi ghi nhận điểm danh Giao ban.' });
  }
});

app.post('/api/briefing/toggle', async (req, res) => {
  try {
    const { rosterId, dateStr, present } = req.body || {};
    const roster = await getBriefingRosterList();
    const staff = roster.find(r => Number(r.id) === Number(rosterId));
    if (!staff) {
      return res.status(404).json({ error: 'Không tìm thấy cán bộ trong danh sách Giao ban.' });
    }

    const now = new Date();
    const vnTime = getVnTimeObject(now);
    const finalDateStr = dateStr || getVnDateString(vnTime);

    if (present) {
      const timeStr = format(now, 'HH:mm:ss');
      const ts = now.getTime();
      const upsertRes = await client.query(
        `INSERT INTO briefing_attendance (roster_id, name, department, specialty, position, date_str, time_str, timestamp, method)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'admin')
         ON CONFLICT (roster_id, date_str) DO UPDATE SET
           time_str = EXCLUDED.time_str,
           timestamp = EXCLUDED.timestamp,
           method = 'admin'
         RETURNING id, roster_id as "rosterId", name, department, specialty, position, date_str as "dateStr", time_str as "timeStr", timestamp, method`,
        [staff.id, staff.name, staff.department, staff.specialty || '', staff.position || '', finalDateStr, timeStr, ts]
      );
      const record = upsertRes.rows[0];
      return res.json({
        success: true,
        record: {
          ...record,
          rosterId: Number(record.rosterId),
          timestamp: Number(record.timestamp),
        },
      });
    } else {
      await client.query('DELETE FROM briefing_attendance WHERE roster_id = $1 AND date_str = $2', [
        staff.id,
        finalDateStr,
      ]);
      return res.json({ success: true });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/briefing/roster', async (req, res) => {
  try {
    const { name, department, specialty, position } = req.body || {};
    if (!name || !department) {
      return res.status(400).json({ error: 'Vui lòng nhập Họ tên và Khoa/Phòng.' });
    }
    const deptIdx = BRIEFING_DEPARTMENTS_ORDER.indexOf(department);
    const departmentOrder = deptIdx >= 0 ? deptIdx + 1 : 99;

    const insertRes = await client.query(
      `INSERT INTO briefing_roster (department, department_order, staff_order, name, specialty, position)
       VALUES ($1, $2, 99, $3, $4, $5)
       RETURNING id, department, department_order as "departmentOrder", staff_order as "staffOrder", name, specialty, position`,
      [department, departmentOrder, name, specialty || '', position || '']
    );
    cachedBriefingRoster = null;
    const row = insertRes.rows[0];
    res.json({
      success: true,
      staff: {
        id: Number(row.id),
        department: row.department,
        departmentOrder: Number(row.departmentOrder),
        staffOrder: Number(row.staffOrder),
        name: row.name,
        specialty: row.specialty || '',
        position: row.position || '',
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/briefing/roster/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await client.query('DELETE FROM briefing_roster WHERE id = $1', [id]);
    await client.query('DELETE FROM briefing_attendance WHERE roster_id = $1', [id]);
    cachedBriefingRoster = null;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === "production" || (fs.existsSync(path.join(process.cwd(), 'dist', 'index.html')) && !process.argv.includes('tsx'));
  
  // 404 handler for missing API routes (Catches GET, POST, PUT, DELETE, etc.)
  app.all('/api', (req, res) => {
    res.status(404).json({ error: 'API route not found' });
  });
  app.all('/api/*all', (req, res) => {
    res.status(404).json({ error: 'API route not found' });
  });

  // Global API Error Handler for any uncaught errors in API routes
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith('/api')) {
      console.error('API Error:', err);
      return res.status(500).json({ error: err.message || 'Lỗi xử lý yêu cầu trên máy chủ' });
    }
    next(err);
  });

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Bind to port 3000 immediately to satisfy Cloud Run container startup probes
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  // Initialize DB tables, schema checks, and retention tasks asynchronously in background
  (async () => {
    try {
      await ensureBriefingTablesAndSeed();
      console.log("Briefing (Giao ban) roster & attendance tables verified and seeded.");
    } catch (e) {
      console.warn("Could not initialize briefing tables:", e);
    }
    try {
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS lock_reason TEXT DEFAULT '';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_at BIGINT;
      `);
      console.log("Users table schema verified successfully.");
    } catch (e) {
      console.warn("Could not alter users table:", e);
    }
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_devices (
          user_id VARCHAR(255) PRIMARY KEY,
          user_name VARCHAR(255) NOT NULL,
          department VARCHAR(255),
          device_fingerprint VARCHAR(255) NOT NULL,
          device_info JSONB,
          created_at BIGINT,
          updated_at BIGINT
        );
        CREATE INDEX IF NOT EXISTS idx_user_devices_fp ON user_devices(device_fingerprint);
        CREATE INDEX IF NOT EXISTS idx_user_devices_uid ON user_devices(user_id);
      `);
      console.log("User devices table schema verified successfully.");
    } catch (e) {
      console.warn("Could not verify user_devices table schema:", e);
    }

    // Performance Indexes for high concurrency & fast morning check-in
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_attendance_user_shift ON attendance(user_id, shift_id, date_str, type);
        CREATE INDEX IF NOT EXISTS idx_attendance_user_id_ts ON attendance(user_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_attendance_username_lower_ts ON attendance(LOWER(TRIM(user_name)), timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_attendance_timestamp ON attendance(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_attendance_date_str ON attendance(date_str);
        CREATE INDEX IF NOT EXISTS idx_attendance_failed_ts ON attendance_failed(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_attendance_failed_date ON attendance_failed(date_str);
        CREATE INDEX IF NOT EXISTS idx_users_uid ON users(uid);
        CREATE INDEX IF NOT EXISTS idx_users_name ON users(LOWER(TRIM(name)));
        CREATE INDEX IF NOT EXISTS idx_user_devices_username_lower ON user_devices(LOWER(TRIM(user_name)));
      `);
      console.log("Database indexes for high concurrency verified successfully.");
    } catch (e) {
      console.warn("Could not create database indexes:", e);
    }

    // Pre-warm RAM caches on startup so first requests are instantaneous
    try {
      await Promise.allSettled([
        getCachedConfig(client),
        getCachedDepartments(client),
        getCachedUsers(client),
        getCachedSpecialEmployees(client),
        getCachedActiveNotifications(client)
      ]);
      console.log("RAM caches pre-warmed successfully.");
    } catch (e) {}

    // Run 4-month retention cleanup on startup and schedule daily
    try {
      cleanOldAttendanceData();
      setInterval(cleanOldAttendanceData, 24 * 60 * 60 * 1000); // Daily retention cleanup
    } catch (e) {
      console.warn("Could not schedule 4-month retention cleanup:", e);
    }
  })();
}


startServer();
