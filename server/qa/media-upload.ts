import "server-only";

// A video uploaded for the narration check is kept on local disk until a
// later step checks it. A Vercel deployment has no lasting disk and refuses
// request bodies over 4.5 MB, so there the upload is turned off. Kyron
// renders are not affected: they are checked through their captions.
export const MEDIA_UPLOAD_UNAVAILABLE = "Video upload for the narration check isn't available on the deployed site yet.";

// Settings pulled from Vercel for local work also set VERCEL=1, with
// VERCEL_ENV=development; only a deployment (production or preview) counts.
export function mediaUploadAvailable(): boolean {
  return !(process.env.VERCEL === "1" && process.env.VERCEL_ENV !== "development");
}
