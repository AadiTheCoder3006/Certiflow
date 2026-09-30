// GET /api/session?token=... - is my saved token still valid?
const { leadFromToken, send, MAX_BATCH } = require('../lib/common');

module.exports = async (req, res) => {
  const lead = await leadFromToken(req.query.token);
  send(res, 200, lead ? { valid: true, name: lead.name, limit: MAX_BATCH } : { valid: false });
};
