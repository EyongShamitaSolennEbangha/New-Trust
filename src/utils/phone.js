function normalizePhone(phone) {
  let cleaned = String(phone).replace(/\s/g, '');
  if (!cleaned.startsWith('+')) cleaned = '+' + cleaned;
  return cleaned;
}
module.exports = { normalizePhone };