// GET /api/stats - tiny counters for a live demo
const db = require('../lib/db');
const { send } = require('../lib/common');

module.exports = async (req, res) => {
  send(res, 200, { leads: (await db.get('stat:leads')) || 0, batches: (await db.get('stat:batches')) || 0, certificates: (await db.get('stat:certs')) || 0, persistent: db.persistent });
};
