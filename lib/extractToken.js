// lib/extractToken.js
function extractTokenFromHeader(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim();
}

module.exports = extractTokenFromHeader;
