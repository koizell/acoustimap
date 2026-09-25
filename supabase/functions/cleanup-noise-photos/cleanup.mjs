export async function cleanupExpiredPhotos(client) {
  const { data: candidates, error: queryError } = await client.rpc('expired_noise_photo_candidates');
  if (queryError) throw queryError;

  const paths = [...new Set((candidates || []).map((candidate) => candidate.path).filter(Boolean))];
  const reportIds = [...new Set((candidates || []).map((candidate) => candidate.report_id).filter(Boolean))];

  if (paths.length) {
    const { error: storageError } = await client.storage.from('noise-report-photos').remove(paths);
    if (storageError) throw storageError;
  }
  if (reportIds.length) {
    const { error: deleteError } = await client.from('noise_reports').delete().in('id', reportIds);
    if (deleteError) throw deleteError;
  }
  return { removedObjects: paths.length, deletedReports: reportIds.length };
}
