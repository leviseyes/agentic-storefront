export const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
export function emptySession() {
  return {
    version: 2,
    messages: [],
    cart: null,
    selectedProductId: null,
    selectedVariantId: null,
    pendingCart: null,
    lastCartVariantId: null,
    presentation: { view: "collection" },
    photo: null,
    previews: [],
    completedTurns: [],
  };
}
export function createSessionStore(db, bucket, now = Date.now) {
  async function find(id) {
    if (!/^[a-f0-9-]{36}$/.test(id || "")) return null;
    const row = await db
      .prepare("SELECT state, expires_at FROM wall_sessions WHERE id = ?")
      .bind(id)
      .first();
    if (!row) return null;
    if (row.expires_at <= now()) {
      await remove(id, JSON.parse(row.state));
      return null;
    }
    return { id, state: JSON.parse(row.state) };
  }
  async function create() {
    const id = crypto.randomUUID(),
      state = emptySession();
    await db
      .prepare(
        "INSERT INTO wall_sessions (id,state,expires_at,locked_until) VALUES (?,?,?,0)",
      )
      .bind(id, JSON.stringify(state), now() + SESSION_TTL)
      .run();
    return { id, state };
  }
  async function save(id, state) {
    await db
      .prepare("UPDATE wall_sessions SET state=? WHERE id=?")
      .bind(JSON.stringify(state), id)
      .run();
  }
  async function lock(id) {
    return Boolean(
      await db
        .prepare(
          "UPDATE wall_sessions SET locked_until=? WHERE id=? AND locked_until<? RETURNING id",
        )
        .bind(now() + 240000, id, now())
        .first(),
    );
  }
  async function unlock(id) {
    await db
      .prepare("UPDATE wall_sessions SET locked_until=0 WHERE id=?")
      .bind(id)
      .run();
  }
  async function consume(id, limit, ttl = 24 * 60 * 60 * 1000) {
    const key = `${id}:${Math.floor(now() / ttl)}`;
    const result = await db
      .prepare(
        "INSERT INTO wall_usage (id,count,expires_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 WHERE count<? RETURNING count",
      )
      .bind(key, now() + ttl, limit)
      .first();
    return Boolean(result);
  }
  const objectKey = (id, asset) => `walls/${id}/${asset}`;
  async function put(id, bytes, type) {
    const asset = crypto.randomUUID();
    await bucket.put(objectKey(id, asset), bytes, {
      httpMetadata: { contentType: type },
      customMetadata: { expiresAt: String(now() + SESSION_TTL) },
    });
    return asset;
  }
  async function deleteImages(id, assets) {
    const keys = assets
      .filter((asset) => /^[a-f0-9-]{36}$/.test(asset))
      .map((asset) => objectKey(id, asset));
    if (keys.length) await bucket.delete(keys);
  }
  async function image(id, asset) {
    if (!/^[a-f0-9-]{36}$/.test(asset)) return null;
    return bucket.get(objectKey(id, asset));
  }
  async function remove(id, state) {
    const objects = [state.photo?.id, ...state.previews.map((p) => p.id)]
      .filter(Boolean)
      .map((asset) => objectKey(id, asset));
    if (objects.length) await bucket.delete(objects);
    await db.prepare("DELETE FROM wall_sessions WHERE id=?").bind(id).run();
  }
  // Small bounded sweep; requests never enumerate or expose other visitors' data.
  async function cleanup() {
    const { results } = await db
      .prepare("SELECT id,state FROM wall_sessions WHERE expires_at<? LIMIT 5")
      .bind(now())
      .all();
    for (const row of results) await remove(row.id, JSON.parse(row.state));
    await db
      .prepare(
        "DELETE FROM wall_usage WHERE id IN (SELECT id FROM wall_usage WHERE expires_at<? LIMIT 100)",
      )
      .bind(now())
      .run();
  }
  return {
    find,
    create,
    save,
    lock,
    unlock,
    consume,
    put,
    image,
    deleteImages,
    remove,
    cleanup,
  };
}
