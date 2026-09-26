const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function cleanupFunction() {
  const modulePath = path.join(__dirname, '..', 'supabase', 'functions', 'cleanup-noise-photos', 'cleanup.mjs');
  return (await import(pathToFileURL(modulePath).href)).cleanupExpiredPhotos;
}

test('photo cleanup removes objects before deleting their expired reports', async () => {
  const cleanupExpiredPhotos = await cleanupFunction();
  const operations = [];
  const client = {
    rpc: async () => ({ data: [
      { path: 'one/one.jpg', report_id: 'report-one' },
      { path: 'orphan/orphan.png', report_id: null },
      { path: null, report_id: 'report-missing-photo' }
    ], error: null }),
    storage: { from: () => ({ remove: async (paths) => { operations.push(['remove', paths]); return { error: null }; } }) },
    from: () => ({ delete: () => ({ in: async (column, ids) => { operations.push(['delete', column, ids]); return { error: null }; } }) })
  };
  const result = await cleanupExpiredPhotos(client);
  assert.deepEqual(operations, [
    ['remove', ['one/one.jpg', 'orphan/orphan.png']],
    ['delete', 'id', ['report-one', 'report-missing-photo']]
  ]);
  assert.deepEqual(result, { removedObjects: 2, deletedReports: 2 });
});

test('photo cleanup retains report rows when Storage rejects deletion', async () => {
  const cleanupExpiredPhotos = await cleanupFunction();
  let deleted = false;
  const client = {
    rpc: async () => ({ data: [{ path: 'one/one.jpg', report_id: 'report-one' }], error: null }),
    storage: { from: () => ({ remove: async () => ({ error: new Error('Storage unavailable') }) }) },
    from: () => ({ delete: () => ({ in: async () => { deleted = true; return { error: null }; } }) })
  };
  await assert.rejects(cleanupExpiredPhotos(client), /Storage unavailable/);
  assert.equal(deleted, false);
});

test('photo cleanup does nothing when the candidate query fails or returns no rows', async () => {
  const cleanupExpiredPhotos = await cleanupFunction();
  // No Storage/delete methods: any destructive call would fail this test.
  await assert.rejects(cleanupExpiredPhotos({
    rpc: async () => ({ data: null, error: new Error('Database unavailable') })
  }), /Database unavailable/);
  assert.deepEqual(await cleanupExpiredPhotos({
    rpc: async () => ({ data: [], error: null })
  }), { removedObjects: 0, deletedReports: 0 });
});

test('photo cleanup surfaces a database deletion failure after removing the object', async () => {
  const cleanupExpiredPhotos = await cleanupFunction();
  const operations = [];
  const client = {
    rpc: async () => ({ data: [{ path: 'one/one.jpg', report_id: 'report-one' }], error: null }),
    storage: { from: () => ({ remove: async () => { operations.push('storage'); return { error: null }; } }) },
    from: () => ({ delete: () => ({ in: async () => {
      operations.push('database');
      return { error: new Error('Database deletion failed') };
    } }) })
  };
  await assert.rejects(cleanupExpiredPhotos(client), /Database deletion failed/);
  assert.deepEqual(operations, ['storage', 'database']);
});
