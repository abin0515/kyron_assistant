"use client";

import { Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  BatchCourseSetup,
  BatchDraftItem,
} from "@/features/batches/types";

type BatchReviewDrawerProps = {
  item: BatchDraftItem;
  onClose: () => void;
  onSave: (setup: BatchCourseSetup) => void;
};

export function BatchReviewDrawer({
  item,
  onClose,
  onSave,
}: BatchReviewDrawerProps) {
  const [setup, setSetup] = useState<BatchCourseSetup>(item.setup);
  const complete = hasRequiredFields(setup);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="presentation">
      <button
        aria-label="Close course setup review"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        type="button"
      />
      <section
        aria-labelledby="batch-review-title"
        aria-modal="true"
        className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-hidden bg-card shadow-2xl"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">
              Review AI suggestion
            </p>
            <h2 className="mt-1 text-lg font-bold" id="batch-review-title">
              Course setup
            </h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {item.fileName}
            </p>
          </div>
          <Button aria-label="Close" onClick={onClose} size="icon" type="button" variant="ghost">
            <X aria-hidden="true" />
          </Button>
        </header>

        <div className="grid flex-1 gap-5 overflow-y-auto px-5 py-5 sm:px-6">
          <Field label="Title">
            <Input
              onChange={(event) => updateSetup("title", event.target.value)}
              value={setup.title}
            />
          </Field>
          <Field label="Description">
            <Textarea
              onChange={(event) => updateSetup("description", event.target.value)}
              value={setup.description}
            />
          </Field>
          <Field label="Learning objective">
            <Textarea
              onChange={(event) =>
                updateSetup("learningObjective", event.target.value)
              }
              value={setup.learningObjective}
            />
          </Field>
          <Field label="Audience">
            <Input
              onChange={(event) => updateSetup("audience", event.target.value)}
              placeholder="Who is this course for?"
              value={setup.audience}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Asset type">
              <select
                className="h-11 w-full rounded-xl border border-input bg-background px-3.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
                onChange={(event) =>
                  updateSetup(
                    "assetType",
                    event.target.value as BatchCourseSetup["assetType"],
                  )
                }
                value={setup.assetType}
              >
                <option value="lesson">Lesson</option>
                <option value="practice">Practice</option>
                <option value="scenario">Scenario</option>
              </select>
            </Field>
            <Field label="Duration">
              <select
                className="h-11 w-full rounded-xl border border-input bg-background px-3.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
                onChange={(event) =>
                  updateSetup(
                    "duration",
                    Number(event.target.value) as BatchCourseSetup["duration"],
                  )
                }
                value={setup.duration}
              >
                <option value={480}>8 minutes</option>
                <option value={900}>15 minutes</option>
                <option value={1800}>30 minutes</option>
                <option value={3600}>60 minutes</option>
              </select>
            </Field>
          </div>
        </div>

        <footer className="border-t border-border bg-card px-5 py-4 sm:px-6">
          {!complete ? (
            <p className="mb-3 text-xs text-destructive" role="alert">
              Complete all four course fields before marking this draft ready.
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={!complete}
              onClick={() => onSave(setup)}
              type="button"
            >
              <Save aria-hidden="true" />
              Save and mark ready
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );

  function updateSetup<Key extends keyof BatchCourseSetup>(
    key: Key,
    value: BatchCourseSetup[Key],
  ) {
    setSetup((current) => ({ ...current, [key]: value }));
  }
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      {label}
      {children}
    </label>
  );
}

function hasRequiredFields(setup: BatchCourseSetup): boolean {
  return Boolean(
    setup.title.trim() &&
      setup.description.trim() &&
      setup.learningObjective.trim() &&
      setup.audience.trim(),
  );
}
