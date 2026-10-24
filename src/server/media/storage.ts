import path from "node:path";
import { paths } from "../config";

// Managed media storage. Every file METAL reads or serves lives under
// `paths.media`; the database stores paths relative to it, never paths
// chosen by a client.

export const MEDIA_TYPES = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
} as const;
export type MediaExt = keyof typeof MEDIA_TYPES;

export const isMediaExt = (ext: string): ext is MediaExt => Object.hasOwn(MEDIA_TYPES, ext);

const ID_RE = /^rec_[a-f0-9]{16}$/;
export const isRecordingId = (id: string) => ID_RE.test(id);

export const mediaRel = {
  original: (id: string, ext: MediaExt) => `${id}/original.${ext}`,
  poster: (id: string) => `${id}/poster.jpg`,
  proxy: (id: string) => `${id}/proxy.mp4`,
};

/** Absolute path for a stored relative path; throws if it would escape managed storage. */
export function managedPath(rel: string): string {
  const root = path.resolve(paths.media);
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root + path.sep)) throw new Error("Path outside managed storage");
  return abs;
}

export const incomingDir = () => path.join(paths.media, ".incoming");
