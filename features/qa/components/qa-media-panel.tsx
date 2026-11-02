"use client";

import { LoaderCircle, Upload } from "lucide-react";
import { useState, type ChangeEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineNotice } from "@/components/ui/inline-notice";
import { JsonBlock } from "@/components/ui/json-block";
import { uploadQaMedia } from "@/features/qa/api";
import { messageFromError } from "@/features/qa/labels";
import type { QaRunDetailResponse } from "@/types/api";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function QaMediaPanel({
  detail,
  onChanged,
}: {
  detail: QaRunDetailResponse;
  onChanged: (detail: QaRunDetailResponse) => void;
}) {
  const media = detail.run.media;
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setError("The file is larger than the 25 MB transcription limit. Upload the audio track or a shorter clip.");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      onChanged(await uploadQaMedia(detail.run.id, file));
    } catch (uploadError) {
      setError(messageFromError(uploadError, "The file could not be uploaded."));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Video narration</CardTitle>
        <CardDescription>
          The video&apos;s speech is transcribed and compared with the approved narration.
          {detail.contentWritable ? " Kyron videos are checked automatically." : " Upload the rendered video or its audio (25 MB at most)."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {media ? (
          <p className="flex flex-wrap items-center gap-2">
            <Badge variant={media.status === "checked" ? "success" : media.status === "failed" ? "destructive" : "info"}>
              {media.status === "checked" ? "Checked" : media.status === "failed" ? "Failed" : "Pending"}
            </Badge>
            <span className="break-all">{media.fileName}</span>
            <span className="text-muted-foreground">{(media.byteSize / 1024 / 1024).toFixed(1)} MB</span>
          </p>
        ) : (
          <p className="text-muted-foreground">No video checked yet.</p>
        )}
        {media?.message ? <InlineNotice tone="error">{media.message}</InlineNotice> : null}
        {media?.transcript ? (
          <details>
            <summary className="cursor-pointer text-muted-foreground">Transcript</summary>
            <JsonBlock className="mt-2" label="Video transcript" value={media.transcript} />
          </details>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Visual frame checks need ffmpeg, which is not installed, so visuals are covered by the
          human check.
        </p>
        <label className="inline-flex h-9 w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[0.8rem] font-medium shadow-xs hover:bg-muted/70 has-disabled:cursor-not-allowed has-disabled:opacity-50">
          {uploading ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <Upload aria-hidden="true" className="size-3.5" />}
          {media ? "Check another file" : "Upload video or audio"}
          <input
            accept="video/*,audio/*,.mp4,.m4a,.mp3,.wav,.webm,.ogg,.flac"
            className="sr-only"
            disabled={uploading || !detail.run.snapshotId}
            onChange={(event) => void handleFile(event)}
            type="file"
          />
        </label>
        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      </CardContent>
    </Card>
  );
}
