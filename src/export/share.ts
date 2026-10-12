import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { StoredTrip } from '@/store/trips';

import { buildSummaryHtml } from './summary';

/** Makes a PDF of the trip on the phone and opens the share sheet for it. Throws if sharing is not possible. */
export async function shareTripSummary(trip: StoredTrip): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  const { base64 } = await Print.printToFileAsync({ html: buildSummaryHtml(trip), base64: true });
  if (!base64) {
    throw new Error('The PDF came back empty.');
  }

  // The printer's own file sits where the share sheet is not allowed to read, so save a copy in the app's cache.
  const name = trip.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trip';
  const file = new File(Paths.cache, `${name}-summary.pdf`);
  file.write(base64, { encoding: 'base64' });

  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    dialogTitle: `${trip.name} summary`,
    UTI: 'com.adobe.pdf',
  });
}
