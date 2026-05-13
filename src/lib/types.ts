export interface NoteRequest {
  noteId: string;
  content: string;
}

export interface NoteResponse {
  success: boolean;
  noteId?: string;
  error?: string;
}
