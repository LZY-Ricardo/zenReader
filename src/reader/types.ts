export type ReaderMode = "paged" | "scroll";

export interface ReaderSettings {
  mode: ReaderMode;
  fontSize: number;
}

export interface BookMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  format: "txt";
}

export interface Chapter {
  id: string;
  title: string;
  order: number;
  start: number;
  end: number;
}

export type ProgressAnchor =
  | { type: "paged"; pageIndex: number }
  | { type: "scroll"; ratio: number };

export interface ReadingProgress {
  bookId: string;
  mode: ReaderMode;
  chapterId: string;
  anchor: ProgressAnchor;
  updatedAt: number;
}

export interface Bookmark {
  id: string;
  bookId: string;
  chapterId: string;
  anchor: ProgressAnchor;
  label?: string;
  createdAt: number;
}

export interface LibraryFile {
  version: 1;
  settings: ReaderSettings;
  books: BookMeta[];
}

export interface SessionFile {
  version: 1;
  lastBookId?: string;
  progressByBook: Record<string, ReadingProgress>;
}

