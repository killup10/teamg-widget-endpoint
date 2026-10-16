// Capa de datos del sistema OTT (cuentas + dispositivos + playlists).
// Usa MongoDB si hay MONGODB_URI, si no memoria (solo para pruebas locales;
// en Render la memoria se pierde al dormir: configura MONGODB_URI).
const crypto = require('crypto');

const uid = () => crypto.randomBytes(8).toString('hex');
const nowIso = () => new Date().toISOString();

function memCol() {
  const rows = [];
  return {
    async find(q, proj) {
      let res = rows.filter((r) => Object.keys(q || {}).every((k) => r[k] === q[k]));
      if (proj && typeof proj === 'object') {
        res = res.map((r) => {
          const included = Object.keys(proj).filter((k) => proj[k] === 1);
          if (included.length) {
            const selected = {};
            included.forEach((k) => { if (k in r) selected[k] = r[k]; });
            if (proj._id !== 0 && '_id' in r) selected._id = r._id;
            return selected;
          }
          const out = { ...r };
          for (const k of Object.keys(proj)) {
            if (proj[k] === 0) delete out[k];
          }
          return out;
        });
      }
      return res;
    },
    async findOne(q, proj) { const a = await this.find(q, proj); return a[0] || null; },
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
      find: (q, proj) => c.find(q || {}, proj ? { projection: proj } : {}).toArray(),
      findOne: (q, proj) => c.findOne(q, proj ? { projection: proj } : {}),
      insertOne: (d) => c.insertOne(d),
      updateOne: (f, u) => c.updateOne(f, u),
      deleteOne: (f) => c.deleteOne(f),
    });
    cols = {
      mode: 'mongo',
      users: wrap(db.collection('ott_users')),
      devices: wrap(db.collection('ott_devices')),
      playlists: wrap(db.collection('ott_playlists')),
      icons: wrap(db.collection('ott_icons')),
      codes: wrap(db.collection('ott_codes')),
    };
    console.log('[OTT] store: mongo');
  } else {
    cols = { mode: 'memory', users: memCol(), devices: memCol(), playlists: memCol(), icons: memCol(), codes: memCol() };
    console.log('[OTT] store: memory (pon MONGODB_URI en Render para producción)');
  }
  return cols;
}

function hashPass(pass, salt) {
  return crypto.scryptSync(String(pass), salt, 32).toString('hex');
}

module.exports = { init, uid, nowIso, hashPass };
