'use strict';

/**
 * v2.1 portable media contract.
 * Pure functions only: no network, DOM, OAuth, disk writes or private data.
 * The bundled browser app includes this code via scripts/build-media-contract.cjs.
 */
/* media-contract:portable:start */
const MEDIA_RECORD_SCHEMA_VERSION = 1;
const MEDIA_EVIDENCE_LEVELS = Object.freeze([
  'unverified', 'still-image', 'poster-only', 'sampled-frames', 'full-video'
]);

function mediaContractText(value) {
  return typeof value === 'string' ? value : '';
}

function mediaContractEvidence(record) {
  const status = mediaContractText(record.review).toLowerCase();
  const method = mediaContractText(record.analysisMethod).toLowerCase();
  const mime = mediaContractText(record.mime).toLowerCase();
  const explicitlyUnverified = record.newInDrive ||
    /(?:needs review|not reviewed|unreviewed|awaiting review|pending review|^review blocked|not visually inspected|sensitive non-meme pdf)/.test(status) ||
    /not visually (?:verified|reviewed|inspected)/.test(status);
  const visualStatus = /(?:visually verified|visually reviewed|visually inspected|visual review:|video preview (?:frame inspected|reviewed)|renamed.*verified|reviewed by|review complete|verified by|approved|^verified\b|^reviewed\b|direct original drive still(?:[- ]image)? (?:verification|visual verification|inspected|verified)|animated gif checked against original)/.test(status);
  const visualMethod = /(?:actual pixels inspected|actual pixels;|original image .*visually inspected|original image pixels inspected|original image inspected|direct inspection of original pixels|original drive video sampled|preview frames decoded|original drive mp4 previewed|chatgpt visual inspection|sampled animation frames)/.test(method);
  let level = 'unverified';
  if (!explicitlyUnverified && mediaContractText(record.description).trim()) {
    if (mime.startsWith('video/')) {
      if (/\b(full[ -]motion|entire video|full video) (?:visually )?(?:reviewed|verified|inspected)\b/.test(status))
        level = 'full-video';
      else if (/(?:video preview|sampled frames|preview frames)/.test(status + ' ' + method))
        level = /(?:poster[- ]only|single.{0,45}(?:poster|thumbnail)|poster thumbnail)/.test(status + ' ' + method)
          ? 'poster-only' : 'sampled-frames';
    } else if (mime.startsWith('image/') && (visualStatus || visualMethod)) {
      level = 'still-image';
    }
  }
  return {level, source:record.newInDrive?'drive':'manifest',
    detail:mediaContractText(record.review),
    analysisMethod:mediaContractText(record.analysisMethod)};
}

function mediaContractDateEvidence(record) {
  // Search Index!H is mapped to Manifest!P (original EXIF capture value).
  // Manifest!J is separately filename-derived; never relabel it as EXIF.
  const captureDate = mediaContractText(record.captureDate).trim();
  const filenameDate = mediaContractText(record.filenameDate).trim();
  const filenameBasis = mediaContractText(record.filenameDateEvidence);
  if (captureDate) return {value:captureDate,source:'exif',basis:'Manifest!P'};
  if (filenameDate) return {value:filenameDate,source:'filename',basis:filenameBasis||'Manifest!J'};
  return {value:'',source:'unknown',basis:''};
}

function normalizeMediaRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record))
    throw new TypeError('Media record must be an object');
  const safeSize = Number(record.size);
  const normalized = {
    ...record,
    schemaVersion:MEDIA_RECORD_SCHEMA_VERSION,
    id:mediaContractText(record.id),
    folder:mediaContractText(record.folder),
    name:mediaContractText(record.name),
    collection:mediaContractText(record.collection),
    description:mediaContractText(record.description),
    tags:mediaContractText(record.tags),
    review:mediaContractText(record.review),
    analysisMethod:mediaContractText(record.analysisMethod),
    captureDate:mediaContractText(record.captureDate),
    filenameDate:mediaContractText(record.filenameDate),
    filenameDateEvidence:mediaContractText(record.filenameDateEvidence),
    mime:mediaContractText(record.mime),
    size:Number.isFinite(safeSize)&&safeSize>=0?safeSize:0
  };
  // Descriptive evidence is not authorization to edit Drive or Sheet data.
  normalized.provenance = {
    visual: mediaContractEvidence(normalized),
    date: mediaContractDateEvidence(normalized)
  };
  return normalized;
}
/* media-contract:portable:end */

module.exports = {MEDIA_RECORD_SCHEMA_VERSION,MEDIA_EVIDENCE_LEVELS,
  mediaContractEvidence,mediaContractDateEvidence,normalizeMediaRecord};
