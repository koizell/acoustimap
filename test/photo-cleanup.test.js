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
