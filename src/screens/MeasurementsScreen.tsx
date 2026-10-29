// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { addMeasurement, deleteMeasurement, deletePhoto, listMeasurements, listPhotos, type MeasurementRow } from '@/db/repos';
import { db, newId, type PhotoRow } from '@/db/schema';
import { useSettings } from '@/db/settings';
import { formatWeight, parseWeightInput } from '@/engine/math/units';
import { useData } from '@/features/data';
import { IconButton, MarginNote, Pad, RuledRow, Screen, Section, Segmented } from '@/components/ui';

const KINDS = [
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'waist', label: 'Waist' },
  { value: 'chest', label: 'Chest' },
  { value: 'arm', label: 'Arm' },
  { value: 'thigh', label: 'Thigh' },
];

/** Downscale a picked photo to at most 1600 px on its long side, as a JPEG. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read that photo.'))), 'image/jpeg', 0.8));
}

/** Store a photo on this device: the image in photoFiles, the row pointing at it. */
async function addPhotoFile(file: File) {
  const id = newId();
  const blob = await shrink(file);
  await db.transaction('rw', db.photos, db.photoFiles, async () => {
    await db.photoFiles.put({ id, blob });
    await db.photos.add({ id, uri: `photo:${id}`, date: Date.now(), note: null });
  });
}

function Photo({ row }: { row: PhotoRow }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    void db.photoFiles.get(row.uri.replace(/^photo:/, '')).then((f) => {
      if (f) setUrl((made = URL.createObjectURL(f.blob)));
    });
    return () => {
      if (made) URL.revokeObjectURL(made);
    };
  }, [row.uri]);
  return (
    <div className="relative flex w-[31%] flex-col gap-0.5">
      {url ? <img src={url} alt={`Progress photo from ${new Date(row.date).toDateString()}`} className="aspect-[3/4] w-full rounded-[8px] object-cover" /> : <div className="aspect-[3/4] w-full rounded-[8px] bg-sunk" />}
      <span className="flex items-center justify-between">
        <span className="t-meta text-pencil">{new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}</span>
        <IconButton
          label="Delete photo"
          className="h-8 w-8"
          onClick={async () => {
            await db.photoFiles.delete(row.uri.replace(/^photo:/, ''));
            await deletePhoto(db, row.id);
          }}
        >
          <X size={14} />
        </IconButton>
      </span>
    </div>
  );
}

/** Bodyweight in grams; tape measurements in mm. Photos stay in the app on this device and are never uploaded. */
export function MeasurementsScreen() {
  const unit = useSettings().unit;
  const [kind, setKind] = useState('bodyweight');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rows = useData((d) => listMeasurements(d, kind), [kind], [] as MeasurementRow[]);
  const photos = useData((d) => listPhotos(d), [], [] as PhotoRow[]);
  const file = useRef<HTMLInputElement>(null);
  const isWeight = kind === 'bodyweight';
  const show = (v: number) => (isWeight ? `${formatWeight(v, unit)} ${unit}` : `${(v / (unit === 'kg' ? 10 : 25.4)).toFixed(1)} ${unit === 'kg' ? 'cm' : 'in'}`);
  const parse = (t: string) => {
    const n = Number(t.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return null;
    return isWeight ? parseWeightInput(t, unit) : Math.round(n * (unit === 'kg' ? 10 : 25.4));
  };
  const add = async () => {
    const v = parse(value);
    if (v == null) return;
    await addMeasurement(db, kind, v);
    setValue('');
  };

  return (
    <Screen title="Body" backButton meta="STORED ON THIS DEVICE ONLY">
      <Pad className="flex flex-col gap-2">
        <Segmented label="Measurement" value={kind} onChange={setKind} options={KINDS} />
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <label className="flex flex-1 flex-col gap-1">
            <span className="t-label text-ink2">{isWeight ? unit : unit === 'kg' ? 'cm' : 'in'}</span>
            <input className="field" value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" />
          </label>
          <button type="submit" className="btn-primary">
            Add
          </button>
        </form>
      </Pad>
      <Section title="LOG">
        {rows
          .slice()
          .reverse()
          .slice(0, 30)
          .map((r) => (
            <RuledRow key={r.id}>
              <span className="t-num-m flex-1">{show(r.value)}</span>
              <span className="t-num-m text-pencil">{new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</span>
              <IconButton label="Delete entry" onClick={() => void deleteMeasurement(db, r.id)}>
                <X size={16} />
              </IconButton>
            </RuledRow>
          ))}
      </Section>
      <Section title="PROGRESS PHOTOS">
        <Pad className="flex flex-col gap-2">
          <MarginNote>Photos stay inside Analog on this device. They aren’t in backups.</MarginNote>
          {/* On Android the WebView offers the camera and the gallery from this one file picker. */}
          <input
            ref={file}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) addPhotoFile(f).then(() => setError(null), (err: Error) => setError(err.message));
            }}
          />
          <button type="button" className="btn-secondary" onClick={() => file.current?.click()}>
            Add a photo
          </button>
          {error ? <p className="text-red-text">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            {photos.map((ph) => (
              <Photo key={ph.id} row={ph} />
            ))}
          </div>
        </Pad>
      </Section>
    </Screen>
  );
}
