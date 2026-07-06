require('dotenv').config();

module.exports = (_req, res) => {
  res.status(200).json({
    ok: true,
    timestamp: new Date().toISOString(),
    vercel: Boolean(process.env.VERCEL),
  });
};
