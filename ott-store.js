// Capa de datos del sistema OTT (cuentas + dispositivos + playlists).
// Usa MongoDB si hay MONGODB_URI, si no memoria (solo para pruebas locales;
// en Render la memoria se pierde al dormir: configura MONGODB_URI).
const crypto = require('crypto');

const uid = () => crypto.randomBytes(8).toString('hex');
const nowIso = () => new Date().toISOString();

function memCol() {
  const rows = [];
  return {
    async find(q) {
      return rows.filter((r) => Object.keys(q || {}).every((k) => r[k] === q[k]));
    },
    async findOne(q) { const a = await this.find(q); return a[0] || null; },
    async insertOne(d) { rows.push(d); return { insertedId: d._id }; },
    async updateOne(f, u) {
      const r = await this.findOne(f); if (!r) return { matchedCount: 0 };
      Object.assign(r, u.$set || {}); return { matchedCount: 1 };
    },
    async deleteOne(f) {
      const i = rows.findIndex((r) => Object.keys(f).every((k) => r[k] === f[k]));
      if (i > -1) rows.splice(i, 1); return { deletedCount: i > -1 ? 1 : 0 };
    },
  };
}

let cols = null;
async function init() {
  if (cols) return cols;
  const uri = process.env.MONGODB_URI;
  if (uri) {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(process.env.OTT_DB || 'ottv');
    const wrap = (c) => ({
      find: (q) => c.find(q || {}).toArray(),
      findOne: (q) => c.findOne(q),
      insertOne: (d) => c.insertOne(d),
      updateOne: (f, u) => c.updateOne(f, u),
      deleteOne: (f) => c.deleteOne(f),
    });
    cols = {
      mode: 'mongo',
      users: wrap(db.collection('ott_users')),
      devices: wrap(db.collection('ott_devices')),
      playlists: wrap(db.collection('ott_playlists')),
    };
    console.log('[OTT] store: mongo');
  } else {
    cols = { mode: 'memory', users: memCol(), devices: memCol(), playlists: memCol() };
    console.log('[OTT] store: memory (pon MONGODB_URI en Render para producción)');
  }
  return cols;
}

function hashPass(pass, salt) {
  return crypto.scryptSync(String(pass), salt, 32).toString('hex');
}

module.exports = { init, uid, nowIso, hashPass };
