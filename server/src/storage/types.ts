export type StoredObject = {
  /** Absolute path of a file on local disk (multer's temp file). */
  filePath: string;
  contentType: string;
  sizeBytes: number;
};

/** Where media bytes live. The database only ever stores keys (and derived URLs). */
export interface StorageAdapter {
  put(key: string, source: StoredObject): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** URL a browser can load. Relative (`/media/...`) for local storage unless PUBLIC_BASE_URL is set. */
  publicUrl(key: string): string;
}
