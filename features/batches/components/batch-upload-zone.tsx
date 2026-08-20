"use client";

import { FileUp, RotateCcw, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BatchUploadZoneProps = {
  onFilesAdded: (files: File[]) => void;
  onLoadSample: () => void;
};

export function BatchUploadZone({
  onFilesAdded,
  onLoadSample,
}: BatchUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <section
      className={cn(
        "rounded-xl border-2 border-dashed bg-card px-5 py-7 text-center transition-colors",
        dragging ? "border-primary bg-[#FFF7F8]" : "border-border",
      )}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setDragging(false);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        onFilesAdded(Array.from(event.dataTransfer.files));
      }}
    >
      <input
        ref={inputRef}
        accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        className="sr-only"
        multiple
        onChange={(event) => {
          onFilesAdded(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
        type="file"
      />

      <span className="mx-auto grid size-11 place-items-center rounded-xl bg-[#FFF0F2] text-primary">
        <FileUp aria-hidden="true" className="size-5" />
      </span>
      <h2 className="mt-3 text-base font-bold">Add source files</h2>
      <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
        Drop PDF or PPTX files here. This concept treats each file as one draft
        and reads file names only.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button onClick={() => inputRef.current?.click()} size="lg" type="button">
          <Upload aria-hidden="true" />
          Choose files
        </Button>
        <Button onClick={onLoadSample} size="lg" type="button" variant="outline">
          <RotateCcw aria-hidden="true" />
          Reset sample batch
        </Button>
      </div>
    </section>
  );
}
