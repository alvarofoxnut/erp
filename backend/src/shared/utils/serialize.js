/**
 * Maps Prisma documents (id) to API shape expected by the frontend (_id).
 */
export function serializeDoc(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(serializeDoc);
  if (typeof value !== 'object') return value;

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (key === 'id') {
      out._id = val;
      out.id = val;
    } else {
      out[key] = serializeDoc(val);
    }
  }
  return out;
}
