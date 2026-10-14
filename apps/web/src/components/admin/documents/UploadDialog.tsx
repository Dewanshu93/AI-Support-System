'use client';

// Upload a policy (W4-04): a Markdown or PDF file with its metadata. Size and type
// are checked here for quick feedback; the API is the authority and its
// validation messages are shown per field.
import {
  ACCESS_LEVELS,
  type AdminDocument,
  COUNTRIES,
  DOCUMENT_UPLOAD,
  DOMAINS,
  EMPLOYMENT_TYPES,
} from '@sd/shared';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { api, ApiError, type DocumentUploadMetadataInput } from '@/lib/api';
import { EMPLOYMENT_LABEL } from '@/lib/roles';

const input =
  'h-9 w-full rounded-lg border border-slate-300 bg-surface px-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/10';
const today = () => new Date().toISOString().slice(0, 10);

function issuesOf(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || err.code !== 'VALIDATION_ERROR') return {};
  const details = err.details as { issues?: { path: string; message: string }[] } | undefined;
  const out: Record<string, string> = {};
  for (const i of details?.issues ?? []) out[i.path.split('.')[0] || 'form'] ??= i.message;
  return out;
}

export function UploadDialog({
  onClose,
  onUploaded,
  supersede,
}: {
  onClose: () => void;
  onUploaded: (doc: AdminDocument) => void;
  /** Prefill for a new version of an existing document. */
  supersede?: AdminDocument;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<DocumentUploadMetadataInput>(() => ({
    slug: supersede?.slug ?? '',
    title: supersede?.title ?? '',
    domain: supersede?.domain ?? 'HR',
    owner: supersede?.owner ?? '',
    version: '',
    effectiveDate: today(),
    countries: supersede?.countries ?? ['US'],
    employmentTypes: supersede?.employmentTypes ?? ['full_time'],
    accessLevel: supersede?.accessLevel ?? 'standard',
    supersedes: supersede?.version ?? null,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const set = <K extends keyof DocumentUploadMetadataInput>(
    key: K,
    value: DocumentUploadMetadataInput[K],
  ) => setMeta((m) => ({ ...m, [key]: value }));
  const toggle = <T extends string>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!file) local.file = 'Choose a .md or .pdf file';
    else if (!DOCUMENT_UPLOAD.extensions.some((x) => file.name.toLowerCase().endsWith(x)))
      local.file = 'Only Markdown (.md) or PDF (.pdf) files';
    else if (file.size > DOCUMENT_UPLOAD.maxBytes) local.file = 'The file is larger than 5 MB';
    if (meta.countries.length === 0) local.countries = 'Choose at least one country';
    if (meta.employmentTypes.length === 0) local.employmentTypes = 'Choose at least one';
    setErrors(local);
    if (Object.keys(local).length > 0) return;
    setBusy(true);
    try {
      onUploaded(await api.uploadDocument(file!, meta));
    } catch (err) {
      const fields = issuesOf(err);
      setErrors(
        Object.keys(fields).length > 0
          ? fields
          : { form: err instanceof ApiError ? err.message : 'The upload failed.' },
      );
    } finally {
      setBusy(false);
    }
  };

  const err = (key: string) =>
    errors[key] ? (
      <span role="alert" className="text-xs text-rose-700">
        {errors[key]}
      </span>
    ) : null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-title"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 animate-fade bg-slate-900/30 backdrop-blur-sm"
        onClick={() => !busy && onClose()}
      />
      <form
        onSubmit={(e) => void submit(e)}
        className="relative max-h-[90vh] w-full max-w-2xl animate-rise space-y-4 overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl"
        data-testid="upload-dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="upload-title" className="text-lg font-semibold text-slate-900">
              {supersede ? `New version of ${supersede.title}` : 'Upload a policy'}
            </h2>
            <p className="text-sm text-slate-500">
              Markdown or PDF, up to 5 MB. Only employees in the chosen audience can retrieve it.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={busy}
            className="text-slate-400 hover:text-slate-700"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>

        <label className="block space-y-1 text-sm font-medium text-slate-700">
          File
          <input
            ref={first}
            type="file"
            accept=".md,.pdf,text/markdown,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
          />
          {err('file')}
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Title
            <input
              className={input}
              value={meta.title}
              onChange={(e) => set('title', e.target.value)}
              required
            />
            {err('title')}
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Slug
            <input
              className={`${input} font-mono`}
              value={meta.slug}
              onChange={(e) => set('slug', e.target.value)}
              placeholder="hr-parental-leave-uk"
              readOnly={Boolean(supersede)}
              required
            />
            {err('slug')}
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Version
            <input
              className={input}
              value={meta.version}
              onChange={(e) => set('version', e.target.value)}
              placeholder="1.0"
              required
            />
            {err('version')}
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Effective date
            <input
              type="date"
              className={input}
              value={meta.effectiveDate}
              onChange={(e) => set('effectiveDate', e.target.value)}
              required
            />
            {err('effectiveDate')}
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Domain
            <select
              className={input}
              value={meta.domain}
              onChange={(e) => set('domain', e.target.value as typeof meta.domain)}
            >
              {DOMAINS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Owner
            <input
              className={input}
              value={meta.owner}
              onChange={(e) => set('owner', e.target.value)}
              placeholder="HR Policy Team"
              required
            />
            {err('owner')}
          </label>
        </div>

        <fieldset className="space-y-2 rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-sm font-medium text-slate-700">Audience</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-700">
            <span className="flex items-center gap-3">
              <span className="text-xs text-slate-500">Countries</span>
              {COUNTRIES.map((c) => (
                <label key={c} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={meta.countries.includes(c)}
                    onChange={() => set('countries', toggle(meta.countries, c))}
                  />
                  {c}
                </label>
              ))}
            </span>
            <span className="flex items-center gap-3">
              <span className="text-xs text-slate-500">Employment</span>
              {EMPLOYMENT_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={meta.employmentTypes.includes(t)}
                    onChange={() => set('employmentTypes', toggle(meta.employmentTypes, t))}
                  />
                  {EMPLOYMENT_LABEL[t]}
                </label>
              ))}
            </span>
            <label className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Access</span>
              <select
                className="h-8 rounded-lg border border-slate-300 bg-surface px-2 text-sm"
                value={meta.accessLevel}
                onChange={(e) => set('accessLevel', e.target.value as typeof meta.accessLevel)}
              >
                {ACCESS_LEVELS.map((a) => (
                  <option key={a} value={a}>
                    {a === 'manager' ? 'Managers only' : 'Everyone in the audience'}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {err('countries')}
          {err('employmentTypes')}
        </fieldset>

        <label className="block space-y-1 text-sm font-medium text-slate-700">
          Replaces version{' '}
          <span className="font-normal text-slate-400">
            (optional; the old version stops being used)
          </span>
          <input
            className={input}
            value={meta.supersedes ?? ''}
            onChange={(e) => set('supersedes', e.target.value.trim() || null)}
            placeholder="e.g. 1.0"
          />
          {err('supersedes')}
        </label>

        {err('form')}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Uploading and indexing…' : 'Upload'}
          </Button>
        </div>
      </form>
    </div>
  );
}
